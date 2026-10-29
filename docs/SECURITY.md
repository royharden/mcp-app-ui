# Security note: MCP Approval Desk

Status on 2026-10-23: source and tests are written. **Nothing has been installed, built or run.** Every claim below is at the "source inspected" layer at most, until the named case runs.

## What the app promises

A local process owner, or someone controlling the in-page server, can record a synthetic approve or reject decision. The server binds each decision to:

- the prepared request version
- the decision
- the normalized reason
- one exact statement string

Each nonce is consumed once, and only a pending row changes. The UI asks for an explicit confirmation of the exact statement.

The app records a decision only. No purchase, email, rename or external business action happens.

## What it does not promise

- **No proof of human identity, presence or consent.** App-only tool visibility and a one-time nonce prove neither. A host that can call `prepare_decision` and `submit_decision` can do both itself (SEC-03).
- **No secrecy for nonces or statements.** They travel in `structuredContent`, which a host may forward to a model. The nonce is only kept out of the text content.
- **No browser isolation claim from the Bridge Lab.** The Lab renders into a `srcdoc` frame with a meta CSP. That is an inspection host, not a separate-origin production sandbox (BROWSER-01 is pending).
- **No real-host support claim.** No named MCP Apps host or version has rendered the desk (HOST-01 is pending).
- **No persistence or multi-user guarantees.** There is no database. Reload or restart resets the queue.

## Evidence vocabulary

Each claim is reported at exactly one of these layers. A written test never counts as a pass.

1. Source inspected
2. SDK simulation passed
3. Exact bundle in DOM passed
4. Reference-browser boundary passed
5. Named host journey passed

## Claims, cases and current status

Revision: branch `s17-approval-desk`. Every case's status is **pending**: written, never executed.

| Claim | Cases | Highest layer reached |
|---|---|---|
| Rows, filters, sort, paging and facets match independent answers; text and structured output agree | DOMAIN-01 (`tests/unit/domain.test.ts`) | source inspected |
| Prepare records nothing. Approve and reject each change one row, version and history entry once | DEC-01 (`tests/contract/decisions.test.ts`) | source inspected |
| Unknown, used or expired nonces, tampered statements, wrong id or decision, and stale versions have no effect. A failed submit does not consume a valid nonce | DEC-02, SEC-04 | source inspected |
| Two preparations at one version allow exactly one transition. `now >= expiresAt` is expired. Capacity is 256 records, tombstones included | DEC-03 | source inspected |
| An edited reason needs a new preparation. An uncertain submit refreshes and never retries | DEC-04 (contract + `tests/unit/sessionStore.test.ts`) | source inspected |
| Five tools, nested `_meta.ui.visibility`, one UI link, the MIME type `text/html;profile=mcp-app`, an empty CSP allowlist, exact resource text | MCP-01 (`tests/contract/server.test.ts`) | source inspected |
| The stdio subprocess runs from an unrelated cwd, and stdout carries protocol only | MCP-02 (`tests/stdio/stdio.test.ts`) | source inspected |
| Markup is rendered as literal text, controls are stripped, untrusted fields are JSON-quoted and labelled, truncation is visible | SEC-01 (unit + `tests/harness/exactBundle.test.ts`) | source inspected |
| `ui/message` carries only "Decision recorded: <id> <decision>", once per click, and only with the negotiated capability | SEC-02 (store + `tests/harness/hostGates.test.ts`) | source inspected |
| Visibility is metadata; the host enforces it; a direct caller can prepare and submit | SEC-03 | source inspected |
| The exact returned script initializes and renders, and DOM Confirm changes the real repo | SEC-05 (`tests/harness/exactBundle.test.ts`, scenarios) | source inspected |
| Initialization, capability and teardown gates; wrong-window rejection; `ui/open-link` refused | SEC-06 (`tests/harness/hostGates.test.ts`) | source inspected |
| The CSP envelope is applied before any script, raw and enveloped hashes are separate, no raw nonce is persisted | SEC-07 (`tests/security/envelope.test.ts`, trace checks) | source inspected |
| Initial data withheld until `initialized`, then flushed once; overflow, timeout and Retry visible | INIT-01, INIT-02 (store tests, `tests/harness/hostGates.test.ts`, `exactBundle.test.ts`) | source inspected |
| StrictMode remount and final teardown keep one connection and leave no listeners behind | LIFE-01, CANCEL-01 (`tests/unit/sessionStore.test.ts`) | source inspected |
| Late query, launch, detail, prepare or message results cannot overwrite newer state | ORDER-01 (`tests/unit/sessionStore.test.ts`) | source inspected |
| Real invalid input and labelled injected transport failures show readable errors | ERR-01 (`harness/scenarios/invalid-reason.json`, `list-transport-error.json`) | source inspected |
| Theme, locale and size changes preserve state; a missing capability disables messaging | CTX-01 (`tests/unit/sessionStore.test.ts`) | source inspected |
| Real-browser sandbox and CSP behaviour | BROWSER-01 (`tests/e2e/sandbox.spec.ts`) | not started |
| A named host renders the desk over local stdio, mediates visibility, records a decision and acknowledges the message | HOST-01 | not started |

## Untrusted text handling

These rules apply in every channel:

- Titles, descriptions and reasons are request data, never instructions.
- Every output channel uses the same formatter, `server/domain/textRender.ts`. It applies NFC, strips C0/C1 controls, Unicode format characters and line/paragraph separators, collapses whitespace, caps titles at 120 code points and descriptions at 1000 with a visible `[truncated]` marker, and JSON-quotes every untrusted value.
- The view renders data only as React text.
- Reasons are validated rather than silently changed. Line breaks, control, bidi-format and zero-width characters are rejected. Length is 1 to 240 code points.

## Host policy in the Bridge Lab and harness

The shared host controller is `src/lab/hostController.ts`.

**Initialization**
- The transport is attached to the frame window before the document loads.
- One initial input and one initial result are held until `initialized`, then flushed once, in order, through a single delivery chain.
- A second initial input or result before `initialized` is an overflow and fails visibly.

**Requests from the view**
- `tools/call` and `ui/message` are refused before ready and after teardown. `ui/message` is also refused without the negotiated capability.
- Only app-visible tools of this server are forwarded, through the same SDK Client.
- `ui/message` is accepted only in the fixed template. "Accepted by the Lab" is not "acted on by a model".
- `ui/open-link` is always refused, with a visible count and no `window.open`.

**Lab frame**
- The frame is `sandbox="allow-scripts"`, with no `allow-same-origin`.
- The CSP is generated from validated resource metadata and placed first in `<head>`: `default-src 'none'`, `connect-src 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `img-src 'none'`, `font-src 'none'`, plus the exact script and style hashes.

## Harness-only deviation

The headless harness frame is `allow-scripts allow-same-origin`, so tests can read and drive the view's DOM. The harness layer therefore claims nothing about isolation. See `docs/HARNESS.md`.
