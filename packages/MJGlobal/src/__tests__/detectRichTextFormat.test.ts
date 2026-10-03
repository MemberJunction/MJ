import { describe, it, expect } from 'vitest';
import { DetectRichTextFormat } from '../util';

describe('detectRichTextFormat', () => {
  describe('plain text', () => {
    it('returns plain for null / undefined / empty', () => {
      expect(DetectRichTextFormat(null)).toBe('plain');
      expect(DetectRichTextFormat(undefined)).toBe('plain');
      expect(DetectRichTextFormat('')).toBe('plain');
      expect(DetectRichTextFormat('   \n  ')).toBe('plain');
    });

    it('returns plain for ordinary prose', () => {
      expect(DetectRichTextFormat('Just a normal note about the customer.')).toBe('plain');
      expect(DetectRichTextFormat('Call back at 3pm - they were busy.')).toBe('plain');
    });

    it('does not treat an incidental angle bracket or asterisk as rich text', () => {
      expect(DetectRichTextFormat('value < 10 and value > 2')).toBe('plain');
      expect(DetectRichTextFormat('5 * 3 = 15')).toBe('plain');
      expect(DetectRichTextFormat('see <attachment> for details')).toBe('plain');
    });

    it('requires two weak markdown signals — a single one stays plain', () => {
      expect(DetectRichTextFormat('- just one bullet line of text')).toBe('plain');
    });
  });

  describe('markdown', () => {
    it('detects ATX headings', () => {
      expect(DetectRichTextFormat('# Title\n\nSome body text here.')).toBe('markdown');
    });

    it('detects fenced code blocks', () => {
      expect(DetectRichTextFormat('Here is code:\n```ts\nconst x = 1;\n```')).toBe('markdown');
    });

    it('detects links and images', () => {
      expect(DetectRichTextFormat('See [the docs](https://example.com) for more.')).toBe('markdown');
      expect(DetectRichTextFormat('![logo](https://example.com/l.png)')).toBe('markdown');
    });

    it('detects tables', () => {
      const table = '| Name | Age |\n| --- | --- |\n| Sam | 30 |';
      expect(DetectRichTextFormat(table)).toBe('markdown');
    });

    it('detects two or more weak signals (list + bold)', () => {
      expect(DetectRichTextFormat('- item one is **important**\n- item two')).toBe('markdown');
    });

    it('classifies markdown-with-embedded-html as markdown (superset)', () => {
      const mixed = '# Heading\n\n<div class="note">inline html</div>\n\nmore text';
      expect(DetectRichTextFormat(mixed)).toBe('markdown');
    });
  });

  describe('html', () => {
    it('detects markup with two or more tags', () => {
      expect(DetectRichTextFormat('<p>Hello <strong>world</strong></p>')).toBe('html');
    });

    it('detects structural html', () => {
      const html = '<div><ul><li>one</li><li>two</li></ul></div>';
      expect(DetectRichTextFormat(html)).toBe('html');
    });

    it('stays plain when only a single tag-like token is present', () => {
      expect(DetectRichTextFormat('a lone <br> in otherwise plain text')).toBe('plain');
    });
  });

  describe('scan length', () => {
    it('uses a 500-char default window: signals beyond it are not detected', () => {
      const lateHtml = 'x'.repeat(600) + '<p>late</p><div>html</div>';
      expect(DetectRichTextFormat(lateHtml)).toBe('plain');
    });

    it('detects signals within the leading window', () => {
      const big = '# Heading\n' + 'x'.repeat(50000);
      expect(DetectRichTextFormat(big)).toBe('markdown');
    });

    it('honors a caller-supplied larger window', () => {
      const lateHtml = 'x'.repeat(600) + '<p>late</p><div>html</div>';
      expect(DetectRichTextFormat(lateHtml, 2000)).toBe('html');
    });

    it('falls back to the default when given a non-positive window', () => {
      expect(DetectRichTextFormat('# Heading here', 0)).toBe('markdown');
    });
  });
});
