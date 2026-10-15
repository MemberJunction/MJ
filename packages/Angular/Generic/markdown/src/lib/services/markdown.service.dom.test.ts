import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mermaid } from 'mermaid';
import katex from 'katex';
import { MarkdownService } from './markdown.service';

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

/** Same private-member reach-in, for the lazily-loaded mermaid engine (see `loadMermaid`). */
type MermaidLoaderAccessor = { loadMermaid(): Promise<Mermaid> };

/** And for the lazily-loaded KaTeX engine (see `loadKatex`). */
type KatexLoaderAccessor = { loadKatex(): Promise<unknown> };

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

  describe('renderMermaid', () => {
    /** Stub the private lazy loader — the point of these specs is WHEN it is called, not what it returns. */
    const stubLoader = (impl: () => Promise<Mermaid>): void => {
      (service as unknown as MermaidLoaderAccessor).loadMermaid = impl;
    };

    const containerWith = (html: string): HTMLElement => {
      const container = document.createElement('div');
      container.innerHTML = html;
      return container;
    };

    it('never loads the diagram engine when the document has no diagram', async () => {
      let loads = 0;
      stubLoader(async () => {
        loads++;
        throw new Error('the engine must not be fetched for a diagram-free document');
      });

      const result = await service.renderMermaid(containerWith('<p>no diagrams here</p>'));

      expect(result).toBe(false);
      expect(loads).toBe(0);
    });

    it('shows a visible failure on every block when the lazy chunk cannot be loaded', async () => {
      stubLoader(() => Promise.reject(new Error('chunk fetch failed')));
      const container = containerWith(
        '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>' +
        '<div class="mermaid">graph TD; C-->D;</div>',
      );

      const result = await service.renderMermaid(container);

      expect(result).toBe(false);
      const failed = container.querySelectorAll('.mermaid-error');
      expect(failed.length).toBe(2);
      for (const element of Array.from(failed)) {
        expect(element.getAttribute('data-mermaid-error')).toBe('Diagram engine failed to load');
      }
    });

    it('does nothing at all when mermaid is disabled by config', async () => {
      let loads = 0;
      stubLoader(async () => {
        loads++;
        throw new Error('the engine must not be fetched when mermaid is disabled');
      });
      service.configureMarked({ enableMermaid: false });

      const result = await service.renderMermaid(
        containerWith('<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>'),
      );

      expect(result).toBe(false);
      expect(loads).toBe(0);
    });
  });

  describe('RenderMath', () => {
    /** Parse through the real pipeline (sanitizer included) and mount it, as the component does. */
    const mount = (markdown: string): HTMLElement => {
      const container = document.createElement('div');
      container.innerHTML = service.Parse(markdown);
      return container;
    };

    const stubLoader = (impl: () => Promise<unknown>): void => {
      (service as unknown as KatexLoaderAccessor).loadKatex = impl;
    };

    it('typesets inline and display math as MathML with the real engine', async () => {
      const container = mount('Energy $E = mc^2$ where\n\n$$\n\\frac{a}{b}\n$$');

      expect(await service.RenderMath(container)).toBe(true);

      const formulas = container.querySelectorAll('math');
      expect(formulas.length).toBe(2);
      expect(formulas[0].getAttribute('display')).toBeNull();
      expect(formulas[1].getAttribute('display')).toBe('block');
      expect(container.querySelector('mfrac')).not.toBeNull();
      expect(container.querySelector('annotation')?.textContent).toBe('E = mc^2');
      expect(container.querySelector('code.mj-math')).toBeNull();
    });

    it('spells styled letters with Unicode math characters, which Chrome renders (it ignores mathvariant)', async () => {
      const container = mount('$\\mathbf{E} \\in \\mathbb{R}^3, \\mathcal{L}, \\mathfrak{H}, \\mathbf{0}, \\boldsymbol{\\alpha}$');

      await service.RenderMath(container);

      const identifiers = Array.from(container.querySelectorAll('mi, mn')).map((n) => n.textContent);
      expect(identifiers).toEqual(expect.arrayContaining(['𝐄', 'ℝ', 'ℒ', 'ℌ', '𝟎']));
      expect(container.querySelector('mi[mathvariant="bold"], mi[mathvariant="double-struck"]')).toBeNull();
      // Greek has no Unicode form here: it keeps the attribute for the CSS bold fallback.
      expect(container.querySelector('mi[mathvariant="bold-italic"]')?.textContent).toBe('α');
      // The TeX source in the annotation is untouched.
      expect(container.querySelector('annotation')?.textContent).toContain('\\mathbf{E}');
    });

    it('leaves TeX it cannot parse visible as source, and still typesets the rest', async () => {
      const container = mount('Broken $\\frac{a$ but fine $x^2$');

      expect(await service.RenderMath(container)).toBe(true);

      const broken = container.querySelector('code.mj-math.mj-math-error');
      expect(broken?.textContent).toBe('\\frac{a');
      expect(broken?.getAttribute('title')).toBeTruthy();
      expect(container.querySelectorAll('math').length).toBe(1);
    });

    it('leaves a formula that defines macros as source (expansion bombs)', async () => {
      const container = mount('$\\def\\a{x x x}\\a\\a$ and $y$');

      await service.RenderMath(container);

      const kept = container.querySelector('code.mj-math.mj-math-error');
      expect(kept?.textContent).toBe('\\def\\a{x x x}\\a\\a');
      expect(kept?.getAttribute('title')).toContain('macros');
      expect(container.querySelectorAll('math').length).toBe(1);
    });

    it('caps user sizes', async () => {
      const container = mount('$\\rule{100000em}{100000em}$');

      await service.RenderMath(container);

      const rule = container.querySelector('mspace');
      expect(parseFloat(rule?.getAttribute('width') ?? '0')).toBeLessThanOrEqual(20);
      expect(parseFloat(rule?.getAttribute('height') ?? '0')).toBeLessThanOrEqual(20);
    });

    it('skips placeholders a newer render replaced while KaTeX was loading', async () => {
      let release: (engine: unknown) => void = () => undefined;
      stubLoader(() => new Promise((resolve) => (release = resolve)));
      const container = mount('$x^2$');

      const pending = service.RenderMath(container);
      container.innerHTML = service.Parse('$y^2$'); // the next streamed chunk
      release(katex);

      expect(await pending).toBe(false);
      expect(container.querySelector('math')).toBeNull();
      expect(container.querySelector('code.mj-math')?.textContent).toBe('y^2');
    });

    it('keeps \\href inert (trust is off)', async () => {
      const container = mount('$\\href{javascript:alert(1)}{x}$');

      await service.RenderMath(container);

      // No link anywhere: the command shows as an unrendered "\href". The URL survives only
      // as text inside <annotation>, which is the TeX source and never a link.
      expect(container.querySelector('a, [href]')).toBeNull();
      expect(container.querySelector('mtext')?.textContent).toBe('\\href');
    });

    it('never loads the engine when the document has no math', async () => {
      let loads = 0;
      stubLoader(async () => {
        loads++;
        throw new Error('the engine must not be fetched for a math-free document');
      });

      expect(await service.RenderMath(mount('It costs $5 and $10.'))).toBe(false);
      expect(loads).toBe(0);
    });

    it('leaves the source showing when the lazy chunk cannot be loaded', async () => {
      stubLoader(() => Promise.reject(new Error('chunk fetch failed')));
      const container = mount('$x^2$');

      expect(await service.RenderMath(container)).toBe(false);
      expect(container.querySelector('code.mj-math')?.textContent).toBe('x^2');
    });

    it('does nothing at all when math is disabled by config', async () => {
      let loads = 0;
      stubLoader(async () => {
        loads++;
        throw new Error('the engine must not be fetched when math is disabled');
      });
      service.ConfigureMarked({ enableMath: false });

      const container = mount('$x^2$');

      expect(await service.RenderMath(container)).toBe(false);
      expect(loads).toBe(0);
      expect(container.textContent?.trim()).toBe('$x^2$');
    });
  });

  describe('MathML markup', () => {
    const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
    const mount = (markdown: string): HTMLElement => {
      const container = document.createElement('div');
      container.innerHTML = service.Parse(markdown);
      return container;
    };

    it('keeps a JATS formula as real MathML elements, prefixes removed', () => {
      const c = mount('Loss <mml:math display="inline"><mml:mn>7</mml:mn><mml:mo>×</mml:mo><mml:msup><mml:mn>10</mml:mn><mml:mn>13</mml:mn></mml:msup></mml:math> per pulse.');
      const msup = c.querySelector('msup');
      expect(msup?.namespaceURI).toBe(MATHML_NS);
      expect(msup?.textContent).toBe('1013');
      expect(c.textContent).toContain('per pulse.');
    });

    it('keeps a table\'s column alignment and spacing (DOMPurify misspells one, lacks the other)', () => {
      const c = mount('<math display="block"><mtable columnalign="right left" columnspacing="0em 2em"><mtr><mtd><mi>a</mi></mtd><mtd><mo>=</mo><mi>b</mi></mtd></mtr></mtable></math>');
      const table = c.querySelector('mtable');
      expect(table?.getAttribute('columnalign')).toBe('right left');
      expect(table?.getAttribute('columnspacing')).toBe('0em 2em');
    });

    it('shows the formula once when MathML carries its TeX in an annotation (MathJax, Pandoc, Word)', () => {
      const c = mount('<math><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math>');
      expect(c.querySelector('msup')).not.toBeNull();
      expect(c.textContent?.trim()).toBe('x2');
    });

    it('spells styled letters with Unicode math characters, as for typeset TeX', async () => {
      const c = mount('<math><mi mathvariant="bold">E</mi><mo>∈</mo><msup><mi mathvariant="double-struck">R</mi><mn>3</mn></msup></math>');
      await service.RenderMath(c);
      expect(Array.from(c.querySelectorAll('mi')).map((n) => n.textContent)).toEqual(['𝐄', 'ℝ']);
    });

    // Known DOMPurify bypass shapes through MathML, plus the plain attribute and handler routes.
    it.each([
      ['javascript: href on a MathML element', '<math href="javascript:alert(1)"><mi xlink:href="javascript:alert(1)">x</mi></math>'],
      ['maction with a script link', '<math><maction actiontype="statusline" xlink:href="javascript:alert(1)"><mi>x</mi></maction></math>'],
      ['HTML inside annotation-xml', '<math><annotation-xml encoding="text/html"><img src="x" onerror="alert(1)"></annotation-xml></math>'],
      ['mglyph/style namespace confusion', '<math><mtext><table><mglyph><style><img src="x" onerror="alert(1)">'],
      ['form/math nesting confusion', '<form><math><mtext></form><form><mglyph><style></math><img src="x" onerror="alert(1)">'],
      ['handlers on MathML elements', '<math onclick="alert(1)"><mi onmouseover="alert(1)">x</mi></math>'],
    ])('strips %s', (_name, payload) => {
      const c = mount(payload);
      const attributes = Array.from(c.querySelectorAll('*')).flatMap((el) => Array.from(el.attributes));
      expect(attributes.filter((a) => a.name.startsWith('on'))).toEqual([]);
      expect(attributes.filter((a) => /javascript:/i.test(a.value))).toEqual([]);
      expect(c.querySelector('script')).toBeNull();
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
