// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { PurifyRichTextHtml } from '../lib/rich-text/rich-text-sanitize';

describe('PurifyRichTextHtml', () => {
  describe('strips dangerous vectors', () => {
    it('removes <script> tags', () => {
      const out = PurifyRichTextHtml('<p>ok</p><script>alert(1)</script>');
      expect(out).toContain('<p>ok</p>');
      expect(out.toLowerCase()).not.toContain('<script');
      expect(out).not.toContain('alert(1)');
    });

    it('strips on* event handler attributes', () => {
      const out = PurifyRichTextHtml('<img src="x" onerror="alert(1)">');
      expect(out.toLowerCase()).not.toContain('onerror');
    });

    it('strips javascript: URLs', () => {
      const out = PurifyRichTextHtml('<a href="javascript:alert(1)">x</a>');
      expect(out.toLowerCase()).not.toContain('javascript:');
    });

    it('removes <script> embedded inside SVG', () => {
      const out = PurifyRichTextHtml('<svg><script>alert(1)</script><rect/></svg>');
      expect(out.toLowerCase()).not.toContain('<script');
      expect(out).not.toContain('alert(1)');
    });
  });

  describe('keeps safe rich content', () => {
    it('preserves structural HTML', () => {
      const out = PurifyRichTextHtml('<h2>Title</h2><ul><li>a</li></ul><table><tr><td>c</td></tr></table>');
      expect(out).toContain('<h2>Title</h2>');
      expect(out).toContain('<li>a</li>');
      expect(out).toContain('<td>c</td>');
    });

    it('preserves inline SVG shapes (the whole point of swapping the sanitizer)', () => {
      const svg = '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0%"/></linearGradient></defs><rect fill="url(#g)"/><path d="M0 0 L10 10"/><circle cx="5" cy="5" r="3"/></svg>';
      const out = PurifyRichTextHtml(svg);
      expect(out.toLowerCase()).toContain('<svg');
      expect(out.toLowerCase()).toContain('<rect');
      expect(out.toLowerCase()).toContain('<path');
      expect(out.toLowerCase()).toContain('<circle');
      expect(out.toLowerCase()).toContain('lineargradient');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null/undefined/empty', () => {
      expect(PurifyRichTextHtml(null)).toBe('');
      expect(PurifyRichTextHtml(undefined)).toBe('');
      expect(PurifyRichTextHtml('')).toBe('');
    });

    it('passes plain text through unchanged', () => {
      expect(PurifyRichTextHtml('just text')).toBe('just text');
    });
  });
});
