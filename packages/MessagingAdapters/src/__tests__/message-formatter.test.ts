/**
 * Unit tests for the shared message formatter utilities.
 *
 * Tests Markdown parsing, Slack mrkdwn conversion, text truncation,
 * and chunk splitting logic that is shared across all platform adapters.
 */
import { describe, it, expect } from 'vitest';
import {
    SplitMarkdownIntoSections,
    ConvertBoldToSlackFormat,
    ConvertLinksToSlackFormat,
    ConvertToSlackMrkdwn,
    TruncateText,
    SplitTextIntoChunks,
} from '../base/message-formatter.js';

describe('splitMarkdownIntoSections', () => {
    it('should parse a simple text paragraph', () => {
        const sections = SplitMarkdownIntoSections('Hello world');
        expect(sections).toEqual([{ Type: 'text', Content: 'Hello world' }]);
    });

    it('should parse ATX headers', () => {
        const sections = SplitMarkdownIntoSections('# Title\n\nSome text');
        expect(sections).toHaveLength(2);
        expect(sections[0]).toEqual({ Type: 'header', Content: 'Title' });
        expect(sections[1]).toEqual({ Type: 'text', Content: 'Some text' });
    });

    it('should parse multiple header levels', () => {
        const md = '# H1\n\n## H2\n\n### H3';
        const sections = SplitMarkdownIntoSections(md);
        expect(sections).toHaveLength(3);
        expect(sections[0]).toEqual({ Type: 'header', Content: 'H1' });
        expect(sections[1]).toEqual({ Type: 'header', Content: 'H2' });
        expect(sections[2]).toEqual({ Type: 'header', Content: 'H3' });
    });

    it('should parse fenced code blocks', () => {
        const md = 'Before\n\n```js\nconsole.log("hi")\n```\n\nAfter';
        const sections = SplitMarkdownIntoSections(md);
        expect(sections).toHaveLength(3);
        expect(sections[0]).toEqual({ Type: 'text', Content: 'Before' });
        expect(sections[1]).toEqual({ Type: 'code', Content: 'console.log("hi")' });
        expect(sections[2]).toEqual({ Type: 'text', Content: 'After' });
    });

    it('should handle code blocks without language specifier', () => {
        const md = '```\nplain code\n```';
        const sections = SplitMarkdownIntoSections(md);
        expect(sections).toEqual([{ Type: 'code', Content: 'plain code' }]);
    });

    it('should handle unclosed code blocks gracefully', () => {
        const md = '```\ncode without closing';
        const sections = SplitMarkdownIntoSections(md);
        expect(sections).toHaveLength(1);
        expect(sections[0].Type).toBe('code');
        expect(sections[0].Content).toBe('code without closing');
    });

    it('should separate paragraphs by blank lines', () => {
        const md = 'First paragraph\n\nSecond paragraph\n\nThird paragraph';
        const sections = SplitMarkdownIntoSections(md);
        expect(sections).toHaveLength(3);
        expect(sections.every(s => s.Type === 'text')).toBe(true);
    });

    it('should combine adjacent non-blank lines into one paragraph', () => {
        const md = 'Line one\nLine two\nLine three';
        const sections = SplitMarkdownIntoSections(md);
        expect(sections).toHaveLength(1);
        expect(sections[0].Content).toBe('Line one\nLine two\nLine three');
    });

    it('should handle complex mixed content', () => {
        const md = `# Agent Response

Here is the answer to your question.

## Code Example

\`\`\`typescript
const x = 42;
\`\`\`

More explanation follows.`;

        const sections = SplitMarkdownIntoSections(md);
        expect(sections).toHaveLength(5);
        expect(sections[0]).toEqual({ Type: 'header', Content: 'Agent Response' });
        expect(sections[1]).toEqual({ Type: 'text', Content: 'Here is the answer to your question.' });
        expect(sections[2]).toEqual({ Type: 'header', Content: 'Code Example' });
        expect(sections[3]).toEqual({ Type: 'code', Content: 'const x = 42;' });
        expect(sections[4]).toEqual({ Type: 'text', Content: 'More explanation follows.' });
    });

    it('should handle empty input', () => {
        const sections = SplitMarkdownIntoSections('');
        expect(sections).toEqual([]);
    });

    it('should handle only whitespace', () => {
        const sections = SplitMarkdownIntoSections('   \n\n   ');
        expect(sections).toEqual([]);
    });
});

