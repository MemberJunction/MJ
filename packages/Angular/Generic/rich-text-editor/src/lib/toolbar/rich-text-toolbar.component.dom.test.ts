import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { click, query, queryAll, renderComponentFixture, typeInto } from '@memberjunction/ng-test-utils';
import { RichTextEngine } from '../engine/editor';
import { RichTextToolbarComponent } from './rich-text-toolbar.component';
import { normalizeHref } from './toolbar-config';

/** An engine over a detached-from-Angular root, selected as described. */
function engineWith(html: string, select: 'all' | 'caret-end' = 'all'): { engine: RichTextEngine; root: HTMLElement } {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const engine = new RichTextEngine(root);
    engine.SetHTML(html);
    const range = document.createRange();
    const block = root.firstElementChild as Element;
    if (select === 'all') {
        range.selectNodeContents(block);
    } else {
        range.setStart(block.lastChild as Node, (block.lastChild as Text).length);
        range.collapse(true);
    }
    engine.SetSelection(range);
    return { engine, root };
}

describe('RichTextToolbarComponent (DOM)', () => {
    let engines: RichTextEngine[] = [];
    beforeEach(() => {
        document.body.innerHTML = '';
    });
    afterEach(() => {
        for (const engine of engines) {
            engine.Destroy();
        }
        engines = [];
    });
    function make(html: string, select: 'all' | 'caret-end' = 'all') {
        const made = engineWith(html, select);
        engines.push(made.engine);
        return made;
    }

    it('renders one button per command with an accessible name and tooltip', () => {
        const { engine } = make('<div>a</div>');
        const f = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: engine, Items: ['bold', 'undo'] } });
        const bold = query(f, 'button[data-command="bold"]') as HTMLButtonElement;
        expect(bold.getAttribute('aria-label')).toBe('Bold');
        expect(bold.getAttribute('title')).toMatch(/^Bold \((⌘|Ctrl)\+B\)$/);
        expect(bold.getAttribute('aria-pressed')).toBe('false');
        // Undo is not a toggle: no pressed state.
        expect(query(f, 'button[data-command="undo"]')?.getAttribute('aria-pressed')).toBeNull();
    });

    it('reflects the selection: pressed state follows the engine', () => {
        const { engine } = make('<div><strong>a</strong></div>');
        const f = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: engine, Items: ['bold', 'italic'] } });
        expect(query(f, 'button[data-command="bold"]')?.getAttribute('aria-pressed')).toBe('true');
        expect(query(f, 'button[data-command="italic"]')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('runs the command on click and keeps the editor selection on mousedown', () => {
        const { engine, root } = make('<div>ab</div>');
        const f = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: engine, Items: ['heading1'] } });
        const button = query(f, 'button[data-command="heading1"]') as HTMLButtonElement;
        const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        button.dispatchEvent(mousedown);
        expect(mousedown.defaultPrevented).toBe(true);
        button.click();
        expect(root.innerHTML).toBe('<h1>ab</h1>');
        f.detectChanges();
        expect(button.getAttribute('aria-pressed')).toBe('true');
    });

    it('disables everything when Disabled or without an engine', () => {
        const { engine } = make('<div>a</div>');
        const disabled = renderComponentFixture(RichTextToolbarComponent, {
            inputs: { Engine: engine, Items: ['bold'], Disabled: true },
        });
        expect((query(disabled, 'button[data-command="bold"]') as HTMLButtonElement).disabled).toBe(true);
        const orphan = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: null, Items: ['bold'] } });
        expect((query(orphan, 'button[data-command="bold"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('is one tab stop with arrow-key navigation', () => {
        const { engine } = make('<div>a</div>');
        const f = renderComponentFixture(RichTextToolbarComponent, {
            inputs: { Engine: engine, Items: ['bold', 'separator', 'italic', 'underline'] },
        });
        const buttons = queryAll(f, 'button[data-command]') as HTMLButtonElement[];
        expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
        buttons[0].focus();
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement).toBe(buttons[1]);
        buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(document.activeElement).toBe(buttons[2]);
        buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement).toBe(buttons[0]);
    });

    describe('link editor', () => {
        it('opens empty for a plain selection and applies a normalized address', () => {
            const { engine, root } = make('<div>ab</div>');
            const f = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: engine, Items: ['link'] } });
            click(f, 'button[data-command="link"]');
            f.detectChanges();
            const input = query(f, '.mj-rte-link-editor-input') as HTMLInputElement;
            expect(input).not.toBeNull();
            expect(input.value).toBe('');
            expect(query(f, '.mj-rte-link-editor button[variant="danger"]')).toBeNull();
            typeInto(f, '.mj-rte-link-editor-input', 'example.com');
            (query(f, '.mj-rte-link-editor') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
            f.detectChanges();
            expect(root.innerHTML).toBe('<div><a href="https://example.com">ab</a></div>');
            expect(query(f, '.mj-rte-link-editor')).toBeNull();
        });

        it('opens with the current address and can remove the link', () => {
            const { engine, root } = make('<div><a href="https://x.y">ab</a></div>', 'caret-end');
            const f = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: engine, Items: ['link'] } });
            expect(query(f, 'button[data-command="link"]')?.getAttribute('aria-pressed')).toBe('true');
            click(f, 'button[data-command="link"]');
            f.detectChanges();
            expect((query(f, '.mj-rte-link-editor-input') as HTMLInputElement).value).toBe('https://x.y');
            const remove = queryAll(f, '.mj-rte-link-editor button').find((b) => b.textContent?.trim() === 'Remove') as HTMLButtonElement;
            remove.click();
            f.detectChanges();
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('cancels on Escape without touching the document', () => {
            const { engine, root } = make('<div>ab</div>');
            const f = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: engine, Items: ['link'] } });
            click(f, 'button[data-command="link"]');
            f.detectChanges();
            (query(f, '.mj-rte-link-editor-input') as HTMLInputElement).dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
            );
            f.detectChanges();
            expect(query(f, '.mj-rte-link-editor')).toBeNull();
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('orders buttons destructive, affirmative, cancel', () => {
            const plain = make('<div>ab</div>');
            const f = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: plain.engine, Items: ['link'] } });
            click(f, 'button[data-command="link"]');
            f.detectChanges();
            expect(queryAll(f, '.mj-rte-link-editor-actions button').map((b) => b.textContent?.trim())).toEqual(['Apply', 'Cancel']);

            const linked = make('<div><a href="https://x.y">ab</a></div>', 'caret-end');
            const g = renderComponentFixture(RichTextToolbarComponent, { inputs: { Engine: linked.engine, Items: ['link'] } });
            click(g, 'button[data-command="link"]');
            g.detectChanges();
            expect(queryAll(g, '.mj-rte-link-editor-actions button').map((b) => b.textContent?.trim())).toEqual(['Remove', 'Apply', 'Cancel']);
        });
    });

    describe('normalizeHref', () => {
        it('adds a scheme to bare hosts and mailto to addresses, keeps the rest', () => {
            expect(normalizeHref(' example.com/x ')).toBe('https://example.com/x');
            expect(normalizeHref('me@example.com')).toBe('mailto:me@example.com');
            expect(normalizeHref('https://a.b')).toBe('https://a.b');
            expect(normalizeHref('mailto:a@b.co')).toBe('mailto:a@b.co');
            expect(normalizeHref('/relative')).toBe('/relative');
            expect(normalizeHref('#anchor')).toBe('#anchor');
            expect(normalizeHref('   ')).toBe('');
        });
    });
});
