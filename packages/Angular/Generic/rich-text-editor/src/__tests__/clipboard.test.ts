import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClipboardDataLike, ClipboardEventLike, handleCopy, handleCut, handleDrop, handlePaste } from '../lib/engine/clipboard/clipboard';
import { RichTextEngine } from '../lib/engine/editor';
import { createRoot, htmlWithSelection, loadWithSelection } from './support/editor-harness';

/** jsdom has no DataTransfer; this is the slice the handlers use. */
class FakeClipboardData implements ClipboardDataLike {
    public readonly written = new Map<string, string>();
    public files: File[] = [];
    constructor(private readonly available: Record<string, string> = {}) {}
    get types(): string[] {
        return Object.keys(this.available);
    }
    getData(format: string): string {
        return this.available[format] ?? '';
    }
    setData(format: string, data: string): void {
        this.written.set(format, data);
    }
}

function clipboardEvent(type: string, data: FakeClipboardData | null): ClipboardEventLike & { clipboardData: FakeClipboardData | null } {
    const event = new Event(type, { bubbles: true, cancelable: true }) as Event & { clipboardData: FakeClipboardData | null };
    Object.defineProperty(event, 'clipboardData', { value: data });
    return event as ClipboardEventLike & { clipboardData: FakeClipboardData | null };
}

function dropEvent(data: FakeClipboardData | null): ClipboardEventLike & { dataTransfer: FakeClipboardData | null } {
    const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: FakeClipboardData | null };
    Object.defineProperty(event, 'dataTransfer', { value: data });
    return event as ClipboardEventLike & { dataTransfer: FakeClipboardData | null };
}

function makeEngine(html: string): { engine: RichTextEngine; root: HTMLElement } {
    const root = createRoot();
    const range = loadWithSelection(root, html);
    const engine = new RichTextEngine(root);
    engine.SetSelection(range);
    return { engine, root };
}

const imageFile = () => new File(['x'], 'pic.png', { type: 'image/png' });

