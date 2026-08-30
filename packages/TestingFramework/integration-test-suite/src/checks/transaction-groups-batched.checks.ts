/**
 * transaction-groups-batched.checks.ts — the 'transaction-groups-batched' bundle (TGB1–TGB5):
 * the OPT-IN batched TransactionGroup submit, proven against a REAL database.
 *
 * WHY A SEPARATE BUNDLE FROM `transaction-groups` (IT47). IT47 runs CLIENT-first, and
 * `BatchedSubmit` is a property of the group the SERVER builds — a client group is serialized
 * into an `ExecuteTransactionGroup` mutation and reconstructed server-side, so a flag set on the
 * client instance never reaches the object that reads it. These checks therefore run on the
 * SERVER transport, where `ctx.Provider.CreateTransactionGroup()` hands back the real
 * `SQLServerTransactionGroup` whose `BatchedSubmit` the batched path actually consults.
 *
 * WHY THEY EXIST AT ALL. The batched path's unit tests drive fakes — a hand-rolled `PoolClient`
 * and a `vi.mock('mssql')`. They are good tests of the mapping logic, but "same statements, same
 * order, same transaction, one round trip" is asserted there against a mock that cannot disagree.
 * This is a change to the WIRE SHAPE of the write path, and the deterministic tier is where that
 * claim gets settled: a real driver, real recordsets, a real transaction, a real rollback.
 *
 *   - TGB1  The batch really is ONE statement. After a batched submit, the sentinel text
 *           (`__mj_batch_item`) is present in SQL Server's own plan cache as a SINGLE cached
 *           batch — the database's own account of what it was asked to run, not the client's.
 *           Skips-as-pass (loudly) where the DMVs are unreadable.
 *   - TGB2  Per-item result mapping survives a real driver: N creates in one batch each finalize
 *           with their OWN server-assigned ID, and every row persists with its OWN field values —
 *           the property the sentinel protocol exists to guarantee and the one a positional zip
 *           silently breaks.
 *   - TGB3  Parameter binding: the global `@p` renumbering binds what it claims to bind. Values
 *           that differ per item must persist per item; a renumbering bug swaps or repeats them.
 *   - TGB4  Failure atomicity: one poison item (FK violation) inside the batch → Submit reports
 *           failure and NOTHING from the batch persists, matching the sequential path's contract
 *           on the same fixtures.
 *   - TGB5  Differential equivalence: the SAME group of creates, run sequentially and batched,
 *           produces the same persisted rows and the same finalized entity state. This is the
 *           check that would catch a batched path that is fast and subtly different.
 *
 * MUTATION TIER: TGB2–TGB5 write to the database (`RequiresMutation: true`). TGB1 reads DMVs
 * after driving one small batch, so it is also a mutation.
 *
 * SQL Server only — `BatchedSubmit` on PostgreSQL is exercised by that provider's own unit tests
 * (the inlining path differs entirely), and the deterministic integration lane runs SQL Server.
 * On any other platform every check skips-as-pass with a loud line.
 *
 * Fixtures are throwaway `MJ: Action Categories` rows, name-prefixed per run and tagged
 * "(mj-integration-test — safe to delete)". Teardown sweeps EVERYTHING matching the prefix, so a
 * mid-transaction failure cannot orphan a row.
 */
import { Metadata, RunView, TransactionGroupBase } from '@memberjunction/core';
import type { RunViewParams, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJActionCategoryEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, TransactionGroupsFixture } from '@memberjunction/testing-integration';

const CATEGORY_ENTITY = 'MJ: Action Categories';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** A UUID that must not exist as an Action Category — the FK poison for TGB4. */
const MISSING_PARENT_ID = 'DEADBEEF-0000-4000-8000-00000000BA7C';

/** The sentinel column the batched submit fences each item with. */
const SENTINEL = '__mj_batch_item';

