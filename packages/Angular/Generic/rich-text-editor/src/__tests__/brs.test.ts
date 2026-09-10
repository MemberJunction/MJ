import { describe, it, expect } from 'vitest';
import { cleanupBRs } from '../lib/engine/clean/brs';
import { resetNodeCategoryCache } from '../lib/engine/node/category';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

function run(html: string, policy: 'preserve' | 'normalize'): string {
    resetNodeCategoryCache();
    const host = parse(html);
    cleanupBRs(host, policy);
    return host.innerHTML;
}

describe('cleanupBRs', () => {
    describe("'preserve' — the load path", () => {
        it.each([
            '<div>a<br>b</div>',
            '<div>a<br></div>',
            '<div>a<br><br>b</div>',
            '<div><br></div>',
            '<p>text</p>',
        ])('leaves %s exactly as it was', (html) => {
            // Loaded content is authoritative. A <br> the user never touched must survive
            // byte-for-byte, which is why this policy is a deliberate no-op.
            expect(run(html, 'preserve')).toBe(html);
        });
    });

    describe("'normalize' — the paste path", () => {
        it('splits a block at a line-breaking BR', () => {
            expect(run('<div>a<br>b</div>', 'normalize')).toBe('<div>a</div><div>b</div>');
        });

        it('turns two consecutive BRs into a blank line block', () => {
            expect(run('<div>a<br><br>b</div>', 'normalize')).toBe(
                '<div>a</div><div><br></div><div>b</div>',
            );
        });

        it('drops a redundant trailing BR instead of inventing a blank line', () => {
            // "a<br>" renders as one line; splitting it into a line plus a blank line
            // would add vertical space the author never wrote.
            expect(run('<div>a<br></div>', 'normalize')).toBe('<div>a</div>');
        });

        it('keeps the filler in a genuinely empty block', () => {
            expect(run('<div><br></div>', 'normalize')).toBe('<div><br></div>');
        });

        it('preserves the tag and attributes of the block it splits', () => {
            expect(run('<p style="margin:0">a<br>b</p>', 'normalize')).toBe(
                '<p style="margin:0">a</p><p style="margin:0">b</p>',
            );
        });

        it('carries inline formatting into the split blocks', () => {
            expect(run('<div><b>a</b><br><i>b</i></div>', 'normalize')).toBe(
                '<div><b>a</b></div><div><i>b</i></div>',
            );
        });

        it('leaves a block with no BRs alone', () => {
            expect(run('<div>plain</div>', 'normalize')).toBe('<div>plain</div>');
        });

        it('handles several blocks in one pass', () => {
            expect(run('<div>a<br>b</div><div>c<br>d</div>', 'normalize')).toBe(
                '<div>a</div><div>b</div><div>c</div><div>d</div>',
            );
        });
    });
});
