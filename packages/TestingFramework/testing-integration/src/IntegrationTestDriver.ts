/**
 * IntegrationTestDriver.ts — the TestType driver for the "Integration Test" type.
 *
 * Resolved by TestEngine.getDriver() from TestType.DriverClass via
 * MJGlobal.ClassFactory.CreateInstance(BaseTestDriver, 'IntegrationTestDriver').
 *
 * Execute():
 *   1) parse Configuration.checks (an ordered list of check BUNDLES) off MJTestEntity;
 *   2) honor an optional env gate (skip-as-Passed with a note);
 *   3) infer the transport (client-cache ⇒ GraphQL client, else SQL server) and obtain
 *      the run-scoped instrumented provider stack (installed first-caller by the CLI,
 *      or self-bootstrapped in a dedicated process);
 *   4) for each selected bundle, run its registered NamedCheck[] in array order against
 *      ONE shared IntegrationCheckContext — skipping RequiresMutation checks unless the
 *      selector opts in — converting a thrown check into a failing OracleResult (never
 *      re-throwing; a re-throw would leave the TestRun stuck 'Running'). The
 *      runquery-cache bundle gets its Query/Category fixtures created/torn down in a
 *      driver-level try/finally (engine suite hooks don't exist until Phase 4);
 *   5) map the OracleResult[] onto a DriverExecutionResult (counts computed exactly
 *      like AgentEvalDriver). The engine persists oracleResults verbatim to
 *      TestRun.ResultDetails as a BARE ARRAY. When EMIT_OUTCOMES is set, also write a
 *      {name,passed,durationMs,error}[] sidecar for the golden-equivalence diff.
 */
import { RegisterClass } from '@memberjunction/global';
import {
    BaseTestDriver,
    DriverExecutionContext,
    DriverExecutionResult,
    OracleResult
} from '@memberjunction/testing-engine';
import type sql from 'mssql';
import {
    getActiveIntegrationStorage,
    getActiveIntegrationBootstrap,
    getActiveIntegrationClientBootstrap,
    bootstrapIntegrationServer,
    bootstrapIntegrationClient
} from './bootstrap';
import type { InstrumentedLocalStorageProvider } from './instrumented-cache';
import type { IntegrationCheckContext } from './check';
import { IntegrationCheckRegistry } from './check-registry';
import { IntegrationTestConfig } from './types';
import { TestOutcome, writeOutcomesFile } from './test-runner';
import { createRunQueryFixtures, teardownRunQueryFixtures } from './checks/runquery-cache.checks';

const TARGET_TYPE = 'Integration Check Bundle';
/** The one bundle that runs against the GraphQL client transport. */
const CLIENT_BUNDLE = 'client-cache';
/** The one bundle that needs self-contained Query/Category fixtures. */
const FIXTURE_BUNDLE = 'runquery-cache';

@RegisterClass(BaseTestDriver, 'IntegrationTestDriver')
export class IntegrationTestDriver extends BaseTestDriver {
    /** The driver arms its own timeout and breaks the check loop when it fires. */
    public override supportsCancellation(): boolean {
        return true;
    }

    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        const startTime = Date.now();
        this.logToTestRun(context, 'info', 'Starting integration test execution');

        // 1) Parse Configuration. parseConfig throws on missing/bad JSON — convert to a
        //    Failed/Error result rather than re-throwing (re-throw would leave TestRun 'Running').
        let config: IntegrationTestConfig;
        try {
            config = this.parseConfig<IntegrationTestConfig>(context.test);
        } catch (err) {
            return this.buildErrorResult(context, startTime, (err as Error).message);
        }

        // 2) Env gate (gated-tier / local-dev safety net). Skip-as-Passed with a gate note
        //    when the required env var is unset — the driver result enum has no 'Skipped'.
        if (config.requiresEnv && process.env[config.requiresEnv] !== '1') {
            const note = `Skipped: ${config.requiresEnv} not set`;
            this.logToTestRun(context, 'warn', note);
            return this.buildSkipResult(context, startTime, note);
        }

        const selectors = Array.isArray(config.checks) ? config.checks : [];
        const transport: 'server' | 'client' =
            config.transport ?? (selectors.some(s => this.bundleTransport(s.type) === 'client') ? 'client' : 'server');

