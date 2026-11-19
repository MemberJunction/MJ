/**
 * Archive runs page through every eligible record (IT180, server transport, mutating).
 *
 * A Purge + StripFields archive configuration over throwaway `MJ: Action Execution Logs` rows,
 * run with a batch size smaller than the number of eligible rows, so the engine pages with the
 * keyset cursor and the eligibility filter the driver adds on the real database.
 *
 *   - ARP1 One run strips every row older than the cutoff across several pages, counts no row as
 *          skipped (a row already stripped is never loaded), leaves the recent rows and every
 *          non-stripped column alone.
 *   - ARP2 A second run of the same configuration loads nothing: stripped rows no longer match.
 *   - ARP3 A Purge + HardDelete run over throwaway `MJ: Entity Document Runs` rows deletes every row
 *          older than the cutoff across several pages and keeps the recent rows. A deleted entity
 *          object clears its own key, so this fails if paging reads the cursor after processing.
 *
 * The fixture is two archive configurations (each with its entity row), the log rows tagged with a
 * per-run ResultCode, and the document-run rows tagged with a per-run EndedAt, all deleted in
 * Teardown together with the configurations' archive runs.
 */
import { RunView } from '@memberjunction/core';
import {
    MJActionExecutionLogEntity,
    MJArchiveConfigurationEntity,
    MJArchiveConfigurationEntityEntity,
    MJEntityDocumentRunEntity,
} from '@memberjunction/core-entities';
import { ArchiveEngine, ArchiveRunResult } from '@memberjunction/archiving-engine';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';

const BUNDLE = 'archive-paging';
const LOG_ENTITY = 'MJ: Action Execution Logs';
/** Hard-delete target: no dependents, no Record Changes, and the test user may delete it. */
const DOCUMENT_RUN_ENTITY = 'MJ: Entity Document Runs';
const CONFIG_ENTITY = 'MJ: Archive Configurations';
const CONFIG_ENTITY_ENTITY = 'MJ: Archive Configuration Entities';
const RUN_ENTITY = 'MJ: Archive Runs';
const RUN_DETAIL_ENTITY = 'MJ: Archive Run Details';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** Rows older than the cutoff; more than three pages of BATCH_SIZE. */
const OLD_ROWS = 35;
/** Rows newer than the cutoff, which no run may touch. */
const RECENT_ROWS = 5;
const BATCH_SIZE = 10;
const RETENTION_DAYS = 30;
const STRIP_FIELDS = ['Params', 'ResultParams', 'Message'] as const;
/** Document runs older than the cutoff, for the HardDelete run; more than two pages. */
const OLD_DOCUMENT_RUNS = 25;
const RECENT_DOCUMENT_RUNS = 3;

interface ArchivePagingFixture {
    Prefix: string;
    ConfigID: string;
    ConfigEntityID: string;
    DeleteConfigID: string;
    /** Every fixture document run carries this EndedAt, so the filter and teardown find only them. */
    MarkerIso: string;
    OldDocumentRunIDs: string[];
    RecentDocumentRunIDs: string[];
    OldLogIDs: string[];
    RecentLogIDs: string[];
    /** An old row whose strip fields are already empty. */
    StrippedLogID: string;
}

/** One `MJ: Action Execution Logs` row (simple result). */
interface LogRow {
    ID: string;
    ActionID: string;
    ResultCode: string | null;
    StartedAt: Date | string;
    Params: string | null;
    ResultParams: string | null;
    Message: string | null;
}

let fixture: ArchivePagingFixture | undefined;
/** Set by Setup when the bundle deliberately writes nothing; every check then skips with it. */
let skipReason: string | undefined;

function fx(): ArchivePagingFixture {
    if (skipReason) {
        SkipCheck(skipReason);
    }
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

async function firstActionId(ctx: IntegrationCheckContext): Promise<string> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: 'MJ: Actions', Fields: ['ID'], MaxRows: 1, ResultType: 'simple',
    }, ctx.User);
    Assert(result.Success && result.Results.length > 0, 'no MJ: Actions row is seeded');
    return result.Results[0].ID;
}

