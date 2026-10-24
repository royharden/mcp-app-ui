# Browser checks (pending)

`sandbox.spec.ts` holds BROWSER-01. It has never run.

It is not part of `npm test` and is excluded from `tsconfig.json` because it needs
`@playwright/test` and a browser binary, which are not dependencies yet.

To activate it in a later, authorized validation phase:

1. Claim a host port with the `agent-ports` ledger before serving anything.
2. `npm run build`, then serve `dist/` on the claimed port.
3. Add `@playwright/test` as a dev dependency, install a browser, and commit the lockfile.
4. `APPROVAL_DESK_LAB_URL=http://localhost:<port>/ npx playwright test tests/e2e`.

What a pass would show, and what it would not:

- It shows how one named browser treats the Lab's `allow-scripts` srcdoc frame and meta CSP.
- It does not show separate-origin isolation. Two-origin checks need a reference host, for example the ext-apps `basic-host` at a named revision.
- It does not show that any real MCP Apps host renders the desk (HOST-01).
