# Security note

The iframe is not the trust boundary. A person can confirm a write in the view. A modified view, or a model that never sees the view, must still fail closed on the server.

## Source checks

These are implemented as pure functions and the headless bridge. They have not been executed in this session. See `tests/securityPolicy.test.ts`, `tests/bridge.test.ts`, and `tests/serverContract.test.ts`.

- Reference outer sandbox attribute: `allow-scripts`. The checker rejects `allow-same-origin`, `allow-top-navigation`, popups, and downloads.
- Sandbox origin and host origin must be different `http` or `https` origins.
- Resource CSP sets `default-src 'none'` and `connect-src 'none'` and contains no URL and no wildcard. `style-src` and `script-src` allow `'unsafe-inline'` because the view is one document.
- The bridge ignores a message whose source is not the sandbox origin.
- The bridge does not deliver a host notification before `ui/notifications/initialized`. The initialize response itself is allowed, because the view asked for it.
- `list_approvals` and `get_approval` are visible to the model. `request_decision` and `commit_decision` are app-only. A model call returns `app_tool_forbidden` and does not change the row.
- Tool text always has a non-empty text block. The request text does not include the confirmation token. Hosts must not copy app-only `structuredContent` into the model transcript.
- The shipped HTML leaves `mcp-host-origin` empty and does not post until a proxy rewrites it. `withHostOrigin` accepts only a bare http(s) origin.
- Every tool that opens the UI uses `_meta.ui.resourceUri`. The flat `_meta["ui/resourceUri"]` key is not set.
- The in-memory commit checks actor, approval, action, exact statement, expiry, single use, ownership, and pending status.
- Bolt Database: authenticated users can select their rows and insert a pending approval. They cannot update approvals or write challenges or decisions. `request_approval_decision` and `commit_approval_decision` are `security definer`, revoked from `public`, `anon`, and `authenticated`, and granted to `service_role`.
- `approval-decision` keeps `verify_jwt` on and still calls `auth.getUser`. An anon key is not treated as a user. Missing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` returns `missing_config` and writes nothing.

The edge response includes the token for the signed-in caller. That caller is the view, not the model. The MCP text fallback is a separate path and omits the token.

## Not evidence

- No browser has loaded the double iframe, so `contentDocument` isolation is not observed.
- No database has applied the migration. RLS and the security-definer functions are unread by Postgres.
- The edge function has not been invoked. CORS, JWT, and missing-secret behavior are source only.
- No Claude, ChatGPT, or other host has rendered `ui://confirm-queue/approval`.
- `CONFIRM_ACTOR_ID` on the local stdio process is an injected owner for the in-memory seed. It is not authentication, and that process stays on the model audience so it cannot commit.

## Later checks

1. Apply the migration on a fresh database and confirm client `update` on `approvals` is denied.
2. As user A, request and commit one row. As user B, `select` and both RPCs must fail for that row.
3. Call the function with no bearer, with the anon key as bearer, and with a real user JWT.
4. Remove `SUPABASE_SERVICE_ROLE_KEY` and confirm `missing_config` with no row change.
5. In a browser or Playwright: outer sandbox is `allow-scripts` only, the host cannot read the sandbox document, a wrong source is ignored, and nothing arrives before `initialized`.
