import { describe, it, expect } from 'vitest';
import { capture, click, query, queryAll, renderComponentFixture, typeInto } from '@memberjunction/ng-test-utils';
import { RichTextLinkEditorComponent } from './rich-text-link-editor.component';

/**
 * DOM spec for <mj-rich-text-link-editor>: the inline popover on its own, apart from the
 * toolbar that hosts it. Covers prefill, focus on open, address normalization on Apply,
 * what a blank address means, Remove/Cancel/Escape, and MJ's button order.
 */
function submit(f: { nativeElement: HTMLElement }): void {
    (f.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('RichTextLinkEditorComponent (DOM)', () => {
    it('renders a labelled input, prefilled with the current address, and focuses it', () => {
        const f = renderComponentFixture(RichTextLinkEditorComponent, { inputs: { InitialHref: 'https://x.y', HasExistingLink: true } });
        const input = query(f, '.mj-rte-link-editor-input') as HTMLInputElement;
        expect(input.value).toBe('https://x.y');
        expect(document.activeElement).toBe(input);
        const label = query(f, 'label') as HTMLLabelElement;
        expect(label.getAttribute('for')).toBe(input.id);
        expect(query(f, 'form')?.getAttribute('aria-labelledby')).toBe(label.id);
    });

    it('applies a normalized address on submit', () => {
        const f = renderComponentFixture(RichTextLinkEditorComponent);
        const applied = capture(f.componentInstance.Apply);
        typeInto(f, '.mj-rte-link-editor-input', 'example.com/path');
        submit(f);
        expect(applied).toEqual(['https://example.com/path']);
    });

    it('treats a blank address as Remove when linked, and as Cancel when not', () => {
        const linked = renderComponentFixture(RichTextLinkEditorComponent, { inputs: { InitialHref: 'https://x.y', HasExistingLink: true } });
        const removed = capture(linked.componentInstance.Remove);
        typeInto(linked, '.mj-rte-link-editor-input', '   ');
        submit(linked);
        expect(removed).toHaveLength(1);

        const plain = renderComponentFixture(RichTextLinkEditorComponent);
        const canceled = capture(plain.componentInstance.Cancel);
        const applied = capture(plain.componentInstance.Apply);
        submit(plain);
        expect(canceled).toHaveLength(1);
        expect(applied).toEqual([]);
    });

    it('shows Remove only for an existing link, and orders buttons Remove, Apply, Cancel', () => {
        const plain = renderComponentFixture(RichTextLinkEditorComponent);
        expect(queryAll(plain, '.mj-rte-link-editor-actions button').map((b) => b.textContent?.trim())).toEqual(['Apply', 'Cancel']);

        const linked = renderComponentFixture(RichTextLinkEditorComponent, { inputs: { InitialHref: 'https://x.y', HasExistingLink: true } });
        expect(queryAll(linked, '.mj-rte-link-editor-actions button').map((b) => b.textContent?.trim())).toEqual(['Remove', 'Apply', 'Cancel']);
        const removed = capture(linked.componentInstance.Remove);
        (queryAll(linked, '.mj-rte-link-editor-actions button')[0] as HTMLButtonElement).click();
        expect(removed).toHaveLength(1);
    });

    it('cancels on the Cancel button and on Escape', () => {
        const f = renderComponentFixture(RichTextLinkEditorComponent);
        const canceled = capture(f.componentInstance.Cancel);
        click(f, '.mj-rte-link-editor-actions button:last-child');
        (query(f, '.mj-rte-link-editor-input') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(canceled).toHaveLength(2);
    });
});
