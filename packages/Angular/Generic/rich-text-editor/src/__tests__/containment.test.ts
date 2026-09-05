import { describe, it, expect } from 'vitest';
import { clampRangeToNode, isNodeContainedInRange } from '../lib/engine/range/containment';
import { createRoot, loadWithSelection } from './support/editor-harness';

describe('range containment', () => {
    describe('isNodeContainedInRange', () => {
        it('reports a fully covered node as contained', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a<b>b</b>c]</div>');
            const bold = root.querySelector('b') as Element;
            expect(isNodeContainedInRange(range, bold, false)).toBe(true);
            expect(isNodeContainedInRange(range, bold, true)).toBe(true);
        });

        it('reports a partially covered node as contained only when partial is allowed', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a<b>b[c</b>d]</div>');
            const bold = root.querySelector('b') as Element;
            expect(isNodeContainedInRange(range, bold, false)).toBe(false);
            expect(isNodeContainedInRange(range, bold, true)).toBe(true);
        });

        it('reports a node outside the range as not contained', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a]<b>b</b></div>');
            const bold = root.querySelector('b') as Element;
            expect(isNodeContainedInRange(range, bold, true)).toBe(false);
        });
    });

    describe('clampRangeToNode', () => {
        it('keeps boundaries that are inside the node', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a[b</div><div>c]d</div>');
            const first = root.firstElementChild as Element;
            const clamped = clampRangeToNode(range, first);
            expect(clamped.startContainer).toBe(range.startContainer);
            expect(clamped.startOffset).toBe(1);
            expect(clamped.endContainer).toBe(first);
            expect(clamped.endOffset).toBe(first.childNodes.length);
        });

        it('clamps a boundary outside the node to its start', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a[b</div><div>c]d</div>');
            const second = root.lastElementChild as Element;
            const clamped = clampRangeToNode(range, second);
            expect(clamped.startContainer).toBe(second);
            expect(clamped.startOffset).toBe(0);
            expect(clamped.endOffset).toBe(1);
        });
    });
});
