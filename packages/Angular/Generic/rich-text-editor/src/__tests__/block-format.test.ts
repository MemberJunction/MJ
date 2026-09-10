import { describe, it, expect, beforeEach } from 'vitest';
import {
    decreaseListLevel,
    decreaseQuoteLevel,
    getBlockTag,
    increaseListLevel,
    increaseQuoteLevel,
    makeList,
    modifyBlocks,
    removeList,
    setBlockType,
} from '../lib/engine/format/block';
import { createRoot, htmlWithSelection, loadWithSelection } from './support/editor-harness';

describe('block format engine', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('modifyBlocks', () => {
        it('operates on whole blocks and leaves the caret inside the result', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>one</div><div>t|wo</div><div>three</div>');
            modifyBlocks(root, range, increaseQuoteLevel());
            expect(htmlWithSelection(root, range)).toBe('<div>one</div><blockquote><div>|two</div></blockquote><div>three</div>');
        });

        it('covers every block a selection touches', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>o[ne</div><div>two</div><div>th]ree</div>');
            modifyBlocks(root, range, increaseQuoteLevel());
            expect(root.innerHTML).toBe('<blockquote><div>one</div><div>two</div><div>three</div></blockquote>');
        });

        it('leaves no stray filler when every block is extracted', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>on|ly</div>');
            modifyBlocks(root, range, increaseQuoteLevel());
            expect(root.innerHTML).toBe('<blockquote><div>only</div></blockquote>');
        });

        it('merges alike containers at the seams', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<blockquote><div>a</div></blockquote><div>b|</div><blockquote><div>c</div></blockquote>');
            modifyBlocks(root, range, increaseQuoteLevel());
            expect(root.innerHTML).toBe('<blockquote><div>a</div><div>b</div><div>c</div></blockquote>');
        });

        it('never touches blocks outside the selection', () => {
            const root = createRoot();
            const before = '<table><tbody><tr><td style="padding:0">cell</td></tr></tbody></table>';
            const range = loadWithSelection(root, `${before}<div>x|</div>`);
            modifyBlocks(root, range, increaseQuoteLevel());
            expect(root.innerHTML.startsWith(before)).toBe(true);
        });
    });

    describe('quotes', () => {
        it('nests on repeated increase and unwraps one level on decrease', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a|</div>');
            modifyBlocks(root, range, increaseQuoteLevel());
            modifyBlocks(root, range, increaseQuoteLevel());
            expect(root.innerHTML).toBe('<blockquote><blockquote><div>a</div></blockquote></blockquote>');
            modifyBlocks(root, range, decreaseQuoteLevel());
            expect(root.innerHTML).toBe('<blockquote><div>a</div></blockquote>');
            modifyBlocks(root, range, decreaseQuoteLevel());
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('applies configured blockquote attributes', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a|</div>');
            modifyBlocks(root, range, increaseQuoteLevel({ BLOCKQUOTE: { style: 'margin:0 0 0 1em' } }));
            expect(root.innerHTML).toBe('<blockquote style="margin:0 0 0 1em"><div>a</div></blockquote>');
        });

        it('splits a quote when only its middle block is un-quoted', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<blockquote><div>a</div><div>b|</div><div>c</div></blockquote>');
            modifyBlocks(root, range, decreaseQuoteLevel());
            expect(root.innerHTML).toBe('<blockquote><div>a</div></blockquote><div>b</div><blockquote><div>c</div></blockquote>');
        });
    });

    describe('lists', () => {
        it('turns blocks into items of one list', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a</div><div>b]</div>');
            modifyBlocks(root, range, makeList('UL'));
            expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
        });

        it('joins a new item onto an adjacent list of the same type', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a</li></ul><div>b|</div>');
            modifyBlocks(root, range, makeList('UL'));
            expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
        });

        it('retags a list of the other type', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>[a</li><li>b]</li></ul>');
            modifyBlocks(root, range, makeList('OL'));
            expect(root.innerHTML).toBe('<ol><li>a</li><li>b</li></ol>');
        });

        it('removes a list back to default blocks', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>[a</li><li>b]</li></ul>');
            modifyBlocks(root, range, removeList());
            expect(root.innerHTML).toBe('<div>a</div><div>b</div>');
        });

        it('flattens nested lists on removal', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>[a<ul><li>b</li></ul></li><li>c]</li></ul>');
            modifyBlocks(root, range, removeList());
            expect(root.innerHTML).toBe('<div>a</div><div>b</div><div>c</div>');
        });

        it('removes only the selected item, splitting the list', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a</li><li>b|</li><li>c</li></ul>');
            modifyBlocks(root, range, removeList());
            expect(root.innerHTML).toBe('<ul><li>a</li></ul><div>b</div><ul><li>c</li></ul>');
        });

        it('indents an item inside the previous item — valid nesting', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a</li><li>b|</li><li>c</li></ul>');
            expect(increaseListLevel(root, range)).toBe(true);
            expect(htmlWithSelection(root, range)).toBe('<ul><li>a<ul><li>b|</li></ul></li><li>c</li></ul>');
        });

        it('indents into an existing sublist of the previous item', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a<ul><li>x</li></ul></li><li>b|</li></ul>');
            increaseListLevel(root, range);
            expect(root.innerHTML).toBe('<ul><li>a<ul><li>x</li><li>b</li></ul></li></ul>');
        });

        it('indents a run of items together, skipping whitespace between them', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul>\n<li>a</li>\n<li>[b</li>\n<li>c]</li>\n</ul>');
            increaseListLevel(root, range, { UL: { style: 'margin:0' } });
            expect(root.innerHTML).toBe('<ul>\n<li>a<ul style="margin:0"><li>b</li>\n<li>c</li></ul></li>\n\n</ul>');
        });

        it('cannot indent the first item', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a|</li><li>b</li></ul>');
            expect(increaseListLevel(root, range)).toBe(false);
            expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
        });

        it('does nothing outside a list', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a|</div>');
            expect(increaseListLevel(root, range)).toBe(false);
            expect(decreaseListLevel(root, range)).toBe(false);
        });

        it('outdents a nested item to a sibling and keeps its followers nested under it', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a<ul><li>b|</li><li>c</li></ul></li><li>d</li></ul>');
            expect(decreaseListLevel(root, range)).toBe(true);
            expect(htmlWithSelection(root, range)).toBe('<ul><li>a</li><li>b|<ul><li>c</li></ul></li><li>d</li></ul>');
        });

        it('outdents a top-level item out of the list, splitting it', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a</li><li>b|</li><li>c</li></ul>');
            decreaseListLevel(root, range);
            expect(htmlWithSelection(root, range)).toBe('<ul><li>a</li></ul><div>b|</div><ul><li>c</li></ul>');
        });

        it('keeps the caret when the item it was in is replaced by a block', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>|<br></li></ul>');
            decreaseListLevel(root, range);
            expect(root.innerHTML).toBe('<div><br></div>');
            expect(range.startContainer).toBe(root.firstChild);
            expect(range.startOffset).toBe(0);
        });

        it('removes a list emptied by outdenting its only item', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a|</li></ul>');
            decreaseListLevel(root, range);
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('outdents a container item into its blocks', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li><div>a|</div><div>b</div></li></ul>');
            decreaseListLevel(root, range);
            expect(root.innerHTML).toBe('<div>a</div><div>b</div>');
        });
    });

    describe('block type', () => {
        it('retags blocks as a heading and back', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>t|itle</div>');
            modifyBlocks(root, range, setBlockType('H1'));
            expect(root.innerHTML).toBe('<h1>title</h1>');
            expect(getBlockTag(root, range)).toBe('H1');
            modifyBlocks(root, range, setBlockType(null));
            expect(root.innerHTML).toBe('<div>title</div>');
        });

        it('keeps the block attributes across a retag', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<p style="margin:0" class="x">a|</p>');
            modifyBlocks(root, range, setBlockType('H2'));
            expect(root.innerHTML).toBe('<h2 style="margin:0" class="x">a</h2>');
        });

        it('applies default block attributes when reverting to the default block', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<h1>a|</h1>');
            modifyBlocks(root, range, setBlockType(null), { BlockSpec: { Tag: 'DIV', Attributes: { style: 'margin:0' } } });
            expect(root.innerHTML).toBe('<div style="margin:0">a</div>');
        });

        it('wraps the contents of a list item instead of retagging it', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a|</li></ul>');
            modifyBlocks(root, range, setBlockType('H3'));
            expect(root.innerHTML).toBe('<ul><li><h3>a</h3></li></ul>');
        });

        it('retags every block in the selection', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[a</div><p>b]</p>');
            modifyBlocks(root, range, setBlockType('H2'));
            expect(root.innerHTML).toBe('<h2>a</h2><h2>b</h2>');
        });
    });
});
