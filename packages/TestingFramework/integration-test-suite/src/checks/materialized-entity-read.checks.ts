/**
 * materialized-entity-read.checks.ts — the 'materialized-entity-read' bundle (EMR1–EMR2).
 *
 * The companion to `materialized-read` (query materialization): this proves the ENTITY BASE-VIEW redirect —
 * `RunView(DataSource:'Materialized')` on an entity is served from that entity's physical snapshot via
 * `resolveEffectiveBaseView`, not from the live base view. This is the higher-blast-radius path (it can affect
 * `RunView` for ANY entity), so it earns its own live proof.
 *
 * Mechanism (GenericDatabaseProvider.resolveEffectiveBaseView): a `Materialized` RunView looks up a
 * `MJ: Materialized Results` row with `SourceType='EntityBaseView' AND SourceEntityID=<entity.ID>`; when its
 * `Status='Active'` the read is redirected to the row's `ViewName`, else it falls back to the live base view.
 *
 * We fabricate that snapshot for a real entity (`MJ: Task Types`) carrying a SENTINEL row absent from the live
 * view, then:
 *   • EMR1 (positive): `RunView(DataSource:'Materialized')` filtered to the sentinel returns it (read hit the snapshot).
 *   • EMR2 (negative control): the SAME RunView read `Live` returns the sentinel nowhere (proving EMR1 came from the snapshot).
 *
 * The materialization only affects reads that explicitly pass `DataSource:'Materialized'` (default Live reads of
 * `MJ: Task Types` are untouched), and the fixture is short-lived + self-cleaning, so it does not perturb other tests.
 * SQL-Server only (raw fabrication via `ctx.Pool`); skips (skip-as-pass) when no mssql pool is present.
 */
