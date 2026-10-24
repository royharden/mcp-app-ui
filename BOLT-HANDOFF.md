# Bolt.new handoff: MCP Approval Desk

This file is the single product inventory. Updated 2026-10-24.

## Backend needs

| Item | Needed? |
|---|---|
| Database | **Not required.** All state is in memory, per tab or per process. |
| Server functions / edge functions | Not required |
| Auth | Not required |
| Storage | Not required |
| Realtime | Not required |
| Secrets / environment variables | Not required (see `.env.example`) |

## Inactive legacy paths: do not import, build, apply, deploy or provision

This is the single, complete list (42 tracked files). README.md and DEVELOPMENT-STATUS.md point here. They are the superseded Grok "Confirm Queue", kept as history, excluded from tsconfig, the Vitest globs and every Vite input:

- Database / edge (never apply or deploy):
  - `supabase/config.toml`
  - `supabase/functions/approval-decision/index.ts`
  - `supabase/migrations/20261023180000_confirm_queue.sql`
- Server: `server/main.ts` (hand-written Content-Length framing)
- Page: `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/vite-env.d.ts`
- `src/domain/`: `confirm.ts`, `constants.ts`, `errors.ts`, `measure.ts`, `securityPolicy.ts`, `seed.ts`, `store.ts`, `textFallback.ts`, `types.ts`
- `src/harness/`: `bridge.ts`, `fixtures.ts`, `journey.ts`
- `src/lib/`: `liveQueue.ts`, `supabase.ts` (the Supabase client)
- `src/mcp/`: `descriptors.ts`, `framing.ts`, `htmlResource.ts`, `server.ts`
- `src/ui/`: `LiveDesk.tsx`, `MeasureView.tsx`, `QueuePreview.tsx`, `SecurityNote.tsx`
- Fixture: `fixtures/host-simulations.json`
- Top-level tests (node:test, not run by Vitest): `tests/bridge.test.ts`, `tests/confirm.test.ts`, `tests/framing.test.ts`, `tests/htmlResource.test.ts`, `tests/measure.test.ts`, `tests/persistenceContract.test.ts`, `tests/securityPolicy.test.ts`, `tests/serverContract.test.ts`, `tests/textFallback.test.ts`
- Docs: `docs/SECURITY-NOTE.md`, `docs/UI-VS-TEXT.md`

If any of the database/edge files is found already applied or deployed somewhere, reconcile that baseline first. Do not assume it was never applied. Deleting these files is separate cleanup work.

## Frontend

- Root `index.html` → `src/lab/main.tsx`: the Bridge Lab, a static page.
- Build order:
  1. `npm run build:view`, which writes `dist/view` and the gitignored `server/generated/view-html.ts`
  2. `npm run build:lab`, which writes `dist/`
  3. `npm run build:server`, which writes `dist/server/stdio.js`
- Static hosting runs only the inspection page. An external MCP host still needs the local stdio process.

## Status of build artefacts

| Artefact | Status |
|---|---|
| Lockfile | **Absent.** It must come from a real `npm install`. |
| Generated view module | **Absent** until `npm run build:view`. Never handwritten. |
| Any build or test run | **None** |

## Local stdio (for the owner)

1. `npm install`
2. `npm run build`
3. Point a local MCP host at `node <absolute path>/dist/server/stdio.js`

The process resets its queue on every restart.

## Outstanding checks

See `DEVELOPMENT-STATUS.md`, "Validation order", and `docs/LIMITATIONS.md`.

## Prompt for Bolt (inspection and preparation only)

> Inspect this repository. It is a static Vite + React page (the "Bridge Lab") with no backend, database, auth, storage or secrets. Do not create or connect a database, and do not apply or deploy anything under `supabase/`, which holds inactive legacy files. Report whether `npm install`, `npm run build:view` and `npm run build:lab` would work in this environment, and list any errors. Do not publish, deploy or provision anything.

Writing this file authorizes no push, import, provisioning or publication. Change the prompt to "provision" only after the validation steps have real receipts, and only if Roy asks.
