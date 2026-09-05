import { describe, it, expect } from 'vitest';
import { cleanTree, removeEmptyInlines } from '../lib/engine/clean/clean-tree';
import { resetNodeCategoryCache } from '../lib/engine/node/category';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

function clean(html: string, options?: Parameters<typeof cleanTree>[1]): string {
    resetNodeCategoryCache();
    const host = parse(html);
    cleanTree(host, options);
    return host.innerHTML;
}

describe('cleanTree', () => {
    describe('discards', () => {
        it('drops head-only elements', () => {
            expect(clean('<meta charset="utf-8"><p>a</p>')).toBe('<p>a</p>');
        });

        it('drops <style> only when asked', () => {
            expect(clean('<style>p{color:red}</style><p>a</p>', { DropStyleElements: true })).toBe('<p>a</p>');
            expect(clean('<style>p{color:red}</style><p>a</p>')).toContain('<style>');
        });

        it('unwraps blacklisted tags to their children', () => {
            // A <div> host, not a <p>: the HTML parser closes a <p> before a <section>,
            // so the nested form would never survive parsing to reach the cleaner.
            expect(clean('<div><section>a</section></div>', { Blacklist: ['section'] })).toBe('<div>a</div>');
        });
    });

    describe('rewriters', () => {
        it('rewrites STRONG to B', () => {
            expect(clean('<p><strong>a</strong></p>')).toBe('<p><b>a</b></p>');
        });

        it('rewrites EM to I', () => {
            expect(clean('<p><em>a</em></p>')).toBe('<p><i>a</i></p>');
        });

        it('keeps attributes when re-tagging', () => {
            expect(clean('<p><strong id="x">a</strong></p>')).toBe('<p><b id="x">a</b></p>');
        });

        it('converts a weight-styled span into a real B', () => {
            // Word and Google Docs emit these instead of semantic tags; without the rewrite
            // the toolbar would read "not bold" over visibly bold text.
            expect(clean('<p><span style="font-weight:bold">a</span></p>')).toBe('<p><b>a</b></p>');
        });

        it('keeps the span\'s other styling when promoting it to B', () => {
            expect(clean('<p><span style="font-weight:700;color:red">a</span></p>')).toBe(
                '<p><b style="color:red">a</b></p>',
            );
        });

        it('leaves a span with no bold weight alone', () => {
            expect(clean('<p><span style="color:red">a</span></p>')).toBe('<p><span style="color:red">a</span></p>');
        });

        it('translates a legacy FONT element into an inline-styled span', () => {
            expect(clean('<p><font color="red" face="Arial">a</font></p>')).toBe(
                '<p><span style="color:red;font-family:Arial">a</span></p>',
            );
        });

        it('accepts a caller-supplied rewriter', () => {
            const out = clean('<p><mark>a</mark></p>', {
                Rewriters: {
                    MARK: (element) => {
                        const span = document.createElement('span');
                        span.textContent = element.textContent;
                        return span;
                    },
                },
            });
            expect(out).toBe('<p><span>a</span></p>');
        });
    });

    describe('whitespace', () => {
        it('prunes whitespace-only text between blocks', () => {
            expect(clean('<div>a</div>\n  <div>b</div>')).toBe('<div>a</div><div>b</div>');
        });

        it('keeps whitespace that separates two inline nodes — it is a real space', () => {
            expect(clean('<p><b>a</b> <i>b</i></p>')).toBe('<p><b>a</b> <i>b</i></p>');
        });

        it('never touches whitespace inside a PRE', () => {
            expect(clean('<pre>a\n  b</pre>')).toBe('<pre>a\n  b</pre>');
        });
    });

    describe('removeEmptyInlines', () => {
        it('removes an empty inline element', () => {
            const host = parse('<p>a<span></span></p>');
            resetNodeCategoryCache();
            removeEmptyInlines(host);
            expect(host.innerHTML).toBe('<p>a</p>');
        });

        it('collapses a nested empty chain in one pass', () => {
            // Post-order: the <i> empties first, which is what makes the <span> eligible.
            const host = parse('<p>a<span><i></i></span></p>');
            resetNodeCategoryCache();
            removeEmptyInlines(host);
            expect(host.innerHTML).toBe('<p>a</p>');
        });

        it('never removes a leaf', () => {
            const host = parse('<p>a<br></p>');
            resetNodeCategoryCache();
            removeEmptyInlines(host);
            expect(host.innerHTML).toBe('<p>a<br></p>');
        });

        it('never removes an empty block', () => {
            const host = parse('<div></div>');
            resetNodeCategoryCache();
            removeEmptyInlines(host);
            expect(host.innerHTML).toBe('<div></div>');
        });
    });
});
