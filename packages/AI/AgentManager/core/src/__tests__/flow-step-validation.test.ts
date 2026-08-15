/**
 * Tests for loop-step validation.
 *
 * The assertion that matters most here is the one about a loop that saves cleanly and then does
 * nothing: a `ForEach` with no `collectionPath` is structurally valid SQL, passes every other check,
 * and at runtime iterates zero times — which reads as the agent declining to do the work rather than
 * as a malformed step. That is precisely the class of error the Architect has to catch before save.
 */
import { describe, it, expect } from 'vitest';
import type { AgentStep } from '@memberjunction/ai-core-plus';
import { IsLoopStep, ValidateLoopStep } from '../flow-step-validation';

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
        const s = step({ Configuration: { type: 'ForEach', collectionPath: 'leads', itemVariable: 'lead' } as unknown as string });
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
        expect(
            ValidateLoopStep(step({ Configuration: [1, 2, 3] as unknown as string }), 0)[0],
        ).toContain('array rather than an object');
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
