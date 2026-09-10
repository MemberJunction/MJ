import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZERO_WIDTH_SPACE as ZWS } from '../lib/engine/constants';
import { RichTextEngine } from '../lib/engine/editor';
import { RichTextEditorConfig } from '../lib/rich-text-editor.types';
import { createRoot, htmlWithSelection, loadWithSelection, select } from './support/editor-harness';

/**
 * The engine end to end: commands through the public surface, keystrokes through real DOM
 * events, undo across both.
 */
function createEngine(html: string, config: RichTextEditorConfig = {}): { engine: RichTextEngine; root: HTMLElement } {
    const root = createRoot();
    const range = loadWithSelection(root, html);
    const engine = new RichTextEngine(root, config);
    engine.SetSelection(range);
    return { engine, root };
}

function keydown(root: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    root.dispatchEvent(event);
    return event;
}

function beforeinput(root: HTMLElement, inputType: string): Event {
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType });
    root.dispatchEvent(event);
    return event;
}

describe('RichTextEngine', () => {
    let engines: RichTextEngine[] = [];

    beforeEach(() => {
        document.body.innerHTML = '';
        document.getSelection()?.removeAllRanges();
    });

    afterEach(() => {
        for (const engine of engines) {
            engine.Destroy();
        }
        engines = [];
    });

    function make(html: string, config?: RichTextEditorConfig) {
        const made = createEngine(html, config);
        engines.push(made.engine);
        return made;
    }

    describe('construction and content', () => {
        it('marks the root editable and gives an empty root a block to type in', () => {
            const root = createRoot();
            const engine = new RichTextEngine(root);
            engines.push(engine);
            expect(root.getAttribute('contenteditable')).toBe('true');
            expect(root.innerHTML).toBe('<div><br></div>');
        });

        it('SetHTML sanitizes and GetHTML serializes', () => {
            const { engine } = make('<div>x|</div>');
            engine.SetHTML('<div onclick="evil()">a</div><script>1</script>');
            expect(engine.GetHTML()).toBe('<div>a</div>');
        });

        it('SetHTML resets undo history', () => {
            const { engine } = make('<div>a|</div>');
            engine.ToggleFormat({ Tag: 'B' });
            expect(engine.CanUndo).toBe(true);
            engine.SetHTML('<div>fresh</div>');
            expect(engine.CanUndo).toBe(false);
        });
    });

    describe('selection', () => {
        it('reads the live selection when it is inside the root', () => {
            const { engine, root } = make('<div>ab|</div>');
            const range = loadWithSelection(root, '<div>a|b</div>');
            select(range);
            expect(engine.GetSelection().startOffset).toBe(1);
        });

        it('falls back to the last known position when focus is elsewhere', () => {
            const { engine, root } = make('<div>ab|</div>');
            const other = document.createElement('input');
            document.body.appendChild(other);
            const outside = document.createRange();
            outside.selectNodeContents(other);
            select(outside);
            const range = engine.GetSelection();
            expect(root.contains(range.startContainer)).toBe(true);
            expect(range.startOffset).toBe(2);
        });

        it('reports the path and fires pathChange only when it changes', () => {
            const { engine, root } = make('<div>a|<b>b</b></div>');
            const paths: string[] = [];
            engine.On('pathChange', (event) => paths.push(event.Path));
            expect(engine.GetPath()).toBe('DIV');
            const inBold = document.createRange();
            inBold.setStart(root.querySelector('b')?.firstChild as Text, 1);
            inBold.collapse(true);
            engine.SetSelection(inBold);
            engine.SetSelection(inBold);
            expect(paths).toEqual(['DIV>B']);
        });
    });

    describe('inline commands', () => {
        it('toggles bold over a selection and reports pressed state', () => {
            const { engine, root } = make('<div>[ab]</div>');
            expect(engine.IsCommandActive('bold')).toBe(false);
            engine.ExecuteCommand('bold');
            expect(root.innerHTML).toBe('<div><b>ab</b></div>');
            expect(engine.IsCommandActive('bold')).toBe(true);
            engine.ExecuteCommand('bold');
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('fires input and undoStateChange around a command', () => {
            const { engine } = make('<div>[ab]</div>');
            const input = vi.fn();
            const undoState = vi.fn();
            engine.On('input', input);
            engine.On('undoStateChange', undoState);
            engine.ExecuteCommand('italic');
            expect(input).toHaveBeenCalledTimes(1);
            expect(undoState).toHaveBeenLastCalledWith({ CanUndo: true, CanRedo: false });
        });

        it('makes and removes links', () => {
            const { engine, root } = make('<div>[text]</div>');
            engine.MakeLink('https://a.b', { target: '_blank' });
            expect(root.innerHTML).toBe('<div><a href="https://a.b" target="_blank">text</a></div>');
            expect(engine.IsCommandActive('link')).toBe(true);

            const caret = document.createRange();
            caret.setStart(root.querySelector('a')?.firstChild as Text, 2);
            caret.collapse(true);
            engine.SetSelection(caret);
            engine.RemoveLink();
            expect(root.innerHTML).toBe('<div>text</div>');
        });

        it('inserts the address as text when linking a collapsed caret', () => {
            const { engine, root } = make('<div>a|</div>');
            engine.MakeLink('https://a.b');
            expect(root.innerHTML).toBe('<div>a<a href="https://a.b">https://a.b</a></div>');
        });

        it('retargets an existing link from a caret inside it', () => {
            const { engine, root } = make('<div><a href="old">te|xt</a></div>');
            engine.MakeLink('new');
            expect(root.innerHTML).toBe('<div><a href="new">text</a></div>');
        });

        it('removes all formatting', () => {
            const { engine, root } = make('<div>[<b>a</b><i>b</i>]</div>');
            engine.ExecuteCommand('removeFormat');
            expect(root.innerHTML).toBe('<div>ab</div>');
        });
    });

    describe('block commands', () => {
        it('toggles a quote', () => {
            const { engine, root } = make('<div>a|</div>');
            engine.ExecuteCommand('blockquote');
            expect(root.innerHTML).toBe('<blockquote><div>a</div></blockquote>');
            expect(engine.IsCommandActive('blockquote')).toBe(true);
            engine.ExecuteCommand('blockquote');
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('toggles lists and switches between types', () => {
            const { engine, root } = make('<div>a|</div>');
            engine.ExecuteCommand('bulletList');
            expect(root.innerHTML).toBe('<ul><li>a</li></ul>');
            expect(engine.IsCommandActive('bulletList')).toBe(true);
            engine.ExecuteCommand('orderedList');
            expect(root.innerHTML).toBe('<ol><li>a</li></ol>');
            expect(engine.IsCommandActive('orderedList')).toBe(true);
            engine.ExecuteCommand('orderedList');
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('retags the whole enclosing list when asked for the other type from one item', () => {
            const { engine, root } = make('<ul><li>a|</li><li>b</li></ul>');
            engine.ExecuteCommand('orderedList');
            expect(root.innerHTML).toBe('<ol><li>a</li><li>b</li></ol>');
        });

        it('changes list level in place', () => {
            const { engine, root } = make('<ul><li>a</li><li>b|</li></ul>');
            engine.IncreaseListLevel();
            expect(root.innerHTML).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
            engine.DecreaseListLevel();
            expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
            expect(engine.CanUndo).toBe(true);
        });

        it('toggles headings', () => {
            const { engine, root } = make('<div>a|</div>');
            engine.ExecuteCommand('heading2');
            expect(root.innerHTML).toBe('<h2>a</h2>');
            expect(engine.IsCommandActive('heading2')).toBe(true);
            engine.ExecuteCommand('heading1');
            expect(root.innerHTML).toBe('<h1>a</h1>');
            engine.ExecuteCommand('heading1');
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('honours configured tag attributes', () => {
            const { engine, root } = make('<div>a|</div>', { TagAttributes: { UL: { style: 'margin:0' } } });
            engine.MakeUnorderedList();
            expect(root.innerHTML).toBe('<ul style="margin:0"><li>a</li></ul>');
        });
    });

    describe('undo and redo', () => {
        it('undoes and redoes a command, restoring the selection', () => {
            const { engine, root } = make('<div>a[b]c</div>');
            engine.ExecuteCommand('bold');
            expect(root.innerHTML).toBe('<div>a<b>b</b>c</div>');
            engine.Undo();
            expect(root.innerHTML).toBe('<div>abc</div>');
            expect(engine.GetSelection().toString()).toBe('b');
            expect(engine.CanRedo).toBe(true);
            engine.Redo();
            expect(root.innerHTML).toBe('<div>a<b>b</b>c</div>');
        });

        it('treats native typing as an undoable change', () => {
            const { engine, root } = make('<div>a|</div>');
            engine.SaveUndoState();
            (root.firstChild?.firstChild as Text).appendData('bc');
            root.dispatchEvent(new Event('input', { bubbles: true }));
            expect(engine.CanUndo).toBe(true);
            engine.Undo();
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('one undo step per command with no typing between', () => {
            const { engine, root } = make('<div>[a]</div>');
            engine.ExecuteCommand('bold');
            engine.ExecuteCommand('italic');
            expect(root.innerHTML).toBe('<div><b><i>a</i></b></div>');
            engine.Undo();
            expect(root.innerHTML).toBe('<div><b>a</b></div>');
            engine.Undo();
            expect(root.innerHTML).toBe('<div>a</div>');
            expect(engine.CanUndo).toBe(false);
        });

        it('checkpoints at compositionstart so an IME word undoes as one', () => {
            const { engine, root } = make('<div>|</div>');
            root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
            (root.firstChild as Element).textContent = '日本';
            root.dispatchEvent(new Event('input', { bubbles: true }));
            engine.Undo();
            expect(root.innerHTML).toBe('<div></div>');
        });
    });

    describe('keyboard events', () => {
        it('Enter splits the block and prevents the default', () => {
            const { engine, root } = make('<div>ab|cd</div>');
            const event = keydown(root, { key: 'Enter' });
            expect(event.defaultPrevented).toBe(true);
            expect(htmlWithSelection(root, engine.GetSelection())).toBe('<div>ab</div><div>|cd</div>');
        });

        it('Ctrl+B toggles bold on non-Mac platforms', () => {
            const { root } = make('<div>[ab]</div>');
            keydown(root, { key: 'b', ctrlKey: true });
            expect(root.innerHTML).toBe('<div><b>ab</b></div>');
        });

        it('Ctrl+Z / Ctrl+Shift+Z undo and redo', () => {
            const { root } = make('<div>[ab]</div>');
            keydown(root, { key: 'b', ctrlKey: true });
            keydown(root, { key: 'z', ctrlKey: true });
            expect(root.innerHTML).toBe('<div>ab</div>');
            keydown(root, { key: 'z', ctrlKey: true, shiftKey: true });
            expect(root.innerHTML).toBe('<div><b>ab</b></div>');
        });

        it('Ctrl+] and Ctrl+[ change the quote level', () => {
            const { root } = make('<div>a|</div>');
            keydown(root, { key: ']', ctrlKey: true });
            expect(root.innerHTML).toBe('<blockquote><div>a</div></blockquote>');
            keydown(root, { key: '[', ctrlKey: true });
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('Backspace mid-text is not prevented and a repair follows the native delete', async () => {
            vi.useFakeTimers();
            const { engine, root } = make('<div>a<b>b|</b></div>');
            const event = keydown(root, { key: 'Backspace' });
            expect(event.defaultPrevented).toBe(false);
            // Simulate the browser deleting the character and leaving a hollow <b>.
            (root.querySelector('b')?.firstChild as Text).data = '';
            root.dispatchEvent(new Event('input', { bubbles: true }));
            vi.runAllTimers();
            expect(root.innerHTML).toBe('<div>a</div>');
            expect(engine.GetSelection().startContainer.nodeValue).toBe('a');
            vi.useRealTimers();
        });

        it('Tab outside a list is left to the browser', () => {
            const { root } = make('<div>a|</div>');
            const event = keydown(root, { key: 'Tab' });
            expect(event.defaultPrevented).toBe(false);
        });

        it('ignores keys while composing', () => {
            const { root } = make('<div>a|</div>');
            const event = keydown(root, { key: 'Enter', isComposing: true });
            expect(event.defaultPrevented).toBe(false);
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('ignores keys and intents between compositionstart and compositionend', () => {
            const { root } = make('<div>a|</div>');
            root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
            expect(keydown(root, { key: 'Enter' }).defaultPrevented).toBe(false);
            expect(beforeinput(root, 'insertParagraph').defaultPrevented).toBe(false);
            expect(root.innerHTML).toBe('<div>a</div>');
            root.dispatchEvent(new Event('compositionend', { bubbles: true }));
            expect(keydown(root, { key: 'Enter' }).defaultPrevented).toBe(true);
            expect(root.innerHTML).toBe('<div>a</div><div><br></div>');
        });

        it('treats keyCode 229 as composition', () => {
            const { root } = make('<div>a|</div>');
            const event = keydown(root, { key: 'Enter', keyCode: 229 } as KeyboardEventInit);
            expect(event.defaultPrevented).toBe(false);
            expect(root.innerHTML).toBe('<div>a</div>');
        });

        it('keeps caret ballast in place during a composition', () => {
            const { engine, root } = make('<div>ab|</div>');
            engine.ExecuteCommand('bold');
            root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
            engine.RemoveZeroWidthSpaces();
            expect(root.innerHTML).toBe(`<div>ab<b>${ZWS}</b></div>`);
        });
    });

    describe('beforeinput intents', () => {
        it('handles insertParagraph', () => {
            const { root } = make('<div>a|b</div>');
            const event = beforeinput(root, 'insertParagraph');
            expect(event.defaultPrevented).toBe(true);
            expect(root.innerHTML).toBe('<div>a</div><div>b</div>');
        });

        it('handles formatBold and historyUndo', () => {
            const { root } = make('<div>[ab]</div>');
            beforeinput(root, 'formatBold');
            expect(root.innerHTML).toBe('<div><b>ab</b></div>');
            beforeinput(root, 'historyUndo');
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('handles list and indent intents', () => {
            const { root } = make('<div>a|</div>');
            beforeinput(root, 'insertUnorderedList');
            expect(root.innerHTML).toBe('<ul><li>a</li></ul>');
            beforeinput(root, 'formatOutdent');
            expect(root.innerHTML).toBe('<div>a</div>');
            beforeinput(root, 'formatIndent');
            expect(root.innerHTML).toBe('<blockquote><div>a</div></blockquote>');
        });

        it('leaves insertText to the browser', () => {
            const { root } = make('<div>a|</div>');
            const event = beforeinput(root, 'insertText');
            expect(event.defaultPrevented).toBe(false);
        });

        it('does not double-handle a deletion the keydown already left to the browser', () => {
            const { root } = make('<div>ab|</div>');
            keydown(root, { key: 'Backspace' });
            const event = beforeinput(root, 'deleteContentBackward');
            expect(event.defaultPrevented).toBe(false);
        });
    });

    describe('insertion API', () => {
        it('InsertHTML runs the paste pipeline and merges at the caret', () => {
            const { engine, root } = make('<div>a|b</div>');
            engine.InsertHTML('<strong onclick="x">X</strong>');
            expect(root.innerHTML).toBe('<div>a<b>X</b>b</div>');
            expect(engine.CanUndo).toBe(true);
        });

        it('InsertHTML without isPaste does not fire willPaste', () => {
            const { engine } = make('<div>|</div>');
            const seen = vi.fn();
            engine.On('willPaste', seen);
            engine.InsertHTML('<b>x</b>');
            expect(seen).not.toHaveBeenCalled();
        });

        it('InsertPlainText makes blocks from lines', () => {
            const { engine, root } = make('<div>a|</div>');
            engine.InsertPlainText('x\ny');
            expect(htmlWithSelection(root, engine.GetSelection())).toBe('<div>ax</div><div>y|</div>');
        });
    });

    describe('images and trailing lines', () => {
        it('InsertImage inserts a sanitized <img> at the caret', () => {
            const { engine, root } = make('<div>a|b</div>');
            engine.InsertImage('data:image/png;base64,AAAA', 'pic');
            expect(root.innerHTML).toBe('<div>a<img src="data:image/png;base64,AAAA" alt="pic">b</div>');
            engine.InsertImage('javascript:alert(1)', 'x');
            expect(root.querySelectorAll('img[src^="javascript"]')).toHaveLength(0);
        });

        it('knows when the document ends in something the caret cannot follow', () => {
            const quoted = make('<div>a</div><blockquote><div>q|</div></blockquote>');
            expect(quoted.engine.NeedsTrailingLine()).toBe(true);
            const plain = make('<blockquote><div>q</div></blockquote><div>a|</div>');
            expect(plain.engine.NeedsTrailingLine()).toBe(false);
        });

        it('AppendTrailingLine adds one default block, places the caret, and is undoable', () => {
            const { engine, root } = make('<blockquote><div>q|</div></blockquote>');
            const block = engine.AppendTrailingLine();
            expect(root.innerHTML).toBe('<blockquote><div>q</div></blockquote><div><br></div>');
            expect(engine.GetSelection().startContainer).toBe(block);
            expect(engine.NeedsTrailingLine()).toBe(false);
            engine.Undo();
            expect(root.innerHTML).toBe('<blockquote><div>q</div></blockquote>');
        });
    });

    describe('pending formats', () => {
        it('a pending bold at a caret is stripped from GetHTML and swept on arrow keys', () => {
            const { engine, root } = make('<div>ab|</div>');
            engine.ExecuteCommand('bold');
            expect(root.innerHTML).toBe(`<div>ab<b>${ZWS}</b></div>`);
            expect(engine.GetHTML()).toBe('<div>ab<b></b></div>');
            // Move the caret away, then arrow: the hollow wrapper goes.
            const away = document.createRange();
            away.setStart(root.firstChild?.firstChild as Text, 0);
            away.collapse(true);
            engine.SetSelection(away);
            keydown(root, { key: 'ArrowLeft' });
            expect(root.innerHTML).toBe('<div>ab</div>');
        });
    });

    describe('errors and teardown', () => {
        it('routes listener exceptions to DidError', () => {
            const errors: unknown[] = [];
            const { engine, root } = make('<div>a|</div>', { DidError: (error) => errors.push(error) });
            engine.On('input', () => {
                throw new Error('listener failed');
            });
            engine.ExecuteCommand('bold');
            expect(errors).toHaveLength(1);
            expect(root.innerHTML).toContain('<b>');
        });

        it('Destroy detaches listeners', () => {
            const { engine, root } = make('<div>a|b</div>');
            engine.Destroy();
            const event = keydown(root, { key: 'Enter' });
            expect(event.defaultPrevented).toBe(false);
            expect(root.innerHTML).toBe('<div>ab</div>');
        });
    });
});