describe('convertBoldToSlackFormat', () => {
    it('should convert **bold** to *bold*', () => {
        expect(ConvertBoldToSlackFormat('This is **bold** text')).toBe('This is *bold* text');
    });

    it('should convert multiple bold instances', () => {
        expect(ConvertBoldToSlackFormat('**a** and **b**')).toBe('*a* and *b*');
    });

    it('should not modify text without bold', () => {
        expect(ConvertBoldToSlackFormat('no bold here')).toBe('no bold here');
    });

    it('should handle empty input', () => {
        expect(ConvertBoldToSlackFormat('')).toBe('');
    });
});

describe('convertLinksToSlackFormat', () => {
    it('should convert [text](url) to <url|text>', () => {
        expect(ConvertLinksToSlackFormat('[Click here](https://example.com)'))
            .toBe('<https://example.com|Click here>');
    });

    it('should convert multiple links', () => {
        const input = 'See [Google](https://google.com) and [GitHub](https://github.com)';
        const expected = 'See <https://google.com|Google> and <https://github.com|GitHub>';
        expect(ConvertLinksToSlackFormat(input)).toBe(expected);
    });

    it('should not modify text without links', () => {
        expect(ConvertLinksToSlackFormat('no links')).toBe('no links');
    });
});

describe('convertToSlackMrkdwn', () => {
    it('should apply both bold and link conversions', () => {
        const input = '**Bold** and [link](https://example.com)';
        const expected = '*Bold* and <https://example.com|link>';
        expect(ConvertToSlackMrkdwn(input)).toBe(expected);
    });
});

describe('truncateText', () => {
    it('should not truncate text within the limit', () => {
        expect(TruncateText('short', 100)).toBe('short');
    });

    it('should truncate text exceeding the limit with ellipsis', () => {
        const result = TruncateText('a'.repeat(100), 50);
        expect(result.length).toBeLessThanOrEqual(50);
        expect(result.endsWith('... (truncated)')).toBe(true);
    });

    it('should handle exact length', () => {
        const text = 'exact';
        expect(TruncateText(text, 5)).toBe('exact');
    });

    it('should handle empty string', () => {
        expect(TruncateText('', 10)).toBe('');
    });
});

describe('splitTextIntoChunks', () => {
    it('should return single chunk for text within limit', () => {
        expect(SplitTextIntoChunks('short text', 100)).toEqual(['short text']);
    });

    it('should split at paragraph boundaries', () => {
        const text = 'First paragraph\n\nSecond paragraph\n\nThird paragraph';
        const chunks = SplitTextIntoChunks(text, 25);
        expect(chunks.length).toBeGreaterThan(1);
        // Each chunk should be within the limit
        chunks.forEach(chunk => {
            expect(chunk.length).toBeLessThanOrEqual(25);
        });
    });

    it('should force-split single paragraphs that exceed the limit', () => {
        const longWord = 'a'.repeat(100);
        const chunks = SplitTextIntoChunks(longWord, 30);
        expect(chunks.length).toBeGreaterThan(1);
    });

    it('should handle empty input', () => {
        expect(SplitTextIntoChunks('', 100)).toEqual(['']);
    });

    it('should preserve all content across chunks', () => {
        const text = 'Part A content here\n\nPart B content here\n\nPart C content here';
        const chunks = SplitTextIntoChunks(text, 25);
        const reassembled = chunks.join('\n\n');
        // All original content should be present (may have different whitespace)
        expect(reassembled).toContain('Part A');
        expect(reassembled).toContain('Part B');
        expect(reassembled).toContain('Part C');
    });
});
