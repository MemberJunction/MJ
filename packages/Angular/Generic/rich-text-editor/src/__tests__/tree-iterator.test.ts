import { describe, it, expect } from 'vitest';
import { TreeIterator } from '../lib/engine/node/tree-iterator';
import { SHOW_ELEMENT, SHOW_ELEMENT_OR_TEXT, SHOW_TEXT } from '../lib/engine/constants';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

/** Drain an iterator in one direction, collecting a readable label per node. */
function drain(iterator: TreeIterator, direction: 'next' | 'previous' | 'previousPostOrder'): string[] {
    const seen: string[] = [];
    for (;;) {
        const node =
            direction === 'next'
                ? iterator.NextNode()
                : direction === 'previous'
                  ? iterator.PreviousNode()
                  : iterator.PreviousPostOrderNode();
        if (!node) {
            return seen;
        }
        seen.push(label(node));
    }
}

function label(node: Node): string {
    return node.nodeType === Node.TEXT_NODE ? `"${node.nodeValue}"` : node.nodeName;
}

describe('TreeIterator', () => {
    describe('NextNode (pre-order)', () => {
        it('descends into children before moving to siblings', () => {
            const root = parse('<p><b>x</b>y</p><p>z</p>');
            const iterator = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
            expect(drain(iterator, 'next')).toEqual(['P', 'B', '"x"', '"y"', 'P', '"z"']);
        });

        it('never yields the root itself', () => {
            const root = parse('<b>x</b>');
            const iterator = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
            expect(drain(iterator, 'next')).toEqual(['B', '"x"']);
        });

        it('returns null immediately for an empty root', () => {
            const iterator = new TreeIterator(parse(''), SHOW_ELEMENT_OR_TEXT);
            expect(iterator.NextNode()).toBeNull();
        });

        it('honours the node-type mask', () => {
            const root = parse('<p><b>x</b>y</p>');
            expect(drain(new TreeIterator(root, SHOW_TEXT), 'next')).toEqual(['"x"', '"y"']);
            expect(drain(new TreeIterator(root, SHOW_ELEMENT), 'next')).toEqual(['P', 'B']);
        });

        it('honours the caller filter', () => {
            const root = parse('<p><b>x</b><i>y</i></p>');
            const onlyItalics = new TreeIterator(root, SHOW_ELEMENT, (node) => node.nodeName === 'I');
            expect(drain(onlyItalics, 'next')).toEqual(['I']);
        });

        it('skips over a rejected node but still descends into it', () => {
            // A filter excludes a node from being *yielded*, not from being traversed.
            const root = parse('<p><b>x</b></p>');
            const noBold = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT, (node) => node.nodeName !== 'B');
            expect(drain(noBold, 'next')).toEqual(['P', '"x"']);
        });
    });

    describe('PreviousNode (pre-order, reversed)', () => {
        it('exactly reverses NextNode', () => {
            const root = parse('<p><b>x</b>y</p><p>z</p>');

            const forward = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
            const order = drain(forward, 'next');

            // The forward drain leaves the cursor on the last node; walk back from there.
            const backward = drain(forward, 'previous');
            expect(backward).toEqual(order.slice(0, -1).reverse());
        });

        it('returns null when already at the root', () => {
            const iterator = new TreeIterator(parse('<b>x</b>'), SHOW_ELEMENT_OR_TEXT);
            expect(iterator.PreviousNode()).toBeNull();
        });

        it('never yields the root when stepping up from a first child', () => {
            // Regression: stepping up from a first child lands on the parent, and for a
            // top-level first child that parent IS the root. Yielding it would let a
            // backward cleanup pass operate on the editor element itself.
            const root = parse('<p><b>x</b></p>');
            const iterator = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
            iterator.CurrentNode = root.querySelector('b') as Node;
            expect(iterator.PreviousNode()?.nodeName).toBe('P');
            expect(iterator.PreviousNode()).toBeNull();
        });
    });

    describe('PreviousPostOrderNode', () => {
        it('yields parents before their children, working right to left', () => {
            // Post-order is children-then-parent, so reversing it gives parent-then-children.
            const root = parse('<p><b>x</b>y</p><p>z</p>');
            const iterator = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
            expect(drain(iterator, 'previousPostOrder')).toEqual(['P', '"z"', 'P', '"y"', 'B', '"x"']);
        });

        it('reaches an ancestor before its descendants, so removing it skips the subtree', () => {
            const root = parse('<p><b><i>x</i></b></p>');
            const iterator = new TreeIterator(root, SHOW_ELEMENT);
            const visited: string[] = [];
            for (;;) {
                const node = iterator.PreviousPostOrderNode();
                if (!node) {
                    break;
                }
                visited.push(node.nodeName);
            }
            expect(visited).toEqual(['P', 'B', 'I']);
        });

        it('returns null for an empty root', () => {
            const iterator = new TreeIterator(parse(''), SHOW_ELEMENT_OR_TEXT);
            expect(iterator.PreviousPostOrderNode()).toBeNull();
        });
    });

    describe('the root is a boundary in every direction', () => {
        it('is never yielded by any of the three walks', () => {
            const root = parse('<p><b>x</b>y</p><p>z</p>');
            const walks = ['next', 'previous', 'previousPostOrder'] as const;
            for (const direction of walks) {
                const iterator = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
                if (direction !== 'next') {
                    // Position at the deepest last node so the backward walks cover the tree.
                    while (iterator.NextNode()) {
                        /* advance to the end */
                    }
                }
                expect(drain(iterator, direction)).not.toContain('DIV');
            }
        });
    });

    describe('CurrentNode', () => {
        it('starts at the root and tracks the last yielded node', () => {
            const root = parse('<p>x</p>');
            const iterator = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
            expect(iterator.CurrentNode).toBe(root);

            const first = iterator.NextNode();
            expect(iterator.CurrentNode).toBe(first);
        });

        it('can be repositioned mid-traversal', () => {
            const root = parse('<p><b>x</b>y</p>');
            const iterator = new TreeIterator(root, SHOW_TEXT);
            iterator.CurrentNode = root.querySelector('b') as Node;
            expect(label(iterator.NextNode() as Node)).toBe('"x"');
        });
    });
});
