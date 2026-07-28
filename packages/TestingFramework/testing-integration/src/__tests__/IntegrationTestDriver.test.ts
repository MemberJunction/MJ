import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the bootstrap so the driver never touches a real DB/cache. getActiveIntegrationStorage
// returns a minimal instrumented-storage stub (only SetCount/ResetCounts are exercised here).
// serverProcessAlreadyClaimed is a controllable stub (default false = a properly-owned process)
// so the D1 "can't run inside a live MJAPI" guard can be exercised both ways.
/** Minimal shape of the active server bootstrap the driver reads (Provider type, pool, schema). */
interface FakeServerBootstrap {
    Provider: { ProviderType: string };
    Pool: undefined;
    Db: { Schema: string; Platform?: 'sqlserver' | 'postgresql' };
}
const { mockServerClaimed, mockActiveBootstrap, mockClientBootstrap } = vi.hoisted(() => ({
    mockServerClaimed: vi.fn(() => false),
    // Default null keeps the server branch resolving Metadata.Provider (unset in unit env), exactly
    // as before; tests that need a typed provider override this to inject one (#3251 guard).
    mockActiveBootstrap: vi.fn<() => FakeServerBootstrap | null>(() => null),
    // Controllable so the client-transport environment-gap classification can be exercised:
    // the driver must distinguish "this environment cannot run client transport" (skip) from
    // "the client bootstrap genuinely broke" (error).
    mockClientBootstrap: vi.fn(async (): Promise<never> => { throw new Error('unit test must not self-bootstrap'); }),
}));
vi.mock('../bootstrap', () => ({
    getActiveIntegrationStorage: () => ({ SetCount: (_category: string) => 0, ResetCounts: () => { /* no-op */ } }),
    getActiveIntegrationBootstrap: () => mockActiveBootstrap(),
    getActiveIntegrationClientBootstrap: () => null,
    bootstrapIntegrationServer: async () => { throw new Error('unit test must not self-bootstrap'); },
    bootstrapIntegrationClient: async () => { throw new Error('unit test must not self-bootstrap'); },
    serverProcessAlreadyClaimed: () => mockServerClaimed()
}));

// The driver imports bootstrapIntegrationClient from './bootstrap-client' directly, so the
// '../bootstrap' mock above never intercepted it — this is the module that must be stubbed.
vi.mock('../bootstrap-client', () => ({
    bootstrapIntegrationClient: async () => mockClientBootstrap(),
}));

