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
 *      re-throwing; a re-throw would leave the TestRun stuck 'Running'). A bundle that
 *      registers a BundleLifecycle (e.g. runquery-cache, field-rules-bulk-update) has its
 *      Setup run and Teardown GUARANTEED inside one try/finally, so a mid-Setup crash still
 *      tears down whatever the Setup accumulated (R4);
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
    OracleResult,
    SuiteFixtureContext
} from '@memberjunction/testing-engine';
import { Metadata } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import type sql from 'mssql';
import {
    getActiveIntegrationStorage,
    getActiveIntegrationBootstrap,
    getActiveIntegrationClientBootstrap,
    bootstrapIntegrationServer,
    serverProcessAlreadyClaimed
} from './bootstrap';
import { bootstrapIntegrationClient } from './bootstrap-client';
import type { InstrumentedLocalStorageProvider } from './instrumented-cache';
import type { IntegrationCheckContext, RlsFixture } from './check';
import { IntegrationCheckRegistry } from './check-registry';
import { IntegrationTestConfig, IntegrationCheckSelectionConfig } from './types';
import { IntegrationTier, TIER_ENV_GATE, IsTierEnabled } from './tiers';
import { TestOutcome, writeOutcomesFile } from './test-runner';
import { discoverRlsFixture } from './checks/rls-isolation.checks';

const TARGET_TYPE = 'Integration Check Bundle';
/** Bundles that run against the GraphQL client transport (everything else: SQL server). */
const CLIENT_BUNDLES = new Set(['client-cache', 'rls-isolation-client', 'remote-op-wire-progress']);
/** Bundles that need the discovered two-user RLS fixture threaded into the context. */
const RLS_BUNDLES = new Set(['rls-isolation', 'rls-isolation-client']);
/** Key under SuiteFixtureContext.Data where the discovered RLS fixture is stashed. */
const RLS_FIXTURE_KEY = 'rlsFixture';

@RegisterClass(BaseTestDriver, 'IntegrationTestDriver')
export class IntegrationTestDriver extends BaseTestDriver {
    /** The driver arms its own timeout and breaks the check loop when it fires. */
    public override supportsCancellation(): boolean {
        return true;
    }

    /**
     * Suite-scoped setup (D6). Discovers the two-user RLS fixture ONCE per suite run and
     * stashes it on the shared SuiteFixtureContext so every test of the suite (and the
     * `rls-isolation` bundle's checks) reads the same pair. Best-effort: discovery has
     * nothing to delete, so failures are non-fatal — Execute lazily re-discovers when the
     * fixture is absent (e.g. the `mj test run` path has no suite). Only meaningful on the
     * server transport (the user cache is a SQLServerDataProvider concept).
     */
    public override async SetupSuite(context: SuiteFixtureContext, _contextUser: UserInfo): Promise<void> {
        try {
            const users = UserCache.Instance.Users;
            if (users && users.length > 0) {
                context.Data[RLS_FIXTURE_KEY] = discoverRlsFixture(this.Provider, users);
            }
        } catch (e) {
            this.log(`SetupSuite RLS discovery skipped: ${(e as Error).message}`);
        }
    }

    /**
     * Suite-scoped teardown (D6). No-op: the RLS fixture is DISCOVERED (not created), so
     * there is nothing to delete — the safest possible teardown. Present so the engine's
     * suite-hook lifecycle is exercised end-to-end by this driver.
     */
    public override async TeardownSuite(_context: SuiteFixtureContext, _contextUser: UserInfo): Promise<void> {
        // no-op — discovery-based fixture has nothing to clean up
    }

