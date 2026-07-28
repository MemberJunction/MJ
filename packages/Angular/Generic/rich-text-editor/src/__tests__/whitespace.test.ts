import { describe, it, expect } from 'vitest';
import { isCollapsibleWhitespaceNode, isWhitespaceOnly, NOT_WHITESPACE } from '../lib/engine/node/whitespace';
import { NON_BREAKING_SPACE, ZERO_WIDTH_SPACE } from '../lib/engine/constants';

describe('whitespace', () => {
    describe('isWhitespaceOnly', () => {
        it.each(['', ' ', '\t', '\r', '\n', '  \t\n  '])('is true for %j', (text) => {
            expect(isWhitespaceOnly(text)).toBe(true);
        });

        it('is false once any visible character appears', () => {
            expect(isWhitespaceOnly(' a ')).toBe(false);
        });

        it('is false for a non-breaking space, which renders', () => {
            // NBSP is inserted deliberately by delete operations; pruning it would
            // remove visible content.
            expect(isWhitespaceOnly(NON_BREAKING_SPACE)).toBe(false);
        });

        it('is false for a zero-width space, which the caret may occupy', () => {
            expect(isWhitespaceOnly(ZERO_WIDTH_SPACE)).toBe(false);
        });
    });

    describe('NOT_WHITESPACE', () => {
        it('matches only the four collapsible characters as whitespace', () => {
            expect(NOT_WHITESPACE.test(' \t\r\n')).toBe(false);
            expect(NOT_WHITESPACE.test(NON_BREAKING_SPACE)).toBe(true);
        });

        it('is not global, so repeated tests are stable', () => {
            expect(NOT_WHITESPACE.global).toBe(false);
            expect(NOT_WHITESPACE.test('a')).toBe(true);
            expect(NOT_WHITESPACE.test('a')).toBe(true);
        });
    });

    describe('isCollapsibleWhitespaceNode', () => {
        it('is true for a whitespace-only text node', () => {
            expect(isCollapsibleWhitespaceNode(document.createTextNode('\n  '))).toBe(true);
        });

        it('is false for a text node with content', () => {
            expect(isCollapsibleWhitespaceNode(document.createTextNode(' x '))).toBe(false);
        });

        it('is false for elements and comments', () => {
            expect(isCollapsibleWhitespaceNode(document.createElement('div'))).toBe(false);
            expect(isCollapsibleWhitespaceNode(document.createComment(' '))).toBe(false);
        });
    });
});
