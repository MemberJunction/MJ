import { describe, it, expect, afterEach } from 'vitest';
import { sanitizeSvgContent } from './svg-renderer.extension';

/**
 * Bypass-oriented spec for the post-render SVG sanitizer, complementing the smoke cases in
 * web-dom-utils.test.ts. Each case is an obfuscation a fixed-list or single-scheme sanitizer
 * misses: unusual handler names, mixed case, control characters inside the scheme, `data:`
 * and `vbscript:` targets, and resource attributes other than href.
 */
function container(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sanitizeSvgContent bypass cases', () => {
  it('removes handler attributes that are not on a fixed list', () => {
    const el = container('<svg><rect onbegin="a()" onpointerrawupdate="b()" ONANIMATIONEND="c()" OnMouseEnter="d()"/></svg>');
    sanitizeSvgContent(el);
    expect(el.querySelector('rect')?.attributes.length).toBe(0);
  });

  it.each([
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['data:text/html', 'data:text/html,<script>alert(1)</script>'],
    ['data:image/svg+xml', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['tab inside scheme', 'java\tscript:alert(1)'],
    ['newline inside scheme', 'java\nscript:alert(1)'],
    ['leading control character', '\u0001javascript:alert(1)'],
    ['mixed case', 'JaVaScRiPt:alert(1)'],
    ['leading whitespace', '   javascript:alert(1)'],
  ])('removes href using %s', (_label, href) => {
    const el = container('<svg><a>x</a></svg>');
    el.querySelector('a')!.setAttribute('href', href);
    sanitizeSvgContent(el);
    expect(el.querySelector('a')?.hasAttribute('href')).toBe(false);
  });

  it('removes script URLs from xlink:href, src, action and formaction', () => {
    const el = container('<svg><a>x</a><image/><foo/></svg>');
    el.querySelector('a')!.setAttribute('xlink:href', 'javascript:alert(1)');
    el.querySelector('image')!.setAttribute('src', 'javascript:alert(1)');
    el.querySelector('foo')!.setAttribute('action', 'javascript:alert(1)');
    el.querySelector('foo')!.setAttribute('formaction', 'vbscript:alert(1)');
    sanitizeSvgContent(el);
    expect(el.querySelector('a')?.hasAttribute('xlink:href')).toBe(false);
    expect(el.querySelector('image')?.hasAttribute('src')).toBe(false);
    expect(el.querySelector('foo')?.attributes.length).toBe(0);
  });

  it('keeps a raster data: image on <image> but not an SVG one', () => {
    const el = container('<svg><image id="png"/><image id="svg"/></svg>');
    el.querySelector('#png')!.setAttribute('href', 'data:image/png;base64,iVBORw0KGgo=');
    el.querySelector('#svg')!.setAttribute('href', 'data:image/svg+xml;base64,PHN2Zy8+');
    sanitizeSvgContent(el);
    expect(el.querySelector('#png')?.hasAttribute('href')).toBe(true);
    expect(el.querySelector('#svg')?.hasAttribute('href')).toBe(false);
  });

  it('keeps safe hrefs and non-URL attributes untouched', () => {
    const el = container('<svg><a href="https://example.test/" class="k" data-x="1">x</a><use href="#icon"/></svg>');
    sanitizeSvgContent(el);
    const a = el.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.test/');
    expect(a.getAttribute('class')).toBe('k');
    expect(a.getAttribute('data-x')).toBe('1');
    expect(el.querySelector('use')).not.toBeNull();
  });

  it('removes protocol-relative external <use> references', () => {
    const el = container('<svg><use href="//evil.test/sprite.svg#x"/></svg>');
    sanitizeSvgContent(el);
    expect(el.querySelector('use')).toBeNull();
  });
});
