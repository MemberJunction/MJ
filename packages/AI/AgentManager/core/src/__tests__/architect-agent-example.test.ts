import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentSpec, AgentStep, AgentStepPath, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentArchitectAgent } from '../agents/architect-agent';
import { ValidateFlowGraph } from '../flow-step-validation';

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

/** The Architect's example outputs, keyed by example. */
type ArchitectExamples = Record<string, { output: AgentSpec }>;

const examplePath = path.resolve(
    __dirname,
    '../../../../../../metadata/prompts/output/agent-manager/architect-agent.example.json'
);

/** A fresh copy of example_4's spec, so a test can change it. */
function example4(): AgentSpec {
    const examples: ArchitectExamples = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    return examples.example_4_flow_agent_with_decision_step.output;
}

async function validateSpec(spec: AgentSpec): Promise<string[]> {
    return (await new TestArchitectAgent().testValidateAgentSpec(spec)).errors;
}

describe('Architect Agent Example Output and Decision Step Validation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // validateAgentSpec resolves a spec's TypeID (a GUID) to its type's name through AIEngine.
        vi.spyOn(AIEngine.Instance, 'AgentTypes', 'get').mockReturnValue([agentType(FLOW_TYPE_ID, 'Flow'), agentType(LOOP_TYPE_ID, 'Loop')]);
    });

    it('parses architect-agent.example.json as valid JSON', () => {
        const rawContent = fs.readFileSync(examplePath, 'utf8');
        expect(() => JSON.parse(rawContent)).not.toThrow();
    });

    it('compiles and validates example_4_flow_agent_with_decision_step as the runtime does', () => {
        const spec = example4();
        expect(spec.Steps?.find(s => s.StepType === 'Decision')?.Name).toBe('Triage Issue');
        expect(ValidateFlowGraph(spec.Steps ?? [], spec.Paths ?? [], spec.Name)).toEqual([]);
    });

    it('passes full AgentArchitectAgent.validateAgentSpec for example_4', async () => {
        expect(await validateSpec(example4())).toEqual([]);
    });

    it('catches an incomplete Choice fork inside validateAgentSpec', async () => {
        const spec = example4();
        spec.Paths = spec.Paths?.filter(p => !p.Condition?.includes('general'));

        const errors = (await validateSpec(spec)).join(' ');
        expect(errors).toContain('[IncompleteFork]');
        expect(errors).toContain('"general"');
    });

    it('accepts a single conditional path from a Decision step, which the runtime runs', async () => {
        const spec = example4();
        spec.Steps = spec.Steps?.filter(s => s.Name === 'Triage Issue' || s.Name === 'Handle Billing');
        spec.Paths = spec.Paths?.filter(p => p.DestinationStepID === 'Handle Billing');

        expect(await validateSpec(spec)).toEqual([]);
    });

    // The three specs a review probed: the Architect passed each one, and the runtime refused it.
    it.each([
        {
            what: 'a path from a later step reading an unknown Decision key',
            code: '[UnknownDecisionKey]',
            change: (spec: AgentSpec): void => {
                const summarize: AgentStep = { ID: '', Name: 'Summarize', StepType: 'Prompt', StartingStep: false, PromptText: 'Summarize the issue.', PromptName: 'Summarize Issue' };
                spec.Steps = [...(spec.Steps ?? []), summarize];
                const fromTriage: AgentStepPath = { ID: '', OriginStepID: 'Handle General', DestinationStepID: 'Summarize', Priority: 0 };
                const fromSummarize: AgentStepPath = { ID: '', OriginStepID: 'Summarize', DestinationStepID: 'Handle Billing', Condition: "decisions.triag.category.value === 'billing'", Priority: 0 };
                spec.Paths = [...(spec.Paths ?? []), fromTriage, fromSummarize];
            },
        },
        {
            what: 'a Likelihood read through .value',
            code: '[InvalidCondition]',
            change: (spec: AgentSpec): void => addUrgentGate(spec, 'decisions.triage.urgent.value >= 0.8'),
        },
        {
            what: 'a question the Decision step does not ask',
            code: '[InvalidCondition]',
            change: (spec: AgentSpec): void => addUrgentGate(spec, 'decisions.triage.urgency.probability >= 0.8'),
        },
    ])('refuses $what inside validateAgentSpec', async ({ code, change }) => {
        const spec = example4();
        change(spec);
        expect((await validateSpec(spec)).join('\n')).toContain(code);
    });

    it('validates the Decision steps of a Flow child sub-agent', async () => {
        const child: AgentSpec = {
            ID: '',
            Name: 'Ticket Router',
            TypeID: FLOW_TYPE_ID,
            StartingPayloadValidationMode: 'Fail',
            Prompts: [],
            Steps: [
                { ID: '', Name: 'Route', StepType: 'Decision', StartingStep: true, Configuration: { key: '1bad' } },
                { ID: '', Name: 'Escalate', StepType: 'Action', StartingStep: false, ActionID: 'escalate-action-guid' },
            ],
            Paths: [{ ID: '', OriginStepID: 'Route', DestinationStepID: 'Escalate', Condition: 'decisions.nope.q', Priority: 0 }],
        };
        const parent: AgentSpec = {
            ID: '',
            Name: 'Support Desk',
            TypeID: LOOP_TYPE_ID,
            StartingPayloadValidationMode: 'Fail',
            Prompts: [{ ID: '', PromptID: '', PromptName: 'Support Desk', PromptDescription: '', PromptText: 'Help the customer.', PromptTypeID: '' }],
            SubAgents: [{ Type: 'child', SubAgent: child }],
        };

        const errors = await validateSpec(parent);
        const childErrors = errors.filter(e => e.startsWith('Flow SubAgent[0] "Ticket Router" -> '));
        expect(childErrors.join('\n')).toContain('[InvalidDecisionStep]');
        expect(childErrors.join('\n')).toContain('it asks no questions');
        expect(childErrors.join('\n')).toContain('[UnknownDecisionKey]');
        expect(childErrors).toHaveLength(errors.length);
    });
});

/** example_4's triage, asking a Likelihood as well as the Choice. */
const TRIAGE_WITH_URGENT = {
    key: 'triage',
    questions: {
        category: {
            instructions: 'What category best describes this issue?',
            kind: 'Choice',
            options: [
                { value: 'billing', description: 'Billing inquiry or invoice problem' },
                { value: 'technical', description: 'Technical defect or system error' },
                { value: 'general', description: 'General question or account update' },
            ],
        },
        urgent: { instructions: 'The customer cannot work until this is resolved.', kind: 'Likelihood' },
    },
};

/** Has the triage ask whether the issue is urgent, and gates a new step on the answer. */
function addUrgentGate(spec: AgentSpec, condition: string): void {
    const triage = spec.Steps?.find(s => s.Name === 'Triage Issue');
    if (triage) triage.Configuration = TRIAGE_WITH_URGENT;
    const escalate: AgentStep = { ID: '', Name: 'Escalate', StepType: 'Action', StartingStep: false, ActionID: 'escalate-action-guid' };
    spec.Steps = [...(spec.Steps ?? []), escalate];
    const gate: AgentStepPath = { ID: '', OriginStepID: 'Handle Technical', DestinationStepID: 'Escalate', Condition: condition, Priority: 0 };
    spec.Paths = [...(spec.Paths ?? []), gate];
}
