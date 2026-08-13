import { describe, it, expect } from 'vitest';
import {
    EmptyDebugState,
    ParseWorkflowRunParentBag,
    TryParseJsonObject,
} from '../components/workflow-run-debug-state';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ParseWorkflowRunParentBag', () => {
    it('returns empty debug state for missing or garbage input', () => {
        expect(ParseWorkflowRunParentBag(null).debug).toEqual(EmptyDebugState());
        expect(ParseWorkflowRunParentBag('{not json').debug.breakpoints).toEqual([]);
        expect(ParseWorkflowRunParentBag('{}').invocation).toEqual({});
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
        expect(bag.debug.paused).toBe(true);
        expect(bag.debug.pausedReason).toBe('breakpoint');
        expect(bag.debug.pausedAtTaskID).toBe(A);
        expect(bag.debug.breakpoints).toEqual([A, B]);
        expect(bag.debug.edgeOverrides).toEqual({ [A]: 'true' });
        expect(bag.invocation).toEqual({ data: { approved: true }, context: { env: 'dev' } });
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
