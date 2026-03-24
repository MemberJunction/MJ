/**
 * Unit tests for the Teams Adaptive Card formatter.
 *
 * Tests conversion of Markdown to Adaptive Card JSON structure.
 */
import { describe, it, expect } from 'vitest';
import { markdownToAdaptiveCard } from '../teams/teams-formatter.js';

describe('markdownToAdaptiveCard', () => {
    describe('card structure', () => {
        it('should return a valid Adaptive Card structure', () => {
            const card = markdownToAdaptiveCard('Hello');
            expect(card.type).toBe('AdaptiveCard');
            expect(card.version).toBe('1.4');
            expect(card['$schema']).toBe('http://adaptivecards.io/schemas/adaptive-card.json');
            expect(Array.isArray(card.body)).toBe(true);
        });
    });

    describe('text elements', () => {
        it('should create a TextBlock for plain text', () => {
            const card = markdownToAdaptiveCard('Simple text');
            const body = card.body as Record<string, unknown>[];
            expect(body).toHaveLength(1);
            expect(body[0]).toEqual({
                type: 'TextBlock',
                text: 'Simple text',
                wrap: true
            });
        });
    });

    describe('header elements', () => {
        it('should create a styled TextBlock for headers', () => {
            const card = markdownToAdaptiveCard('# My Title');
            const body = card.body as Record<string, unknown>[];
            expect(body).toHaveLength(1);
            expect(body[0]).toEqual({
                type: 'TextBlock',
                text: 'My Title',
                size: 'Large',
                weight: 'Bolder',
                wrap: true,
                spacing: 'Medium'
            });
        });
    });

    describe('code elements', () => {
        it('should create a monospace TextBlock for code blocks', () => {
            const card = markdownToAdaptiveCard('```\nconst x = 1;\n```');
            const body = card.body as Record<string, unknown>[];
            expect(body).toHaveLength(1);
            expect(body[0].type).toBe('TextBlock');
            expect(body[0].fontType).toBe('Monospace');
            expect(body[0].wrap).toBe(true);
            expect((body[0].text as string)).toContain('const x = 1;');
        });
    });

    describe('mixed content', () => {
        it('should handle header + text + code together', () => {
            const md = '# Report\n\nHere are the results.\n\n```\ndata = [1, 2, 3]\n```';
            const card = markdownToAdaptiveCard(md);
            const body = card.body as Record<string, unknown>[];
            expect(body.length).toBeGreaterThanOrEqual(3);
            expect(body[0].size).toBe('Large');  // header
            expect(body[1].text).toBe('Here are the results.');  // text
            expect(body[2].fontType).toBe('Monospace');  // code
        });
    });

    describe('edge cases', () => {
        it('should return a fallback element for empty input', () => {
            const card = markdownToAdaptiveCard('');
            const body = card.body as Record<string, unknown>[];
            expect(body).toHaveLength(1);
            expect(body[0].text).toBe('(empty response)');
        });

        it('should preserve Markdown formatting in text (Teams handles it natively)', () => {
            const card = markdownToAdaptiveCard('This is **bold** and *italic*');
            const body = card.body as Record<string, unknown>[];
            expect((body[0].text as string)).toContain('**bold**');
            expect((body[0].text as string)).toContain('*italic*');
        });
    });
});
