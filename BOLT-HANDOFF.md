# Bolt infrastructure handoff: Confirm Queue

Dirty Mode construction - runtime unverified. This inventory describes source that has not been installed, started, migrated, or deployed.

## Target and readiness

- Repository / branch / prepared revision: local git only, no remote. Branch `main` after the local commits. Do not treat a commit hash in this file as a deployment pin.
- App root: this directory (`mcp-app-ui`), the inner repo.
- Database: Bolt Database.
- Target: fresh empty database. Do not attach or replace an existing project.
- Existing baseline / applied migrations: Unknown. The SQL file is not proof it was applied.
- Hosting: prepare only. Do not publish.
- Publication: prepare only.
- Bolt action: inspect and prepare only.
- Status: implementation present in source; infrastructure pending; runtime unverified.
- Owner prerequisites: GitHub access if this repo is later imported; a fresh Bolt Database; email/password auth settings; server secrets entered by the owner.

The MCP stdio process (`server/main.ts`) is a local host adapter. Do not deploy it as a Bolt function. Bolt does not need to run it for the web desk.

## Build and connection

| Item | Exact command or configuration name |
|---|---|
| Runtime / package manager | Node 22 or newer for the test script. npm. No lockfile yet |
| Frozen install / dev | After `npm install` produces a lockfile: `npm ci`, then `npm run dev` (Vite, port 5173) |
| Build / output | `npm run build`. Vite writes `dist/`. Not run |
| Type/lint/tests | `npm run typecheck`, `npm test`. Not run. Deno function is outside `tsconfig.json` |
| Client file / public env names | `src/lib/supabase.ts`. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Missing config behavior | Setup banner. Local preview does not commit. Decision calls return an error |

## Database

| Order | Exact migration file | Resources / dependencies | Applied status |
|---|---|---|---|
| 1 | `supabase/migrations/20261023180000_confirm_queue.sql` | `approvals`, `decision_challenges`, `decisions`, RLS, `request_approval_decision`, `commit_approval_decision`. Requires `auth.users` and `gen_random_uuid()` | Pending |

- Access model: private per authenticated user. No anonymous access. Challenges have no client grants. Decisions are select-only for the owner. Approvals are select and insert-only, and insert must stay `pending`.
- Ownership checks: `owner_id = auth.uid()` on client policies. The security-definer functions compare `p_actor` to `owner_id` and are granted only to `service_role`.
- Extensions/RPC permissions/Realtime: no extra extension is declared. Realtime is not required. Do not grant the two functions to `authenticated`.
- Seeds: none. The page's three sample rows are in-memory only.
- Retry rule: inspect migration tracking, apply only this pending file, preserve any rows created after a partial apply, and report drift instead of dropping tables.

## Functions

| Name / source | Caller + auth | Input / output | Resources + secret names | Deploy config |
|---|---|---|---|---|
| `approval-decision`; `supabase/functions/approval-decision/index.ts` | Signed-in user JWT. Gateway `verify_jwt` is true, and the handler calls `auth.getUser`. Anon key is not a user | POST `{ step: "request", approvalId, action }` or `{ step: "commit", approvalId, action, token, statement, note }`. JSON `{ ok, text, ... }` or `{ ok: false, error, message }` | Tables above via service role. Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Optional `CORS_ALLOW_ORIGINS` | `supabase/config.toml` sets `verify_jwt = true` |

- CORS/preflight: `POST` and `OPTIONS`. Allowed headers: `authorization`, `apikey`, `content-type`. Allowed origins: `http://localhost:5173`, `http://127.0.0.1:5173`, plus comma-separated `CORS_ALLOW_ORIGINS`. Other browser origins get 403. CORS is not authentication.
- Identity/ownership and abuse controls: handler rejects a missing or non-user JWT before using the service role. SQL locks the approval and the challenge and refuses a second use of a token. No paid API and no rate-limit table.
- Paid API limits: Not required.
- Webhooks: Not required.
- Platform credentials: Bolt may inject database credentials. Still set the three named secrets if the function runtime does not provide them. Never copy another project's values.

## Server secrets to enter through settings

| Name | Consumer | Required / optional | Owner source |
|---|---|---|---|
| `SUPABASE_URL` | `approval-decision` | Required for a live call | Bolt Database project URL |
| `SUPABASE_ANON_KEY` | `approval-decision` user lookup | Required for a live call | Project API key |
| `SUPABASE_SERVICE_ROLE_KEY` | `approval-decision` after the JWT check | Required for a live call | Service role secret |
| `CORS_ALLOW_ORIGINS` | `approval-decision` | Optional until a hosted origin exists | Comma-separated origins, no paths |

Missing-secret behavior: HTTP 500 `{ "ok": false, "error": "missing_config", "message": "Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in server secrets." }`. No write.

Public configuration is only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Backend secrets never use a `VITE_` prefix.

`CONFIRM_ACTOR_ID` is not a Bolt secret. It is an optional local stdio owner id and is not authentication.

## Auth, storage, and external steps

- Auth providers/confirmation: email and password. Confirmation behavior is an owner setting. The page tells the person to confirm email when sign-up returns no session.
- Site URL and callback/recovery routes: Site URL is the hosted origin, once chosen. The app has no separate recovery route; Supabase's built-in recovery needs that Site URL and the redirect allowlist, including `http://localhost:5173` for local dev.
- Buckets: Not required.
- Realtime: Not required.
- Scheduled/long jobs: Not required.
- Outside services: a future MCP host that can iframe the resource. Not required to inspect this repo.
- Real integrations: Bolt Database auth and `approval-decision`. Explicit demos/stubs: in-memory seed, harness replay, and stub actor `owner-demo`.

## Acceptance checks and receipts

Use synthetic data. Unexecuted checks stay pending.

| Check | Expected result | Outcome / receipt |
|---|---|---|
| Import/install/build | Branch loads; frozen install and build pass | Pending. Not run |
| Schema | The one migration is the only pending change and its tables, policies, and two functions exist | Pending. Not applied |
| Function round trip | Signed-in request returns a statement and token; commit changes status once | Pending. Not deployed |
| Auth/isolation | No bearer and anon-key bearer fail. User B cannot read or commit user A's row. Client update of `approvals` fails | Pending |
| Missing secret | `missing_config`, no row change, secret values absent from the body | Pending |
| Uploads, if needed | Not required | Not required |
| Webhooks, if needed | Not required | Not required |
| Jobs, if needed | Not required | Not required |
| Publish, if requested | Not requested | Not requested |

## One prompt after GitHub import

### Inspect and prepare only

> Read BOLT-HANDOFF.md and inspect the imported source at the intended branch/revision. Compare proposed resources with implemented files, reconcile unknown migration baselines through read-only history/schema inspection when access is available, and report concrete deployment gaps and owner/external blockers. Preserve the app design and existing database/data. Prepare a reviewable setup plan with actual file/resource names and pending checks. Do not create or change cloud resources, apply migrations, deploy functions, enter secrets, enable schedules, or publish. Do not describe proposed resources or unexecuted checks as complete.
