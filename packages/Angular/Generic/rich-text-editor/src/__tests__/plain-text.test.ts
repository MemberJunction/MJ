import { describe, it, expect } from 'vitest';
import { ZERO_WIDTH_SPACE as ZWS } from '../lib/engine/constants';
import { fragmentToPlainText, plainTextToHtml } from '../lib/engine/clipboard/plain-text';
import { findLinks, findTrailingLink } from '../lib/engine/format/links';
import { DEFAULT_BLOCK_SPEC } from '../lib/engine/node/block';

function element(html: string): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

describe('plain text', () => {
    describe('fragmentToPlainText', () => {
        it('turns blocks into lines and <br> into newlines', () => {
            expect(fragmentToPlainText(element('<div>a</div><div>b<br>c</div>'))).toBe('a\nb\nc');
        });

        it('flattens inline formatting and drops ballast', () => {
            expect(fragmentToPlainText(element(`<div><b>a</b>${ZWS}<i>b</i></div>`))).toBe('ab');
        });

        it('keeps a blank line for an empty block but never more than one', () => {
            expect(fragmentToPlainText(element('<div>a</div><div><br></div><div><br></div><div>b</div>'))).toBe('a\n\nb');
        });

        it('handles nested containers', () => {
            expect(fragmentToPlainText(element('<blockquote><div>q</div></blockquote><ul><li>x</li><li>y</li></ul>'))).toBe('q\nx\ny');
        });
    });

    describe('plainTextToHtml', () => {
        it('wraps each line in the default block, blank lines as filler blocks', () => {
            expect(plainTextToHtml('a\n\nb', DEFAULT_BLOCK_SPEC, false)).toBe('<div>a</div><div><br></div><div>b</div>');
        });

        it('normalizes Windows line endings', () => {
            expect(plainTextToHtml('a\r\nb', DEFAULT_BLOCK_SPEC, false)).toBe('<div>a</div><div>b</div>');
        });

        it('escapes markup characters', () => {
            expect(plainTextToHtml('<b>&</b>', DEFAULT_BLOCK_SPEC, false)).toBe('<div>&lt;b&gt;&amp;&lt;/b&gt;</div>');
        });

        it('keeps leading, trailing, and doubled spaces', () => {
            expect(plainTextToHtml(' a  b ', DEFAULT_BLOCK_SPEC, false)).toBe('<div> a  b </div>');
        });

        it('applies configured block attributes', () => {
            expect(plainTextToHtml('a', { Tag: 'P', Attributes: { style: 'margin:0' } }, false)).toBe('<p style="margin:0">a</p>');
        });

        it('links addresses when asked', () => {
            expect(plainTextToHtml('see https://x.y/z, or www.q.r.', DEFAULT_BLOCK_SPEC, true)).toBe(
                '<div>see <a href="https://x.y/z">https://x.y/z</a>, or <a href="http://www.q.r">www.q.r</a>.</div>',
            );
        });

        it('escapes inside link text and href', () => {
            expect(plainTextToHtml('https://x.y/?a=1&b="2"', DEFAULT_BLOCK_SPEC, true)).toBe(
                '<div><a href="https://x.y/?a=1&amp;b=">https://x.y/?a=1&amp;b=</a>"2"</div>',
            );
        });
    });

    describe('link matching', () => {
        it('finds every address in a line', () => {
            const links = findLinks('a https://b.c d me@f.gh e');
            expect(links.map((link) => link.Text)).toEqual(['https://b.c', 'me@f.gh']);
            expect(links[1].Href).toBe('mailto:me@f.gh');
        });

        it('only matches a trailing address at the very end', () => {
            expect(findTrailingLink('go to www.a.b')?.Href).toBe('http://www.a.b');
            expect(findTrailingLink('www.a.b then')).toBeNull();
            expect(findTrailingLink('plain')).toBeNull();
        });

        it('drops trailing punctuation but keeps interior punctuation', () => {
            expect(findTrailingLink('https://a.b/c.d?e=f).')?.Text).toBe('https://a.b/c.d?e=f');
        });
    });
});
