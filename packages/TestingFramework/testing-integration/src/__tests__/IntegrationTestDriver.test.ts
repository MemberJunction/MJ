import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the bootstrap so the driver never touches a real DB/cache. getActiveIntegrationStorage
// returns a minimal instrumented-storage stub (only SetCount/ResetCounts are exercised here).
// serverProcessAlreadyClaimed is a controllable stub (default false = a properly-owned process)
// so the D1 "can't run inside a live MJAPI" guard can be exercised both ways.
/** Minimal shape of the active server bootstrap the driver reads (Provider type, pool, schema). */
interface FakeServerBootstrap {
    Provider: { ProviderType: string };
    Pool: undefined;
    Db: { Schema: string };
}
const { mockServerClaimed, mockActiveBootstrap, mockClientBootstrap } = vi.hoisted(() => ({
    mockServerClaimed: vi.fn(() => false),
    /** The client bootstrap the driver calls for a client-transport test; each test decides how it fails. */
    mockClientBootstrap: vi.fn(async (): Promise<never> => { throw new Error('unit test must not self-bootstrap'); }),
    // Default null keeps the server branch resolving Metadata.Provider (unset in unit env), exactly
    // as before; tests that need a typed provider override this to inject one (#3251 guard).
    mockActiveBootstrap: vi.fn<() => FakeServerBootstrap | null>(() => null),
}));
vi.mock('../bootstrap', () => {
    const refuseBootstrap = async (): Promise<never> => { throw new Error('unit test must not self-bootstrap'); };
    return {
        getActiveIntegrationStorage: () => ({ SetCount: (_category: string) => 0, ResetCounts: () => { /* no-op */ } }),
        getActiveIntegrationBootstrap: () => mockActiveBootstrap(),
        getActiveIntegrationClientBootstrap: () => null,
        BootstrapIntegrationServer: refuseBootstrap,
        bootstrapIntegrationServer: refuseBootstrap,
        bootstrapIntegrationClient: refuseBootstrap,
        serverProcessAlreadyClaimed: () => mockServerClaimed()
    };
});

vi.mock('../bootstrap-client', () => ({ BootstrapIntegrationClient: () => mockClientBootstrap() }));