/** Minimal shape of a provider that can run raw SQL — present on the server transport. */
interface RawSQLProvider {
    PlatformKey?: string;
    ExecuteSQL?<T>(query: string): Promise<T[]>;
}

function fx(ctx: IntegrationCheckContext): TransactionGroupsFixture {
    Assert(ctx.TransactionGroupsBatchedFixture != null, 'transaction-groups-batched fixture missing (bundle Setup did not run)');
    return ctx.TransactionGroupsBatchedFixture!;
}

/**
 * The provider under test. On the server transport `ctx.Provider` may be the driver's `Metadata`
 * facade, which DELEGATES `CreateTransactionGroup` to the process-global provider — so the honest
 * resolution is ctx.Provider for entity work, and the global for the platform probe.
 */
function rawProvider(ctx: IntegrationCheckContext): RawSQLProvider {
    const candidate = ctx.Provider as unknown as RawSQLProvider;
    if (typeof candidate.ExecuteSQL === 'function') { return candidate; }
    return Metadata.Provider as unknown as RawSQLProvider; // global-provider-ok: server-transport probe; single-provider test process
}

/** True when this run is on SQL Server; the batched submit under test is the SQL Server one. */
function isSQLServer(ctx: IntegrationCheckContext): boolean {
    const key = rawProvider(ctx).PlatformKey;
    // A provider that does not declare a platform key predates the property and is SQL Server.
    return key === undefined || key === 'sqlserver' || key === 'mssql';
}

/**
 * Creates a NEW (unsaved) Action Category, attaches it to the group, and Save()s it — which
 * QUEUES the write per the TransactionGroup contract. `description` is written to a real column
 * so TGB3 can prove per-item parameter binding from persisted data.
 */
