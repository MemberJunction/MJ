import { describe, it, expect } from 'vitest';
import { AssertionHelpers } from '../../lib/assertion-helpers';

describe('AssertionHelpers.ExtractTextContent', () => {
  it.each([
    ['<div>Hello <b>world</b></div>', 'Hello world'],
    ['<p>a</p><p>b</p>', 'a b'],
    ['no tags here', 'no tags here'],
    ['1 < 2 and no closing bracket', '1 < 2 and no closing bracket'],
    ['<a href="x">link</a> then 3 < 4', 'link then 3 < 4'],
    ['<<b>bold</b>', 'bold'],
  ])('reads the text of %j', (html, text) => {
    expect(AssertionHelpers.ExtractTextContent(html)).toBe(text);
  });

  it('matches what the tag-stripping regex produced', () => {
    const html = '<section><h1>Title</h1><ul><li>one</li><li>two <i>2</i></li></ul> trailing < text</section>';
    const expected = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(AssertionHelpers.ExtractTextContent(html)).toBe(expected);
  });

  it('handles many unclosed "<" in linear time', () => {
    const html = '<'.repeat(200_000);
    const started = performance.now();
    expect(AssertionHelpers.ExtractTextContent(html)).toBe(html);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('ContainsText reads the same text', () => {
    expect(AssertionHelpers.ContainsText('<div>Hello <b>world</b></div>', 'Hello world')).toBe(true);
  });
});
