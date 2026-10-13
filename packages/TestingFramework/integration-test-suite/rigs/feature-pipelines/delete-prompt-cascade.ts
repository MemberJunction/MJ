/**
 * delete-prompt-cascade.ts — feature-pipeline rig: deletes a SCRATCH AI Prompt that has cascade children through
 * BaseEntity.Delete() and checks what the cascade did. Only rows this rig creates are ever deleted.
 *
 * Scratch rows: prompt A; prompt B whose ResultSelectorPromptID = A (spDeleteAIPrompt NULLs it through
 * spUpdateAIPrompt — the call whose base-view row broke the tracked delete with SQL error 213); one AI Prompt
 * Model of A (deleted through spDeleteAIPromptModel, which returns A's child key as an extra result set).
 *
 * Usage (from the MJ repo root, private env loaded):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/delete-prompt-cascade.ts [--via direct|group|batched] [--force-failure]
 *   direct  (default): A.Delete() on the provider (the generated override wraps it in a provider transaction)
 *   group:   A.Delete() inside a TransactionGroup, sequential submit
 *   batched: A.Delete() inside a TransactionGroup with BatchedSubmit = true
 *   --force-failure (direct only): a temporary trigger on AIPromptModel THROWs when the cascade deletes A's model,
 *   so the delete statement fails and the server aborts the transaction. Expected: Delete() returns false, LatestResult
 *   carries the trigger's error (not "No active transaction to rollback"), nothing was deleted or NULLed, no Delete
 *   record change, and the provider is back at transaction depth 0. The trigger matches only this run's prompt A
 *   and is dropped in `finally` before cleanup.
 * Needs SQL Server (reads the physical rows through an mssql pool). Mutates only its own scratch rows (and, with
 * --force-failure, creates and drops one trigger).
 * Exit: 0 = the outcome and every expectation held, 1 = an expectation failed, 2 = bootstrap or usage error.
 */
import sql from 'mssql';
import { DatabaseProviderBase, RunView, type BaseEntity } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIModelEntity, MJAIPromptEntity, MJAIPromptModelEntity } from '@memberjunction/core-entities';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { RigCLI, RigSQL, RigUsageError, type RigCheck } from '../lib/rig-cli';

type DeleteVia = 'direct' | 'group' | 'batched';
const VIAS: ReadonlyArray<DeleteVia> = ['direct', 'group', 'batched'];

/** The error the forced-failure trigger raises; the rig expects it verbatim in LatestResult. */
const FORCED_FAILURE_MESSAGE = 'forced cascade failure (delete-prompt-cascade rig)';
const FORCED_FAILURE_TRIGGER = 'trgRigForcedCascadeFailure';

/** The parsed command line. */
interface RigArgs {
    Via: DeleteVia;
    ForceFailure: boolean;
}

/** The scratch rows this run created; cleanup touches only these IDs. */
interface ScratchRows {
    PromptA?: string;
    PromptB?: string;
    PromptModel?: string;
}

/** What every scenario needs: the run's provider, the raw pool, the schema and the scratch rows. */
interface RigRun {
    Ctx: IntegrationBootstrapContext;
    Pool: sql.ConnectionPool;
    Schema: string;
    Rows: ScratchRows;
}

/** Parses and checks the command line. @throws RigUsageError on an unknown --via or an unsupported combination. */
function parseArgs(): RigArgs {
    const i = process.argv.indexOf('--via');
    const raw = i < 0 ? 'direct' : process.argv[i + 1];
    const via = VIAS.find((v) => v === raw);
    if (!via) {
        throw new RigUsageError(`--via must be one of ${VIAS.join(', ')}, got '${raw || ''}'`);
    }
    const forceFailure = process.argv.includes('--force-failure');
    if (forceFailure && via !== 'direct') {
        throw new RigUsageError('--force-failure is supported with --via direct only');
    }
    return { Via: via, ForceFailure: forceFailure };
}

/** Creates the trigger that fails the cascade delete of prompt A's AI Prompt Model (dooming the transaction). */
async function createFailureTrigger(run: RigRun): Promise<void> {
    await new sql.Request(run.Pool).batch(
        `CREATE TRIGGER [${run.Schema}].[${FORCED_FAILURE_TRIGGER}] ON [${run.Schema}].[AIPromptModel] AFTER DELETE AS
         BEGIN
             IF EXISTS (SELECT 1 FROM deleted WHERE PromptID = '${EscapeSQLString(run.Rows.PromptA || '')}')
                 THROW 50110, '${FORCED_FAILURE_MESSAGE}', 1;
         END`,
    );
}

/** Drops the forced-failure trigger if it exists. */
async function dropFailureTrigger(run: RigRun): Promise<void> {
    await new sql.Request(run.Pool).batch(`DROP TRIGGER IF EXISTS [${run.Schema}].[${FORCED_FAILURE_TRIGGER}]`);
}

