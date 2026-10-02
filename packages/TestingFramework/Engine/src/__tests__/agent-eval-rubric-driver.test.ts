import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgentEvalDriver, type AgentEvalConfig } from '../drivers/AgentEvalDriver.js';
import type { DriverExecutionContext, SuiteFixtureContext } from '../types.js';

class SuiteProbe extends AgentEvalDriver {
    public readonly reads: { entity: string; filter: string }[] = [];

    public async resolve(config: AgentEvalConfig, context: DriverExecutionContext) {
        return this.WithResolvedRubric(config, context);
    }

    protected override async ReadOne(_context: DriverExecutionContext, entityName: string, filter: string): Promise<Record<string, unknown> | undefined> {
        this.reads.push({ entity: entityName, filter });
        if (entityName === 'MJ: Test Suite Runs') return { ID: 'suite-run', SuiteID: 'child' };
        return undefined;
    }

    protected override async ReadMany(_context: DriverExecutionContext, entityName: string, filter: string): Promise<Record<string, unknown>[]> {
        this.reads.push({ entity: entityName, filter });
        if (entityName === 'MJ: Test Suites') {
            return [
                { ID: 'child', ParentID: 'parent', RubricID: null },
                { ID: 'parent', ParentID: null, RubricID: 'parent-rubric' },
            ];
        }
        return [];
    }

    protected override async LoadAgentEvaluationRubric(): Promise<string | undefined> {
        return undefined;
    }

    protected override async LookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
        return { id: 'version-4', label: '1.2.0' };
    }
}