describe('clipboard', () => {
    let engines: RichTextEngine[] = [];
    beforeEach(() => {
        document.body.innerHTML = '';
        for (const engine of engines) {
            engine.Destroy();
        }
        engines = [];
    });
    function make(html: string) {
        const made = makeEngine(html);
        engines.push(made.engine);
        return made;
    }

    describe('copy', () => {
        it('writes HTML with its inline context and plain text', () => {
            const { engine } = make('<div>a<b>b[cd]e</b>f</div>');
            const data = new FakeClipboardData();
            const event = clipboardEvent('copy', data);
            expect(handleCopy(engine, event)).toBe(true);
            expect(event.defaultPrevented).toBe(true);
            expect(data.written.get('text/html')).toBe('<b>cd</b>');
            expect(data.written.get('text/plain')).toBe('cd');
        });

        it('carries block context when the selection spans blocks', () => {
            const { engine } = make('<blockquote><div>a[b</div><div>c]d</div></blockquote>');
            const data = new FakeClipboardData();
            handleCopy(engine, clipboardEvent('copy', data));
            expect(data.written.get('text/html')).toBe('<blockquote><div>b</div><div>c</div></blockquote>');
            expect(data.written.get('text/plain')).toBe('b\nc');
        });

        it('does nothing for a collapsed selection', () => {
            const { engine } = make('<div>a|b</div>');
            const event = clipboardEvent('copy', new FakeClipboardData());
            expect(handleCopy(engine, event)).toBe(false);
            expect(event.defaultPrevented).toBe(false);
        });

        it('lets WillCutCopy rewrite the HTML', () => {
            const root = createRoot();
            const range = loadWithSelection(root, '<div>[ab]</div>');
            const engine = new RichTextEngine(root, { WillCutCopy: (html) => `<!-- x -->${html}` });
            engines.push(engine);
            engine.SetSelection(range);
            const data = new FakeClipboardData();
            handleCopy(engine, clipboardEvent('copy', data));
            expect(data.written.get('text/html')).toBe('<!-- x -->ab');
        });
    });

    describe('cut', () => {
        it('writes the selection and removes it through the engine', () => {
            const { engine, root } = make('<div>a[b</div><div>c]d</div>');
            const data = new FakeClipboardData();
            const event = clipboardEvent('cut', data);
            expect(handleCut(engine, event)).toBe(true);
            expect(data.written.get('text/html')).toBe('<div>b</div><div>c</div>');
            expect(htmlWithSelection(root, engine.GetSelection())).toBe('<div>a|d</div>');
            expect(engine.CanUndo).toBe(true);
        });

        it('consumes a collapsed cut without changing anything', () => {
            const { engine, root } = make('<div>a|b</div>');
            const event = clipboardEvent('cut', new FakeClipboardData());
            expect(handleCut(engine, event)).toBe(true);
            expect(event.defaultPrevented).toBe(true);
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('leaves the cut to the browser when there is no clipboard data to write', () => {
            const { engine } = make('<div>[ab]</div>');
            expect(handleCut(engine, clipboardEvent('cut', null))).toBe(false);
        });
    });

    describe('paste', () => {
        it('sanitizes and merges pasted HTML', () => {
            const { engine, root } = make('<div>hel|lo</div>');
            const data = new FakeClipboardData({ 'text/html': '<p onclick="x()">X<script>1</script></p><p>Y</p>' });
            const event = clipboardEvent('paste', data);
            expect(handlePaste(engine, event, false)).toBe(true);
            expect(event.defaultPrevented).toBe(true);
            expect(root.innerHTML).toBe('<div>helX</div><p>Ylo</p>');
        });

        it('strips Word artifacts on paste', () => {
            const { engine, root } = make('<div>|</div>');
            const html = '<p class="MsoNormal" style="mso-margin:0;color:red"><o:p>x</o:p></p>';
            handlePaste(engine, clipboardEvent('paste', new FakeClipboardData({ 'text/html': html })), false);
            expect(root.innerHTML).toBe('<p style="color:red">x</p>');
        });

        it('falls back to plain text, one block per line, with links', () => {
            const { engine, root } = make('<div>a|</div>');
            const data = new FakeClipboardData({ 'text/plain': 'x\nsee https://q.r' });
            handlePaste(engine, clipboardEvent('paste', data), false);
            expect(root.innerHTML).toBe('<div>ax</div><div>see <a href="https://q.r">https://q.r</a></div>');
        });

        it('uses plain text when asked, even if HTML is present', () => {
            const { engine, root } = make('<div>|</div>');
            const data = new FakeClipboardData({ 'text/html': '<b>x</b>', 'text/plain': 'x' });
            handlePaste(engine, clipboardEvent('paste', data), true);
            expect(root.innerHTML).toBe('<div>x</div>');
        });

        it('fires willPaste and honours Cancel', () => {
            const { engine, root } = make('<div>|</div>');
            const seen = vi.fn();
            engine.On('willPaste', (event) => {
                seen(event.Fragment.textContent);
                event.Cancel = true;
            });
            handlePaste(engine, clipboardEvent('paste', new FakeClipboardData({ 'text/html': '<b>nope</b>' })), false);
            expect(seen).toHaveBeenCalledWith('nope');
            expect(root.innerHTML).toBe('<div></div>');
        });

        it('lets willPaste amend the fragment', () => {
            const { engine, root } = make('<div>|</div>');
            engine.On('willPaste', (event) => {
                for (const bold of Array.from(event.Fragment.querySelectorAll('b'))) {
                    bold.replaceWith(...Array.from(bold.childNodes));
                }
            });
            handlePaste(engine, clipboardEvent('paste', new FakeClipboardData({ 'text/html': '<b>x</b>' })), false);
            expect(root.innerHTML).toBe('<div>x</div>');
        });

        it('hands an image with no HTML to the host', () => {
            const { engine, root } = make('<div>|</div>');
            const images = vi.fn();
            engine.On('pasteImage', (event) => images(event.File.name));
            const data = new FakeClipboardData();
            data.files = [imageFile()];
            handlePaste(engine, clipboardEvent('paste', data), false);
            expect(images).toHaveBeenCalledWith('pic.png');
            expect(root.innerHTML).toBe('<div></div>');
        });

        it('prefers HTML over an image when both arrive (Word)', () => {
            const { engine, root } = make('<div>|</div>');
            const images = vi.fn();
            engine.On('pasteImage', images);
            const data = new FakeClipboardData({ 'text/html': '<p>x</p>' });
            data.files = [imageFile()];
            handlePaste(engine, clipboardEvent('paste', data), false);
            expect(images).not.toHaveBeenCalled();
            expect(root.innerHTML).toBe('<p>x</p>');
        });

        it('leaves a paste with no clipboard data to the browser', () => {
            const { engine } = make('<div>|</div>');
            expect(handlePaste(engine, clipboardEvent('paste', null), false)).toBe(false);
        });

        it('pastes into a <pre> as verbatim text', () => {
            const { engine, root } = make('<pre>a|b</pre>');
            handlePaste(engine, clipboardEvent('paste', new FakeClipboardData({ 'text/plain': 'x\ny' })), false);
            expect(root.innerHTML).toBe('<pre>ax\nyb</pre>');
        });
    });

    describe('drop', () => {
        it('inserts dropped HTML at the selection when the drop point is unknown', () => {
            const { engine, root } = make('<div>a|b</div>');
            const event = dropEvent(new FakeClipboardData({ 'text/html': '<b>X</b>' }));
            expect(handleDrop(engine, event, false)).toBe(true);
            expect(root.innerHTML).toBe('<div>a<b>X</b>b</div>');
        });

        it('leaves an internal drag to the browser', () => {
            const { engine, root } = make('<div>a|b</div>');
            const event = dropEvent(new FakeClipboardData({ 'text/html': '<b>X</b>' }));
            expect(handleDrop(engine, event, true)).toBe(false);
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('hands a dropped image file to the host', () => {
            const { engine } = make('<div>|</div>');
            const images = vi.fn();
            engine.On('pasteImage', images);
            const data = new FakeClipboardData();
            data.files = [imageFile()];
            expect(handleDrop(engine, dropEvent(data), false)).toBe(true);
            expect(images).toHaveBeenCalled();
        });

        it('ignores drops carrying nothing it understands', () => {
            const { engine } = make('<div>|</div>');
            expect(handleDrop(engine, dropEvent(new FakeClipboardData()), false)).toBe(false);
        });
    });

    describe('through the engine listeners', () => {
        it('paste via a DOM event inserts content', () => {
            const { root } = make('<div>a|</div>');
            root.dispatchEvent(clipboardEvent('paste', new FakeClipboardData({ 'text/plain': 'x' })));
            expect(root.innerHTML).toBe('<div>ax</div>');
        });

        it('Ctrl+Shift+V flags the next paste as plain text', () => {
            const { root } = make('<div>|</div>');
            root.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
            root.dispatchEvent(clipboardEvent('paste', new FakeClipboardData({ 'text/html': '<b>x</b>', 'text/plain': 'x' })));
            expect(root.innerHTML).toBe('<div>x</div>');
            // The flag is consumed: the next paste is HTML again.
            root.dispatchEvent(clipboardEvent('paste', new FakeClipboardData({ 'text/html': '<b>y</b>', 'text/plain': 'y' })));
            expect(root.innerHTML).toBe('<div>x<b>y</b></div>');
        });

        it('copy via a DOM event writes the clipboard', () => {
            const { root } = make('<div>[ab]</div>');
            const data = new FakeClipboardData();
            root.dispatchEvent(clipboardEvent('copy', data));
            expect(data.written.get('text/plain')).toBe('ab');
        });
    });
});
