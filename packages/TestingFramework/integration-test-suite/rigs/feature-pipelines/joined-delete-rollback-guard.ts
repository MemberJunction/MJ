/**
 * joined-delete-rollback-guard.ts — cascading-delete rig: proves against the real database that the record-change-
 * tracked delete of a `CascadeDeletes` entity never rolls back a transaction it JOINED.
 *
 * The provider's cascading delete batch (`SQLServerDataProvider.renderCascadingTrackedDeleteSQL`) opens its own
 * transaction only when none is open (`@__mj_OwnsDeleteTransaction`), and in CATCH rolls back only a transaction it
 * owns. A joined transaction belongs to the caller: rolling it back from inside the batch would silently undo the
 * caller's earlier, unrelated writes and leave the caller's provider believing a transaction is still open.
 *
 * A trigger `THROW` cannot show this (a trigger error dooms the whole transaction either way), so this rig injects a
 * NON-dooming error: a provider subclass appends `RAISERROR(..., 16, 1)` right after the delete procedure's EXEC.
 * With XACT_ABORT OFF (the provider never sets it) a severity-16 error inside TRY moves to CATCH and leaves the
 * transaction committable — exactly the case where the guard decides whether the caller's work survives.
 *
 * Scenario: the caller opens a transaction on the provider, saves a SCRATCH sentinel AI Prompt in it (uncommitted),
 * then deletes a second SCRATCH AI Prompt through `BaseEntity.Delete()` — the generated override nests a scope, so
 * the batch joins the caller's transaction. The injected error fails the delete. Expected: Delete() returns false
 * with the injected error, the caller's transaction is still open (depth 1) and commits, the sentinel row is in the
 * database, the delete target is still there, and no Delete record change was written.
 *
 * Usage (from the MJ repo root, private env loaded — the DB comes from DB_DATABASE):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/joined-delete-rollback-guard.ts
 * To expose the guard, set `@__mj_OwnsDeleteTransaction` to always 1 in SQLServerDataProvider, rebuild that package,
 * and re-run: the rig then FAILS (the batch rolls back the caller's transaction and the sentinel is gone).
 * Needs SQL Server. Mutates only its own scratch rows, which it deletes at the end.
 * Exit: 0 = every expectation held, 1 = an expectation failed, 2 = bootstrap error.
 */
import sql from 'mssql';
import { BaseEntity, RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIPromptEntity } from '@memberjunction/core-entities';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { RigCLI, RigSQL, type RigCheck } from '../lib/rig-cli';

/** The injected error's text; the rig expects it in the failed delete's LatestResult. */
const INJECTED_FAULT = 'joined-delete-rollback-guard rig: injected non-dooming fault';

/** The real provider with one fault injected: a severity-16 error right after the delete procedure's EXEC. */
class FaultInjectingProvider extends SQLServerDataProvider {
    protected override RenderDeleteProcCall(entity: BaseEntity): string {
        return `${super.RenderDeleteProcCall(entity)};\n                        RAISERROR(N'${INJECTED_FAULT}', 16, 1)`;
    }
}

/** The scratch rows this run created; cleanup touches only these IDs. */
interface ScratchRows {
    Target?: string;
    Sentinel?: string;
}

