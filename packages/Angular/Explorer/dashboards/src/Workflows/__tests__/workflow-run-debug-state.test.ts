import { describe, it, expect } from 'vitest';
import {
    EmptyDebugState,
    ParseWorkflowRunParentBag,
    StepFailureReason,
    TryParseJsonObject,
} from '../components/workflow-run-debug-state';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ParseWorkflowRunParentBag', () => {
    it('returns empty debug state for missing or garbage input', () => {
        expect(ParseWorkflowRunParentBag(null).Debug).toEqual(EmptyDebugState());
        expect(ParseWorkflowRunParentBag('{not json').Debug.breakpoints).toEqual([]);
        expect(ParseWorkflowRunParentBag('{}').Invocation).toEqual({});
    });

    it('reads breakpoints, overrides, and invocation roots from the parent bag', () => {
        const raw = JSON.stringify({
            debug: {
                paused: true,
                pausedReason: 'breakpoint',
                pausedAtTaskID: A,
                breakpoints: [A, 'not-a-uuid', B],
                edgeOverrides: { [A]: 'true', nope: 'false', [B]: 'maybe' },
            },
            invocation: { data: { approved: true }, context: { env: 'dev' } },
        });
        const bag = ParseWorkflowRunParentBag(raw);
        expect(bag.Debug.paused).toBe(true);
        expect(bag.Debug.pausedReason).toBe('breakpoint');
        expect(bag.Debug.pausedAtTaskID).toBe(A);
        expect(bag.Debug.breakpoints).toEqual([A, B]);
        expect(bag.Debug.edgeOverrides).toEqual({ [A]: 'true' });
        expect(bag.Invocation).toEqual({ data: { approved: true }, context: { env: 'dev' } });
    });
});

describe('TryParseJsonObject', () => {
    it('accepts objects and empty, refuses arrays and invalid JSON', () => {
        expect(TryParseJsonObject('')).toEqual({ ok: true, value: {} });
        expect(TryParseJsonObject('{"x":1}').ok).toBe(true);
        expect(TryParseJsonObject('[1]').ok).toBe(false);
        expect(TryParseJsonObject('{').ok).toBe(false);
    });
});

describe('StepFailureReason', () => {
    it('gives a failed step its recorded reason, so the inspector can say why it failed', () => {
        expect(StepFailureReason('Failed', 'Task T-1 has an InputPayload that is an array; expected a name → value object.'))
            .toBe('Task T-1 has an InputPayload that is an array; expected a name → value object.');
    });

    it('shows nothing for a step that did not fail, whatever its row still holds', () => {
        expect(StepFailureReason('Complete', 'an earlier attempt failed')).toBeNull();
        expect(StepFailureReason('Pending', null)).toBeNull();
    });

    it('shows nothing for a failed step with no recorded reason, rather than an empty box', () => {
        expect(StepFailureReason('Failed', null)).toBeNull();
        expect(StepFailureReason('Failed', '   ')).toBeNull();
    });
});
