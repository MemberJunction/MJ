/**
 * Tests for loop-step validation, and for validating a flow as the runtime does.
 *
 * The assertion that matters most for loops is the one about a loop that saves cleanly and then does
 * nothing: a `ForEach` with no `collectionPath` is structurally valid SQL, passes every other check,
 * and at runtime iterates zero times — which reads as the agent declining to do the work rather than
 * as a malformed step. That is precisely the class of error the Architect has to catch before save.
 *
 * For a flow as a whole, the property is agreement with the runtime: `ValidateFlowGraph` refuses
 * exactly what `CompileFlowToTaskGraph` + `ValidateTaskGraphSpec` refuse, and passes what they run.
 */
import { describe, it, expect } from 'vitest';
import type { AgentStep, AgentStepPath } from '@memberjunction/ai-core-plus';
import { IsLoopStep, ValidateLoopStep, IsDecisionStep, ValidateFlowGraph, StepConfigurationText } from '../flow-step-validation';

const step = (over: Partial<AgentStep> = {}): AgentStep => ({
    ID: '',
    Name: 'Score each lead',
    StepType: 'ForEach',
    StartingStep: false,
    LoopBodyType: 'Action',
    ActionID: 'AC71E1DA-1111-2222-3333-444455556666',
    Configuration: JSON.stringify({ type: 'ForEach', collectionPath: 'leads', itemVariable: 'lead' }),
    ...over,
});

describe('IsLoopStep', () => {
    it('recognises exactly the two wrapping step types', () => {
        expect(IsLoopStep({ StepType: 'ForEach' })).toBe(true);
        expect(IsLoopStep({ StepType: 'While' })).toBe(true);
        expect(IsLoopStep({ StepType: 'Action' })).toBe(false);
        expect(IsLoopStep({ StepType: 'Prompt' })).toBe(false);
        expect(IsLoopStep({ StepType: 'Sub-Agent' })).toBe(false);
    });
});

describe('ValidateLoopStep — the happy paths', () => {
    it('accepts a well-formed ForEach', () => {
        expect(ValidateLoopStep(step(), 0)).toEqual([]);
    });

    it('accepts a well-formed While', () => {
        const s = step({
            StepType: 'While',
            Name: 'Poll until done',
            Configuration: JSON.stringify({ type: 'While', condition: "payload.status !== 'Complete'", itemVariable: 'attempt' }),
        });
        expect(ValidateLoopStep(s, 0)).toEqual([]);
    });

    it('accepts a Configuration supplied as an object, not only as JSON text', () => {
        // A model that was just shown an object literal in the prompt will send one. Rejecting that
        // would make the prompt and the validator disagree about the same example.
        const s = step({ Configuration: { type: 'ForEach', collectionPath: 'leads', itemVariable: 'lead' } });
        expect(ValidateLoopStep(s, 0)).toEqual([]);
    });

    it('ignores non-loop steps entirely', () => {
        expect(ValidateLoopStep(step({ StepType: 'Action', LoopBodyType: undefined, Configuration: undefined }), 0)).toEqual([]);
    });
});