/** Creates one log row; `daysAgo` sets StartedAt, `filled` whether the strip fields hold text. */
async function createLog(ctx: IntegrationCheckContext, prefix: string, actionId: string, daysAgo: number, filled: boolean): Promise<string> {
    const log = await ctx.Provider.GetEntityObject<MJActionExecutionLogEntity>(LOG_ENTITY, ctx.User);
    log.NewRecord();
    log.ActionID = actionId;
    log.UserID = ctx.User.ID;
    log.ResultCode = prefix;
    log.StartedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    if (filled) {
        log.Params = `{"tag":"${prefix}","payload":"params"}`;
        log.ResultParams = `{"tag":"${prefix}","payload":"result"}`;
        log.Message = `${prefix} message ${FIXTURE_TAG}`;
    }
    Assert(await log.Save(), `creating fixture log failed: ${log.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return log.ID;
}

async function createConfiguration(ctx: IntegrationCheckContext, f: ArchivePagingFixture): Promise<void> {
    const config = await ctx.Provider.GetEntityObject<MJArchiveConfigurationEntity>(CONFIG_ENTITY, ctx.User);
    config.NewRecord();
    config.Name = `${f.Prefix} strip ${FIXTURE_TAG}`;
    config.RootPath = '';
    config.IsActive = true;
    config.DefaultRetentionDays = RETENTION_DAYS;
    config.DefaultMode = 'StripFields';
    config.DefaultBatchSize = BATCH_SIZE;
    config.StorageMode = 'Purge';
    config.Status = 'Idle';
    config.CreatedByUserID = ctx.User.ID;
    Assert(await config.Save(), `creating the archive configuration failed: ${config.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    f.ConfigID = config.ID;

    const entityId = ctx.Provider.EntityByName(LOG_ENTITY)?.ID;
    Assert(!!entityId, `could not resolve the entity ID for '${LOG_ENTITY}'`);
    const configEntity = await ctx.Provider.GetEntityObject<MJArchiveConfigurationEntityEntity>(CONFIG_ENTITY_ENTITY, ctx.User);
    configEntity.NewRecord();
    configEntity.ArchiveConfigurationID = config.ID;
    configEntity.EntityID = entityId!;
    configEntity.Mode = 'StripFields';
    configEntity.DateField = 'StartedAt';
    configEntity.FilterExpression = `ResultCode = '${f.Prefix}'`;
    configEntity.BatchSize = BATCH_SIZE;
    configEntity.FieldConfiguration = JSON.stringify({ Fields: STRIP_FIELDS.map(FieldName => ({ FieldName, IsActive: true })) });
    configEntity.IsActive = true;
    Assert(await configEntity.Save(), `creating the archive configuration entity failed: ${configEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    f.ConfigEntityID = configEntity.ID;
}

async function firstEntityDocumentId(ctx: IntegrationCheckContext): Promise<string> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: 'MJ: Entity Documents', Fields: ['ID'], MaxRows: 1, ResultType: 'simple',
    }, ctx.User);
    Assert(result.Success && result.Results.length > 0, 'no MJ: Entity Documents row is seeded');
    return result.Results[0].ID;
}

/** Creates one document run; `daysAgo` sets StartedAt, the date the HardDelete configuration ages on. */
async function createDocumentRun(ctx: IntegrationCheckContext, f: ArchivePagingFixture, documentId: string, daysAgo: number): Promise<string> {
    const run = await ctx.Provider.GetEntityObject<MJEntityDocumentRunEntity>(DOCUMENT_RUN_ENTITY, ctx.User);
    run.NewRecord();
    run.EntityDocumentID = documentId;
    run.StartedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    run.EndedAt = new Date(f.MarkerIso);
    Assert(await run.Save(), `creating fixture document run failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return run.ID;
}

/** A Purge + HardDelete configuration over the fixture document runs, aged on StartedAt. */
async function createDeleteConfiguration(ctx: IntegrationCheckContext, f: ArchivePagingFixture): Promise<void> {
    const config = await ctx.Provider.GetEntityObject<MJArchiveConfigurationEntity>(CONFIG_ENTITY, ctx.User);
    config.NewRecord();
    config.Name = `${f.Prefix} delete ${FIXTURE_TAG}`;
    config.RootPath = '';
    config.IsActive = true;
    config.DefaultRetentionDays = RETENTION_DAYS;
    config.DefaultMode = 'HardDelete';
    config.DefaultBatchSize = BATCH_SIZE;
    config.StorageMode = 'Purge';
    config.Status = 'Idle';
    config.CreatedByUserID = ctx.User.ID;
    Assert(await config.Save(), `creating the HardDelete configuration failed: ${config.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    f.DeleteConfigID = config.ID;

    const entityId = ctx.Provider.EntityByName(DOCUMENT_RUN_ENTITY)?.ID;
    Assert(!!entityId, `could not resolve the entity ID for '${DOCUMENT_RUN_ENTITY}'`);
    const configEntity = await ctx.Provider.GetEntityObject<MJArchiveConfigurationEntityEntity>(CONFIG_ENTITY_ENTITY, ctx.User);
    configEntity.NewRecord();
    configEntity.ArchiveConfigurationID = config.ID;
    configEntity.EntityID = entityId!;
    configEntity.Mode = 'HardDelete';
    configEntity.DateField = 'StartedAt';
    configEntity.FilterExpression = `EndedAt = '${f.MarkerIso}'`;
    configEntity.BatchSize = BATCH_SIZE;
    configEntity.FieldConfiguration = JSON.stringify({ Fields: [], ArchiveFullRecord: true });
    configEntity.IsActive = true;
    Assert(await configEntity.Save(), `creating the HardDelete configuration entity failed: ${configEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
}

/** IDs (upper-cased) of the fixture document runs that still exist. */
async function remainingDocumentRunIds(ctx: IntegrationCheckContext): Promise<Set<string>> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: DOCUMENT_RUN_ENTITY,
        ExtraFilter: `EndedAt = '${fx().MarkerIso}'`,
        Fields: ['ID'],
        IgnoreMaxRows: true,
        BypassCache: true,
        ResultType: 'simple',
    }, ctx.User);
    Assert(result.Success, `reading the fixture document runs failed: ${result.ErrorMessage}`);
    return new Set(result.Results.map(row => row.ID.toUpperCase()));
}

async function fixtureLogs(ctx: IntegrationCheckContext): Promise<Map<string, LogRow>> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<LogRow>({
        EntityName: LOG_ENTITY,
        ExtraFilter: `ResultCode = '${fx().Prefix}'`,
        Fields: ['ID', 'ActionID', 'ResultCode', 'StartedAt', ...STRIP_FIELDS],
        IgnoreMaxRows: true,
        BypassCache: true,
        ResultType: 'simple',
    }, ctx.User);
    Assert(result.Success, `reading the fixture logs failed: ${result.ErrorMessage}`);
    return new Map(result.Results.map(row => [row.ID.toUpperCase(), row]));
}

async function runArchive(ctx: IntegrationCheckContext, configId: string = fx().ConfigID): Promise<ArchiveRunResult> {
    const result = await ArchiveEngine.Instance.RunArchive(configId, ctx.User);
    Assert(result.Success, `the archive run failed: ${result.ErrorMessage ?? `${result.FailedRecords} failed records`}`);
    return result;
}

function rowFor(rows: Map<string, LogRow>, id: string, label: string): LogRow {
    const row = rows.get(id.toUpperCase());
    Assert(row != null, `${label}: fixture log ${id} is missing`);
    return row!;
}

async function checkArp1OneRunStripsEveryOldRow(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const result = await runArchive(ctx);
    AssertEqual(result.ArchivedRecords, OLD_ROWS, 'ARP1: rows stripped in one run');
    AssertEqual(result.SkippedRecords, 0, 'ARP1: rows loaded and skipped (an already-stripped row must not be loaded)');

    const rows = await fixtureLogs(ctx);
    for (const id of f.OldLogIDs) {
        const row = rowFor(rows, id, 'ARP1');
        for (const field of STRIP_FIELDS) {
            AssertEqual(row[field], null, `ARP1: old log ${id} ${field}`);
        }
        AssertEqual(row.ResultCode, f.Prefix, `ARP1: old log ${id} ResultCode is untouched`);
    }
    for (const id of f.RecentLogIDs) {
        const row = rowFor(rows, id, 'ARP1');
        Assert(STRIP_FIELDS.every(field => row[field] != null), `ARP1: recent log ${id} lost a value`);
    }
    console.log(`      → ${OLD_ROWS} old rows stripped in pages of ${BATCH_SIZE}; ${RECENT_ROWS} recent rows untouched`);
}

async function checkArp2SecondRunLoadsNothing(ctx: IntegrationCheckContext): Promise<void> {
    await runArchive(ctx); // a no-op when ARP1 already ran
    const second = await runArchive(ctx);
    AssertEqual(second.TotalRecords, 0, 'ARP2: rows the second run loaded');
    console.log('      → the second run loaded no rows');
}

async function checkArp3HardDeletePagesPastDeletedRows(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const result = await runArchive(ctx, f.DeleteConfigID);
    AssertEqual(result.ArchivedRecords, OLD_DOCUMENT_RUNS, 'ARP3: rows deleted in one run');

    const remaining = await remainingDocumentRunIds(ctx);
    const survivors = f.OldDocumentRunIDs.filter(id => remaining.has(id.toUpperCase()));
    AssertEqual(survivors.length, 0, 'ARP3: old document runs left after the run');
    for (const id of f.RecentDocumentRunIDs) {
        Assert(remaining.has(id.toUpperCase()), `ARP3: recent document run ${id} was deleted`);
    }
    console.log(`      → ${OLD_DOCUMENT_RUNS} old rows deleted in pages of ${BATCH_SIZE}; ${RECENT_DOCUMENT_RUNS} recent rows kept`);
}

async function deleteRows(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<void> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView({
        EntityName: entityName, ExtraFilter: filter, IgnoreMaxRows: true, BypassCache: true, ResultType: 'entity_object',
    }, ctx.User);
    for (const row of result.Success ? result.Results : []) {
        await row.Delete().catch(() => undefined);
    }
}

/** Deletes a fixture configuration with its runs, run details and entity rows. */
async function deleteConfiguration(ctx: IntegrationCheckContext, configId: string): Promise<void> {
    const runs = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: RUN_ENTITY, ExtraFilter: `ArchiveConfigurationID = '${configId}'`, Fields: ['ID'], BypassCache: true, ResultType: 'simple',
    }, ctx.User);
    for (const run of runs.Success ? runs.Results : []) {
        await deleteRows(ctx, RUN_DETAIL_ENTITY, `ArchiveRunID = '${run.ID}'`);
    }
    await deleteRows(ctx, RUN_ENTITY, `ArchiveConfigurationID = '${configId}'`);
    await deleteRows(ctx, CONFIG_ENTITY_ENTITY, `ArchiveConfigurationID = '${configId}'`);
    await deleteRows(ctx, CONFIG_ENTITY, `ID = '${configId}'`);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Every check writes; a deterministic-only run writes nothing.
        if (!MutationTierOn(ctx)) {
            skipReason = MUTATION_TIER_OFF_REASON;
            return;
        }
        const f: ArchivePagingFixture = {
            Prefix: `it180-${Date.now()}`, ConfigID: '', ConfigEntityID: '', DeleteConfigID: '',
            // A whole-second instant in 2001 that no other row carries, so equality on it is exact.
            MarkerIso: new Date(Date.UTC(2001, 0, 1) + (Date.now() % 31_536_000) * 1000).toISOString(),
            OldDocumentRunIDs: [], RecentDocumentRunIDs: [], OldLogIDs: [], RecentLogIDs: [], StrippedLogID: '',
        };
        fixture = f;
        const actionId = await firstActionId(ctx);
        for (let i = 0; i < OLD_ROWS; i++) {
            f.OldLogIDs.push(await createLog(ctx, f.Prefix, actionId, RETENTION_DAYS + 10 + i, true));
        }
        for (let i = 0; i < RECENT_ROWS; i++) {
            f.RecentLogIDs.push(await createLog(ctx, f.Prefix, actionId, i, true));
        }
        f.StrippedLogID = await createLog(ctx, f.Prefix, actionId, RETENTION_DAYS + 5, false);
        await createConfiguration(ctx, f);
        const documentId = await firstEntityDocumentId(ctx);
        for (let i = 0; i < OLD_DOCUMENT_RUNS; i++) {
            f.OldDocumentRunIDs.push(await createDocumentRun(ctx, f, documentId, RETENTION_DAYS + 10 + i));
        }
        for (let i = 0; i < RECENT_DOCUMENT_RUNS; i++) {
            f.RecentDocumentRunIDs.push(await createDocumentRun(ctx, f, documentId, i));
        }
        await createDeleteConfiguration(ctx, f);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = undefined;
        skipReason = undefined;
        if (!f) {
            return;
        }
        for (const configId of [f.ConfigID, f.DeleteConfigID].filter(id => !!id)) {
            await deleteConfiguration(ctx, configId);
        }
        await deleteRows(ctx, LOG_ENTITY, `ResultCode = '${f.Prefix}'`);
        await deleteRows(ctx, DOCUMENT_RUN_ENTITY, `EndedAt = '${f.MarkerIso}'`);
    },
});

export const ArchivePagingChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.ARP1`, Name: 'ARP1: one archive run strips every row past the cutoff, page by page', Fn: checkArp1OneRunStripsEveryOldRow, RequiresMutation: true },
    { Id: `${BUNDLE}.ARP2`, Name: 'ARP2: a second run loads no already-stripped row', Fn: checkArp2SecondRunLoadsNothing, RequiresMutation: true },
    { Id: `${BUNDLE}.ARP3`, Name: 'ARP3: a HardDelete run deletes every row past the cutoff, page by page', Fn: checkArp3HardDeletePagesPastDeletedRows, RequiresMutation: true },
];

for (const check of ArchivePagingChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
