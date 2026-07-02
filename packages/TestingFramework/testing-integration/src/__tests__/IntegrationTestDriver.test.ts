import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the bootstrap so the driver never touches a real DB/cache. getActiveIntegrationStorage
// returns a minimal instrumented-storage stub (only SetCount/ResetCounts are exercised here).
// serverProcessAlreadyClaimed is a controllable stub (default false = a properly-owned process)
// so the D1 "can't run inside a live MJAPI" guard can be exercised both ways.
const { mockServerClaimed } = vi.hoisted(() => ({ mockServerClaimed: vi.fn(() => false) }));
vi.mock('../bootstrap', () => ({
    getActiveIntegrationStorage: () => ({ SetCount: (_category: string) => 0, ResetCounts: () => { /* no-op */ } }),
    getActiveIntegrationBootstrap: () => null,
    getActiveIntegrationClientBootstrap: () => null,
    bootstrapIntegrationServer: async () => { throw new Error('unit test must not self-bootstrap'); },
    bootstrapIntegrationClient: async () => { throw new Error('unit test must not self-bootstrap'); },
    serverProcessAlreadyClaimed: () => mockServerClaimed()
}));

import { IntegrationTestDriver } from '../IntegrationTestDriver';
import { IntegrationCheckRegistry } from '../check-registry';
import type { DriverExecutionContext, IOracle } from '@memberjunction/testing-engine';
import type { MJTestEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

/** Build a minimal DriverExecutionContext for the fields the driver actually reads. */
function makeContext(config: object | null): DriverExecutionContext {
    const test = (config === null
        ? {}
        : { Configuration: JSON.stringify(config), MaxExecutionTimeMS: null }
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
        expect(off.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A']);

        const on = await driver.Execute(makeContext({ checks: [{ type: 'unitmut', config: { runMutationTests: true } }] }));
        expect(on.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitmut.M']);
    });

    it('RequiresMutation checks also run when RUN_MUTATION_TESTS=1 (env, no selector opt-in)', async () => {
        process.env.RUN_MUTATION_TESTS = '1';
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitmut' }] }));
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitmut.M']);
    });

    it("a live-model Test without RUN_AGENT_TESTS skip-passes with a single 'gate' oracle", async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'live-model', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Passed');
        expect(result.totalChecks).toBe(1);
        expect(result.oracleResults[0].oracleType).toBe('gate');
        expect(result.oracleResults[0].message).toContain('RUN_AGENT_TESTS');
    });

    it('a live-model Test with RUN_AGENT_TESTS=1 actually runs its checks', async () => {
        process.env.RUN_AGENT_TESTS = '1';
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'live-model', checks: [{ type: 'unitpass' }] }));
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitpass.A', 'unitpass.B']);
    });

    it("a mutation-tier Test without RUN_MUTATION_TESTS skip-passes with a 'gate' oracle", async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ tier: 'mutation', checks: [{ type: 'unitpass' }] }));
        expect(result.status).toBe('Passed');
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
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unitmut.A', 'unitpass.A', 'unitpass.B']);
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

    it('empty checks → Passed, score 0, totalChecks 0', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [] }));
        expect(result.status).toBe('Passed');
        expect(result.totalChecks).toBe(0);
        expect(result.score).toBe(0);
    });

    it('env gate unmet → Passed skip with a single "gate" oracle, never throws', async () => {
        delete process.env.UNIT_GATE;
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unitpass' }], requiresEnv: 'UNIT_GATE' }));
        expect(result.status).toBe('Passed');
        expect(result.oracleResults).toHaveLength(1);
        expect(result.oracleResults[0].oracleType).toBe('gate');
    });

    it('missing Configuration → Error result, never re-throws', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext(null));
        expect(result.status).toBe('Error');
        expect(result.oracleResults[0].oracleType).toBe('error');
    });
});
