import { describe, it, expect } from 'vitest';
import {
    areAlike,
    createElement,
    detach,
    empty,
    getNearest,
    indexOfNode,
    isElement,
    isTextNode,
    ownerDocumentOf,
    replaceWith,
    unwrap,
} from '../lib/engine/node/utils';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

describe('node utils', () => {
    describe('createElement', () => {
        it('creates a bare element', () => {
            expect(createElement(document, 'div').outerHTML).toBe('<div></div>');
        });

        it('stamps attributes', () => {
            const el = createElement(document, 'div', { style: 'margin:0', 'data-x': '1' });
            expect(el.getAttribute('style')).toBe('margin:0');
            expect(el.getAttribute('data-x')).toBe('1');
        });

        it('appends children in order', () => {
            const el = createElement(document, 'p', null, [
                document.createTextNode('a'),
                createElement(document, 'br'),
            ]);
            expect(el.innerHTML).toBe('a<br>');
        });
    });

    describe('detach', () => {
        it('removes the node and returns it', () => {
            const host = parse('<p>a</p><p>b</p>');
            const first = host.firstElementChild as HTMLElement;
            expect(detach(first)).toBe(first);
            expect(host.innerHTML).toBe('<p>b</p>');
        });

        it('is a no-op for an already-detached node', () => {
            const orphan = document.createElement('div');
            expect(() => detach(orphan)).not.toThrow();
        });
    });

    describe('replaceWith', () => {
        it('swaps the node in place', () => {
            const host = parse('<p>a</p>');
            replaceWith(host.firstElementChild as Node, createElement(document, 'h1'));
            expect(host.innerHTML).toBe('<h1></h1>');
        });
    });

    describe('empty', () => {
        it('moves all children into a fragment', () => {
            const host = parse('<p>a<b>c</b></p>');
            const block = host.firstElementChild as HTMLElement;
            const fragment = empty(block);
            expect(block.innerHTML).toBe('');
            expect(fragment.childNodes).toHaveLength(2);
        });
    });

    describe('unwrap', () => {
        it('replaces a node with its children, preserving position', () => {
            const host = parse('<p>before<span>x<b>y</b></span>after</p>');
            unwrap(host.querySelector('span') as Node);
            expect((host.firstElementChild as HTMLElement).innerHTML).toBe('beforex<b>y</b>after');
        });

        it('is a no-op for a detached node', () => {
            expect(() => unwrap(document.createElement('span'))).not.toThrow();
        });
    });

    describe('ownerDocumentOf', () => {
        it('answers for an ordinary node', () => {
            expect(ownerDocumentOf(document.createElement('div'))).toBe(document);
        });

        it('answers for the document itself, which has a null ownerDocument', () => {
            expect(ownerDocumentOf(document)).toBe(document);
        });
    });

    describe('getNearest', () => {
        it('finds an ancestor by tag name', () => {
            const host = parse('<blockquote><p><b>x</b></p></blockquote>');
            const bold = host.querySelector('b') as Node;
            expect(getNearest(bold, host, 'BLOCKQUOTE')).toBe(host.querySelector('blockquote'));
        });

        it('matches the node itself', () => {
            const host = parse('<b>x</b>');
            const bold = host.querySelector('b') as Node;
            expect(getNearest(bold, host, 'B')).toBe(bold);
        });

        it('stops at the root rather than escaping it', () => {
            const outer = parse('<blockquote><div id="root"><b>x</b></div></blockquote>');
            const root = outer.querySelector('#root') as Node;
            const bold = outer.querySelector('b') as Node;
            expect(getNearest(bold, root, 'BLOCKQUOTE')).toBeNull();
        });

        it('returns null when there is no match', () => {
            const host = parse('<p><b>x</b></p>');
            expect(getNearest(host.querySelector('b'), host, 'H1')).toBeNull();
        });
    });

    describe('areAlike', () => {
        it('merges two plain elements of the same name', () => {
            const host = parse('<b>a</b><b>b</b>');
            expect(areAlike(host.children[0], host.children[1])).toBe(true);
        });

        it('refuses two links, whose hrefs may differ', () => {
            const host = parse('<a href="1">a</a><a href="1">b</a>');
            expect(areAlike(host.children[0], host.children[1])).toBe(false);
        });

        it('refuses leaves, which cannot adopt children', () => {
            const host = parse('<br><br>');
            expect(areAlike(host.children[0], host.children[1])).toBe(false);
        });

        it('refuses different tag names', () => {
            const host = parse('<b>a</b><i>b</i>');
            expect(areAlike(host.children[0], host.children[1])).toBe(false);
        });

        it('refuses differing classes', () => {
            const host = parse('<span class="x">a</span><span class="y">b</span>');
            expect(areAlike(host.children[0], host.children[1])).toBe(false);
        });

        it('refuses differing inline styles', () => {
            const host = parse('<span style="color:red">a</span><span style="color:blue">b</span>');
            expect(areAlike(host.children[0], host.children[1])).toBe(false);
        });

        it('accepts identical inline styles', () => {
            const host = parse('<span style="color:red">a</span><span style="color:red">b</span>');
            expect(areAlike(host.children[0], host.children[1])).toBe(true);
        });

        it('accepts two text nodes', () => {
            expect(areAlike(document.createTextNode('a'), document.createTextNode('b'))).toBe(true);
        });

        it('refuses a text node against an element', () => {
            expect(areAlike(document.createTextNode('a'), document.createElement('b'))).toBe(false);
        });
    });

    describe('type guards', () => {
        it('narrows elements and text nodes', () => {
            expect(isElement(document.createElement('div'))).toBe(true);
            expect(isElement(document.createTextNode('x'))).toBe(false);
            expect(isTextNode(document.createTextNode('x'))).toBe(true);
            expect(isTextNode(document.createElement('div'))).toBe(false);
        });
    });

    describe('indexOfNode', () => {
        it('reports the position among siblings', () => {
            const host = parse('<p>a</p><p>b</p><p>c</p>');
            expect(indexOfNode(host.children[0])).toBe(0);
            expect(indexOfNode(host.children[2])).toBe(2);
        });

        it('counts text nodes, not just elements', () => {
            const host = parse('text<b>x</b>');
            expect(indexOfNode(host.querySelector('b') as Node)).toBe(1);
        });

        it('returns -1 for a detached node', () => {
            expect(indexOfNode(document.createElement('div'))).toBe(-1);
        });
    });
});
