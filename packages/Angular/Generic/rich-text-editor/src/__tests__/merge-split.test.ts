import { describe, it, expect, beforeEach } from 'vitest';
import { mergeContainers, mergeInlines, mergeWithBlock, split } from '../lib/engine/node/merge-split';
import { resetNodeCategoryCache } from '../lib/engine/node/category';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

describe('merge and split primitives', () => {
    beforeEach(() => {
        resetNodeCategoryCache();
    });

    describe('split', () => {
        it('splits an element at a child index', () => {
            const root = parse('<p><b>a</b><i>b</i></p>');
            const paragraph = root.firstElementChild as Element;
            split(paragraph, 1, root, root);
            expect(root.innerHTML).toBe('<p><b>a</b></p><p><i>b</i></p>');
        });

        it('splits a text node at a character offset', () => {
            const root = parse('<p>hello</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            split(text, 2, root, root);
            expect(root.innerHTML).toBe('<p>he</p><p>llo</p>');
        });

        it('gives an emptied left half a filler BR', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            split(text, 0, root, root);
            expect(root.innerHTML).toBe('<p><br></p><p>abc</p>');
        });

        it('gives an emptied right half a filler BR', () => {
            const root = parse('<p>abc</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            split(text, 3, root, root);
            expect(root.innerHTML).toBe('<p>abc</p><p><br></p>');
        });

        it('fixes an emptied CONTAINER that becomes a block — the stale-cache case', () => {
            // Splitting at 0 moves every child out, flipping the original from container to
            // an empty block. Classifying it from a stale cache would skip the filler BR.
            const root = parse('<blockquote><div>a</div></blockquote>');
            const quote = root.firstElementChild as Element;
            split(quote, 0, root, root);
            expect(root.innerHTML).toBe('<blockquote><br></blockquote><blockquote><div>a</div></blockquote>');
        });

        it('splits all the way up to the stop node', () => {
            const root = parse('<blockquote><p>ab</p></blockquote>');
            const text = root.querySelector('p')?.firstChild as Text;
            split(text, 1, root, root);
            expect(root.innerHTML).toBe('<blockquote><p>a</p></blockquote><blockquote><p>b</p></blockquote>');
        });

        it('stops at the requested stop node', () => {
            const root = parse('<blockquote><p>ab</p></blockquote>');
            const quote = root.firstElementChild as Element;
            const text = root.querySelector('p')?.firstChild as Text;
            split(text, 1, quote, root);
            expect(root.innerHTML).toBe('<blockquote><p>a</p><p>b</p></blockquote>');
        });

        it('continues ordered-list numbering across a split inside a quote', () => {
            const root = parse('<blockquote><ol><li>a</li><li>b</li></ol></blockquote>');
            const list = root.querySelector('ol') as HTMLOListElement;
            split(list, 1, root, root);
            const lists = root.querySelectorAll('ol');
            expect(lists).toHaveLength(2);
            expect(lists[1].getAttribute('start')).toBe('2');
        });

        it('does not renumber a list outside a quote, where a split is a deliberate new list', () => {
            const root = parse('<ol><li>a</li><li>b</li></ol>');
            const list = root.querySelector('ol') as HTMLOListElement;
            split(list, 1, root, root);
            expect(root.querySelectorAll('ol')[1].hasAttribute('start')).toBe(false);
        });

        it('throws when a text node is split without a numeric offset', () => {
            const root = parse('<p>ab</p>');
            const text = root.querySelector('p')?.firstChild as Text;
            expect(() => split(text, root, root, root)).toThrow(/numeric offset/);
        });
    });

    describe('mergeInlines', () => {
        it('fuses two alike adjacent elements', () => {
            const root = parse('<p><b>a</b><b>b</b></p>');
            mergeInlines(root);
            expect(root.innerHTML).toBe('<p><b>ab</b></p>');
        });

        it('fuses adjacent text nodes', () => {
            const paragraph = parse('<p></p>').firstElementChild as HTMLElement;
            paragraph.appendChild(document.createTextNode('a'));
            paragraph.appendChild(document.createTextNode('b'));
            mergeInlines(paragraph);
            expect(paragraph.childNodes).toHaveLength(1);
            expect(paragraph.textContent).toBe('ab');
        });

        it('never fuses two links, whose hrefs may differ', () => {
            const root = parse('<p><a href="1">a</a><a href="2">b</a></p>');
            mergeInlines(root);
            expect(root.querySelectorAll('a')).toHaveLength(2);
        });

        it('leaves differently-styled spans separate', () => {
            const html = '<p><span style="color:red">a</span><span style="color:blue">b</span></p>';
            const root = parse(html);
            mergeInlines(root);
            expect(root.innerHTML).toBe(html);
        });

        it('recurses into nested elements', () => {
            const root = parse('<p><span><b>a</b><b>b</b></span></p>');
            mergeInlines(root);
            expect(root.innerHTML).toBe('<p><span><b>ab</b></span></p>');
        });

        it('does not fuse across a block boundary', () => {
            const html = '<div><b>a</b></div><div><b>b</b></div>';
            const root = parse(html);
            mergeInlines(root);
            expect(root.innerHTML).toBe(html);
        });

        describe('range patching', () => {
            it('moves a caret inside a merged text node', () => {
                const paragraph = parse('<p></p>').firstElementChild as HTMLElement;
                const first = document.createTextNode('ab');
                const second = document.createTextNode('cd');
                paragraph.append(first, second);

                const range = document.createRange();
                range.setStart(second, 1);
                range.collapse(true);

                mergeInlines(paragraph, range);

                expect(range.startContainer).toBe(first);
                expect(range.startOffset).toBe(3);
            });

            it('moves a caret through a merged element and on into the merged text', () => {
                // The caret starts at the beginning of the second <b>. Merging is recursive:
                // the two <b>s fuse, then their text nodes fuse. The caret has to survive
                // both hops and land on the same visual position — between "a" and "b".
                const root = parse('<p><b>a</b><b>b</b></p>');
                const [first] = Array.from(root.querySelectorAll('b'));
                const second = root.querySelectorAll('b')[1];

                const range = document.createRange();
                range.setStart(second, 0);
                range.collapse(true);

                mergeInlines(root, range);

                expect(root.innerHTML).toBe('<p><b>ab</b></p>');
                expect(range.startContainer).toBe(first.firstChild);
                expect(range.startContainer.nodeValue).toBe('ab');
                expect(range.startOffset).toBe(1);
            });

            it('leaves an untouched boundary where it was', () => {
                const root = parse('<p><b>a</b><b>b</b></p>');
                const paragraph = root.firstElementChild as Element;
                const range = document.createRange();
                range.setStart(paragraph, 0);
                range.collapse(true);

                mergeInlines(root, range);

                expect(range.startContainer).toBe(paragraph);
                expect(range.startOffset).toBe(0);
            });
        });
    });

    describe('mergeWithBlock', () => {
        it('pulls the next block into the first and places the caret at the seam', () => {
            const root = parse('<div>abc</div><div>def</div>');
            const [first, second] = Array.from(root.children);
            const range = document.createRange();

            mergeWithBlock(first, second, range, root);

            expect(root.innerHTML).toBe('<div>abcdef</div>');
            expect(range.collapsed).toBe(true);
            expect(range.startContainer.textContent).toBe('abcdef');
            expect(range.startOffset).toBe(3);
        });

        it('strips the filler BR that was holding the first block open', () => {
            const root = parse('<div><br></div><div>text</div>');
            const [first, second] = Array.from(root.children);
            mergeWithBlock(first, second, document.createRange(), root);
            expect(root.innerHTML).toBe('<div>text</div>');
        });

        it('detaches the emptied ancestor chain, leaving no stray wrapper', () => {
            const root = parse('<div>a</div><ul><li>b</li></ul>');
            const first = root.children[0];
            const item = root.querySelector('li') as Element;

            mergeWithBlock(first, item, document.createRange(), root);

            expect(root.querySelector('ul')).toBeNull();
            expect(root.innerHTML).toBe('<div>ab</div>');
        });

        it('drops the source block filler instead of carrying it across', () => {
            // Merging an empty line into a block with content must not append its filler —
            // that would leave a spurious trailing line break behind.
            const root = parse('<div>text</div><div><br></div>');
            const [first, second] = Array.from(root.children);
            mergeWithBlock(first, second, document.createRange(), root);
            expect(root.innerHTML).toBe('<div>text</div>');
        });

        it('keeps a BR that is real content rather than a filler', () => {
            const root = parse('<div>a</div><div>b<br>c</div>');
            const [first, second] = Array.from(root.children);
            mergeWithBlock(first, second, document.createRange(), root);
            expect(root.innerHTML).toBe('<div>ab<br>c</div>');
        });

        it('merges the resulting inline runs', () => {
            const root = parse('<div><b>a</b></div><div><b>b</b></div>');
            const [first, second] = Array.from(root.children);
            mergeWithBlock(first, second, document.createRange(), root);
            expect(root.innerHTML).toBe('<div><b>ab</b></div>');
        });
    });

    describe('mergeContainers', () => {
        it('fuses two adjacent unordered lists', () => {
            const root = parse('<ul><li>a</li></ul><ul><li>b</li></ul>');
            mergeContainers(root.children[1], root);
            expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
        });

        it('fuses two adjacent blockquotes', () => {
            const root = parse('<blockquote><div>a</div></blockquote><blockquote><div>b</div></blockquote>');
            mergeContainers(root.children[1], root);
            expect(root.innerHTML).toBe('<blockquote><div>a</div><div>b</div></blockquote>');
        });

        it('leaves unlike neighbours alone', () => {
            const html = '<ul><li>a</li></ul><ol><li>b</li></ol>';
            const root = parse(html);
            mergeContainers(root.children[1], root);
            expect(root.innerHTML).toBe(html);
        });

        it('does nothing when there is no previous sibling', () => {
            const html = '<ul><li>a</li></ul>';
            const root = parse(html);
            mergeContainers(root.children[0], root);
            expect(root.innerHTML).toBe(html);
        });

        it('leaves a plain list item alone — merging would join unrelated items', () => {
            const html = '<ul><li>a</li><li>b</li></ul>';
            const root = parse(html);
            const list = root.querySelector('ul') as Element;
            mergeContainers(list.children[1], root);
            expect(root.innerHTML).toBe(html);
        });

        it('gives a list item that starts with a nested list a block for its caret', () => {
            const root = parse('<ul><li><ul><li>a</li></ul></li></ul>');
            const outerItem = root.querySelector('li') as Element;
            mergeContainers(outerItem, root);
            expect(outerItem.firstElementChild?.nodeName).toBe('DIV');
            expect(outerItem.firstElementChild?.innerHTML).toBe('<br>');
        });
    });
});
