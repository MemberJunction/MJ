import { describe, it, expect } from 'vitest';
import { detectRichTextFormat } from '../lib/field/rich-text-detection';

describe('detectRichTextFormat', () => {
  describe('plain text', () => {
    it('returns plain for null / undefined / empty', () => {
      expect(detectRichTextFormat(null)).toBe('plain');
      expect(detectRichTextFormat(undefined)).toBe('plain');
      expect(detectRichTextFormat('')).toBe('plain');
      expect(detectRichTextFormat('   \n  ')).toBe('plain');
    });

    it('returns plain for ordinary prose', () => {
      expect(detectRichTextFormat('Just a normal note about the customer.')).toBe('plain');
      expect(detectRichTextFormat('Call back at 3pm - they were busy.')).toBe('plain');
    });

    it('does not treat an incidental angle bracket or asterisk as rich text', () => {
      expect(detectRichTextFormat('value < 10 and value > 2')).toBe('plain');
      expect(detectRichTextFormat('5 * 3 = 15')).toBe('plain');
      expect(detectRichTextFormat('see <attachment> for details')).toBe('plain');
    });

    it('requires two weak markdown signals — a single one stays plain', () => {
      expect(detectRichTextFormat('- just one bullet line of text')).toBe('plain');
    });
  });

  describe('markdown', () => {
    it('detects ATX headings', () => {
      expect(detectRichTextFormat('# Title\n\nSome body text here.')).toBe('markdown');
    });

    it('detects fenced code blocks', () => {
      expect(detectRichTextFormat('Here is code:\n```ts\nconst x = 1;\n```')).toBe('markdown');
    });

    it('detects links and images', () => {
      expect(detectRichTextFormat('See [the docs](https://example.com) for more.')).toBe('markdown');
      expect(detectRichTextFormat('![logo](https://example.com/l.png)')).toBe('markdown');
    });

    it('detects tables', () => {
      const table = '| Name | Age |\n| --- | --- |\n| Sam | 30 |';
      expect(detectRichTextFormat(table)).toBe('markdown');
    });

    it('detects two or more weak signals (list + bold)', () => {
      expect(detectRichTextFormat('- item one is **important**\n- item two')).toBe('markdown');
    });

    it('classifies markdown-with-embedded-html as markdown (superset)', () => {
      const mixed = '# Heading\n\n<div class="note">inline html</div>\n\nmore text';
      expect(detectRichTextFormat(mixed)).toBe('markdown');
    });
  });

  describe('html', () => {
    it('detects markup with two or more tags', () => {
      expect(detectRichTextFormat('<p>Hello <strong>world</strong></p>')).toBe('html');
    });

    it('detects structural html', () => {
      const html = '<div><ul><li>one</li><li>two</li></ul></div>';
      expect(detectRichTextFormat(html)).toBe('html');
    });

    it('stays plain when only a single tag-like token is present', () => {
      expect(detectRichTextFormat('a lone <br> in otherwise plain text')).toBe('plain');
    });
  });

  describe('performance guard', () => {
    it('still classifies when signals are within the leading scan window', () => {
      const big = '# Heading\n' + 'x'.repeat(50000);
      expect(detectRichTextFormat(big)).toBe('markdown');
    });
  });
});