import { IntegrationTestDriver } from '../IntegrationTestDriver';
import { MJAPIUnreachableError } from '../bootstrap-shared';
import { IntegrationCheckRegistry } from '../check-registry';
import type { DriverExecutionContext, DriverExecutionResult, IOracle } from '@memberjunction/testing-engine';
import type { IntegrationCheckSelection } from '../types';
import type { MJTestEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

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
        const reg = IntegrationCheckRegistry.Instance;
        // A unique bundle prefix per concern keeps these isolated from the real bundles.
        reg.Register({ Id: 'unitpass.A', Name: 'A', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitpass.B', Name: 'B', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitmix.A', Name: 'mixA', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitmix.B', Name: 'mixB', Fn: async () => { throw new Error('boom'); } });
        reg.Register({ Id: 'unitmut.A', Name: 'mutA', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitmut.M', Name: 'mutM', RequiresMutation: true, Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unitcost.A', Name: 'costA', Fn: async (ctx) => { ctx.CostUSD = (ctx.CostUSD || 0) + 0.25; } });
        reg.Register({ Id: 'unitcost.B', Name: 'costB', Fn: async (ctx) => { ctx.CostUSD = (ctx.CostUSD || 0) + 0.5; throw new Error('failed after spending'); } });
        reg.Register({ Id: 'unitcost.C', Name: 'costC', Fn: async () => { /* no model call */ } });
    });

    it('sums the cost the checks reported into the result totalCost, a failed check included', async () => {
        const result = await new IntegrationTestDriver().Execute(makeContext({ checks: [{ type: 'unitcost' }] }));
        expect(result.totalCost).toBe(0.75);
        const costOf = (id: string): number | undefined => {
            const cost = (result.oracleResults.find(o => o.oracleType === id)?.details as Record<string, unknown> | undefined)?.CostUSD; // details is typed unknown by the engine
            return typeof cost === 'number' ? cost : undefined;
        };
        expect(costOf('unitcost.A')).toBe(0.25);   // each check carries only its own cost, not the running total
        expect(costOf('unitcost.B')).toBe(0.5);
        expect(costOf('unitcost.C')).toBeUndefined();
    });

    it('counts the spend of a bundle fixture setup and teardown in the total, but on no check', async () => {
        IntegrationCheckRegistry.Instance.Register({ Id: 'unitlife.A', Name: 'lifeA', Fn: async () => { /* no model call */ } });
        IntegrationCheckRegistry.Instance.RegisterLifecycle('unitlife', {
            Setup: async (ctx) => { ctx.CostUSD = (ctx.CostUSD || 0) + 0.125; },
            Teardown: async (ctx) => { ctx.CostUSD = (ctx.CostUSD || 0) + 0.25; },
        });
        const result = await new IntegrationTestDriver().Execute(makeContext({ checks: [{ type: 'unitlife' }] }));
        expect(result.totalCost).toBe(0.375);
        expect((result.oracleResults[0].details as Record<string, unknown>).CostUSD).toBeUndefined();
    });

    it('a check that reports no cost contributes 0', async () => {
        const result = await new IntegrationTestDriver().Execute(makeContext({ checks: [{ type: 'unitpass' }] }));
        expect(result.totalCost).toBe(0);
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

    it('RequiresMutation checks are recorded as SKIPPED (never silently dropped) unless the selector opts in', async () => {
        const driver = new IntegrationTestDriver();
        const off = await driver.Execute(makeContext({ checks: [{ type: 'unitmut' }] }));
        // The gated check appears in the results as a skipped entry — visible, not vanished.
        expect(off.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitmut.M']);
        const skippedEntry = off.oracleResults.find(o => o.oracleType === 'unitmut.M');
        expect((skippedEntry?.details as Record<string, unknown>)?.Skipped).toBe(true);
        expect(off.totalChecks).toBe(1);          // executed only
        expect(off.skippedChecks).toBe(1);
        expect(off.status).toBe('Passed');        // skips never fail a run that executed green

        const on = await driver.Execute(makeContext({ checks: [{ type: 'unitmut', config: { runMutationTests: true } }] }));
        expect(on.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitmut.M']);
        expect(on.skippedChecks).toBe(0);
        expect(on.totalChecks).toBe(2);
    });

    it('RequiresMutation checks also run when RUN_MUTATION_TESTS=1 (env, no selector opt-in)', async () => {
        process.env.RUN_MUTATION_TESTS = '1';
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitmut' }] }));
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitmut.M']);
    });

    it("a live-model Test with RUN_AGENT_TESTS=0 reports a REAL 'Skipped' status with a single 'gate' oracle (explicit opt-out)", async () => {
        process.env.RUN_AGENT_TESTS = '0';
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'live-model', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Skipped');    // Track A/A1: a gated run must never report Passed
        expect(result.totalChecks).toBe(0);       // nothing executed
        expect(result.skippedChecks).toBe(1);
        expect(result.oracleResults[0].oracleType).toBe('gate');
        expect(result.oracleResults[0].message).toContain('RUN_AGENT_TESTS');
    });

    it('a live-model Test runs its checks BY DEFAULT (no env var — the 2026-07-20 inversion)', async () => {
        delete process.env.RUN_AGENT_TESTS;
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'live-model', checks: [{ type: 'unitpass' }] }));
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitpass.A', 'unitpass.B']);
    });

    it("a mutation-tier Test without RUN_MUTATION_TESTS reports 'Skipped' with a 'gate' oracle", async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'mutation', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Skipped');
        expect(result.skippedChecks).toBe(1);
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

    it('multiple bundles run in declared order, results concatenated (skipped entries in place)', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitmut' }, { type: 'unitpass' }] }));
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitmut.M', 'unitpass.A', 'unitpass.B']);
        expect(result.skippedChecks).toBe(1); // unitmut.M is mutation-gated → visible skip
        expect(result.totalChecks).toBe(3);
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

    it('empty checks → Passed, score 0, totalChecks 0', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [] }));
        expect(result.status).toBe('Passed');
        expect(result.totalChecks).toBe(0);
        expect(result.score).toBe(0);
    });

    it('env gate unmet → REAL Skipped result with a single "gate" oracle, never throws', async () => {
        delete process.env.UNIT_GATE;
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitpass' }], requiresEnv: 'UNIT_GATE' }));
        expect(result.status).toBe('Skipped');
        expect(result.skippedChecks).toBe(1);
        expect(result.oracleResults).toHaveLength(1);
        expect(result.oracleResults[0].oracleType).toBe('gate');
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

    describe('tier scopes', () => {
        /** Observed scope state: `active` is true only between the scope's Enter and its exit. */
        const observed = { active: false, enters: 0, exits: 0, seenByCheck: [] as boolean[] };
        const scopeName = 'unit-deterministic-scope';

        beforeEach(() => {
            observed.active = false;
            observed.enters = 0;
            observed.exits = 0;
            observed.seenByCheck = [];
            const reg = IntegrationCheckRegistry.Instance;
            reg.UnregisterTierScope(scopeName);
            reg.RegisterTierScope({
                Name: scopeName,
                Tiers: ['deterministic', 'mutation'],
                Enter: () => {
                    observed.active = true;
                    observed.enters++;
                    return () => { observed.active = false; observed.exits++; };
                }
            });
            reg.Register({ Id: 'unitscope.A', Name: 'scopeA', Fn: async () => { observed.seenByCheck.push(observed.active); } });
            reg.Register({ Id: 'unitscopethrow.A', Name: 'scopeThrow', Fn: async () => { observed.seenByCheck.push(observed.active); throw new Error('boom'); } });
        });

        it('a deterministic test runs its checks inside the scope and leaves it afterwards', async () => {
            const result = await new IntegrationTestDriver().Execute(makeContext({ tier: 'deterministic', checks: [{ type: 'unitscope' }] }));
            expect(result.status).toBe('Passed');
            expect(observed.seenByCheck).toEqual([true]);
            expect(observed.active).toBe(false);
            expect([observed.enters, observed.exits]).toEqual([1, 1]);
        });

        it('a live-model test never enters a scope bound to other tiers', async () => {
            delete process.env.RUN_AGENT_TESTS;
            const result = await new IntegrationTestDriver().Execute(makeContext({ tier: 'live-model', checks: [{ type: 'unitscope' }] }));
            expect(result.status).toBe('Passed');
            expect(observed.seenByCheck).toEqual([false]);
            expect(observed.enters).toBe(0);
        });

        it('a gated (skipped) test does not enter the scope', async () => {
            const result = await new IntegrationTestDriver().Execute(makeContext({ tier: 'mutation', checks: [{ type: 'unitscope' }] }));
            expect(result.status).toBe('Skipped');
            expect(observed.enters).toBe(0);
        });

        it('the scope is exited even when a check fails', async () => {
            const result = await new IntegrationTestDriver().Execute(makeContext({ checks: [{ type: 'unitscopethrow' }] }));
            expect(result.status).toBe('Failed');
            expect(observed.seenByCheck).toEqual([true]);
            expect(observed.active).toBe(false);
            expect([observed.enters, observed.exits]).toEqual([1, 1]);
        });

        it('a different scope under an existing name is rejected', () => {
            expect(() => IntegrationCheckRegistry.Instance.RegisterTierScope({
                Name: scopeName,
                Tiers: ['live-model'],
                Enter: () => () => { /* no-op */ }
            })).toThrow(/already registered/);
        });
    });

    describe('error labelling', () => {
        const throwingScope = 'unit-throwing-scope';

        afterEach(() => {
            IntegrationCheckRegistry.Instance.UnregisterTierScope(throwingScope);
        });

        /** A driver whose run step throws, as a bundle or result-building failure would. */
        class ThrowingRunDriver extends IntegrationTestDriver {
            protected override async ExecuteSelected(
                _context: DriverExecutionContext,
                _startTime: number,
                _selectors: IntegrationCheckSelection[],
                _transport: 'server' | 'client'
            ): Promise<DriverExecutionResult> {
                throw new Error('result assembly blew up');
            }
        }

        it('a scope whose Enter throws is reported as a scope-setup failure', async () => {
            IntegrationCheckRegistry.Instance.RegisterTierScope({
                Name: throwingScope,
                Tiers: ['deterministic'],
                Enter: () => { throw new Error('cannot switch'); }
            });
            const result = await new IntegrationTestDriver().Execute(makeContext({ checks: [{ type: 'unitpass' }] }));
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toMatch(/^Tier scope setup failed: cannot switch/);
        });

        it('an error from the run itself keeps its own label (not "Tier scope setup failed") and the scopes are exited', async () => {
            let active = false;
            IntegrationCheckRegistry.Instance.RegisterTierScope({
                Name: throwingScope,
                Tiers: ['deterministic'],
                Enter: () => { active = true; return () => { active = false; }; }
            });
            const result = await new ThrowingRunDriver().Execute(makeContext({ checks: [{ type: 'unitpass' }] }));
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toMatch(/^Integration test execution failed: result assembly blew up/);
            expect(result.errorMessage).not.toMatch(/Tier scope/);
            expect(active).toBe(false);
        });

        it('a client-transport test whose MJAPI is unreachable is Skipped as an environment gap', async () => {
            mockClientBootstrap.mockImplementationOnce(async () => { throw new MJAPIUnreachableError('http://localhost:1/graphql', 'ECONNREFUSED'); });
            const result = await new IntegrationTestDriver().Execute(makeContext({ transport: 'client', checks: [{ type: 'unitpass' }] }));
            expect(result.status).toBe('Skipped');
            expect(result.oracleResults[0].message).toMatch(/environment gap/);
        });

        it('any other client bootstrap failure is an Error, even when its text mentions reachability', async () => {
            mockClientBootstrap.mockImplementationOnce(async () => { throw new Error('MJAPI is not reachable — but this is a plain Error'); });
            const result = await new IntegrationTestDriver().Execute(makeContext({ transport: 'client', checks: [{ type: 'unitpass' }] }));
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toMatch(/^Bootstrap failed: /);
        });
    });
});
