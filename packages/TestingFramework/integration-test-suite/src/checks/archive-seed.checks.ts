/**
 * archive-seed.checks.ts — the 'archive-seed' bundle (AS1–AS3): the server-side seams of seeding a SQL Server
 * integration from a backup archive.
 *
 * TRANSPORT: **SERVER** — the staging actions run in-process through `ActionEngineServer.Instance` against the
 * SQLServerDataProvider (`ctx.Provider`), and the data source resolves through `ExternalDataSourceRouter`.
 *
 * TIER: deterministic, self-cleaning. The bundle creates two throwaway databases on the tier's SQL Server
 * (`MJ_Staging_IT_ArchiveSeed_<timestamp>` for AS1, `MJ_Staging_IT_ArchiveSeedHost_<timestamp>` for AS2 — the
 * `MJ_Staging_` prefix is what the drop action accepts) and one `MJ: External Data Sources` row; Teardown drops /
 * deletes them. When the tier's login lacks CREATE ANY DATABASE (a least-privilege dev login; CI connects as `sa`),
 * no database is created and AS1 and AS2 report Skipped.
 *
 *   - AS1: `Drop SQL Server Staging Database` drops a database that exists — the action reports SUCCESS and
 *          `DB_ID` is null afterwards.
 *   - AS2: an `MJ: External Data Sources` row in `{"authMode":"host"}` mode (no server, no credential,
 *          `DefaultDatabase` = AS2's throwaway database — host mode refuses the tier's own database) resolves
 *          through `ExternalDataSourceRouter` and the SQL Server driver's `TestConnection` succeeds with the
 *          host's own login.
 *   - AS3: `Load SQL Server Integration From Staging` against a staging database that does not exist fails with
 *          `STAGING_NOT_FOUND` before touching any entity map.
 *
 * NOT COVERED HERE: the restore itself. The tier has no `.bak` fixture, so `Restore SQL Server Backup To Staging`
 * is covered by the actions package's unit tests and by the manual run described in
 * packages/Integration/actions/README.md.
 *
 * HOST RESOLVER: `host` mode needs the resolver MJServer registers at boot. `mj test` does not boot MJServer, so
 * Setup registers one from the tier's own DB config (`LoadDbConfig`, including its database, as MJServer's does)
 * when none is registered, and Teardown clears it only if Setup registered it.
 */
