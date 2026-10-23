# Development status

Dirty Mode construction. Runtime unverified. Updated 2026-10-23.

## Built in source

- Approval rules, text fallback, frame policy, and the scripted measurement.
- MCP tool and resource contract, HTML app document, stdio framing, and the headless journey.
- React preview, security note, measurement table, and the signed-in Bolt Database desk.
- Migration `supabase/migrations/20261023180000_confirm_queue.sql`.
- Edge function `supabase/functions/approval-decision`.

## Not done

No install, typecheck, unit test, dev server, browser pass, migration, function deploy, or stdio run has been executed for this repo.

## Static check in the construction session

Node v24.18.0 parsed 28 TypeScript modules with `node --experimental-strip-types --check` (domain, MCP, harness, browser libraries, stdio entry, and tests). That is syntax only. It is not a typecheck and not a test run.

`src/vite-env.d.ts` is an ambient declaration. Node did not strip it and reported a syntax error on `interface`. That is a checker limit, not a reviewed logic defect.

`.tsx` files were not parsed: Node reports an unknown `.tsx` extension. They were read by hand. `tsc` was not run because dependencies are not installed. The Deno function and the SQL file were not parsed by Node. `package.json` and `fixtures/host-simulations.json` parsed as JSON.

## Deferred validation

| Component | Assumption or skipped check | Later step |
|---|---|---|
| Dependencies | Pinned versions in `package.json` resolve | `npm install`, then commit `package-lock.json` |
| Typecheck | `tsc` is not installed in this session | `npm run typecheck` |
| Unit tests | Written under `tests/`, not run | `npm test` on Node 22+ |
| Vite page | Not opened | `npm run dev`, then preview, replay, empty auth, and both write buttons |
| Migration | SQL not applied | Apply only this pending file on a fresh Bolt Database |
| RLS | Policies are source | Two users: B cannot read or decide A's row. Direct update of `approvals` fails |
| Edge function | Deno not started | Deploy with `verify_jwt`. Missing service role returns `missing_config`. Anon key as Bearer returns `unauthenticated` |
| CORS | Localhost is allowed until configured | Set `CORS_ALLOW_ORIGINS` to the hosted origin and repeat preflight |
| Auth settings | Email and password assumed | Set Site URL, redirect allowlist, and email confirmation |
| MCP stdio | `server/main.ts` not started | Run it and call `tools/list` |
| HTML view | Script not executed in a browser | Rewrite the host origin and complete one confirm |
| Real sandbox | Policy is a function, not an iframe | Check `allow-scripts` only, unreadable `contentDocument`, wrong-source drop, and no early host push |
| Measurement | Scripted character counts | Do not cite the table as a model study |
| Edge types | The Deno file is outside `tsconfig.json` | Typecheck it with Deno or the Bolt function toolchain |
| Lockfile | Omitted on purpose | Add it after install |
| Docker | Not used | Not required. A container would need an agent-ports claim first |

`gen_random_uuid()` is assumed to exist in the Bolt Database Postgres. That is true of current Supabase Postgres and is unverified here.
