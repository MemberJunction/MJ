import { describe, it, expect } from 'vitest';
import { deserializeSelection, serializeSelection } from '../lib/engine/path';
import { createRoot, loadWithSelection } from './support/editor-harness';

describe('selection index paths', () => {
    it('round-trips a collapsed caret', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>a<b>bc|d</b></div>');
        const serialized = serializeSelection(range, root);
        expect(serialized).toEqual({ StartPath: [0, 1, 0], StartOffset: 2, EndPath: [0, 1, 0], EndOffset: 2 });
        const restored = deserializeSelection(serialized!, root) as Range;
        expect(restored.startContainer).toBe(range.startContainer);
        expect(restored.startOffset).toBe(2);
        expect(restored.collapsed).toBe(true);
    });

    it('round-trips a selection spanning blocks', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>a[b</div><div>c]d</div>');
        const restored = deserializeSelection(serializeSelection(range, root)!, root) as Range;
        expect(restored.startContainer).toBe(range.startContainer);
        expect(restored.endContainer).toBe(range.endContainer);
        expect(restored.endOffset).toBe(1);
    });

    it('restores against a rebuilt DOM with the same structure', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div><i>x</i>y|z</div>');
        const serialized = serializeSelection(range, root)!;
        const html = root.innerHTML;
        root.innerHTML = '';
        root.innerHTML = html;
        const restored = deserializeSelection(serialized, root) as Range;
        expect(restored.startContainer.nodeValue).toBe('yz');
        expect(restored.startOffset).toBe(1);
    });

    it('returns null when a boundary is outside the root', () => {
        const root = createRoot();
        loadWithSelection(root, '<div>a|</div>');
        const range = document.createRange();
        range.setStart(document.body, 0);
        expect(serializeSelection(range, root)).toBeNull();
    });

    it('returns null when the structure no longer matches', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>a<b>b|</b></div>');
        const serialized = serializeSelection(range, root)!;
        root.innerHTML = '<div>a</div>';
        expect(deserializeSelection(serialized, root)).toBeNull();
    });

    it('clamps an offset that has become too large', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>abcd|</div>');
        const serialized = serializeSelection(range, root)!;
        root.innerHTML = '<div>ab</div>';
        const restored = deserializeSelection(serialized, root) as Range;
        expect(restored.startOffset).toBe(2);
    });
});
