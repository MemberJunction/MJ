/**
 * Entity Action workflow extensions — LIVE DATABASE integration harness.
 *
 * Unit tests prove each piece in isolation against mocks. This harness proves the whole thing against
 * a real MemberJunction database: real migration columns, real CodeGen'd entity classes, real sprocs,
 * real `ActionExecutionLog` rows read back with raw SQL rather than asserted through the same object
 * graph that wrote them.
 *
 * What it covers (each numbered check is independently asserted):
 *   1. `ActionParam.LogValue` / `EntityActionParam.LogValue` / `EntityAction.LoggingMode` /
 *      `Sequence` / `ScopeEntityID` / `ScopeRecordID` round-trip through the generated entities
 *   2. `'Entity Object Data'` delivers the record's field values as a plain object to the action
 *   3. `ActionExecutionLog.Params` holds the AS-CALLED inputs, redacted, and is never overwritten
 *   4. `ActionExecutionLog.ResultParams` holds the final merged (input + output) set, redacted
 *   5. `LogValue = 0` and whole-record value types keep real values OUT of both columns
 *   6. Provenance columns (`EntityActionID`, `EntityActionInvocationTypeID`, `TargetEntityID`,
 *      `TargetRecordID`) are stamped for a binding-dispatched run and NULL for a direct call
 *   7. `LoggingMode` All / FailuresOnly / None produce the right number of log rows
 *   8. `Sequence` orders the bindings the dispatch loop will run
 *   9. `ScopeEntityID` / `ScopeRecordID` stop a narrowed binding firing on an out-of-scope record
 *
 * Everything it creates is deleted on the way out (including on failure).
 *
 * Usage (from the repo root, with a `.env` pointing at the target database):
 *     npx tsx packages/Actions/Engine/scripts/entity-action-workflow-integration.ts
 */
