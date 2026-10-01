import { describe, expect, it } from 'vitest';
import { AgentEvalDriver, type AgentEvalConfig } from '../drivers/AgentEvalDriver.js';
import type { DriverExecutionContext } from '../types.js';
import type { RubricSuiteRow } from '../oracles/rubric-resolution.js';

class SuiteProbe extends AgentEvalDriver {
    public async resolve(config: AgentEvalConfig, context: DriverExecutionContext) {
        return this.withResolvedRubric(config, context);
    }

    protected override async loadSuiteChain(): Promise<RubricSuiteRow[]> {
        return [
            { id: 'child', parentId: 'parent', rubricId: null },
            { id: 'parent', parentId: null, rubricId: 'parent-rubric' },
        ];
    }

    protected override async loadAgentEvaluationRubric(): Promise<string | undefined> {
        return undefined;
    }

    protected override async lookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
        return { id: 'version-4', label: '1.2.0' };
    }
}

describe('agent eval rubric driver', () => {
    it('uses the parent suite rubric and the version the lookup returned', async () => {
        const driver = new SuiteProbe();
        const config: AgentEvalConfig = { agentId: 'agent', oracles: [] };
        const context = {
            test: { ID: 'test', TestSuiteID: 'child', RubricID: null },
            testRun: { ID: 'run', TestSuiteRunID: 'suite-run' },
            options: {},
            contextUser: {},
            oracleRegistry: new Map(),
        } as unknown as DriverExecutionContext;
        const resolved = await driver.resolve(config, context);
        expect(resolved.oracles).toEqual([{ type: 'rubric', config: { rubricId: 'parent-rubric', rubricVersionId: 'version-4', versionLabel: '1.2.0' } }]);
    });

    it('labels an explicit version without pinning it', async () => {
        const latest: { id: string; label: string } = { id: 'version-9', label: '9.0.0' };
        class ExplicitProbe extends AgentEvalDriver {
            public async resolve(config: AgentEvalConfig, context: DriverExecutionContext) {
                return this.withResolvedRubric(config, context);
            }

            protected override async loadSuiteChain(): Promise<RubricSuiteRow[]> {
                return [];
            }

            protected override async loadAgentEvaluationRubric(): Promise<string | undefined> {
                return undefined;
            }

            protected override async lookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
                return latest;
            }

            protected override async lookupVersionLabel(): Promise<string | undefined> {
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
            protected override async lookupLatestPublished(): Promise<{ id: string; label: string } | undefined> {
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
        expect(resolved.oracles.map(oracle => oracle.type)).toEqual(['llm-judge']);
    });

    it('drops the inline judge once the resolved rubric has a published version', async () => {
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
        expect(resolved.oracles.map(oracle => oracle.type)).toEqual(['trace-no-errors', 'rubric']);
        expect(resolved.oracles[1].config).toMatchObject({ rubricId: 'published-rubric', rubricVersionId: 'version-4' });
    });
});
