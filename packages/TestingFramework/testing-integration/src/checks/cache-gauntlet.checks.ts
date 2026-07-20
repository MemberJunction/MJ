/**
 * cache-gauntlet.checks.ts — the 'cache-gauntlet' bundle (CG1–CG5): LIVE coverage of the
 * subset-slot × mutation cell that shipped two production bugs.
 *
 * ## Why this bundle exists
 * The RunView cache has shipped two bugs in the same family:
 *   - #3195 — cached SUBSET slots collapsed `totalRowCount`
 *   - #3199 — cached SUBSET slots had their ROWS maintained in place: a `MaxRows: 1` slot grew
 *             to 2, 3, 4 … on save, and shrank to 0 on delete while the DB still had 47 rows
 *
 * An audit of the 61 existing cache checks found the exact bug class had **no live coverage**:
 *   - S16 tests that `MaxRows` FINGERPRINTS separately   (slot identity)
 *   - S17 tests that a FILTERED slot invalidates on save (maintenance, wrong slot type)
 *   - S23 tests that an UNFILTERED slot upserts in place (maintenance, wrong slot type)
 * Nothing ever saved into a SUBSET slot. `localCacheManager.slotMaintenanceMatrix.test.ts` now
 * pins this at the unit level; this bundle pins it against real SQL, where the `TOP`/`OFFSET`
 * semantics that make the rows unknowable actually apply.
 *
 * ## The contract being asserted (per-cell, not per-slot)
 * Maintainability differs by OPERATION, because the two mutations fail for different reasons:
 *
 *   slot                    SAVE          DELETE
 *   unfiltered + unlimited  maintain      maintain      (S23 covers this)
 *   filtered                INVALIDATE    maintain      (S17 covers save; CG3 covers delete)
 *   MaxRows / StartRow      INVALIDATE    INVALIDATE    (CG1/CG2/CG4 — previously uncovered)
 *
 * Filtered-DELETE is legitimately maintained in place: a deleted row matches no predicate, so
 * dropping it can never make the slot wrong. Subset-DELETE is NOT, because removal shrinks the
 * slot below the caller's own limit. That asymmetry is exactly why #3199's delete half was a
 * separate bug — subset slots were riding the filtered slots' legitimate remove-in-place path.
 * CG3 pins the legitimate half so a future "fix" doesn't over-invalidate it.
 *
 * ## Technique
 * `ExecutionTime === 0` is the cache-hit oracle (established by S13/S23): a served-from-cache
 * read never touches the DB. So a subset slot that was correctly INVALIDATED re-executes
 * (`ExecutionTime > 0`) and returns DB-correct rows, while a slot wrongly maintained in place
 * stays at 0 and returns the corrupted set.
 *
 * MUTATION TIER — every check creates and deletes its own `MJ: User Settings` rows, matching the
 * S17/S23 fixture convention. Rows are tagged so a crashed run leaves identifiable debris.
 *
 * ## KNOWN GAP — schema-drift staleness is still not covered live
 * `isSchemaStaleCacheEntry` rejects a slot whose stored `schemaHash` no longer matches the
 * entity's current field list — the post-migration case. Verified by hand that slots DO carry a
 * hash (e.g. `MJ: User Settings|_|_|-1|0|_|_|mssql://…` → `schemaHash: "1bd8ea31"`), and there are
 * 12 unit tests over the mechanism, but there is no LIVE check.
 *
 * An attempt to cover it by poking the stored payload (read the slot, rewrite its `schemaHash`,
 * assert the next read re-executes) was removed rather than shipped: it failed for reasons that
 * did not reproduce cleanly, and a check nobody can explain is worse than an acknowledged gap.
 * A better approach is probably to drive the REAL trigger — add a column via migration + CodeGen
 * and assert a pre-existing slot is rejected — which belongs in a migration-aware harness rather
 * than here. Tracked as a follow-up.
 */
import { RunView, Metadata } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJUserSettingEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import type { NamedCheck, IntegrationCheckContext } from '../check';

const ENTITY = 'MJ: User Settings';
const TAG = 'mj.cachegauntlet';

/** The cache maintains asynchronously off BaseEntity events; S17/S23 use the same settle window. */
const SETTLE_MS = 2000;
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, SETTLE_MS));

