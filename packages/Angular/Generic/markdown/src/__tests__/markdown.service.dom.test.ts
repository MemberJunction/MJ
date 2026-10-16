import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

  describe('parse sanitizes unless scripts are explicitly enabled', () => {
    it('strips handlers and script from passthrough HTML', () => {
      const out = service.parse('<div><img src="x" onerror="alert(1)"><script>alert(2)</script></div>', { enableHtml: true });
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('<script');
      expect(out).toContain('<img');
    });

    it('leaves script in place when enableJavaScript is true (the opt-out)', () => {
      const out = service.parse('<div>x</div><script>alert(1)</script>', { enableHtml: true, enableJavaScript: true });
      expect(out).toContain('<script>');
    });

    it('sanitizeHtml is exposed for consumers that bind parse() output themselves', () => {
      expect(service.sanitizeHtml('<a href="javascript:alert(1)" onclick="x()">x</a>')).toBe('<a>x</a>');
    });
  });

  describe('unwrapMiscodedHtml is inert and keeps leading style', () => {
    afterEach(() => vi.restoreAllMocks());
    const miscoded = '<pre><code>&lt;style&gt;.card{color:red}&lt;/style&gt;&lt;div class="card"&gt;&lt;img src="x" onerror="alert(1)"&gt;&lt;p&gt;hi&lt;/p&gt;&lt;/div&gt;</code></pre>';

    it('never creates elements on the live document while unwrapping', () => {
      // Building the replacement on the live document would run image error handlers at
      // parse time, before parse() sanitizes the returned string.
      const createElement = vi.spyOn(document, 'createElement');
      unwrap(miscoded);
      expect(createElement).not.toHaveBeenCalled();
    });

    it('unwraps the structural HTML and keeps a leading <style>', () => {
      const out = unwrap(miscoded);
      expect(out).not.toContain('<pre>');
      expect(out).toContain('<style>.card{color:red}</style>');
      expect(out).toContain('<div class="card">');
    });

    it('returns markup for parse() to sanitize rather than executing it', () => {
      expect(unwrap(miscoded)).toContain('onerror="alert(1)"');
    });
  });
});
