/**
 * materialized-read.checks.ts — the 'materialized-read' bundle (MR1–MR2).
 *
 * Live-DB proof that a `RunQuery(DataSource:'Materialized')` read is genuinely served from the physical
 * SNAPSHOT rather than the live source — the coverage the reviewer's history argues for (the feature has been
 * reverted once, and its fall-back-to-live safety net means a broken materialization would be *invisible* to a
 * correctness-only test). We fabricate a snapshot table carrying a SENTINEL row that does NOT exist in the live
 * source, then:
 *   • MR1 (positive): a `Materialized` read returns the sentinel AND its RenderedSQL references the snapshot
 *     (`materialized_…` + the surrogate order key) — proving it read the snapshot, not merely correct rows.
 *   • MR2 (negative control): the SAME query read `Live` returns the sentinel NOWHERE and its RenderedSQL does
 *     not reference the snapshot — proving MR1's rows came from the snapshot, not the source.
 *
 * TRANSPORT: reads `RenderedSQL` (stripped by the GraphQL client's TransformQueryPayload), so — like
 * `runquery-features` — the checks run in-process against the bootstrapped server provider via `new RunQuery()`
 * + `ctx.User`.
 *
 * PROVISIONING: the deterministic CI lane runs NO CodeGen (which is what mints materializations), so the
 * snapshot is FABRICATED directly (raw `CREATE TABLE` + a sentinel `INSERT` via `ctx.Pool`) with its metadata
 * (`MJ: Materialized Results` + the `MJ: Materialized Result Queries` join) seeded through `Metadata`. This is
 * fully deterministic and, via the deliberately-divergent sentinel row, the strongest possible "came from the
 * snapshot" signal. SQL-Server only: the fabrication uses `ctx.Pool` (an mssql pool), so the bundle skips
 * (skip-as-pass) when no pool is present (PostgreSQL / client transport).
 *
 * FIXTURES: a self-contained Query Category + a template Query (`… WHERE Name = {{ marker }}`, so
 * MJQueryEntityServer auto-extracts the `marker` row-filter parameter) + its output QueryFields, a fabricated
 * snapshot table, and the MaterializedResult + join row — all created/torn-down through the bundle lifecycle.
 * The bundle mutates the DB by design (creates + deletes its own throwaway objects), so its checks are NOT
 * RequiresMutation-gated — they always run when the bundle is selected.
 */