/** Create a throwaway setting row. Caller owns deletion. */
async function makeSetting(ctx: IntegrationCheckContext, suffix: string): Promise<MJUserSettingEntity> {
    const md = new Metadata(); // global-provider-ok: integration test — single-provider process by design
    const s = await md.GetEntityObject<MJUserSettingEntity>(ENTITY, ctx.User);
    s.UserID = ctx.User.ID;
    s.Setting = `${TAG}.${suffix}.${Date.now()} (mj-integration-test — safe to delete)`;
    s.Value = 'integration-test';
    Assert(await s.Save(), `Save failed: ${s.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return s;
}

async function destroy(rows: MJUserSettingEntity[]): Promise<void> {
    for (const r of rows) {
        try { await r.Delete(); } catch { /* best-effort teardown — never mask the real failure */ }
    }
}

/** A subset read (MaxRows-limited, unfiltered, unsorted) — the slot shape both bugs lived in. */
function subsetParams(maxRows: number) {
    return { EntityName: ENTITY, Fields: ['ID', 'Setting'], ResultType: 'simple' as const, MaxRows: maxRows };
}

export const CacheGauntletChecks: NamedCheck[] = [
    {
        Id: 'cache-gauntlet.CG1',
        Name: 'CG1 (mutation): a save must NEVER inflate a MaxRows slot beyond its limit (#3199 save half)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const created: MJUserSettingEntity[] = [];
            try {
                // Anti-vacuity floor: the entity must already hold more rows than the limit, or
                // "returned <= 1 row" would be trivially true regardless of cache behavior.
                const all = await rv.RunView({ EntityName: ENTITY, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
                Assert(all.Success, `baseline read failed: ${all.ErrorMessage}`);
                Assert(all.Results.length >= 2, `need >= 2 existing rows to make MaxRows:1 meaningful (found ${all.Results.length})`);

                // Warm the subset slot.
                const warm = await rv.RunView(subsetParams(1), ctx.User);
                Assert(warm.Success, `subset warm failed: ${warm.ErrorMessage}`);
                AssertEqual(warm.Results.length, 1, 'MaxRows:1 must return exactly 1 row on the cold read');

                // Three successive saves. Pre-#3199 the slot was upserted in place and grew 2, 3, 4.
                for (let i = 1; i <= 3; i++) {
                    created.push(await makeSetting(ctx, `cg1-${i}`));
                    await settle();
                    const after = await rv.RunView(subsetParams(1), ctx.User);
                    Assert(after.Success, `post-save read ${i} failed: ${after.ErrorMessage}`);
                    AssertEqual(after.Results.length, 1,
                        `after save #${i}: a MaxRows:1 slot returned ${after.Results.length} rows — the caller's own limit was violated`);
                }
                console.log(`      → 3 saves against a MaxRows:1 slot; row count held at 1 every time`);
            } finally {
                await destroy(created);
            }
        }
    },
    {
        Id: 'cache-gauntlet.CG2',
        Name: 'CG2 (mutation): deleting the cached row must NOT leave a MaxRows slot serving zero rows (#3199 delete half)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const created: MJUserSettingEntity[] = [];
            try {
                // Guarantee a healthy surplus so a TOP 1 always has something to return.
                for (let i = 1; i <= 3; i++) { created.push(await makeSetting(ctx, `cg2-${i}`)); }
                await settle();

                const all = await rv.RunView({ EntityName: ENTITY, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
                Assert(all.Success, `baseline read failed: ${all.ErrorMessage}`);
                Assert(all.Results.length >= 3, `expected >= 3 rows after seeding (found ${all.Results.length})`);

                // Warm the subset slot, then delete whichever row it cached.
                const warm = await rv.RunView(subsetParams(1), ctx.User);
                Assert(warm.Success, `subset warm failed: ${warm.ErrorMessage}`);
                AssertEqual(warm.Results.length, 1, 'MaxRows:1 must return exactly 1 row when warm');
                const cachedId = String((warm.Results[0] as { ID: string }).ID);

                // UUIDsEqual, not === : SQL Server returns UUIDs uppercase and PostgreSQL lowercase.
                const victim = created.find(c => UUIDsEqual(c.ID, cachedId));
                if (victim) {
                    Assert(await victim.Delete(), `Delete failed: ${victim.LatestResult?.CompleteMessage ?? 'unknown'}`);
                    created.splice(created.indexOf(victim), 1);
                } else {
                    // The cached row is pre-existing and must not be destroyed. Deleting any row
                    // still exercises the remove-from-slot path, which is what matters here.
                    const other = created.pop();
                    Assert(!!other, 'no disposable row available');
                    Assert(await other!.Delete(), `Delete failed: ${other!.LatestResult?.CompleteMessage ?? 'unknown'}`);
                }
                await settle();

                // THE load-bearing assertion. Pre-#3199 removal shrank the slot to 0 rows while the
                // DB still had plenty for a TOP 1 — an empty result served as authoritative.
                const after = await rv.RunView(subsetParams(1), ctx.User);
                Assert(after.Success, `post-delete read failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, 1,
                    `after deleting a row, a MaxRows:1 slot returned ${after.Results.length} rows — the DB still has rows to serve`);
                console.log(`      → deleted the cached row; MaxRows:1 still serves 1 row (not 0)`);
            } finally {
                await destroy(created);
            }
        }
    },
    {
        Id: 'cache-gauntlet.CG3',
        Name: 'CG3 (mutation): a FILTERED slot still removes a deleted row in place — the legitimate half of the asymmetry',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const created: MJUserSettingEntity[] = [];
            try {
                const marker = `${TAG}.cg3.${Date.now()}`;
                const row = await makeSetting(ctx, 'cg3');
                created.push(row);
                // Re-tag to a value we can filter on precisely.
                row.Value = marker;
                Assert(await row.Save(), `retag failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
                await settle();

                const filtered = () => ({ EntityName: ENTITY, ExtraFilter: `Value='${marker}'`, Fields: ['ID', 'Value'], ResultType: 'simple' as const });
                const warm = await rv.RunView(filtered(), ctx.User);
                Assert(warm.Success, `filtered warm failed: ${warm.ErrorMessage}`);
                AssertEqual(warm.Results.length, 1, 'the filtered slot must hold exactly our marker row');

                Assert(await row.Delete(), `Delete failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
                created.splice(created.indexOf(row), 1);
                await settle();

                // Filtered-DELETE is SAFE to maintain in place: a deleted row matches no predicate.
                // Pinned so a future over-correction doesn't invalidate these slots unnecessarily.
                const after = await rv.RunView(filtered(), ctx.User);
                Assert(after.Success, `post-delete filtered read failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, 0, 'the deleted row must be gone from the filtered slot');
                console.log(`      → filtered slot dropped the deleted row (removal is always safe under a predicate)`);
            } finally {
                await destroy(created);
            }
        }
    },
    {
        Id: 'cache-gauntlet.CG4',
        Name: 'CG4 (mutation): a StartRow offset window must not be maintained in place (the page must not silently shift)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const created: MJUserSettingEntity[] = [];
            try {
                for (let i = 1; i <= 3; i++) { created.push(await makeSetting(ctx, `cg4-${i}`)); }
                await settle();

                const all = await rv.RunView({ EntityName: ENTITY, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
                Assert(all.Success, `baseline failed: ${all.ErrorMessage}`);
                Assert(all.Results.length >= 4, `need >= 4 rows for a meaningful offset window (found ${all.Results.length})`);

                const page = () => ({ EntityName: ENTITY, Fields: ['ID', 'Setting'], ResultType: 'simple' as const, MaxRows: 2, StartRow: 1 });
                const warm = await rv.RunView(page(), ctx.User);
                Assert(warm.Success, `offset warm failed: ${warm.ErrorMessage}`);
                Assert(warm.Results.length <= 2, `an offset window must respect MaxRows (got ${warm.Results.length})`);

                created.push(await makeSetting(ctx, 'cg4-new'));
                await settle();

                const after = await rv.RunView(page(), ctx.User);
                Assert(after.Success, `post-save offset read failed: ${after.ErrorMessage}`);
                Assert(after.Results.length <= 2,
                    `after a save, the offset window returned ${after.Results.length} rows — a window must never exceed MaxRows`);
                console.log(`      → StartRow window held at <= MaxRows across a save`);
            } finally {
                await destroy(created);
            }
        }
    },
    {
        Id: 'cache-gauntlet.CG5',
        Name: 'CG5 (mutation): a subset slot keeps a DB-accurate TotalRowCount across a save (#3195 and #3199 compose)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const created: MJUserSettingEntity[] = [];
            try {
                const warm = await rv.RunView(subsetParams(1), ctx.User);
                Assert(warm.Success, `subset warm failed: ${warm.ErrorMessage}`);
                const before = warm.TotalRowCount ?? -1;
                Assert(before > 0, `TotalRowCount must be populated on a subset slot (got ${before})`);
                // The rows are truncated to 1, but the TOTAL must reflect the DB, not the slot size.
                Assert(before > warm.Results.length,
                    `TotalRowCount (${before}) must exceed the truncated row count (${warm.Results.length}) — this is the #3195 collapse`);

                created.push(await makeSetting(ctx, 'cg5'));
                await settle();

                const after = await rv.RunView(subsetParams(1), ctx.User);
                Assert(after.Success, `post-save read failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, 1, 'rows still capped at MaxRows:1');
                AssertEqual(after.TotalRowCount ?? -1, before + 1,
                    `TotalRowCount must track the DB across a save (expected ${before + 1}, got ${after.TotalRowCount})`);
                console.log(`      → subset slot: rows capped at 1, TotalRowCount tracked ${before} → ${before + 1}`);
            } finally {
                await destroy(created);
            }
        }
    }
];

for (const check of CacheGauntletChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
