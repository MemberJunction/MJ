import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExpectNoAxeViolations, capture, click, query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RichTextEditorComponent } from './rich-text-editor.component';

/**
 * DOM spec for <mj-rich-text-editor>.
 *
 * The engine has its own 580-test suite; this file covers what is Angular's: the form
 * contract (CVA), inputs reaching the surface and toolbar, outputs firing from engine
 * events, and the accessibility of the rendered chrome.
 */

function surfaceOf(fixture: { nativeElement: HTMLElement }): HTMLElement {
    return fixture.nativeElement.querySelector('.mj-rte-surface') as HTMLElement;
}

/** Put the caret at the end of the surface's first block, as a user click would. */
function placeCaretAtEnd(surface: HTMLElement): void {
    const block = surface.firstElementChild as HTMLElement;
    const text = block.lastChild ?? block;
    const range = document.createRange();
    range.setStart(text, text.nodeType === Node.TEXT_NODE ? (text as Text).length : block.childNodes.length);
    range.collapse(true);
    const selection = document.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
}

/** Select everything in the first block. */
function selectFirstBlock(surface: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(surface.firstElementChild as Element);
    const selection = document.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
}

describe('RichTextEditorComponent (DOM)', () => {
    beforeEach(() => {
        document.getSelection()?.removeAllRanges();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('rendering', () => {
        it('renders the toolbar and an editable surface with one block to type in', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            expect(query(f, '.mj-rte-toolbar')).not.toBeNull();
            const surface = surfaceOf(f);
            expect(surface.getAttribute('contenteditable')).toBe('true');
            expect(surface.getAttribute('role')).toBe('textbox');
            expect(surface.innerHTML).toBe('<div><br></div>');
        });

        it('hides the toolbar when asked', () => {
            const f = renderComponentFixture(RichTextEditorComponent, { inputs: { ShowToolbar: false } });
            expect(query(f, '.mj-rte-toolbar')).toBeNull();
        });

        it('renders a custom toolbar layout in order, with separators', () => {
            const f = renderComponentFixture(RichTextEditorComponent, {
                inputs: { ToolbarItems: ['bold', 'separator', 'undo'] },
            });
            const commands = queryAll(f, 'button[data-command]').map((b) => b.getAttribute('data-command'));
            expect(commands).toEqual(['bold', 'undo']);
            expect(queryAll(f, '.mj-rte-toolbar-separator')).toHaveLength(1);
        });

        it('shows the placeholder only while empty', () => {
            const f = renderComponentFixture(RichTextEditorComponent, { inputs: { Placeholder: 'Write here' } });
            const surface = surfaceOf(f);
            expect(surface.classList.contains('mj-rte-surface--empty')).toBe(true);
            expect(surface.getAttribute('data-placeholder')).toBe('Write here');
            f.componentInstance.writeValue('<div>hello</div>');
            f.detectChanges();
            expect(surface.classList.contains('mj-rte-surface--empty')).toBe(false);
        });

        it('applies the minimum height and accessible name', () => {
            const f = renderComponentFixture(RichTextEditorComponent, { inputs: { MinHeight: '4rem', AriaLabel: 'Reply body' } });
            const surface = surfaceOf(f);
            expect(surface.style.minHeight).toBe('4rem');
            expect(surface.getAttribute('aria-label')).toBe('Reply body');
        });
    });

    describe('ControlValueAccessor', () => {
        it('writeValue loads sanitized content and GetHTML reads it back', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<div onclick="x()">a<script>1</script></div>');
            expect(surfaceOf(f).innerHTML).toBe('<div>a</div>');
            expect(f.componentInstance.GetHTML()).toBe('<div>a</div>');
        });

        it('applies a value written before the view was ready', () => {
            const f = renderComponentFixture(RichTextEditorComponent, {
                setup: (instance) => instance.writeValue('<div>early</div>'),
            });
            expect(surfaceOf(f).innerHTML).toBe('<div>early</div>');
        });

        it('reports user edits through onChange and ContentChange, not programmatic writes', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            const changes: string[] = [];
            f.componentInstance.registerOnChange((value) => changes.push(value));
            const events = capture(f.componentInstance.ContentChange);

            f.componentInstance.writeValue('<div>a</div>');
            expect(changes).toEqual([]);
            expect(events).toEqual([]);

            const surface = surfaceOf(f);
            (surface.firstChild?.firstChild as Text).appendData('b');
            surface.dispatchEvent(new Event('input', { bubbles: true }));
            expect(changes).toEqual(['<div>ab</div>']);
            expect(events).toEqual([{ Html: '<div>ab</div>', IsUserChange: true }]);
        });

        it('SetHTML emits ContentChange flagged as not a user change', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            const events = capture(f.componentInstance.ContentChange);
            f.componentInstance.SetHTML('<div>x</div>');
            expect(events).toEqual([{ Html: '<div>x</div>', IsUserChange: false }]);
        });

        it('calls onTouched when the surface blurs', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            const touched = vi.fn();
            f.componentInstance.registerOnTouched(touched);
            const focus = capture(f.componentInstance.FocusChange);
            const surface = surfaceOf(f);
            surface.dispatchEvent(new Event('focus'));
            surface.dispatchEvent(new Event('blur'));
            expect(touched).toHaveBeenCalledTimes(1);
            expect(focus).toEqual([true, false]);
        });

        it('setDisabledState turns editing off and disables the toolbar', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.setDisabledState(true);
            f.detectChanges();
            expect(surfaceOf(f).getAttribute('contenteditable')).toBe('false');
            expect(surfaceOf(f).getAttribute('aria-disabled')).toBe('true');
            expect((query(f, 'button[data-command="bold"]') as HTMLButtonElement).disabled).toBe(true);
            f.componentInstance.setDisabledState(false);
            f.detectChanges();
            expect(surfaceOf(f).getAttribute('contenteditable')).toBe('true');
        });

        it('ReadOnly turns editing off without marking the control disabled', () => {
            const f = renderComponentFixture(RichTextEditorComponent, { inputs: { ReadOnly: true } });
            expect(surfaceOf(f).getAttribute('contenteditable')).toBe('false');
            expect(surfaceOf(f).getAttribute('aria-readonly')).toBe('true');
            expect(surfaceOf(f).getAttribute('aria-disabled')).toBeNull();
        });
    });

    describe('images', () => {
        it('only emits PasteImage by default', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            const images = capture(f.componentInstance.PasteImage);
            const file = new File(['x'], 'pic.png', { type: 'image/png' });
            f.componentInstance.Engine?.NotifyPasteImage(file);
            expect(images.map((e) => e.File.name)).toEqual(['pic.png']);
            expect(surfaceOf(f).querySelector('img')).toBeNull();
        });

        it('inlines the image as a data URI when ImagePaste is data-uri', async () => {
            const f = renderComponentFixture(RichTextEditorComponent, { inputs: { ImagePaste: 'data-uri' } });
            f.componentInstance.writeValue('<div>a</div>');
            placeCaretAtEnd(surfaceOf(f));
            f.componentInstance.Engine?.NotifyPasteImage(new File(['x'], 'pic.png', { type: 'image/png' }));
            await vi.waitFor(() => expect(surfaceOf(f).querySelector('img')).not.toBeNull());
            const img = surfaceOf(f).querySelector('img') as HTMLImageElement;
            expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
            expect(img.getAttribute('alt')).toBe('pic.png');
        });
    });

    describe('paste events', () => {
        function pasteHtml(f: { componentInstance: RichTextEditorComponent }, html: string): void {
            f.componentInstance.Engine?.InsertHTML(html, true);
        }

        it('fires BeforePaste with a mutable fragment, then AfterPaste with the result', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<div>a</div>');
            placeCaretAtEnd(surfaceOf(f));
            const before: string[] = [];
            const after = capture(f.componentInstance.AfterPaste);
            f.componentInstance.BeforePaste.subscribe((args) => {
                before.push(args.Fragment.textContent ?? '');
                for (const bold of Array.from(args.Fragment.querySelectorAll('b'))) {
                    bold.replaceWith(...Array.from(bold.childNodes));
                }
            });
            pasteHtml(f, '<b>X</b>');
            expect(before).toEqual(['X']);
            expect(surfaceOf(f).innerHTML).toBe('<div>aX</div>');
            expect(after.map((e) => e.Html)).toEqual(['<div>aX</div>']);
        });

        it('a canceled BeforePaste inserts nothing and fires no AfterPaste', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<div>a</div>');
            const after = capture(f.componentInstance.AfterPaste);
            f.componentInstance.BeforePaste.subscribe((args) => {
                args.Cancel = true;
                args.CancelReason = 'test';
            });
            pasteHtml(f, '<b>X</b>');
            expect(surfaceOf(f).innerHTML).toBe('<div>a</div>');
            expect(after).toEqual([]);
        });

        it('ordinary typing after an uncanceled paste does not fire a second AfterPaste', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<div>a</div>');
            placeCaretAtEnd(surfaceOf(f));
            const after = capture(f.componentInstance.AfterPaste);
            pasteHtml(f, 'X');
            surfaceOf(f).dispatchEvent(new Event('input', { bubbles: true }));
            expect(after).toHaveLength(1);
        });
    });

    describe('trailing line and shortcuts', () => {
        it('a click below a trailing quote adds a line to type on', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<blockquote><div>q</div></blockquote>');
            const surface = surfaceOf(f);
            const last = surface.lastElementChild as HTMLElement;
            vi.spyOn(last, 'getBoundingClientRect').mockReturnValue({ bottom: 40 } as DOMRect);
            const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY: 100 });
            surface.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);
            expect(surface.innerHTML).toBe('<blockquote><div>q</div></blockquote><div><br></div>');
        });

        it('ignores clicks on content, above the last block, or when the last block is plain', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<blockquote><div>q</div></blockquote>');
            const surface = surfaceOf(f);
            const last = surface.lastElementChild as HTMLElement;
            vi.spyOn(last, 'getBoundingClientRect').mockReturnValue({ bottom: 40 } as DOMRect);
            surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY: 10 }));
            (surface.querySelector('div') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY: 100 }));
            expect(surface.innerHTML).toBe('<blockquote><div>q</div></blockquote>');

            f.componentInstance.writeValue('<div>plain</div>');
            surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY: 100 }));
            expect(surface.innerHTML).toBe('<div>plain</div>');
        });

        it('Ctrl/Cmd+K opens the link editor', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<div>ab</div>');
            selectFirstBlock(surfaceOf(f));
            const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
            surfaceOf(f).dispatchEvent(event);
            f.detectChanges();
            expect(event.defaultPrevented).toBe(true);
            expect(query(f, '.mj-rte-link-editor-input')).not.toBeNull();
        });

        it('Ctrl/Cmd+K does nothing without a toolbar', () => {
            const f = renderComponentFixture(RichTextEditorComponent, { inputs: { ShowToolbar: false } });
            const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true });
            surfaceOf(f).dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
        });
    });

    describe('accessibility', () => {
        it('has no axe violations with the default toolbar', async () => {
            const f = renderComponentFixture(RichTextEditorComponent, { inputs: { Placeholder: 'Write…' } });
            await ExpectNoAxeViolations(f);
        });

        it('has no axe violations with the link editor open', async () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            click(f, 'button[data-command="link"]');
            f.detectChanges();
            await ExpectNoAxeViolations(f);
        });
    });

    describe('toolbar integration', () => {
        it('a toolbar click formats the selection and the button reads as pressed', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<div>ab</div>');
            selectFirstBlock(surfaceOf(f));
            click(f, 'button[data-command="bold"]');
            f.detectChanges();
            expect(surfaceOf(f).innerHTML).toBe('<div><b>ab</b></div>');
            expect(query(f, 'button[data-command="bold"]')?.getAttribute('aria-pressed')).toBe('true');
        });

        it('undo is disabled until there is something to undo', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<div>ab</div>');
            expect((query(f, 'button[data-command="undo"]') as HTMLButtonElement).disabled).toBe(true);
            selectFirstBlock(surfaceOf(f));
            click(f, 'button[data-command="italic"]');
            f.detectChanges();
            expect((query(f, 'button[data-command="undo"]') as HTMLButtonElement).disabled).toBe(false);
            click(f, 'button[data-command="undo"]');
            f.detectChanges();
            expect(surfaceOf(f).innerHTML).toBe('<div>ab</div>');
        });

        it('forwards engine events as outputs', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            const undoStates = capture(f.componentInstance.UndoStateChange);
            const paths = capture(f.componentInstance.PathChange);
            f.componentInstance.writeValue('<div>ab</div>');
            selectFirstBlock(surfaceOf(f));
            click(f, 'button[data-command="bold"]');
            expect(undoStates.at(-1)).toEqual({ CanUndo: true, CanRedo: false });
            expect(paths.at(-1)?.Path).toBe('DIV>B');
        });

        it('exposes the engine for hosts that need more', () => {
            const f = renderComponentFixture(RichTextEditorComponent);
            f.componentInstance.writeValue('<div>ab</div>');
            placeCaretAtEnd(surfaceOf(f));
            f.componentInstance.Engine?.InsertPlainText('!');
            expect(f.componentInstance.GetHTML()).toBe('<div>ab!</div>');
        });
    });
});
