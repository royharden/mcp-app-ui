# MCP Approval Desk

An MCP App with an interactive approval UI. It records **synthetic** approve/reject decisions on a fixed queue of 12 made-up requests. Each decision is bound to:

- one exact confirmation statement
- the request version
- a one-time nonce

> **Honest status (2026-10-23):** the source, tests and docs are written. **Nothing has been installed, built, tested or run.** The source was built under a static-checks-only construction mode. Every runtime claim is pending; see `docs/LIMITATIONS.md` and `DEVELOPMENT-STATUS.md`.

## What is here

| Part | Path | What it is |
|---|---|---|
| MCP server | `server/createServer.ts` | Official SDK server with five tools and one UI resource. It is runtime-neutral and the view HTML is injected. |
| Domain | `server/domain/*`, `server/repo/*` | Strict schemas, a shared safe formatter, the canonical statement, and an atomic in-memory repo |
| Data | `fixtures/approvals.v1.json` | 12 synthetic requests. REQ-109 and REQ-112 carry hostile text on purpose. |
| View | `view/*` | React desk: queue, filters, drawer, an exact-statement confirmation dialog, outcome. Built as one classic script and inlined into one HTML document. |
| stdio entry | `server/stdio.ts` → `dist/server/stdio.js` | For local MCP hosts |
| Bridge Lab | `src/lab/*`, `index.html` | Static page. Runs the real server in the page, renders the exact resource in a sandboxed iframe, and adds a text-only pane, a protocol log, evidence and measurement panels. |
| Harness | `harness/*`, `tests/harness/*` | Headless exact-bundle runs with declarative scenarios and a bounded trace |
| Comparison | `measure/*` | Six equal-authority read tasks, two policy demonstrations, and a text-mode replay |
| Docs | `docs/SECURITY.md`, `docs/HARNESS.md`, `docs/MEASUREMENT.md`, `docs/LIMITATIONS.md` | Claims mapped to cases, with honest evidence layers |

## Tools

| Tool | Visible to | Purpose |
|---|---|---|
| `open_approval_desk` | model, app | Opens the desk on a filtered page. The only tool linked to the UI. |
| `list_approvals` | model, app | Filter, sort and page; returns category and risk counts |
| `get_approval` | model, app | Full detail and history for one id |
| `prepare_decision` | app | Binds version, decision and reason to a statement and a nonce. Records nothing. |
| `submit_decision` | app | Records once, for the exact statement, while the request is still pending at that version |

**What this does not prove:** the app does not prove a human approved anything. A host that can call prepare and submit can do both itself. Visibility is enforced by host policy.

## Requirements

- Node 22.6 or later
- No environment variables, credentials or accounts
- No database

## Commands

None of these have been run yet.

```sh
npm install            # once; commit the real package-lock.json
npm run build:view     # view IIFE, then embed → server/generated/view-html.ts (gitignored)
npm run typecheck
npm run build          # view → Lab (dist/) → stdio server (dist/server/stdio.js)
npm test               # unit, contract, security and harness suites (Vitest)
npm run test:stdio     # spawns dist/server/stdio.js from an unrelated directory
npm run measure:replay # text-mode replay; prints JSON
npm run dev            # Lab dev server; claim a port with agent-ports first
```

To connect a local MCP host, run `node <absolute path to repo>/dist/server/stdio.js`. Do not use `npx`; the package is not published.

## Legacy files

The earlier Grok "Confirm Queue" source is still on disk, including `supabase/`, `server/main.ts` and parts of `src/`. None of it is active: it is excluded from tsconfig, the test globs and the build. The complete list is in `BOLT-HANDOFF.md`. Do not apply or deploy any of it.

## Licence

MIT (see `LICENSE`). See `NOTICE` for provenance.