describe('ValidateLoopStep — a loop that would silently do nothing', () => {
    it('rejects a ForEach with nothing to iterate over', () => {
        const s = step({ Configuration: JSON.stringify({ type: 'ForEach', itemVariable: 'lead' }) });
        const errors = ValidateLoopStep(s, 2);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('collectionPath');
        expect(errors[0]).toContain('index 2');
    });

    it('rejects a While with nothing to test', () => {
        const s = step({ StepType: 'While', Configuration: JSON.stringify({ type: 'While', itemVariable: 'attempt' }) });
        const errors = ValidateLoopStep(s, 0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('condition');
    });

    it('rejects either kind with no name for the current item', () => {
        const s = step({ Configuration: JSON.stringify({ type: 'ForEach', collectionPath: 'leads' }) });
        expect(ValidateLoopStep(s, 0).join(' ')).toContain('itemVariable');
    });

    it('rejects a loop with no Configuration at all', () => {
        const s = step({ Configuration: undefined });
        const errors = ValidateLoopStep(s, 0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Configuration');
    });

    it('does not cascade bound errors when the Configuration could not be read', () => {
        // One clear "this is not parseable" beats three downstream complaints about fields that
        // could never have been found.
        const s = step({ Configuration: '{not json' });
        const errors = ValidateLoopStep(s, 0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('invalid Configuration JSON');
    });

    it('rejects a Configuration that parses to something other than an object', () => {
        expect(ValidateLoopStep(step({ Configuration: '"just a string"' }), 0)[0]).toContain('not a JSON object');
        expect(ValidateLoopStep(step({ Configuration: '[1,2,3]' }), 0)[0]).toContain('not a JSON object');
        // A model's JSON can put anything here, so this step is read from JSON, as a spec is.
        const fromModel: AgentStep = JSON.parse(JSON.stringify({ ...step(), Configuration: [1, 2, 3] }));
        expect(ValidateLoopStep(fromModel, 0)[0]).toContain('array rather than an object');
    });
});

describe('ValidateLoopStep — the body', () => {
    it('rejects a loop that does not say what it repeats', () => {
        const errors = ValidateLoopStep(step({ LoopBodyType: undefined }), 0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('LoopBodyType');
    });

    it('looks for the body id in the field that body type would normally use', () => {
        // No parallel LoopBodyActionID: an action id lives in ActionID whether or not a loop wraps it.
        const errors = ValidateLoopStep(step({ ActionID: undefined }), 0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('ActionID');
    });

    it('rejects a Prompt body with neither a prompt to use nor one to create', () => {
        const s = step({ LoopBodyType: 'Prompt', ActionID: undefined });
        expect(ValidateLoopStep(s, 0)[0]).toContain('PromptID');
    });

    it('accepts a Prompt body supplied inline, which becomes a prompt on save', () => {
        const s = step({ LoopBodyType: 'Prompt', ActionID: undefined, PromptText: 'Summarise this lead.' });
        expect(ValidateLoopStep(s, 0)).toEqual([]);
    });

    it('treats whitespace-only inline prompt text as absent', () => {
        const s = step({ LoopBodyType: 'Prompt', ActionID: undefined, PromptText: '   ' });
        expect(ValidateLoopStep(s, 0)[0]).toContain('PromptID');
    });

    it('accepts a Sub-Agent body with no id, because it is linked by name after the sub-agent is created', () => {
        // Same latitude a plain Sub-Agent step already gets — requiring an id here would make it
        // impossible to author a loop over a sub-agent being created in the same spec.
        const s = step({ LoopBodyType: 'Sub-Agent', ActionID: undefined, SubAgentID: '' });
        expect(ValidateLoopStep(s, 0)).toEqual([]);
    });
});

describe('ValidateLoopStep — reporting', () => {
    it('returns every problem at once rather than only the first', () => {
        // One pass gives the model everything it must fix. Reporting one error per round trip turns
        // a single correction into a retry loop.
        const s = step({ LoopBodyType: undefined, ActionID: undefined, Configuration: JSON.stringify({}) });
        const errors = ValidateLoopStep(s, 0);
        expect(errors.length).toBeGreaterThanOrEqual(3);
        expect(errors.join(' ')).toContain('LoopBodyType');
        expect(errors.join(' ')).toContain('collectionPath');
        expect(errors.join(' ')).toContain('itemVariable');
    });

    it('names the step and its index so the model can find it', () => {
        const errors = ValidateLoopStep(step({ Name: 'Retry the import', Configuration: undefined }), 7);
        expect(errors[0]).toContain('"Retry the import"');
        expect(errors[0]).toContain('index 7');
        expect(errors[0]).toContain('ForEach');
    });
});


/** A Choice and a Likelihood about one ticket, written the way the Architect's template teaches. */
const TRIAGE_CONFIGURATION = {
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

const actionStep = (name: string, over: Partial<AgentStep> = {}): AgentStep => ({
    ID: '',
    Name: name,
    StepType: 'Action',
    StartingStep: false,
    ActionID: 'AC71E1DA-1111-2222-3333-444455556666',
    ...over,
});

const decisionStep = (over: Partial<AgentStep> = {}): AgentStep => ({
    ID: '',
    Name: 'Triage Issue',
    StepType: 'Decision',
    StartingStep: true,
    Configuration: TRIAGE_CONFIGURATION,
    ...over,
});

const path = (from: string, to: string, condition?: string, over: Partial<AgentStepPath> = {}): AgentStepPath => ({
    ID: '',
    OriginStepID: from,
    DestinationStepID: to,
    Condition: condition,
    Priority: 10,
    ...over,
});

type Flow = { Steps: AgentStep[]; Paths: AgentStepPath[] };

/** The Decision step, a handler per category, and a path to each: a Choice fork covering every option. */
const triageFlow = (): Flow => ({
    Steps: [decisionStep(), actionStep('Handle Billing'), actionStep('Handle Technical'), actionStep('Handle General')],
    Paths: [
        path('Triage Issue', 'Handle Billing', "decisions.triage.category.value === 'billing'"),
        path('Triage Issue', 'Handle Technical', "decisions.triage.category.value === 'technical'"),
        path('Triage Issue', 'Handle General', "decisions.triage.category.value === 'general'"),
    ],
});

/** The Decision step and one path from it to a single handler. */
const gateFlow = (condition: string): Flow => ({
    Steps: [decisionStep(), actionStep('Handle Billing')],
    Paths: [path('Triage Issue', 'Handle Billing', condition)],
});

const validate = (flow: Flow): string[] => ValidateFlowGraph(flow.Steps, flow.Paths, 'Customer Issue Triager');

describe('IsDecisionStep', () => {
    it('recognises Decision steps', () => {
        expect(IsDecisionStep({ StepType: 'Decision' })).toBe(true);
        expect(IsDecisionStep({ StepType: 'ForEach' })).toBe(false);
        expect(IsDecisionStep({ StepType: 'While' })).toBe(false);
        expect(IsDecisionStep({ StepType: 'Action' })).toBe(false);
        expect(IsDecisionStep({ StepType: 'Prompt' })).toBe(false);
        expect(IsDecisionStep({ StepType: 'Sub-Agent' })).toBe(false);
    });
});

describe('ValidateFlowGraph — flows the runtime runs', () => {
    it('accepts a Choice fork with a path for every option', () => {
        expect(validate(triageFlow())).toEqual([]);
    });

    it('accepts the Configuration as JSON text as well as an object', () => {
        const flow = triageFlow();
        flow.Steps[0] = decisionStep({ Configuration: JSON.stringify(TRIAGE_CONFIGURATION) });
        expect(validate(flow)).toEqual([]);
    });

    it('accepts the aliases a model writes: text for instructions and for an option description', () => {
        const flow = triageFlow();
        flow.Steps[0] = decisionStep({
            Configuration: {
                key: 'triage',
                questions: {
                    category: {
                        text: 'What category best describes this issue?',
                        kind: 'Choice',
                        options: [
                            { value: 'billing', text: 'Billing' },
                            { value: 'technical', text: 'Technical' },
                            { value: 'general', text: 'General' },
                        ],
                    },
                },
            },
        });
        expect(validate(flow)).toEqual([]);
    });

    it('accepts a single conditional path from a Decision step: a gate on one option', () => {
        // The compiler makes an exclusive group only when a step has two or more paths, so a gate is
        // not a fork and the runtime runs it. The Agent Manager used to refuse it.
        expect(validate(gateFlow("decisions.triage.category.value === 'billing'"))).toEqual([]);
    });

    it("accepts a Likelihood gate that reads the answer's probability", () => {
        expect(validate(gateFlow('decisions.triage.urgent.probability >= 0.8'))).toEqual([]);
    });

    it('accepts every field the template documents for each kind of answer', () => {
        const scored = decisionStep({
            Configuration: {
                ...TRIAGE_CONFIGURATION,
                questions: {
                    ...TRIAGE_CONFIGURATION.questions,
                    severity: { instructions: 'How severe is the impact?', kind: 'Score', levels: ['low', 'medium', 'high'] },
                },
            },
        });
        for (const condition of [
            "decisions.triage.category.confidence >= 0.7 && decisions.triage.category.probabilities.billing > 0.5",
            'decisions.triage.severity.value >= 1',
            'decisions.triage.severity.confidence >= 0.7',
            'decisions.triage.severity.probabilities.high > 0.5',
            'decisions.triage.urgent.probability >= 0.8',
        ]) {
            const flow = gateFlow(condition);
            flow.Steps[0] = scored;
            expect(validate(flow)).toEqual([]);
        }
    });

    it('accepts a fork whose other options go to an unconditional default path', () => {
        const flow = triageFlow();
        flow.Paths = [
            path('Triage Issue', 'Handle Billing', "decisions.triage.category.value === 'billing'"),
            path('Triage Issue', 'Handle General', undefined, { Priority: 0 }),
        ];
        expect(validate(flow)).toEqual([]);
    });

    it('matches a path end to a step ID as a UUID, whatever its case', () => {
        const triageID = 'A1B2C3D4-0000-4000-8000-000000000001';
        const billingID = 'A1B2C3D4-0000-4000-8000-000000000002';
        const flow: Flow = {
            Steps: [decisionStep({ ID: triageID }), actionStep('Handle Billing', { ID: billingID })],
            Paths: [path(triageID.toLowerCase(), billingID.toLowerCase(), "decisions.triage.category.value === 'billing'")],
        };
        expect(validate(flow)).toEqual([]);
    });
});

describe('ValidateFlowGraph — what the runtime refuses is refused here', () => {
    // The first three are the specs a review probed: the Agent Manager passed each one, and the runtime
    // refused it.
    it.each([
        {
            what: 'a path from a later step that reads an unknown Decision key',
            flow: (): Flow => ({
                Steps: [
                    decisionStep(),
                    { ID: '', Name: 'Summarize', StepType: 'Prompt', StartingStep: false, PromptText: 'Summarize the ticket.' },
                    actionStep('Handle Billing'),
                ],
                Paths: [
                    path('Triage Issue', 'Summarize'),
                    path('Summarize', 'Handle Billing', "decisions.triag.category.value === 'billing'"),
                ],
            }),
            code: '[UnknownDecisionKey]',
            mentions: 'decisions.triag',
        },
        {
            what: 'a Likelihood read through .value, a field its answer does not have',
            flow: (): Flow => gateFlow('decisions.triage.urgent.value >= 0.8'),
            code: '[InvalidCondition]',
            mentions: 'reads "value" from the Likelihood question "urgent"',
        },
        {
            what: 'a question the Decision step does not ask',
            flow: (): Flow => gateFlow('decisions.triage.urgency.probability >= 0.8'),
            code: '[InvalidCondition]',
            mentions: 'reads the question "urgency"',
        },
        {
            what: 'a Score read through .probability, a field only a Likelihood has',
            flow: (): Flow => {
                const flow = gateFlow('decisions.triage.severity.probability >= 0.8');
                flow.Steps[0] = decisionStep({
                    Configuration: {
                        key: 'triage',
                        questions: { severity: { instructions: 'How severe is the impact?', kind: 'Score', levels: ['low', 'medium', 'high'] } },
                    },
                });
                return flow;
            },
            code: '[InvalidCondition]',
            mentions: 'reads "probability" from the Score question "severity"',
        },
    ])('refuses $what', ({ flow, code, mentions }) => {
        const errors = validate(flow());
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain(code);
        expect(errors[0]).toContain(mentions);
    });

    it('refuses a Choice fork with no path for one of its options, naming the step rather than its ID', () => {
        const triageID = 'A1B2C3D4-0000-4000-8000-000000000001';
        const flow = triageFlow();
        flow.Steps[0] = decisionStep({ ID: triageID });
        flow.Paths = flow.Paths.filter((p) => !p.Condition?.includes('general'));

        const errors = validate(flow);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('[IncompleteFork]');
        expect(errors[0]).toContain('no path for "general"');
        expect(errors[0]).toContain('"Triage Issue"');
        expect(errors[0]).not.toContain(triageID);
    });

    it('refuses a configuration a Decision step cannot run with', () => {
        const flow = gateFlow('decisions.nope.q');
        flow.Steps[0] = decisionStep({ Configuration: { key: '1bad' } });

        const errors = validate(flow).join('\n');
        expect(errors).toContain('[InvalidDecisionStep]');
        expect(errors).toContain('its key "1bad" cannot be named in a path condition');
        expect(errors).toContain('it asks no questions');
        expect(errors).toContain('[UnknownDecisionKey]');
    });

    it('refuses a Decision step with no configuration at all', () => {
        const flow = gateFlow("decisions.triage.category.value === 'billing'");
        flow.Steps[0] = decisionStep({ Configuration: undefined });
        expect(validate(flow).join('\n')).toContain('it has no configuration; it needs a key and at least one question');
    });

    it('refuses a key two Decision steps share, once', () => {
        const flow: Flow = {
            Steps: [decisionStep(), decisionStep({ Name: 'Triage Again', StartingStep: false }), actionStep('Handle Billing')],
            Paths: [
                path('Triage Issue', 'Triage Again'),
                path('Triage Again', 'Handle Billing', "decisions.triage.category.value === 'billing'"),
            ],
        };
        const errors = validate(flow);
        expect(errors.filter((e) => e.includes('[DuplicateDecisionKey]'))).toHaveLength(1);
        expect(errors.join('\n')).toContain('both use the key "triage"');
    });

    it('refuses a shared key even when the flow cannot reach one of the steps, as the in-run walker does', () => {
        const flow = triageFlow();
        flow.Steps.push(decisionStep({ Name: 'Unwired Triage', StartingStep: false }));
        expect(validate(flow)).toEqual([expect.stringContaining('[DuplicateDecisionKey]')]);
    });

    it('refuses a path that names no step, which the compiler would drop without a word', () => {
        const flow = triageFlow();
        flow.Paths[2] = path('Triage Issue', 'Handle Genral', "decisions.triage.category.value === 'general'");

        const errors = validate(flow).join('\n');
        expect(errors).toContain('names no step as its destination');
        // Dropping the path left the fork without "general", which is refused as well.
        expect(errors).toContain('[IncompleteFork]');
    });

    it('matches a path end to a step name exactly, as AgentSpecSync does', () => {
        const flow = gateFlow("decisions.triage.category.value === 'billing'");
        flow.Paths = [path('triage issue', 'Handle Billing', "decisions.triage.category.value === 'billing'")];
        expect(validate(flow).join('\n')).toContain('names no step as its origin');
    });

    it('returns every problem the compiler finds at once', () => {
        const flow: Flow = {
            Steps: [decisionStep({ Configuration: { key: 'triage' } }), actionStep('Handle Billing'), actionStep('Handle General')],
            Paths: [
                path('Triage Issue', 'Handle Billing', "decisions.unknown1.category.value === 'billing'"),
                path('Triage Issue', 'Handle General', "decisions.unknown2.category.value === 'general'"),
            ],
        };
        const errors = validate(flow).join('\n');
        expect(errors).toContain('it asks no questions');
        expect(errors).toContain('decisions.unknown1');
        expect(errors).toContain('decisions.unknown2');
    });
});

describe('StepConfigurationText', () => {
    it('writes an object as JSON text and passes text through', () => {
        const loop = { type: 'ForEach', collectionPath: 'leads', itemVariable: 'lead' };
        expect(StepConfigurationText({ StepType: 'ForEach', Configuration: loop })).toBe(JSON.stringify(loop));
        expect(StepConfigurationText({ StepType: 'ForEach', Configuration: '{"collectionPath":"leads"}' })).toBe('{"collectionPath":"leads"}');
    });

    it('normalizes the aliases in a Decision step', () => {
        const text = StepConfigurationText({
            StepType: 'Decision',
            Configuration: { key: 'triage', questions: { urgent: { text: 'Is it urgent?', kind: 'Likelihood' } } },
        });
        expect(JSON.parse(text ?? '{}').questions.urgent.instructions).toBe('Is it urgent?');
    });

    it('stores nothing for an empty configuration', () => {
        expect(StepConfigurationText({ StepType: 'Action', Configuration: undefined })).toBeNull();
        expect(StepConfigurationText({ StepType: 'Action', Configuration: '' })).toBeNull();
    });
});
