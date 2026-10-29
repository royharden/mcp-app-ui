# Limitations and pending checks

As of 2026-10-23 the source was built under Dirty Mode, which allows static checks only. **Nothing has been installed, built, tested or run.**

## Not verified at all yet

**Dependencies**
- The exact versions are candidates, not checked against the registry:
  - `@modelcontextprotocol/sdk` 1.25.2
  - `@modelcontextprotocol/ext-apps` 1.0.1
  - `zod` 3.25.76
  - React 18.3.1
  - Vite 6.0.11
  - Vitest 3.0.5
  - happy-dom 17.1.0
- No lockfile exists. One must come from a real `npm install`.

**SDK API shapes**
These were written from documentation, not from installed types:
- `registerAppTool` and `registerAppResource`
- `McpServer.registerTool` with `_meta` and Zod-object input schemas
- `App`, `PostMessageTransport`, and `AppBridge` with a `null` client and explicit handlers
- `sendHostContextChange` and `teardownResource`
- The host capability key `message` for `ui/message`

**Input validation**
The SDK may reject invalid tool input before the handler runs, so the structured `invalid_input` code is guaranteed only for handler-level checks such as the reason rules.

**Build**
- The view's classic IIFE build and the deterministic embed have never run.
- `server/generated/view-html.ts` does not exist until `npm run build:view`. `npm run typecheck` must run after that.

**Exact-bundle harness**
It is unknown whether happy-dom will:
- run a srcdoc iframe's inline script
- set `event.source` like a browser
- provide the APIs the SDK needs inside the frame

If any of these fails, record the layer as blocked and use the browser checks.

**Browser and host behaviour**
- The browser boundary has never been observed (BROWSER-01).
- No MCP Apps host has rendered the desk (HOST-01). A local, stdio-capable host and version still have to be named.

## Known design limits

These are true by design, not missing work:

- There is no database. Each tab and each stdio process has its own queue, and reload or restart resets it.
- The Lab is a srcdoc + meta-CSP inspection host, not a conformant separate-origin sandbox.
- Decisions are synthetic records. Nothing proves a human approved anything.
- The host-visible `structuredContent` carries nonces and statements. They are not secret.
- After a decision, the queue refresh keeps the same offset, so the last page can come back empty. There is no pager clamp.
- The view does not watch for transport close. A lost transport shows up as failing calls, not as a "disconnected" phase.
- No remote MCP endpoint, accounts, OAuth, persistence or deployment is included. These would need a separately scoped plan.
