import { Injectable } from '@angular/core';
import Prism from 'prismjs';
// TYPE-ONLY — erased at compile time, so it costs nothing at runtime. The mermaid engine
// itself is fetched on demand; see `loadMermaid()`.
import type { Mermaid } from 'mermaid';
// TYPE-ONLY as well: KaTeX is fetched on demand the same way; see `loadKatex()`.
import type katex from 'katex';
import {
  MarkdownEngine,
  MarkdownConfig,
  DEFAULT_MARKDOWN_CONFIG,
  ResolvedMarkdownConfig,
  HeadingInfo,
  HighlightFunction
} from '@memberjunction/markdown-core';
import DOMPurify from 'dompurify';
import { escapeHtml } from '@memberjunction/markdown-core';

// Import common Prism language components
// Additional languages can be imported by the consuming application
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-graphql';

/**
 * Service for parsing and rendering markdown content on the web.
 *
 * The parsing/configuration work (marked setup, custom extensions, HTML and
 * token output) is owned by the framework-agnostic `@memberjunction/markdown-core`
 * {@link MarkdownEngine}. This Angular service is the web shell around it: it
 * injects a Prism-based highlighter into the engine and keeps the browser-only
 * concerns here — Mermaid rendering, copy buttons, and the DOM-based fixup of
 * HTML that marked miscoded as a code block.
 */
/**
 * The DOMPurify instance used for rendered HTML, created once per window and configured
 * once. A private instance rather than the shared default so the hooks below cannot leak
 * into other packages' DOMPurify usage, and so the configuration is parsed once instead
 * of on every render.
 *
 * Profile: HTML + SVG + SVG filters + MathML, which keeps structural markup, inline styles, data
 * attributes, inline vector graphics and formulas written as MathML, and removes the script vectors.
 * MathML is DOMPurify's own profile, with its namespace checks (the mXSS class of bypasses through
 * `<math>` is what those checks exist for). Deviations from
 * DOMPurify's defaults, each deliberate:
 * - FORCE_BODY: a document that starts with `<style>` keeps it (otherwise the parser hoists
 *   a leading style element into <head> and it is dropped); agent-authored mockups start
 *   that way.
 * - SANITIZE_DOM off: DOMPurify would strip any id or name that collides with a document
 *   or form property (`title`, `name`, `location`, ...), which are exactly the slugs
 *   heading ids produce. This app does not read globals off `window` by element id, so
 *   DOM clobbering has no effect here, and heading anchors matter.
 * - `target` on links is kept, with `rel="noopener noreferrer"` enforced when it is set.
 * - `columnalign` and `columnspacing` are added: DOMPurify's MathML list spells the first
 *   `columnsalign` and lacks the second, so every MathML table lost its layout. Both are
 *   presentational. (`form` on `<mo>` stays out: on HTML it associates an element with a form, and
 *   MathML infers an operator's form without it.)
 * - `<use>` is allowed only with a same-document reference (`#id`); external references
 *   are removed. SMIL `<animate>`/`<set>` stay disallowed: they can rewrite `href`.
 */
let purifier: ReturnType<typeof DOMPurify> | null = null;

