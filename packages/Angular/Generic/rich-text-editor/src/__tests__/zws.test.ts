import { describe, it, expect } from 'vitest';
import { ZERO_WIDTH_SPACE as ZWS } from '../lib/engine/constants';
import { removeZeroWidthSpaces } from '../lib/engine/zws';
import { createRoot } from './support/editor-harness';

describe('removeZeroWidthSpaces', () => {
    it('strips ballast from text without touching other characters', () => {
        const root = createRoot();
        root.innerHTML = `<div>a${ZWS}b${ZWS}${ZWS}c</div>`;
        removeZeroWidthSpaces(root);
        expect(root.innerHTML).toBe('<div>abc</div>');
    });

    it('removes a text node that was only ballast', () => {
        const root = createRoot();
        root.innerHTML = `<div>a<b>x</b>${ZWS}</div>`;
        removeZeroWidthSpaces(root);
        expect(root.innerHTML).toBe('<div>a<b>x</b></div>');
    });

    it('removes the inline chain an emptied text node leaves hollow', () => {
        const root = createRoot();
        root.innerHTML = `<div>a<i><b>${ZWS}</b></i>c</div>`;
        removeZeroWidthSpaces(root);
        expect(root.innerHTML).toBe('<div>ac</div>');
    });

    it('never removes a block, even one emptied by the sweep', () => {
        const root = createRoot();
        root.innerHTML = `<div>${ZWS}</div>`;
        removeZeroWidthSpaces(root);
        expect(root.innerHTML).toBe('<div></div>');
    });

    it('spares the node the caret is in', () => {
        const root = createRoot();
        root.innerHTML = `<div><b>${ZWS}</b><i>${ZWS}</i></div>`;
        const keep = root.querySelector('b')?.firstChild as Text;
        removeZeroWidthSpaces(root, keep);
        expect(root.innerHTML).toBe(`<div><b>${ZWS}</b></div>`);
    });

    it('leaves a document with no ballast untouched', () => {
        const root = createRoot();
        root.innerHTML = '<div>plain <b>text</b></div>';
        removeZeroWidthSpaces(root);
        expect(root.innerHTML).toBe('<div>plain <b>text</b></div>');
    });
});
