import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZERO_WIDTH_SPACE as ZWS } from '../lib/engine/constants';
import { decreaseListLevel, increaseListLevel, modifyBlocks } from '../lib/engine/format/block';
import { toggleFormat } from '../lib/engine/format/inline';
import { handleBackspace } from '../lib/engine/keyboard/backspace';
import { handleDelete } from '../lib/engine/keyboard/delete';
import { handleEnter } from '../lib/engine/keyboard/enter';
import { EditingHost } from '../lib/engine/keyboard/host';
import { keyStringFor } from '../lib/engine/keyboard/keys';
import { handleSpace } from '../lib/engine/keyboard/space';
import { handleTab } from '../lib/engine/keyboard/tab';
import { DEFAULT_BLOCK_SPEC } from '../lib/engine/node/block';
import { splitBlock } from '../lib/engine/split-block';
import { removeZeroWidthSpaces } from '../lib/engine/zws';
import { createRoot, htmlWithSelection, loadWithSelection } from './support/editor-harness';

/**
 * The keyboard layer's specs are grouped here by key rather than split per handler file
 * (`enter.ts`, `backspace.ts`, `delete.ts`, `tab.ts`, `space.ts`, `keys.ts`, `grapheme.ts`,
 * `split-block.ts`), because every handler is driven through the same fake host below and
 * the same caret-marker harness. One file, one setup.
 *
 * A hand-rolled host: the handlers are exercised without the engine, so a failure here
 * points at the handler and not at the plumbing around it.
 */
class FakeHost implements EditingHost {
    public readonly BlockSpec = DEFAULT_BLOCK_SPEC;
    public readonly TagAttributes = undefined;
    public AddLinks = true;
    public Selection: Range;
    public UndoSaves = 0;
    public Changes = 0;
    public NativeDeletes = 0;

    constructor(public readonly Root: HTMLElement, range: Range) {
        this.Selection = range;
    }

    GetSelection(): Range {
        return this.Selection;
    }
    SetSelection(range: Range): void {
        this.Selection = range;
    }
    SaveUndoState(): void {
        this.UndoSaves += 1;
    }
    DocumentChanged(): void {
        this.Changes += 1;
    }
    ScheduleAfterNativeDelete(): void {
        this.NativeDeletes += 1;
    }
    RemoveZeroWidthSpaces(): void {
        removeZeroWidthSpaces(this.Root, this.Selection.startContainer);
    }
    ModifyBlocks(transform: Parameters<typeof modifyBlocks>[2], range: Range): void {
        modifyBlocks(this.Root, range, transform, { BlockSpec: this.BlockSpec });
    }
    ChangeListLevel(range: Range, delta: 1 | -1): boolean {
        return delta > 0 ? increaseListLevel(this.Root, range) : decreaseListLevel(this.Root, range, this.BlockSpec);
    }
    ToggleFormat(format: { Tag: string }): void {
        toggleFormat(this.Root, this.Selection, format);
    }
    Undo(): void {
        /* not under test */
    }
    Redo(): void {
        /* not under test */
    }
}

function setup(html: string): { host: FakeHost; root: HTMLElement; range: Range } {
    const root = createRoot();
    const range = loadWithSelection(root, html);
    return { host: new FakeHost(root, range), root, range };
}

