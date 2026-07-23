# Fix #3251 — Live-Agent Bundle Failures: Corrected Diagnosis + Build Plan

**Issue**: [#3251 — test(integration): single-bundle "mj test run" gives false failures for live-agent bundles](https://github.com/MemberJunction/MJ/issues/3251)
**Branch**: `fix/3251-single-bundle-live-agent-transport`
**Diagnosed**: 2026-07-22, via code-trace against the v5.49.0 state + the issue's own captured logs.
**Status**: WI1–WI8 COMPLETE (2026-07-22). Diagnosis adversarially verified (workflow
`wf_9e5ee839-d8b`: DIAGNOSIS_SOUND, 20 CONFIRMED / 0 REFUTED / 2 non-blocking PARTIALs, both folded
into WI3's per-seam framing below). WI7 investigated against the release DB (findings below); WI8
live smoke test done (below).

**WI7 — IT60/IT61 classified from `TestRun.ResultDetails` on `MJ_Release_v549` (both fail for a
SEPARATE cause, neither is the contextUser defect — confirming C2.3, so NO code change here):**
- **IT61 (agent-memory-guards) = model non-compliance.** MG1: the model emitted 10 disallowed-type
  writes (all `rejected-type`) instead of the 2 instructed → the hard `Assert` "allowed Preference
  write did not land" fired. MG2: 0 valid writes (cap check got 0). MG3: explicit
  `model-noncompliance:` after 3 attempts. MG4/MG5 pass. This is the live tier honestly surfacing
  real-model variance (the IT: Memory Writer model didn't follow the verbatim-emit instruction) —
  accepted per the tier's design; a prompt-tuning concern at most, not a product defect. No issue.
- **IT60 (agent-compaction-e2e) CE2 = timing, not config.** The "Conversation Summary" prompt has
  3 *active* bindings (Cerebras/Groq/OpenAI — no Gemini), so the check's own "no active binding"
  hint is a red herring here. CE1 (deterministic budget math) + CE9 (negative control) pass; only
  the live positive CE2 failed — the post-turn compaction is fire-and-forget + a real summary LLM
  call, and its ~30s poll (`AGENT_COMPACTION_POLL`×2.5s) closed before the summary landed on the
  co-hosted release box. A quiet-box re-run or a larger poll default would confirm; not the
  contextUser defect and not chased in this PR.

**Landed (unit-verified):**
- WI1 — `makeAIClient`/`resolveClient` take a required `user: UserInfo`; 11 call sites thread
  `ctx.User`; loud harness-attributed throw when no user resolves. Guard: `agent-invoker-contextuser.test.ts` (6 tests).
- WI2 — driver server-branch guard: a non-Database resolved provider → loud `Error` naming the
  rebinding. Guard: `IntegrationTestDriver.test.ts` (+2 tests, 19 total).
- WI3 — `runWithCompliance` reclassifies no-run as `agent-run-failed:` (immediate, no retry);
  `withBoundedRetry` left as-is (already hard-fails a no-run). Guard: `run-with-compliance.test.ts` (3 tests).
- WI4 — `ai-verify.ts` fetchById: truthful message stating the bound + `MJ_IT_FETCH_POLL_MS` knob.
  Guard: `ai-verify.test.ts` (2 tests).
- WI5 — stale "CLIENT-TRANSPORT / over the wire" docblocks rewritten to server-in-process (Q8).
- WI6 — DEPLOYMENT.md §4.6 + build-engineering-runbook.md corrected (equivalence contract,
  `agent-run-failed:` vs `model-noncompliance:`, this post-mortem pointer).

Test tallies: `integration-test-suite` 131/131, `testing-integration` 69/69. Both build clean.

**Live smoke test (WI8 step 3) — DONE, fix validated.** Ran the exact §4.6 command that produced
the phantom, twice, against the release scratch DB `MJ_Release_v549` (localhost:1455) with live
model keys:
`MJ_INTEGRATION_TEST=1 npx mj test run "IT53 - Agent Loop Foundation (live)"`.
- **Zero** `For server-side use of all engine classes` CRITICALs (release build: 21 per bundle).
- **6/7 oracles pass** (release build: 0/7). AL1–AL5 + AL7 green both runs — the agent executes
  real multi-step in-process runs (terminal state, action lineage, action-result carry-forward,
  token rollup, conversation plumbing, vendor failover), identical across both runs.
- Fixtures self-cleaned (0 leaked). The dist under test carries the fix (invoker throw + guard).
- **AL6 fails deterministically** (both runs) — a SEPARATE, pre-existing failure-path finding, NOT
  the contextUser defect: with all model bindings deactivated the run finalizes non-Completed/
  non-Running (those asserts pass) but `AIAgentRun.ErrorMessage` is empty on the header. Newly
  *visible* only because the fix lets the run actually reach its failure path. Follow-up (parallel
  to WI7): determine whether the error should propagate to the run header (product gap) or AL6
  should read it off the child prompt-run/step (check refinement). Out of scope for this PR.

Not run here: the full Live Model suite (IT63 needs MJAPI, which isn't up) and IT56/IT57 (the
`resolveClient` path — unit-covered). The `resolveClient` fix mirrors `makeAIClient` exactly.

---

## 1. Corrected root cause (differs materially from the issue narrative)

### What the issue claims

> In-suite the agent executes server-side over the GraphQL wire; standalone it silently degrades
> to in-process execution because `agent-loop-live` is missing from the hardcoded `CLIENT_BUNDLES`
> set, and a suite run only gets the right transport because an earlier client bundle rebound the
> process-global provider.

### What the code actually shows

**The live-agent bundles run the agent in-process in BOTH suite and single-bundle runs — by
design — and fail in both for the same reason: a dropped `contextUser`.**

The verified chain:

1. **Transport is already declared, not inherited, for every live-agent bundle.** All of
   IT16–IT62 declare `"transport": "server"` in their metadata Configuration
   (`metadata-optional/integration-test/tests/integration/.IT*.json`). The hardcoded
   `CLIENT_BUNDLES` set (`IntegrationTestDriver.ts:55`) is only the fallback when
   `config.transport` is absent (`IntegrationTestDriver.ts:140-141`) — it is not consulted for
   these tests at all.

2. **Server-in-process is deliberate.** Commit `799bb1d0b8` (2026-07-21, "Q8 ruling") converted
   the five newest agent bundles from client-wire to in-process `AgentRunner.RunAgent`, because
   the wire `RunAIAgent` mutation is fire-and-forget over PubSub that a headless client cannot
   consume. `AgentRunner.RunAgent` (`packages/AI/Agents/src/AgentRunner.ts:83-119`) has no wire
   routing — it always executes `BaseAgent` in the calling process.

3. **The Q8 conversion kept a client-era fallback that is null on the server transport.** Both
   shared harnesses build the invoker with
   `contextUser: params.contextUser ?? provider.CurrentUser`:
   - `agent-live-shared.ts:59` (`makeAIClient`, used by IT53 / IT54 / IT55)
   - `_it-live-agent-harness.ts:94` (`resolveClient`, used by IT56 / IT57)

   No call site passes `ctx.User` (11 call sites total). `provider.CurrentUser` is populated only
   on a **client** (GraphQL) provider — the server tells the client who it is. On the CLI's
   `SQLServerDataProvider` it is **never assigned**: `GetCurrentUser()`
   (`SQLServerDataProvider.ts:613`) circularly returns `this.CurrentUser`, which starts null and
   nothing in `setupSQLServerClient`/`initializeMJProvider` sets it. So `contextUser` is null.

4. **Null `contextUser` is fatal on a Database provider.** `BaseEngine.Load` throws
   `'For server-side use of all engine classes, you must provide the contextUser parameter'`
   when `ProviderType === Database && !contextUser` (`packages/MJCore/src/generic/baseEngine.ts:528-529`).
   The run dies in `BaseAgent.initializeEngines` → `ActionEngineServer.Config` (the exact stack
   in the issue), nothing the oracles look for persists, and every oracle fails. Which engine
   trips first depends on what earlier tests happened to pre-load in the same process — which is
   why suite and standalone runs produce *different-looking* failure messages for the *same*
   defect, feeding the transport-divergence misdiagnosis.

5. **The smoking-gun differential.** The failing bundles are exactly the ones relying on the
   `provider.CurrentUser` fallback; every sibling that threads the user explicitly passes:

   | Bundle | Invoker | `contextUser` source | v5.49.0 run 4 |
   |---|---|---|---|
   | IT17 agent-runner | direct `AgentRunner` | `ctx.User` explicit | ✅ passed |
   | IT58 agent-skills-live | direct `AgentRunner` | `ctx.User` explicit | ✅ passed |
   | IT59 agent-plan-mode | direct `AgentRunner` | `ctx.User` explicit | ✅ passed |
   | IT62 agent-rag-search | direct `AgentRunner` | `ctx.User` explicit | ✅ passed |
   | IT53 agent-loop-live | `makeAIClient` | `provider.CurrentUser` → **null** | ❌ failed |
   | IT54 shipped-agents-live | `makeAIClient` | `provider.CurrentUser` → **null** | ❌ failed |
   | IT55 agent-carry-forward | `makeAIClient` | `provider.CurrentUser` → **null** | ❌ failed |
   | IT56 agent-payload-guards | `resolveClient` | `provider.CurrentUser` → **null** | ❌ "model-noncompliance" |
   | IT57 agent-artifact-tools | `resolveClient` | `provider.CurrentUser` → **null** | ❌ "model-noncompliance" |
   | IT60 agent-compaction-e2e | direct `AgentRunner` | `ctx.User` explicit | ❌ failed — separate cause, §5 |
   | IT61 agent-memory-guards | direct `AgentRunner` | `ctx.User` explicit | ❌ failed — separate cause, §5 |

### Corrections to the issue narrative (so the next reader isn't misled)

- **"In-suite = over the wire" is wrong.** In the Live Model suite, the only client-transport
  member (IT63 agent-wire-callback) is sequenced **last** (seq 15 of 15), so nothing rebinds the
  global provider before IT53 (seq 5). The issue's own evidence #3 proves in-process execution
  in-suite: **216 contextUser CRITICALs logged by the test-runner during the full suite run**,
  zero by MJAPI. And IT53–IT57 failed in-suite too (run 4 = 8/15). The "22 MJAPI hits" during the
  suite window belong to IT63's genuine wire runs (plus other GraphQL traffic), misattributed
  to IT53.
- **"Ruled out #5 (IT56/57 = model variance, working as designed)" is largely wrong.**
  `runWithCompliance` (`_it-live-agent-harness.ts:290-307`) treats "no run landed"
  (`runId=none`) as non-compliance and retries; with the contextUser defect the run *never*
  landed, so a hard harness failure was **laundered into `model-noncompliance:`** — burning 3
  live-model attempts per check in the process. This applies to **IT56 / IT57**
  (`agent-payload-guards`, `agent-artifact-tools`), which use `runWithCompliance`.
  **Narrowing (verified — C4.2 PARTIAL):** `agent-memory-guards` (IT61) does NOT launder a
  *missing run* — `runWriter` throws a plain `Assert` (`'RunAgent returned no agentRun for IT:
  Memory Writer'`) that `withBoundedRetry` re-throws immediately (it only retries
  `ModelNonCompliance`). In IT61 only an **`assertP`-guarded observable miss** (a
  disposition/note/structural check) becomes `model-noncompliance:`. And IT61 threads
  `ctx.User` correctly anyway, so it never suffers the contextUser defect — its failure is a
  separate cause (§WI7).
- **What the issue got right**: the provider-rebinding hazard is real
  (`setupGraphQLClient` → `SetProvider(provider)` rebinds the process global,
  `GraphQLDataProvider/src/config.ts:13`, and the driver's server branch silently inherits
  `Metadata.Provider`, `IntegrationTestDriver.ts:399`); the stale "CLIENT-TRANSPORT /
  GraphQLAIClient → live MJAPI" docblocks on the very files that run in-process are what sent
  the investigation down the wire-transport path; and the `ai-verify.ts:40` "write never landed"
  message asserts data loss that did not happen. All three are fixed below.

### Why it validated green on 2026-07-21 and burned the release on 07-22

**Timeline nuance (corrected — verified C6.3):** the metadata flip to `transport: "server"` for
IT53–IT57 and the harness conversion to server-in-process `AgentRunner.RunAgent` were the **same
commit `799bb1d0b8`**; the "green 7/7" declaration (`81670d5b41`) came **after** the flip. So the
green validation ran under the *same* server transport + `?? provider.CurrentUser` fallback that
fails on the release build — the green-then-red delta is therefore **environmental, not a
code-timeline artifact**: in the author's 2026-07-21 validation environment the process-global
provider must have exposed a non-null `CurrentUser` (e.g. a client/GraphQL global provider bound
in that session, or a differently-bootstrapped run), whereas the fresh-seeded release build's
CLI SQL provider has `CurrentUser === null` (C1.3). We cannot pin the exact author-env condition
without that environment, and we don't need to: the **mechanism** (null `CurrentUser` on the SQL
provider → `BaseEngine.Load` throw) is independently confirmed, and WI1 removes the dependency on
`provider.CurrentUser` entirely — so the outcome no longer varies by environment. Nothing asserted
the difference, which is why it shipped silent; WI1 + WI2 make it deterministic and loud.

---

## 2. Fix scope (approved)

Harness fix + driver transport guard. Registry-declared transport (retiring `CLIENT_BUNDLES`)
is explicitly **out of scope** — logged as a follow-up in §7.

Work items are grouped into independently reviewable commits, behavior changes separated from
doc-only changes.

### WI1 — Thread `ctx.User` through both agent invoker harnesses *(commit 1)*

**Files**:
- `packages/TestingFramework/integration-test-suite/src/checks/agent-live-shared.ts`
- `packages/TestingFramework/integration-test-suite/src/checks/_it-live-agent-harness.ts`
- all 11 call sites (grep `makeAIClient(` / `resolveClient(`):
  `agent-loop-live.checks.ts` (7), `shipped-agents-live.checks.ts` (1),
  `agent-carry-forward.checks.ts` (1), `agent-payload-guards.checks.ts` (1),
  `agent-artifact-tools.checks.ts` (1)

**Change**: make the user a **required** second parameter so the compiler enforces threading:

```ts
export function makeAIClient(provider: IMetadataProvider, user: UserInfo): AgentInvoker {
    return {
        RunAIAgent: (params: ExecuteAgentParams) => {
            const contextUser = params.contextUser ?? user ?? provider.CurrentUser;
            if (!contextUser) {
                // Fail loudly with a harness-attributed error — never let a missing user
                // surface as a product-shaped BaseAgent failure (issue #3251).
                throw new Error(
                    'integration harness: no contextUser available for the server-in-process ' +
                    'agent run — pass ctx.User to makeAIClient (provider.CurrentUser is null ' +
                    'on a database provider)');
            }
            /* ...unchanged conversationId plumbing... */
            return new AgentRunner(provider).RunAgent({ ...params, data, contextUser, provider });
        },
    };
}
```

Same shape for `resolveClient(provider, user)`. Call sites become
`makeAIClient(ctx.Provider, ctx.User)` / `resolveClient(ctx.Provider, ctx.User)`.

**Regression test** (new `__tests__` file in the suite package, vitest):
`vi.mock('@memberjunction/ai-agents')` to capture `RunAgent` params; assert
(a) the invoker passes the supplied user as `contextUser`,
(b) an explicit `params.contextUser` wins over the bound user,
(c) with no user anywhere, the invoker throws the harness-attributed error (not a BaseAgent error).

### WI2 — Fail-loud transport/provider guard in the driver *(commit 2)*

**File**: `packages/TestingFramework/testing-integration/src/IntegrationTestDriver.ts`
(`buildCheckContext`)

**Change**: after resolving the provider for the `'server'` branch, assert its type matches the
declared transport; mirror cheaply on the `'client'` branch:

```ts
// server branch, after `provider` is resolved:
if (provider.ProviderType !== ProviderType.Database) {
    throw new Error(
        `transport 'server' resolved a '${provider.ProviderType}' provider — the process-global ` +
        `provider was rebound (a client-transport bundle ran earlier in this process). ` +
        `Server-transport bundles must be sequenced BEFORE all client-transport bundles in a ` +
        `suite, or run in their own process. (issue #3251)`);
}
```

`ProviderType` is a `const`-object + `type` alias exported from `@memberjunction/core`
(`interfaces.ts`), **not** a TS `enum` — `ProviderType.Database` is a valid member and the
comparison compiles identically (same pattern as `baseEngine.ts:528`); import it alongside the
existing `Metadata` / `IMetadataProvider` imports in the driver.

The throw lands in `Execute`'s existing bootstrap catch → `buildErrorResult` (an `Error` status
with the message, never a wedged `Running` run — verified C5.2: a server-transport throw skips the
client-only skip branch and hits the `Bootstrap failed:` path). This converts the DEPLOYMENT.md
§4.6 ordering warning from prose into an enforced invariant: a future reordering (or dropping a
client bundle) now fails with a harness-attributed message instead of silently flipping transports.

**Safety check done during diagnosis**: in both shipping suites every server-transport member is
sequenced before every client-transport member (Deterministic: server seq 1–32, client seq 33–51;
Live Model: server seq 1–14, client seq 15), so the guard changes nothing on today's green paths.

**Regression tests** (extend `testing-integration/src/__tests__/IntegrationTestDriver.test.ts`,
which already mocks the bootstrap seams): server-transport bundle + a mocked Network-type global
provider → `Error` result whose message names the rebinding mechanism; Database-type provider →
runs normally.

### WI3 — Stop laundering harness/run failures as `model-noncompliance:` *(commit 1)*

**Files**:
- `_it-live-agent-harness.ts` (`runWithCompliance`)
- `agent-memory-guards.checks.ts` (`withBoundedRetry` / `assertP` usage)

**The two harness seams are NOT symmetric (verified — C5.3 PARTIAL). Apply the fix per-seam:**

- **`runWithCompliance`** (`_it-live-agent-harness.ts`, used by IT56/IT57): `scenario()` returns
  `Promise<string | undefined>`, so `runId === undefined` cleanly distinguishes *no run landed*
  from *landed-but-noncompliant*. **This is where the laundering actually happens** (C4.1) and
  where the fix belongs. Distinguish:
  1. **Run never landed** (`runId === undefined`) → fail immediately (no ≤3 retry), prefixed
     `agent-run-failed:`. **Caveat (C5.3):** `scenario()` returns only `string | undefined`, so
     the run's actual `ErrorMessage` is **not** available at this seam. Either (a) drop the
     "surface the run's ErrorMessage" requirement and emit a generic
     `agent-run-failed: <label> — the agent run never landed (no run id); this is an execution
     failure, not model variance`, **or** (b) widen `scenario`'s return contract to
     `Promise<{ runId?: string; error?: string }>` to carry the error. Prefer (a) — it is the
     smaller change and the run's error is already discoverable from the persisted run row.
  2. **Run landed, model didn't take the instructed action** → keep the bounded ≤3 retry +
     `model-noncompliance:`.
  3. **Run landed, framework assertion failed** → unchanged (phase-A, never retried).
- **`withBoundedRetry` / `assertP`** (`agent-memory-guards.checks.ts`, IT61): its `fn` returns
  `void` and surfaces no `runId`, and a *missing run* there **already hard-fails** — `runWriter`
  throws a plain `Assert` that `withBoundedRetry` re-throws immediately (only `ModelNonCompliance`
  is retried). So **no reclassification is needed at the `withBoundedRetry` seam** for the
  missing-run case. If IT61's own diagnosis (§WI7) turns up an execution failure that IS being
  mislabeled, fix it **inside the `fn` body** (which holds `run.ID`) or via a distinct error type
  — **not** at the shared helper.

This also stops burning 3 live-model attempts (real tokens) on structurally doomed runs at the
`runWithCompliance` seam.

**Regression test**: unit-test `runWithCompliance` with a `scenario` stub returning `undefined` →
expect immediate `agent-run-failed:` (1 attempt, no retries); with a landed-but-noncompliant stub
→ expect 3 attempts then `model-noncompliance:`.

### WI4 — Truthful, tunable bounded-poll failure in `ai-verify.ts` *(commit 2)*

**File**: `packages/TestingFramework/testing-integration/src/ai-verify.ts` (`fetchById`)

**Change**:
- Message rewrite (the writes *did* land in the release build — 42 + 186 rows — the poll just
  closed first):
  `` `${entity} ${id} not found within ${elapsedMs}ms bounded poll — the fire-and-forget write may still be in flight on a loaded box; raise MJ_IT_FETCH_POLL_MS (and consider AGENT_LIVE_SETTLE_MS for the pre-poll settle)` ``
- Make the budget env-tunable: total poll budget from `MJ_IT_FETCH_POLL_MS` (default 12000,
  parsed once, `Number` + fallback on NaN), 500 ms interval retained.

**Regression test**: extend the package's vitest coverage: with a mocked always-empty `RunView`,
assert the thrown message contains the elapsed bound and the knob name; assert
`MJ_IT_FETCH_POLL_MS` shortens the loop.

### WI5 — Delete the stale "CLIENT-TRANSPORT / over the wire" docblocks *(commit 3, docs-only)*

The comments that misled the investigation. Rewrite the headers of:
- `agent-live-shared.ts` (claims "agents run over the GraphQL wire (GraphQLAIClient → live
  MJAPI)"; `makeAIClient` is server-in-process per Q8)
- `agent-loop-live.checks.ts` (same "CLIENT-TRANSPORT … GraphQL wire" claim)
- `_it-live-agent-harness.ts` (claims "TRANSPORT: CLIENT-FIRST … `resolveClient` returns
  undefined [under a non-GraphQL provider]" — it never returns undefined anymore)
- rename-in-place candidates: `runAgentOverWire` / `runAgentClient` docstrings ("over the wire",
  "Errors are captured, never thrown" — `AgentRunner.RunAgent` rethrows). Keep the function
  names (call-site churn not worth it) but make the docs tell the truth: server-in-process,
  contextUser required, errors can propagate.

State in each header: transport = server-in-process (Q8), contextUser threading is load-bearing,
and the wire path is IT63's dedicated bundle.

### WI6 — Correct the triage docs *(commit 3, docs-only)*

**Files**: `DEPLOYMENT.md` §4.6; `packages/TestingFramework/integration-test-suite/docs/build-engineering-runbook.md`
(+ `agents-suite.md` if it repeats the transport claim).

- §4.6 single-bundle re-run guidance: state the equivalence contract explicitly — *single-bundle
  `mj test run` is equivalent to the in-suite run for every bundle with a declared transport;
  the driver now fails loudly (`Error`, harness-attributed) if the resolved provider doesn't
  match the declared transport.* Remove/replace the implicit assumption that a red single-bundle
  re-run proves a product defect; add "`agent-run-failed:` = execution failure (harness or
  product — read the message), `model-noncompliance:` = accepted variance".
- Runbook: add the v5.49.0 post-mortem pointer to this plan + the corrected mechanism, so the
  next build engineer doesn't re-chase the wire theory.

### WI7 — IT60 / IT61 investigation *(in scope, evidence-first)*

Both thread `ctx.User` correctly, so their run-4 failures have a different cause. Do **not**
speculate-fix; collect evidence first:

1. **Pull the persisted oracle messages** from the release scratch DB (`MJ_Release_v549`) — they
   were saved verbatim by the driver:
   ```sql
   SELECT tr.__mj_CreatedAt, t.Name, tr.Status, tr.ResultDetails
   FROM __mj.TestRun tr JOIN __mj.Test t ON t.ID = tr.TestID
   WHERE t.Name LIKE 'IT60%' OR t.Name LIKE 'IT61%'
   ORDER BY tr.__mj_CreatedAt DESC;
   ```
   `ResultDetails` is the bare `OracleResult[]` — the per-check `message` fields classify the
   failure instantly.
2. **Code-level candidates to check against those messages**:
   - IT60 CE2: post-turn compaction is fire-and-forget *plus* a real summary LLM call; the check
     polls `AGENT_COMPACTION_POLL` (12) × 2.5 s ≈ 30 s. On the documented one-box release setup
     that window may close first (same class as the `ai-verify` poll) → fix would be a bigger
     default/env knob, not product code. Also verify the seeded "Conversation Summary" prompt
     has an active binding in the release DB (the check's own hint).
   - IT61 MG1–MG5: read the message shape first — the three cases are now distinct:
     (a) `'RunAgent returned no agentRun for IT: Memory Writer'` = a hard execution failure (the
     run never landed) surfaced by `runWriter`'s `Assert`, NOT laundered; investigate the run
     itself. (b) `model-noncompliance:` with plausible dispositions missing = genuine phase-P
     variance (the model didn't emit the instructed writes). (c) dispositions exist but assert
     wrong (e.g. cap ≠ 5) = a real `MemoryWriteManager` finding → file a separate product issue.
     Note IT61 already threads `ctx.User`, so case (a) here is a *different* execution fault than
     the contextUser defect — read the run's `ErrorMessage`.
3. **Decision**: harness-timing cause → fix inside this PR (knobs/messages only); product-defect
   cause → separate issue with the DB evidence attached, out of this PR.

### WI8 — Verification (definition of done)

1. `npm run build` + `npm run test` in `testing-integration` and `integration-test-suite`
   (includes the new WI1–WI4 unit tests; `sibling-parity.test.ts` must stay green).
2. Deterministic tier headless: `RUN_MUTATION_TESTS=1 npm run test:integration` → 52/52
   (proves WI2's guard is inert on the correctly-ordered suite).
3. Live-environment verification (release-build-like box: scratch DB + seeded metadata + MJAPI
   + live keys):
   - `MJ_INTEGRATION_TEST=1 npx mj test run "IT53 - Agent Loop Foundation (live)"` — the exact
     §4.6 command that produced the phantom — now behaves identically to in-suite.
   - `MJ_INTEGRATION_TEST=1 npx mj test suite "Integration Tests — Live Model"` — expect
     IT53–IT57 green (or honestly classified `model-noncompliance:` / `agent-run-failed:`), and
     zero `For server-side use of all engine classes` CRITICALs in the test-runner log.
   - Negative probe for WI2: temporarily resequence one server bundle after IT63 in a scratch
     suite → expect the loud transport-mismatch `Error`, then revert.
4. IT60/IT61: rerun after the fix; apply WI7's decision tree to whatever remains.

---

## 3. What is explicitly out of scope

- **Registry-declared transport** (each bundle declares its transport at registration; driver
  honors it; `CLIENT_BUNDLES` retired). Right long-term shape, but it moves the source of truth
  while the metadata `config.transport` + WI2 guard already close the failure class. Follow-up
  candidate — log as its own issue if wanted.
- **Making `mj test run` bootstrap the GraphQL client** (the issue's "preferred" fix). Not
  needed: single-bundle runs of declared-transport bundles are already equivalent once WI1
  lands, and `run.ts`'s client path already works for declared-client bundles (IT63 standalone
  boots the client via `buildCheckContext('client')`).
- **IT56/IT57 model-variance tuning** — genuinely out of scope per the issue, *after* WI3 stops
  misclassifying execution failures.
- The `[COST] $0.0000` display issue (already documented in DEPLOYMENT.md).

## 4. Commit plan

| # | Content | Type |
|---|---|---|
| 1 | WI1 + WI3: contextUser threading (required param, 11 call sites), loud no-user guard, retry-helper reclassification + their unit tests | behavior |
| 2 | WI2 + WI4: driver transport guard + ai-verify message/knob + their unit tests | behavior |
| 3 | WI5 + WI6: stale docblock rewrite + DEPLOYMENT.md §4.6 / runbook corrections | docs |
| 4 | (conditional, from WI7) IT60/IT61 harness-timing fixes, if the evidence says harness | behavior |

## 5. Risks

- **Live verification requires the release-build environment** (scratch DB, seeded metadata,
  MJAPI, live model keys) — not reproducible in a dev-only checkout. Mitigation: the mechanism is
  pinned by unit tests at the exact seams (`makeAIClient` threading, driver guard), and the live
  pass is a checklist item before closing #3251.
- **WI1 changes a shared harness signature** — compile-time enforced, so any missed call site is
  a build failure, not a runtime surprise.
- **WI2 could theoretically break a consumer suite** that (unlike ours) interleaves client and
  server bundles today. That configuration was already silently broken (server bundles were
  secretly running over the wire); the guard converts it to a loud, actionable error — the
  correct trade per "fail loudly instead of degrading silently".

## 6. Post-fix follow-ups (log, don't do here)

- Registry-declared transport / retire `CLIENT_BUNDLES` (§3).
- `SQLServerDataProvider.GetCurrentUser()` returning its own never-set property is a foot-gun
  worth a guard or doc note in MJCore — the same trap will bite the next in-process consumer.
- Consider a lint/unit sweep asserting **every** `AgentRunner.RunAgent` call inside the suite
  package passes an explicit `contextUser` (grep-based test, same spirit as
  `sibling-parity.test.ts`).

## 7. Appendix — draft corrective comment for #3251

> **Corrected root cause after code-trace (v5.49.0 state).** The failures are real and the §4.6
> triage pain is real, but the mechanism is different from what's written above:
>
> 1. The live-agent bundles run **in-process in the suite too** — the Live Model suite's only
>    client-transport member (IT63) is sequenced last, so nothing rebinds the provider before
>    IT53–IT62. Our own evidence #3 shows this: 216 `contextUser` CRITICALs in the *suite* run's
>    test-runner log. The 22 MJAPI hits were IT63's genuine wire runs, misattributed to IT53.
> 2. The actual defect: the Q8 server-in-process conversion (`799bb1d0b8`) left both shared
>    harnesses resolving `contextUser` from `provider.CurrentUser` — which is only populated on
>    a GraphQL client provider and is null on the CLI's `SQLServerDataProvider`. `BaseEngine.Load`
>    then throws (`baseEngine.ts:528`), the run dies in `initializeEngines`, and every oracle
>    fails — identically in `mj test run` and `mj test suite`. The bundles that pass
>    `contextUser: ctx.User` explicitly (IT17, IT58, IT59, IT62) are exactly the ones that
>    passed.
> 3. Consequence for "ruled out #5": IT56/IT57's `model-noncompliance:` failures were largely
>    this same defect laundered through `runWithCompliance` (a run that never landed retries as
>    "non-compliance" and terminates with `last runId=none`).
>
> The transport-inheritance fragility called out here is still real (the driver's server branch
> silently inherits `Metadata.Provider`; suite ordering is load-bearing) — it just wasn't the
> trigger. Fix plan: `plans/integration-test-expansion/fix-3251-live-agent-contextuser-and-transport-guard.md`
> — threads `ctx.User` through both harnesses (required param), adds a fail-loud provider/
> transport guard in the driver, stops laundering execution failures as model variance, fixes
> the misleading `ai-verify` poll message (+`MJ_IT_FETCH_POLL_MS`), and corrects the stale
> "CLIENT-TRANSPORT" docblocks + §4.6 triage guidance.
