import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  SecurityContext,
  ViewEncapsulation,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  AfterViewInit
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkdownService } from '../services/markdown.service';
import {
  MarkdownConfig,
  DEFAULT_MARKDOWN_CONFIG,
  MarkdownRenderEvent,
  HeadingInfo
} from '../types/markdown.types';
// Collapsible section toggle is handled inline in setupCollapsibleListeners

/**
 * Angular component for rendering markdown content.
 *
 * Features:
 * - Prism.js syntax highlighting for code blocks
 * - Mermaid diagram rendering
 * - Copy-to-clipboard for code blocks
 * - Collapsible heading sections
 * - GitHub-style alerts and heading IDs
 *
 * Usage:
 * ```html
 * <mj-markdown [data]="markdownContent"></mj-markdown>
 *
 * <mj-markdown
 *   [data]="content"
 *   [enableMermaid]="true"
 *   [enableCollapsibleHeadings]="true"
 *   (rendered)="onRendered($event)">
 * </mj-markdown>
 * ```
 */
@Component({
  selector: 'mj-markdown',
  standalone: false,
  template: `
    <div
      class="mj-markdown-container"
      [class]="containerClass"
      [innerHTML]="renderedContent">
    </div>
  `,
  styleUrls: ['./markdown.component.css'],
  encapsulation: ViewEncapsulation.None, // Allow styles to penetrate into rendered content
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarkdownComponent implements OnChanges, AfterViewInit, OnDestroy {
  /**
   * The markdown content to render
   */
  @Input() data: string = '';

  /**
   * Enable syntax highlighting
   */
  @Input() enableHighlight: boolean = DEFAULT_MARKDOWN_CONFIG.enableHighlight;

  /**
   * Enable Mermaid diagram rendering
   */
  @Input() enableMermaid: boolean = DEFAULT_MARKDOWN_CONFIG.enableMermaid;

  /**
   * Enable copy button on code blocks
   */
  @Input() enableCodeCopy: boolean = DEFAULT_MARKDOWN_CONFIG.enableCodeCopy;

  /**
   * Enable collapsible heading sections
   */
  @Input() enableCollapsibleHeadings: boolean = DEFAULT_MARKDOWN_CONFIG.enableCollapsibleHeadings;

  /**
   * Heading level at which to start collapsing
   */
  @Input() collapsibleHeadingLevel: 1 | 2 | 3 | 4 | 5 | 6 = DEFAULT_MARKDOWN_CONFIG.collapsibleHeadingLevel;

  /**
   * Whether collapsible sections should be expanded by default
   */
  @Input() collapsibleDefaultExpanded: boolean = DEFAULT_MARKDOWN_CONFIG.collapsibleDefaultExpanded;

  /**
   * Specify which heading levels should start expanded.
   * Array of heading levels (2-6) that should be expanded by default.
   * Takes precedence over collapsibleDefaultExpanded for specified levels.
   *
   * Examples:
   * - [2] = Only h2 expanded, h3-h6 collapsed
   * - [2, 3] = h2 and h3 expanded, h4-h6 collapsed
   * - [] = All collapsed
   * - undefined = Uses collapsibleDefaultExpanded for all levels
   */
  @Input() autoExpandLevels?: number[];

  /**
   * Enable GitHub-style alerts
   */
  @Input() enableAlerts: boolean = DEFAULT_MARKDOWN_CONFIG.enableAlerts;

  /**
   * Enable smartypants for typography (curly quotes, em/en dashes, ellipses)
   */
  @Input() enableSmartypants: boolean = DEFAULT_MARKDOWN_CONFIG.enableSmartypants;

  /**
   * Enable SVG code block rendering
   * When enabled, ```svg code blocks are rendered as actual SVG images
   */
  @Input() enableSvgRenderer: boolean = DEFAULT_MARKDOWN_CONFIG.enableSvgRenderer;

  /**
   * Enable raw HTML passthrough in markdown content.
   * Scripts and event handlers are still stripped unless enableJavaScript is true.
   */
  @Input() enableHtml: boolean = DEFAULT_MARKDOWN_CONFIG.enableHtml;

  /**
   * Enable JavaScript in HTML content (<script> tags and on* handlers).
   * WARNING: Major security risk - only enable for fully trusted content.
   */
  @Input() enableJavaScript: boolean = DEFAULT_MARKDOWN_CONFIG.enableJavaScript;

  /**
   * Enable heading IDs for anchor links
   */
  @Input() enableHeadingIds: boolean = DEFAULT_MARKDOWN_CONFIG.enableHeadingIds;

  /**
   * Prefix for heading IDs
   */
  @Input() headingIdPrefix: string = DEFAULT_MARKDOWN_CONFIG.headingIdPrefix;

  /**
   * Enable line numbers in code blocks
   */
  @Input() enableLineNumbers: boolean = DEFAULT_MARKDOWN_CONFIG.enableLineNumbers;

  /**
   * Custom CSS class for the container
   */
  @Input() containerClass: string = '';

  /**
   * Mermaid theme
   */
  @Input() mermaidTheme: 'default' | 'dark' | 'forest' | 'neutral' | 'base' = DEFAULT_MARKDOWN_CONFIG.mermaidTheme;

  /**
   * Whether to sanitize HTML output
   */
  @Input() sanitize: boolean = DEFAULT_MARKDOWN_CONFIG.sanitize;

  /**
   * Emitted when rendering is complete
   */
  @Output() rendered = new EventEmitter<MarkdownRenderEvent>();

  /**
   * Emitted when a heading anchor is clicked
   */
  @Output() headingClick = new EventEmitter<HeadingInfo>();

  /**
   * Emitted when code is copied to clipboard
   */
  @Output() codeCopied = new EventEmitter<string>();

  /**
   * The sanitized HTML content to display
   */
  public renderedContent: SafeHtml = '';

  /**
   * Public accessor for the component's element reference.
   * Provided for backward compatibility with ngx-markdown API.
   */
  public get element(): ElementRef<HTMLElement> {
    return this.elementRef;
  }

  private renderStartTime: number = 0;
  private hasMermaid: boolean = false;
  private hasCodeBlocks: boolean = false;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private sanitizer: DomSanitizer,
    private markdownService: MarkdownService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Check if any relevant input changed
    const needsRerender =
      changes['data'] ||
      changes['enableHighlight'] ||
      changes['enableMermaid'] ||
      changes['enableCodeCopy'] ||
      changes['enableCollapsibleHeadings'] ||
      changes['collapsibleHeadingLevel'] ||
      changes['collapsibleDefaultExpanded'] ||
      changes['autoExpandLevels'] ||
      changes['enableAlerts'] ||
      changes['enableSmartypants'] ||
      changes['enableSvgRenderer'] ||
      changes['enableHtml'] ||
      changes['enableJavaScript'] ||
      changes['enableHeadingIds'] ||
      changes['headingIdPrefix'] ||
      changes['mermaidTheme'] ||
      changes['sanitize'];

    if (needsRerender) {
      this.render();
    }
  }

  ngAfterViewInit(): void {
    // Initial render if data was provided
    if (this.data) {
      this.postRenderProcessing();
    }
  }

  ngOnDestroy(): void {
    // Cleanup any event listeners
    this.cleanupEventListeners();
  }

  /**
   * Render the markdown content
   */
  private render(): void {
    if (!this.data) {
      this.renderedContent = '';
      this.cdr.markForCheck();
      return;
    }

    this.renderStartTime = performance.now();

    // Build config from inputs
    const config: MarkdownConfig = {
      enableHighlight: this.enableHighlight,
      enableMermaid: this.enableMermaid,
      enableCodeCopy: this.enableCodeCopy,
      enableCollapsibleHeadings: this.enableCollapsibleHeadings,
      collapsibleHeadingLevel: this.collapsibleHeadingLevel,
      collapsibleDefaultExpanded: this.collapsibleDefaultExpanded,
      autoExpandLevels: this.autoExpandLevels,
      enableAlerts: this.enableAlerts,
      enableSmartypants: this.enableSmartypants,
      enableSvgRenderer: this.enableSvgRenderer,
      enableHtml: this.enableHtml,
      enableJavaScript: this.enableJavaScript,
      enableHeadingIds: this.enableHeadingIds,
      headingIdPrefix: this.headingIdPrefix,
      mermaidTheme: this.mermaidTheme,
      sanitize: this.sanitize
    };

    // Configure service and parse
    this.markdownService.configureMarked(config);
    let html = this.markdownService.parse(this.data);

    // Check for mermaid and code blocks
    this.hasMermaid = html.includes('language-mermaid') || html.includes('class="mermaid"');
    this.hasCodeBlocks = html.includes('<pre>') && html.includes('<code');

    // Sanitize if enabled
    // Note: We bypass Angular's sanitizer when SVG renderer or HTML passthrough is enabled
    // because it strips SVG elements and most HTML layout tags.
    const bypassAngularSanitizer = this.enableSvgRenderer || this.enableHtml;
    if (this.sanitize && !bypassAngularSanitizer) {
      const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html);
      html = sanitized || '';
    }

    // Strip JavaScript unless explicitly enabled
    // This removes <script> tags and on* event handlers while keeping layout HTML
    if (bypassAngularSanitizer && !this.enableJavaScript) {
      html = this.stripJavaScript(html);
    }

    // Trust the HTML for display
    this.renderedContent = this.sanitizer.bypassSecurityTrustHtml(html);
    this.cdr.markForCheck();

    // Schedule post-render processing for next tick (after DOM update)
    Promise.resolve().then(() => this.postRenderProcessing());
  }

  /**
   * Process rendered content after DOM update
   * Handles syntax highlighting, mermaid rendering, copy buttons, etc.
   */
  private async postRenderProcessing(): Promise<void> {
    const container = this.elementRef.nativeElement.querySelector('.mj-markdown-container');
    if (!container) return;

    // Add copy buttons to code blocks
    if (this.enableCodeCopy && this.hasCodeBlocks) {
      this.markdownService.addCodeCopyButtons(container as HTMLElement);
    }

    // Initialize collapsible headings
    if (this.enableCollapsibleHeadings) {
      this.markdownService.initializeCollapsibleHeadings(container as HTMLElement);
      this.setupCollapsibleListeners(container as HTMLElement);
    }

    // Render mermaid diagrams (async)
    if (this.enableMermaid && this.hasMermaid) {
      await this.markdownService.renderMermaid(container as HTMLElement);
    }

    // Setup heading click listeners
    if (this.enableHeadingIds) {
      this.setupHeadingClickListeners(container as HTMLElement);
    }

    // Setup code copy listeners for custom event emission
    if (this.enableCodeCopy) {
      this.setupCodeCopyListeners(container as HTMLElement);
    }

    // Emit rendered event
    const renderTime = performance.now() - this.renderStartTime;
    const headingIds = this.markdownService.getHeadingList();

    this.rendered.emit({
      html: (container as HTMLElement).innerHTML,
      renderTime,
      hasMermaid: this.hasMermaid,
      hasCodeBlocks: this.hasCodeBlocks,
      headingIds
    });
  }

  /**
   * Setup collapsible sections by adding toggle buttons and click listeners
   */
  private setupCollapsibleListeners(container: HTMLElement): void {
    const sections = container.querySelectorAll('.collapsible-section');

    sections.forEach((section) => {
      const wrapper = section.querySelector(':scope > .collapsible-heading-wrapper') as HTMLElement | null;
      if (!wrapper) return;

      // Check if toggle already exists
      if (wrapper.querySelector('.collapsible-toggle')) return;

      const isExpanded = !section.classList.contains('collapsed');
      const hasChildren = section.querySelector('.collapsible-section') !== null;

      // Create toggle button (chevron)
      const toggle = document.createElement('span');
      toggle.className = 'collapsible-toggle';
      toggle.setAttribute('role', 'button');
      toggle.setAttribute('tabindex', '0');
      toggle.setAttribute('aria-expanded', String(isExpanded));
      toggle.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 12l4-4-4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

      // Insert toggle before heading
      wrapper.insertBefore(toggle, wrapper.firstChild);

      // Add action buttons container (only if has children)
      if (hasChildren) {
        const actions = this.createActionButtons(section as HTMLElement);
        wrapper.appendChild(actions);
      }

      // Make the whole wrapper clickable
      wrapper.style.cursor = 'pointer';

      // Add click listener to wrapper (but not on action buttons)
      wrapper.addEventListener('click', (e: Event) => {
        const target = e.target as HTMLElement;
        // Don't toggle if clicking on action buttons
        if (target.closest('.collapsible-actions')) return;

        e.preventDefault();
        e.stopPropagation();
        this.toggleSection(section as HTMLElement, toggle);
      });

      // Add keyboard support
      wrapper.addEventListener('keydown', (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.closest('.collapsible-actions')) return;

        const keyEvent = e as KeyboardEvent;
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          e.preventDefault();
          this.toggleSection(section as HTMLElement, toggle);
        }
      });
    });
  }

  /**
   * Create the expand/collapse all action buttons for sections with children
   */
  private createActionButtons(section: HTMLElement): HTMLElement {
    const container = document.createElement('span');
    container.className = 'collapsible-actions';

    // Expand all button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'collapsible-action-btn expand-all';
    expandBtn.setAttribute('type', 'button');
    expandBtn.setAttribute('title', 'Expand all');
    expandBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 10l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    expandBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.expandDescendants(section);
      // Also expand the section itself if collapsed
      if (section.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
        const toggle = section.querySelector(':scope > .collapsible-heading-wrapper .collapsible-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
      }
    });

    // Collapse all button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'collapsible-action-btn collapse-all';
    collapseBtn.setAttribute('type', 'button');
    collapseBtn.setAttribute('title', 'Collapse all');
    collapseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 10l4-4 4 4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 14l4-4 4 4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    collapseBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.collapseDescendants(section);
    });

    container.appendChild(expandBtn);
    container.appendChild(collapseBtn);

    return container;
  }

  /**
   * Toggle a collapsible section
   * @param section The section element to toggle
   * @param toggle The toggle button element
   */
  private toggleSection(section: HTMLElement, toggle: HTMLElement): void {
    const isCollapsed = section.classList.contains('collapsed');

    // Toggle the section
    section.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(isCollapsed));
    // Children retain their state - CSS handles visibility via parent collapse
  }

  /**
   * Collapse all descendant sections (used by action button)
   */
  private collapseDescendants(section: HTMLElement): void {
    const descendants = section.querySelectorAll('.collapsible-section');
    descendants.forEach((desc) => {
      desc.classList.add('collapsed');
      const toggle = desc.querySelector(':scope > .collapsible-heading-wrapper .collapsible-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /**
   * Expand all descendant sections (used by action button)
   */
  private expandDescendants(section: HTMLElement): void {
    const descendants = section.querySelectorAll('.collapsible-section');
    descendants.forEach((desc) => {
      desc.classList.remove('collapsed');
      const toggle = desc.querySelector(':scope > .collapsible-heading-wrapper .collapsible-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  }

  /**
   * Setup click listeners for heading anchors
   */
  private setupHeadingClickListeners(container: HTMLElement): void {
    const headings = container.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');

    headings.forEach((heading) => {
      heading.addEventListener('click', () => {
        const id = heading.getAttribute('id') || '';
        const text = heading.textContent || '';
        const level = parseInt(heading.tagName.charAt(1), 10);

        this.headingClick.emit({
          id,
          text,
          level,
          raw: text
        });
      });
    });
  }

  /**
   * Setup listeners to emit code copy events
   */
  private setupCodeCopyListeners(container: HTMLElement): void {
    const copyButtons = container.querySelectorAll('.code-copy-btn');

    copyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const pre = button.closest('pre');
        const code = pre?.querySelector('code');
        if (code) {
          this.codeCopied.emit(code.textContent || '');
        }
      });
    });
  }

  /**
   * Cleanup event listeners
   */
  private cleanupEventListeners(): void {
    const container = this.elementRef.nativeElement.querySelector('.mj-markdown-container');
    if (!container) return;

    // Clone and replace to remove all listeners
    const clone = container.cloneNode(true);
    container.parentNode?.replaceChild(clone, container);
  }

  /**
   * Force a re-render of the markdown content
   */
  public refresh(): void {
    this.render();
  }

  /**
   * Get the current heading list (for TOC building)
   */
  public getHeadings(): HeadingInfo[] {
    return this.markdownService.getHeadingList();
  }

  /**
   * Scroll to a heading by ID
   */
  public scrollToHeading(headingId: string): void {
    const container = this.elementRef.nativeElement.querySelector('.mj-markdown-container');
    if (!container) return;

    const heading = container.querySelector(`#${headingId}`);
    if (heading) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Strip JavaScript from HTML content while preserving layout HTML.
   * Removes <script> tags, on* event handlers, and javascript: URLs.
   */
  private stripJavaScript(html: string): string {
    // Remove <script> tags and their content
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove on* event handlers (onclick, onload, onerror, etc.)
    html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    html = html.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

    // Remove javascript: URLs from href and src attributes
    html = html.replace(/\s+href\s*=\s*["']javascript:[^"']*["']/gi, '');
    html = html.replace(/\s+src\s*=\s*["']javascript:[^"']*["']/gi, '');

    // Remove data: URLs that could contain scripts (data:text/html, etc.)
    html = html.replace(/\s+src\s*=\s*["']data:text\/html[^"']*["']/gi, '');

    return html;
  }
}