describe('keyboard layer', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('splitBlock', () => {
        it('splits mid-text, carrying inline formatting into the new block', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>a<b>b|c</b></div>');
            const after = splitBlock(root, root.firstElementChild as Element, range.startContainer, range.startOffset);
            expect(root.innerHTML).toBe('<div>a<b>b</b></div><div><b>c</b></div>');
            expect(after).toBe(root.lastElementChild);
        });

        it('gives an empty new block a filler', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>ab|</div>');
            splitBlock(root, root.firstElementChild as Element, range.startContainer, range.startOffset);
            expect(root.innerHTML).toBe('<div>ab</div><div><br></div>');
        });

        it('follows a heading with a default block', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<h1>title|</h1>');
            splitBlock(root, root.firstElementChild as Element, range.startContainer, range.startOffset);
            expect(root.innerHTML).toBe('<h1>title</h1><div><br></div>');
        });

        it('follows a list item with a list item', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<ul><li>a|b</li></ul>');
            splitBlock(root, root.querySelector('li') as Element, range.startContainer, range.startOffset);
            expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
        });

        it('keeps the configured default block attributes on the new block', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<h2>a|</h2>');
            splitBlock(root, root.firstElementChild as Element, range.startContainer, range.startOffset, {
                Tag: 'DIV',
                Attributes: { style: 'margin:0' },
            });
            expect(root.innerHTML).toBe('<h2>a</h2><div style="margin:0"><br></div>');
        });
    });

    describe('Enter', () => {
        it('splits the block and puts the caret at the start of the new one', () => {
            const { host, root } = setup('<div>hel|lo</div>');
            handleEnter(host, host.Selection, false);
            expect(htmlWithSelection(root, host.Selection)).toBe('<div>hel</div><div>|lo</div>');
            expect(host.UndoSaves).toBe(1);
            expect(host.Changes).toBe(1);
        });

        it('cleans the hollow wrapper a split leaves at the end of the old block', () => {
            const { host, root } = setup('<div>a<b>|b</b></div>');
            handleEnter(host, host.Selection, false);
            expect(root.innerHTML).toBe('<div>a</div><div><b>b</b></div>');
        });

        it('deletes a selection first', () => {
            const { host, root } = setup('<div>a[bc]d</div>');
            handleEnter(host, host.Selection, false);
            expect(root.innerHTML).toBe('<div>a</div><div>d</div>');
        });

        it('escapes a list from an empty item', () => {
            const { host, root } = setup('<ul><li>a</li><li>|<br></li></ul>');
            handleEnter(host, host.Selection, false);
            expect(root.innerHTML).toBe('<ul><li>a</li></ul><div><br></div>');
        });

        it('outdents an empty nested item rather than leaving the list', () => {
            const { host, root } = setup('<ul><li>a<ul><li>|<br></li></ul></li></ul>');
            handleEnter(host, host.Selection, false);
            expect(root.innerHTML).toBe('<ul><li>a</li><li><br></li></ul>');
        });

        it('escapes a quote from an empty block', () => {
            const { host, root } = setup('<blockquote><div>a</div><div>|<br></div></blockquote>');
            handleEnter(host, host.Selection, false);
            expect(root.innerHTML).toBe('<blockquote><div>a</div></blockquote><div><br></div>');
        });

        it('inserts a newline character inside <pre>', () => {
            const { host, root } = setup('<pre>a|b</pre>');
            handleEnter(host, host.Selection, false);
            expect(root.innerHTML).toBe('<pre>a\nb</pre>');
        });

        it('does not continue a link onto the new line', () => {
            const { host, root } = setup('<div><a href="x">link|</a></div>');
            handleEnter(host, host.Selection, false);
            expect(root.innerHTML).toBe('<div><a href="x">link</a></div><div><br></div>');
        });

        it('Shift+Enter inserts a line break within the block', () => {
            const { host, root } = setup('<div>a|b</div>');
            handleEnter(host, host.Selection, true);
            expect(htmlWithSelection(root, host.Selection)).toBe('<div>a<br>|b</div>');
        });

        it('Shift+Enter at the end of a block adds a second break so the new line renders', () => {
            const { host, root } = setup('<div>a|</div>');
            handleEnter(host, host.Selection, true);
            expect(root.innerHTML).toBe('<div>a<br><br></div>');
            expect(host.Selection.startContainer).toBe(root.firstChild);
            expect(host.Selection.startOffset).toBe(2);
        });
    });

    describe('Backspace', () => {
        it('leaves a mid-text delete to the browser and schedules a repair', () => {
            const { host } = setup('<div>ab|c</div>');
            expect(handleBackspace(host, host.Selection)).toBe(false);
            expect(host.NativeDeletes).toBe(1);
            expect(host.UndoSaves).toBe(1);
        });

        it('merges with the previous block at a block start', () => {
            const { host, root } = setup('<div>ab</div><div>|cd</div>');
            expect(handleBackspace(host, host.Selection)).toBe(true);
            expect(htmlWithSelection(root, host.Selection)).toBe('<div>ab|cd</div>');
        });

        it('deletes a selection outright', () => {
            const { host, root } = setup('<div>a[b</div><div>c]d</div>');
            expect(handleBackspace(host, host.Selection)).toBe(true);
            expect(root.innerHTML).toBe('<div>ad</div>');
        });

        it('merges neighbouring containers once the block between them is gone', () => {
            const { host, root } = setup('<blockquote><div>a</div></blockquote><div>|<br></div><blockquote><div>b</div></blockquote>');
            handleBackspace(host, host.Selection);
            expect(root.innerHTML).toBe('<blockquote><div>a</div><div>b</div></blockquote>');
        });

        it('lifts the first item out of a list at the start of the document', () => {
            const { host, root } = setup('<ul><li>|a</li><li>b</li></ul>');
            handleBackspace(host, host.Selection);
            expect(root.innerHTML).toBe('<div>a</div><ul><li>b</li></ul>');
        });

        it('lifts the first block out of a quote at the start of the document', () => {
            const { host, root } = setup('<blockquote><div>|a</div></blockquote>');
            handleBackspace(host, host.Selection);
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('removes an autolink when backspacing into the end of its address', () => {
            const { host, root } = setup('<div>see <a href="https://a.b">https://a.b|</a> now</div>');
            expect(handleBackspace(host, host.Selection)).toBe(true);
            expect(htmlWithSelection(root, host.Selection)).toBe('<div>see https://a.| now</div>');
            expect(host.NativeDeletes).toBe(0);
        });

        it('leaves a link whose text is not its address to native deletion', () => {
            const { host } = setup('<div><a href="https://a.b">click|</a></div>');
            expect(handleBackspace(host, host.Selection)).toBe(false);
            expect(host.NativeDeletes).toBe(1);
        });

        it('does nothing at the very start of a plain document', () => {
            const { host, root } = setup('<div>|a</div>');
            expect(handleBackspace(host, host.Selection)).toBe(true);
            expect(root.innerHTML).toBe('<div>a</div>');
            expect(host.Changes).toBe(0);
        });

        it('treats a caret after ballast as a block start, keeping the pending format', () => {
            const { host, root } = setup(`<div>a</div><div><b>${ZWS}|</b>b</div>`);
            handleBackspace(host, host.Selection);
            expect(root.innerHTML).toBe(`<div>a<b>${ZWS}</b>b</div>`);
        });
    });

    describe('Delete', () => {
        it('deletes the next character itself', () => {
            const { host, root } = setup('<div>a|bc</div>');
            expect(handleDelete(host, host.Selection)).toBe(true);
            expect(htmlWithSelection(root, host.Selection)).toBe('<div>a|c</div>');
            expect(host.NativeDeletes).toBe(0);
            expect(host.Changes).toBe(1);
        });

        it('deletes a whole emoji, not half a surrogate pair', () => {
            const { host, root } = setup('<div>a|😀b</div>');
            handleDelete(host, host.Selection);
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('deletes a joined emoji sequence as one grapheme', () => {
            const { host, root } = setup('<div>|👨‍👩‍👧x</div>');
            handleDelete(host, host.Selection);
            expect(root.innerHTML).toBe('<div>x</div>');
        });

        it('reaches into the next inline element from the end of a text node', () => {
            const { host, root } = setup('<div>a|<b>bc</b></div>');
            handleDelete(host, host.Selection);
            expect(root.innerHTML).toBe('<div>a<b>c</b></div>');
        });

        it('removes a hollow inline left behind', () => {
            const { host, root } = setup('<div>a|<b>b</b>c</div>');
            handleDelete(host, host.Selection);
            expect(root.innerHTML).toBe('<div>ac</div>');
        });

        it('deletes an image or line break after the caret', () => {
            const a = setup('<div>a|<img src="x">b</div>');
            handleDelete(a.host, a.host.Selection);
            expect(a.root.innerHTML).toBe('<div>ab</div>');

            const b = setup('<div>a|<br>b</div>');
            handleDelete(b.host, b.host.Selection);
            expect(b.root.innerHTML).toBe('<div>ab</div>');
        });

        it('merges the next block at a block end', () => {
            const { host, root } = setup('<div>ab|</div><div>cd</div>');
            expect(handleDelete(host, host.Selection)).toBe(true);
            expect(htmlWithSelection(root, host.Selection)).toBe('<div>ab|cd</div>');
        });

        it('pulls the only item out of a following list', () => {
            const { host, root } = setup('<div>ab|</div><ul><li>c</li></ul>');
            handleDelete(host, host.Selection);
            expect(root.innerHTML).toBe('<div>abc</div>');
        });

        it('does nothing at the end of the document', () => {
            const { host, root } = setup('<div>ab|</div>');
            expect(handleDelete(host, host.Selection)).toBe(true);
            expect(root.innerHTML).toBe('<div>ab</div>');
        });
    });

    describe('Tab', () => {
        it('indents a list item', () => {
            const { host, root } = setup('<ul><li>a</li><li>b|</li></ul>');
            expect(handleTab(host, host.Selection, false)).toBe(true);
            expect(root.innerHTML).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
        });

        it('Shift+Tab outdents', () => {
            const { host, root } = setup('<ul><li>a<ul><li>b|</li></ul></li></ul>');
            expect(handleTab(host, host.Selection, true)).toBe(true);
            expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
        });

        it('is left to the browser outside a list', () => {
            const { host, root } = setup('<div>a|</div>');
            expect(handleTab(host, host.Selection, false)).toBe(false);
            expect(root.innerHTML).toBe('<div>a</div>');
        });
    });

    describe('Space', () => {
        it('records an undo checkpoint and lets the browser type the space', () => {
            const { host } = setup('<div>word|</div>');
            expect(handleSpace(host, host.Selection)).toBe(false);
            expect(host.UndoSaves).toBe(1);
        });

        it('links a URL the user just finished typing', () => {
            const { host, root } = setup('<div>see https://example.com/x|</div>');
            handleSpace(host, host.Selection);
            expect(root.innerHTML).toBe(`<div>see <a href="https://example.com/x">https://example.com/x</a>${ZWS}</div>`);
            expect(host.Selection.startContainer.nodeValue).toBe(ZWS);
        });

        it('adds a scheme to a www address and mailto to an email', () => {
            const a = setup('<div>www.example.org|</div>');
            handleSpace(a.host, a.host.Selection);
            expect(a.root.querySelector('a')?.getAttribute('href')).toBe('http://www.example.org');

            const b = setup('<div>mail me@example.org|</div>');
            handleSpace(b.host, b.host.Selection);
            expect(b.root.querySelector('a')?.getAttribute('href')).toBe('mailto:me@example.org');
        });

        it('leaves trailing punctuation outside the link', () => {
            const { host, root } = setup('<div>(https://example.com).|</div>');
            handleSpace(host, host.Selection);
            expect(root.innerHTML).toBe(`<div>(<a href="https://example.com">https://example.com</a>${ZWS}).</div>`);
        });

        it('does not link plain words or text already inside a link', () => {
            const a = setup('<div>hello|</div>');
            handleSpace(a.host, a.host.Selection);
            expect(a.root.querySelector('a')).toBeNull();

            const b = setup('<div><a href="x">https://example.com|</a></div>');
            handleSpace(b.host, b.host.Selection);
            expect(b.root.querySelectorAll('a')).toHaveLength(1);
        });

        it('respects AddLinks = false', () => {
            const { host, root } = setup('<div>https://example.com|</div>');
            host.AddLinks = false;
            handleSpace(host, host.Selection);
            expect(root.querySelector('a')).toBeNull();
        });
    });

    describe('keyStringFor', () => {
        it('names keys with modifiers in a fixed order', () => {
            expect(keyStringFor(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('Ctrl-Shift-z');
            expect(keyStringFor(new KeyboardEvent('keydown', { key: ' ' }))).toBe('Space');
            expect(keyStringFor(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))).toBe('Shift-Enter');
            expect(keyStringFor(new KeyboardEvent('keydown', { key: 'b', metaKey: true, altKey: true }))).toBe('Alt-Meta-b');
        });
    });

    it('FakeHost is a faithful EditingHost', () => {
        // Guards the interface against drift: if EditingHost grows a member the fake lacks,
        // this file fails to type-check before any behavioural test runs.
        const { host } = setup('<div>a|</div>');
        const asHost: EditingHost = host;
        expect(typeof asHost.GetSelection).toBe('function');
        vi.restoreAllMocks();
    });
});