import { randomUUID } from 'node:crypto';
import { RunQuery, RunView, Metadata, LogError } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import type {
    MJQueryCategoryEntity,
    MJQueryEntity,
    MJQueryFieldEntity,
    MJMaterializedResultEntity,
    MJMaterializedResultQueryEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Everything the bundle creates, held module-scoped so Teardown can clean up whatever Setup got to. */
interface MaterializedReadFixtures {
    Category: MJQueryCategoryEntity;
    Query: MJQueryEntity;
    MaterializedResult: MJMaterializedResultEntity;
    Link: MJMaterializedResultQueryEntity;
    Schema: string;
    /** The fabricated snapshot table/view name (materialized_…). */
    MatObject: string;
    /** The sentinel Name value present ONLY in the snapshot, never in the live source. */
    Sentinel: string;
    /** The sentinel row's ID (a random UUID that is not a real Entity ID). */
    SentinelID: string;
}

let fixtures: MaterializedReadFixtures | undefined;

function requireFixtures(): MaterializedReadFixtures {
    if (!fixtures) {
        throw new Error('materialized-read fixtures not initialized — the bundle lifecycle Setup must run before its checks.');
    }
    return fixtures;
}

/**
 * Fabricate the snapshot + seed its metadata. Skips (no fixtures set → checks skip-as-pass) when there is no
 * mssql pool (PostgreSQL / client transport), since the fabrication is raw T-SQL.
 */
export async function createMaterializedReadFixtures(ctx: IntegrationCheckContext): Promise<void> {
    if (!ctx.Pool) {
        console.log(`      → materialized-read SKIPPED (no assertions will run): no mssql pool on this run path — snapshot fabrication is T-SQL only`);
        return;
    }
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const schema = ctx.Schema ?? '__mj';
    const user = ctx.User;
    const stamp = Date.now();
    const matObject = `materialized_vwITMatRead_${stamp}`;
    const sentinel = `__IT_MAT_SENTINEL_${stamp}__`;
    const sentinelID = randomUUID();

    // 1) Category.
    const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', user);
    category.Name = `Integration Test Materialized Read ${stamp}`;
    category.UserID = user.ID;
    if (!await category.Save()) throw new Error(`Fixture category save failed: ${category.LatestResult?.CompleteMessage}`);
    fixtures = { Category: category, Schema: schema, MatObject: matObject, Sentinel: sentinel, SentinelID: sentinelID } as MaterializedReadFixtures;

    // 2) A single-row-filter template query (no top-level ORDER BY — an ordered query refuses to live). Saving a
    //    template query makes MJQueryEntityServer auto-extract the `marker` parameter (and the output QueryFields).
    const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    query.Name = `Materialized Read Probe ${stamp}`;
    query.CategoryID = category.ID;
    // `| sqlString` so the LIVE path (negative control) renders a quoted string literal; without it the value
    // interpolates unquoted → "Invalid column name". The materialized path BINDS the value (spec-driven), so it
    // is unaffected. The `marker` parameter is still auto-extracted from the token.
    query.SQL = `SELECT ID, Name FROM ${schema}.vwEntities WHERE Name = {{ marker | sqlString }}`;
    query.UsesTemplate = true;
    query.Status = 'Approved';
    if (!await query.Save()) throw new Error(`Fixture query save failed: ${query.LatestResult?.CompleteMessage}`);
    fixtures.Query = query;

    await QueryEngine.Instance.Config(true, user);
    await ensureQueryMetadata(md, user, query.ID);
    await QueryEngine.Instance.Config(true, user);

    // 3) Fabricate the physical snapshot with the surrogate row-id the read orders by, carrying the sentinel row
    //    (a Name that does NOT exist in the live vwEntities source). ViewName points straight at this table — the
    //    read does `SELECT <cols> FROM <schema>.<ViewName>`, which works on a table just as on a wrapper view.
    await ctx.Pool.request().query(
        `CREATE TABLE [${schema}].[${matObject}] (` +
        `  __mj_MaterializedRowID INT IDENTITY(1,1) NOT NULL,` +
        `  ID UNIQUEIDENTIFIER NULL,` +
        `  Name NVARCHAR(500) NULL` +
        `);` +
        `INSERT INTO [${schema}].[${matObject}] (ID, Name) VALUES ('${sentinelID}', N'${sentinel}');`
    );

    // 4) The MaterializedResult (RowFilterBroad, Active) + its ReadFilterSpec matching the query's `marker` param,
    //    then the join row linking it to the query. tryBuildMaterializedQueryPlan reads these live (BypassCache).
    const mr = await md.GetEntityObject<MJMaterializedResultEntity>('MJ: Materialized Results', user);
    mr.SourceType = 'Query';
    mr.SchemaName = schema;
    mr.TableName = matObject;
    mr.ViewName = matObject;
    mr.ParamMode = 'RowFilterBroad';
    mr.RefreshStrategy = 'FullRebuild';
    mr.Status = 'Active';
    mr.ReadFilterSpec = JSON.stringify([{ column: 'Name', operator: '=', paramName: 'marker', kind: 'scalar' }]);
    if (!await mr.Save()) throw new Error(`Fixture MaterializedResult save failed: ${mr.LatestResult?.CompleteMessage}`);
    fixtures.MaterializedResult = mr;

    const link = await md.GetEntityObject<MJMaterializedResultQueryEntity>('MJ: Materialized Result Queries', user);
    link.MaterializedResultID = mr.ID;
    link.QueryID = query.ID;
    if (!await link.Save()) throw new Error(`Fixture join row save failed: ${link.LatestResult?.CompleteMessage}`);
    fixtures.Link = link;
}

/**
 * Guarantee the query carries the `marker` parameter and the ID/Name output QueryFields the read plan needs.
 * Template save normally auto-extracts both; create any missing piece so the bundle is deterministic regardless
 * of the extraction path on the credential-free lane.
 */
async function ensureQueryMetadata(md: Metadata, user: UserInfo, queryID: string): Promise<void> {
    const q = QueryEngine.Instance.Queries.find((x) => UUIDsEqual(x.ID, queryID));
    const haveFields = new Set((q?.QueryFields ?? []).map((f) => (f.Name ?? '').toLowerCase()));
    let seq = (q?.QueryFields ?? []).length;
    for (const name of ['ID', 'Name']) {
        if (!haveFields.has(name.toLowerCase())) {
            const field = await md.GetEntityObject<MJQueryFieldEntity>('MJ: Query Fields', user);
            field.QueryID = queryID;
            field.Name = name;
            field.Sequence = ++seq;
            // Only f.Name is used by the materialized read plan; a generic declared type keeps the row valid.
            field.SQLBaseType = name === 'ID' ? 'uniqueidentifier' : 'nvarchar';
            field.SQLFullType = name === 'ID' ? 'uniqueidentifier' : 'nvarchar(500)';
            if (!await field.Save()) {
                LogError(`materialized-read: could not create QueryField ${name}: ${field.LatestResult?.CompleteMessage}`);
            }
        }
    }
}

/**
 * Best-effort teardown: drop the snapshot table, then delete the metadata FK-safe (join → MR → query → category).
 * Each delete is guarded individually — MR3 may have already deleted the MaterializedResult (and, via the server
 * subclass, its join row), so a delete that finds nothing must never skip the remaining cleanup (else the Query +
 * Category would leak on every run). `IsSaved` skips the row MR3 already removed; the per-delete catch handles the
 * join row the subclass deleted out from under the in-memory object.
 */
export async function teardownMaterializedReadFixtures(ctx: IntegrationCheckContext): Promise<void> {
    const safeDelete = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
        try { await fn(); } catch (e) { console.error(`materialized-read teardown (${label}): ${e instanceof Error ? e.message : String(e)}`); }
    };
    try {
        if (fixtures && ctx.Pool) {
            await ctx.Pool.request().query(`IF OBJECT_ID('[${fixtures.Schema}].[${fixtures.MatObject}]', 'U') IS NOT NULL DROP TABLE [${fixtures.Schema}].[${fixtures.MatObject}];`);
        }
        if (fixtures?.Link?.IsSaved) await safeDelete('link', () => fixtures!.Link.Delete());
        if (fixtures?.MaterializedResult?.IsSaved) await safeDelete('materializedResult', () => fixtures!.MaterializedResult.Delete());
        if (fixtures?.Query) await safeDelete('query', () => fixtures!.Query.Delete());
        if (fixtures?.Category) await safeDelete('category', () => fixtures!.Category.Delete());
    } finally {
        fixtures = undefined;
    }
}