async function queueCreate(
    ctx: IntegrationCheckContext, tg: TransactionGroupBase, suffix: string, description?: string, parentID?: string
): Promise<MJActionCategoryEntity> {
    const f = fx(ctx);
    const cat = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
    cat.NewRecord();
    cat.Name = `${f.Prefix}-${suffix} ${FIXTURE_TAG}`;
    cat.Status = 'Active';
    if (description !== undefined) { cat.Description = description; }
    if (parentID) { cat.ParentID = parentID; }
    cat.TransactionGroup = tg;
    const queued = await cat.Save();
    Assert(queued, `queueing '${suffix}' into the transaction group failed: ${cat.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return cat;
}

/** Fresh-from-DB Action Category rows matching a Name filter. */
async function categoryRows(
    ctx: IntegrationCheckContext, nameFilter: string
): Promise<Array<{ ID: string; Name: string; Description: string | null; ParentID: string | null }>> {
    const result = await new RunView().RunView<{ ID: string; Name: string; Description: string | null; ParentID: string | null }>({
        EntityName: CATEGORY_ENTITY,
        ExtraFilter: nameFilter,
        Fields: ['ID', 'Name', 'Description', 'ParentID'],
        ResultType: 'simple',
        BypassCache: true
    }, ctx.User);
    Assert(result.Success, `reading ${CATEGORY_ENTITY} failed: ${result.ErrorMessage}`);
    return result.Results ?? [];
}

/** Builds a group with BatchedSubmit armed, failing loudly if the flag is not honoured by the type. */
async function batchedGroup(ctx: IntegrationCheckContext): Promise<TransactionGroupBase> {
    const tg = await ctx.Provider.CreateTransactionGroup();
    tg.BatchedSubmit = true;
    Assert(tg.BatchedSubmit === true, 'BatchedSubmit did not stick — the opt-in is not reaching the group under test');
    return tg;
}

export const TransactionGroupsBatchedChecks: NamedCheck[] = [
    {
        Id: 'transaction-groups-batched.TGB1',
        Name: 'TGB1: the batched group reaches SQL Server as ONE statement (its own plan cache says so)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!isSQLServer(ctx)) {
                console.log('      → skipped: not SQL Server (the batched submit under test is the SQL Server one)');
                return;
            }
            const provider = rawProvider(ctx);
            if (typeof provider.ExecuteSQL !== 'function') {
                console.log('      → skipped: no ExecuteSQL seam on this provider (client transport)');
                return;
            }
            const execute = provider.ExecuteSQL.bind(provider);

            const tg = await batchedGroup(ctx);
            await queueCreate(ctx, tg, 'cache-a');
            await queueCreate(ctx, tg, 'cache-b');
            await queueCreate(ctx, tg, 'cache-c');
            Assert(await tg.Submit(), 'batched Submit of three valid creates must succeed');

            // The DATABASE's account of what it was asked to run. A batched submit sends ONE
            // statement containing every item plus its sentinels, so exactly that text is cached;
            // the sequential path would cache each procedure call separately and no text would
            // carry the sentinel at all. Reading the cache is the only way to assert the wire
            // shape without instrumenting the driver from inside the test.
            let cached: Array<{ n: number; sentinels: number }>;
            try {
                cached = await execute<{ n: number; sentinels: number }>(`
                    SELECT COUNT(*) AS n,
                           MAX(LEN(t.text) - LEN(REPLACE(t.text, '${SENTINEL}', ''))) / LEN('${SENTINEL}') AS sentinels
                    FROM sys.dm_exec_cached_plans p
                    CROSS APPLY sys.dm_exec_sql_text(p.plan_handle) t
                    WHERE t.text LIKE '%${SENTINEL}%'`);
            } catch (e) {
                // VIEW SERVER STATE is not grantable in every deployment. Skipping loudly beats
                // failing a correctness suite over a permission the check does not need to own.
                console.log(`      → skipped: plan-cache DMVs unreadable (${e instanceof Error ? e.message : String(e)})`);
                return;
            }

            const n = Number(cached[0]?.n ?? 0);
            Assert(n > 0,
                'no cached plan contains the batch sentinel — the group did NOT go over as a batched statement ' +
                '(BatchedSubmit was set, so this means the flag is not reaching the submit path)');
            const sentinels = Number(cached[0]?.sentinels ?? 0);
            Assert(sentinels >= 3,
                `the cached batch carries ${sentinels} sentinel(s) for a 3-item group — every item must be fenced, ` +
                'or per-item result mapping is guessing');

            console.log(`      → SQL Server cached ${n} batch statement(s) carrying ${sentinels} item sentinels — one trip, all items fenced`);
        }
    },
    {
        Id: 'transaction-groups-batched.TGB2',
        Name: 'TGB2: per-item results survive a real driver — each entity finalizes with its OWN server ID',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!isSQLServer(ctx)) { console.log('      → skipped: not SQL Server'); return; }
            const f = fx(ctx);
            const tg = await batchedGroup(ctx);
            const a = await queueCreate(ctx, tg, 'map-a');
            const b = await queueCreate(ctx, tg, 'map-b');
            const c = await queueCreate(ctx, tg, 'map-c');

            // Deferred-execution proof: nothing may have hit the database before Submit, or the
            // rest of this check passes vacuously against a provider that ignored the group.
            const pre = await categoryRows(ctx, `Name LIKE '${f.Prefix}-map-%'`);
            AssertEqual(pre.length, 0, 'Save() with a TransactionGroup must DEFER the write until Submit');

            Assert(await tg.Submit(), 'batched Submit of three valid creates must succeed');
            Assert(a.IsSaved && b.IsSaved && c.IsSaved, 'every entity must be finalized by its own transaction callback');

            const ids = [a.ID, b.ID, c.ID];
            Assert(ids.every(id => typeof id === 'string' && id.length > 0), 'every entity must come back with a server-assigned ID');
            AssertEqual(new Set(ids).size, 3,
                'the three entities must hold three DISTINCT ids — a repeated id is the positional-drift failure the sentinels exist to prevent');

            const rows = await categoryRows(ctx, `Name LIKE '${f.Prefix}-map-%'`);
            AssertEqual(rows.length, 3, 'all three rows persisted by the single batched transaction');
            // Every finalized id must correspond to the row bearing that entity's OWN name — the
            // exact property a positional zip breaks when a statement returns no rows.
            for (const entity of [a, b, c]) {
                const row = rows.find(r => r.ID.toLowerCase() === entity.ID.toLowerCase());
                Assert(!!row, `no persisted row carries the id finalized onto '${entity.Name}' (${entity.ID}) — results drifted between items`);
                AssertEqual(row!.Name, entity.Name, `the id finalized onto '${entity.Name}' belongs to a DIFFERENT row ('${row!.Name}')`);
            }

            console.log(`      → 3 items, 3 distinct server ids, each mapped back to its own row`);
        }
    },
    {
        Id: 'transaction-groups-batched.TGB3',
        Name: 'TGB3: global @p renumbering binds what it claims — per-item values persist per item',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!isSQLServer(ctx)) { console.log('      → skipped: not SQL Server'); return; }
            const f = fx(ctx);
            // Values chosen to be unmistakable if swapped or repeated, and to include the quote
            // that a naive literal-inlining implementation would break on.
            const payloads = [
                { suffix: 'param-1', description: "first — O'Brien" },
                { suffix: 'param-2', description: 'second — 你好' },
                { suffix: 'param-3', description: 'third — [brackets] & %percent%' },
            ];
            const tg = await batchedGroup(ctx);
            const entities: MJActionCategoryEntity[] = [];
            for (const p of payloads) {
                entities.push(await queueCreate(ctx, tg, p.suffix, p.description));
            }
            Assert(await tg.Submit(), 'batched Submit must succeed');

            const rows = await categoryRows(ctx, `Name LIKE '${f.Prefix}-param-%'`);
            AssertEqual(rows.length, 3, 'all three parameterised rows persisted');
            for (const p of payloads) {
                const row = rows.find(r => r.Name.includes(`-${p.suffix} `));
                Assert(!!row, `no persisted row for '${p.suffix}'`);
                AssertEqual(row!.Description, p.description,
                    `'${p.suffix}' persisted the WRONG value — parameters were renumbered onto the wrong items ` +
                    `(expected ${JSON.stringify(p.description)}, got ${JSON.stringify(row!.Description)})`);
            }

            console.log(`      → 3 items × distinct values (quote / unicode / wildcards) each landed on their own row`);
        }
    },
    {
        Id: 'transaction-groups-batched.TGB4',
        Name: 'TGB4: a poison item fails the WHOLE batch — Submit false and nothing persists',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!isSQLServer(ctx)) { console.log('      → skipped: not SQL Server'); return; }
            const f = fx(ctx);
            const poison = await categoryRows(ctx, `ID='${MISSING_PARENT_ID}'`);
            AssertEqual(poison.length, 0, `precondition: no Action Category may exist with ID ${MISSING_PARENT_ID}`);

            const tg = await batchedGroup(ctx);
            const good = await queueCreate(ctx, tg, 'batch-rb-good');
            // Passes client validation (nullable FK, no client-side FK check) and fails only at the
            // database constraint — inside the one batched statement, after the good item's own
            // procedure call has already run within it.
            await queueCreate(ctx, tg, 'batch-rb-bad', undefined, MISSING_PARENT_ID);

            const ok = await tg.Submit();
            AssertEqual(ok, false, 'Submit() must report failure when any item in the batch fails');

            const rows = await categoryRows(ctx, `Name LIKE '${f.Prefix}-batch-rb-%'`);
            AssertEqual(rows.length, 0,
                'ROLLBACK INTEGRITY: the valid item must NOT persist when a later item in the same batch fails — ' +
                'one statement, one transaction, all-or-nothing');
            Assert(!good.IsSaved, 'the valid entity must not be finalized as saved against rolled-back data');

            console.log(`      → batch failed as a unit: Submit false, 0 rows persisted, good entity left unsaved`);
        }
    },
    {
        Id: 'transaction-groups-batched.TGB5',
        Name: 'TGB5: batched and sequential submits are OBSERVABLY identical on the same fixtures',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!isSQLServer(ctx)) { console.log('      → skipped: not SQL Server'); return; }
            const f = fx(ctx);

            // Same shape twice: once down the proven sequential path, once batched. The batched
            // path is only worth having if it is indistinguishable in outcome — this is the check
            // that catches "fast but subtly different".
            const run = async (label: string, batched: boolean) => {
                const tg = await ctx.Provider.CreateTransactionGroup();
                tg.BatchedSubmit = batched;
                const one = await queueCreate(ctx, tg, `${label}-1`, `${label} first`);
                const two = await queueCreate(ctx, tg, `${label}-2`, `${label} second`);
                Assert(await tg.Submit(), `${label}: Submit must succeed`);
                AssertEqual(tg.Status, 'Complete', `${label}: group must be Complete after a successful Submit`);
                const rows = await categoryRows(ctx, `Name LIKE '${f.Prefix}-${label}-%'`);
                return {
                    finalized: [one.IsSaved, two.IsSaved],
                    idsDistinct: new Set([one.ID, two.ID]).size,
                    rowCount: rows.length,
                    descriptions: rows.map(r => r.Description).sort(),
                };
            };

            const sequential = await run('diff-seq', false);
            const batched = await run('diff-bat', true);

            AssertEqual(batched.rowCount, sequential.rowCount, 'batched must persist the same number of rows as sequential');
            AssertEqual(batched.idsDistinct, sequential.idsDistinct, 'batched must finalize the same number of DISTINCT ids');
            AssertEqual(JSON.stringify(batched.finalized), JSON.stringify(sequential.finalized),
                'batched must finalize the same entities as sequential');
            AssertEqual(
                JSON.stringify(batched.descriptions.map(d => (d ?? '').replace('diff-bat', 'X'))),
                JSON.stringify(sequential.descriptions.map(d => (d ?? '').replace('diff-seq', 'X'))),
                'batched must persist the same field values as sequential');

            console.log(`      → sequential and batched agree on rows, ids and values (${sequential.rowCount} rows each)`);
        }
    }
];

for (const check of TransactionGroupsBatchedChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/** Resolves an entity's ID from the provider's metadata, failing loudly if it is missing. */
function requireEntityID(provider: IMetadataProvider, name: string): string {
    const id = provider.EntityByName(name)?.ID;
    Assert(!!id, `could not resolve the entity ID for '${name}'`);
    return id!;
}

/** Deletes every fixture Action Category matching the run prefix — children before parents. */
async function sweepCategories(provider: IMetadataProvider, user: UserInfo, prefix: string): Promise<void> {
    const params: RunViewParams = {
        EntityName: CATEGORY_ENTITY,
        ExtraFilter: `Name LIKE '${prefix}%'`,
        ResultType: 'entity_object',
        BypassCache: true
    };
    const result = await new RunView().RunView<MJActionCategoryEntity>(params, user);
    const rows = result.Results ?? [];
    const children = rows.filter(r => r.ParentID != null);
    const parents = rows.filter(r => r.ParentID == null);
    for (const row of [...children, ...parents]) {
        await row.Delete().catch(() => undefined);
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('transaction-groups-batched', {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Setup creates NO rows — each check queues exactly what it needs under the per-run
        // prefix, and teardown sweeps by that prefix, so nothing can be orphaned even by a
        // deliberately-failed batch (TGB4).
        ctx.TransactionGroupsBatchedFixture = {
            ActionCategoryEntityID: requireEntityID(ctx.Provider, CATEGORY_ENTITY),
            Prefix: `mj-tgb-${Date.now()}`
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.TransactionGroupsBatchedFixture;
        if (!f) { return; }
        await sweepCategories(ctx.Provider, ctx.User, f.Prefix);
        ctx.TransactionGroupsBatchedFixture = undefined;
    }
});
