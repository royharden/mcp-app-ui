# Headless harness

Status on 2026-10-23: written, **never run**. The harness needs `npm install` and `npm run build:view` first. Without them, `harness/index.ts` cannot import `server/generated/view-html.ts`, and the suites fail at load. That failure is the intended visible signal.

This file replaces the earlier Confirm Queue harness note, which survives in git history on `main`.

## Layers

| Layer | Entry | What it exercises |
|---|---|---|
| Protocol | `serverFixture()` in `harness/host.ts` | Official SDK `Client` → SDK in-memory pair → real `createServer` with a fresh repo. No UI. |
| Exact bundle | `renderInHarness()` in `harness/host.ts` | Fetches the HTML through `resources/read`, applies the Lab's CSP envelope and loads it into a happy-dom iframe. Connects the shared host controller (AppBridge + PostMessageTransport). The inlined classic IIFE must execute and initialize. Tests then drive the real DOM controls, and every `tools/call` reaches the real handlers. |
| Controller (supplementary) | `tests/unit/sessionStore.test.ts` | The view's session store with a scripted fake App. It supplements the exact-bundle layer and never substitutes for it. |

If happy-dom cannot execute the exact script:

- The exact-bundle suites fail.
- That layer is recorded as **blocked**.
- Its cases move to the later headless-browser validation (`tests/e2e`).

Entry-module tests are never presented as built-resource coverage.

## Scenarios

Scenario files live in `harness/scenarios/*.json` and are validated by `ScenarioSchema` in `harness/scenario.ts`.

**Fields:** `id`, `description`, `mode` (`realHandlers` | `injectedFault`), `datasetVersion`, `hostContext`, `initialToolInput`, `faults`, `actions`, `expected`.

**Actions:** an allowlist only, with no executable code and no destinations:

- `connect`
- `filter`
- `select`
- `prepare`
- `confirm`
- `cancel`
- `send`
- `teardown`
- `reset-session`

**Faults:** named and labelled in the trace. A fault-mode run never counts as a real-server success.

- `submitTimeoutAfterCommit` runs the real submit, then drops the reply.
- `listTransportError` fails a `list_approvals` call.

**Current scenarios:**

- `approve-req-104` (policy demonstration D1)
- `reject-req-105` (D2)
- `cancel-leaves-pending`
- `uncertain-submit` (injected fault)

## Trace contract

The trace is produced by `harness/recorder.ts`.

**Identity:**

- scenario and mode
- dataset SHA-256 (raw fixture bytes)
- raw HTML SHA-256
- envelope SHA-256
- runtime, SDK and ext-apps versions
- spec revisions

**Events:** a monotonic index, channel, direction, method, the actual JSON-RPC id (never invented for notifications), an allowlisted payload, the original size, the action and the disposition.

**Limits:** 2000 events, 16 KiB per event, 2 MiB in total. Exceeding any limit throws `TraceOverflowError`; evidence is never silently dropped.

**Redaction:**

- Nonces become `nonce#N` aliases. SHA-256 digests are kept for cross-checks.
- Reasons, statements, titles, descriptions and tool text are replaced by `{ redacted, length }`.
- Traces are not written to disk unless a caller explicitly exports one.

## DOM shims

`tests/setup.ts` installs these shims into the host test window only:

| Shim | Behaviour |
|---|---|
| `matchMedia` | Never matches |
| `ResizeObserver` | Never fires |
| `IntersectionObserver` | Never fires |
| `scrollIntoView` | No-op |

The view frame relies on happy-dom's own implementations, because injecting shims would alter the exact HTML.

Shims establish nothing about layout, focus, media queries, CSP or isolation.

## Harness-only deviation

The harness frame is `allow-scripts allow-same-origin`, so the test can drive the DOM. The Lab and real hosts use `allow-scripts` without same-origin. Isolation is checked only by BROWSER-01 in a real browser.

## Running it later (authorized validation phase only)

```sh
npm install
npm run build:view
npm test
```

`npm test` includes `tests/harness`. Record actual results, versions and any blocked layer in `DEVELOPMENT-STATUS.md`.
