import { describe, expect, it } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseTestDriver } from '../drivers/BaseTestDriver';
import type { DriverExecutionContext, OracleInput } from '../types';

class ProbeDriver extends BaseTestDriver {
    public async Execute(): Promise<never> {
        throw new Error('not used');
    }

    public input(context: DriverExecutionContext, fields: Omit<OracleInput, 'test' | 'contextUser' | 'testRunId' | 'provider'>): OracleInput {
        return this.BuildOracleInput(context, fields);
    }
}

const context = {
    test: { ID: 'test-1' },
    testRun: { ID: 'run-1' },
    contextUser: { ID: 'user-1' },
    options: {},
    oracleRegistry: new Map(),
} as unknown as DriverExecutionContext;

describe('BaseTestDriver.BuildOracleInput', () => {
    it('carries the test, the run, the user, and the driver provider', () => {
        const provider = { Entities: [] } as unknown as IMetadataProvider;
        const driver = new ProbeDriver();
        driver.Provider = provider;
        const input = driver.input(context, { expectedOutput: 'yes', actualOutput: 'no' });
        expect(input.test).toBe(context.test);
        expect(input.testRunId).toBe('run-1');
        expect(input.contextUser).toBe(context.contextUser);
        expect(input.provider).toBe(provider);
        expect(input.expectedOutput).toBe('yes');
        expect(input.actualOutput).toBe('no');
    });

    it('passes the target entity and the subject content through', () => {
        const driver = new ProbeDriver();
        driver.Provider = { Entities: [] } as unknown as IMetadataProvider;
        const target = { ID: 'agent-run' };
        const input = driver.input(context, { targetEntity: target, subjectContent: { text: 'transcript', data: { goal: 'g' } } });
        expect(input.targetEntity).toBe(target);
        expect(input.subjectContent).toEqual({ text: 'transcript', data: { goal: 'g' } });
    });
});
