/**
 * Tests for loop-step validation.
 *
 * The assertion that matters most here is the one about a loop that saves cleanly and then does
 * nothing: a `ForEach` with no `collectionPath` is structurally valid SQL, passes every other check,
 * and at runtime iterates zero times — which reads as the agent declining to do the work rather than
 * as a malformed step. That is precisely the class of error the Architect has to catch before save.
 */
import { describe, it, expect } from 'vitest';
import type { AgentStep, AgentStepPath } from '@memberjunction/ai-core-plus';
import { IsLoopStep, ValidateLoopStep, IsDecisionStep, ValidateDecisionStep, ValidateDecisionSteps, StepConfigurationText } from '../flow-step-validation';

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

const decisionStep = (over: Partial<AgentStep> = {}): AgentStep => ({
    ID: 'step-decision-1',
    Name: 'Triage Issue',
    StepType: 'Decision',
    StartingStep: true,
    Configuration: JSON.stringify({
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
    }),
    ...over,
});

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

describe('ValidateDecisionStep — happy paths', () => {
    it('accepts a valid Decision step with string configuration', () => {
        const s = decisionStep();
        expect(ValidateDecisionStep(s, 0)).toEqual([]);
    });

    it('accepts a valid Decision step with object configuration', () => {
        const s = decisionStep({
            Configuration: {
                key: 'triage',
                questions: {
                    category: {
                        text: 'What category?',
                        kind: 'Choice',
                        options: [
                            { value: 'a', text: 'A' },
                            { value: 'b', text: 'B' },
                        ],
                    },
                },
            },
        });
        expect(ValidateDecisionStep(s, 0)).toEqual([]);
    });

    it('accepts a complete Choice fork covering all options', () => {
        const s = decisionStep();
        const paths: AgentStepPath[] = [
            { ID: 'p1', OriginStepID: 'Triage Issue', DestinationStepID: 'BillingStep', Condition: "decisions.triage.category.value === 'billing'", Priority: 1 },
            { ID: 'p2', OriginStepID: 'Triage Issue', DestinationStepID: 'TechStep', Condition: "decisions.triage.category.value === 'technical'", Priority: 2 },
            { ID: 'p3', OriginStepID: 'Triage Issue', DestinationStepID: 'GeneralStep', Condition: "decisions.triage.category.value === 'general'", Priority: 3 },
        ];
        expect(ValidateDecisionStep(s, 0, { Steps: [s], Paths: paths })).toEqual([]);
    });

    it('ignores non-decision steps entirely', () => {
        expect(ValidateDecisionStep({ ID: '1', Name: 'ActionStep', StepType: 'Action', StartingStep: true }, 0)).toEqual([]);
    });
});

describe('ValidateDecisionStep — bad configuration', () => {
    it('reports missing configuration error verbatim from ReadFlowDecisionStepConfiguration', () => {
        const s = decisionStep({ Configuration: undefined });
        const errors = ValidateDecisionStep(s, 2);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('it has no configuration; it needs a key and at least one question');
        expect(errors[0]).toContain('index 2');
    });

    it('reports invalid JSON error verbatim', () => {
        const s = decisionStep({ Configuration: '{not json' });
        const errors = ValidateDecisionStep(s, 0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('its configuration is not valid JSON');
    });

    it('reports missing questions verbatim', () => {
        const s = decisionStep({ Configuration: JSON.stringify({ key: 'triage' }) });
        const errors = ValidateDecisionStep(s, 0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('it asks no questions');
    });

    it('reports invalid question definition verbatim', () => {
        const s = decisionStep({
            Configuration: JSON.stringify({
                key: 'triage',
                questions: {
                    category: { instructions: 'What category?', kind: 'Choice' },
                },
            }),
        });
        const errors = ValidateDecisionStep(s, 0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Choice question "category" needs at least two options');
    });
});

describe('ValidateDecisionStep — duplicate keys', () => {
    it('reports duplicate keys across Decision steps', () => {
        const step1 = decisionStep({ ID: 's1', Name: 'Triage Step 1' });
        const step2 = decisionStep({ ID: 's2', Name: 'Triage Step 2' });
        const steps = [step1, step2];

        const errors = ValidateDecisionStep(step1, 0, { Steps: steps });
        expect(errors.join(' ')).toContain('both use the key "triage"');
        expect(errors.join(' ')).toContain('duplicate key');
    });
});

describe('ValidateDecisionStep — unknown key in path', () => {
    it('reports when an outgoing path references an unknown decision key', () => {
        const s = decisionStep();
        const paths: AgentStepPath[] = [
            { ID: 'p1', OriginStepID: 'Triage Issue', DestinationStepID: 'Next', Condition: "decisions.nonexistent.category.value === 'billing'", Priority: 1 },
        ];
        const errors = ValidateDecisionStep(s, 0, { Steps: [s], Paths: paths });
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('nonexistent');
        expect(errors[0]).toContain('no Decision step in this workflow has the key "nonexistent"');
    });
});

describe('ValidateDecisionStep — Choice fork exhaustiveness', () => {
    it('reports an incomplete Choice fork when options are missing', () => {
        const s = decisionStep();
        const paths: AgentStepPath[] = [
            { ID: 'p1', OriginStepID: 'Triage Issue', DestinationStepID: 'BillingStep', Condition: "decisions.triage.category.value === 'billing'", Priority: 1 },
            { ID: 'p2', OriginStepID: 'Triage Issue', DestinationStepID: 'TechStep', Condition: "decisions.triage.category.value === 'technical'", Priority: 2 },
        ];
        const errors = ValidateDecisionStep(s, 0, { Steps: [s], Paths: paths });
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('incomplete Choice fork');
        expect(errors[0]).toContain('"general"');
        expect(errors[0]).toContain('A Choice fork must cover every option');
    });
});

describe('ValidateDecisionStep — several problems returned together', () => {
    it('returns all errors when multiple validation checks fail', () => {
        const step1 = decisionStep({
            ID: 's1',
            Name: 'Triage Step 1',
            Configuration: JSON.stringify({
                key: 'triage',
                questions: {
                    category: {
                        instructions: 'What category?',
                        kind: 'Choice',
                        options: [
                            { value: 'a', description: 'Option A' },
                            { value: 'b', description: 'Option B' },
                        ],
                    },
                },
            }),
        });
        const step2 = decisionStep({ ID: 's2', Name: 'Triage Step 2' });
        const paths: AgentStepPath[] = [
            { ID: 'p1', OriginStepID: 'Triage Step 1', DestinationStepID: 'Next1', Condition: "decisions.unknown1.category.value === 'billing'", Priority: 1 },
            { ID: 'p2', OriginStepID: 'Triage Step 1', DestinationStepID: 'Next2', Condition: "decisions.unknown2.category.value === 'general'", Priority: 2 },
        ];

        const errors = ValidateDecisionStep(step1, 0, { Steps: [step1, step2], Paths: paths });
        expect(errors.length).toBeGreaterThanOrEqual(3);
        expect(errors.join(' ')).toContain('both use the key "triage"');
        expect(errors.join(' ')).toContain('unknown1');
        expect(errors.join(' ')).toContain('unknown2');
    });
});

describe('ValidateDecisionSteps', () => {
    it('validates all Decision steps in a flow', () => {
        const step1 = decisionStep({ ID: 's1', Name: 'Triage 1' });
        const step2 = decisionStep({ ID: 's2', Name: 'Triage 2' });
        const errors = ValidateDecisionSteps([step1, step2]);
        expect(errors.length).toBeGreaterThanOrEqual(2);
        expect(errors.join(' ')).toContain('both use the key "triage"');
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
