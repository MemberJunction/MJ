import { describe, it, expect, beforeEach } from 'vitest';
import {
    expandRangeToBlockBoundaries,
    getNodeAfterOffset,
    getNodeBeforeOffset,
    getNodeLength,
    moveRangeBoundariesDownTree,
    moveRangeBoundariesUpTree,
} from '../lib/engine/range/boundaries';
import { resetNodeCategoryCache } from '../lib/engine/node/category';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

/** Build a range from `(container, offset)` pairs. */
function rangeAt(startContainer: Node, startOffset: number, endContainer?: Node, endOffset?: number): Range {
    const range = document.createRange();
    range.setStart(startContainer, startOffset);
    range.setEnd(endContainer ?? startContainer, endOffset ?? startOffset);
    return range;
}

describe('range boundaries', () => {
    beforeEach(() => {
        resetNodeCategoryCache();
    });

    describe('getNodeLength', () => {
        it('counts characters in a text node', () => {
            expect(getNodeLength(document.createTextNode('abc'))).toBe(3);
        });

        it('counts children in an element', () => {
            expect(getNodeLength(parse('<p>a</p><p>b</p>'))).toBe(2);
        });
    });

    describe('getNodeAfterOffset / getNodeBeforeOffset', () => {
        it('reports the surrounding children of an element position', () => {
            const root = parse('<p>a</p><p>b</p>');
            expect(getNodeAfterOffset(root, 1)).toBe(root.children[1]);
            expect(getNodeBeforeOffset(root, 1)).toBe(root.children[0]);
        });

        it('returns null past the ends', () => {
            const root = parse('<p>a</p>');
            expect(getNodeAfterOffset(root, 1)).toBeNull();
            expect(getNodeBeforeOffset(root, 0)).toBeNull();
        });

        it('treats a text node as its own neighbour when there is room', () => {
            const text = document.createTextNode('abc');
            expect(getNodeAfterOffset(text, 1)).toBe(text);
            expect(getNodeBeforeOffset(text, 1)).toBe(text);
            expect(getNodeAfterOffset(text, 3)).toBeNull();
            expect(getNodeBeforeOffset(text, 0)).toBeNull();
        });
    });

    describe('moveRangeBoundariesDownTree', () => {
        it('descends a collapsed boundary into the first text node', () => {
            const root = parse('<p><b>abc</b></p>');
            const paragraph = root.firstElementChild as Element;
            const range = rangeAt(paragraph, 0);

            moveRangeBoundariesDownTree(range);

            expect(range.startContainer.nodeValue).toBe('abc');
            expect(range.startOffset).toBe(0);
        });

        it('descends the end boundary to the deepest last position', () => {
            const root = parse('<p><b>abc</b></p>');
            const paragraph = root.firstElementChild as Element;
            const range = rangeAt(paragraph, 0, paragraph, 1);

            moveRangeBoundariesDownTree(range);

            expect(range.endContainer.nodeValue).toBe('abc');
            expect(range.endOffset).toBe(3);
        });

        it('stops at a leaf rather than descending into it', () => {
            const root = parse('<p><br></p>');
            const paragraph = root.firstElementChild as Element;
            const range = rangeAt(paragraph, 0);

            moveRangeBoundariesDownTree(range);

            expect(range.startContainer).toBe(paragraph);
            expect(range.startOffset).toBe(0);
        });

        it('falls back to the end of a preceding text node', () => {
            const root = parse('<p>abc<br></p>');
            const paragraph = root.firstElementChild as Element;
            const range = rangeAt(paragraph, 1);

            moveRangeBoundariesDownTree(range);

            expect(range.startContainer.nodeValue).toBe('abc');
            expect(range.startOffset).toBe(3);
        });

        it('leaves an already-deep boundary alone', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            const range = rangeAt(text, 2);

            moveRangeBoundariesDownTree(range);

            expect(range.startContainer).toBe(text);
            expect(range.startOffset).toBe(2);
        });
    });

    describe('moveRangeBoundariesUpTree', () => {
        it('lifts a start boundary out of a node it sits at the front of', () => {
            const root = parse('<p><b>abc</b></p>');
            const text = root.querySelector('b')?.firstChild as Text;
            const range = rangeAt(text, 0);

            moveRangeBoundariesUpTree(range, root, root);

            expect(range.startContainer).toBe(root);
            expect(range.startOffset).toBe(0);
        });

        it('lifts an end boundary out of a node it sits at the end of', () => {
            const root = parse('<p><b>abc</b></p>');
            const text = root.querySelector('b')?.firstChild as Text;
            const range = rangeAt(text, 3);

            moveRangeBoundariesUpTree(range, root, root);

            expect(range.endContainer).toBe(root);
            expect(range.endOffset).toBe(1);
        });

        it('does not lift past the supplied maximum', () => {
            const root = parse('<p><b>abc</b></p>');
            const paragraph = root.firstElementChild as Element;
            const text = root.querySelector('b')?.firstChild as Text;
            const range = rangeAt(text, 0);

            moveRangeBoundariesUpTree(range, paragraph, paragraph);

            expect(range.startContainer).toBe(paragraph);
            expect(range.startOffset).toBe(0);
        });

        it('leaves a mid-text boundary exactly where it is', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            const range = rangeAt(text, 1);

            moveRangeBoundariesUpTree(range, root, root);

            expect(range.startContainer).toBe(text);
            expect(range.startOffset).toBe(1);
        });
    });

    describe('expandRangeToBlockBoundaries', () => {
        it('grows a mid-paragraph selection to cover the whole paragraph', () => {
            const root = parse('<p>hello world</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            const range = rangeAt(text, 2, text, 5);

            expandRangeToBlockBoundaries(range, root);

            expect(range.startContainer).toBe(root);
            expect(range.startOffset).toBe(0);
            expect(range.endOffset).toBe(1);
        });

        it('spans every block a multi-block selection touches', () => {
            const root = parse('<p>one</p><p>two</p><p>three</p>');
            const first = root.children[0].firstChild as Text;
            const second = root.children[1].firstChild as Text;
            const range = rangeAt(first, 1, second, 1);

            expandRangeToBlockBoundaries(range, root);

            expect(range.startOffset).toBe(0);
            expect(range.endOffset).toBe(2);
        });

        it('is a no-op when the range touches no block', () => {
            const root = parse('');
            const range = rangeAt(root, 0);
            expect(() => expandRangeToBlockBoundaries(range, root)).not.toThrow();
        });
    });
});