    /**
     * The two-user RLS fixture for the current run: the one discovered in SetupSuite when
     * available, otherwise discovered lazily here (the no-suite `mj test run` path) and
     * cached back onto the suite context for sibling tests.
     */
    private ensureRlsFixture(context: DriverExecutionContext): RlsFixture {
        const cached = context.fixtures?.Data?.[RLS_FIXTURE_KEY] as RlsFixture | undefined;
        if (cached) {
            return cached;
        }
        const fx = discoverRlsFixture(this.Provider, UserCache.Instance.Users);
        if (context.fixtures) {
            context.fixtures.Data[RLS_FIXTURE_KEY] = fx;
        }
        return fx;
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

        // 2) Whole-test tier gate (gated-tier / local-dev safety net). The tier decides the
        //    env var via TIER_ENV_GATE; an explicit `requiresEnv` overrides it. When the gate
        //    is unmet, skip-as-Passed with a gate note — the driver result enum has no 'Skipped'.
        const tier: IntegrationTier = config.tier ?? 'deterministic';
        const explicitGate = config.requiresEnv;
        const gated = explicitGate ? process.env[explicitGate] !== '1' : !IsTierEnabled(tier);
        if (gated) {
            const gateVar = explicitGate ?? TIER_ENV_GATE[tier];
            const note = `Skipped: ${gateVar} not set (tier '${tier}')`;
            this.logToTestRun(context, 'warn', note);
            return this.buildSkipResult(context, startTime, note);
        }

        const selectors = Array.isArray(config.checks) ? config.checks : [];
        const transport: 'server' | 'client' =
            config.transport ?? (selectors.some(s => this.bundleTransport(s.type) === 'client') ? 'client' : 'server');

        // 2b) D1 host check. These suites must own their process — install the instrumented
        //     cache as the FIRST caller of LocalCacheManager.Initialize. Inside a live MJAPI
        //     the cache is already initialized, so they cannot run here. Fail fast with an
        //     actionable message (run via the CLI) instead of a confusing bootstrap stack.
        if (transport === 'server' && serverProcessAlreadyClaimed()) {
            return this.buildErrorResult(
                context,
                startTime,
                'Integration cache suites must run in a dedicated process: run `npm run test:integration`, ' +
                'or `MJ_INTEGRATION_TEST=1 mj test suite --name "<suite>"`. They cannot run inside a live ' +
                'MJAPI — the cache is already initialized, so the instrumented cache cannot be installed ' +
                'first (plan decision D1).'
            );
        }

        // 3) Arm a driver-side timeout (the engine never applies one). The timer flips `timedOut`
        //    to abort the loop BETWEEN checks; the `deadline` additionally bounds EACH check via a
        //    per-check race (C6), so a single hung check can't run past the budget forever.
        const effectiveTimeout = this.getEffectiveTimeout(context.test);
        const deadline = Date.now() + effectiveTimeout;
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
                await this.runBundle(context, checkCtx, sel.type, sel.config, oracleResults, outcomes, () => timedOut, deadline);
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
     * Resolve a bundle and run its ordered checks. A bundle that registers a BundleLifecycle
     * (runquery-cache, field-rules-bulk-update, …) has its Setup + Teardown wrapped in ONE
     * try/finally so Teardown is guaranteed even on a mid-Setup crash (R4). Mutation-gated
     * checks run only when `runMutation` is set.
     */
    private async runBundle(
        context: DriverExecutionContext,
        checkCtx: IntegrationCheckContext,
        bundleType: string,
        selConfig: IntegrationCheckSelectionConfig | undefined,
        oracleResults: OracleResult[],
        outcomes: TestOutcome[],
        isTimedOut: () => boolean,
        deadline: number
    ): Promise<void> {
        const bundle = IntegrationCheckRegistry.Instance.GetBundle(bundleType);
        if (bundle.length === 0) {
            const message = `Unknown integration check bundle '${bundleType}'`;
            oracleResults.push({ oracleType: bundleType, passed: false, score: 0, message, details: { DurationMs: 0 } });
            outcomes.push({ Name: bundleType, Passed: false, DurationMs: 0, Error: message });
            this.logToTestRun(context, 'error', `✗ ${message}`);
            return;
        }

        // Expose the selector's opaque config bag to the bundle's checks (e.g. dataset-cache
        // reads `datasetName`, aggregates-cache reads `entityName`). Set per-bundle since the
        // check context is shared and reused across bundles within one Execute.
        checkCtx.Config = selConfig as Record<string, unknown> | undefined;

        // The rls-isolation bundles need the discovered two-user fixture (suite-scoped via
        // SetupSuite, or lazily discovered for the no-suite `mj test run` path).
        if (RLS_BUNDLES.has(bundleType)) {
            checkCtx.RlsFixture = this.ensureRlsFixture(context);
        }

        const runMutation = selConfig?.runMutationTests === true;

        // Per-check tier gating routed through the shared IsTierEnabled predicate (the same
        // one the tsx scripts use) so the env gate is honored identically. A selector may also
        // opt mutation checks in explicitly via config.runMutationTests, independent of env.
        const mutationEnabled = IsTierEnabled('mutation') || runMutation;
        const liveModelEnabled = IsTierEnabled('live-model');

        // A mutating bundle registers a lifecycle (setup creates a shared fixture on the context,
        // teardown removes it). R4: run Setup INSIDE the same try whose finally guarantees Teardown,
        // so a mid-Setup crash still runs Teardown against whatever the Setup accumulated onto the
        // context so far (lifecycle Setups publish their fixture handle up-front and append created
        // IDs as they go). A Setup failure short-circuits the bundle with one failing 'fixtures'
        // oracle and skips the checks — but never re-throws and never leaves the fixture orphaned.
        const lifecycle = IntegrationCheckRegistry.Instance.GetLifecycle(bundleType);
        try {
            if (lifecycle) {
                await lifecycle.Setup(checkCtx);
            }
            for (const check of bundle) {
                if (isTimedOut()) {
                    break;
                }
                if (check.RequiresMutation && !mutationEnabled) {
                    continue;
                }
                if (check.RequiresLiveModel && !liveModelEnabled) {
                    continue;
                }
                await this.runCheck(context, checkCtx, check.Id, check.Name, check.Fn, oracleResults, outcomes, deadline);
            }
        } catch (fxErr) {
            // The only throw reachable here is from lifecycle.Setup — runCheck swallows per-check
            // errors into results. Record it as a failing 'fixtures' oracle (never re-thrown).
            const message = `${bundleType} fixture setup failed: ${(fxErr as Error).message}`;
            oracleResults.push({ oracleType: `${bundleType}.fixtures`, passed: false, score: 0, message, details: { DurationMs: 0 } });
            outcomes.push({ Name: `${bundleType}.fixtures`, Passed: false, DurationMs: 0, Error: message });
            this.logToTestRun(context, 'error', message);
        } finally {
            if (lifecycle) {
                // Best-effort — a teardown failure must never mask a check result or leave TestRun 'Running'.
                try {
                    await lifecycle.Teardown(checkCtx);
                } catch (tdErr) {
                    this.logToTestRun(context, 'warn', `${bundleType} teardown warning: ${(tdErr as Error).message}`);
                }
            }
        }
    }

    /**
     * C6: run a single check but bound it by the remaining run budget. The between-checks `timedOut`
     * flag can only stop the loop between checks — a check that hangs forever would otherwise run
     * past the deadline unbounded. Racing the check against a per-check timeout makes a hang surface
     * as a failed check with a clear message (caught by runCheck's try/catch) instead of a wedged
     * run. The check's own promise may keep running after we move on, but the process is dedicated
     * and short-lived (D1), so a dangling promise on the timeout path is harmless.
     */
    private async runWithDeadline(
        id: string,
        fn: (ctx: IntegrationCheckContext) => Promise<void>,
        checkCtx: IntegrationCheckContext,
        deadline: number
    ): Promise<void> {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error(`integration run budget exhausted before check '${id}' started`);
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`check '${id}' exceeded the ${remaining}ms remaining run budget (hung check)`)),
                remaining
            );
        });
        try {
            await Promise.race([fn(checkCtx), timeout]);
        } finally {
            if (timer) {
                clearTimeout(timer);
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
        outcomes: TestOutcome[],
        deadline: number
    ): Promise<void> {
        const checkStart = Date.now();
        try {
            await this.runWithDeadline(id, fn, checkCtx, deadline);
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

    /** client-cache / rls-isolation-client run on the GraphQL client transport; others on SQL server. */
    private bundleTransport(bundleType: string): 'server' | 'client' {
        return CLIENT_BUNDLES.has(bundleType) ? 'client' : 'server';
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
        // The REAL database provider (a DatabaseProviderBase): the bootstrap's own provider when a
        // bootstrap ran in-process, else the global one installed by the CLI's initializeMJProvider.
        // NOT `this.Provider` — its getter returns a `new Metadata()` FACADE when the engine injected
        // no provider, and the facade lacks IRemoteOperationProvider.RouteOperation (so remote-op
        // checks would fail with "No remote-operation-capable provider"). Dedicated single-provider
        // process (D1), so the global is unambiguous and matches what the tsx dispatcher passes.
        let provider: IMetadataProvider = activeBootstrap?.Provider ?? Metadata.Provider;
        if (!storage) {
            const ic = await bootstrapIntegrationServer();
            storage = ic.Storage;
            pool = ic.Pool;
            schema = ic.Db.Schema;
            provider = ic.Provider;
        }
        return {
            User: context.contextUser,
            Provider: provider,
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