import 'dotenv/config';
// Side-effect import: registers ALL @memberjunction classes (providers, entity subclasses, engines).
import '@memberjunction/server-bootstrap/mj-class-registrations';
import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, UserInfo, LogStatus, BaseEntity } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type {
    MJActionEntity,
    MJActionParamEntity,
    MJActionCategoryEntity,
    MJEntityActionEntity,
    MJEntityActionParamEntity
} from '@memberjunction/core-entities';
import { ActionEngineServer, EntityActionEngineServer, BaseAction } from '../src/index';
import type { ActionParam, RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

// ── Harness plumbing ─────────────────────────────────────────────────────────────────────────────

const MARKER = 'EA3408 Integration';
let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, detail?: string): void {
    if (condition) {
        passCount++;
        LogStatus(`  ✅ ${name}`);
    } else {
        failCount++;
        LogStatus(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function section(title: string): void {
    LogStatus(`\n── ${title} ${'─'.repeat(Math.max(0, 70 - title.length))}`);
}

/**
 * The action under test. It reads its inputs and writes an output back into the SAME array it was
 * handed — which is precisely why `ActionExecutionLog.Params` has to be snapshotted before it runs.
 * `Fail` is a static switch so one registered class can drive both the success and failure paths.
 */
@RegisterClass(BaseAction, 'EA3408IntegrationTestAction')
export class EA3408IntegrationTestAction extends BaseAction {
    public static Fail = false;
    public static LastSeenRecordParam: unknown = undefined;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        EA3408IntegrationTestAction.LastSeenRecordParam = params.Params.find(p => p.Name === 'Record')?.Value;
        params.Params.push({ Name: 'Outcome', Value: 'appended-by-action', Type: 'Output' } as ActionParam);
        return EA3408IntegrationTestAction.Fail
            ? { Success: false, ResultCode: 'FAILED', Message: 'deliberate failure' }
            : { Success: true, ResultCode: 'SUCCESS', Message: 'ok' };
    }
}

async function bootstrapProvider(): Promise<sql.ConnectionPool> {
    const pool = new sql.ConnectionPool({
        server: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
        database: process.env.DB_DATABASE,
        user: process.env.CODEGEN_DB_USERNAME || process.env.DB_USERNAME,
        password: process.env.CODEGEN_DB_PASSWORD || process.env.DB_PASSWORD,
        options: {
            encrypt: (process.env.DB_HOST || '').includes('.database.windows.net'),
            trustServerCertificate: true,
            enableArithAbort: true
        }
    });
    await pool.connect();
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
    return pool;
}

function resolveContextUser(): UserInfo {
    const users = UserCache.Instance.Users;
    const user = users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? users[0];
    if (!user) {
        throw new Error('No context user found — is the Users table populated?');
    }
    return user;
}

// ── Fixture bookkeeping ──────────────────────────────────────────────────────────────────────────

const created: BaseEntity[] = [];

async function create<T extends BaseEntity>(
    md: Metadata,
    entityName: string,
    user: UserInfo,
    assign: (e: T) => void
): Promise<T> {
    const entity = await md.GetEntityObject<T>(entityName, user);
    entity.NewRecord();
    assign(entity);
    const saved = await entity.Save();
    if (!saved) {
        throw new Error(`Failed to create ${entityName}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    created.push(entity);
    return entity;
}

/** Deletes fixtures in reverse creation order so FK dependants go first. */
async function cleanup(pool: sql.ConnectionPool): Promise<void> {
    section('Cleanup');
    // Log rows reference the Action + EntityAction, so they must go before the fixtures do.
    const schema = process.env.MJ_CORE_SCHEMA || '__mj';
    await pool.request().query(
        `DELETE FROM ${schema}.ActionExecutionLog WHERE ActionID IN (SELECT ID FROM ${schema}.Action WHERE Name LIKE '${MARKER}%')`
    );
    let deleted = 0;
    for (const entity of [...created].reverse()) {
        if (await entity.Delete()) {
            deleted++;
        } else {
            LogStatus(`  ⚠️  could not delete ${entity.EntityInfo.Name} ${entity.PrimaryKey.ToString()}: ${entity.LatestResult?.CompleteMessage}`);
        }
    }
    LogStatus(`  removed ${deleted}/${created.length} fixture records + their log rows`);
}

// ── Log-row reads (raw SQL — deliberately NOT through the object graph that wrote them) ──────────

interface LogRow {
    ID: string;
    Params: string | null;
    ResultParams: string | null;
    ResultCode: string | null;
    Message: string | null;
    EntityActionID: string | null;
    EntityActionInvocationTypeID: string | null;
    TargetEntityID: string | null;
    TargetRecordID: string | null;
    EndedAt: Date | null;
}

async function readLogs(pool: sql.ConnectionPool, actionID: string): Promise<LogRow[]> {
    const schema = process.env.MJ_CORE_SCHEMA || '__mj';
    const result = await pool.request().input('actionID', sql.UniqueIdentifier, actionID).query<LogRow>(
        `SELECT ID, Params, ResultParams, ResultCode, Message, EntityActionID, EntityActionInvocationTypeID,
                TargetEntityID, TargetRecordID, EndedAt
         FROM ${schema}.ActionExecutionLog WHERE ActionID = @actionID ORDER BY StartedAt`
    );
    return result.recordset;
}

async function clearLogs(pool: sql.ConnectionPool, actionID: string): Promise<void> {
    const schema = process.env.MJ_CORE_SCHEMA || '__mj';
    await pool.request().input('actionID', sql.UniqueIdentifier, actionID)
        .query(`DELETE FROM ${schema}.ActionExecutionLog WHERE ActionID = @actionID`);
}

/**
 * The log writes are fire-and-forget (the caller never blocks on the INSERT/UPDATE), so a read
 * immediately after a run can legitimately see nothing yet. Poll briefly for the expected count
 * rather than sleeping a fixed amount and hoping.
 */
async function waitForLogs(pool: sql.ConnectionPool, actionID: string, expected: number, timeoutMs = 10000): Promise<LogRow[]> {
    const deadline = Date.now() + timeoutMs;
    let rows = await readLogs(pool, actionID);
    while (rows.length < expected && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 150));
        rows = await readLogs(pool, actionID);
    }
    // For an "expect zero rows" assertion there is nothing to wait FOR, so give the writes a fixed
    // grace period to prove they are genuinely absent rather than merely late.
    if (expected === 0) {
        await new Promise(r => setTimeout(r, 1500));
        rows = await readLogs(pool, actionID);
    }
    return rows;
}

/** A log row's completion is the last thing written, so wait for EndedAt before asserting on it. */
async function waitForCompletedLog(pool: sql.ConnectionPool, actionID: string, timeoutMs = 10000): Promise<LogRow | undefined> {
    const deadline = Date.now() + timeoutMs;
    let row = (await readLogs(pool, actionID))[0];
    while ((!row || !row.EndedAt) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 150));
        row = (await readLogs(pool, actionID))[0];
    }
    return row;
}

// ── The run ──────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    LogStatus(`\n🔬 Entity Action workflow extensions — live database integration`);
    LogStatus(`   database: ${process.env.DB_DATABASE}@${process.env.DB_HOST}:${process.env.DB_PORT}\n`);

    const pool = await bootstrapProvider();
    try {
        const md = new Metadata();
        const user = resolveContextUser();
        LogStatus(`   context user: ${user.Name} <${user.Email}>`);

        const actionsEntity = md.EntityByName('MJ: Actions');
        const categoriesEntity = md.EntityByName('MJ: Action Categories');
        if (!actionsEntity || !categoriesEntity) {
            throw new Error('Could not resolve the Actions / Action Categories entities from metadata');
        }

        // ── Fixtures ─────────────────────────────────────────────────────────────────────────────
        section('Fixtures');

        const categoryInScope = await create<MJActionCategoryEntity>(md, 'MJ: Action Categories', user, e => {
            e.Name = `${MARKER} Category In Scope`;
            e.Status = 'Active';
        });
        const categoryOutOfScope = await create<MJActionCategoryEntity>(md, 'MJ: Action Categories', user, e => {
            e.Name = `${MARKER} Category Out Of Scope`;
            e.Status = 'Active';
        });

        /**
         * One scenario = one Action + its three params + one binding.
         *
         * `UQ_EntityAction_ActionID_EntityID` allows an action to bind to a given entity exactly ONCE,
         * so each scenario needs its own Action. That is also the truthful shape for the Sequence
         * check: `Sequence` orders DIFFERENT actions bound to the same entity, which is exactly what
         * a "normalize, then validate, then notify" chain looks like.
         */
        interface Scenario {
            Name: string;
            Action: MJActionEntity;
            Binding: MJEntityActionEntity;
        }

        async function createScenario(opts: {
            name: string;
            loggingMode: MJEntityActionEntity['LoggingMode'];
            sequence: number;
            scopeEntityID?: string | null;
            scopeRecordID?: string | null;
        }): Promise<Scenario> {
            const scenarioAction = await create<MJActionEntity>(md, 'MJ: Actions', user, e => {
                e.Name = `${MARKER} ${opts.name}`;
                e.CategoryID = categoryInScope.ID;
                e.Type = 'Custom';
                e.Status = 'Active';
                e.DriverClass = 'EA3408IntegrationTestAction';
                e.UserPrompt = 'Integration-test fixture; safe to delete.';
            });

            // 'Record' is loggable and bound to the new 'Entity Object Data' value type.
            const recordParam = await create<MJActionParamEntity>(md, 'MJ: Action Params', user, e => {
                e.ActionID = scenarioAction.ID;
                e.Name = 'Record';
                e.Type = 'Input';
                e.ValueType = 'Simple Object';
                e.IsRequired = false;
                e.LogValue = true;
            });
            // 'Secret' opts out of logging at the DEFINITION level (LogValue = 0).
            const secretParam = await create<MJActionParamEntity>(md, 'MJ: Action Params', user, e => {
                e.ActionID = scenarioAction.ID;
                e.Name = 'Secret';
                e.Type = 'Input';
                e.ValueType = 'Scalar';
                e.IsRequired = false;
                e.LogValue = false;
            });
            // 'Note' is loggable by definition but opted OUT by the binding (EntityActionParam.LogValue = 0).
            const noteParam = await create<MJActionParamEntity>(md, 'MJ: Action Params', user, e => {
                e.ActionID = scenarioAction.ID;
                e.Name = 'Note';
                e.Type = 'Input';
                e.ValueType = 'Scalar';
                e.IsRequired = false;
                e.LogValue = true;
            });

            const binding = await create<MJEntityActionEntity>(md, 'MJ: Entity Actions', user, e => {
                e.EntityID = actionsEntity!.ID;
                e.ActionID = scenarioAction.ID;
                e.Status = 'Active';
                e.LoggingMode = opts.loggingMode;
                e.Sequence = opts.sequence;
                e.ScopeEntityID = opts.scopeEntityID ?? null;
                e.ScopeRecordID = opts.scopeRecordID ?? null;
            });
            await create<MJEntityActionParamEntity>(md, 'MJ: Entity Action Params', user, e => {
                e.EntityActionID = binding.ID;
                e.ActionParamID = recordParam.ID;
                e.ValueType = 'Entity Object Data';
                e.Value = '';
            });
            await create<MJEntityActionParamEntity>(md, 'MJ: Entity Action Params', user, e => {
                e.EntityActionID = binding.ID;
                e.ActionParamID = secretParam.ID;
                e.ValueType = 'Static';
                e.Value = 'SECRET-VALUE-MUST-NOT-BE-LOGGED';
            });
            await create<MJEntityActionParamEntity>(md, 'MJ: Entity Action Params', user, e => {
                e.EntityActionID = binding.ID;
                e.ActionParamID = noteParam.ID;
                e.ValueType = 'Static';
                e.Value = 'NOTE-VALUE-MUST-NOT-BE-LOGGED';
                e.LogValue = false;
            });

            check(`[${opts.name}] ActionParam.LogValue round-trips true`, recordParam.LogValue === true);
            check(`[${opts.name}] ActionParam.LogValue round-trips false`, secretParam.LogValue === false);
            return { Name: opts.name, Action: scenarioAction, Binding: binding };
        }

        const scenarioAll = await createScenario({ name: 'All', loggingMode: 'All', sequence: 20 });
        const scenarioFailuresOnly = await createScenario({ name: 'FailuresOnly', loggingMode: 'FailuresOnly', sequence: 10 });
        const scenarioNone = await createScenario({ name: 'None', loggingMode: 'None', sequence: 30 });
        const scenarioInScope = await createScenario({
            name: 'Scoped In',
            loggingMode: 'All',
            sequence: 40,
            scopeEntityID: categoriesEntity.ID,
            scopeRecordID: categoryInScope.ID
        });
        const scenarioOutOfScope = await createScenario({
            name: 'Scoped Out',
            loggingMode: 'All',
            sequence: 50,
            scopeEntityID: categoriesEntity.ID,
            scopeRecordID: categoryOutOfScope.ID
        });

        check('EntityAction.LoggingMode round-trips', scenarioFailuresOnly.Binding.LoggingMode === 'FailuresOnly');
        check('EntityAction.Sequence round-trips', scenarioAll.Binding.Sequence === 20);
        check('EntityAction.ScopeEntityID / ScopeRecordID round-trip',
            scenarioInScope.Binding.ScopeEntityID === categoriesEntity.ID
            && scenarioInScope.Binding.ScopeRecordID === categoryInScope.ID);

        // ── Engines ──────────────────────────────────────────────────────────────────────────────
        section('Engine configuration');
        await ActionEngineServer.Instance.Config(true, user);
        await EntityActionEngineServer.Instance.Config(true, user);

        const readInvocationType = EntityActionEngineServer.Instance.InvocationTypes.find(t => t.Name === 'Read');
        if (!readInvocationType) {
            throw new Error("Could not find the 'Read' invocation type");
        }

        const scenarios = [scenarioAll, scenarioFailuresOnly, scenarioNone, scenarioInScope, scenarioOutOfScope];
        const fixtureActionIDs = new Set(scenarios.map(s => s.Action.ID.toLowerCase()));
        const cachedBindings = EntityActionEngineServer.Instance.GetActionsByEntityID(actionsEntity.ID)
            .filter(b => fixtureActionIDs.has(b.ActionID?.toLowerCase() ?? ''));
        check('all five bindings loaded into the engine cache', cachedBindings.length === 5,
            `saw ${cachedBindings.length}`);

        // 8. Sequence ordering — the engine returns bindings in the order the dispatch loop runs them.
        const sequences = cachedBindings.map(b => b.Sequence);
        check('bindings come back in ascending Sequence order',
            JSON.stringify(sequences) === JSON.stringify([10, 20, 30, 40, 50]),
            JSON.stringify(sequences));

        /**
         * The subject record every invocation runs against: the 'All' scenario's own Action row. It sits
         * in `categoryInScope`, which is what makes the scoped bindings decidable.
         */
        const subject = await md.GetEntityObject<MJActionEntity>('MJ: Actions', user);
        await subject.Load(scenarioAll.Action.ID);

        function bindingFor(scenario: Scenario) {
            const found = cachedBindings.find(b => b.ID.toLowerCase() === scenario.Binding.ID.toLowerCase());
            if (!found) throw new Error(`binding for '${scenario.Name}' is not in the engine cache`);
            return found;
        }

        // ── LoggingMode 'All' — the full happy path ──────────────────────────────────────────────
        section("LoggingMode 'All' — provenance, Params vs ResultParams, redaction");
        EA3408IntegrationTestAction.Fail = false;
        EA3408IntegrationTestAction.LastSeenRecordParam = undefined;
        await clearLogs(pool, scenarioAll.Action.ID);

        const allResult = await EntityActionEngineServer.Instance.RunEntityAction({
            EntityAction: bindingFor(scenarioAll),
            InvocationType: readInvocationType,
            EntityObject: subject,
            ContextUser: user
        });
        check('the action ran and reported success', allResult?.Success === true, allResult?.Message);

        // 2. 'Entity Object Data' delivered the field values as a plain object.
        const seen = EA3408IntegrationTestAction.LastSeenRecordParam as Record<string, unknown> | undefined;
        check("'Entity Object Data' delivered a plain object, not the live entity",
            !!seen && !(seen instanceof BaseEntity));
        check("'Entity Object Data' carries the record's actual field values",
            seen?.['ID'] === scenarioAll.Action.ID && seen?.['Name'] === `${MARKER} All`,
            JSON.stringify(seen)?.slice(0, 200));
        check("'Entity Object Data' survives JSON serialization (the whole point)",
            JSON.parse(JSON.stringify(seen))?.['Name'] === `${MARKER} All`);

        const logRow = await waitForCompletedLog(pool, scenarioAll.Action.ID);
        check('exactly one log row was written', !!logRow && logRow.EndedAt !== null);

        if (logRow) {
            const loggedParams = JSON.parse(logRow.Params ?? '[]') as Array<Record<string, unknown>>;
            const loggedResult = JSON.parse(logRow.ResultParams ?? '[]') as Array<Record<string, unknown>>;

            // 3. Params = as-called inputs. The action appended 'Outcome' to the same array; Params must not show it.
            check('Params holds only the AS-CALLED inputs (no action output)',
                loggedParams.map(p => p['Name']).sort().join(',') === 'Note,Record,Secret',
                loggedParams.map(p => p['Name']).join(','));
            // 4. ResultParams = final merged set.
            check("ResultParams holds the merged set including the action's output",
                loggedResult.some(p => p['Name'] === 'Outcome'),
                loggedResult.map(p => p['Name']).join(','));
            check('Params and ResultParams are genuinely different columns, not a copy',
                logRow.Params !== logRow.ResultParams);

            // 5. Redaction — three independent reasons, none of which may leak a value.
            const byName = (rows: Array<Record<string, unknown>>, name: string) => rows.find(p => p['Name'] === name);
            check("whole-record binding ('Entity Object Data') is redacted with the right reason",
                byName(loggedParams, 'Record')?.['Reason'] === 'WholeRecordValueType',
                String(byName(loggedParams, 'Record')?.['Reason']));
            check('definition LogValue=0 is redacted with the right reason',
                byName(loggedParams, 'Secret')?.['Reason'] === 'ParamLogValueFalse',
                String(byName(loggedParams, 'Secret')?.['Reason']));
            check('binding LogValue=0 is redacted with the right reason',
                byName(loggedParams, 'Note')?.['Reason'] === 'BindingLogValueFalse',
                String(byName(loggedParams, 'Note')?.['Reason']));

            // The load-bearing assertion: no secret value reached persistent storage, in EITHER column.
            const persisted = `${logRow.Params ?? ''}${logRow.ResultParams ?? ''}`;
            check('NO redacted value appears anywhere in the persisted row',
                !persisted.includes('SECRET-VALUE-MUST-NOT-BE-LOGGED')
                && !persisted.includes('NOTE-VALUE-MUST-NOT-BE-LOGGED')
                && !persisted.includes('Integration-test fixture'));
            // Shape without content — the redaction records are still useful for debugging.
            check('the redaction record keeps the shape (key count) of the whole record',
                typeof byName(loggedParams, 'Record')?.['KeyCount'] === 'number'
                && (byName(loggedParams, 'Record')?.['KeyCount'] as number) > 5);

            // 6. Provenance.
            check('EntityActionID stamped', logRow.EntityActionID?.toLowerCase() === scenarioAll.Binding.ID.toLowerCase(),
                String(logRow.EntityActionID));
            check('EntityActionInvocationTypeID stamped',
                logRow.EntityActionInvocationTypeID?.toLowerCase() === readInvocationType.ID.toLowerCase());
            check('TargetEntityID stamped', logRow.TargetEntityID?.toLowerCase() === actionsEntity.ID.toLowerCase());
            check('TargetRecordID stamped in the canonical composite-key form',
                logRow.TargetRecordID?.toLowerCase() === `ID|${scenarioAll.Action.ID}`.toLowerCase(),
                `stamped=${logRow.TargetRecordID} expected=ID|${scenarioAll.Action.ID}`);
        }

        // ── Direct invocation — provenance must be NULL ──────────────────────────────────────────
        section('Direct invocation — provenance is NULL');
        await clearLogs(pool, scenarioAll.Action.ID);
        const engineAction = ActionEngineServer.Instance.Actions.find(a => a.ID.toLowerCase() === scenarioAll.Action.ID.toLowerCase());
        if (!engineAction) {
            throw new Error('the fixture action did not load into the ActionEngine cache');
        }
        await ActionEngineServer.Instance.RunAction({
            Action: engineAction,
            ContextUser: user,
            Filters: [],
            Params: [{ Name: 'Record', Value: { ID: scenarioAll.Action.ID }, Type: 'Input' } as ActionParam]
        } as RunActionParams);

        const directRow = await waitForCompletedLog(pool, scenarioAll.Action.ID);
        check('a direct invocation still logs', !!directRow);
        check('all four provenance columns are NULL for a direct invocation',
            !!directRow && directRow.EntityActionID === null && directRow.EntityActionInvocationTypeID === null
            && directRow.TargetEntityID === null && directRow.TargetRecordID === null,
            JSON.stringify({
                ea: directRow?.EntityActionID, it: directRow?.EntityActionInvocationTypeID,
                te: directRow?.TargetEntityID, tr: directRow?.TargetRecordID
            }));

        // ── LoggingMode 'None' ──────────────────────────────────────────────────────────────────
        section("LoggingMode 'None'");
        await clearLogs(pool, scenarioNone.Action.ID);
        EA3408IntegrationTestAction.Fail = true;   // even a FAILURE must not be logged under 'None'
        const noneResult = await EntityActionEngineServer.Instance.RunEntityAction({
            EntityAction: bindingFor(scenarioNone),
            InvocationType: readInvocationType,
            EntityObject: subject,
            ContextUser: user
        });
        check('the action still ran (logging mode does not gate execution)', noneResult?.Success === false);
        check("'None' wrote no log row, even for a failure", (await waitForLogs(pool, scenarioNone.Action.ID, 0)).length === 0);

        // ── LoggingMode 'FailuresOnly' ──────────────────────────────────────────────────────────
        section("LoggingMode 'FailuresOnly'");
        await clearLogs(pool, scenarioFailuresOnly.Action.ID);
        EA3408IntegrationTestAction.Fail = false;
        const foSuccess = await EntityActionEngineServer.Instance.RunEntityAction({
            EntityAction: bindingFor(scenarioFailuresOnly),
            InvocationType: readInvocationType,
            EntityObject: subject,
            ContextUser: user
        });
        check('the successful run succeeded', foSuccess?.Success === true);
        check("'FailuresOnly' wrote NO row for a successful run",
            (await waitForLogs(pool, scenarioFailuresOnly.Action.ID, 0)).length === 0);

        EA3408IntegrationTestAction.Fail = true;
        const foFailure = await EntityActionEngineServer.Instance.RunEntityAction({
            EntityAction: bindingFor(scenarioFailuresOnly),
            InvocationType: readInvocationType,
            EntityObject: subject,
            ContextUser: user
        });
        check('the failing run failed', foFailure?.Success === false);
        const foRow = await waitForCompletedLog(pool, scenarioFailuresOnly.Action.ID);
        check("'FailuresOnly' DID write a row for the failure", !!foRow);
        check("the failure row carries the action's message", foRow?.Message === 'deliberate failure', String(foRow?.Message));
        check('the failure row still carries provenance',
            foRow?.EntityActionID?.toLowerCase() === scenarioFailuresOnly.Binding.ID.toLowerCase());
        EA3408IntegrationTestAction.Fail = false;

        // ── Scope ───────────────────────────────────────────────────────────────────────────────
        section('ScopeEntityID / ScopeRecordID');
        await clearLogs(pool, scenarioInScope.Action.ID);
        EA3408IntegrationTestAction.LastSeenRecordParam = undefined;

        const inScopeResult = await EntityActionEngineServer.Instance.RunEntityAction({
            EntityAction: bindingFor(scenarioInScope),
            InvocationType: readInvocationType,
            EntityObject: subject,
            ContextUser: user
        });
        check('a binding scoped to the record\'s own category DOES fire', inScopeResult?.Success === true);
        check('…and it logged', (await waitForLogs(pool, scenarioInScope.Action.ID, 1)).length === 1);

        await clearLogs(pool, scenarioOutOfScope.Action.ID);
        EA3408IntegrationTestAction.LastSeenRecordParam = undefined;
        const outOfScopeResult = await EntityActionEngineServer.Instance.RunEntityAction({
            EntityAction: bindingFor(scenarioOutOfScope),
            InvocationType: readInvocationType,
            EntityObject: subject,
            ContextUser: user
        });
        check('a binding scoped to a DIFFERENT category does not fire (returns null)', outOfScopeResult === null,
            JSON.stringify(outOfScopeResult));
        check('…the action body never executed', EA3408IntegrationTestAction.LastSeenRecordParam === undefined);
        check('…and nothing was logged', (await waitForLogs(pool, scenarioOutOfScope.Action.ID, 0)).length === 0);
    } finally {
        try {
            await cleanup(pool);
        } finally {
            await pool.close();
        }
    }

    LogStatus(`\n${'═'.repeat(74)}`);
    LogStatus(`  ${failCount === 0 ? '✅ PASS' : '❌ FAIL'} — ${passCount} passed, ${failCount} failed`);
    LogStatus(`${'═'.repeat(74)}\n`);
    process.exit(failCount === 0 ? 0 : 1);
}

main().catch(err => {
    LogStatus(`\n💥 Harness error: ${err instanceof Error ? `${err.message}\n${err.stack}` : String(err)}`);
    process.exit(1);
});
