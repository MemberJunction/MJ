import { describe, it, expect, beforeEach } from 'vitest';
import {
    getBlocksInRange,
    getEndBlockOfRange,
    getStartBlockOfRange,
    rangeDoesEndAtBlockBoundary,
    rangeDoesStartAtBlockBoundary,
} from '../lib/engine/range/block-range';
import { resetNodeCategoryCache } from '../lib/engine/node/category';
import { ZERO_WIDTH_SPACE } from '../lib/engine/constants';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

function rangeAt(startContainer: Node, startOffset: number, endContainer?: Node, endOffset?: number): Range {
    const range = document.createRange();
    range.setStart(startContainer, startOffset);
    range.setEnd(endContainer ?? startContainer, endOffset ?? startOffset);
    return range;
}

describe('block range queries', () => {
    beforeEach(() => {
        resetNodeCategoryCache();
    });

    describe('getStartBlockOfRange / getEndBlockOfRange', () => {
        it('finds the block containing a text position', () => {
            const root = parse('<p>one</p><p>two</p>');
            const text = root.children[1].firstChild as Text;
            const range = rangeAt(text, 1);
            expect(getStartBlockOfRange(range, root)).toBe(root.children[1]);
        });

        it('climbs out of inline wrappers', () => {
            const root = parse('<p>a<b><i>x</i></b></p>');
            const text = root.querySelector('i')?.firstChild as Text;
            const range = rangeAt(text, 0);
            expect(getStartBlockOfRange(range, root)).toBe(root.firstElementChild);
        });

        it('reports differing start and end blocks for a spanning selection', () => {
            const root = parse('<p>one</p><p>two</p>');
            const first = root.children[0].firstChild as Text;
            const second = root.children[1].firstChild as Text;
            const range = rangeAt(first, 1, second, 1);

            expect(getStartBlockOfRange(range, root)).toBe(root.children[0]);
            expect(getEndBlockOfRange(range, root)).toBe(root.children[1]);
        });

        it('resolves a position addressed at the root by child index', () => {
            const root = parse('<p>one</p><p>two</p>');
            const range = rangeAt(root, 1, root, 2);

            expect(getStartBlockOfRange(range, root)).toBe(root.children[1]);
            expect(getEndBlockOfRange(range, root)).toBe(root.children[1]);
        });

        it('descends into a container to find the first block', () => {
            const root = parse('<blockquote><p>quoted</p></blockquote>');
            const range = rangeAt(root, 0, root, 1);
            expect(getStartBlockOfRange(range, root)).toBe(root.querySelector('p'));
        });

        it('returns null when there is no block at all', () => {
            const root = parse('');
            expect(getStartBlockOfRange(rangeAt(root, 0), root)).toBeNull();
        });
    });

    describe('getBlocksInRange', () => {
        it('returns the single block of a collapsed range', () => {
            const root = parse('<p>one</p><p>two</p>');
            const text = root.children[0].firstChild as Text;
            expect(getBlocksInRange(rangeAt(text, 1), root)).toEqual([root.children[0]]);
        });

        it('returns every block a selection spans, in order', () => {
            const root = parse('<p>one</p><p>two</p><p>three</p>');
            const first = root.children[0].firstChild as Text;
            const third = root.children[2].firstChild as Text;
            const blocks = getBlocksInRange(rangeAt(first, 0, third, 1), root);
            expect(blocks).toEqual([root.children[0], root.children[1], root.children[2]]);
        });

        it('descends into containers', () => {
            const root = parse('<p>a</p><blockquote><p>b</p><p>c</p></blockquote>');
            const first = root.children[0].firstChild as Text;
            const last = root.querySelectorAll('blockquote p')[1].firstChild as Text;
            expect(getBlocksInRange(rangeAt(first, 0, last, 1), root)).toHaveLength(3);
        });

        it('returns nothing when the range touches no block', () => {
            const root = parse('');
            expect(getBlocksInRange(rangeAt(root, 0), root)).toEqual([]);
        });
    });

    describe('rangeDoesStartAtBlockBoundary', () => {
        it('is true at the very start of a block', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            expect(rangeDoesStartAtBlockBoundary(rangeAt(text, 0), root)).toBe(true);
        });

        it('is false one character in', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            expect(rangeDoesStartAtBlockBoundary(rangeAt(text, 1), root)).toBe(false);
        });

        it('is false after preceding inline content in the same block', () => {
            const root = parse('<p><b>x</b>abc</p>');
            const text = root.querySelector('p')?.lastChild as Text;
            expect(rangeDoesStartAtBlockBoundary(rangeAt(text, 0), root)).toBe(false);
        });

        it('is true when only zero-width caret ballast precedes the position', () => {
            // A ZWS is engine scaffolding, never something the user typed.
            const root = parse('<p></p>');
            const paragraph = root.firstElementChild as Element;
            const text = document.createTextNode(ZERO_WIDTH_SPACE);
            paragraph.appendChild(text);
            expect(rangeDoesStartAtBlockBoundary(rangeAt(text, 1), root)).toBe(true);
        });

        it('is true at the start of an empty block holding only a filler BR', () => {
            const root = parse('<p><br></p>');
            const paragraph = root.firstElementChild as Element;
            expect(rangeDoesStartAtBlockBoundary(rangeAt(paragraph, 0), root)).toBe(true);
        });
    });

    describe('rangeDoesEndAtBlockBoundary', () => {
        it('is true at the very end of a block', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            expect(rangeDoesEndAtBlockBoundary(rangeAt(text, 3), root)).toBe(true);
        });

        it('is false one character short of the end', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            expect(rangeDoesEndAtBlockBoundary(rangeAt(text, 2), root)).toBe(false);
        });

        it('is false when inline content follows in the same block', () => {
            const root = parse('<p>abc<b>x</b></p>');
            const text = root.querySelector('p')?.firstChild as Text;
            expect(rangeDoesEndAtBlockBoundary(rangeAt(text, 3), root)).toBe(false);
        });

        it('is true when only zero-width caret ballast follows', () => {
            const root = parse('<p></p>');
            const paragraph = root.firstElementChild as Element;
            const text = document.createTextNode(`abc${ZERO_WIDTH_SPACE}`);
            paragraph.appendChild(text);
            expect(rangeDoesEndAtBlockBoundary(rangeAt(text, 3), root)).toBe(true);
        });
    });
});
