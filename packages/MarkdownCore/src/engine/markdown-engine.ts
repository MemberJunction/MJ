import { Marked, TokensList } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId, getHeadingList } from 'marked-gfm-heading-id';
import markedAlert from 'marked-alert';
import { markedSmartypants } from 'marked-smartypants';
import {
  MarkdownConfig,
  DEFAULT_MARKDOWN_CONFIG,
  ResolvedMarkdownConfig,
  HeadingInfo,
  HighlightFunction
} from '../types/markdown.types';
import { createCollapsibleHeadingsExtension } from '../extensions/collapsible-headings.extension';
import { createSvgRendererExtension } from '../extensions/svg-renderer.extension';
import { createHtmlBlockRepairExtension } from '../extensions/html-block-repair.extension';
import { escapeHtml } from '../helpers/escape';

/**
 * Options that tune a single {@link MarkdownEngine.configureMarked} call.
 */
export interface ConfigureMarkedOptions {
  /**
   * Syntax-highlight function used by the HTML output path. The engine itself
   * carries no highlighter dependency — web callers pass a Prism-backed
   * function; the token (AST) path ignores this entirely.
   */
  highlightFn?: HighlightFunction;
}

/**
 * Framework-agnostic markdown engine.
 *
 * Owns the `marked` configuration and the MemberJunction custom extensions
 * (SVG code blocks, collapsible headings, GitHub alerts, heading ids,
 * smartypants). It produces either:
 *
 * - an **HTML string** via {@link parseToHtml} — consumed by the Angular
 *   `ng-markdown` component (which then does its DOM post-processing), or
 * - a **token tree (AST)** via {@link parseToTokens} — consumed by the React
 *   Native renderer (and any other non-DOM target).
 *
 * The engine has no DOM, Prism, or Mermaid dependency. Highlighting is injected
 * by the caller; Mermaid and copy-button wiring are the host's responsibility.
 */
export class MarkdownEngine {
  private marked: Marked;
  private currentConfig: ResolvedMarkdownConfig = { ...DEFAULT_MARKDOWN_CONFIG };
  private headingList: HeadingInfo[] = [];
  private highlightFn?: HighlightFunction;

  constructor() {
    this.marked = new Marked();
    this.configureMarked(this.currentConfig);
  }

  /**
   * Configure the marked instance with the provided options.
   * @param config Markdown configuration (merged over defaults).
   * @param options Engine options, e.g. an injected highlight function.
   */
  public configureMarked(config: MarkdownConfig, options?: ConfigureMarkedOptions): void {
    this.currentConfig = { ...DEFAULT_MARKDOWN_CONFIG, ...config };
    if (options && 'highlightFn' in options) {
      this.highlightFn = options.highlightFn;
    }

    // Create a fresh Marked instance
    this.marked = new Marked();

    // Configure base options
    this.marked.setOptions({
      gfm: true,
      breaks: true
    });

    const extensions: Parameters<Marked['use']> = [];

    // Repair HTML blocks split by a blank line (e.g. PRD mockups) so embedded
    // raw HTML renders instead of showing as an escaped code block. Always on -
    // precisely scoped to misparsed HTML, leaves prose and fenced code untouched.
    extensions.push(createHtmlBlockRepairExtension());

    // SVG code block renderer - MUST be before syntax highlighting
    // so it can intercept svg blocks before the highlighter processes them.
    if (this.currentConfig.enableSvgRenderer) {
      extensions.push(createSvgRendererExtension());
    }

    // Syntax highlighting via an injected highlight function (e.g. Prism on web).
    if (this.currentConfig.enableHighlight && this.highlightFn) {
      const highlightFn = this.highlightFn;
      const svgEnabled = this.currentConfig.enableSvgRenderer;
      extensions.push(
        markedHighlight({
          langPrefix: 'language-',
          highlight: (code: string, lang: string) => {
            // Skip SVG blocks - they're handled by the SVG renderer
            if (lang === 'svg' && svgEnabled) {
              return code;
            }
            return highlightFn(code, lang);
          }
        })
      );
    }

    // GitHub-style heading IDs
    if (this.currentConfig.enableHeadingIds) {
      extensions.push(
        gfmHeadingId({
          prefix: this.currentConfig.headingIdPrefix
        })
      );
    }

    // GitHub-style alerts
    if (this.currentConfig.enableAlerts) {
      extensions.push(markedAlert());
    }

    // Collapsible headings (custom extension, HTML output path)
    if (this.currentConfig.enableCollapsibleHeadings) {
      extensions.push(
        createCollapsibleHeadingsExtension({
          startLevel: this.currentConfig.collapsibleHeadingLevel,
          defaultExpanded: this.currentConfig.collapsibleDefaultExpanded,
          autoExpandLevels: this.currentConfig.autoExpandLevels
        })
      );
    }

    // Smartypants for typography (curly quotes, em/en dashes, ellipses)
    if (this.currentConfig.enableSmartypants) {
      extensions.push(markedSmartypants());
    }

    // Apply all extensions
    if (extensions.length > 0) {
      this.marked.use(...extensions);
    }
  }

