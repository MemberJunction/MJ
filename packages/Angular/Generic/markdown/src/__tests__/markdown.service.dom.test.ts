import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownService } from '../lib/services/markdown.service';

/**
 * jsdom specs for the web shell around @memberjunction/markdown-core.
 *
 * These focus on the browser-only concerns that stay in the Angular service:
 * the `parse()` entry points and the DOM-based `unwrapMiscodedHtml()` fixup.
 * The framework-agnostic parsing itself is covered in @memberjunction/markdown-core.
 *
 * `unwrapMiscodedHtml` is private, so we reach it through a typed cast — the same
 * pattern the markdown-core engine spec uses to poke the internal marked instance.
 * This keeps the assertions deterministic (exact HTML in, exact behavior out)
 * rather than depending on which fixtures marked happens to miscode.
 */
type UnwrapAccessor = { unwrapMiscodedHtml(html: string): string };

describe('MarkdownService (DOM)', () => {
  let service: MarkdownService;
  let unwrap: (html: string) => string;

  beforeEach(() => {
    service = new MarkdownService();
    unwrap = (html: string) => (service as unknown as UnwrapAccessor).unwrapMiscodedHtml(html);
  });

  describe('parse', () => {
    it('returns empty string for empty input', () => {
      expect(service.parse('')).toBe('');
    });

    it('renders basic prose to a paragraph', () => {
      expect(service.parse('hello world')).toContain('<p>');
    });

    it('accepts per-call config overrides without throwing', () => {
      expect(() => service.parse('# Title', { enableHtml: true })).not.toThrow();
    });

    it('parseAsync resolves to the same output as parse', async () => {
      const md = '**bold**';
      expect(await service.parseAsync(md)).toBe(service.parse(md));
    });
  });

  describe('unwrapMiscodedHtml', () => {
    it('is a no-op when there are no <pre> blocks', () => {
      const html = '<p>just a paragraph</p>';
      expect(unwrap(html)).toBe(html);
    });

    it('returns empty input unchanged', () => {
      expect(unwrap('')).toBe('');
    });

    it('skips content containing <svg (DOMParser would mangle SVG namespaces)', () => {
      const html = '<pre><code>&lt;svg&gt;&lt;rect/&gt;&lt;/svg&gt;</code></pre>';
      // Left untouched precisely because it contains "<svg".
      expect(unwrap(html)).toBe(html);
    });

    it('preserves an intentional code block that carries a language class', () => {
      const html = '<pre><code class="language-html">&lt;div&gt;&lt;span&gt;x&lt;/span&gt;&lt;/div&gt;</code></pre>';
      const out = unwrap(html);
      // Language-classed code is an intentional example → NOT unwrapped.
      expect(out).toContain('language-html');
      expect(out).toContain('<pre>');
    });

    it('unwraps structural HTML that marked miscoded into a <pre><code> block', () => {
      // textContent decodes to <div><span>x</span></div> — multi-tag structural HTML.
      const html = '<pre><code>&lt;div&gt;&lt;span&gt;x&lt;/span&gt;&lt;/div&gt;</code></pre>';
      const out = unwrap(html);
      expect(out).toContain('<div>');
      expect(out).toContain('<span>x</span>');
      // The escaped code-block form must be gone.
      expect(out).not.toContain('&lt;div&gt;');
      expect(out).not.toContain('<pre>');
    });

    it('does not unwrap a single self-closing tag (needs 2+ tags to qualify)', () => {
      const html = '<pre><code>&lt;br&gt;</code></pre>';
      // tagCount < 2 → looksLikeStructuralHtml returns false → left as-is.
      expect(unwrap(html)).toBe(html);
    });

    it('does not unwrap an empty code block', () => {
      const html = '<pre><code></code></pre>';
      expect(unwrap(html)).toBe(html);
    });

    it('does not unwrap plain non-HTML code content', () => {
      const html = '<pre><code>const x = 1; // not html</code></pre>';
      expect(unwrap(html)).toBe(html);
    });

    it('does not throw on malformed markup', () => {
      expect(() => unwrap('<pre><code>&lt;div&gt;&lt;span&gt;unclosed')).not.toThrow();
    });
  });

  describe('config accessors', () => {
    it('resetConfig restores enableHtml to the default (false)', () => {
      service.configureMarked({ enableHtml: true });
      expect(service.getConfig().enableHtml).toBe(true);
      service.resetConfig();
      expect(service.getConfig().enableHtml).toBe(false);
    });

    it('isLanguageSupported reflects Prism registration', () => {
      // typescript is imported by the service; a made-up language is not.
      expect(service.isLanguageSupported('typescript')).toBe(true);
      expect(service.isLanguageSupported('definitely-not-a-language')).toBe(false);
    });
  });
});
