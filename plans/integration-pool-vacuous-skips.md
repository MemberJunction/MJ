# Integration tier: catalog checks report green without executing

**Status:** Plan only — no code changes. Needs investigation and a decision on the fix.
**Owner:** @MS-BC
**Found:** 2026-08-05, while writing the `layered-base-views` bundle (PR #3419).

---

## The finding, in one line

**Every check in the `metadata-consistency` bundle skips and reports ✓ — in CI, on the SQL Server job.** Seven checks, zero assertions executed, and nothing on the results page distinguishes that from seven real passes.

## Evidence

From the `Integration (SQL Server, deterministic)` job on a **green** run ([run 30966245359](https://github.com/MemberJunction/MJ/actions/runs/30966245359)):

```
→ MC1 skipped: no mssql pool on this transport (PostgreSQL / client bootstrap)
[IntegrationTestDriver] ✓ metadata-consistency.MC1
→ MC2 skipped: no mssql pool on this transport (PostgreSQL / client bootstrap)
[IntegrationTestDriver] ✓ metadata-consistency.MC2
...
```

All seven implemented checks — **MC1–MC6 and MC8** — skip for want of `ctx.Pool` and report ✓. Note the skip message names *PostgreSQL / client bootstrap* while running on the **SQL Server** job, so the message itself is misleading about why.

Reproduced locally on the same path: `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`.

## What is actually not being checked

`metadata-consistency` is the tier's audit of MJ metadata against the **physical** database catalog. While it has been green, none of this has run:

| Check | What it would have caught |
|---|---|
| MC1 | An entity whose `BaseView` is missing from `sys.objects` |
| MC2 | An entity with `Allow*API` but no `spCreate`/`spUpdate`/`spDelete` |
| MC3 | A CHECK constraint's value list drifting from its `EntityFieldValue` rows |
| MC4 | A foreign key with no `IDX_AUTO_MJ_FKEY_*` index |
| MC5 | Field `Sequence` gaps/duplicates, or disagreement with base-view column order |
| MC6 | A physical core-schema field with no description |
| MC8 | `SchemaInfo` coverage + casing disagreement with the catalog |

MC1 and MC2 are the ones that sting: they are precisely the checks that catch **a migration applied without re-running CodeGen**, which is a live and recurring failure mode in this repo.

## Root cause (probable — needs confirmation)

`IntegrationTestDriver.buildCheckContext`, [`packages/TestingFramework/testing-integration/src/IntegrationTestDriver.ts`](../packages/TestingFramework/testing-integration/src/IntegrationTestDriver.ts):

```ts
let storage: InstrumentedLocalStorageProvider | null = getActiveIntegrationStorage();
const activeBootstrap = getActiveIntegrationBootstrap();
let pool: sql.ConnectionPool | undefined = activeBootstrap?.Pool;   // undefined when no bootstrap ran
...
if (!storage) {                       // ← recovery is gated on storage being ABSENT
    const ic = await bootstrapIntegrationServer();
    pool = ic.Pool;
    ...
}
```

The pool is only recovered inside `if (!storage)`. So when **storage is already installed** (the CLI installs the instrumented cache at startup) but **no bootstrap ran in-process**, `pool` stays `undefined` and the recovery never fires. The pool's availability is coupled to storage's *absence*, which is not the condition it should depend on.

That is the hypothesis to confirm first — it is consistent with both the CI log and the local repro, but it has not been proven by stepping through.

## Blast radius

Exactly two bundles read `ctx.Pool`:

- **`metadata-consistency`** — all 7 checks skip **silently** (returns early → pass). This is the bug.
- **`layered-base-views`** (IT69, added in #3419) — the 4 catalog checks skip but log `SKIPPED (no assertions ran)`, and its 2 most important checks were deliberately rewritten to run off metadata + `RunView` so they execute regardless.

No other bundle is affected today, but any future bundle needing raw SQL inherits the trap.

## The deeper issue

A check that cannot run should not be able to report the same result as a check that ran and passed. `metadata-consistency`'s `poolOrSkip` returns `null` and each check returns early — and a check that returns without throwing **is** a pass, by the harness contract.

This is not unique to one bundle; it is a gap in the contract. Worth deciding whether the framework should support a first-class **skipped** outcome distinct from **passed**, so a skip is visible in `MJ: Test Runs` and in CI output rather than indistinguishable from success.

## Suggested approach (not prescriptive)

1. **Confirm the root cause.** Instrument `buildCheckContext` on the CI path and verify `storage` is non-null while `activeBootstrap` is null.
2. **Fix pool resolution.** Most likely: resolve the pool independently of the storage check, so a server-transport bundle always gets one on a SQL Server provider. Take care not to open a second pool when a bootstrap already owns one, and not to regress the client-transport path (where `Pool: undefined` is correct).
3. **Re-run and expect red.** These checks have not executed against a real catalog in some time. Assume MC1–MC6/MC8 surface genuine drift on first real run, and budget for that rather than treating a red as the fix being wrong.
4. **Make a skip impossible to mistake for a pass.** Either a first-class skipped outcome in the harness, or — as a stopgap — have server-transport bundles assert loudly when the pool is missing on a non-PostgreSQL provider (the approach `layered-base-views` took):
   ```ts
   const providerName = ctx.Provider?.constructor?.name ?? 'unknown';
   Assert(providerName.toLowerCase().includes('postgres'),
       `no mssql pool but provider is '${providerName}' — refusing to skip-as-pass`);
   ```
5. **Fix the skip message.** It currently says *"PostgreSQL / client bootstrap"* on the SQL Server job, which actively misleads anyone reading the log.

## Out of scope

Fixing whatever drift MC1–MC6/MC8 find once they actually run. That should be triaged separately — the point of this work is to make the checks *capable of failing*.

## References

- Discovered in PR #3419 ([comment](https://github.com/MemberJunction/MJ/pull/3419#issuecomment-5186559948))
- Bundle: [`packages/TestingFramework/integration-test-suite/src/checks/metadata-consistency.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/metadata-consistency.checks.ts) (`poolOrSkip`)
- Driver: [`packages/TestingFramework/testing-integration/src/IntegrationTestDriver.ts`](../packages/TestingFramework/testing-integration/src/IntegrationTestDriver.ts) (`buildCheckContext`)
- Tier docs: [`guides/INTEGRATION_TESTING_QUICKSTART.md`](../guides/INTEGRATION_TESTING_QUICKSTART.md)