  /**
   * Parse markdown to an HTML string.
   *
   * This is the web output path. Note it does NOT perform the DOM-based
   * `unwrapMiscodedHtml` fixup that the Angular service applies afterward —
   * that step requires a real DOM and stays in the host.
   *
   * @param markdown The markdown string to parse
   * @param config Optional config overrides for this parse operation
   * @returns The rendered HTML string
   */
  public parseToHtml(markdown: string, config?: Partial<MarkdownConfig>): string {
    if (!markdown) return '';

    if (config) {
      this.configureMarked({ ...this.currentConfig, ...config });
    }

    try {
      // Preprocess markdown to fix indentation in HTML blocks so marked does
      // not treat indented HTML as code blocks (pure string transform).
      let processedMarkdown = markdown;
      if (this.currentConfig.enableHtml) {
        processedMarkdown = this.normalizeHtmlBlockIndentation(markdown);
      }

      const html = this.marked.parse(processedMarkdown) as string;

      // Capture heading list after parsing
      if (this.currentConfig.enableHeadingIds) {
        this.headingList = getHeadingList() as HeadingInfo[];
      }

      return html;
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return `<pre class="markdown-error">${escapeHtml(markdown)}</pre>`;
    }
  }

  /**
   * Parse markdown to a token tree (AST).
   *
   * This is the framework-agnostic path consumed by non-DOM renderers (React
   * Native, etc.). Custom block tokenizers (e.g. `svgCodeBlock`) are applied,
   * but render-time hooks (highlight markup, collapsible HTML wrapping) are
   * NOT — the renderer decides how to present each token.
   *
   * @param markdown The markdown string to tokenize
   * @param config Optional config overrides for this parse operation
   * @returns The marked token list
   */
  public parseToTokens(markdown: string, config?: Partial<MarkdownConfig>): TokensList {
    if (config) {
      this.configureMarked({ ...this.currentConfig, ...config });
    }

    if (!markdown) {
      return this.marked.lexer('');
    }

    let processedMarkdown = markdown;
    if (this.currentConfig.enableHtml) {
      processedMarkdown = this.normalizeHtmlBlockIndentation(markdown);
    }

    return this.marked.lexer(processedMarkdown);
  }

  /**
   * Get the list of headings from the last HTML parse.
   * Useful for building a table of contents.
   */
  public getHeadingList(): HeadingInfo[] {
    return this.headingList;
  }

  /**
   * Get the current resolved configuration.
   */
  public getConfig(): ResolvedMarkdownConfig {
    return { ...this.currentConfig };
  }

  /**
   * Reset configuration to defaults (keeps any injected highlight function).
   */
  public resetConfig(): void {
    this.configureMarked(DEFAULT_MARKDOWN_CONFIG);
  }

  /**
   * Normalize indentation in HTML blocks to prevent marked from treating
   * indented HTML as code blocks (4 spaces = code block in markdown).
   *
   * This finds HTML blocks (starting with common block-level tags) and
   * removes ALL leading whitespace from lines within those blocks to ensure
   * marked doesn't interpret any nested content as code blocks.
   */
  private normalizeHtmlBlockIndentation(markdown: string): string {
    // Match HTML blocks that start with common block-level tags
    const htmlBlockTags = [
      'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'ul', 'ol', 'li', 'p', 'section', 'article', 'header',
      'footer', 'nav', 'main', 'aside', 'form', 'svg', 'figure'
    ];

    const tagPattern = htmlBlockTags.join('|');
    // Match opening tag at start of line (possibly with leading whitespace)
    const htmlBlockStartRegex = new RegExp(`^[ \\t]*<(${tagPattern})\\b`, 'i');

    const lines = markdown.split('\n');
    const result: string[] = [];
    let inHtmlBlock = false;
    const tagStack: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trimStart();

      if (!inHtmlBlock) {
        // Check if this line starts an HTML block
        const match = trimmedLine.match(htmlBlockStartRegex);
        if (match) {
          inHtmlBlock = true;
          const tag = match[1].toLowerCase();

          // Push to stack if it's not a self-closing tag on this line
          if (!this.isSelfClosingLine(trimmedLine, tag)) {
            tagStack.push(tag);
          }

          // Remove leading indentation
          result.push(trimmedLine);
          continue;
        }
        result.push(line);
      } else {
        // We're inside an HTML block - remove ALL leading whitespace
        // to prevent any nested content from being treated as code blocks.
        this.updateTagStack(trimmedLine, tagStack, htmlBlockTags);

        result.push(trimmedLine);

        // Check if we've closed all HTML blocks
        if (tagStack.length === 0) {
          inHtmlBlock = false;
        }
      }
    }

    return result.join('\n');
  }

  /**
   * Check if a line contains a self-closing tag or opens and closes the same tag
   */
  private isSelfClosingLine(line: string, tag: string): boolean {
    // Check for self-closing syntax: <tag ... />
    if (new RegExp(`<${tag}[^>]*/>`, 'i').test(line)) {
      return true;
    }
    // Check if tag opens and closes on same line: <tag>...</tag>
    const openCount = (line.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
    const closeCount = (line.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    return openCount > 0 && openCount === closeCount;
  }

  /**
   * Update the tag stack based on opening/closing tags in the line
   */
  private updateTagStack(line: string, tagStack: string[], validTags: string[]): void {
    const openTagRegex = /<(\w+)\b[^>]*(?<!\/)>/gi;
    const closeTagRegex = /<\/(\w+)>/gi;

    let match;

    // Process closing tags first (they might close tags opened earlier)
    while ((match = closeTagRegex.exec(line)) !== null) {
      const tag = match[1].toLowerCase();
      const idx = tagStack.lastIndexOf(tag);
      if (idx !== -1) {
        tagStack.splice(idx, 1);
      }
    }

    // Process opening tags
    while ((match = openTagRegex.exec(line)) !== null) {
      const tag = match[1].toLowerCase();
      // Only track block-level tags we care about
      if (validTags.includes(tag)) {
        if (!this.isSelfClosingLine(line, tag)) {
          const closeRegex = new RegExp(`</${tag}>`, 'gi');
          const opens = (line.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
          const closes = (line.match(closeRegex) || []).length;
          if (opens > closes) {
            tagStack.push(tag);
          }
        }
      }
    }
  }
}
