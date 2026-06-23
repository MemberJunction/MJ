/**
 * IntegrationTestDriver.ts — the TestType driver for the "Integration Test" type.
 *
 * Resolved by TestEngine.getDriver() from TestType.DriverClass via
 * MJGlobal.ClassFactory.CreateInstance(BaseTestDriver, 'IntegrationTestDriver').
 *
 * Execute():
 *   1) parse Configuration.checks (ordered) off the MJTestEntity;
 *   2) honor an optional env gate (skip-as-Passed with a note);
 *   3) obtain the run-scoped instrumented provider stack (installed first-caller by
 *      the CLI, or self-bootstrapped in a dedicated process);
 *   4) run each NamedCheck in array order against ONE shared IntegrationCheckContext,
 *      converting a thrown check into a failing OracleResult (never re-throwing —
 *      a re-throw would leave the TestRun stuck 'Running');
 *   5) map the OracleResult[] onto a DriverExecutionResult (counts computed exactly
 *      like AgentEvalDriver). The engine persists oracleResults verbatim to
 *      TestRun.ResultDetails as a BARE ARRAY.
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
    bootstrapIntegrationServer
} from './bootstrap';
import type { InstrumentedLocalStorageProvider } from './instrumented-cache';
import type { IntegrationCheckContext } from './check';
import { IntegrationCheckRegistry } from './check-registry';
import { IntegrationTestConfig } from './types';

const TARGET_TYPE = 'Integration Check Bundle';

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

        const checks = Array.isArray(config.checks) ? config.checks : [];

        // 3) Arm a driver-side timeout (the engine never applies one). On fire we abort the
        //    check loop between checks; partial results become a 'Timeout' result.
        const effectiveTimeout = this.getEffectiveTimeout(context.test);
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; }, effectiveTimeout);

        const oracleResults: OracleResult[] = [];
        try {
            const checkCtx = await this.buildCheckContext(context);

            // 4) Run checks IN CONFIGURED ORDER against ONE shared context.
            for (const sel of checks) {
                if (timedOut) {
                    break;
                }
                const check = IntegrationCheckRegistry.Instance.Get(sel.type);
                if (!check) {
                    oracleResults.push({
                        oracleType: sel.type,
                        passed: false,
                        score: 0,
                        message: `Unknown integration check '${sel.type}'`,
                        details: { DurationMs: 0 }
                    });
                    this.logToTestRun(context, 'error', `✗ unknown check '${sel.type}'`);
                    continue;
                }
                const checkStart = Date.now();
                try {
                    await check.Fn(checkCtx);
                    oracleResults.push({
                        oracleType: check.Id,
                        passed: true,
                        score: 1,
                        message: check.Name,
                        details: {
                            DurationMs: Date.now() - checkStart,
                            runViewCacheSets: checkCtx.Storage.SetCount('RunViewCache')
                        }
                    });
                    this.logToTestRun(context, 'info', `✓ ${check.Id}`);
                } catch (checkErr) {
                    oracleResults.push({
                        oracleType: check.Id,
                        passed: false,
                        score: 0,
                        message: (checkErr as Error).message,
                        details: { DurationMs: Date.now() - checkStart }
                    });
                    this.logToTestRun(context, 'error', `✗ ${check.Id}: ${(checkErr as Error).message}`);
                }
            }
        } catch (bootErr) {
            clearTimeout(timer);
            return this.buildErrorResult(context, startTime, `Bootstrap failed: ${(bootErr as Error).message}`);
        }
        clearTimeout(timer);

        // 5) Assemble the DriverExecutionResult (counts mirror AgentEvalDriver).
        return this.buildResult(context, startTime, oracleResults, timedOut);
    }

    /**
     * Obtain the run-scoped instrumented provider stack. Prefers the storage installed
     * first-caller by the CLI (installInstrumentedCacheFirst); falls back to owning the
     * process (bootstrapIntegrationServer) for a dedicated standalone process. Throws
     * (caught upstream) if the cache was already claimed by a non-integration component.
     */
    private async buildCheckContext(context: DriverExecutionContext): Promise<IntegrationCheckContext> {
        let storage: InstrumentedLocalStorageProvider | null = getActiveIntegrationStorage();
        let pool: sql.ConnectionPool | undefined = getActiveIntegrationBootstrap()?.Pool;
        if (!storage) {
            const ic = await bootstrapIntegrationServer();
            storage = ic.Storage;
            pool = ic.Pool;
        }
        return {
            User: context.contextUser,
            // Dedicated single-provider process: the driver's provider IS the global one.
            Provider: this.Provider,
            Storage: storage,
            Pool: pool
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
