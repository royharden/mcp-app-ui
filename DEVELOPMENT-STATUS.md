# Development status

Updated 2026-10-24. Branch `s17-approval-desk`. The governing plan is the outer `PLAN.md`, and the outer `STATUS.md` holds the review log.

## Phase

The Dirty Mode construction phase is complete or nearly complete:

- Source, tests and docs are written.
- Each work package had a static review by a separate reviewer.
- **Runtime is unverified.** There has been no install, build, test run, server start or browser start.

## Packages

| Package | Contents | Construction status |
|---|---|---|
| P1 | Domain, repo, server, stdio, unit/contract/stdio tests | Accepted (Dirty Mode construction) |
| P2 | View, session store, IIFE build and embed | Accepted (Dirty Mode construction) |
| P3 | Bridge Lab, host controller, CSP envelope, log, text pane | Accepted (Dirty Mode construction) |
| P4 | Harness, scenarios, host-gate tests, browser spec, SECURITY/HARNESS docs | See outer STATUS.md |
| P5 | Comparison tasks and replay, Evidence/Measure panels, docs, handoff | See outer STATUS.md |

## Static checks that actually ran

- `node scripts/syntax-check.mjs <tmp> <files>`: strips TypeScript types with Node's `module.stripTypeScriptTypes`, then runs `node --check`. Run on all `.ts` files as each was written; all passed.
- `.tsx` files could not be parsed here (no TypeScript or esbuild installed). They were read by hand and by the reviewers.
- `JSON.parse` on `package.json`, `tsconfig.json`, the fixture, the scenarios and `tasks.v1.json`: all passed.
- A Python scan for raw invisible and control characters in active files: clean.

## Never run

- `npm install`, `npm run typecheck`, `npm run build`
- `npm test`, `npm run test:stdio`, `npm run measure:replay`
- The browser checks (`tests/e2e`)
- Any real MCP host

## Inactive legacy paths (do not import, build, apply or deploy)

- `server/main.ts`
- `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/vite-env.d.ts`
- `src/domain/`, `src/harness/`, `src/lib/`, `src/mcp/`, `src/ui/`
- `supabase/config.toml`, `supabase/functions/approval-decision/`, `supabase/migrations/20261023180000_confirm_queue.sql`
- `fixtures/host-simulations.json`
- `tests/*.test.ts` (top level only)
- `docs/SECURITY-NOTE.md`, `docs/UI-VS-TEXT.md`

## Validation order (next phase, needs authorization)

1. `npm install`, then commit `package-lock.json`. Reconcile the candidate pins with real package metadata and types.
2. `npm run build:view`, then `npm run typecheck`. Fix only the errors reported.
3. `npm test`. If happy-dom cannot execute the exact bundle, record the harness layer as **blocked** and move to the browser checks.
4. `npm run build`, then `npm run test:stdio`.
5. `npm run measure:replay`. Record the output with versions and hashes.
6. Claim a port (agent-ports), serve `dist/`, then run BROWSER-01 (`tests/e2e/README.md`).
7. Name one local, stdio-capable MCP Apps host and version, then run HOST-01.
