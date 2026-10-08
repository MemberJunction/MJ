import { describe, expect, it } from 'vitest';
import { BaseTestDriver } from '../drivers/BaseTestDriver';
import type { RubricJudgedConfig } from '../oracles/rubric-resolution';
import type { DriverExecutionContext, SuiteFixtureContext } from '../types';

class Probe extends BaseTestDriver {
    public latest: { id: string; label: string } | undefined = { id: 'version-4', label: '1.2.0' };
    public warnings: string[] = [];

    public async Execute(): Promise<never> {
        throw new Error('not used');
    }

    public resolve<T extends RubricJudgedConfig>(config: T, context: DriverExecutionContext): Promise<T> {
        return this.ResolveRubricForRun(config, context);
    }

    public start(fixtures: SuiteFixtureContext): Promise<void> {
        return this.SetupSuite(fixtures, {} as never);
    }

    protected override async ReadOne(_context: DriverExecutionContext, entityName: string): Promise<Record<string, unknown> | undefined> {
        return entityName === 'MJ: Test Suite Runs' ? { ID: 'suite-run', SuiteID: 'child' } : undefined;
    }

    protected override async ReadMany(_context: DriverExecutionContext, entityName: string): Promise<Record<string, unknown>[]> {
        return entityName === 'MJ: Test Suites'
            ? [{ ID: 'child', ParentID: 'parent', RubricID: null }, { ID: 'parent', ParentID: null, RubricID: 'parent-rubric' }]
            : [];
    }

    protected override async LookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
        return this.latest;
    }

    protected override logToTestRun(_context: DriverExecutionContext, level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
        if (level === 'warn') this.warnings.push(message);
    }
}

function context(overrides: Record<string, unknown> = {}): DriverExecutionContext {
    return {
        test: { ID: 'test', RubricID: null },
        testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
        options: {},
        contextUser: {},
        oracleRegistry: new Map(),
        ...overrides,
    } as unknown as DriverExecutionContext;
}

describe('BaseTestDriver rubric resolution', () => {
    it('adds the suite rubric, pinned to the published version, to any driver config', async () => {
        const resolved = await new Probe().resolve({ oracles: [{ type: 'exact-match' }] }, context());
        expect(resolved.oracles).toEqual([
            { type: 'exact-match' },
            { type: 'rubric', config: { rubricId: 'parent-rubric', rubricVersionId: 'version-4', versionLabel: '1.2.0' } },
        ]);
        expect(resolved.scoringWeights).toEqual({ rubric: 1 });
    });

    it('adds nothing and warns when the rubric has no published version', async () => {
        const driver = new Probe();
        driver.latest = undefined;
        const config = { oracles: [{ type: 'llm-judge', config: { criteria: ['Accurate'] } }] };
        const resolved = await driver.resolve(config, context({ test: { ID: 'test', RubricID: 'draft-rubric' } }));
        expect(resolved).toEqual(config);
        expect(driver.warnings).toEqual(['Rubric draft-rubric has no published version. The rubric oracle was not added.']);
    });

    it('keeps an explicit rubric oracle even without a published version', async () => {
        const driver = new Probe();
        driver.latest = undefined;
        const resolved = await driver.resolve({ oracles: [{ type: 'rubric', config: { rubricId: 'draft-rubric' } }] }, context());
        expect(resolved.oracles).toEqual([{ type: 'rubric', config: { rubricId: 'draft-rubric' } }]);
        expect(driver.warnings).toEqual([]);
    });

    it('pins the suite rubric version on the fixture before the first test', async () => {
        const driver = new Probe();
        const fixtures: SuiteFixtureContext = { SuiteRunID: 'suite-run', Data: {}, CreatedRecords: [] };
        await driver.start(fixtures);
        expect(fixtures.PinnedRubricVersions?.['parent-rubric']).toEqual({ id: 'version-4', label: '1.2.0' });
        driver.latest = { id: 'version-9', label: '9.0.0' };
        const resolved = await driver.resolve({ oracles: [] }, context({ fixtures }));
        expect(resolved.oracles).toEqual([{ type: 'rubric', config: { rubricId: 'parent-rubric', rubricVersionId: 'version-4', versionLabel: '1.2.0' } }]);
    });
});