/** Creates a disabled scratch AI Prompt (copying an existing prompt's Template and Type) on `provider`. @returns it, saved. */
async function newScratchPrompt(ctx: IntegrationBootstrapContext, provider: SQLServerDataProvider, label: string): Promise<MJAIPromptEntity> {
    const source = (await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIPromptEntity>({
        EntityName: 'MJ: AI Prompts', ResultType: 'entity_object', OrderBy: 'Name', MaxRows: 1,
    }, ctx.User)).Results?.[0];
    if (!source) {
        throw new Error('need at least one existing AI Prompt (for its Template/Type)');
    }
    const prompt = await provider.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', ctx.User);
    prompt.NewRecord();
    prompt.Name = `joined-delete-rollback-guard ${label} ${new Date().toISOString()}`;
    prompt.TemplateID = source.TemplateID;
    prompt.TypeID = source.TypeID;
    prompt.Status = 'Disabled';
    if (!(await prompt.Save())) {
        throw new Error(`could not save the scratch ${label}: ${prompt.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
    return prompt;
}

/** What happened inside the caller's transaction. */
interface JoinedOutcome {
    Deleted: boolean;
    DeleteMessage: string;
    DepthAfterDelete: number;
    CommitError: string | null;
}

/**
 * The caller's unit of work: open a transaction, save the sentinel in it, delete the target (which joins it and
 * fails on the injected fault), then commit what the caller did.
 */
async function runJoinedDelete(ctx: IntegrationBootstrapContext, provider: FaultInjectingProvider, rows: ScratchRows): Promise<JoinedOutcome> {
    const target = await provider.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', ctx.User);
    if (!(await target.Load(rows.Target || ''))) {
        throw new Error(`could not load the scratch target ${rows.Target}`);
    }
    await provider.BeginTransaction();
    const sentinel = await newScratchPrompt(ctx, provider, 'sentinel (written inside the caller transaction)');
    rows.Sentinel = sentinel.ID;

    const deleted = await target.Delete();
    const outcome: JoinedOutcome = {
        Deleted: deleted,
        DeleteMessage: target.LatestResult?.CompleteMessage || '',
        DepthAfterDelete: provider.TransactionDepth,
        CommitError: null,
    };
    try {
        await provider.CommitTransaction();
    } catch (e) {
        outcome.CommitError = e instanceof Error ? e.message : String(e);
        if (provider.TransactionDepth > 0) {
            await provider.RollbackTransaction();
        }
    }
    return outcome;
}

/** Removes whatever scratch rows remain, by ID, on the raw pool. */
async function cleanup(pool: sql.ConnectionPool, schema: string, rows: ScratchRows): Promise<void> {
    for (const id of [rows.Sentinel, rows.Target]) {
        if (id) {
            await new sql.Request(pool).query(`DELETE FROM [${schema}].[AIPrompt] WHERE ID = '${EscapeSQLString(id)}'`);
        }
    }
}

async function main(): Promise<number> {
    const ctx = await BootstrapIntegrationServer();
    const pool = ctx.Pool;
    if (!pool) {
        console.error('this rig needs SQL Server (no mssql pool)');
        await ctx.ClosePool();
        return 2;
    }
    const schema = ctx.Provider.ConfigData.MJCoreSchemaName;
    const rows: ScratchRows = {};
    try {
        const provider = new FaultInjectingProvider();
        await provider.Config(new SQLServerProviderConfigData(pool, schema));
        rows.Target = (await newScratchPrompt(ctx, provider, 'delete target')).ID;
        console.log(`scratch delete target ${rows.Target}`);

        const outcome = await runJoinedDelete(ctx, provider, rows);
        console.log(`Delete() returned ${outcome.Deleted}; depth after it ${outcome.DepthAfterDelete}; commit ${outcome.CommitError ? `threw: ${outcome.CommitError}` : 'ok'}`);

        const count = (where: string): Promise<number> => RigSQL.Scalar(pool, `SELECT COUNT(*) AS N FROM [${schema}].${where}`);
        const sentinelRows = await count(`[AIPrompt] WHERE ID = '${EscapeSQLString(rows.Sentinel || '')}'`);
        const targetRows = await count(`[AIPrompt] WHERE ID = '${EscapeSQLString(rows.Target)}'`);
        const deleteChanges = await count(`[vwRecordChanges] WHERE Entity = 'MJ: AI Prompts' AND RecordID = 'ID|${EscapeSQLString(rows.Target)}' AND Type = 'Delete'`);
        const checks: RigCheck[] = [
            { Label: 'the delete failed on the injected fault', Pass: !outcome.Deleted && outcome.DeleteMessage.includes(INJECTED_FAULT), Detail: outcome.DeleteMessage.slice(0, 160) },
            { Label: "the caller's transaction is still open after the failed delete", Pass: outcome.DepthAfterDelete === 1, Detail: `depth ${outcome.DepthAfterDelete}` },
            { Label: "the caller's commit succeeded", Pass: outcome.CommitError === null, Detail: outcome.CommitError || '' },
            { Label: "the caller's sentinel row, written before the delete, is committed", Pass: sentinelRows === 1, Detail: `${sentinelRows} row(s)` },
            { Label: 'the delete target is still there (its delete was undone)', Pass: targetRows === 1, Detail: `${targetRows} row(s)` },
            { Label: 'no Delete record change for the target', Pass: deleteChanges === 0, Detail: `${deleteChanges} record change(s)` },
        ];
        return RigCLI.ExitCodeOf(checks);
    } finally {
        try {
            await cleanup(pool, schema, rows);
        } finally {
            await ctx.ClosePool();
        }
    }
}

void RigCLI.Main(main);
