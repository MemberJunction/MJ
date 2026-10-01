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
});