        // 3) Arm a driver-side timeout (the engine never applies one). On fire we abort the
        //    check loop between checks; partial results become a 'Timeout' result.
        const effectiveTimeout = this.getEffectiveTimeout(context.test);
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; }, effectiveTimeout);

        const oracleResults: OracleResult[] = [];
        const outcomes: TestOutcome[] = []; // parallel array for the EMIT_OUTCOMES sidecar
        try {
            const checkCtx = await this.buildCheckContext(context, transport);

            // 4) Run each selected bundle's checks IN ORDER against ONE shared context.
            for (const sel of selectors) {
                if (timedOut) {
                    break;
                }
                await this.runBundle(context, checkCtx, sel.type, sel.config?.runMutationTests === true, oracleResults, outcomes, () => timedOut);
            }
        } catch (bootErr) {
            clearTimeout(timer);
            return this.buildErrorResult(context, startTime, `Bootstrap failed: ${(bootErr as Error).message}`);
        }
        clearTimeout(timer);

        // 5a) Optional golden-diff sidecar — same shape the tsx scripts emit via EmitOutcomes.
        const emitPath = process.env.EMIT_OUTCOMES;
        if (emitPath) {
            try {
                await writeOutcomesFile(emitPath, outcomes);
            } catch (e) {
                this.logToTestRun(context, 'warn', `EMIT_OUTCOMES write failed: ${(e as Error).message}`);
            }
        }

        // 5b) Assemble the DriverExecutionResult (counts mirror AgentEvalDriver).
        return this.buildResult(context, startTime, oracleResults, timedOut);
    }

    /**
     * Resolve a bundle and run its ordered checks. The runquery-cache bundle wraps its
     * checks in a driver-level fixture try/finally (engine SetupSuite/TeardownSuite hooks
     * don't exist until Phase 4). Mutation-gated checks run only when `runMutation` is set.
     */
    private async runBundle(
        context: DriverExecutionContext,
        checkCtx: IntegrationCheckContext,
        bundleType: string,
        runMutation: boolean,
        oracleResults: OracleResult[],
        outcomes: TestOutcome[],
        isTimedOut: () => boolean
    ): Promise<void> {
        const bundle = IntegrationCheckRegistry.Instance.GetBundle(bundleType);
        if (bundle.length === 0) {
            const message = `Unknown integration check bundle '${bundleType}'`;
            oracleResults.push({ oracleType: bundleType, passed: false, score: 0, message, details: { DurationMs: 0 } });
            outcomes.push({ Name: bundleType, Passed: false, DurationMs: 0, Error: message });
            this.logToTestRun(context, 'error', `✗ ${message}`);
            return;
        }

        const needsFixtures = bundleType === FIXTURE_BUNDLE;
        if (needsFixtures) {
            try {
                checkCtx.Fixtures = await createRunQueryFixtures(checkCtx);
            } catch (fxErr) {
                const message = `runquery-cache fixture setup failed: ${(fxErr as Error).message}`;
                oracleResults.push({ oracleType: `${bundleType}.fixtures`, passed: false, score: 0, message, details: { DurationMs: 0 } });
                outcomes.push({ Name: `${bundleType}.fixtures`, Passed: false, DurationMs: 0, Error: message });
                this.logToTestRun(context, 'error', message);
                return;
            }
        }

        try {
            for (const check of bundle) {
                if (isTimedOut()) {
                    break;
                }
                if (check.RequiresMutation && !runMutation) {
                    continue;
                }
                if (check.RequiresLiveModel && process.env.RUN_AGENT_TESTS !== '1') {
                    continue;
                }
                await this.runCheck(context, checkCtx, check.Id, check.Name, check.Fn, oracleResults, outcomes);
            }
        } finally {
            if (needsFixtures && checkCtx.Fixtures) {
                await teardownRunQueryFixtures(checkCtx, checkCtx.Fixtures);
                checkCtx.Fixtures = undefined;
            }
        }
    }

    /** Run one check in try/catch and append one OracleResult + one TestOutcome. */
    private async runCheck(
        context: DriverExecutionContext,
        checkCtx: IntegrationCheckContext,
        id: string,
        name: string,
        fn: (ctx: IntegrationCheckContext) => Promise<void>,
        oracleResults: OracleResult[],
        outcomes: TestOutcome[]
    ): Promise<void> {
        const checkStart = Date.now();
        try {
            await fn(checkCtx);
            const durationMs = Date.now() - checkStart;
            oracleResults.push({
                oracleType: id,
                passed: true,
                score: 1,
                message: name,
                details: { DurationMs: durationMs, runViewCacheSets: checkCtx.Storage.SetCount('RunViewCache') }
            });
            outcomes.push({ Name: name, Passed: true, DurationMs: durationMs });
            this.logToTestRun(context, 'info', `✓ ${id}`);
        } catch (checkErr) {
            const durationMs = Date.now() - checkStart;
            const message = (checkErr as Error).message;
            oracleResults.push({ oracleType: id, passed: false, score: 0, message, details: { DurationMs: durationMs } });
            outcomes.push({ Name: name, Passed: false, DurationMs: durationMs, Error: message });
            this.logToTestRun(context, 'error', `✗ ${id}: ${message}`);
        }
    }

    /** client-cache runs on the GraphQL client transport; every other bundle on SQL server. */
    private bundleTransport(bundleType: string): 'server' | 'client' {
        return bundleType === CLIENT_BUNDLE ? 'client' : 'server';
    }

    /**
     * Obtain the run-scoped instrumented provider stack for the chosen transport.
     * Prefers a stack already installed first-caller (CLI's installInstrumentedCacheFirst,
     * or a prior bootstrap in this process); falls back to owning the process. Throws
     * (caught upstream) when a client bundle is requested but the cache was already claimed
     * by a SQL provider, or vice-versa.
     */
    private async buildCheckContext(context: DriverExecutionContext, transport: 'server' | 'client'): Promise<IntegrationCheckContext> {
        if (transport === 'client') {
            const client = getActiveIntegrationClientBootstrap() ?? await bootstrapIntegrationClient();
            return {
                User: context.contextUser,
                Provider: this.Provider,
                Storage: client.Storage,
                Pool: undefined,
                Schema: process.env.MJ_CORE_SCHEMA ?? '__mj'
            };
        }

        let storage: InstrumentedLocalStorageProvider | null = getActiveIntegrationStorage();
        const activeBootstrap = getActiveIntegrationBootstrap();
        let pool: sql.ConnectionPool | undefined = activeBootstrap?.Pool;
        let schema: string | undefined = activeBootstrap?.Db.Schema;
        if (!storage) {
            const ic = await bootstrapIntegrationServer();
            storage = ic.Storage;
            pool = ic.Pool;
            schema = ic.Db.Schema;
        }
        return {
            User: context.contextUser,
            // Dedicated single-provider process: the driver's provider IS the global one.
            Provider: this.Provider,
            Storage: storage,
            Pool: pool,
            Schema: schema ?? (process.env.MJ_CORE_SCHEMA ?? '__mj')
        };
    }

    /** Map the OracleResult[] to the framework result (one OracleResult per check). */
    private buildResult(
        context: DriverExecutionContext,
        startTime: number,
        oracleResults: OracleResult[],
        timedOut: boolean
    ): DriverExecutionResult {
        const passedChecks = oracleResults.filter(r => r.passed).length;
        const totalChecks = oracleResults.length;
        const failedChecks = totalChecks - passedChecks;
        const status: DriverExecutionResult['status'] =
            timedOut ? 'Timeout' : (failedChecks === 0 ? 'Passed' : 'Failed');

        const result: DriverExecutionResult = {
            targetType: TARGET_TYPE,
            // No external MJ log entity to link; point TargetLogID at the TestRun itself.
            targetLogId: context.testRun.ID,
            status,
            score: totalChecks === 0 ? 0 : passedChecks / totalChecks,
            oracleResults,
            passedChecks,
            failedChecks,
            totalChecks,
            durationMs: Date.now() - startTime
        };
        if (timedOut) {
            result.errorMessage = `Integration run timed out after ${this.getEffectiveTimeout(context.test)}ms`;
        }
        return result;
    }

    /** Gated/skipped run: one passing 'gate' OracleResult, never 'Running', never thrown. */
    private buildSkipResult(context: DriverExecutionContext, startTime: number, note: string): DriverExecutionResult {
        return {
            targetType: TARGET_TYPE,
            targetLogId: context.testRun.ID,
            status: 'Passed',
            score: 1,
            oracleResults: [{ oracleType: 'gate', passed: true, score: 1, message: note, details: { DurationMs: 0 } }],
            passedChecks: 1,
            failedChecks: 0,
            totalChecks: 1,
            durationMs: Date.now() - startTime
        };
    }

    /** Bootstrap/config error: one failing 'error' OracleResult, status 'Error', never thrown. */
    private buildErrorResult(context: DriverExecutionContext, startTime: number, message: string): DriverExecutionResult {
        this.logToTestRun(context, 'error', message);
        return {
            targetType: TARGET_TYPE,
            targetLogId: context.testRun.ID,
            status: 'Error',
            score: 0,
            oracleResults: [{ oracleType: 'error', passed: false, score: 0, message, details: { DurationMs: 0 } }],
            passedChecks: 0,
            failedChecks: 1,
            totalChecks: 1,
            durationMs: Date.now() - startTime,
            errorMessage: message
        };
    }
}
