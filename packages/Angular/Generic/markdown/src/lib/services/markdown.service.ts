import { Injectable } from '@angular/core';
import Prism from 'prismjs';
import mermaid from 'mermaid';
import {
  MarkdownEngine,
  MarkdownConfig,
  DEFAULT_MARKDOWN_CONFIG,
  ResolvedMarkdownConfig,
  HeadingInfo,
  HighlightFunction
} from '@memberjunction/markdown-core';

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
@Injectable({
  providedIn: 'root'
})
export class MarkdownService {
  private engine = new MarkdownEngine();
  private mermaidInitialized = false;
  private lastMermaidTheme: string | null = null;
  private currentConfig: ResolvedMarkdownConfig = { ...DEFAULT_MARKDOWN_CONFIG };

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
    this.configureMarked(this.currentConfig);
  }

  /**
   * Configure the underlying engine with the provided options.
   */
  public configureMarked(config: MarkdownConfig): void {
    this.currentConfig = { ...DEFAULT_MARKDOWN_CONFIG, ...config };
    this.engine.configureMarked(this.currentConfig, { highlightFn: this.prismHighlight });
  }

  /**
   * Parse markdown to HTML.
   * @param markdown The markdown string to parse
   * @param config Optional config overrides for this parse operation
   * @returns The rendered HTML string
   */
  public parse(markdown: string, config?: Partial<MarkdownConfig>): string {
    if (!markdown) return '';

    // Apply config overrides if provided (re-injects the Prism highlighter)
    if (config) {
      this.configureMarked({ ...this.currentConfig, ...config });
    }

    let html = this.engine.parseToHtml(markdown);

    // When HTML passthrough is enabled, fix incorrectly code-wrapped HTML.
    // marked sometimes wraps inline HTML in <pre><code> blocks. This is a
    // DOM-based fixup so it stays in the web service, not the core engine.
    if (this.currentConfig.enableHtml) {
      html = this.unwrapMiscodedHtml(html);
    }

    return html;
  }

  /**
   * Parse markdown asynchronously (useful for large documents)
   */
  public async parseAsync(markdown: string, config?: Partial<MarkdownConfig>): Promise<string> {
    return this.parse(markdown, config);
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
   * Initialize Mermaid with the current theme configuration.
   * Re-initializes when the effective theme changes.
   */
  private initializeMermaid(): void {
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
  public async renderMermaid(container: HTMLElement): Promise<boolean> {
    if (!this.currentConfig.enableMermaid) return false;

    this.initializeMermaid();

    // Find all mermaid code blocks
    const mermaidBlocks = container.querySelectorAll('pre > code.language-mermaid, .mermaid');

    if (mermaidBlocks.length === 0) return false;

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
        // Add error class to show it failed
        const parent = block.tagName === 'CODE' ? block.parentElement : block;
        parent?.classList.add('mermaid-error');
      }
    }

    return true;
  }

  /**
   * Highlight code blocks with Prism
   * Call this after the HTML has been inserted into the DOM
   * @param container The DOM element containing code blocks
   */
  public highlightCode(container: HTMLElement): void {
    if (!this.currentConfig.enableHighlight) return;

    // Prism.highlightAllUnder handles finding and highlighting code blocks
    Prism.highlightAllUnder(container);
  }

  /**
   * Add copy buttons to code blocks
   * @param container The DOM element containing code blocks
   */
  public addCodeCopyButtons(container: HTMLElement): void {
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

  /**
   * Initialize collapsible heading functionality
   * This method is a no-op - the component handles event binding
   * @param container The DOM element containing collapsible sections
   */
  public initializeCollapsibleHeadings(_container: HTMLElement): void {
    // Event binding is handled by the component's setupCollapsibleListeners
    // This method exists for API compatibility but does nothing
  }

  /**
   * Get the list of headings from the last parsed document
   * Useful for building table of contents
   */
  public getHeadingList(): HeadingInfo[] {
    return this.engine.getHeadingList();
  }

  /**
   * Get the current configuration
   */
  public getConfig(): ResolvedMarkdownConfig {
    return this.engine.getConfig();
  }

  /**
   * Reset configuration to defaults
   */
  public resetConfig(): void {
    this.configureMarked(DEFAULT_MARKDOWN_CONFIG);
  }

  /**
   * Check if a language is supported by Prism
   */
  public isLanguageSupported(lang: string): boolean {
    return !!Prism.languages[lang];
  }

  /**
   * Get list of supported Prism languages
   */
  public getSupportedLanguages(): string[] {
    return Object.keys(Prism.languages).filter(
      lang => typeof Prism.languages[lang] === 'object'
    );
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
            // Replace the <pre> with the actual HTML content
            const wrapper = document.createElement('div');
            wrapper.className = 'unwrapped-html';
            wrapper.innerHTML = content;

            // Move all children from wrapper to replace pre
            const fragment = document.createDocumentFragment();
            while (wrapper.firstChild) {
              fragment.appendChild(wrapper.firstChild);
            }
            pre.parentNode?.replaceChild(fragment, pre);
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
