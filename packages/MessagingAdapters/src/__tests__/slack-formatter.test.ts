/**
 * Unit tests for the Slack Block Kit formatter.
 *
 * Tests conversion of Markdown to Slack Block Kit blocks,
 * including headers, code blocks, text blocks, and auto-splitting.
 */
import { describe, it, expect } from 'vitest';
import { markdownToBlocks } from '../slack/slack-formatter.js';

describe('markdownToBlocks', () => {
    describe('basic block types', () => {
        it('should create a section block for plain text', () => {
            const blocks = markdownToBlocks('Hello world');
            expect(blocks).toHaveLength(1);
            expect(blocks[0]).toEqual({
                type: 'section',
                text: { type: 'mrkdwn', text: 'Hello world' }
            });
        });

        it('should create a header block for Markdown headers', () => {
            const blocks = markdownToBlocks('# My Header');
            expect(blocks).toHaveLength(1);
            expect(blocks[0]).toEqual({
                type: 'header',
                text: { type: 'plain_text', text: 'My Header', emoji: true }
            });
        });

        it('should create a section block with backtick wrapping for code', () => {
            const blocks = markdownToBlocks('```\nconsole.log("hi")\n```');
            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('section');
            const textContent = (blocks[0].text as Record<string, unknown>).text as string;
            expect(textContent).toContain('console.log("hi")');
            expect(textContent).toContain('```');
        });
    });

    describe('mixed content', () => {
        it('should handle header + text + code', () => {
            const md = '# Title\n\nSome text here.\n\n```\ncode here\n```';
            const blocks = markdownToBlocks(md);
            expect(blocks.length).toBeGreaterThanOrEqual(3);
            expect(blocks[0].type).toBe('header');
            expect(blocks[1].type).toBe('section');
            expect(blocks[2].type).toBe('section');
        });
    });

    describe('bold conversion', () => {
        it('should convert **bold** to *bold* in Slack mrkdwn', () => {
            const blocks = markdownToBlocks('This is **bold** text');
            const textContent = (blocks[0].text as Record<string, unknown>).text as string;
            expect(textContent).toBe('This is *bold* text');
        });
    });

    describe('link conversion', () => {
        it('should convert [text](url) to <url|text> format', () => {
            const blocks = markdownToBlocks('Visit [Google](https://google.com) now');
            const textContent = (blocks[0].text as Record<string, unknown>).text as string;
            expect(textContent).toBe('Visit <https://google.com|Google> now');
        });
    });

    describe('header truncation', () => {
        it('should truncate headers exceeding 150 characters', () => {
            const longHeader = '# ' + 'A'.repeat(200);
            const blocks = markdownToBlocks(longHeader);
            const headerText = ((blocks[0].text as Record<string, unknown>).text) as string;
            expect(headerText.length).toBeLessThanOrEqual(150);
            expect(headerText.endsWith('...')).toBe(true);
        });
    });

    describe('long text auto-splitting', () => {
        it('should split text exceeding 3000 characters into multiple blocks', () => {
            const longText = 'A'.repeat(5000);
            const blocks = markdownToBlocks(longText);
            expect(blocks.length).toBeGreaterThan(1);
            blocks.forEach(block => {
                expect(block.type).toBe('section');
                const textLength = ((block.text as Record<string, unknown>).text as string).length;
                expect(textLength).toBeLessThanOrEqual(3000);
            });
        });
    });

    describe('edge cases', () => {
        it('should return a fallback block for empty input', () => {
            const blocks = markdownToBlocks('');
            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('section');
            const textContent = (blocks[0].text as Record<string, unknown>).text as string;
            expect(textContent).toBe('(empty response)');
        });

        it('should return a fallback block for whitespace-only input', () => {
            const blocks = markdownToBlocks('   \n\n   ');
            expect(blocks).toHaveLength(1);
        });
    });
});
