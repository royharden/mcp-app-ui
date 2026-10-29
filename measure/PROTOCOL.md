# Comparison run protocol

Status: defined, never run. No results exist.

## What is compared

There are six read tasks (T1–T6 in `tasks.v1.json`). Each task is run in two modes with equal authority: the same server, the same `approvals-v1` data, the same filters and paging, and the same formatter.

- **Text mode.** Only `list_approvals` and `get_approval`. The model sees each tool's text content.
- **UI mode.** `open_approval_desk` plus the desk's filters and drawer. Any text fallback the host still forwards to the model counts toward UI-mode context.

The two policy demonstrations (D1: approve REQ-104; D2: reject REQ-105) are reported in their own table as host-policy and authorization outcomes. A text-only model is expected to refuse, because prepare and submit are app-only. A missing `ui/message` is never counted as a text-mode failure.

## Each run

1. Reset to a fresh session before every task and mode.
2. Record the query parameters and any paging used.
3. Record, separately:
   - tool calls
   - host/view messages
   - UI actions
   - scripted model turns
   - model-visible content characters
4. Record tokens only from named telemetry or a documented tokenizer; otherwise write "unavailable". Characters are not tokens.
5. Take wall time only from real runs, never from fake clocks.
6. Score with the oracle predicate in `tasks.v1.json`. Keep every failure.
7. Record the task order, the runtime/SDK/ext-apps versions and the dataset and HTML hashes.

## Scripted replay versus manual trials

`npm run measure:replay` runs text mode against the real server. It uses a fixed parser in place of a model and prints JSON to stdout. UI-mode observations come from the exact-bundle harness (`tests/harness`).

For a small manual trial, counterbalance the order: half the participants start with UI mode, half with text. Use the same six tasks and write down the order used.

## What results would not show

Tiny structural replays and a few manual trials do not establish usability, general model performance, or a universal efficiency advantage for either mode.
