import { describe, it, expect, beforeEach } from 'vitest';
import {
    deleteContentsOfRange,
    extractContentsOfRange,
    insertNodeInRange,
} from '../lib/engine/range/contents';
import { resetNodeCategoryCache } from '../lib/engine/node/category';
import { NON_BREAKING_SPACE } from '../lib/engine/constants';

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

/** Serialize a fragment so assertions can read like HTML. */
function fragmentHtml(fragment: DocumentFragment): string {
    const host = document.createElement('div');
    host.appendChild(fragment.cloneNode(true));
    return host.innerHTML;
}

describe('range contents', () => {
    beforeEach(() => {
        resetNodeCategoryCache();
    });

    describe('insertNodeInRange', () => {
        it('splits a text node and inserts between the halves', () => {
            const root = parse('<p>abcd</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            insertNodeInRange(rangeAt(text, 2), document.createElement('br'));
            expect(root.innerHTML).toBe('<p>ab<br>cd</p>');
        });

        it('inserts before the text without splitting when at offset 0', () => {
            const root = parse('<p>abcd</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            insertNodeInRange(rangeAt(text, 0), document.createElement('br'));
            expect(root.innerHTML).toBe('<p><br>abcd</p>');
            expect(root.querySelector('p')?.childNodes).toHaveLength(2);
        });

        it('inserts after the text without splitting when at the end', () => {
            const root = parse('<p>abcd</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            insertNodeInRange(rangeAt(text, 4), document.createElement('br'));
            expect(root.innerHTML).toBe('<p>abcd<br></p>');
            expect(root.querySelector('p')?.childNodes).toHaveLength(2);
        });

        it('inserts at an element position by child index', () => {
            const root = parse('<p>a</p><p>b</p>');
            insertNodeInRange(rangeAt(root, 1), document.createElement('hr'));
            expect(root.innerHTML).toBe('<p>a</p><hr><p>b</p>');
        });

        it('appends when the offset is past the last child', () => {
            const root = parse('<p>a</p>');
            insertNodeInRange(rangeAt(root, 1), document.createElement('hr'));
            expect(root.innerHTML).toBe('<p>a</p><hr>');
        });

        it('inserts every child of a fragment', () => {
            const root = parse('<p>ab</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            const fragment = document.createDocumentFragment();
            fragment.append(document.createElement('br'), document.createElement('hr'));
            insertNodeInRange(rangeAt(text, 1), fragment);
            expect(root.innerHTML).toBe('<p>a<br><hr>b</p>');
        });

        it('leaves the range spanning the inserted content', () => {
            const root = parse('<p>ab</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            const range = rangeAt(text, 1);
            insertNodeInRange(range, document.createElement('br'));
            expect(range.toString()).toBe('');
        });
    });

    describe('extractContentsOfRange', () => {
        it('returns an empty fragment for a collapsed range', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            const fragment = extractContentsOfRange(rangeAt(text, 1), null, root);
            expect(fragment.childNodes).toHaveLength(0);
            expect(root.innerHTML).toBe('<p>abc</p>');
        });

        it('extracts a selection spanning two blocks', () => {
            const root = parse('<p>onetwo</p><p>threefour</p>');
            const first = root.children[0].firstChild as Text;
            const second = root.children[1].firstChild as Text;

            const fragment = extractContentsOfRange(rangeAt(first, 3, second, 5), null, root);

            expect(fragmentHtml(fragment)).toBe('<p>two</p><p>three</p>');
            expect(root.innerHTML).toBe('<p>one</p><p>four</p>');
        });

        it('collapses the range at the seam left behind', () => {
            const root = parse('<p>onetwo</p><p>threefour</p>');
            const first = root.children[0].firstChild as Text;
            const second = root.children[1].firstChild as Text;
            const range = rangeAt(first, 3, second, 5);

            extractContentsOfRange(range, null, root);

            expect(range.collapsed).toBe(true);
        });

        it('splits the end before the start, so the end offset stays valid', () => {
            // Both boundaries live in the same text node; splitting the start first would
            // shift the end and cut in the wrong place.
            const root = parse('<p>abcdef</p>');
            const text = root.querySelector('p')?.firstChild as Text;

            const fragment = extractContentsOfRange(rangeAt(text, 2, text, 4), null, root);

            expect(fragment.textContent).toBe('cd');
            expect(root.textContent).toBe('abef');
        });
    });

    describe('deleteContentsOfRange', () => {
        it('joins the partial blocks at either end into one', () => {
            const root = parse('<p>onetwo</p><p>threefour</p>');
            const first = root.children[0].firstChild as Text;
            const second = root.children[1].firstChild as Text;

            deleteContentsOfRange(rangeAt(first, 3, second, 5), root);

            expect(root.innerHTML).toBe('<p>onefour</p>');
        });

        it('deletes within a single block without merging anything', () => {
            const root = parse('<p>abcdef</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            deleteContentsOfRange(rangeAt(text, 2, text, 4), root);
            expect(root.innerHTML).toBe('<p>abef</p>');
        });

        it('leaves the emptied block focusable with a filler BR', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            deleteContentsOfRange(rangeAt(text, 0, text, 3), root);
            expect(root.innerHTML).toBe('<p><br></p>');
        });

        it('gives an emptied root a default block to hold the caret', () => {
            const root = parse('<p>abc</p>');
            deleteContentsOfRange(rangeAt(root, 0, root, 1), root);
            expect(root.innerHTML).toBe('<div><br></div>');
        });

        it('honours a custom block spec when refilling an emptied root', () => {
            const root = parse('<p>abc</p>');
            deleteContentsOfRange(rangeAt(root, 0, root, 1), root, {
                Tag: 'P',
                Attributes: { style: 'margin:0' },
            });
            expect(root.innerHTML).toBe('<p style="margin:0"><br></p>');
        });

        it('converts a now-trailing plain space to a non-breaking one', () => {
            // "ab cd" minus "cd" leaves "ab " — a trailing plain space would not render,
            // so the caret would appear to jump back onto the "b".
            const root = parse('<p>ab cd</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            deleteContentsOfRange(rangeAt(text, 3, text, 5), root);
            expect(root.textContent).toBe(`ab${NON_BREAKING_SPACE}`);
        });

        it('leaves a space alone when text still follows it', () => {
            const root = parse('<p>ab cd</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            deleteContentsOfRange(rangeAt(text, 0, text, 1), root);
            expect(root.textContent).toBe('b cd');
        });

        it('returns the deleted content as a fragment', () => {
            const root = parse('<p>abcdef</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            const fragment = deleteContentsOfRange(rangeAt(text, 2, text, 4), root);
            expect(fragment.textContent).toBe('cd');
        });

        it('leaves the caret at the join', () => {
            const root = parse('<p>onetwo</p><p>threefour</p>');
            const first = root.children[0].firstChild as Text;
            const second = root.children[1].firstChild as Text;
            const range = rangeAt(first, 3, second, 5);

            deleteContentsOfRange(range, root);

            expect(range.collapsed).toBe(true);
            expect(range.startContainer.textContent).toBe('onefour');
            expect(range.startOffset).toBe(3);
        });
    });
});
