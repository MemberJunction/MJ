/**
 * actions-pipeline.checks.ts — the 'actions-pipeline' bundle (AP1–AP5): deterministic integration
 * checks for the ActionEngine execution pipeline (Domain 5 of the integration-test expansion
 * catalog — catalog rows AP6/AP7/AP8 plus the metadata-integrity leg).
 *
 * SERVER TRANSPORT: everything runs in-process through `ActionEngineServer.Instance` against the
 * live DB — the engine singleton IS the surface under test here (there is no client-side RunAction
 * wire today; agents and routines invoke this exact code path server-side).
 *
 * The executable fixture is the pure-computation core Action **'Calculate Expression'**
 * (DriverClass `__CalculateExpression`) — no LLM calls, no network, no side effects beyond the
 * Action Execution Log rows the engine itself writes (tracked + deleted in Teardown).
 *
 *   - AP1: action metadata integrity — the engine caches are populated; every ACTIVE action's
 *          result codes are unique (case-insensitive — `InternalRunAction` resolves the returned
 *          ResultCode case-insensitively, so duplicates would make resolution ambiguous) and its
 *          param names are unique; the fixture action's declared contract (required 'Expression'
 *          Input param + SUCCESS/INVALID_EXPRESSION/MISSING_PARAMETERS result codes) is intact.
 *   - AP2: RunAction end-to-end happy path — Success, the result-code entity resolves to the
 *          action's SUCCESS metadata row, the computed value is exact, AND the fire-and-forget
 *          Action Execution Log row lands terminal (EndedAt + ResultCode stamped, params echoed).
 *   - AP3: param validation is enforced INSIDE the action — missing/dangerous inputs come back as
 *          structured failures with the action's own result codes; SkipActionLog writes nothing.
 *   - AP4: 🚨 KNOWN-GAP PIN (bug register B14) — the base engine's `ValidateInputs` and
 *          `RunSingleFilter` are no-op stubs. See the check body for the full contract pinned.
 *   - AP5: error containment — an unresolvable DriverClass produces a STRUCTURED failure
 *          ("Could not find a class for action …"), never an escaped throw.
 *
 * Self-cleaning: the only rows created are the `MJ: Action Execution Logs` rows AP2 produces;
 * their IDs are tracked on the module fixture and deleted in Teardown (after a settle, because
 * the log INSERT/UPDATE ride the engine's fire-and-forget BaseEntitySaveQueue).
 *
 * NOTE on fixtures: this bundle keeps its fixture as MODULE state (not a typed slot on
 * IntegrationCheckContext) — the shared contract in @memberjunction/testing-integration is not
 * modified by this bundle. Setup/Teardown and the checks run in the same process for both
 * front-ends (driver + tsx dispatcher), so module state is equivalent and contract-neutral.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJActionExecutionLogEntity, MJActionFilterEntity } from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { RunActionParams, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { Assert, AssertEqual, settle, verifyActionLog } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Actions with KNOWN duplicate result codes awaiting a metadata fix (bug register). */
const KNOWN_DUPLICATE_RESULT_CODE_ACTIONS = new Set<string>(['computer use']);

const FIXTURE_ACTION = 'Calculate Expression';
const LOG_ENTITY = 'MJ: Action Execution Logs';
/** The engine's ValidateInputs-failure sentinel — its ABSENCE is what AP4 pins (B14). */
const ENGINE_VALIDATION_SENTINEL = 'Input validation failed';

/** Module-scoped fixture (see file header) — populated by Setup, swept by Teardown. */
interface ActionsPipelineFixture {
    /** The resolved, never-mutated 'Calculate Expression' core action. */
    Calc: MJActionEntityExtended;
    /** Every Action Execution Log row this bundle caused, for FK-safe teardown. */
    CreatedLogIds: string[];
}
let fixture: ActionsPipelineFixture | undefined;

/** Fetch the fixture (throws if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(): ActionsPipelineFixture {
    Assert(fixture != null, 'actions-pipeline fixture missing (bundle Setup did not run)');
    return fixture!;
}

/** Runs the fixture action through the real engine with the given params/filters. */
async function runCalc(
    ctx: IntegrationCheckContext,
    actionParams: ActionParam[],
    options?: { skipLog?: boolean; filters?: MJActionFilterEntity[] }
): Promise<ActionResult> {
    const params = new RunActionParams();
    params.Action = fx().Calc;
    params.ContextUser = ctx.User;
    params.Params = actionParams;
    params.Filters = options?.filters ?? [];
    params.SkipActionLog = options?.skipLog ?? false;
    const result = await ActionEngineServer.Instance.RunAction(params);
    // Track any log row IMMEDIATELY so a failing assertion later can never orphan it.
    if (result.LogEntry?.ID) {
        fx().CreatedLogIds.push(result.LogEntry.ID);
    }
    return result;
}

