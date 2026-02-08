import { describe, it, expect } from 'vitest';
import { HighlightUtil } from '../lib/utils/highlight.util';

describe('HighlightUtil.matches', () => {
  it('should return false for empty value or search term', () => {
    expect(HighlightUtil.matches('', 'test')).toBe(false);
    expect(HighlightUtil.matches('test', '')).toBe(false);
    expect(HighlightUtil.matches('', '')).toBe(false);
  });

  it('should perform case-insensitive substring match', () => {
    expect(HighlightUtil.matches('Hello World', 'hello')).toBe(true);
    expect(HighlightUtil.matches('Hello World', 'WORLD')).toBe(true);
    expect(HighlightUtil.matches('Hello World', 'xyz')).toBe(false);
  });

  it('should handle SQL-style % wildcards', () => {
    expect(HighlightUtil.matches('food assessment', 'food%ass')).toBe(true);
    expect(HighlightUtil.matches('food bar assessment', 'food%ass')).toBe(true);
    expect(HighlightUtil.matches('assessment food', 'food%ass')).toBe(false);
  });

  it('should match everything for wildcard-only patterns', () => {
    expect(HighlightUtil.matches('anything', '%')).toBe(true);
    expect(HighlightUtil.matches('anything', '%%')).toBe(true);
  });

  it('should require ordered fragments', () => {
    expect(HighlightUtil.matches('abc def ghi', 'abc%ghi')).toBe(true);
    expect(HighlightUtil.matches('ghi def abc', 'abc%ghi')).toBe(false);
  });

  it('should handle multiple wildcard segments', () => {
    expect(HighlightUtil.matches('alpha beta gamma delta', 'alpha%gamma%delta')).toBe(true);
    expect(HighlightUtil.matches('alpha beta gamma', 'alpha%gamma%delta')).toBe(false);
  });
});

describe('HighlightUtil.highlight', () => {
  it('should return empty string for empty text', () => {
    expect(HighlightUtil.highlight('', 'test')).toBe('');
  });

  it('should return escaped text when no search term', () => {
    expect(HighlightUtil.highlight('hello', '')).toBe('hello');
    expect(HighlightUtil.highlight('hello', '  ')).toBe('hello');
  });

  it('should return text without highlighting when no match', () => {
    const result = HighlightUtil.highlight('hello world', 'xyz');
    expect(result).not.toContain('highlight-match');
    expect(result).toContain('hello world');
  });

  it('should highlight simple matches', () => {
    const result = HighlightUtil.highlight('Hello World', 'World', false);
    expect(result).toContain('<span class="highlight-match">World</span>');
  });

  it('should highlight wildcard matches', () => {
    const result = HighlightUtil.highlight('food assessment', 'food%ass', false);
    expect(result).toContain('<span class="highlight-match">food</span>');
    expect(result).toContain('<span class="highlight-match">ass</span>');
  });
});

describe('HighlightUtil.escapeHtml', () => {
  it('should escape HTML special characters (SSR fallback)', () => {
    // In node environment without proper document, should use SSR fallback
    const result = HighlightUtil.escapeHtml('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;');
  });

  it('should handle ampersands', () => {
    const result = HighlightUtil.escapeHtml('A & B');
    expect(result).toContain('&amp;');
  });
});
