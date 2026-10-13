/**
 * cascade-delete-lock-race.ts — cascading-delete rig: proves against the real database that the record-change-tracked
 * delete of a `CascadeDeletes` entity cannot be credited with a delete another session performed.
 *
 * The provider's cascading delete batch reads "the row exists" before its EXEC and "the row is gone" after it, and
 * writes the Delete record change only then. Two guards make that atomic: the before-check reads the row
 * `WITH (UPDLOCK, HOLDLOCK)` (`SQLServerDataProvider.CascadingDeleteLockHints`), and the batch runs check + EXEC +
 * re-check inside one transaction — joining the caller's, or opening its own when none is open
 * (`@__mj_OwnsDeleteTransaction`). Without them a concurrent delete landing between the check and the EXEC makes this
 * caller report a delete it did not do, and write its audit row.
 *
 * Session A deletes a SCRATCH AI Prompt (no children) through a provider subclass that puts `WAITFOR DELAY` between
 * the before-check and the EXEC — the window. One second in, session B (a separate pooled connection) runs a plain
 * `DELETE` of the same row with `SET LOCK_TIMEOUT`. Expected: B is blocked by A's update lock (error 1222), A's delete
 * succeeds, the row is gone, and exactly one Delete record change exists.
 *
 * Usage (from the MJ repo root, private env loaded — the DB comes from DB_DATABASE):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/cascade-delete-lock-race.ts [--mode joined|owned] [--flip lock-hints]
 *   joined (default): prompt.Delete() — the generated override opens a transaction on the record's provider; the batch joins it.
 *   owned:            provider.Delete() directly with no transaction open — the batch opens and commits its own.
 *   --flip lock-hints: MUTATION — the subclass renders the before-check with no table hints. The rig is then expected to
 *                      FAIL (B is not blocked and A is credited anyway): that is the guard being exposed.
 * Exit: 0 = every expectation held, 1 = an expectation failed, 2 = bootstrap or usage error.
 */
