import { Injectable } from '@angular/core';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId, getHeadingList } from 'marked-gfm-heading-id';
import markedAlert from 'marked-alert';
import { markedSmartypants } from 'marked-smartypants';
import Prism from 'prismjs';
import mermaid from 'mermaid';
import {
  MarkdownConfig,
  DEFAULT_MARKDOWN_CONFIG,
  HeadingInfo,
  MarkdownRenderEvent
} from '../types/markdown.types';
import { createCollapsibleHeadingsExtension } from '../extensions/collapsible-headings.extension';
import { createSvgRendererExtension } from '../extensions/svg-renderer.extension';

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

// Type for config with optional autoExpandLevels
type ResolvedMarkdownConfig = Required<Omit<MarkdownConfig, 'autoExpandLevels'>> & { autoExpandLevels?: number[] };

/**
 * Service for parsing and rendering markdown content.
 * Uses marked.js with various extensions for syntax highlighting,
 * diagrams, alerts, and more.
 */
@Injectable({
  providedIn: 'root'
})
export class MarkdownService {
  private marked: Marked;
  private mermaidInitialized = false;
  private currentConfig: ResolvedMarkdownConfig = { ...DEFAULT_MARKDOWN_CONFIG };
  private headingList: HeadingInfo[] = [];

  constructor() {
    this.marked = new Marked();
    this.configureMarked(this.currentConfig);
  }

  /**
   * Configure the marked instance with the provided options
   */
  public configureMarked(config: MarkdownConfig): void {
    this.currentConfig = { ...DEFAULT_MARKDOWN_CONFIG, ...config };

    // Create a fresh Marked instance
    this.marked = new Marked();

    // Configure base options
    this.marked.setOptions({
      gfm: true,
      breaks: true
    });

    // Apply extensions based on config
    const extensions: any[] = [];

    // SVG code block renderer - MUST be before syntax highlighting
    // so it can intercept svg blocks before Prism processes them
    if (this.currentConfig.enableSvgRenderer) {
      extensions.push(createSvgRendererExtension());
    }

    // Syntax highlighting with Prism
    if (this.currentConfig.enableHighlight) {
      extensions.push(
        markedHighlight({
          langPrefix: 'language-',
          highlight: (code: string, lang: string) => {
            // Skip SVG blocks - they're handled by the SVG renderer
            if (lang === 'svg' && this.currentConfig.enableSvgRenderer) {
              return code;
            }
            if (lang && Prism.languages[lang]) {
              try {
                return Prism.highlight(code, Prism.languages[lang], lang);
              } catch (e) {
                console.warn(`Prism highlighting failed for language: ${lang}`, e);
              }
            }
            // Return code as-is if language not found or highlighting fails
            return code;
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

    // Collapsible headings (custom extension)
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
   * Initialize Mermaid with the current theme configuration
   */
  private initializeMermaid(): void {
    if (this.mermaidInitialized) return;

    mermaid.initialize({
      startOnLoad: false,
      theme: this.currentConfig.mermaidTheme,
      securityLevel: 'loose',
      fontFamily: 'inherit',
      suppressErrorRendering: true // Suppress visual error diagrams - errors go to console only
    });

    this.mermaidInitialized = true;
  }

  /**
   * Parse markdown to HTML
   * @param markdown The markdown string to parse
   * @param config Optional config overrides for this parse operation
   * @returns The rendered HTML string
   */
  public parse(markdown: string, config?: Partial<MarkdownConfig>): string {
    if (!markdown) return '';

    // Apply config overrides if provided
    if (config) {
      this.configureMarked({ ...this.currentConfig, ...config });
    }

    try {
      const html = this.marked.parse(markdown) as string;

      // Capture heading list after parsing
      if (this.currentConfig.enableHeadingIds) {
        this.headingList = getHeadingList() as HeadingInfo[];
      }

      return html;
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return `<pre class="markdown-error">${this.escapeHtml(markdown)}</pre>`;
    }
  }

  /**
   * Parse markdown asynchronously (useful for large documents)
   */
  public async parseAsync(markdown: string, config?: Partial<MarkdownConfig>): Promise<string> {
    return this.parse(markdown, config);
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
    return this.headingList;
  }

  /**
   * Get the current configuration
   */
  public getConfig(): ResolvedMarkdownConfig {
    return { ...this.currentConfig };
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
   * Escape HTML entities for safe display
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
