import { describe, it, expect, beforeEach } from 'vitest';
import { getHTML, setHTML } from '../lib/engine/html';
import { resetNodeCategoryCache } from '../lib/engine/node/category';
import { ZERO_WIDTH_SPACE } from '../lib/engine/constants';
import { RichTextEditorConfig } from '../lib/rich-text-editor.types';

function createRoot(): HTMLElement {
    const root = document.createElement('div');
    document.body.appendChild(root);
    return root;
}

function load(root: HTMLElement, html: string, config: RichTextEditorConfig = {}): void {
    setHTML(root, html, { Config: config });
}

describe('SetHTML / GetHTML', () => {
    beforeEach(() => {
        resetNodeCategoryCache();
        document.body.innerHTML = '';
    });

    describe('SetHTML', () => {
        it('replaces existing content', () => {
            const root = createRoot();
            load(root, '<div>first</div>');
            load(root, '<div>second</div>');
            expect(getHTML(root)).toBe('<div>second</div>');
        });

        it('wraps loose inline content so the root holds blocks', () => {
            const root = createRoot();
            load(root, 'bare text');
            expect(getHTML(root)).toBe('<div>bare text</div>');
        });

        it('gives empty input a block to type into', () => {
            const root = createRoot();
            load(root, '');
            expect(getHTML(root)).toBe('<div><br></div>');
        });

        it('handles null input', () => {
            const root = createRoot();
            setHTML(root, null, { Config: {} });
            expect(getHTML(root)).toBe('<div><br></div>');
        });

        it('honours a custom block tag when wrapping', () => {
            const root = createRoot();
            setHTML(root, 'bare', { Config: {}, BlockSpec: { Tag: 'P', Attributes: { style: 'margin:0' } } });
            expect(getHTML(root)).toBe('<p style="margin:0">bare</p>');
        });

        it('does not add fillers to existing empty blocks', () => {
            // The load path never sweeps. An empty block the author wrote stays empty.
            const root = createRoot();
            load(root, '<div></div><div>a</div>');
            expect(getHTML(root)).toBe('<div></div><div>a</div>');
        });

        it('does not rewrite semantic tags on load', () => {
            const root = createRoot();
            load(root, '<div><strong>a</strong><em>b</em></div>');
            expect(getHTML(root)).toBe('<div><strong>a</strong><em>b</em></div>');
        });
    });

    describe('GetHTML', () => {
        it('strips zero-width spaces', () => {
            const root = createRoot();
            load(root, '<div>a</div>');
            const block = root.firstElementChild as HTMLElement;
            block.appendChild(document.createTextNode(ZERO_WIDTH_SPACE));
            expect(getHTML(root)).toBe('<div>a</div>');
        });

        it('removes a text node left empty by the strip', () => {
            const root = createRoot();
            load(root, '<div>a</div>');
            const block = root.firstElementChild as HTMLElement;
            block.appendChild(document.createTextNode(ZERO_WIDTH_SPACE));
            expect(block.childNodes).toHaveLength(2);
            // The live DOM keeps its ballast; only the serialized copy is cleaned.
            expect(getHTML(root)).toBe('<div>a</div>');
            expect(block.childNodes).toHaveLength(2);
        });

        it('never mutates the live document', () => {
            // Stripping ZWS in place would move the caret out from under the user.
            const root = createRoot();
            load(root, '<div>a</div>');
            const block = root.firstElementChild as HTMLElement;
            const ballast = document.createTextNode(`${ZERO_WIDTH_SPACE}b`);
            block.appendChild(ballast);

            getHTML(root);

            expect(ballast.data).toBe(`${ZERO_WIDTH_SPACE}b`);
        });

        it('keeps filler BRs, which are the blank-line product requirement', () => {
            const root = createRoot();
            load(root, '<div>a</div><div><br></div><div>b</div>');
            expect(getHTML(root)).toBe('<div>a</div><div><br></div><div>b</div>');
        });

        it('returns an empty string for an empty root', () => {
            const root = createRoot();
            expect(getHTML(root)).toBe('');
        });
    });

    describe('profiles', () => {
        it('keeps comments under the email profile', () => {
            const root = createRoot();
            load(root, '<div>a</div><!--note-->', { SanitizeProfile: 'email' });
            expect(getHTML(root)).toContain('<!--note-->');
        });

        it('drops comments under the strict profile', () => {
            const root = createRoot();
            load(root, '<div>a</div><!--note-->', { SanitizeProfile: 'strict' });
            expect(getHTML(root)).toBe('<div>a</div>');
        });

        it('defaults to strict', () => {
            const root = createRoot();
            load(root, '<div>a</div><!--note-->');
            expect(getHTML(root)).toBe('<div>a</div>');
        });
    });
});
