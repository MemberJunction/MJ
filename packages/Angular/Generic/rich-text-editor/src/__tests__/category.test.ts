import { describe, it, expect, beforeEach } from 'vitest';
import {
    getNodeCategory,
    isBlock,
    isContainer,
    isInline,
    isLeaf,
    resetNodeCategoryCache,
} from '../lib/engine/node/category';

/** Parse a fragment of HTML and hand back the single root element. */
function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild as HTMLElement;
}

describe('node category', () => {
    beforeEach(() => {
        resetNodeCategoryCache();
    });

    describe('getNodeCategory', () => {
        it('treats text nodes as inline', () => {
            expect(getNodeCategory(document.createTextNode('hello'))).toBe('inline');
        });

        it('treats comment nodes as inline', () => {
            // Deliberately unlike the reference implementation. See the note in category.ts:
            // a block-classified comment would make ordinary comment-bearing email markup
            // classify as a container, and fixContainer would then restructure it.
            expect(getNodeCategory(document.createComment('[if mso]'))).toBe('inline');
        });

        it('classifies an element holding only inline content as a block', () => {
            expect(getNodeCategory(parse('<div>text <b>bold</b></div>'))).toBe('block');
        });

        it('classifies an element holding a block child as a container', () => {
            expect(getNodeCategory(parse('<div><div>inner</div></div>'))).toBe('container');
        });

        it('classifies by content, not by tag — a blockquote is either', () => {
            expect(getNodeCategory(parse('<blockquote>quoted text</blockquote>'))).toBe('block');
            expect(getNodeCategory(parse('<blockquote><div>quoted</div></blockquote>'))).toBe('container');
        });

        it('classifies an inline-tagged element as inline', () => {
            expect(getNodeCategory(parse('<span>text</span>'))).toBe('inline');
            expect(getNodeCategory(parse('<b>text</b>'))).toBe('inline');
        });

        it('treats an empty block-tagged element as a block, so it can receive a filler BR', () => {
            expect(getNodeCategory(parse('<div></div>'))).toBe('block');
        });

        it('treats an empty inline-tagged element as inline', () => {
            expect(getNodeCategory(parse('<span></span>'))).toBe('inline');
        });

        it('does not let a comment force its parent to become a container', () => {
            // The fidelity case: an Outlook conditional inside an otherwise ordinary block.
            const block = parse('<div>text<!--[if mso]>x<![endif]--></div>');
            expect(getNodeCategory(block)).toBe('block');
        });

        it('classifies a fragment of blocks as a container', () => {
            const fragment = document.createDocumentFragment();
            fragment.appendChild(parse('<div>a</div>'));
            fragment.appendChild(parse('<div>b</div>'));
            expect(getNodeCategory(fragment)).toBe('container');
        });
    });

    describe('cache invalidation', () => {
        it('reflects a structural change once the cache is reset', () => {
            const node = parse('<div>text</div>');
            expect(isBlock(node)).toBe(true);

            node.appendChild(parse('<div>now nested</div>'));
            resetNodeCategoryCache();

            expect(isContainer(node)).toBe(true);
        });

        it('returns the stale answer if the cache is NOT reset — the reason resets are mandatory', () => {
            const node = parse('<div>text</div>');
            expect(isBlock(node)).toBe(true);

            node.appendChild(parse('<div>now nested</div>'));
            // No reset on purpose: this documents why every mutation path must call it.
            expect(isBlock(node)).toBe(true);
        });
    });

    describe('isLeaf', () => {
        it.each(['<br>', '<hr>', '<img src="x.png">', '<input>'])('is true for %s', (html) => {
            expect(isLeaf(parse(html))).toBe(true);
        });

        it('is false for elements that can hold children', () => {
            expect(isLeaf(parse('<div></div>'))).toBe(false);
            expect(isLeaf(parse('<span></span>'))).toBe(false);
        });

        it('is false for text nodes', () => {
            expect(isLeaf(document.createTextNode('x'))).toBe(false);
        });
    });

    describe('predicates agree with getNodeCategory', () => {
        it('reports exactly one category per node', () => {
            const nodes = [
                parse('<span>a</span>'),
                parse('<div>a</div>'),
                parse('<div><div>a</div></div>'),
                document.createTextNode('a'),
            ];
            for (const node of nodes) {
                const flags = [isInline(node), isBlock(node), isContainer(node)];
                expect(flags.filter(Boolean)).toHaveLength(1);
            }
        });
    });
});