import { randomUUID } from 'node:crypto';
import { RunView, Metadata, LogError } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { MJMaterializedResultEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** The entity whose base view we materialize. Small, stable core lookup, unrelated to the query-materialization bundle. */
const TARGET_ENTITY = 'MJ: Task Types';

interface EntityReadFixtures {
    /** Filled in after the MaterializedResult saves; the handle is published earlier so teardown can always drop
     *  the physical snapshot table even if Save fails. */
    MaterializedResult?: MJMaterializedResultEntity;
    Schema: string;
    MatObject: string;
    Sentinel: string;
    SentinelID: string;
}

let fixtures: EntityReadFixtures | undefined;

function requireFixtures(): EntityReadFixtures {
    if (!fixtures) {
        throw new Error('materialized-entity-read fixtures not initialized — the bundle lifecycle Setup must run before its checks.');
    }
    return fixtures;
}

export async function createEntityReadFixtures(ctx: IntegrationCheckContext): Promise<void> {
    if (!ctx.Pool) {
        console.log(`      → materialized-entity-read SKIPPED (no assertions will run): no mssql pool on this run path — snapshot fabrication is T-SQL only`);
        return;
    }
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const entity = md.EntityByName(TARGET_ENTITY);
    if (!entity) {
        console.log(`      → materialized-entity-read SKIPPED: entity "${TARGET_ENTITY}" not present in this environment`);
        return;
    }
    const schema = entity.SchemaName;
    const stamp = Date.now();
    const matObject = `materialized_vwITEntityRead_${stamp}`;
    const sentinel = `__IT_MATENT_SENTINEL_${stamp}__`;
    const sentinelID = randomUUID();
    // Publish the fixture handle BEFORE creating any physical object, so teardown can always drop the snapshot
    // table even if a later step (GetEntityObject / mr.Save) throws — matching the driver's up-front-handle
    // contract and the sibling materialized-read bundle. MaterializedResult is filled in after it saves.
    fixtures = { Schema: schema, MatObject: matObject, Sentinel: sentinel, SentinelID: sentinelID };

    // Fabricate the snapshot for the entity's base view: only the columns the checks read (ID + Name), plus the
    // sentinel row (a Name absent from the live view). resolveEffectiveBaseView redirects the read here.
    await ctx.Pool.request().query(
        `CREATE TABLE [${schema}].[${matObject}] (ID UNIQUEIDENTIFIER NULL, Name NVARCHAR(500) NULL);` +
        `INSERT INTO [${schema}].[${matObject}] (ID, Name) VALUES ('${sentinelID}', N'${sentinel}');`
    );

    const mr = await md.GetEntityObject<MJMaterializedResultEntity>('MJ: Materialized Results', ctx.User);
    mr.SourceType = 'EntityBaseView';
    mr.SourceEntityID = entity.ID;
    mr.SchemaName = schema;
    mr.TableName = matObject;
    mr.ViewName = matObject;
    mr.ParamMode = 'None';
    mr.RefreshStrategy = 'FullRebuild';
    mr.Status = 'Active';
    if (!await mr.Save()) throw new Error(`Fixture MaterializedResult save failed: ${mr.LatestResult?.CompleteMessage}`);
    fixtures.MaterializedResult = mr;
}

export async function teardownEntityReadFixtures(ctx: IntegrationCheckContext): Promise<void> {
    try {
        if (fixtures && ctx.Pool) {
            await ctx.Pool.request().query(`IF OBJECT_ID('[${fixtures.Schema}].[${fixtures.MatObject}]', 'U') IS NOT NULL DROP TABLE [${fixtures.Schema}].[${fixtures.MatObject}];`);
        }
        if (fixtures?.MaterializedResult?.IsSaved) {
            try { await fixtures.MaterializedResult.Delete(); } catch (e) { LogError(`materialized-entity-read teardown (MR): ${e instanceof Error ? e.message : String(e)}`); }
        }
    } finally {
        fixtures = undefined;
    }
}

/** Read the target entity with the given DataSource, filtered to the sentinel row. */
async function readSentinel(ctx: IntegrationCheckContext, dataSource: 'Materialized' | 'Live'): Promise<{ Success: boolean; ErrorMessage?: string; Results?: Array<{ ID: string }> }> {
    const { Sentinel } = requireFixtures();
    const rv = RunView.FromMetadataProvider(ctx.Provider as IMetadataProvider);
    return rv.RunView<{ ID: string }>({
        EntityName: TARGET_ENTITY,
        ExtraFilter: `Name = '${Sentinel.replace(/'/g, "''")}'`,
        Fields: ['ID', 'Name'],
        ResultType: 'simple',
        DataSource: dataSource,
    }, ctx.User);
}

export const MaterializedEntityReadChecks: NamedCheck[] = [
    {
        Id: 'materialized-entity-read.EMR1',
        Name: 'EMR1: RunView(DataSource:Materialized) on an entity is served FROM THE SNAPSHOT — returns the snapshot-only sentinel row',
        Fn: async (ctx): Promise<void> => {
            if (!fixtures) { console.warn('  ⚠ materialized-entity-read.EMR1 SKIPPED — no fixtures (no mssql pool / entity absent).'); return; }
            const { SentinelID } = requireFixtures();
            const res = await readSentinel(ctx, 'Materialized');
            Assert(res.Success, `materialized RunView must succeed: ${res.ErrorMessage}`);
            Assert((res.Results?.length ?? 0) === 1, `EMR1: exactly the sentinel row must come back from the snapshot, got ${res.Results?.length}`);
            Assert(UUIDsEqual(String(res.Results?.[0]?.ID ?? ''), SentinelID), 'EMR1: the returned row is the snapshot-only sentinel — proof the read hit the materialized view, not the live base view');
        },
    },
    {
        Id: 'materialized-entity-read.EMR2',
        Name: 'EMR2 (negative control): the SAME RunView read Live returns the sentinel nowhere',
        Fn: async (ctx): Promise<void> => {
            if (!fixtures) { console.warn('  ⚠ materialized-entity-read.EMR2 SKIPPED — no fixtures (no mssql pool / entity absent).'); return; }
            const res = await readSentinel(ctx, 'Live');
            Assert(res.Success, `live RunView must succeed: ${res.ErrorMessage}`);
            AssertEqual(res.Results?.length ?? -1, 0, 'EMR2: the sentinel exists ONLY in the snapshot, so a Live read of the entity must not return it — this attributes EMR1 to the snapshot');
        },
    },
];

for (const check of MaterializedEntityReadChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('materialized-entity-read', {
    Setup: async (ctx) => { await createEntityReadFixtures(ctx); },
    Teardown: async (ctx) => { await teardownEntityReadFixtures(ctx); },
});