import { DatabaseProviderBase, RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { ExternalDataSourceRouter, ResolveHostConnection, SetHostConnectionResolver } from '@memberjunction/external-data-sources';
import { SQLServerExternalDataSourceDriver } from '@memberjunction/external-data-source-sqlserver';
import { DropSQLServerStagingDatabaseAction, LoadSQLServerIntegrationFromStagingAction } from '@memberjunction/integration-actions';
import { Assert, AssertEqual, IntegrationCheckRegistry, LoadDbConfig, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

/**
 * Referenced so the imports that register the action classes and the SQL Server driver with the ClassFactory
 * (their `@RegisterClass` side effects) are never elided.
 */
export const ArchiveSeedRegisteredClasses = [
    DropSQLServerStagingDatabaseAction,
    LoadSQLServerIntegrationFromStagingAction,
    SQLServerExternalDataSourceDriver,
];

const DROP_ACTION = 'Drop SQL Server Staging Database';
const LOAD_ACTION = 'Load SQL Server Integration From Staging';
const DATA_SOURCE_ENTITY = 'MJ: External Data Sources';
const DATA_SOURCE_TYPE_ENTITY = 'MJ: External Data Source Types';
const SQL_SERVER_TYPE_NAME = 'SQL Server (External)';

/** Module-scoped fixture, populated by Setup and swept by Teardown. */
interface ArchiveSeedFixture {
    /** The throwaway database AS1 drops (Teardown drops it again if AS1 did not). */
    ThrowawayDatabase: string;
    /** The throwaway database AS2's host-mode data source targets (Teardown drops it). */
    HostDatabase: string;
    /** False when the tier's login cannot create a database; AS1 and AS2 then report Skipped. */
    CanCreateDatabase: boolean;
    /** The `MJ: External Data Sources` row AS2 creates, once saved. */
    DataSourceID?: string;
    /** True when Setup registered the host connection resolver (so Teardown clears it). */
    RegisteredHostResolver: boolean;
}
let fixture: ArchiveSeedFixture | undefined;

function fx(): ArchiveSeedFixture {
    Assert(fixture != null, 'archive-seed fixture missing (bundle Setup did not run)');
    return fixture!;
}

function databaseProvider(ctx: IntegrationCheckContext): DatabaseProviderBase {
    const provider = ctx.Provider;
    if (!(provider instanceof DatabaseProviderBase)) {
        throw new Error('archive-seed needs the server transport (a DatabaseProviderBase provider)');
    }
    return provider;
}

/** True when the named database exists on the tier's SQL Server. */
async function databaseExists(ctx: IntegrationCheckContext, name: string): Promise<boolean> {
    const rows = await databaseProvider(ctx).ExecuteSQL<{ DatabaseId: number | null }>(
        `SELECT DB_ID(N'${EscapeSQLString(name)}') AS DatabaseId;`, undefined, { description: 'archive-seed: database exists' }, ctx.User);
    return !!rows && rows.length > 0 && rows[0].DatabaseId != null;
}

/** True when the tier's login holds CREATE ANY DATABASE (the staging restore needs it too). */
async function canCreateDatabase(ctx: IntegrationCheckContext): Promise<boolean> {
    const rows = await databaseProvider(ctx).ExecuteSQL<{ CanCreate: number | null }>(
        `SELECT HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE') AS CanCreate;`, undefined, { description: 'archive-seed: create permission' }, ctx.User);
    return !!rows && rows.length > 0 && rows[0].CanCreate === 1;
}

/**
 * Drops the named database if it exists (best effort; used by Teardown). Open connections — AS2's driver pool —
 * are rolled back first so they cannot block the drop.
 */
async function dropIfExists(ctx: IntegrationCheckContext, name: string): Promise<void> {
    const literal = EscapeSQLString(name);
    await databaseProvider(ctx).ExecuteSQL(
        `IF DB_ID(N'${literal}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`,
        undefined, { description: 'archive-seed: teardown drop' }, ctx.User);
}

/** Runs a named action through the real engine. */
async function runAction(ctx: IntegrationCheckContext, actionName: string, actionParams: ActionParam[]): Promise<ActionResult> {
    const engine = ActionEngineServer.Instance;
    await engine.Config(false, ctx.User);
    const action = engine.Actions.find(a => a.Name.trim().toLowerCase() === actionName.toLowerCase());
    Assert(action != null, `action '${actionName}' is not in the catalog — push metadata/actions/.integration-actions.json`);
    const params = new RunActionParams();
    params.Action = action!;
    params.ContextUser = ctx.User;
    params.Provider = ctx.Provider;
    params.Params = actionParams;
    params.Filters = [];
    params.SkipActionLog = true;
    return engine.RunAction(params);
}

function input(name: string, value: string): ActionParam {
    return { Name: name, Value: value, Type: 'Input' };
}

/** Registers a host connection resolver from the tier's DB config when none is registered. */
async function ensureHostResolver(): Promise<boolean> {
    if (ResolveHostConnection()) {
        return false;
    }
    const db = await LoadDbConfig();
    SetHostConnectionResolver(() => ({
        Server: db.Host,
        Port: db.Port,
        User: db.User,
        Password: db.Password,
        Encrypt: false,
        TrustServerCertificate: true,
        Database: db.Database,
    }));
    return true;
}

async function sqlServerTypeID(ctx: IntegrationCheckContext): Promise<string> {
    const result = await new RunView(databaseProvider(ctx)).RunView<{ ID: string }>({
        EntityName: DATA_SOURCE_TYPE_ENTITY,
        ExtraFilter: `Name = '${EscapeSQLString(SQL_SERVER_TYPE_NAME)}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    Assert(result.Success, `loading ${DATA_SOURCE_TYPE_ENTITY} failed: ${result.ErrorMessage}`);
    Assert(result.Results.length === 1, `expected one '${SQL_SERVER_TYPE_NAME}' data source type, found ${result.Results.length}`);
    return result.Results[0].ID;
}

/** Creates the host-mode data source row and records its ID on the fixture. */
async function createHostDataSource(ctx: IntegrationCheckContext): Promise<MJExternalDataSourceEntity> {
    const row = await ctx.Provider.GetEntityObject<MJExternalDataSourceEntity>(DATA_SOURCE_ENTITY, ctx.User);
    row.NewRecord();
    row.Name = `mj-it-archive-seed-${Date.now()} (mj-integration-test — safe to delete)`;
    row.TypeID = await sqlServerTypeID(ctx);
    row.DefaultDatabase = fx().HostDatabase;
    row.ConnectionConfig = JSON.stringify({ authMode: 'host' });
    row.Status = 'Active';
    const saved = await row.Save();
    Assert(saved, `saving the host-mode data source failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    fx().DataSourceID = row.ID;
    return row;
}

async function deleteDataSource(ctx: IntegrationCheckContext, id: string): Promise<void> {
    await ExternalDataSourceRouter.Instance.ClearCache(id);
    const row = await ctx.Provider.GetEntityObject<MJExternalDataSourceEntity>(DATA_SOURCE_ENTITY, ctx.User);
    if (await row.Load(id)) {
        await row.Delete();
    }
}

export const ArchiveSeedChecks: NamedCheck[] = [
    {
        Id: 'archive-seed.AS1',
        Name: 'AS1: Drop SQL Server Staging Database drops an existing database',
        Fn: async (ctx: IntegrationCheckContext) => {
            const name = fx().ThrowawayDatabase;
            if (!fx().CanCreateDatabase) {
                SkipCheck('AS1: the tier login lacks CREATE ANY DATABASE, so there is no database to drop');
            }
            Assert(await databaseExists(ctx, name), `AS1: Setup did not create [${name}]`);
            const result = await runAction(ctx, DROP_ACTION, [input('StagingDatabaseName', name)]);
            Assert(result.Success, `AS1: drop failed (${result.ResultCode}): ${result.Message}`);
            AssertEqual(result.ResultCode, 'SUCCESS', 'AS1: result code');
            Assert(!(await databaseExists(ctx, name)), `AS1: [${name}] still exists after the drop`);
        },
    },
    {
        Id: 'archive-seed.AS2',
        Name: 'AS2: a host-mode SQL Server data source resolves through the router and connects',
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!fx().CanCreateDatabase) {
                SkipCheck('AS2: the tier login lacks CREATE ANY DATABASE, so there is no throwaway database to target');
            }
            Assert(await databaseExists(ctx, fx().HostDatabase), `AS2: Setup did not create [${fx().HostDatabase}]`);
            const row = await createHostDataSource(ctx);
            const resolved = await ExternalDataSourceRouter.Instance.Resolve(row.ID, ctx.User, ctx.Provider);
            Assert(resolved.driver instanceof SQLServerExternalDataSourceDriver,
                `AS2: expected the SQL Server driver, got ${resolved.driver.constructor.name}`);
            const test = await resolved.driver.TestConnection(resolved.dataSource, ctx.User);
            Assert(test.success, `AS2: TestConnection failed: ${test.message}`);
        },
    },
    {
        Id: 'archive-seed.AS3',
        Name: 'AS3: Load SQL Server Integration From Staging refuses a missing staging database',
        Fn: async (ctx: IntegrationCheckContext) => {
            const missing = `MJ_IT_ArchiveSeed_Missing_${Date.now()}`;
            const result = await runAction(ctx, LOAD_ACTION, [
                input('CompanyIntegrationID', '00000000-0000-0000-0000-000000000000'),
                input('StagingDatabaseName', missing),
                input('BackupStartDate', new Date().toISOString()),
            ]);
            Assert(!result.Success, 'AS3: the load succeeded against a missing staging database');
            AssertEqual(result.ResultCode, 'STAGING_NOT_FOUND', 'AS3: result code');
        },
    },
];

for (const check of ArchiveSeedChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('archive-seed', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const stamp = Date.now();
        fixture = {
            ThrowawayDatabase: `MJ_Staging_IT_ArchiveSeed_${stamp}`,
            HostDatabase: `MJ_Staging_IT_ArchiveSeedHost_${stamp}`,
            CanCreateDatabase: await canCreateDatabase(ctx),
            RegisteredHostResolver: false,
        };
        if (fixture.CanCreateDatabase) {
            for (const name of [fixture.ThrowawayDatabase, fixture.HostDatabase]) {
                await databaseProvider(ctx).ExecuteSQL(`CREATE DATABASE [${name}];`, undefined, { description: 'archive-seed: create throwaway database' }, ctx.User);
            }
        }
        fixture.RegisteredHostResolver = await ensureHostResolver();
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) {
            return;
        }
        const { ThrowawayDatabase, HostDatabase, CanCreateDatabase, DataSourceID, RegisteredHostResolver } = fixture;
        if (DataSourceID) {
            await deleteDataSource(ctx, DataSourceID).catch(() => undefined);
        }
        if (CanCreateDatabase) {
            await dropIfExists(ctx, ThrowawayDatabase).catch(() => undefined);
            await dropIfExists(ctx, HostDatabase).catch(() => undefined);
        }
        if (RegisteredHostResolver) {
            SetHostConnectionResolver(undefined);
        }
        fixture = undefined;
    },
});
