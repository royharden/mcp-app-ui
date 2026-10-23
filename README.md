# Confirm Queue

An MCP App for one job: a person reviews a proposed write and confirms the exact change before anything is committed. The model can list and read approvals. `request_decision` and `commit_decision` belong to the view.

**Dirty Mode construction. Runtime unverified.** This session wrote the source and did not install dependencies, start the app, apply SQL, deploy the function, or run the tests.

## What is built

- Pure approval rules, text fallback, sandbox policy checks, and a three-task scripted UI-vs-text report.
- An in-process MCP handler for `initialize`, `tools/list`, `tools/call`, `resources/list`, and `resources/read`.
- A self-contained HTML view (`text/html;profile=mcp-app`) that stays idle until a sandbox proxy sets the host origin.
- A headless host bridge that drops the wrong source and any host notification sent before `ui/notifications/initialized`.
- A React page with a local preview, a labeled harness replay, and a Bolt Database desk (email/password, then the decision function).
- One SQL migration and the `approval-decision` edge function. The migration has not been applied.

## What has not run

- `npm install`, `npm test`, `npm run typecheck`, and `npm run dev`
- The stdio process in `server/main.ts`
- Browser execution of the HTML view, including a real double iframe
- Bolt Database, RLS with two users, and the edge function
- Any live model comparison

The deferred list is in [DEVELOPMENT-STATUS.md](DEVELOPMENT-STATUS.md). [BOLT-HANDOFF.md](BOLT-HANDOFF.md) is the provisioning inventory. The intended Bolt action is inspection, not provisioning, until those checks have run.

## Demo journey

The in-page harness replay, and `runDecisionJourney` in source, do this:

1. Open an MCP session and send `ui/initialize`, then `ui/notifications/initialized`.
2. Drop a host `tool-result` that arrives before that notification.
3. Show the synthetic queue. Approve "Rename the sandbox label" only after the confirmation token and the exact statement match.
4. Deny "Export support tickets" with the note "Needs a narrower folder."
5. Leave the text-only audience unable to call the write tools.

The stub actor in that replay is not a signed-in user. With no `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the preview explains that commit stays disabled. It does not invent a successful write.

## Later commands

From this directory, after a normal install:

```sh
npm install
npm run typecheck
npm test
npm run dev
```

The dev server is Vite on port 5173. Tests target Node 22 or newer via `node --experimental-strip-types --test`. The lockfile is not committed yet; add it with the install.

Local stdio, still unverified:

```sh
node --experimental-strip-types server/main.ts
```

That process serves the model audience only. It cannot commit. `CONFIRM_ACTOR_ID` selects an in-memory owner for reads. It is not authentication.

## Layout

| Path | Role |
|---|---|
| `src/domain` | Rules shared by the harness and the page |
| `src/mcp` | Tool descriptors, JSON-RPC, HTML document, stdio frames |
| `src/harness` | Simulated host bridge and the demo journey |
| `src/ui` | React preview, security note, measurement |
| `server/main.ts` | Optional local stdio entry. Not a Bolt function |
| `supabase/migrations` | Bolt Database schema and security-definer functions |
| `supabase/functions/approval-decision` | User-JWT decision endpoint |
| `docs` | Security note, harness, and measurement limits |

## Security

Read [docs/SECURITY-NOTE.md](docs/SECURITY-NOTE.md). The short version: the iframe is not the trust boundary, write tools are app-only, and a commit needs a matching unused token. None of the runtime sandbox or database checks have been executed.
