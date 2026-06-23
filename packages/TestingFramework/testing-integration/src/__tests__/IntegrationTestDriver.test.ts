import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the bootstrap so the driver never touches a real DB/cache. getActiveIntegrationStorage
// returns a minimal instrumented-storage stub (only SetCount/ResetCounts are exercised here).
vi.mock('../bootstrap', () => ({
    getActiveIntegrationStorage: () => ({ SetCount: (_category: string) => 0, ResetCounts: () => { /* no-op */ } }),
    getActiveIntegrationBootstrap: () => null,
    bootstrapIntegrationServer: async () => { throw new Error('unit test must not self-bootstrap'); }
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

describe('IntegrationTestDriver result mapping', () => {
    beforeEach(() => {
        const reg = IntegrationCheckRegistry.Instance;
        reg.Register({ Id: 'unit.pass1', Name: 'pass1', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unit.pass2', Name: 'pass2', Fn: async () => { /* pass */ } });
        reg.Register({ Id: 'unit.fail', Name: 'fail', Fn: async () => { throw new Error('boom'); } });
    });

    it('all checks pass → Passed, score 1, counts correct, oracleType per check', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unit.pass1' }, { type: 'unit.pass2' }] }));
        expect(result.status).toBe('Passed');
        expect(result.score).toBe(1);
        expect(result.passedChecks).toBe(2);
        expect(result.failedChecks).toBe(0);
        expect(result.totalChecks).toBe(2);
        expect(result.oracleResults.map(o => o.oracleType)).toEqual(['unit.pass1', 'unit.pass2']);
    });

    it('one check fails → Failed, score 0.5, failing message preserved', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unit.pass1' }, { type: 'unit.fail' }] }));
        expect(result.status).toBe('Failed');
        expect(result.score).toBe(0.5);
        expect(result.passedChecks).toBe(1);
        expect(result.failedChecks).toBe(1);
        expect(result.oracleResults.find(o => o.oracleType === 'unit.fail')?.message).toBe('boom');
    });

    it('unknown check → a failing OracleResult (never silently dropped)', async () => {
        const driver = new IntegrationTestDriver();
        const result = await driver.Execute(makeContext({ checks: [{ type: 'nope.x' }] }));
        expect(result.totalChecks).toBe(1);
        expect(result.oracleResults[0].passed).toBe(false);
        expect(result.oracleResults[0].oracleType).toBe('nope.x');
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
        const result = await driver.Execute(makeContext({ checks: [{ type: 'unit.pass1' }], requiresEnv: 'UNIT_GATE' }));
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
