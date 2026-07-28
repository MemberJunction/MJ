import { describe, it, expect } from 'vitest';
import { stripMsoArtifacts } from '../lib/engine/clean/mso';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

function strip(html: string): string {
    const host = parse(html);
    stripMsoArtifacts(host);
    return host.innerHTML;
}

describe('mso artifact stripping', () => {
    describe('classes', () => {
        it('removes Mso* class tokens', () => {
            expect(strip('<p class="MsoNormal">a</p>')).toBe('<p>a</p>');
        });

        it('keeps non-Word classes alongside', () => {
            expect(strip('<p class="MsoNormal mine">a</p>')).toBe('<p class="mine">a</p>');
        });

        it('leaves an unrelated class attribute untouched', () => {
            expect(strip('<p class="mine">a</p>')).toBe('<p class="mine">a</p>');
        });
    });

    describe('style declarations', () => {
        it('removes mso-* declarations', () => {
            expect(strip('<p style="mso-spacerun:yes">a</p>')).toBe('<p>a</p>');
        });

        it('keeps real styling in the same attribute', () => {
            expect(strip('<p style="margin:0;mso-spacerun:yes;color:red">a</p>')).toBe(
                '<p style="margin:0;color:red">a</p>',
            );
        });

        it('leaves an attribute with no mso declarations completely alone', () => {
            expect(strip('<p style="margin:0">a</p>')).toBe('<p style="margin:0">a</p>');
        });
    });

    describe('namespaced elements', () => {
        it('unwraps an empty o:p', () => {
            expect(strip('<p>hi<o:p></o:p></p>')).toBe('<p>hi</p>');
        });

        it('unwraps rather than deletes, so wrapped content survives', () => {
            // Deleting the wrapper wholesale would take the user's text with it.
            expect(strip('<p><w:sdt>real text</w:sdt></p>')).toBe('<p>real text</p>');
        });

        it('handles nested namespaced wrappers', () => {
            expect(strip('<p><w:a><v:b>x</v:b></w:a></p>')).toBe('<p>x</p>');
        });
    });

    describe('namespace attributes', () => {
        it('removes xmlns declarations', () => {
            expect(strip('<p xmlns:o="urn:x">a</p>')).toBe('<p>a</p>');
        });

        it('removes prefixed attributes', () => {
            expect(strip('<p v:shape="x">a</p>')).toBe('<p>a</p>');
        });
    });

    it('leaves ordinary markup entirely untouched', () => {
        const html = '<p style="margin:0"><b>bold</b> and <i>italic</i></p>';
        expect(strip(html)).toBe(html);
    });
});
