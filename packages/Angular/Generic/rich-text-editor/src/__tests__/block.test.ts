import { describe, it, expect, beforeEach } from 'vitest';
import {
    createDefaultBlock,
    fixContainer,
    fixCursor,
    getClosestBlock,
    getNextBlock,
    getPreviousBlock,
    isEmptyBlock,
} from '../lib/engine/node/block';
import { resetNodeCategoryCache } from '../lib/engine/node/category';
import { ZERO_WIDTH_SPACE } from '../lib/engine/constants';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

describe('block invariants', () => {
    beforeEach(() => {
        resetNodeCategoryCache();
    });

    describe('createDefaultBlock', () => {
        it('defaults to a DIV', () => {
            expect(createDefaultBlock(document).outerHTML).toBe('<div></div>');
        });

        it('honours a custom tag and attributes', () => {
            const block = createDefaultBlock(document, { Tag: 'P', Attributes: { style: 'margin:0' } });
            expect(block.outerHTML).toBe('<p style="margin:0"></p>');
        });
    });

    describe('fixCursor — the blank-line guarantee', () => {
        it('gives an empty block a filler BR', () => {
            const block = parse('<div></div>').firstElementChild as HTMLElement;
            fixCursor(block);
            expect(block.outerHTML).toBe('<div><br></div>');
        });

        it('leaves a block that already has content alone', () => {
            const block = parse('<div>text</div>').firstElementChild as HTMLElement;
            fixCursor(block);
            expect(block.outerHTML).toBe('<div>text</div>');
        });

        it('does not add a second BR to a block that already has one', () => {
            const block = parse('<div><br></div>').firstElementChild as HTMLElement;
            fixCursor(block);
            expect(block.outerHTML).toBe('<div><br></div>');
        });

        it('leaves a block holding only an image alone — an IMG renders', () => {
            const block = parse('<div><img src="x.png"></div>').firstElementChild as HTMLElement;
            fixCursor(block);
            expect(block.querySelectorAll('br')).toHaveLength(0);
        });

        it('leaves a whitespace-only block alone rather than changing untouched content', () => {
            const block = parse('<div> </div>').firstElementChild as HTMLElement;
            fixCursor(block);
            expect(block.outerHTML).toBe('<div> </div>');
        });

        it('gives an empty inline element a zero-width space so the caret can enter', () => {
            const inline = parse('<b></b>').firstElementChild as HTMLElement;
            fixCursor(inline);
            expect(inline.textContent).toBe(ZERO_WIDTH_SPACE);
        });

        it('leaves a non-empty inline element alone', () => {
            const inline = parse('<b>x</b>').firstElementChild as HTMLElement;
            fixCursor(inline);
            expect(inline.outerHTML).toBe('<b>x</b>');
        });

        it('never adds children to a leaf', () => {
            const leaf = parse('<br>').firstElementChild as HTMLElement;
            fixCursor(leaf);
            expect(leaf.childNodes).toHaveLength(0);
        });

        it('returns text nodes untouched', () => {
            const text = document.createTextNode('x');
            expect(fixCursor(text)).toBe(text);
            expect(text.data).toBe('x');
        });
    });

    describe('isEmptyBlock', () => {
        it('is true for a block with nothing in it', () => {
            expect(isEmptyBlock(parse('<div></div>').firstElementChild as Node)).toBe(true);
        });

        it.each(['<div><br></div>', '<div><img src="x"></div>', '<div>text</div>', '<div> </div>'])(
            'is false for %s',
            (html) => {
                expect(isEmptyBlock(parse(html).firstElementChild as Node)).toBe(false);
            },
        );
    });

    describe('fixContainer', () => {
        it('wraps a run of loose inline children in a default block', () => {
            const container = parse('text <b>bold</b><div>block</div>');
            fixContainer(container);
            expect(container.innerHTML).toBe('<div>text <b>bold</b></div><div>block</div>');
        });

        it('wraps trailing inline children too', () => {
            const container = parse('<div>block</div>trailing');
            fixContainer(container);
            expect(container.innerHTML).toBe('<div>block</div><div>trailing</div>');
        });

        it('turns a BR loose among blocks into its own blank-line block', () => {
            const container = parse('<div>a</div><br><div>b</div>');
            fixContainer(container);
            expect(container.innerHTML).toBe('<div>a</div><div><br></div><div>b</div>');
        });

        it('leaves an all-blocks container completely alone', () => {
            const html = '<div>a</div><div>b</div>';
            const container = parse(html);
            fixContainer(container);
            expect(container.innerHTML).toBe(html);
        });

        it('does NOT touch existing empty blocks — that would rewrite untouched content', () => {
            // The fidelity contract. A load-time sweep adding fillers everywhere is exactly
            // what this editor refuses to do.
            const html = '<div></div><div>a</div>';
            const container = parse(html);
            fixContainer(container);
            expect(container.innerHTML).toBe(html);
        });

        it('leaves a standalone comment between blocks exactly where it is', () => {
            // Wrapping it would give the wrapper a filler <br> and insert a visible blank
            // line — a rendering change to content nobody edited.
            const html = '<div>a</div><!--[if mso]>x<![endif]--><div>b</div>';
            const container = parse(html);
            fixContainer(container);
            expect(container.innerHTML).toBe(html);
        });

        it('lets a comment join a wrapper that inline content already opened', () => {
            const container = parse('text<!--c-->more<div>block</div>');
            fixContainer(container);
            expect(container.innerHTML).toBe('<div>text<!--c-->more</div><div>block</div>');
        });

        it('recurses into nested containers', () => {
            const container = parse('<blockquote>loose<div>block</div></blockquote>');
            fixContainer(container);
            expect(container.innerHTML).toBe('<blockquote><div>loose</div><div>block</div></blockquote>');
        });

        it('honours a custom block spec', () => {
            const container = parse('loose<div>block</div>');
            fixContainer(container, { Tag: 'P', Attributes: { style: 'margin:0' } });
            expect(container.innerHTML).toBe('<p style="margin:0">loose</p><div>block</div>');
        });

        describe('skip contexts', () => {
            it('never wraps inside a table row', () => {
                const row = parse('<table><tr><td>cell</td></tr></table>').querySelector('tr') as HTMLElement;
                const before = row.innerHTML;
                fixContainer(row);
                expect(row.innerHTML).toBe(before);
            });

            it('never wraps a list element', () => {
                const list = parse('<ul><li>a</li></ul>').querySelector('ul') as HTMLElement;
                const before = list.innerHTML;
                fixContainer(list);
                expect(list.innerHTML).toBe(before);
            });

            it('never restructures a P, whose loose inline content is already valid', () => {
                const paragraph = parse('<p>text <b>bold</b></p>').querySelector('p') as HTMLElement;
                const before = paragraph.innerHTML;
                fixContainer(paragraph);
                expect(paragraph.innerHTML).toBe(before);
            });

            it('never restructures a PRE, where whitespace is significant', () => {
                const pre = parse('<pre>a\n  b</pre>').querySelector('pre') as HTMLElement;
                const before = pre.innerHTML;
                fixContainer(pre);
                expect(pre.innerHTML).toBe(before);
            });

            it('leaves a table inside a container untouched while fixing around it', () => {
                const container = parse('loose<table><tr><td></td></tr></table>');
                fixContainer(container);
                expect(container.querySelector('td')?.innerHTML).toBe('');
                expect(container.firstElementChild?.nodeName).toBe('DIV');
            });
        });
    });

    describe('block navigation', () => {
        it('getClosestBlock climbs from a text node to its block', () => {
            const root = parse('<div><b>x</b></div>');
            const text = root.querySelector('b')?.firstChild as Node;
            expect(getClosestBlock(text, root)).toBe(root.querySelector('div'));
        });

        it('getClosestBlock returns null when the root is reached first', () => {
            const root = parse('loose');
            expect(getClosestBlock(root.firstChild, root)).toBeNull();
        });

        it('getNextBlock walks forward across blocks', () => {
            const root = parse('<div>a</div><div>b</div><div>c</div>');
            const first = root.children[0];
            expect(getNextBlock(first, root)).toBe(root.children[1]);
        });

        it('getNextBlock returns null past the last block', () => {
            const root = parse('<div>a</div>');
            expect(getNextBlock(root.children[0], root)).toBeNull();
        });

        it('getPreviousBlock walks backward across blocks', () => {
            const root = parse('<div>a</div><div>b</div>');
            expect(getPreviousBlock(root.children[1], root)).toBe(root.children[0]);
        });

        it('descends into containers when walking blocks', () => {
            const root = parse('<blockquote><div>a</div></blockquote><div>b</div>');
            const inner = root.querySelector('blockquote div') as Element;
            expect(getNextBlock(inner, root)).toBe(root.children[1]);
        });
    });
});