import { IntegrationTestDriver } from '../IntegrationTestDriver';
import { IntegrationCheckRegistry } from '../check-registry';
import { IntegrationEnvironmentUnavailableError } from '../config';
import type { DriverExecutionContext, IOracle } from '@memberjunction/testing-engine';
import type { MJTestEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { Metadata, SetProvider } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

/** Build a minimal DriverExecutionContext for the fields the driver actually reads. */
function makeContext(config: object | null, maxExecutionTimeMs: number | null = null): DriverExecutionContext {
    const test = (config === null
        ? {}
        : { Configuration: JSON.stringify(config), MaxExecutionTimeMS: maxExecutionTimeMs }
    ) as Partial<MJTestEntity> as MJTestEntity;
    const testRun = { ID: 'run-1' } as Partial<MJTestRunEntity> as MJTestRunEntity;
    const contextUser = { ID: 'user-1' } as Partial<UserInfo> as UserInfo;
    return { test, testRun, contextUser, options: {}, oracleRegistry: new Map<string, IOracle>() };
}

describe('IntegrationTestDriver bundle dispatch', () => {
    beforeEach(() => {
        // Tier gates read process.env; keep these unit tests deterministic regardless of
        // the ambient environment they happen to run in.
        delete process.env.RUN_MUTATION_TESTS;
        delete process.env.RUN_AGENT_TESTS;
        mockServerClaimed.mockReturnValue(false);
        mockActiveBootstrap.mockReturnValue(null);
        mockClientBootstrap.mockImplementation(async () => { throw new Error('unit test must not self-bootstrap'); });
        // The #3251 guard inspects the process-global provider, which SetProvider mutates
        // globally — reset it so one test's rebind cannot leak into the next.
        SetProvider(undefined as unknown as IMetadataProvider);
        const reg = IntegrationCheckRegistry.Instance;
        // A unique bundle prefix per concern keeps these isolated from the real bundles.
        reg.Register({ Id: 'unitpass.A', Name: 'A', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitpass.B', Name: 'B', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitmix.A', Name: 'mixA', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitmix.B', Name: 'mixB', Fn: async () => { throw new Error('boom'); } });
        reg.Register({ Id: 'unitmut.A', Name: 'mutA', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitmut.M', Name: 'mutM', RequiresMutation: true, Fn: async () => { /* pass */ } });
    });

    it('expands a bundle and runs its checks in registration order → Passed, score 1', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Passed');
        expect(result.score).toBe(1);
        expect(result.passedChecks).toBe(2);
        expect(result.totalChecks).toBe(2);
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitpass.A', 'unitpass.B']);
    });

    it('a thrown check fails only itself; the bundle keeps going → Failed, score 0.5', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitmix' }] }));
        expect(result.status).toBe('Failed');
        expect(result.score).toBe(0.5);
        expect(result.passedChecks).toBe(1);
        expect(result.failedChecks).toBe(1);
        expect(result.oracleResults.find(o => o.oracleType === 'unitmix.B')?.message).toBe('boom');
    });

    it('RequiresMutation checks are skipped unless the selector opts in', async () => {
        const driver = new IntegrationTestDriver();
        const off = await driver.Execute(makeContext({ checks: [{ type: 'unitmut' }] }));
        // The gated check does not RUN, but its omission is recorded as run metadata — see
        // 'records the checks a PARTIAL filter dropped'. Only unitmut.A is an executed check.
        expect(off.oracleResults.filter(o => o.oracleType !== 'gate').map(o => o.oracleType)).toEqual(['unitmut.A']);

        const on = await driver.Execute(makeContext({ checks: [{ type: 'unitmut', config: { runMutationTests: true } }] }));
        expect(on.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitmut.M']);
        // Nothing was filtered when the selector opts in, so there is no omission to record.
        expect(on.oracleResults.some(o => o.oracleType === 'gate')).toBe(false);
    });

    it('RequiresMutation checks also run when RUN_MUTATION_TESTS=1 (env, no selector opt-in)', async () => {
        process.env.RUN_MUTATION_TESTS = '1';
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitmut' }] }));
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitmut.M']);
    });

    it("a live-model Test with RUN_AGENT_TESTS=0 reports Skipped with a single 'gate' oracle (explicit opt-out)", async () => {
        process.env.RUN_AGENT_TESTS = '0';
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'live-model', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Skipped');
        expect(result.totalChecks).toBe(0);
        expect(result.oracleResults[0].oracleType).toBe('gate');
        expect(result.oracleResults[0].message).toContain('RUN_AGENT_TESTS');
    });

    it('a live-model Test runs its checks BY DEFAULT (no env var — the 2026-07-20 inversion)', async () => {
        delete process.env.RUN_AGENT_TESTS;
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'live-model', checks: [{ type: 'unitpass' }] }));
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitpass.A', 'unitpass.B']);
    });

    it("a mutation-tier Test without RUN_MUTATION_TESTS reports Skipped with a 'gate' oracle", async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'mutation', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Skipped');
        expect(result.oracleResults[0].oracleType).toBe('gate');
        expect(result.oracleResults[0].message).toContain('RUN_MUTATION_TESTS');
    });

    it('a deterministic Test (default tier) runs unconditionally', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'deterministic', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Passed');
        expect(result.totalChecks).toBe(2);
    });

    it('unknown bundle → a single failing OracleResult (never silently dropped)', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'nope' }] }));
        expect(result.totalChecks).toBe(1);
        expect(result.oracleResults[0].passed).toBe(false);
        expect(result.oracleResults[0].oracleType).toBe('nope');
    });

    it('multiple bundles run in declared order, results concatenated', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitmut' }, { type: 'unitpass' }] }));
        // Executed checks keep their declared order across bundles. unitmut's gated check
        // contributes a 'gate' metadata oracle, not a check result, so it is filtered out here.
        expect(result.oracleResults.filter(o => o.oracleType !== 'gate').map(o => o.oracleType))
            .toEqual(['unitmut.A', 'unitpass.A', 'unitpass.B']);
    });

    it('a server bundle inside an already-claimed process (live MJAPI) → Error pointing to the CLI, never throws', async () => {
        mockServerClaimed.mockReturnValue(true);
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Error');
        expect(result.totalChecks).toBe(1);
        expect(result.oracleResults[0].oracleType).toBe('error');
        expect(result.oracleResults[0].message).toMatch(/dedicated process|test:integration|mj test suite/);
    });

    it('server transport that resolves a non-Database (client-rebound) provider → Error naming the rebinding, never runs (#3251)', async () => {
        // Simulate a client-transport bundle having rebound the process-global provider to a
        // GraphQL (Network) provider before a server-transport bundle runs. The guard must abort.
        mockActiveBootstrap.mockReturnValue({ Provider: { ProviderType: 'Network' }, Pool: undefined, Db: { Schema: '__mj' } });
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ transport: 'server', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Error');
        expect(result.oracleResults[0].message).toMatch(/rebound|issue #3251/i);
        // The bundle's checks must NOT have run (the whole point — no product-shaped output).
        expect(result.oracleResults.map(o => o.oracleType)).not.toContain('unitpass.A');
    });

    it('server transport that resolves a Database provider runs normally (guard is inert on the correct provider) (#3251)', async () => {
        mockActiveBootstrap.mockReturnValue({ Provider: { ProviderType: 'Database' }, Pool: undefined, Db: { Schema: '__mj' } });
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ transport: 'server', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Passed');
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitpass.A', 'unitpass.B']);
    });

    it('server transport aborts when the PROCESS-GLOBAL provider was rebound, even though the bootstrap context still holds a Database provider (#3251)', async () => {
        // This is the shape that actually occurs now that the CLI publishes a bootstrap context:
        // the context captured a Database provider at publish time, so a guard that inspects only
        // the RESOLVED provider goes permanently blind. The invariant is about the global — a check
        // calling `new Metadata()` would transparently get GraphQL while ctx.Provider still says SQL,
        // which is a split-brain, not a safe fallback.
        mockActiveBootstrap.mockReturnValue({ Provider: { ProviderType: 'Database' }, Pool: undefined, Db: { Schema: '__mj' } });
        SetProvider({ ProviderType: 'Network' } as unknown as IMetadataProvider);

        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ transport: 'server', checks: [{ type: 'unitpass' }] }));

        expect(result.status).toBe('Error');
        expect(result.oracleResults[0].message).toMatch(/rebound|issue #3251/i);
        expect(result.oracleResults.map(o => o.oracleType)).not.toContain('unitpass.A');
    });

    // A run that executed NOTHING is not a pass. This previously reported 'Passed' with
    // totalChecks 0 — so a config typo, or a bundle whose every check is mutation-gated in a
    // lane that does not opt in, contributed a green tick having verified nothing.
    it('zero executed checks → Skipped, not Passed', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [] }));
        expect(result.status).toBe('Skipped');
        expect(result.totalChecks).toBe(0);
        expect(result.score).toBe(0);
    });

    it('reports Skipped when every check in the bundle is mutation-gated and the gate is unmet', async () => {
        // IT29 Cache Gauntlet is exactly this shape locally: all 8 checks are RequiresMutation,
        // so `npm run test:integration` without RUN_MUTATION_TESTS ran nothing and said Passed.
        IntegrationCheckRegistry.Instance.Register({
            Id: 'unitallmut.A', Name: 'allMutA', RequiresMutation: true, Fn: async () => { /* pass */ }
        });
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitallmut' }] }));
        expect(result.status).toBe('Skipped');
        expect(result.totalChecks).toBe(0);
    });

    it('records WHY an all-filtered bundle was skipped, so the skip is never reasonless', async () => {
        // The platform gate and the env gate both attach a 'gate' oracle naming what they dropped;
        // the tier filter did not, so this skip class reached the reports as "— no reason
        // recorded". A skip nobody can explain is the same triage dead-end as a silent pass.
        IntegrationCheckRegistry.Instance.Register({
            Id: 'unitallmut2.A', Name: 'allMutA', RequiresMutation: true, Fn: async () => { /* pass */ }
        });
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitallmut2' }] }));

        expect(result.status).toBe('Skipped');
        const gate = result.oracleResults.find(o => o.oracleType === 'gate');
        expect(gate).toBeDefined();
        expect(gate!.message).toMatch(/1 check/i);
        expect(gate!.message).toMatch(/mutation/i);

        // Identify the checks by ID, not by their full prose Name. Check names already carry a
        // "(mutation)" marker and a full sentence of description, so naming them inline produced
        // a duplicated tier word and an unreadable wall of text for a bundle with 8 gated checks.
        expect(gate!.message).toContain('unitallmut2.A');
        expect(gate!.message).not.toContain('allMutA');
        // The tier is named ONCE for the group, not once per check. (Counting bare "mutation"
        // would be wrong — RUN_MUTATION_TESTS and runMutationTests legitimately contain it.)
        expect(gate!.message.match(/mutation-tier/gi)!.length).toBe(1);
    });

    it('records the checks a PARTIAL filter dropped, so a 1-of-2 run cannot read as full coverage', async () => {
        // unitmut = { A (always), M (RequiresMutation) }. With the gate unmet only A runs, and the
        // score is computed over survivors — 1/1 = 100%. Reporting a perfect score for half the
        // assertions is the inflated-pass-count form of the same false green.
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitmut' }] }));

        expect(result.status).toBe('Passed');
        const gate = result.oracleResults.find(o => o.oracleType === 'gate');
        expect(gate).toBeDefined();
        expect(gate!.message).toMatch(/1 check/i);
        // The gate oracle must not pad the counts it is reporting on.
        expect(result.totalChecks).toBe(1);
        expect(result.passedChecks).toBe(1);
    });

    it('env gate unmet → Skipped with a single "gate" oracle and zero checks, never throws', async () => {
        delete process.env.UNIT_GATE;
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitpass' }], requiresEnv: 'UNIT_GATE' }));
        // Reported as Skipped, not Passed: nothing ran, and a skip that counts as a pass is
        // indistinguishable from a real pass in every downstream count and report.
        expect(result.status).toBe('Skipped');
        expect(result.oracleResults).toHaveLength(1);
        expect(result.oracleResults[0].oracleType).toBe('gate');
        expect(result.totalChecks).toBe(0);
        expect(result.passedChecks).toBe(0);
        expect(result.score).toBe(0);
    });

    describe('bundle platform declaration', () => {
        // Dedicated bundles: the registry is a process singleton with no unregister, so declaring
        // a platform on a shared bundle would leak into every later test in this file.
        beforeEach(() => {
            const reg = IntegrationCheckRegistry.Instance;
            reg.Register({ Id: 'unitplat.A', Name: 'platA', Fn: async () => { /* pass */ } });
            reg.Register({ Id: 'unitanyplat.A', Name: 'anyPlatA', Fn: async () => { /* pass */ } });
            reg.RegisterBundlePlatforms('unitplat', ['sqlserver']);
            // A dialect-impossible bundle does not merely fail on the wrong platform — its raw
            // sys.* SQL throws. Modelled here so "the excluded bundle still ran" is detectable.
            reg.Register({ Id: 'unitdialect.A', Name: 'dialectA', Fn: async () => { throw new Error('sys.objects does not exist on postgresql'); } });
            reg.RegisterBundlePlatforms('unitdialect', ['sqlserver']);
        });

        /** A bootstrap context is what tells the driver which platform is active. */
        function onPlatform(platform: 'sqlserver' | 'postgresql'): void {
            mockActiveBootstrap.mockReturnValue({
                Provider: { ProviderType: 'Database' }, Pool: undefined, Db: { Schema: '__mj', Platform: platform }
            });
        }

        it('runs a bundle declared for the active platform', async () => {
            onPlatform('sqlserver');
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ checks: [{ type: 'unitplat' }] }));
            expect(result.status).toBe('Passed');
            expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitplat.A']);
        });

        it('reports Skipped — not Passed — for a bundle excluded from the active platform, without running any check', async () => {
            onPlatform('postgresql');
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ checks: [{ type: 'unitplat' }] }));
            expect(result.status).toBe('Skipped');
            expect(result.oracleResults.map(o => o.oracleType)).not.toContain('unitplat.A');
            expect(result.oracleResults[0].message).toMatch(/postgresql/);
        });

        it('runs an undeclared bundle on every platform', async () => {
            onPlatform('postgresql');
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ checks: [{ type: 'unitanyplat' }] }));
            expect(result.status).toBe('Passed');
        });

        it('still runs a mixed selection where only SOME bundles are excluded, so a declaration can never silently drop coverage', async () => {
            onPlatform('postgresql');
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ checks: [{ type: 'unitplat' }, { type: 'unitanyplat' }] }));
            expect(result.status).not.toBe('Skipped');
            expect(result.oracleResults.map(o => o.oracleType)).toContain('unitanyplat.A');
        });

        it('does NOT run the excluded bundle in a mixed selection — a dialect-impossible bundle must never execute', async () => {
            onPlatform('postgresql');
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ checks: [{ type: 'unitdialect' }, { type: 'unitanyplat' }] }));
            // The runnable half still runs...
            expect(result.oracleResults.map(o => o.oracleType)).toContain('unitanyplat.A');
            // ...and the excluded half neither runs nor fails the test. Executing it would produce
            // a false RED that reads as a parity bug but is really the declaration being ignored.
            expect(result.oracleResults.map(o => o.oracleType)).not.toContain('unitdialect.A');
            expect(result.status).toBe('Passed');
        });

        it('does not let the platform gate oracle pad the score or the check counts', async () => {
            // The gate oracle records why coverage shrank; it is not a check that passed. Counting
            // it as one inflates score and passedChecks on a run that partially executed — the
            // exact padding this PR exists to remove, reintroduced one level down.
            IntegrationCheckRegistry.Instance.Register({
                Id: 'unitanyplat.F', Name: 'anyPlatF', Fn: async () => { throw new Error('real failure'); }
            });
            onPlatform('postgresql');
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ checks: [{ type: 'unitdialect' }, { type: 'unitanyplat' }] }));
            // One real check passed (A), one real check failed (F). The gate must not be counted.
            expect(result.totalChecks).toBe(2);
            expect(result.passedChecks).toBe(1);
            expect(result.score).toBe(0.5);
        });

        it('records WHICH bundles were dropped from a mixed selection, so the omission is never silent', async () => {
            onPlatform('postgresql');
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ checks: [{ type: 'unitdialect' }, { type: 'unitanyplat' }] }));
            const gate = result.oracleResults.find(o => o.oracleType === 'gate');
            expect(gate?.message).toMatch(/unitdialect/);
            expect(gate?.message).toMatch(/postgresql/);
        });

        it('runs everything when no bootstrap context reveals the platform (fail-open)', async () => {
            mockActiveBootstrap.mockReturnValue(null);
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ checks: [{ type: 'unitplat' }] }));
            // Wrongly skipping is the failure mode that hides bugs, so an unknown platform runs.
            expect(result.status).toBe('Passed');
        });

        it('refuses a declaration that would let a bundle run nowhere', () => {
            expect(() => IntegrationCheckRegistry.Instance.RegisterBundlePlatforms('unitplat', []))
                .toThrow(/at least one platform/i);
        });
    });

    // The environment-gap contract for client transport. CI runs no MJAPI and sets no
    // MJ_API_KEY, so BOTH of these conditions are hit on every CI run. Classifying either
    // one as Error (rather than Skipped) is only invisible while the exit code ignores
    // Error — which is exactly the false green this suite exists to prevent.
    describe('client transport environment gap', () => {
        it('reports Skipped — not Error — when the environment cannot run client transport at all (no MJ_API_KEY)', async () => {
            mockClientBootstrap.mockImplementation(async () => {
                throw new IntegrationEnvironmentUnavailableError(
                    'MJ_API_KEY is not set in the environment — required for client-side tests.'
                );
            });
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ transport: 'client', checks: [{ type: 'unitpass' }] }));
            expect(result.status).toBe('Skipped');
            expect(result.oracleResults[0].message).toMatch(/environment gap/i);
        });

        it('still reports Error when the client bootstrap fails for a genuine defect', async () => {
            mockClientBootstrap.mockImplementation(async () => { throw new Error('cache already claimed by a live host'); });
            const driver = new IntegrationTestDriver();
            const result = await driver.Execute(makeContext({ transport: 'client', checks: [{ type: 'unitpass' }] }));
            expect(result.status).toBe('Error');
        });
    });

    it('missing Configuration → Error result, never re-throws', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext(null));
        expect(result.status).toBe('Error');
        expect(result.oracleResults[0].oracleType).toBe('error');
    });

    it('a hung check is bounded by the remaining run budget → surfaces as a failed check (C6)', async () => {
        const reg = IntegrationCheckRegistry.Instance;
        // A check that never resolves — before C6 this ran forever (the between-checks timeout can
        // only fire BETWEEN checks). Now the per-check race rejects at the remaining budget.
        reg.Register({ Id: 'unithang.A', Name: 'hangA', Fn: () => new Promise<void>(() => { /* never resolves */ }) });
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unithang' }] }, 40));
        const hung = result.oracleResults.find(o => o.oracleType === 'unithang.A');
        expect(hung?.passed).toBe(false);
        expect(hung?.message).toMatch(/hung check|remaining run budget/);
        // Depending on the timer/ race ordering the run ends as Failed (check failed) or Timeout
        // (between-checks timer also fired) — both are acceptable; the check MUST be recorded failed.
        expect(['Failed', 'Timeout']).toContain(result.status);
    });

    it('a lifecycle Setup failure still runs Teardown (R4 guaranteed cleanup) and fails the bundle, never re-throws', async () => {
        const reg = IntegrationCheckRegistry.Instance;
        let teardownRan = false;
        reg.Register({ Id: 'unitsetupfail.A', Name: 'A', Fn: async () => { /* must NOT run — Setup failed first */ } });
        reg.RegisterLifecycle('unitsetupfail', {
            Setup: async () => { throw new Error('setup boom'); },
            Teardown: async () => { teardownRan = true; },
        });
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitsetupfail' }] }));
        expect(teardownRan, 'Teardown must run even when Setup throws').toBe(true);
        expect(result.oracleResults.some(o => o.oracleType === 'unitsetupfail.A'), 'checks must not run after a Setup failure').toBe(false);
        const fixtures = result.oracleResults.find(o => o.oracleType === 'unitsetupfail.fixtures');
        expect(fixtures?.passed).toBe(false);
        expect(fixtures?.message).toMatch(/setup boom|fixture setup failed/);
    });

    it('a lifecycle runs Setup then Teardown around passing checks', async () => {
        const reg = IntegrationCheckRegistry.Instance;
        const order: string[] = [];
        reg.Register({ Id: 'unitlifecycle.A', Name: 'A', Fn: async () => { order.push('check'); } });
        reg.RegisterLifecycle('unitlifecycle', {
            Setup: async () => { order.push('setup'); },
            Teardown: async () => { order.push('teardown'); },
        });
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitlifecycle' }] }));
        expect(result.status).toBe('Passed');
        expect(order).toEqual(['setup', 'check', 'teardown']);
    });
});
