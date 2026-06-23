# Integration Check Map (Phase 2)

Every original live-harness check (`packages/MJServer/integration-test-scripts/*.ts`) maps 1:1 to a
registered `NamedCheck` (`checkId`) inside a single check **bundle**, and every bundle maps to one
`MJ: Tests` row dispatched by `IntegrationTestDriver`. The check **bodies are lifted verbatim** — only
the registration wrapper changed (`IntegrationCheckRegistry.Register` instead of `suite.Test`).

The driver runs each bundle's `NamedCheck[]` in array order against one bootstrapped
`IntegrationCheckContext`; the per-check pass/fail lands in `TestRun.ResultDetails` as a bare
`OracleResult[]` (one per check, `oracleType = checkId`).

Counts: server 23 default / 26 with `runMutationTests`; client 11 default / 12 with `runMutationTests`;
runquery 9 (the whole bundle mutates the DB by design, so it is not mutation-gated).

| Orig id | Suite file | New Test (`MJ: Tests.Name`) | Bundle `type` | `checkId` | Mutating? | Needs MJAPI? |
|---|---|---|---|---|---|---|
| S1 | server-cache-tests.ts | IT01 - Server RunView Cache Integrity | `server-cache` | `server-cache.S1` | no | no |
| S2 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S2` | no | no |
| S3 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S3` | no | no |
| S4 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S4` | no | no |
| S5 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S5` | no | no |
| S6 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S6` | no | no |
| S7 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S7` | no | no |
| S8 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S8` | no | no |
| S9 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S9` | no | no |
| S10 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S10` | no | no |
| S11 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S11` | no | no |
| S12 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S12` | no | no |
| S13 (linger-dedup, zero traffic) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S13` | no | no |
| S14 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S14` | no | no |
| S15 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S15` | no | no |
| S16 | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S16` | no | no |
| **S17** (save/delete invalidation) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S17` | **yes** | no |
| S18 (AfterKey keyset) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S18` | no | no |
| S19 (count_only) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S19` | no | no |
| S20 (BypassCache poisoning) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S20` | no | no |
| S21 (entity_object full fields) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S21` | no | no |
| S22 (in-flight dedup) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S22` | no | no |
| **S23** (upsert in-place) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S23` | **yes** | no |
| **S24** (`AllowCaching` flip+restore) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S24` | **yes** | no |
| S25 (Trust=0 entity) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S25` | no | no |
| S26 (Record Changes exempt) | server-cache-tests.ts | IT01 | `server-cache` | `server-cache.S26` | no | no |
| C1 | client-cache-tests.ts | IT03 - Client GraphQL Cache Integrity | `client-cache` | `client-cache.C1` | no | **yes** |
| C2 | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C2` | no | yes |
| C3 | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C3` | no | yes |
| C4 (shares tag `'c3'`) | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C4` | no | yes |
| C5 (shares tag `'c3'`) | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C5` | no | yes |
| C6 | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C6` | no | yes |
| C7 | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C7` | no | yes |
| C8 | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C8` | no | yes |
| C9 | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C9` | no | yes |
| **C10** (save/delete via GraphQL) | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C10` | **yes** | yes |
| C11 (client RunQuery slot) | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C11` | no | yes |
| C12 (Trust=0, stamp gate) | client-cache-tests.ts | IT03 | `client-cache` | `client-cache.C12` | no | yes |
| Q1 | runquery-cache-tests.ts | IT02 - RunQuery Cache Integrity | `runquery-cache` | `runquery-cache.Q1` | yes (bundle always mutates) | no |
| Q2 | runquery-cache-tests.ts | IT02 | `runquery-cache` | `runquery-cache.Q2` | yes | no |
| Q3 | runquery-cache-tests.ts | IT02 | `runquery-cache` | `runquery-cache.Q3` | yes | no |
| Q4 | runquery-cache-tests.ts | IT02 | `runquery-cache` | `runquery-cache.Q4` | yes | no |
| Q5 | runquery-cache-tests.ts | IT02 | `runquery-cache` | `runquery-cache.Q5` | yes | no |
| Q6 (`current`/`stale` status) | runquery-cache-tests.ts | IT02 | `runquery-cache` | `runquery-cache.Q6` | yes | no |
| Q7 (`no_validation`) | runquery-cache-tests.ts | IT02 | `runquery-cache` | `runquery-cache.Q7` | yes | no |
| Q8 (broken-SQL fixture) | runquery-cache-tests.ts | IT02 | `runquery-cache` | `runquery-cache.Q8` | yes | no |
| Q9 (param key-order) | runquery-cache-tests.ts | IT02 | `runquery-cache` | `runquery-cache.Q9` | yes | no |

## Mutation gating

Mutation-active server/client checks carry `RequiresMutation: true` on their `NamedCheck` (S17/S23/S24,
C10). The driver/script skip them unless the run opts in:
- driver — the bundle selector sets `config.runMutationTests: true`;
- tsx script — `RUN_MUTATION_TESTS=1`.

This converts the original `if (process.env.RUN_MUTATION_TESTS === '1')` registration gate into a
declarative, persisted flag without losing coverage.

## RunQuery fixtures (CANONICAL C)

The `runquery-cache` bundle needs cross-check fixtures (a Query Category + a TTL Query + a validated
Query). Engine-level `SetupSuite`/`TeardownSuite` hooks do not exist until Phase 4, so the driver creates
the fixtures (`createRunQueryFixtures`) before the bundle's checks and tears them down
(`teardownRunQueryFixtures`) in a `finally` — driver-level, inside the bundle. The tsx script does the
same in its `main()`. Both consume the **one** shared fixture lifecycle in `runquery-cache.checks.ts`.

## Ordering is load-bearing

Checks are registered in numeric order. The only outcome-affecting ordering is the shared-slot chains
(S1→S2→S3 share the `'s1'` `UniqueFilter` tag; C3→C4→C5 share `'c3'`), which numeric order preserves.
The original script registered S17/S23/S24 in the middle of the S-sequence when `RUN_MUTATION_TESTS=1`;
the registry uses numeric order instead — equivalent because those checks are self-contained (they reset
their own counters and restore any flag they flip), proven by the golden-equivalence diff.