/** Saves a new entity record. @throws Error with the save's message when it fails. */
async function saveOrThrow(entity: BaseEntity, what: string): Promise<void> {
    if (!(await entity.Save())) {
        throw new Error(`could not save ${what}: ${entity.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
}

/** Creates prompt A, prompt B (ResultSelectorPromptID = A) and one AI Prompt Model of A. */
async function createScratch(run: RigRun): Promise<MJAIPromptEntity> {
    const { Ctx: ctx, Rows: rows } = run;
    const md = ctx.Provider; // the run-scoped provider for every load, save and delete — not the global one
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const template = await rv.RunView<MJAIPromptEntity>({
        EntityName: 'MJ: AI Prompts', ResultType: 'entity_object', OrderBy: 'Name', MaxRows: 1,
    }, ctx.User);
    const model = await rv.RunView<MJAIModelEntity>({
        EntityName: 'MJ: AI Models', ResultType: 'entity_object', OrderBy: 'Name', MaxRows: 1,
    }, ctx.User);
    const source = template.Results?.[0];
    const aiModel = model.Results?.[0];
    if (!source || !aiModel) {
        throw new Error('need at least one existing AI Prompt (for its Template/Type) and one AI Model');
    }
    const stamp = new Date().toISOString();

    const a = await md.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', ctx.User);
    a.NewRecord();
    a.Name = `delete-prompt-cascade scratch A ${stamp}`;
    a.TemplateID = source.TemplateID;
    a.TypeID = source.TypeID;
    a.Status = 'Disabled';
    await saveOrThrow(a, 'scratch prompt A');
    rows.PromptA = a.ID;

    const b = await md.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', ctx.User);
    b.NewRecord();
    b.Name = `delete-prompt-cascade scratch B ${stamp}`;
    b.TemplateID = source.TemplateID;
    b.TypeID = source.TypeID;
    b.Status = 'Disabled';
    b.ResultSelectorPromptID = a.ID;
    await saveOrThrow(b, 'scratch prompt B');
    rows.PromptB = b.ID;

    const pm = await md.GetEntityObject<MJAIPromptModelEntity>('MJ: AI Prompt Models', ctx.User);
    pm.NewRecord();
    pm.PromptID = a.ID;
    pm.ModelID = aiModel.ID;
    await saveOrThrow(pm, 'scratch AI Prompt Model');
    rows.PromptModel = pm.ID;
    return a;
}

/** Deletes prompt A the requested way. @returns the delete outcome and the provider's message. */
async function deleteA(ctx: IntegrationBootstrapContext, a: MJAIPromptEntity, via: DeleteVia): Promise<{ Success: boolean; Message: string }> {
    if (via === 'direct') {
        const ok = await a.Delete();
        return { Success: ok, Message: a.LatestResult?.CompleteMessage || '' };
    }
    const group = await ctx.Provider.CreateTransactionGroup();
    group.BatchedSubmit = via === 'batched';
    a.TransactionGroup = group;
    await a.Delete();
    // Submit() is true only when every item's result set held a row; the DB checks verify the effects.
    const submitted = await group.Submit();
    return { Success: submitted && group.Status === 'Complete', Message: submitted ? '' : `group status ${group.Status}` };
}

/** A row-count check against the physical tables: passes when the count equals `expected`. */
async function countCheck(run: RigRun, label: string, query: string, expected: number): Promise<RigCheck> {
    const actual = await RigSQL.Scalar(run.Pool, query);
    return { Label: label, Pass: actual === expected, Detail: `${actual}, expected ${expected}` };
}

/** SQL for the row counts both scenarios check. */
function rowQueries(run: RigRun): { PromptA: string; ModelsOfA: string; BStillOnA: string; BNulled: string; DeleteChangesOfA: string } {
    const id = `'${EscapeSQLString(run.Rows.PromptA || '')}'`;
    const b = `'${EscapeSQLString(run.Rows.PromptB || '')}'`;
    const s = run.Schema;
    return {
        PromptA: `SELECT COUNT(*) AS N FROM [${s}].[AIPrompt] WHERE ID = ${id}`,
        ModelsOfA: `SELECT COUNT(*) AS N FROM [${s}].[AIPromptModel] WHERE PromptID = ${id}`,
        BStillOnA: `SELECT COUNT(*) AS N FROM [${s}].[AIPrompt] WHERE ID = ${b} AND ResultSelectorPromptID = ${id}`,
        BNulled: `SELECT COUNT(*) AS N FROM [${s}].[AIPrompt] WHERE ID = ${b} AND ResultSelectorPromptID IS NULL`,
        DeleteChangesOfA: `SELECT COUNT(*) AS N FROM [${s}].[vwRecordChanges] WHERE Entity = 'MJ: AI Prompts' AND RecordID = 'ID|${EscapeSQLString(run.Rows.PromptA || '')}' AND Type = 'Delete'`,
    };
}

/** The normal delete: everything A owns is gone or NULLed, B is kept, one Delete record change. */
async function runNormalDelete(run: RigRun, a: MJAIPromptEntity, via: DeleteVia): Promise<number> {
    const outcome = await deleteA(run.Ctx, a, via);
    console.log(`A.Delete() via ${via}: success=${outcome.Success}${outcome.Message ? ` message=${outcome.Message}` : ''}`);
    const q = rowQueries(run);
    const checks: RigCheck[] = [
        { Label: `the delete via ${via} reported success`, Pass: outcome.Success, Detail: outcome.Message },
        await countCheck(run, 'prompt A rows', q.PromptA, 0),
        await countCheck(run, 'AI Prompt Models of A', q.ModelsOfA, 0),
        await countCheck(run, 'prompt B rows still referencing A', q.BStillOnA, 0),
        await countCheck(run, 'prompt B rows (kept, FK nulled)', q.BNulled, 1),
        await countCheck(run, 'Delete record changes for A', q.DeleteChangesOfA, 1),
    ];
    if (outcome.Success) {
        run.Rows.PromptA = undefined; // deleted by the code under test
        run.Rows.PromptModel = undefined; // deleted by the cascade
    }
    return RigCLI.ExitCodeOf(checks);
}

/** --force-failure: the delete must fail cleanly, report the real error, and leave every row as it was. */
async function runForcedFailure(run: RigRun, a: MJAIPromptEntity): Promise<number> {
    let threw: string | null = null;
    let deleted = false;
    try {
        deleted = await a.Delete();
    } catch (e) {
        threw = e instanceof Error ? e.message : String(e);
    }
    const message = a.LatestResult?.CompleteMessage || '';
    console.log(`A.Delete() via direct (forced failure): returned=${deleted} threw=${threw || 'no'}`);
    console.log(`LatestResult: success=${a.LatestResult?.Success} message=${message}`);

    const provider = run.Ctx.Provider;
    const q = rowQueries(run);
    const checks: RigCheck[] = [
        { Label: 'Delete() returned false without throwing', Pass: !deleted && threw === null },
        { Label: `LatestResult carries the real error ('${FORCED_FAILURE_MESSAGE}')`, Pass: a.LatestResult?.Success === false && message.includes(FORCED_FAILURE_MESSAGE) },
        { Label: "no 'No active transaction to rollback' anywhere", Pass: !message.includes('No active transaction') && !(threw || '').includes('No active transaction') },
        { Label: 'provider back at transaction depth 0', Pass: provider instanceof DatabaseProviderBase && provider.TransactionDepth === 0 },
        await countCheck(run, 'prompt A rows (rolled back, kept)', q.PromptA, 1),
        await countCheck(run, 'AI Prompt Models of A (kept)', q.ModelsOfA, 1),
        await countCheck(run, 'prompt B still referencing A (NULL rolled back)', q.BStillOnA, 1),
        await countCheck(run, 'Delete record changes for A', q.DeleteChangesOfA, 0),
    ];
    return RigCLI.ExitCodeOf(checks);
}

/** Removes whatever scratch rows remain (child first), by ID, on the raw pool. */
async function cleanup(run: RigRun): Promise<void> {
    const q = (id: string): string => `'${EscapeSQLString(id)}'`;
    const statements: string[] = [];
    if (run.Rows.PromptModel) statements.push(`DELETE FROM [${run.Schema}].[AIPromptModel] WHERE ID = ${q(run.Rows.PromptModel)}`);
    if (run.Rows.PromptB) statements.push(`DELETE FROM [${run.Schema}].[AIPrompt] WHERE ID = ${q(run.Rows.PromptB)}`);
    if (run.Rows.PromptA) statements.push(`DELETE FROM [${run.Schema}].[AIPrompt] WHERE ID = ${q(run.Rows.PromptA)}`);
    for (const s of statements) {
        await new sql.Request(run.Pool).query(s);
    }
}

async function main(): Promise<number> {
    const args = parseArgs();
    const ctx = await BootstrapIntegrationServer();
    const pool = ctx.Pool;
    if (!pool) {
        console.error('this rig needs SQL Server (no mssql pool)');
        await ctx.ClosePool();
        return 2;
    }
    const run: RigRun = { Ctx: ctx, Pool: pool, Schema: ctx.Provider.ConfigData.MJCoreSchemaName, Rows: {} };
    try {
        const a = await createScratch(run);
        console.log(`scratch: A=${run.Rows.PromptA} B=${run.Rows.PromptB} (ResultSelectorPromptID=A) PromptModel=${run.Rows.PromptModel}`);
        if (!args.ForceFailure) {
            return await runNormalDelete(run, a, args.Via);
        }
        await createFailureTrigger(run);
        console.log(`forced failure: trigger ${FORCED_FAILURE_TRIGGER} THROWs on deleting A's AI Prompt Model`);
        return await runForcedFailure(run, a);
    } finally {
        if (args.ForceFailure) {
            // Logged, never thrown: the scratch-row cleanup and ClosePool below must run regardless.
            try {
                await dropFailureTrigger(run);
            } catch (e) {
                console.error(`could not drop trigger ${FORCED_FAILURE_TRIGGER}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        try {
            await cleanup(run);
        } finally {
            await ctx.ClosePool();
        }
    }
}

void RigCLI.Main(main);