import sql from 'mssql';
import { BaseEntity, EntityDeleteOptions, RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIPromptEntity } from '@memberjunction/core-entities';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { BootstrapIntegrationServer, Settle, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { RigCLI, RigSQL, RigUsageError, type RigCheck } from '../lib/rig-cli';

/** How long session A holds the window open between its before-check and its EXEC. */
const WINDOW_SECONDS = 3;
/** When session B tries its delete, measured from A's start. */
const B_START_MS = 1000;
/** How long B waits for a lock before giving up (SQL Server error 1222). */
const B_LOCK_TIMEOUT_MS = 1500;
const LOCK_TIMEOUT_ERROR = 1222;

type Mode = 'joined' | 'owned';

/**
 * The real provider with the race window opened: a WAITFOR between the locked before-check and the EXEC of the
 * delete procedure. With `flipLockHints` it also renders the before-check without its table hints (the mutation).
 */
class LockRaceProvider extends SQLServerDataProvider {
    constructor(private readonly flipLockHints: boolean) {
        super();
    }

    protected override RenderDeleteProcCall(entity: BaseEntity): string {
        return `WAITFOR DELAY '00:00:0${WINDOW_SECONDS}';\n                        ${super.RenderDeleteProcCall(entity)}`;
    }

    protected override get CascadingDeleteLockHints(): string {
        return this.flipLockHints ? '' : super.CascadingDeleteLockHints;
    }
}

function parseArgs(): { Mode: Mode; FlipLockHints: boolean } {
    const modeIndex = process.argv.indexOf('--mode');
    const raw = modeIndex < 0 ? 'joined' : process.argv[modeIndex + 1];
    if (raw !== 'joined' && raw !== 'owned') {
        throw new RigUsageError(`--mode must be joined or owned, got '${raw || ''}'`);
    }
    const flipIndex = process.argv.indexOf('--flip');
    if (flipIndex >= 0 && process.argv[flipIndex + 1] !== 'lock-hints') {
        throw new RigUsageError(`--flip supports only lock-hints, got '${process.argv[flipIndex + 1] || ''}'`);
    }
    return { Mode: raw, FlipLockHints: flipIndex >= 0 };
}

/** Creates a disabled scratch AI Prompt with no children. @returns its ID. */
async function createScratchPrompt(ctx: IntegrationBootstrapContext): Promise<string> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const template = await rv.RunView<MJAIPromptEntity>({ EntityName: 'MJ: AI Prompts', ResultType: 'entity_object', OrderBy: 'Name', MaxRows: 1 }, ctx.User);
    const source = template.Results?.[0];
    if (!source) {
        throw new Error('need at least one existing AI Prompt (for its Template/Type)');
    }
    const prompt = await ctx.Provider.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', ctx.User);
    prompt.NewRecord();
    prompt.Name = `cascade-delete-lock-race scratch ${new Date().toISOString()}`;
    prompt.TemplateID = source.TemplateID;
    prompt.TypeID = source.TypeID;
    prompt.Status = 'Disabled';
    if (!(await prompt.Save())) {
        throw new Error(`could not save the scratch prompt: ${prompt.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
    return prompt.ID;
}

/** Session B: a plain delete of the row with a lock timeout. @returns rows deleted, or the SQL error number. */
async function sessionBDelete(pool: sql.ConnectionPool, schema: string, id: string): Promise<{ RowsDeleted: number; ErrorNumber: number | null }> {
    try {
        const res = await new sql.Request(pool).query(
            `SET LOCK_TIMEOUT ${B_LOCK_TIMEOUT_MS}; DELETE FROM [${schema}].[AIPrompt] WHERE ID = '${EscapeSQLString(id)}';`,
        );
        return { RowsDeleted: res.rowsAffected.reduce((a, b) => a + b, 0), ErrorNumber: null };
    } catch (e) {
        const number = e instanceof sql.RequestError ? e.number : null;
        return { RowsDeleted: 0, ErrorNumber: number || -1 };
    }
}

/** Session A: deletes the prompt through the race provider, the requested way. @returns whether the delete reported success. */
async function sessionADelete(provider: LockRaceProvider, ctx: IntegrationBootstrapContext, id: string, mode: Mode): Promise<boolean> {
    const prompt = await provider.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', ctx.User);
    if (!(await prompt.Load(id))) {
        throw new Error(`could not load scratch prompt ${id}`);
    }
    if (mode === 'joined') {
        return prompt.Delete();
    }
    return provider.Delete(prompt, new EntityDeleteOptions(), ctx.User);
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
    const schema = ctx.Provider.ConfigData.MJCoreSchemaName;
    let promptID: string | null = null;
    try {
        promptID = await createScratchPrompt(ctx);
        const provider = new LockRaceProvider(args.FlipLockHints);
        await provider.Config(new SQLServerProviderConfigData(pool, schema));
        console.log(`scratch prompt ${promptID}; mode=${args.Mode}${args.FlipLockHints ? ' MUTATION: no lock hints on the before-check' : ''}`);

        const started = Date.now();
        const aOutcome = sessionADelete(provider, ctx, promptID, args.Mode);
        await Settle(B_START_MS);
        const b = await sessionBDelete(pool, schema, promptID);
        console.log(`session B after ${Date.now() - started} ms: rowsDeleted=${b.RowsDeleted} error=${b.ErrorNumber || 'none'}`);
        const aDeleted = await aOutcome;
        console.log(`session A after ${Date.now() - started} ms: Delete() returned ${aDeleted}`);

        const id = `'${EscapeSQLString(promptID)}'`;
        const rowsLeft = await RigSQL.Scalar(pool, `SELECT COUNT(*) AS N FROM [${schema}].[AIPrompt] WHERE ID = ${id}`);
        const deleteChanges = await RigSQL.Scalar(pool, `SELECT COUNT(*) AS N FROM [${schema}].[vwRecordChanges] WHERE Entity = 'MJ: AI Prompts' AND RecordID = 'ID|${EscapeSQLString(promptID)}' AND Type = 'Delete'`);
        const checks: RigCheck[] = [
            { Label: 'session B was blocked by A\'s lock (lock timeout)', Pass: b.ErrorNumber === LOCK_TIMEOUT_ERROR && b.RowsDeleted === 0, Detail: `error=${b.ErrorNumber || 'none'} rowsDeleted=${b.RowsDeleted}` },
            { Label: 'session A deleted the row and reported success', Pass: aDeleted, Detail: `returned ${aDeleted}` },
            { Label: 'the row is gone', Pass: rowsLeft === 0, Detail: `${rowsLeft} left` },
            { Label: 'exactly one Delete record change, and it is A\'s own delete', Pass: deleteChanges === 1 && b.RowsDeleted === 0, Detail: `${deleteChanges} record change(s); B deleted ${b.RowsDeleted}` },
        ];
        if (rowsLeft === 0) {
            promptID = null; // nothing left to clean up
        }
        return RigCLI.ExitCodeOf(checks);
    } finally {
        try {
            if (promptID) {
                await new sql.Request(pool).query(`DELETE FROM [${schema}].[AIPrompt] WHERE ID = '${EscapeSQLString(promptID)}'`);
            }
        } finally {
            await ctx.ClosePool();
        }
    }
}

void RigCLI.Main(main);
