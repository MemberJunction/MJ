import { describe, it, expect, beforeEach } from 'vitest';
import { applySelection, getPath, isRangeWithin, readSelectionWithin } from '../lib/engine/selection';
import { createRoot, loadWithSelection, select } from './support/editor-harness';

describe('selection helpers', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.getSelection()?.removeAllRanges();
    });

    it('reads a selection inside the root as a clone', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>a|b</div>');
        select(range);
        const read = readSelectionWithin(root) as Range;
        expect(read).not.toBe(range);
        expect(read.startContainer).toBe(range.startContainer);
        expect(read.startOffset).toBe(1);
    });

    it('ignores a selection outside the root', () => {
        const root = createRoot();
        loadWithSelection(root, '<div>a|b</div>');
        const other = document.createElement('div');
        other.textContent = 'elsewhere';
        document.body.appendChild(other);
        const range = document.createRange();
        range.setStart(other.firstChild as Text, 1);
        range.collapse(true);
        select(range);
        expect(readSelectionWithin(root)).toBeNull();
        expect(isRangeWithin(range, root)).toBe(false);
    });

    it('applies a range as the document selection', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>[ab]</div>');
        applySelection(range, root);
        const live = document.getSelection() as Selection;
        expect(live.rangeCount).toBe(1);
        expect(live.getRangeAt(0).toString()).toBe('ab');
    });

    describe('getPath', () => {
        it('lists tag names from the root down', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><blockquote><b>a|</b></blockquote></div>');
            expect(getPath(range.startContainer, root)).toBe('DIV>BLOCKQUOTE>B');
        });

        it('is empty at the root itself', () => {
            const root = createRoot();
            loadWithSelection(root, '<div>a|</div>');
            expect(getPath(root, root)).toBe('');
        });

        it('is empty for a node outside the root', () => {
            const root = createRoot();
            loadWithSelection(root, '<div>a|</div>');
            expect(getPath(document.body, root)).toBe('');
        });
    });
});