describe('agent eval rubric driver', () => {
    it('uses the parent suite rubric and the version the lookup returned', async () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../drivers/AgentEvalDriver.ts'), 'utf8');
        expect(source).not.toMatch(/TestSuiteID/);
        const driver = new SuiteProbe();
        const config: AgentEvalConfig = { agentId: 'agent', oracles: [] };
        const context = {
            test: { ID: 'test', RubricID: null },
            testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
            options: {},
            contextUser: {},
            oracleRegistry: new Map(),
        } as unknown as DriverExecutionContext;
        const resolved = await driver.resolve(config, context);
        expect(resolved.oracles).toEqual([{ type: 'rubric', config: { rubricId: 'parent-rubric', rubricVersionId: 'version-4', versionLabel: '1.2.0' } }]);
        expect(driver.reads.filter(read => read.entity === 'MJ: Test Suite Runs').map(read => read.filter)).toEqual(["ID='suite-run'"]);
        expect(driver.reads.filter(read => read.entity === 'MJ: Test Suites')).toHaveLength(1);
        const ignored = new SuiteProbe();
        const withoutSuiteRun = await ignored.resolve(config, {
            ...context,
            test: { ID: 'test', TestSuiteID: 'child', RubricID: null },
            testRun: { ID: 'run' },
        } as DriverExecutionContext);
        expect(withoutSuiteRun.oracles).toEqual([]);
    });

    it('pins the suite rubric version on the fixture before the first test', async () => {
        class MovingProbe extends SuiteProbe {
            public latest = { id: 'version-4', label: '1.2.0' };
            public async start(fixtures: SuiteFixtureContext) {
                await this.SetupSuite(fixtures, {} as never);
            }
            protected override async LookupLatestPublished(): Promise<{ id: string; label: string }> {
                return this.latest;
            }
        }
        const driver = new MovingProbe();
        const fixtures: SuiteFixtureContext = { SuiteRunID: 'suite-run', Data: {}, CreatedRecords: [] };
        await driver.start(fixtures);
        expect(fixtures.PinnedRubricVersions?.['parent-rubric']).toEqual({ id: 'version-4', label: '1.2.0' });
        driver.latest = { id: 'version-9', label: '9.0.0' };
        const resolved = await driver.resolve({ agentId: 'agent', oracles: [] }, {
            test: { ID: 'test', RubricID: null },
            testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
            options: {},
            fixtures,
            contextUser: {},
            oracleRegistry: new Map(),
        } as unknown as DriverExecutionContext);
        expect(resolved.oracles).toEqual([{ type: 'rubric', config: { rubricId: 'parent-rubric', rubricVersionId: 'version-4', versionLabel: '1.2.0' } }]);
    });

    it('labels an explicit version without pinning it', async () => {
        const latest: { id: string; label: string } = { id: 'version-9', label: '9.0.0' };
        class ExplicitProbe extends AgentEvalDriver {
            public async resolve(config: AgentEvalConfig, context: DriverExecutionContext) {
                return this.WithResolvedRubric(config, context);
            }

            protected override async LoadSuites(): Promise<{ suiteId?: string; suites: [] }> {
                return { suites: [] };
            }

            protected override async LoadAgentEvaluationRubric(): Promise<string | undefined> {
                return undefined;
            }

            protected override async LookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
                return latest;
            }

            protected override async LookupVersionLabel(): Promise<string | undefined> {
                return '1.2.0';
            }
        }
        const driver = new ExplicitProbe();
        const context = {
            test: { ID: 'test' },
            testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
            options: { rubricId: 'named', rubricVersionId: 'version-explicit' },
            contextUser: {},
            oracleRegistry: new Map(),
        } as unknown as DriverExecutionContext;
        const explicit = await driver.resolve({ agentId: 'agent', oracles: [] }, context);
        expect(explicit.oracles[0].config).toEqual({ rubricId: 'named', rubricVersionId: 'version-explicit', versionLabel: '1.2.0' });
        const pinned = await driver.resolve({ agentId: 'agent', oracles: [] }, { ...context, options: { rubricId: 'named' } } as DriverExecutionContext);
        expect(pinned.oracles[0].config).toEqual({ rubricId: 'named', rubricVersionId: 'version-9', versionLabel: '9.0.0' });
    });

    it('keeps the inline judge when the resolved rubric has no published version', async () => {
        class DraftProbe extends SuiteProbe {
            protected override async LookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
                return undefined;
            }
        }
        const driver = new DraftProbe();
        const context = {
            test: { ID: 'test', RubricID: 'draft-rubric' },
            testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
            options: {},
            contextUser: {},
            oracleRegistry: new Map(),
        } as unknown as DriverExecutionContext;
        const resolved = await driver.resolve({
            agentId: 'agent',
            oracles: [{ type: 'llm-judge', config: { criteria: ['Accurate'] } }],
        }, context);
        expect(resolved.oracles).toEqual([
            { type: 'llm-judge', config: { criteria: ['Accurate'] } },
            { type: 'rubric', config: { rubricId: 'draft-rubric' } },
        ]);
    });

    it('pins the test rubric when an llm-judge is also present', async () => {
        const driver = new SuiteProbe();
        const context = {
            test: { ID: 'test', RubricID: 'published-rubric' },
            testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
            options: {},
            contextUser: {},
            oracleRegistry: new Map(),
        } as unknown as DriverExecutionContext;
        const resolved = await driver.resolve({
            agentId: 'agent',
            oracles: [{ type: 'llm-judge', config: { criteria: ['Accurate'] } }, { type: 'trace-no-errors' }],
        }, context);
        expect(resolved.oracles).toEqual([
            { type: 'llm-judge', config: { criteria: ['Accurate'] } },
            { type: 'trace-no-errors' },
            { type: 'rubric', config: { rubricId: 'published-rubric', rubricVersionId: 'version-4', versionLabel: '1.2.0' } },
        ]);
    });

    it('refuses a failed view instead of treating it as no rows', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const driver = readFileSync(join(directory, '../drivers/AgentEvalDriver.ts'), 'utf8');
        const calibration = readFileSync(join(directory, '../drivers/RubricCalibrationTestDriver.ts'), 'utf8');
        expect(driver).toContain('if (!found.Success)');
        expect(calibration).toContain('if (!result.Success)');
        expect(driver).not.toMatch(/new RunView\(\)/);
        expect(driver).not.toContain('RunView.Provider as unknown');
        expect(calibration).not.toMatch(/new RunView\(\)/);
        expect(calibration).not.toContain('as never');
    });

    it('passes the agent evaluator config to the implicit rubric oracle', async () => {
        class AgentRubricProbe extends AgentEvalDriver {
            public async resolve(config: AgentEvalConfig, context: DriverExecutionContext) {
                return this.WithResolvedRubric(config, context);
            }
            protected override async LoadSuites(): Promise<{ suiteId?: string; suites: [] }> {
                return { suites: [] };
            }
            protected override async LoadAgentEvaluationRubric(): Promise<{ rubricId: string; evaluatorConfig?: Record<string, unknown> }> {
                return {
                    rubricId: 'agent-rubric',
                    evaluatorConfig: { EvaluatorType: 'AIPrompt', PromptName: 'Rubric Judge - Sage' },
                };
            }
            protected override async LookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
                return { id: 'version-1', label: '1.0.0' };
            }
        }
        const driver = new AgentRubricProbe();
        const context = {
            test: { ID: 'test' },
            testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
            options: {},
            contextUser: {},
            oracleRegistry: new Map(),
        } as unknown as DriverExecutionContext;
        const resolved = await driver.resolve({ agentId: 'agent', oracles: [] }, context);
        expect(resolved.oracles).toEqual([{
            type: 'rubric',
            config: {
                rubricId: 'agent-rubric',
                rubricVersionId: 'version-1',
                versionLabel: '1.0.0',
                evaluator: { EvaluatorType: 'AIPrompt', PromptName: 'Rubric Judge - Sage' },
            },
        }]);
    });
});