function getPurifier(): ReturnType<typeof DOMPurify> | null {
  if (purifier) return purifier;
  if (typeof window === 'undefined') return null;
  const instance = DOMPurify(window);
  if (!instance.isSupported) return null;
  instance.setConfig({
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_TAGS: ['use'],
    ADD_ATTR: ['target', 'columnalign', 'columnspacing'],
    FORCE_BODY: true,
    SANITIZE_DOM: false,
  });
  instance.addHook('uponSanitizeAttribute', (node, data) => {
    const name = data.attrName.toLowerCase();
    if (node.nodeName.toLowerCase() === 'use' && (name === 'href' || name === 'xlink:href')) {
      // Same-document sprite references only. Anything else can load an external document.
      data.keepAttr = data.attrValue.trim().startsWith('#');
    }
  });
  instance.addHook('afterSanitizeAttributes', (node) => {
    const tag = node.nodeName.toLowerCase();
    if (tag === 'a' && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (tag === 'use') {
      // The attribute hook above has already dropped any non-fragment reference; a <use>
      // with nothing left to reference is removed rather than left as an empty element.
      const ref = node.getAttribute('href') ?? node.getAttribute('xlink:href');
      if (!ref || !ref.trim().startsWith('#')) {
        node.parentNode?.removeChild(node);
      }
    }
  });
  purifier = instance;
  return purifier;
}

/**
 * Unicode's Mathematical Alphanumeric Symbols by MathML `mathvariant`: the code points of capital
 * A, small a and digit 0 (0 where Unicode has no digits in that style).
 */
const MATH_LETTER_BASES: Readonly<Record<string, readonly [number, number, number]>> = {
  bold: [0x1d400, 0x1d41a, 0x1d7ce],
  italic: [0x1d434, 0x1d44e, 0],
  'bold-italic': [0x1d468, 0x1d482, 0],
  script: [0x1d49c, 0x1d4b6, 0],
  'bold-script': [0x1d4d0, 0x1d4ea, 0],
  fraktur: [0x1d504, 0x1d51e, 0],
  'double-struck': [0x1d538, 0x1d552, 0x1d7d8],
  'bold-fraktur': [0x1d56c, 0x1d586, 0],
  'sans-serif': [0x1d5a0, 0x1d5ba, 0x1d7e2],
  'bold-sans-serif': [0x1d5d4, 0x1d5ee, 0x1d7ec],
  'sans-serif-italic': [0x1d608, 0x1d622, 0],
  'sans-serif-bold-italic': [0x1d63c, 0x1d656, 0],
  monospace: [0x1d670, 0x1d68a, 0x1d7f6],
};

/** Letters Unicode encoded (in Letterlike Symbols) before that block existed; it has holes where they would go. */
const MATH_LETTER_HOLES: Readonly<Record<string, string>> = {
  'italic h': 'ℎ',
  'script B': 'ℬ', 'script E': 'ℰ', 'script F': 'ℱ', 'script H': 'ℋ', 'script I': 'ℐ', 'script L': 'ℒ',
  'script M': 'ℳ', 'script R': 'ℛ', 'script e': 'ℯ', 'script g': 'ℊ', 'script o': 'ℴ',
  'fraktur C': 'ℭ', 'fraktur H': 'ℌ', 'fraktur I': 'ℑ', 'fraktur R': 'ℜ', 'fraktur Z': 'ℨ',
  'double-struck C': 'ℂ', 'double-struck H': 'ℍ', 'double-struck N': 'ℕ', 'double-struck P': 'ℙ',
  'double-struck Q': 'ℚ', 'double-struck R': 'ℝ', 'double-struck Z': 'ℤ',
};

function toMathLetter(char: string, variant: string): string | null {
  const hole = MATH_LETTER_HOLES[`${variant} ${char}`];
  if (hole) return hole;
  const bases = MATH_LETTER_BASES[variant];
  if (!bases) return null;
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCodePoint(bases[0] + code - 65);
  if (code >= 97 && code <= 122) return String.fromCodePoint(bases[1] + code - 97);
  if (code >= 48 && code <= 57 && bases[2]) return String.fromCodePoint(bases[2] + code - 48);
  return null;
}

/**
 * Chrome lays out MathML Core, which honors `mathvariant` only as "normal". KaTeX writes
 * \mathbf{E} as `<mi mathvariant="bold">E</mi>` and \mathbb{R} as `mathvariant="double-struck"`,
 * so Chrome would show plain letters, losing the difference between a vector and a scalar. MathML
 * Core's own answer is to spell such letters with their Unicode math characters (𝐄, ℝ), which every
 * browser renders. Identifiers and numbers only; anything without a Unicode form (Greek, text runs)
 * keeps its attribute and gets the CSS fallback in the component stylesheet.
 */
function useUnicodeMathLetters(root: Element): void {
  root.querySelectorAll('mi[mathvariant], mn[mathvariant]').forEach((node) => {
    const variant = node.getAttribute('mathvariant') ?? '';
    const text = node.textContent ?? '';
    const letters = Array.from(text, (char) => toMathLetter(char, variant));
    if (text && letters.every((letter) => letter !== null)) {
      node.textContent = letters.join('');
      node.removeAttribute('mathvariant');
    }
  });
}

/**
 * TeX that defines macros. KaTeX's `maxExpand` counts expansions, not output, so three kilobytes of
 * `\def` can expand to half a million MathML nodes and freeze the tab, again on every streamed
 * chunk. A rendered answer has no use for its own macros, so such formulas stay source.
 */
const TEX_MACRO_DEFINITION = /\\(?:[gex]?def|let|futurelet|newcommand|renewcommand|providecommand)(?![a-zA-Z])/;

@Injectable({
  providedIn: 'root'
})
export class MarkdownService {
  private engine = new MarkdownEngine();
  private mermaidInitialized = false;
  private lastMermaidTheme: string | null = null;
  private currentConfig: ResolvedMarkdownConfig = { ...DEFAULT_MARKDOWN_CONFIG };
  /** The mermaid engine, once its lazy chunk has landed. Null until a diagram is actually rendered. */
  private mermaidEngine: Mermaid | null = null;
  /** In-flight load, so N diagrams in one document share ONE chunk fetch. */
  private mermaidLoad: Promise<Mermaid> | null = null;
  /** The KaTeX engine, once its lazy chunk has landed. Null until a formula is actually typeset. */
  private katexEngine: typeof katex | null = null;
  /** In-flight load, so N formulas in one document share ONE chunk fetch. */
  private katexLoad: Promise<typeof katex> | null = null;

  /**
   * Prism-backed highlight function injected into the core engine. The engine
   * itself has no Prism dependency — it calls this for the HTML output path.
   */
  private prismHighlight: HighlightFunction = (code: string, lang: string): string => {
    if (lang && Prism.languages[lang]) {
      try {
        return Prism.highlight(code, Prism.languages[lang], lang);
      } catch (e) {
        console.warn(`Prism highlighting failed for language: ${lang}`, e);
      }
    }
    // Return code as-is if language not found or highlighting fails
    return code;
  };

  constructor() {
    this.ConfigureMarked(this.currentConfig);
  }

  /**
   * Configure the underlying engine with the provided options.
   */
  public ConfigureMarked(config: MarkdownConfig): void {
    this.currentConfig = { ...DEFAULT_MARKDOWN_CONFIG, ...config };
    this.engine.configureMarked(this.currentConfig, { highlightFn: this.prismHighlight });
  }

  /** @deprecated Use {@link ConfigureMarked}. */
  public configureMarked(config: MarkdownConfig): void {
    return this.ConfigureMarked(config);
  }

  /**
   * Parse markdown to HTML.
   * @param markdown The markdown string to parse
   * @param config Optional config overrides for this parse operation
   * @returns The rendered HTML string
   */
  public Parse(markdown: string, config?: Partial<MarkdownConfig>): string {
    if (!markdown) return '';

    // Apply config overrides if provided (re-injects the Prism highlighter)
    if (config) {
      this.ConfigureMarked({ ...this.currentConfig, ...config });
    }

    let html = this.engine.parseToHtml(markdown);

    // When HTML passthrough is enabled, fix incorrectly code-wrapped HTML.
    // marked sometimes wraps inline HTML in <pre><code> blocks. This is a
    // DOM-based fixup so it stays in the web service, not the core engine.
    if (this.currentConfig.enableHtml) {
      html = this.unwrapMiscodedHtml(html);
    }

    // The service is the one place every consumer passes through (the component, the chat
    // widget, anything binding parse() output to innerHTML), so the sanitizer runs here.
    // enableJavaScript is the explicit opt-out.
    if (!this.currentConfig.enableJavaScript) {
      html = this.SanitizeHtml(html);
    }

    return html;
  }

  /** @deprecated Use {@link Parse}. */
  public parse(markdown: string, config?: Partial<MarkdownConfig>): string {
    return this.Parse(markdown, config);
  }

  /**
   * Sanitize rendered HTML for binding to innerHTML while preserving layout HTML, inline
   * styles and inline SVG. See the DOMPurify configuration at the top of this file for
   * what is kept and removed. Where no DOM is available to sanitize with, the markup is
   * escaped and rendered as text rather than trusted.
   */
  public SanitizeHtml(html: string): string {
    const instance = getPurifier();
    if (!instance) {
      return escapeHtml(html);
    }
    return instance.sanitize(html);
  }

  /** @deprecated Use {@link SanitizeHtml}. */
  public sanitizeHtml(html: string): string {
    return this.SanitizeHtml(html);
  }

  /**
   * Parse markdown asynchronously (useful for large documents)
   */
  public async ParseAsync(markdown: string, config?: Partial<MarkdownConfig>): Promise<string> {
    return this.Parse(markdown, config);
  }

  /** @deprecated Use {@link ParseAsync}. */
  public async parseAsync(markdown: string, config?: Partial<MarkdownConfig>): Promise<string> {
    return this.ParseAsync(markdown, config);
  }

  /**
   * Resolve the effective mermaid theme.
   * 'auto' maps to 'dark' or 'default' based on the document's data-theme attribute.
   */
  private resolveEffectiveMermaidTheme(): 'default' | 'dark' | 'forest' | 'neutral' | 'base' {
    const configTheme = this.currentConfig.mermaidTheme;
    if (configTheme !== 'auto') {
      return configTheme;
    }
    const isDark = typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-theme') === 'dark';
    return isDark ? 'dark' : 'default';
  }

  /**
   * Fetch the mermaid engine, on first use only.
   *
   * MEASURED BUNDLE DEFERRAL — this is deliberately a dynamic `import()`, NOT a top-level
   * one, and must not be "tidied" back into a static import. `mermaid` and the parsing /
   * graph engines it pulls with it (`@mermaid-js/parser`, `langium`, `chevrotain`,
   * `cytoscape`, `katex`, `d3`) were ~0.95 MB raw of every host's initial download even
   * when no document ever contained a diagram. That is a rounding error for an in-app
   * host and the whole cost for a CDN-loaded embedding of the realtime session overlay
   * (MJ #3882). Documents with no diagram now never fetch the chunk at all.
   *
   * The in-flight promise is cached so N diagrams in one document share one fetch; a
   * FAILED load clears it, so a later render can retry. Retries are bounded by
   * user-driven render calls — there is no loop here.
   */
  private async loadMermaid(): Promise<Mermaid> {
    if (this.mermaidEngine) {
      return this.mermaidEngine;
    }

    this.mermaidLoad ??= import('mermaid').then((module) => module.default);

    try {
      this.mermaidEngine = await this.mermaidLoad;
      return this.mermaidEngine;
    } catch (error) {
      this.mermaidLoad = null;
      throw error;
    }
  }

  /**
   * Initialize Mermaid with the current theme configuration.
   * Re-initializes when the effective theme changes.
   * @param mermaid The lazily-loaded mermaid engine (see {@link loadMermaid})
   */
  private initializeMermaid(mermaid: Mermaid): void {
    const effectiveTheme = this.resolveEffectiveMermaidTheme();

    if (this.mermaidInitialized && this.lastMermaidTheme === effectiveTheme) {
      return;
    }

    mermaid.initialize({
      startOnLoad: false,
      theme: effectiveTheme,
      securityLevel: 'loose',
      fontFamily: 'inherit',
      suppressErrorRendering: true // Suppress visual error diagrams - errors go to console only
    });

    this.mermaidInitialized = true;
    this.lastMermaidTheme = effectiveTheme;
  }

  /**
   * Render Mermaid diagrams in a container element
   * Call this after the HTML has been inserted into the DOM
   * @param container The DOM element containing mermaid code blocks
   */
  public async RenderMermaid(container: HTMLElement): Promise<boolean> {
    if (!this.currentConfig.enableMermaid) return false;

    // Find all mermaid code blocks BEFORE touching the engine — this is the branch the
    // deferral hangs off: no diagrams in this document means no chunk fetch at all.
    const mermaidBlocks = container.querySelectorAll('pre > code.language-mermaid, .mermaid');

    if (mermaidBlocks.length === 0) return false;

    let mermaid: Mermaid;
    try {
      mermaid = await this.loadMermaid();
    } catch (error) {
      // The chunk could not be fetched (offline, blocked host, bad deploy). Say so on
      // every block we were going to render — an empty panel would look like the diagram
      // simply wasn't there.
      console.error('Failed to load the Mermaid diagram engine:', error);
      this.markMermaidBlocksFailed(mermaidBlocks, 'Diagram engine failed to load');
      return false;
    }

    this.initializeMermaid(mermaid);

    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i];
      const code = block.textContent || '';

      if (!code.trim()) continue;

      try {
        // Create a unique ID for this diagram
        const id = `mermaid-${Date.now()}-${i}`;

        // Render the diagram
        const { svg } = await mermaid.render(id, code);

        // Replace the code block with the rendered SVG
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram';
        wrapper.innerHTML = svg;

        // Replace the pre element (parent of code) or the mermaid element itself
        const elementToReplace = block.tagName === 'CODE' ? block.parentElement : block;
        elementToReplace?.parentNode?.replaceChild(wrapper, elementToReplace);
      } catch (error) {
        console.warn('Mermaid rendering failed:', error);
        // Show it failed on this block — the source stays visible underneath.
        this.markMermaidBlocksFailed([block], 'Diagram rendering failed');
      }
    }

    return true;
  }

  /** @deprecated Use {@link RenderMermaid}. */
  public async renderMermaid(container: HTMLElement): Promise<boolean> {
    return this.RenderMermaid(container);
  }

  /**
   * Fetch the KaTeX engine, on first use only. A dynamic `import()` under the "genuine bundle-size
   * deferral" allowance (typescript-style rules, category 3), like {@link loadMermaid}: KaTeX is
   * 277 KB minified (76 KB gzipped), and documents with no math never download it. A failed load
   * clears the cached promise so a later render can retry.
   */
  private async loadKatex(): Promise<typeof katex> {
    if (this.katexEngine) {
      return this.katexEngine;
    }

    this.katexLoad ??= import('katex').then((module) => module.default);

    try {
      this.katexEngine = await this.katexLoad;
      return this.katexEngine;
    } catch (error) {
      this.katexLoad = null;
      throw error;
    }
  }

  /**
   * Typeset TeX math in a container: every `code.mj-math` placeholder that markdown-core's
   * math extension emitted. Call this after the HTML has been inserted into the DOM. MathML that
   * arrived as markup is already rendered by the browser; it only gets the letter fix below.
   *
   * The output is MathML, which current browsers lay out natively, so hosts need no KaTeX
   * stylesheet or fonts. KaTeX builds the nodes itself from the TeX text (no HTML string is
   * parsed) and runs with `trust` off, so `\href`, `\url` and `\includegraphics` stay inert.
   * A formula KaTeX cannot parse, one that defines macros, or an engine that fails to load leaves
   * the TeX source showing as code. User sizes are capped at 20em.
   *
   * Whether math is on is the caller's decision (`<mj-markdown>` checks its `EnableMath` input):
   * this service is a root singleton whose config the last-rendered component set, so it is no
   * guide to the container in hand. Without math enabled at parse time there are no placeholders.
   *
   * @param container The DOM element containing the math placeholders
   * @returns true if at least one TeX formula was typeset
   */
  public async RenderMath(container: HTMLElement): Promise<boolean> {
    // MathML that arrived as markup (a formula from a JATS article) needs the same Chrome fix as
    // KaTeX's output, and no engine.
    useUnicodeMathLetters(container);

    // Find the placeholders BEFORE touching the engine: no math, no chunk fetch.
    const placeholders = container.querySelectorAll<HTMLElement>('code.mj-math');
    if (placeholders.length === 0) return false;

    let engine: typeof katex;
    try {
      engine = await this.loadKatex();
    } catch (error) {
      console.error('Failed to load the KaTeX math engine:', error);
      return false;
    }

    let typeset = false;
    placeholders.forEach((placeholder) => {
      // A newer render (the next streamed chunk) replaced it while KaTeX was loading.
      if (!container.contains(placeholder)) return;
      const tex = placeholder.textContent ?? '';
      const target = document.createElement('span');
      try {
        if (TEX_MACRO_DEFINITION.test(tex)) {
          throw new Error('Formulas that define macros are not typeset');
        }
        engine.render(tex, target, {
          displayMode: placeholder.classList.contains('mj-math-display'),
          output: 'mathml',
          throwOnError: true,
          strict: 'ignore',
          maxSize: 20
        });
        useUnicodeMathLetters(target);
        placeholder.replaceWith(...Array.from(target.childNodes));
        typeset = true;
      } catch (error) {
        placeholder.classList.add('mj-math-error');
        placeholder.title = error instanceof Error ? error.message : 'This formula could not be typeset';
      }
    });

    return typeset;
  }

  /**
   * Mark mermaid blocks as un-renderable, so the failure is VISIBLE rather than a block of
   * raw diagram source the reader can't explain. The `.mermaid-error` class carries the
   * error styling and a default caption; `data-mermaid-error` overrides that caption with
   * the specific reason (see `.mermaid-error[data-mermaid-error]::before` in the component
   * stylesheet).
   *
   * @param blocks The mermaid code blocks (or `.mermaid` elements) that could not be rendered
   * @param message Short reason shown above the un-rendered source
   */
  private markMermaidBlocksFailed(blocks: ArrayLike<Element>, message: string): void {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const target = block.tagName === 'CODE' ? block.parentElement : block;
      target?.classList.add('mermaid-error');
      target?.setAttribute('data-mermaid-error', message);
    }
  }

  /**
   * Highlight code blocks with Prism
   * Call this after the HTML has been inserted into the DOM
   * @param container The DOM element containing code blocks
   */
  public HighlightCode(container: HTMLElement): void {
    if (!this.currentConfig.enableHighlight) return;

    // Prism.highlightAllUnder handles finding and highlighting code blocks
    Prism.highlightAllUnder(container);
  }

  /** @deprecated Use {@link HighlightCode}. */
  public highlightCode(container: HTMLElement): void {
    return this.HighlightCode(container);
  }

  /**
   * Add copy buttons to code blocks
   * @param container The DOM element containing code blocks
   */
  public AddCodeCopyButtons(container: HTMLElement): void {
    if (!this.currentConfig.enableCodeCopy) return;

    const codeBlocks = container.querySelectorAll('pre > code');

    codeBlocks.forEach((codeBlock) => {
      const pre = codeBlock.parentElement;
      if (!pre || pre.querySelector('.code-copy-btn')) return; // Already has button

      // Create copy button
      const button = document.createElement('button');
      button.className = 'code-copy-btn';
      button.innerHTML = '<i class="fas fa-copy"></i>';
      button.title = 'Copy code';
      button.type = 'button';

      button.addEventListener('click', async () => {
        const code = codeBlock.textContent || '';

        try {
          await navigator.clipboard.writeText(code);
          button.innerHTML = '<i class="fas fa-check"></i>';
          button.classList.add('copied');

          setTimeout(() => {
            button.innerHTML = '<i class="fas fa-copy"></i>';
            button.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy code:', err);
          button.innerHTML = '<i class="fas fa-times"></i>';

          setTimeout(() => {
            button.innerHTML = '<i class="fas fa-copy"></i>';
          }, 2000);
        }
      });

      // Add toolbar wrapper
      const toolbar = document.createElement('div');
      toolbar.className = 'code-toolbar';
      toolbar.appendChild(button);

      // Make pre position relative for absolute positioning of toolbar
      pre.style.position = 'relative';
      pre.appendChild(toolbar);
    });
  }

  /** @deprecated Use {@link AddCodeCopyButtons}. */
  public addCodeCopyButtons(container: HTMLElement): void {
    return this.AddCodeCopyButtons(container);
  }

  /**
   * Initialize collapsible heading functionality
   * This method is a no-op - the component handles event binding
   * @param container The DOM element containing collapsible sections
   */
  public InitializeCollapsibleHeadings(_container: HTMLElement): void {
    // Event binding is handled by the component's setupCollapsibleListeners
    // This method exists for API compatibility but does nothing
  }

  /** @deprecated Use {@link InitializeCollapsibleHeadings}. */
  public initializeCollapsibleHeadings(_container: HTMLElement): void {
    return this.InitializeCollapsibleHeadings(_container);
  }

  /**
   * Get the list of headings from the last parsed document
   * Useful for building table of contents
   */
  public GetHeadingList(): HeadingInfo[] {
    return this.engine.getHeadingList();
  }

  /** @deprecated Use {@link GetHeadingList}. */
  public getHeadingList(): HeadingInfo[] {
    return this.GetHeadingList();
  }

  /**
   * Get the current configuration
   */
  public GetConfig(): ResolvedMarkdownConfig {
    return this.engine.getConfig();
  }

  /** @deprecated Use {@link GetConfig}. */
  public getConfig(): ResolvedMarkdownConfig {
    return this.GetConfig();
  }

  /**
   * Reset configuration to defaults
   */
  public ResetConfig(): void {
    this.ConfigureMarked(DEFAULT_MARKDOWN_CONFIG);
  }

  /** @deprecated Use {@link ResetConfig}. */
  public resetConfig(): void {
    return this.ResetConfig();
  }

  /**
   * Check if a language is supported by Prism
   */
  public IsLanguageSupported(lang: string): boolean {
    return !!Prism.languages[lang];
  }

  /** @deprecated Use {@link IsLanguageSupported}. */
  public isLanguageSupported(lang: string): boolean {
    return this.IsLanguageSupported(lang);
  }

  /**
   * Get list of supported Prism languages
   */
  public GetSupportedLanguages(): string[] {
    return Object.keys(Prism.languages).filter(
      lang => typeof Prism.languages[lang] === 'object'
    );
  }

  /** @deprecated Use {@link GetSupportedLanguages}. */
  public getSupportedLanguages(): string[] {
    return this.GetSupportedLanguages();
  }

  /**
   * Fix HTML that was incorrectly wrapped in <pre><code> blocks by marked.
   * This happens when marked interprets inline HTML (especially indented HTML)
   * as code blocks. We detect this by checking if the code block content
   * looks like valid HTML structure rather than actual code.
   *
   * Only processes code blocks WITHOUT a language class (e.g., language-javascript)
   * to avoid unwrapping intentional code examples.
   */
  private unwrapMiscodedHtml(html: string): string {
    // Quick check - if no pre tags, nothing to do
    if (!html.includes('<pre>')) {
      return html;
    }

    // Skip if SVG is present - DOMParser mangles SVG elements like <rect>
    // when parsing as 'text/html' due to namespace issues
    if (html.includes('<svg')) {
      return html;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
      const container = doc.body.firstChild as HTMLElement;

      if (!container) return html;

      // Find all pre > code elements WITHOUT a language class
      // Code blocks with language classes (language-javascript, etc.) are intentional
      const preElements = container.querySelectorAll('pre');
      let modified = false;

      for (const pre of Array.from(preElements)) {
        const code = pre.querySelector('code');
        if (!code) continue;

        // Skip if code has a language class - it's intentional code
        const hasLanguageClass = code.className && /language-\w+/.test(code.className);
        if (hasLanguageClass) continue;

        // Get the text content (this is HTML-decoded by the browser)
        const content = code.textContent?.trim() || '';

        // Check if this looks like HTML that was incorrectly wrapped
        if (this.looksLikeStructuralHtml(content)) {
          // Verify it parses as valid HTML with actual elements
          const testDoc = parser.parseFromString(content, 'text/html');
          const hasStructure = testDoc.body.children.length > 0 ||
                              (testDoc.body.innerHTML.trim().length > 0 &&
                               testDoc.body.innerHTML.includes('<'));

          if (hasStructure) {
            // Replace the <pre> with the actual HTML content. The nodes are built inside a
            // <template> of the inert DOMParser document, never on the live `document`:
            // setting innerHTML on a live element fires image error handlers at parse time,
            // before the sanitizer in parse() has seen the markup. A <template> also parses
            // in body context, so a mockup that starts with <style> keeps it (a full-document
            // parse would hoist it into <head> and drop it).
            const template = doc.createElement('template');
            template.innerHTML = content;
            pre.replaceWith(template.content);
            modified = true;
          }
        }
      }

      if (modified) {
        return container.innerHTML;
      }
    } catch (error) {
      console.warn('Error in unwrapMiscodedHtml:', error);
    }

    return html;
  }

  /**
   * Check if content looks like structural HTML that was incorrectly
   * wrapped in a code block. We look for common HTML element patterns
   * that indicate this is meant to be rendered HTML, not code.
   */
  private looksLikeStructuralHtml(content: string): boolean {
    // Must start with < to be HTML
    if (!content.startsWith('<')) return false;

    // Must end with > (closing tag)
    if (!content.endsWith('>')) return false;

    // Check for common structural HTML tags that indicate layout HTML
    // These are tags that would typically appear in a UI mockup/prototype
    const structuralTagPattern = /<(div|span|table|tr|td|th|thead|tbody|p|ul|ol|li|section|article|header|footer|nav|main|aside|form|input|button|label|select|option|textarea|h[1-6]|img|a|strong|em|b|i|br|hr)\b/i;

    if (!structuralTagPattern.test(content)) return false;

    // Additional check: should have multiple tags or nested structure
    // Single self-closing tags like <br> or <img> shouldn't trigger unwrapping
    const tagCount = (content.match(/<\w+/g) || []).length;
    if (tagCount < 2) return false;

    // Check it's not just showing HTML as an example (common in docs)
    // If content has lots of &lt; or &gt; it's probably escaped HTML being shown
    if (content.includes('&lt;') || content.includes('&gt;')) return false;

    return true;
  }
}
