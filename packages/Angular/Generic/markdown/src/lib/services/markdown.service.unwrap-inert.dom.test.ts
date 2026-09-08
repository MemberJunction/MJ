import { describe, it, expect, vi, afterEach } from 'vitest';
import { MarkdownService } from './markdown.service';

/**
 * `unwrapMiscodedHtml` must build its replacement nodes in the inert DOMParser documents,
 * never the live `document`. Assigning innerHTML on a live element runs image error handlers
 * at parse time, before the component's sanitizer sees the returned string.
 *
 * jsdom does not load images, so execution is not observable directly; the spec pins the
 * mechanism instead: no element is created on the live document during unwrapping, the
 * unwrapped markup is still produced, and hostile attributes pass through unchanged for the
 * component sanitizer (the service's contract is unsanitized HTML).
 */
type UnwrapAccessor = { unwrapMiscodedHtml(html: string): string };

afterEach(() => vi.restoreAllMocks());

describe('MarkdownService.unwrapMiscodedHtml is inert', () => {
  const unwrap = (html: string) => (new MarkdownService() as unknown as UnwrapAccessor).unwrapMiscodedHtml(html);
  const miscoded = '<pre><code>&lt;div class="card"&gt;&lt;img src="x" onerror="alert(1)"&gt;&lt;p&gt;hi&lt;/p&gt;&lt;/div&gt;</code></pre>';

  it('never creates elements on the live document while unwrapping', () => {
    const createElement = vi.spyOn(document, 'createElement');
    const createFragment = vi.spyOn(document, 'createDocumentFragment');
    unwrap(miscoded);
    expect(createElement).not.toHaveBeenCalled();
    expect(createFragment).not.toHaveBeenCalled();
  });

  it('still unwraps the structural HTML', () => {
    const out = unwrap(miscoded);
    expect(out).not.toContain('<pre>');
    expect(out).toContain('<div class="card">');
    expect(out).toContain('<p>hi</p>');
  });

  it('returns the markup for the component sanitizer rather than executing it', () => {
    const out = unwrap(miscoded);
    expect(out).toContain('onerror="alert(1)"');
  });

  it('leaves surrounding content intact', () => {
    const out = unwrap('<h1>t</h1>' + miscoded + '<p>after</p>');
    expect(out.startsWith('<h1>t</h1>')).toBe(true);
    expect(out.endsWith('<p>after</p>')).toBe(true);
  });
});
