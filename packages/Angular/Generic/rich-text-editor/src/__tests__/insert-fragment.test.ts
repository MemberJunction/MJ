import { describe, it, expect, beforeEach } from 'vitest';
import { insertTreeFragmentIntoRange } from '../lib/engine/range/insert-fragment';
import { createRoot, htmlWithSelection, loadWithSelection } from './support/editor-harness';

function fragmentOf(html: string): DocumentFragment {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
}

describe('insertTreeFragmentIntoRange (paste-merge)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('merges a single-line fragment into the caret block', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>hel|lo</div>');
        insertTreeFragmentIntoRange(range, fragmentOf('<div>XY</div>'), root);
        expect(htmlWithSelection(root, range)).toBe('<div>helXY|lo</div>');
    });

    it('merges loose inline content the same way', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>hel|lo</div>');
        insertTreeFragmentIntoRange(range, fragmentOf('<b>X</b>'), root);
        // The caret lands after the pasted wrapper, so typing continues in the surrounding style.
        expect(htmlWithSelection(root, range)).toBe('<div>hel<b>X</b>|lo</div>');
    });

    it('splits the caret block around a multi-block fragment', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>hel|lo</div>');
        insertTreeFragmentIntoRange(range, fragmentOf('<div>A</div><div>B</div><div>C</div>'), root);
        expect(htmlWithSelection(root, range)).toBe('<div>helA</div><div>B</div><div>C|lo</div>');
    });

    it('replaces an empty caret block outright', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>a</div><div>|<br></div><div>b</div>');
        insertTreeFragmentIntoRange(range, fragmentOf('<div>X</div><div>Y</div>'), root);
        expect(htmlWithSelection(root, range)).toBe('<div>a</div><div>X</div><div>Y|</div><div>b</div>');
    });

    it('splits inline formatting at the caret and continues it after the paste', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div><b>bo|ld</b></div>');
        insertTreeFragmentIntoRange(range, fragmentOf('<div>X</div><div>Y</div>'), root);
        expect(htmlWithSelection(root, range)).toBe('<div><b>bo</b>X</div><div>Y<b>|ld</b></div>');
    });

    it('keeps pasted content inside the quote the caret was in', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<blockquote><div>a|b</div></blockquote>');
        insertTreeFragmentIntoRange(range, fragmentOf('<div>X</div><div>Y</div>'), root);
        expect(root.innerHTML).toBe('<blockquote><div>aX</div><div>Yb</div></blockquote>');
    });

    it('merges alike containers at the seams of the insertion', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<ul><li>a|</li></ul>');
        insertTreeFragmentIntoRange(range, fragmentOf('<div>X</div><ul><li>Y</li></ul>'), root);
        expect(root.innerHTML).toBe('<ul><li>aX</li><li>Y</li></ul>');
    });

    it('does not merge a <pre> or a table onto the caret block', () => {
        const a = createRoot();
        const rangeA = loadWithSelection(a, '<div>ab|</div>');
        insertTreeFragmentIntoRange(rangeA, fragmentOf('<pre>code</pre>'), a);
        expect(a.innerHTML).toBe('<div>ab</div><pre>code</pre>');

        const b = createRoot();
        const rangeB = loadWithSelection(b, '<div>a|b</div>');
        insertTreeFragmentIntoRange(rangeB, fragmentOf('<table><tbody><tr><td>c</td></tr></tbody></table>'), b);
        expect(b.innerHTML).toBe('<div>a</div><table><tbody><tr><td>c</td></tr></tbody></table><div>b</div>');
    });

    it('replaces a selection before inserting', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>a[bc]d</div>');
        insertTreeFragmentIntoRange(range, fragmentOf('X'), root);
        expect(htmlWithSelection(root, range)).toBe('<div>aX|d</div>');
    });

    it('does not carry a trailing filler break behind pasted content', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>ab|<br></div>');
        insertTreeFragmentIntoRange(range, fragmentOf('<div>X</div><div>Y</div>'), root);
        expect(root.innerHTML).toBe('<div>abX</div><div>Y</div>');
    });

    it('gives empty pasted blocks their filler', () => {
        const root = createRoot();
        const range = loadWithSelection(root, '<div>a|</div>');
        insertTreeFragmentIntoRange(range, fragmentOf('<div>X</div><div></div><div>Z</div>'), root);
        expect(root.innerHTML).toBe('<div>aX</div><div><br></div><div>Z</div>');
    });
});
