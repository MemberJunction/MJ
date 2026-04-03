import { describe, it, expect } from 'vitest';
import { TextExtractor } from '../generic/TextExtractor';

describe('TextExtractor', () => {
    describe('ExtractFromHTML', () => {
        it('should return empty string for empty input', () => {
            expect(TextExtractor.ExtractFromHTML('')).toBe('');
            expect(TextExtractor.ExtractFromHTML('   ')).toBe('');
        });

        it('should strip simple HTML tags', () => {
            const result = TextExtractor.ExtractFromHTML('<p>Hello <b>world</b></p>');
            expect(result).toContain('Hello');
            expect(result).toContain('world');
            expect(result).not.toContain('<p>');
            expect(result).not.toContain('<b>');
        });

        it('should remove script tags and their content', () => {
            const html = '<p>Text</p><script>alert("xss")</script><p>More text</p>';
            const result = TextExtractor.ExtractFromHTML(html);
            expect(result).toContain('Text');
            expect(result).toContain('More text');
            expect(result).not.toContain('alert');
            expect(result).not.toContain('script');
        });

        it('should remove style tags and their content', () => {
            const html = '<style>.red { color: red; }</style><p>Visible text</p>';
            const result = TextExtractor.ExtractFromHTML(html);
            expect(result).toContain('Visible text');
            expect(result).not.toContain('color');
        });

        it('should decode HTML entities', () => {
            const html = '&amp; &lt; &gt; &quot; &#39; &nbsp;';
            const result = TextExtractor.ExtractFromHTML(html);
            expect(result).toContain('&');
            expect(result).toContain('<');
            expect(result).toContain('>');
            expect(result).toContain('"');
            expect(result).toContain("'");
        });

        it('should decode numeric HTML entities', () => {
            const html = '&#65;&#66;&#67;'; // ABC
            const result = TextExtractor.ExtractFromHTML(html);
            expect(result).toContain('ABC');
        });

        it('should decode hex HTML entities', () => {
            const html = '&#x41;&#x42;'; // AB
            const result = TextExtractor.ExtractFromHTML(html);
            expect(result).toContain('AB');
        });

        it('should add newlines for block elements', () => {
            const html = '<p>Para 1</p><p>Para 2</p>';
            const result = TextExtractor.ExtractFromHTML(html);
            expect(result).toContain('Para 1');
            expect(result).toContain('Para 2');
        });

        it('should handle br tags', () => {
            const html = 'Line 1<br>Line 2<br/>Line 3';
            const result = TextExtractor.ExtractFromHTML(html);
            expect(result).toContain('Line 1');
            expect(result).toContain('Line 2');
            expect(result).toContain('Line 3');
        });

        it('should normalize excessive whitespace', () => {
            const html = '<p>Hello     world</p>';
            const result = TextExtractor.ExtractFromHTML(html);
            expect(result).not.toMatch(/  +/); // no double spaces
        });
    });

    describe('ExtractFromPlainText', () => {
        it('should return empty string for empty input', () => {
            expect(TextExtractor.ExtractFromPlainText('')).toBe('');
            expect(TextExtractor.ExtractFromPlainText('   ')).toBe('');
        });

        it('should trim whitespace', () => {
            expect(TextExtractor.ExtractFromPlainText('  hello  ')).toBe('hello');
        });

        it('should normalize internal whitespace', () => {
            const result = TextExtractor.ExtractFromPlainText('hello     world');
            expect(result).toBe('hello world');
        });

        it('should remove control characters', () => {
            const text = 'hello\x00\x01\x02world';
            const result = TextExtractor.ExtractFromPlainText(text);
            expect(result).toBe('helloworld');
        });

        it('should preserve newlines', () => {
            const text = 'line 1\nline 2';
            const result = TextExtractor.ExtractFromPlainText(text);
            expect(result).toContain('\n');
        });

        it('should collapse excessive newlines', () => {
            const text = 'para 1\n\n\n\n\npara 2';
            const result = TextExtractor.ExtractFromPlainText(text);
            expect(result).not.toMatch(/\n{3,}/);
        });
    });

    describe('ExtractByMimeType', () => {
        it('should use HTML extraction for text/html', () => {
            const result = TextExtractor.ExtractByMimeType('<p>Hello</p>', 'text/html');
            expect(result).toContain('Hello');
            expect(result).not.toContain('<p>');
        });

        it('should use HTML extraction for application/xhtml+xml', () => {
            const result = TextExtractor.ExtractByMimeType('<p>Hello</p>', 'application/xhtml+xml');
            // xhtml contains 'html'
            expect(result).toContain('Hello');
        });

        it('should use plain text extraction for text/plain', () => {
            const result = TextExtractor.ExtractByMimeType('Hello world', 'text/plain');
            expect(result).toBe('Hello world');
        });

        it('should handle empty content', () => {
            expect(TextExtractor.ExtractByMimeType('', 'text/html')).toBe('');
        });

        it('should be case-insensitive for mime types', () => {
            const result = TextExtractor.ExtractByMimeType('<p>Test</p>', 'TEXT/HTML');
            expect(result).toContain('Test');
        });
    });

    describe('TruncateToTokenLimit', () => {
        it('should return empty string for empty input', () => {
            expect(TextExtractor.TruncateToTokenLimit('', 100)).toBe('');
        });

        it('should return full text when within limit', () => {
            const text = 'Short text';
            expect(TextExtractor.TruncateToTokenLimit(text, 100)).toBe(text);
        });

        it('should truncate at word boundary', () => {
            const text = 'word '.repeat(1000).trim();
            const result = TextExtractor.TruncateToTokenLimit(text, 10);
            expect(result.length).toBeLessThan(text.length);
            expect(result).not.toMatch(/\s$/); // shouldn't end with space
        });

        it('should not exceed approximate token limit in characters', () => {
            const text = 'a '.repeat(10000).trim();
            const result = TextExtractor.TruncateToTokenLimit(text, 50);
            // 50 tokens * 4 chars = ~200 chars max
            expect(result.length).toBeLessThanOrEqual(200);
        });
    });
});