/** True when a result set contains the sentinel row (matched by its ID). */
function containsSentinel(results: unknown[], sentinelID: string): boolean {
    return results.some((r) => UUIDsEqual(String((r as { ID?: unknown }).ID ?? ''), sentinelID));
}

export const MaterializedReadChecks: NamedCheck[] = [
    {
        Id: 'materialized-read.MR1',
        Name: 'MR1: a Materialized read is served FROM THE SNAPSHOT — returns the sentinel row and RenderedSQL references materialized_<…> + the surrogate order key',
        Fn: async (ctx): Promise<void> => {
            if (!fixtures) { console.warn('  ⚠ materialized-read.MR1 SKIPPED — no fixtures (no mssql pool on this run path).'); return; }
            const { Query, Sentinel, SentinelID } = requireFixtures();
            const rq = new RunQuery();
            const result = await rq.RunQuery({ QueryID: Query.ID, DataSource: 'Materialized', Parameters: { marker: Sentinel } }, ctx.User);
            Assert(result.Success, `materialized read must succeed: ${result.ErrorMessage}`);
            const rendered = String(result.RenderedSQL ?? '');
            Assert(/materialized_/i.test(rendered), `MR1: read must be served from the snapshot — RenderedSQL should reference materialized_<…>, got: ${rendered.slice(0, 160)}`);
            Assert(/__mj_MaterializedRowID/i.test(rendered), 'MR1: the materialized read orders by the stable surrogate row-id (deterministic paging)');
            Assert(containsSentinel(result.Results ?? [], SentinelID), 'MR1: the snapshot-only sentinel row MUST be returned — proof the rows came from the snapshot, not the live source');
        },
    },
    {
        Id: 'materialized-read.MR2',
        Name: 'MR2 (negative control): the SAME query read Live returns the sentinel NOWHERE and RenderedSQL does not reference the snapshot',
        Fn: async (ctx): Promise<void> => {
            if (!fixtures) { console.warn('  ⚠ materialized-read.MR2 SKIPPED — no fixtures (no mssql pool on this run path).'); return; }
            const { Query, Sentinel, SentinelID } = requireFixtures();
            const rq = new RunQuery();
            const result = await rq.RunQuery({ QueryID: Query.ID, DataSource: 'Live', Parameters: { marker: Sentinel } }, ctx.User);
            Assert(result.Success, `live read must succeed: ${result.ErrorMessage}`);
            const rendered = String(result.RenderedSQL ?? '');
            Assert(!/materialized_/i.test(rendered), `MR2: the Live read must NOT touch the snapshot — RenderedSQL should reference the source, got: ${rendered.slice(0, 160)}`);
            Assert(!containsSentinel(result.Results ?? [], SentinelID), 'MR2: the sentinel exists ONLY in the snapshot, so a Live read must not return it — this attributes MR1 to the snapshot, not to correct rows generally');
            AssertEqual(result.Results?.length ?? -1, 0, 'MR2: no live Entity is named the sentinel, so the Live read returns zero rows');
        },
    },
    {
        Id: 'materialized-read.MR3',
        Name: 'MR3: deleting the MaterializedResult (join row present) cleans the join first — no raw FK error (reverse-direction FK cleanup)',
        Fn: async (ctx): Promise<void> => {
            if (!fixtures) { console.warn('  ⚠ materialized-read.MR3 SKIPPED — no fixtures (no mssql pool on this run path).'); return; }
            const { MaterializedResult, Link } = requireFixtures();
            const rv = RunView.FromMetadataProvider(ctx.Provider as IMetadataProvider);
            const before = await rv.RunView<{ ID: string }>({ EntityName: 'MJ: Materialized Result Queries', ExtraFilter: `ID='${Link.ID}'`, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
            Assert(before.Success && (before.Results?.length ?? 0) === 1, 'MR3: the join row must exist before the delete (anti-vacuity)');
            // Delete the MaterializedResult while its join row still references it. The join FK has no
            // ON DELETE CASCADE, so absent MJMaterializedResultEntityServer cleaning the join FIRST this would be a
            // raw FK_MaterializedResultQuery_MaterializedResult violation rather than a clean delete.
            const deleted = await MaterializedResult.Delete();
            Assert(deleted, `MR3: deleting the MaterializedResult must succeed (join cleaned first), got: ${MaterializedResult.LatestResult?.CompleteMessage}`);
            const after = await rv.RunView<{ ID: string }>({ EntityName: 'MJ: Materialized Result Queries', ExtraFilter: `ID='${Link.ID}'`, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
            AssertEqual(after.Results?.length ?? -1, 0, 'MR3: the join row must be gone after the MaterializedResult delete');
        },
    },
];

for (const check of MaterializedReadChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('materialized-read', {
    Setup: async (ctx) => { await createMaterializedReadFixtures(ctx); },
    Teardown: async (ctx) => { await teardownMaterializedReadFixtures(ctx); },
});
