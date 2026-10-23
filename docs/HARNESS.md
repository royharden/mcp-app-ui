# Headless harness

The harness is an in-process stand-in for a chat host. It does not open a browser, a socket, or a model API.

## What it drives

`runDecisionJourney` in `src/harness/journey.ts`:

1. `initialize` on the MCP session, with the app audience and the stub owner `owner-demo`.
2. A host `ui/notifications/tool-result` pushed before `ui/notifications/initialized`. The bridge drops it.
3. `ui/initialize` from the sandbox origin, then `ui/notifications/initialized`.
4. `list_approvals`, then a delivered tool-result.
5. `request_decision` and `commit_decision` through the app audience.

`HostBridge` records each message. `fixtures/host-simulations.json` holds two host contexts, `light-inline` and `dark-fullscreen`. The journey uses `light-inline`. The TypeScript copy is `HOST_SIMULATIONS`.

A second check rejects `ui/notifications/initialized` when the source is the host origin. The view stays uninitialized, so a later push is dropped.

## What it does not do

- It does not parse or run the HTML document. `tests/htmlResource.test.ts` checks the document text: CSP, idle origin marker, bridge method names, and no external URL.
- It does not prove iframe isolation. That remains a browser check.
- The stub actor is fixed so the script is repeatable. It is not a signed-in user.

## Stdio

`server/main.ts` speaks Content-Length frames and forces the model audience. It is the local process a desktop host would launch later. It is not deployed as a Bolt function. Bolt WebContainers are not a durable stdio host.