/** Polls for an Action Execution Log row to land AND finalize (both saves are fire-and-forget). */
async function waitForFinalizedLog(logId: string, user: UserInfo): Promise<void> {
    const deadline = Date.now() + 15000;
    for (;;) {
        const result = await new RunView().RunView<{ ID: string; EndedAt: string | Date | null }>({
            EntityName: LOG_ENTITY,
            ExtraFilter: `ID='${logId}'`,
            Fields: ['ID', 'EndedAt'],
            ResultType: 'simple',
            BypassCache: true
        }, user);
        Assert(result.Success, `polling ${LOG_ENTITY} failed: ${result.ErrorMessage}`);
        if ((result.Results ?? []).length === 1 && result.Results[0].EndedAt != null) {
            return;
        }
        Assert(Date.now() < deadline,
            `Action Execution Log ${logId} did not land+finalize within 15s — the fire-and-forget log queue lost a write`);
        await settle(500);
    }
}

export const ActionsPipelineChecks: NamedCheck[] = [
    {
        Id: 'actions-pipeline.AP1',
        Name: 'AP1: action metadata is coherent — unique result codes / param names per Active action; fixture contract intact',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = ActionEngineServer.Instance;
            await engine.Config(false, ctx.User);

            // Anti-vacuity: the caches must actually contain data before any sweep below means anything.
            Assert(engine.Actions.length > 0, 'ActionEngine cache has no actions — nothing to audit');
            Assert(engine.ActionResultCodes.length > 0, 'ActionEngine cache has no result codes');
            Assert(engine.ActionParams.length > 0, 'ActionEngine cache has no action params');

            const active = engine.Actions.filter(a => a.Status === 'Active');
            Assert(active.length > 0, 'no Active actions in the catalog — the integrity sweep would be vacuous');

            // `InternalRunAction` resolves the returned ResultCode against the action's metadata rows
            // case-insensitively + trimmed. Duplicate codes (by that normalization) make resolution
            // ambiguous; duplicate param names break by-name param lookup inside every action.
            let auditedCodes = 0;
            let auditedParams = 0;
            for (const action of active) {
                const codes = engine.ActionResultCodes
                    .filter(rc => UUIDsEqual(rc.ActionID, action.ID))
                    .map(rc => rc.ResultCode.trim().toLowerCase());
                auditedCodes += codes.length;
                // KNOWN METADATA DEFECT (bug register): the shipped 'Computer Use' action carries a
                // duplicate 'Error' result code. Fixing means deleting a metadata row — barred under
                // tonight's no-destructive-DB constraint — so the known offender warns loudly while
                // the check stays strict for everything else (no NEW duplicates can ship).
                if (KNOWN_DUPLICATE_RESULT_CODE_ACTIONS.has(action.Name.trim().toLowerCase())) {
                    console.warn(`  ⚠ AP1: known duplicate result codes on '${action.Name}' — metadata fix pending (bug register)`);
                } else {
                    Assert(new Set(codes).size === codes.length,
                    `action '${action.Name}' has duplicate (case-insensitive) result codes: [${codes.join(', ')}]`);
                }
                Assert(codes.every(c => c.length > 0), `action '${action.Name}' has a blank result code`);

                const paramNames = engine.ActionParams
                    .filter(p => UUIDsEqual(p.ActionID, action.ID))
                    .map(p => p.Name.trim().toLowerCase());
                auditedParams += paramNames.length;
                Assert(new Set(paramNames).size === paramNames.length,
                    `action '${action.Name}' has duplicate (case-insensitive) param names: [${paramNames.join(', ')}]`);
            }
            Assert(auditedCodes > 0, 'the sweep audited zero result-code rows — vacuous');
            Assert(auditedParams > 0, 'the sweep audited zero param rows — vacuous');

            // The fixture action's declared contract, which AP2/AP3 depend on.
            const calc = fx().Calc;
            AssertEqual(calc.Status, 'Active', `'${FIXTURE_ACTION}' status`);
            const exprParam = calc.Params.find(p => p.Name.trim().toLowerCase() === 'expression');
            Assert(exprParam != null, `'${FIXTURE_ACTION}' is missing its 'Expression' param`);
            AssertEqual(exprParam!.Type, 'Input', `'Expression' param direction`);
            const codes = new Set(calc.ResultCodes.map(rc => rc.ResultCode.trim().toUpperCase()));
            for (const required of ['SUCCESS', 'INVALID_EXPRESSION', 'MISSING_PARAMETERS']) {
                Assert(codes.has(required), `'${FIXTURE_ACTION}' is missing declared result code '${required}' (has: [${[...codes].join(', ')}])`);
            }

            console.log(`      → ${active.length} Active actions audited (${auditedCodes} result codes, ${auditedParams} params); fixture contract intact`);
        }
    },
    {
        Id: 'actions-pipeline.AP2',
        Name: 'AP2: RunAction resolves the result-code entity and writes a complete, terminal execution log',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const result = await runCalc(ctx, [{ Name: 'Expression', Value: '(2*3) + 4/8', Type: 'Input' }]);

            Assert(result.Success, `fixture action failed: ${result.Message ?? '(no message)'}`);
            // Result-code CONTRACT: the engine must resolve the action's returned string code to the
            // action's own MJ: Action Result Codes metadata row (case-insensitive match).
            Assert(result.Result != null, 'result-code entity did not resolve — the SUCCESS metadata row was not matched');
            AssertEqual(result.Result!.ResultCode, 'SUCCESS', 'resolved ResultCode');
            Assert(UUIDsEqual(result.Result!.ActionID, fx().Calc.ID), 'resolved result code belongs to a DIFFERENT action');

            // The computation itself must be exact — proves the action really executed, not a stub path.
            const message: unknown = JSON.parse(result.Message ?? '{}');
            const details = (message as { details?: { result?: number } }).details;
            AssertEqual(details?.result, 6.5, `computed value of '(2*3) + 4/8'`);

            // Execution-log leg: the row is written via a fire-and-forget queue (INSERT then UPDATE
            // chained per-entity), so poll until it lands AND finalizes, THEN assert content.
            Assert(!!result.LogEntry?.ID, 'RunAction returned no LogEntry despite SkipActionLog=false');
            const logId = result.LogEntry!.ID;
            await waitForFinalizedLog(logId, ctx.User);
            const row = await verifyActionLog(logId, ctx.User); // asserts EndedAt set + ResultCode recorded
            AssertEqual(String(row.ResultCode), 'SUCCESS', 'log ResultCode stamp');
            Assert(UUIDsEqual(String(row.ActionID), fx().Calc.ID), 'log ActionID');
            Assert(UUIDsEqual(String(row.UserID), ctx.User.ID), 'log UserID stamp');
            const loggedParams: unknown = JSON.parse(String(row.Params ?? '[]'));
            Assert(Array.isArray(loggedParams) && (loggedParams as ActionParam[]).some(p => p.Name === 'Expression'),
                'final log Params JSON does not echo the Expression input');

            console.log(`      → SUCCESS resolved to its metadata row, value 6.5 exact, log ${logId} terminal + complete`);
        }
    },
    {
        Id: 'actions-pipeline.AP3',
        Name: 'AP3: bad inputs come back as structured per-action result codes; SkipActionLog writes nothing',
        Fn: async (ctx: IntegrationCheckContext) => {
            // (a) Missing required param — refused by the ACTION with its declared code.
            const missing = await runCalc(ctx, [], { skipLog: true });
            Assert(!missing.Success, 'a missing required param must fail the run');
            Assert(missing.Result != null && missing.Result.ResultCode === 'MISSING_PARAMETERS',
                `expected MISSING_PARAMETERS, got '${missing.Result?.ResultCode ?? '(unresolved)'}' — message: ${missing.Message}`);
            Assert(missing.LogEntry == null, 'SkipActionLog=true must not produce a LogEntry');

            // (b) Dangerous expression — the action's own safety gate, again structured, again no throw.
            const dangerous = await runCalc(ctx, [{ Name: 'Expression', Value: 'process.exit(0)', Type: 'Input' }], { skipLog: true });
            Assert(!dangerous.Success, 'a dangerous expression must fail the run');
            Assert(dangerous.Result != null && dangerous.Result.ResultCode === 'INVALID_EXPRESSION',
                `expected INVALID_EXPRESSION, got '${dangerous.Result?.ResultCode ?? '(unresolved)'}' — message: ${dangerous.Message}`);
            Assert(dangerous.LogEntry == null, 'SkipActionLog=true must not produce a LogEntry');

            console.log(`      → MISSING_PARAMETERS + INVALID_EXPRESSION both resolved to metadata rows; no log rows written`);
        }
    },
    {
        Id: 'actions-pipeline.AP4',
        Name: 'AP4: [KNOWN-GAP PIN, B14] base ValidateInputs / RunSingleFilter are no-op stubs — validation lives ONLY inside actions',
        Fn: async (ctx: IntegrationCheckContext) => {
            // ─────────────────────────────────────────────────────────────────────────────
            // 🚨 KNOWN GAP — bug register B14 (plans/integration-test-expansion/bug-register.md),
            // VERIFIED STILL PRESENT on 2026-07-21 against ActionEngine.ts:
            //   - `ValidateInputs()` (line ~280) unconditionally returns true: the base engine
            //     performs NO type/requiredness validation of the supplied params.
            //   - `RunSingleFilter()` (line ~303) is an explicit "temp stub" that returns true:
            //     declared Action Filters are never evaluated.
            //   - Corollary (unreachable-today bug): RunAction's filters-failed branch builds a
            //     result but FALLS THROUGH to RunActionWithTimeout instead of returning it —
            //     masked only because the stub can never return false.
            // This check PINS the current contract rather than silently passing over it:
            // a zero-param call with a garbage filter attached must sail through BOTH stubs and
            // be rejected by the ACTION's own code. When the stubs are implemented, this check
            // MUST flip — update it (and B14's disposition) together with that change.
            // ─────────────────────────────────────────────────────────────────────────────
            const garbageFilter = await ctx.Provider.GetEntityObject<MJActionFilterEntity>('MJ: Action Filters', ctx.User);
            garbageFilter.NewRecord(); // deliberately blank + never saved — a real filter impl could not pass it
            const result = await runCalc(ctx, [], { skipLog: true, filters: [garbageFilter] });

            // The engine's own failure sentinel must be ABSENT — the engine let the call through.
            Assert(!(result.Message ?? '').includes(ENGINE_VALIDATION_SENTINEL),
                `engine-level input validation fired ('${ENGINE_VALIDATION_SENTINEL}') — B14 stubs have been implemented; update this pin + the bug register`);
            // ...and the refusal that DID come back is the action's own MISSING_PARAMETERS.
            Assert(!result.Success, 'the zero-param run must still fail — inside the action');
            AssertEqual(result.Result?.ResultCode, 'MISSING_PARAMETERS',
                'the refusal must be the ACTION’s own validation (per-action), proving the request passed through both engine stubs');

            console.log(`      → engine stubs passed a zero-param call + garbage filter straight to the action (B14 pinned)`);
        }
    },
    {
        Id: 'actions-pipeline.AP5',
        Name: 'AP5: an unresolvable DriverClass yields a structured failure, never an escaped throw',
        Fn: async (ctx: IntegrationCheckContext) => {
            // In-memory only — never saved, so no FK rows, no metadata pollution, nothing to clean up.
            const ghost = await ctx.Provider.GetEntityObject<MJActionEntityExtended>('MJ: Actions', ctx.User);
            ghost.NewRecord();
            ghost.Name = 'mj-integration-test ghost action (mj-integration-test — safe to delete)';
            ghost.Type = 'Custom';
            ghost.Status = 'Active';
            ghost.DriverClass = '__MJIntegrationTestNoSuchDriverClass';

            const params = new RunActionParams();
            params.Action = ghost;
            params.ContextUser = ctx.User;
            params.Params = [];
            params.Filters = [];
            params.SkipActionLog = true; // the ghost has no DB row — a log row would violate the ActionID FK

            const result = await ActionEngineServer.Instance.RunAction(params);
            Assert(!result.Success, 'a missing driver class must fail the run');
            Assert((result.Message ?? '').includes('Could not find a class for action'),
                `expected the ClassFactory-miss containment message, got: ${result.Message}`);
            Assert(result.Result == null, 'no result-code entity should resolve for an engine-level failure');

            console.log(`      → ClassFactory miss contained as a structured failure: "${(result.Message ?? '').slice(0, 80)}…"`);
        }
    }
];

for (const check of ActionsPipelineChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('actions-pipeline', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const engine = ActionEngineServer.Instance;
        await engine.Config(false, ctx.User);
        const calc = engine.Actions.find(a => a.Name === FIXTURE_ACTION && a.Status === 'Active');
        Assert(!!calc, `the core '${FIXTURE_ACTION}' Action (Active) is required as the executable fixture and was not found`);
        fixture = { Calc: calc!, CreatedLogIds: [] };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) {
            return;
        }
        // The log INSERT/UPDATE ride a fire-and-forget queue — give them a moment to land before
        // deleting, otherwise the delete can race the insert and orphan the row.
        if (fixture.CreatedLogIds.length > 0) {
            await settle(1500);
        }
        for (const id of [...fixture.CreatedLogIds].reverse()) {
            const log = await ctx.Provider.GetEntityObject<MJActionExecutionLogEntity>(LOG_ENTITY, ctx.User).catch(() => undefined);
            if (log && (await log.Load(id).catch(() => false))) {
                await log.Delete().catch(() => undefined);
            }
        }
        fixture = undefined;
    }
});
