-- Confirm Queue. Fresh Bolt Database. Do not replay this file against a database that already applied it.

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  requester text not null check (char_length(requester) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 2000),
  proposed_change text not null check (char_length(proposed_change) between 1 and 2000),
  risk text not null check (risk in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now()
);

create table public.decision_challenges (
  token text primary key check (char_length(token) between 16 and 200),
  approval_id uuid not null references public.approvals (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('approve', 'deny')),
  statement text not null check (char_length(statement) between 1 and 4500),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.approvals (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('approve', 'deny')),
  statement text not null,
  note text not null default '' check (char_length(note) <= 500),
  decided_at timestamptz not null default now()
);

create index approvals_owner_status_idx on public.approvals (owner_id, status);
create index decision_challenges_approval_idx on public.decision_challenges (approval_id);

alter table public.approvals enable row level security;
alter table public.decision_challenges enable row level security;
alter table public.decisions enable row level security;

revoke all on public.approvals from anon, authenticated;
revoke all on public.decision_challenges from anon, authenticated;
revoke all on public.decisions from anon, authenticated;

grant select, insert on public.approvals to authenticated;
grant select on public.decisions to authenticated;

create policy approvals_select_own
  on public.approvals
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy approvals_insert_own
  on public.approvals
  for insert
  to authenticated
  with check (owner_id = auth.uid() and status = 'pending');

create policy decisions_select_own
  on public.decisions
  for select
  to authenticated
  using (owner_id = auth.uid());

-- Challenges have no client policies. The decision functions below are the only writers.

create or replace function public.request_approval_decision(
  p_actor uuid,
  p_approval_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_change text;
  v_status text;
  v_owner uuid;
  v_statement text;
  v_token text;
  v_expires timestamptz;
begin
  if p_action not in ('approve', 'deny') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input', 'message', 'Action must be approve or deny.');
  end if;

  select title, proposed_change, status, owner_id
    into v_title, v_change, v_status, v_owner
  from public.approvals
  where id = p_approval_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_approval', 'message', 'No approval with that id exists.');
  end if;
  if v_owner is distinct from p_actor then
    return jsonb_build_object('ok', false, 'error', 'not_owner', 'message', 'This approval belongs to another person.');
  end if;
  if v_status is distinct from 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'message', 'This approval is no longer pending.');
  end if;

  v_statement := case p_action
    when 'approve' then 'Approve "' || v_title || '": ' || v_change
    when 'deny' then 'Deny "' || v_title || '": ' || v_change
  end;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + interval '10 minutes';

  insert into public.decision_challenges (token, approval_id, owner_id, action, statement, expires_at)
  values (v_token, p_approval_id, p_actor, p_action, v_statement, v_expires);

  return jsonb_build_object(
    'ok', true,
    'text', 'Confirmation required before any write.' || E'\n' || v_statement || E'\n' || 'The confirmation token stays in the view.',
    'statement', v_statement,
    'token', v_token,
    'expiresAt', v_expires
  );
end;
$$;

create or replace function public.commit_approval_decision(
  p_actor uuid,
  p_approval_id uuid,
  p_action text,
  p_token text,
  p_statement text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.decision_challenges%rowtype;
  v_owner uuid;
  v_status text;
  v_note text := coalesce(p_note, '');
begin
  if p_action not in ('approve', 'deny') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input', 'message', 'Action must be approve or deny.');
  end if;
  if char_length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input', 'message', 'Note must be 500 characters or fewer.');
  end if;

  select * into v_challenge
  from public.decision_challenges
  where token = p_token
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'challenge_mismatch', 'message', 'The confirmation token does not match this approval.');
  end if;
  if v_challenge.owner_id is distinct from p_actor then
    return jsonb_build_object('ok', false, 'error', 'actor_mismatch', 'message', 'The confirmation token was issued to a different actor.');
  end if;
  if v_challenge.approval_id is distinct from p_approval_id or v_challenge.action is distinct from p_action then
    return jsonb_build_object('ok', false, 'error', 'challenge_mismatch', 'message', 'The confirmation token does not match this approval.');
  end if;
  if v_challenge.statement is distinct from p_statement then
    return jsonb_build_object('ok', false, 'error', 'statement_mismatch', 'message', 'The confirmed statement does not match the proposed change.');
  end if;
  if v_challenge.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'challenge_used', 'message', 'The confirmation token was already used.');
  end if;
  if v_challenge.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'challenge_expired', 'message', 'The confirmation token has expired. Request a new decision.');
  end if;

  select owner_id, status into v_owner, v_status
  from public.approvals
  where id = p_approval_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_approval', 'message', 'No approval with that id exists.');
  end if;
  if v_owner is distinct from p_actor then
    return jsonb_build_object('ok', false, 'error', 'not_owner', 'message', 'This approval belongs to another person.');
  end if;
  if v_status is distinct from 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'message', 'This approval is no longer pending.');
  end if;

  update public.approvals
  set status = case when p_action = 'approve' then 'approved' else 'denied' end
  where id = p_approval_id;

  insert into public.decisions (approval_id, owner_id, action, statement, note)
  values (p_approval_id, p_actor, p_action, p_statement, v_note);

  update public.decision_challenges
  set used_at = now()
  where token = p_token;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_action = 'approve' then 'approved' else 'denied' end,
    'text', case when p_action = 'approve' then 'Approved ' else 'Denied ' end || p_approval_id::text || '. ' || p_statement
      || case when v_note = '' then '' else ' Note: ' || v_note end
  );
end;
$$;

revoke all on function public.request_approval_decision(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.commit_approval_decision(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_approval_decision(uuid, uuid, text) to service_role;
grant execute on function public.commit_approval_decision(uuid, uuid, text, text, text, text) to service_role;
