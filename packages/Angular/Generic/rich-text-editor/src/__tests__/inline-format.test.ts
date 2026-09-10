import { describe, it, expect, beforeEach } from 'vitest';
import { ZERO_WIDTH_SPACE as ZWS } from '../lib/engine/constants';
import {
    addFormat,
    changeFormat,
    getNearestFormat,
    hasFormat,
    removeAllFormatting,
    removeFormat,
    toggleFormat,
} from '../lib/engine/format/inline';
import { getHTML } from '../lib/engine/html';
import { createRoot, htmlWithSelection, loadWithSelection } from './support/editor-harness';

const B = { Tag: 'B' };
const I = { Tag: 'I' };

describe('inline format engine', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('hasFormat', () => {
        it('is true when the caret is inside the tag', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><b>a|b</b></div>');
            expect(hasFormat(root, range, B)).toBe(true);
        });

        it('recognises aliases — a loaded <strong> is bold', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><strong>a|b</strong></div>');
            expect(hasFormat(root, range, B)).toBe(true);
        });

        it('is true when every text node in the selection is formatted', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><b>[a</b><strong>b]</strong></div>');
            expect(hasFormat(root, range, B)).toBe(true);
        });

        it('is false when part of the selection is unformatted', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><b>[a</b>b]</div>');
            expect(hasFormat(root, range, B)).toBe(false);
        });

        it('ignores a start boundary sitting at the very end of a formatted node', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><b>a[</b>bc]</div>');
            expect(hasFormat(root, range, B)).toBe(false);
        });

        it('matches attributes when asked', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><a href="x">a|</a></div>');
            expect(hasFormat(root, range, { Tag: 'A', Attributes: { href: 'x' } })).toBe(true);
            expect(hasFormat(root, range, { Tag: 'A', Attributes: { href: 'y' } })).toBe(false);
        });

        it('getNearestFormat stops at the root', () => {
            const root = createRoot();
            const wrapper = document.createElement('b');
            document.body.appendChild(wrapper);
            wrapper.appendChild(root);
            const range = loadWithSelection(root, '<div>a|</div>');
            expect(getNearestFormat(range.startContainer, root, B)).toBeNull();
        });
    });

    describe('addFormat', () => {
        it('wraps a selection within one text node', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>hel[lo wo]rld</div>');
            addFormat(root, range, B);
            expect(htmlWithSelection(root, range)).toBe('<div>hel<b>[lo wo]</b>rld</div>');
        });

        it('wraps each text node across inline boundaries', () => {
            // Each text node is wrapped where it sits; the wrapper is never hoisted above an
            // unrelated inline, so the `<i>` keeps its place in the tree.
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a<i>b</i>c]</div>');
            addFormat(root, range, B);
            expect(root.innerHTML).toBe('<div><b>a</b><i><b>b</b></i><b>c</b></div>');
            expect(range.toString()).toBe('abc');
        });

        it('merges alike neighbours it creates', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a</div><div>b]</div>');
            const second = root.lastChild as Node;
            range.setEnd(second.firstChild as Text, 1);
            addFormat(root, range, B);
            // Two text nodes in one block wrapped separately would leave <b>x</b><b>y</b>.
            const first = root.firstChild as Element;
            (first.firstChild as Element).insertAdjacentText('afterend', 'z');
            const wide = document.createRange();
            wide.selectNodeContents(first);
            addFormat(root, wide, B);
            expect(first.innerHTML).toBe('<b>az</b>');
        });

        it('does not double-wrap text already formatted, including via an alias', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a<strong>b</strong>c]</div>');
            addFormat(root, range, B);
            expect(root.innerHTML).toBe('<div><b>a</b><strong>b</strong><b>c</b></div>');
        });

        it('spans blocks, wrapping inside each', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a[b</div><div>c]d</div>');
            addFormat(root, range, B);
            expect(root.innerHTML).toBe('<div>a<b>b</b></div><div><b>c</b>d</div>');
        });

        it('inserts a pending-format wrapper at a collapsed caret', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>ab|cd</div>');
            addFormat(root, range, B);
            expect(root.innerHTML).toBe(`<div>ab<b>${ZWS}</b>cd</div>`);
            expect(range.collapsed).toBe(true);
            expect(range.startContainer).toBe(root.querySelector('b')?.firstChild);
            expect(range.startOffset).toBe(1);
            // The ballast never reaches the serialized output.
            expect(getHTML(root)).toBe('<div>ab<b></b>cd</div>');
        });

        it('replaces stale pending ballast in the same block', () => {
            const root = createRoot();
            const range = loadWithSelection(root, `<div><i>${ZWS}</i>ab|</div>`);
            addFormat(root, range, B);
            expect(root.innerHTML).toBe(`<div>ab<b>${ZWS}</b></div>`);
        });

        it('carries attributes onto the wrapper', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[link]</div>');
            addFormat(root, range, { Tag: 'A', Attributes: { href: 'https://x.y' } });
            expect(root.innerHTML).toBe('<div><a href="https://x.y">link</a></div>');
        });
    });

    describe('removeFormat', () => {
        it('unwraps a fully selected format', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><b>[ab]</b></div>');
            removeFormat(root, range, B);
            expect(root.innerHTML).toBe('<div>ab</div>');
            expect(range.toString()).toBe('ab');
        });

        it('splits a format around a partial selection', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><b>hel[lo wo]rld</b></div>');
            removeFormat(root, range, B);
            expect(htmlWithSelection(root, range)).toBe('<div><b>hel</b>[lo wo]<b>rld</b></div>');
        });

        it('removes aliases too', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[<b>a</b><strong>b</strong>]</div>');
            removeFormat(root, range, B);
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('leaves other formats in place', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><i><b>[ab]</b></i></div>');
            removeFormat(root, range, B);
            expect(root.innerHTML).toBe('<div><i>ab</i></div>');
        });

        it('works across blocks', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><b>a[b</b></div><div><b>c]d</b></div>');
            removeFormat(root, range, B);
            expect(root.innerHTML).toBe('<div><b>a</b>b</div><div>c<b>d</b></div>');
            expect(range.toString()).toBe('bc');
        });

        it('escapes the format at a collapsed caret, preserving inner formats', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><i><b>ab|cd</b></i></div>');
            removeFormat(root, range, I);
            expect(root.innerHTML).toBe(`<div><i><b>ab</b></i><b>${ZWS}</b><i><b>cd</b></i></div>`);
            expect(range.startContainer.nodeValue).toBe(ZWS);
            expect(range.startOffset).toBe(1);
        });

        it('drops the hollow half when the caret was at the edge of the format', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><b>ab|</b>cd</div>');
            removeFormat(root, range, B);
            expect(root.innerHTML).toBe(`<div><b>ab</b>${ZWS}cd</div>`);
        });

        it('is a no-op at a caret outside the format', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a|b</div>');
            removeFormat(root, range, B);
            expect(root.innerHTML).toBe('<div>ab</div>');
        });
    });

    describe('toggleFormat / changeFormat', () => {
        it('applies when the selection is mixed, removes when it is uniform', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a<b>b</b>]</div>');
            toggleFormat(root, range, B);
            expect(root.innerHTML).toBe('<div><b>ab</b></div>');
            toggleFormat(root, range, B);
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('changeFormat removes first, then adds', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div><a href="old">[x]</a></div>');
            changeFormat(root, range, { Tag: 'A', Attributes: { href: 'new' } }, { Tag: 'A' });
            expect(root.innerHTML).toBe('<div><a href="new">x</a></div>');
        });
    });

    describe('removeAllFormatting', () => {
        it('reduces the selection to plain text within its blocks', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[<b>a</b><a href="x"><i>b</i></a>c]</div><div><u>[d]</u></div>');
            // Two bracket pairs: the harness keeps the last `[` and the last `]`… so rebuild.
            range.setStart(root.firstChild as Node, 0);
            range.setEnd(root.lastChild as Node, (root.lastChild as Node).childNodes.length);
            removeAllFormatting(root, range);
            expect(root.innerHTML).toBe('<div>abc</div><div>d</div>');
        });

        it('keeps line breaks', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a<br><b>b]</b></div>');
            removeAllFormatting(root, range);
            expect(root.innerHTML).toBe('<div>a<br>b</div>');
        });
    });
});
