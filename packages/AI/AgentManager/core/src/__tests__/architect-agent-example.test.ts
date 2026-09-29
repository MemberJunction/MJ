import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentSpec, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentArchitectAgent } from '../agents/architect-agent';
import { IsDecisionStep, ValidateDecisionStep } from '../flow-step-validation';

/** The seeded agent types the Architect's template names by ID. */
const FLOW_TYPE_ID = '4F6A189B-C068-4736-9F23-3FF540B40FDD';
const LOOP_TYPE_ID = 'F7926101-5099-4FA5-836A-479D9707C818';

function agentType(id: string, name: string): MJAIAgentTypeEntity {
    return { ID: id, Name: name } as MJAIAgentTypeEntity;
}

class TestArchitectAgent extends AgentArchitectAgent {
    public async testValidateAgentSpec(
        spec: AgentSpec,
        params: ExecuteAgentParams = {} as ExecuteAgentParams
    ): Promise<{ errors: string[]; correctedSpec?: AgentSpec }> {
        return this.validateAgentSpec(spec, params);
    }

    protected override async validateActions(): Promise<{ errors: string[] }> {
        return { errors: [] };
    }
}

describe('Architect Agent Example Output and Decision Step Validation', () => {
    beforeEach(() => {
        // validateAgentSpec resolves a spec's TypeID (a GUID) to its type's name through AIEngine.
        vi.spyOn(AIEngine.Instance, 'AgentTypes', 'get').mockReturnValue([agentType(FLOW_TYPE_ID, 'Flow'), agentType(LOOP_TYPE_ID, 'Loop')]);
    });

    const examplePath = path.resolve(
        __dirname,
        '../../../../../../metadata/prompts/output/agent-manager/architect-agent.example.json'
    );

    it('parses architect-agent.example.json as valid JSON', () => {
        const rawContent = fs.readFileSync(examplePath, 'utf8');
        expect(() => JSON.parse(rawContent)).not.toThrow();
    });

    it('validates the Decision step in example_4_flow_agent_with_decision_step', () => {
        const rawContent = fs.readFileSync(examplePath, 'utf8');
        const parsed = JSON.parse(rawContent);
        const example4 = parsed.example_4_flow_agent_with_decision_step;

        expect(example4).toBeDefined();
        expect(example4.output).toBeDefined();

        const spec: AgentSpec = example4.output;
        expect(spec.Steps).toBeDefined();
        expect(spec.Paths).toBeDefined();

        const decisionStep = spec.Steps?.find(s => IsDecisionStep(s));
        expect(decisionStep).toBeDefined();
        expect(decisionStep?.Name).toBe('Triage Issue');

        if (!decisionStep) return;
        const stepErrors = ValidateDecisionStep(decisionStep, 0, { Steps: spec.Steps, Paths: spec.Paths });
        expect(stepErrors).toEqual([]);
    });

    it('passes full AgentArchitectAgent.validateAgentSpec for example_4', async () => {
        const rawContent = fs.readFileSync(examplePath, 'utf8');
        const parsed = JSON.parse(rawContent);
        const spec: AgentSpec = parsed.example_4_flow_agent_with_decision_step.output;

        const architect = new TestArchitectAgent();
        const result = await architect.testValidateAgentSpec(spec);

        expect(result.errors).toEqual([]);
    });

    it('catches an invalid Decision step inside validateAgentSpec', async () => {
        const rawContent = fs.readFileSync(examplePath, 'utf8');
        const parsed = JSON.parse(rawContent);
        const spec: AgentSpec = JSON.parse(JSON.stringify(parsed.example_4_flow_agent_with_decision_step.output));

        // Invalidate the Decision step by removing one covering path from the Choice fork
        spec.Paths = spec.Paths?.filter(p => !p.Condition?.includes('general'));

        const architect = new TestArchitectAgent();
        const result = await architect.testValidateAgentSpec(spec);

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.join(' ')).toContain('incomplete Choice fork');
        expect(result.errors.join(' ')).toContain('"general"');
    });
});
