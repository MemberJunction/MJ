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
  AfterViewInit,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkdownService } from '../services/markdown.service';
import { MarkdownConfig, DEFAULT_MARKDOWN_CONFIG, MarkdownRenderEvent, HeadingInfo } from '@memberjunction/markdown-core';
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
  template: ` <div class="mj-markdown-container" [class]="containerClass" [innerHTML]="renderedContent"></div> `,
  styleUrls: ['./markdown.component.css'],
  encapsulation: ViewEncapsulation.None, // Allow styles to penetrate into rendered content
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownComponent implements OnChanges, AfterViewInit, OnDestroy {
  /**
   * The markdown content to render
   */
  @Input() Data: string = '';

  /** @deprecated Use {@link Data}. */
  @Input() set data(value: string) {
    this.Data = value;
  }
  /** @deprecated Use {@link Data}. */
  get data(): string {
    return this.Data;
  }

  /**
   * Enable syntax highlighting
   */
  @Input() EnableHighlight: boolean = DEFAULT_MARKDOWN_CONFIG.enableHighlight;

  /** @deprecated Use {@link EnableHighlight}. */
  @Input() set enableHighlight(value: boolean) {
    this.EnableHighlight = value;
  }
  /** @deprecated Use {@link EnableHighlight}. */
  get enableHighlight(): boolean {
    return this.EnableHighlight;
  }

  /**
   * Enable Mermaid diagram rendering
   */
  @Input() EnableMermaid: boolean = DEFAULT_MARKDOWN_CONFIG.enableMermaid;

  /** @deprecated Use {@link EnableMermaid}. */
  @Input() set enableMermaid(value: boolean) {
    this.EnableMermaid = value;
  }
  /** @deprecated Use {@link EnableMermaid}. */
  get enableMermaid(): boolean {
    return this.EnableMermaid;
  }

  /**
   * Enable copy button on code blocks
   */
  @Input() EnableCodeCopy: boolean = DEFAULT_MARKDOWN_CONFIG.enableCodeCopy;

  /** @deprecated Use {@link EnableCodeCopy}. */
  @Input() set enableCodeCopy(value: boolean) {
    this.EnableCodeCopy = value;
  }
  /** @deprecated Use {@link EnableCodeCopy}. */
  get enableCodeCopy(): boolean {
    return this.EnableCodeCopy;
  }

  /**
   * Enable collapsible heading sections
   */
  @Input() EnableCollapsibleHeadings: boolean = DEFAULT_MARKDOWN_CONFIG.enableCollapsibleHeadings;

  /** @deprecated Use {@link EnableCollapsibleHeadings}. */
  @Input() set enableCollapsibleHeadings(value: boolean) {
    this.EnableCollapsibleHeadings = value;
  }
  /** @deprecated Use {@link EnableCollapsibleHeadings}. */
  get enableCollapsibleHeadings(): boolean {
    return this.EnableCollapsibleHeadings;
  }

  /**
   * Heading level at which to start collapsing
   */
  @Input() CollapsibleHeadingLevel: 1 | 2 | 3 | 4 | 5 | 6 = DEFAULT_MARKDOWN_CONFIG.collapsibleHeadingLevel;

  /** @deprecated Use {@link CollapsibleHeadingLevel}. */
  @Input() set collapsibleHeadingLevel(value: 1 | 2 | 3 | 4 | 5 | 6) {
    this.CollapsibleHeadingLevel = value;
  }
  /** @deprecated Use {@link CollapsibleHeadingLevel}. */
  get collapsibleHeadingLevel(): 1 | 2 | 3 | 4 | 5 | 6 {
    return this.CollapsibleHeadingLevel;
  }

  /**
   * Whether collapsible sections should be expanded by default
   */
  @Input() CollapsibleDefaultExpanded: boolean = DEFAULT_MARKDOWN_CONFIG.collapsibleDefaultExpanded;

  /** @deprecated Use {@link CollapsibleDefaultExpanded}. */
  @Input() set collapsibleDefaultExpanded(value: boolean) {
    this.CollapsibleDefaultExpanded = value;
  }
  /** @deprecated Use {@link CollapsibleDefaultExpanded}. */
  get collapsibleDefaultExpanded(): boolean {
    return this.CollapsibleDefaultExpanded;
  }

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
  @Input() AutoExpandLevels?: number[];

  /** @deprecated Use {@link AutoExpandLevels}. */
  @Input() set autoExpandLevels(value: number[] | undefined) {
    this.AutoExpandLevels = value;
  }
  /** @deprecated Use {@link AutoExpandLevels}. */
  get autoExpandLevels(): number[] | undefined {
    return this.AutoExpandLevels;
  }

  /**
   * Enable GitHub-style alerts
   */
  @Input() EnableAlerts: boolean = DEFAULT_MARKDOWN_CONFIG.enableAlerts;

  /** @deprecated Use {@link EnableAlerts}. */
  @Input() set enableAlerts(value: boolean) {
    this.EnableAlerts = value;
  }
  /** @deprecated Use {@link EnableAlerts}. */
  get enableAlerts(): boolean {
    return this.EnableAlerts;
  }

  /**
   * Enable smartypants for typography (curly quotes, em/en dashes, ellipses)
   */
  @Input() EnableSmartypants: boolean = DEFAULT_MARKDOWN_CONFIG.enableSmartypants;

  /** @deprecated Use {@link EnableSmartypants}. */
  @Input() set enableSmartypants(value: boolean) {
    this.EnableSmartypants = value;
  }
  /** @deprecated Use {@link EnableSmartypants}. */
  get enableSmartypants(): boolean {
    return this.EnableSmartypants;
  }

  /**
   * Enable SVG code block rendering
   * When enabled, ```svg code blocks are rendered as actual SVG images
   */
  @Input() EnableSvgRenderer: boolean = DEFAULT_MARKDOWN_CONFIG.enableSvgRenderer;

  /** @deprecated Use {@link EnableSvgRenderer}. */
  @Input() set enableSvgRenderer(value: boolean) {
    this.EnableSvgRenderer = value;
  }
  /** @deprecated Use {@link EnableSvgRenderer}. */
  get enableSvgRenderer(): boolean {
    return this.EnableSvgRenderer;
  }

  /**
   * Enable raw HTML passthrough in markdown content.
   * Scripts and event handlers are still stripped unless enableJavaScript is true.
   */
  @Input() EnableHtml: boolean = DEFAULT_MARKDOWN_CONFIG.enableHtml;

  /** @deprecated Use {@link EnableHtml}. */
  @Input() set enableHtml(value: boolean) {
    this.EnableHtml = value;
  }
  /** @deprecated Use {@link EnableHtml}. */
  get enableHtml(): boolean {
    return this.EnableHtml;
  }

  /**
   * Enable JavaScript in HTML content (<script> tags and on* handlers).
   * WARNING: Major security risk - only enable for fully trusted content.
   */
  @Input() EnableJavaScript: boolean = DEFAULT_MARKDOWN_CONFIG.enableJavaScript;

  /** @deprecated Use {@link EnableJavaScript}. */
  @Input() set enableJavaScript(value: boolean) {
    this.EnableJavaScript = value;
  }
  /** @deprecated Use {@link EnableJavaScript}. */
  get enableJavaScript(): boolean {
    return this.EnableJavaScript;
  }

  /**
   * Enable heading IDs for anchor links
   */
  @Input() EnableHeadingIds: boolean = DEFAULT_MARKDOWN_CONFIG.enableHeadingIds;

  /** @deprecated Use {@link EnableHeadingIds}. */
  @Input() set enableHeadingIds(value: boolean) {
    this.EnableHeadingIds = value;
  }
  /** @deprecated Use {@link EnableHeadingIds}. */
  get enableHeadingIds(): boolean {
    return this.EnableHeadingIds;
  }

  /**
   * Prefix for heading IDs
   */
  @Input() HeadingIdPrefix: string = DEFAULT_MARKDOWN_CONFIG.headingIdPrefix;

  /** @deprecated Use {@link HeadingIdPrefix}. */
  @Input() set headingIdPrefix(value: string) {
    this.HeadingIdPrefix = value;
  }
  /** @deprecated Use {@link HeadingIdPrefix}. */
  get headingIdPrefix(): string {
    return this.HeadingIdPrefix;
  }

  /**
   * Enable line numbers in code blocks
   */
  @Input() EnableLineNumbers: boolean = DEFAULT_MARKDOWN_CONFIG.enableLineNumbers;

  /** @deprecated Use {@link EnableLineNumbers}. */
  @Input() set enableLineNumbers(value: boolean) {
    this.EnableLineNumbers = value;
  }
  /** @deprecated Use {@link EnableLineNumbers}. */
  get enableLineNumbers(): boolean {
    return this.EnableLineNumbers;
  }

  /**
   * Custom CSS class for the container
   */
  @Input() ContainerClass: string = '';

  /** @deprecated Use {@link ContainerClass}. */
  @Input() set containerClass(value: string) {
    this.ContainerClass = value;
  }
  /** @deprecated Use {@link ContainerClass}. */
  get containerClass(): string {
    return this.ContainerClass;
  }

  /**
   * Mermaid theme.
   * 'auto' (default) detects light/dark from the document's data-theme attribute.
   */
  @Input() MermaidTheme: 'auto' | 'default' | 'dark' | 'forest' | 'neutral' | 'base' = DEFAULT_MARKDOWN_CONFIG.mermaidTheme;

  /** @deprecated Use {@link MermaidTheme}. */
  @Input() set mermaidTheme(value: 'auto' | 'default' | 'dark' | 'forest' | 'neutral' | 'base') {
    this.MermaidTheme = value;
  }
  /** @deprecated Use {@link MermaidTheme}. */
  get mermaidTheme(): 'auto' | 'default' | 'dark' | 'forest' | 'neutral' | 'base' {
    return this.MermaidTheme;
  }

  /**
   * Whether to sanitize HTML output
   */
  @Input() Sanitize: boolean = DEFAULT_MARKDOWN_CONFIG.sanitize;

  /** @deprecated Use {@link Sanitize}. */
  @Input() set sanitize(value: boolean) {
    this.Sanitize = value;
  }
  /** @deprecated Use {@link Sanitize}. */
  get sanitize(): boolean {
    return this.Sanitize;
  }

  /**
   * Emitted when rendering is complete
   */
  @Output() Rendered = new EventEmitter<MarkdownRenderEvent>();

  /**
   * @deprecated Use {@link Rendered}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (rendered) keeps working. Must stay AFTER Rendered: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() rendered = this.Rendered;

  /**
   * Emitted when a heading anchor is clicked
   */
  @Output() HeadingClick = new EventEmitter<HeadingInfo>();

  /**
   * @deprecated Use {@link HeadingClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (headingClick) keeps working. Must stay AFTER HeadingClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() headingClick = this.HeadingClick;

  /**
   * Emitted when code is copied to clipboard
   */
  @Output() CodeCopied = new EventEmitter<string>();

  /**
   * @deprecated Use {@link CodeCopied}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (codeCopied) keeps working. Must stay AFTER CodeCopied: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() codeCopied = this.CodeCopied;

  /**
   * The sanitized HTML content to display
   */
  public RenderedContent: SafeHtml = '';

  /** @deprecated Use {@link RenderedContent}. */
  public get renderedContent(): SafeHtml {
    return this.RenderedContent;
  }
  /** @deprecated Use {@link RenderedContent}. */
  public set renderedContent(value: SafeHtml) {
    this.RenderedContent = value;
  }

  /**
   * Public accessor for the component's element reference.
   * Provided for backward compatibility with ngx-markdown API.
   */
  public get Element(): ElementRef<HTMLElement> {
    return this.elementRef;
  }

  /** @deprecated Use {@link Element}. */
  public get element(): ElementRef<HTMLElement> {
    return this.Element;
  }

  private renderStartTime: number = 0;
  private hasMermaid: boolean = false;
  private hasCodeBlocks: boolean = false;
  private themeObserver: MutationObserver | null = null;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private sanitizer: DomSanitizer,
    private markdownService: MarkdownService,
    private cdr: ChangeDetectorRef,
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
    if (this.Data) {
      this.postRenderProcessing();
    }

    this.setupThemeObserver();
  }

  ngOnDestroy(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.cleanupEventListeners();
  }

  /**
   * Render the markdown content
   */
  private render(): void {
    if (!this.Data) {
      this.RenderedContent = '';
      this.cdr.markForCheck();
      return;
    }

    this.renderStartTime = performance.now();

    // Build config from inputs
    const config: MarkdownConfig = {
      enableHighlight: this.EnableHighlight,
      enableMermaid: this.EnableMermaid,
      enableCodeCopy: this.EnableCodeCopy,
      enableCollapsibleHeadings: this.EnableCollapsibleHeadings,
      collapsibleHeadingLevel: this.CollapsibleHeadingLevel,
      collapsibleDefaultExpanded: this.CollapsibleDefaultExpanded,
      autoExpandLevels: this.AutoExpandLevels,
      enableAlerts: this.EnableAlerts,
      enableSmartypants: this.EnableSmartypants,
      enableSvgRenderer: this.EnableSvgRenderer,
      enableHtml: this.EnableHtml,
      enableJavaScript: this.EnableJavaScript,
      enableHeadingIds: this.EnableHeadingIds,
      headingIdPrefix: this.HeadingIdPrefix,
      mermaidTheme: this.MermaidTheme,
      sanitize: this.Sanitize,
    };

    // Configure service and parse
    this.markdownService.configureMarked(config);
    let html = this.markdownService.parse(this.Data);

    // Check for mermaid and code blocks
    this.hasMermaid = html.includes('language-mermaid') || html.includes('class="mermaid"');
    this.hasCodeBlocks = html.includes('<pre>') && html.includes('<code');

    // Sanitize if enabled
    // Note: We bypass Angular's sanitizer when SVG renderer or HTML passthrough is enabled
    // because it strips SVG elements and most HTML layout tags.
    const bypassAngularSanitizer = this.EnableSvgRenderer || this.EnableHtml;
    if (this.Sanitize && !bypassAngularSanitizer) {
      const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html);
      html = sanitized || '';
    }

    // When Angular's sanitizer is bypassed, the HTML has already been sanitized by
    // MarkdownService.parse() (DOMPurify, HTML + SVG profiles) unless enableJavaScript
    // opted out. Nothing further to do here.

    // Trust the HTML for display
    this.RenderedContent = this.sanitizer.bypassSecurityTrustHtml(html);
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
    if (this.EnableCodeCopy && this.hasCodeBlocks) {
      this.markdownService.addCodeCopyButtons(container as HTMLElement);
    }

    // Initialize collapsible headings
    if (this.EnableCollapsibleHeadings) {
      this.markdownService.initializeCollapsibleHeadings(container as HTMLElement);
      this.setupCollapsibleListeners(container as HTMLElement);
    }

    // Render mermaid diagrams (async)
    if (this.EnableMermaid && this.hasMermaid) {
      await this.markdownService.renderMermaid(container as HTMLElement);
    }

    // Setup heading click listeners
    if (this.EnableHeadingIds) {
      this.setupHeadingClickListeners(container as HTMLElement);
    }

    // Setup code copy listeners for custom event emission
    if (this.EnableCodeCopy) {
      this.setupCodeCopyListeners(container as HTMLElement);
    }

    // Emit rendered event
    const renderTime = performance.now() - this.renderStartTime;
    const headingIds = this.markdownService.getHeadingList();

    this.Rendered.emit({
      html: (container as HTMLElement).innerHTML,
      renderTime,
      hasMermaid: this.hasMermaid,
      hasCodeBlocks: this.hasCodeBlocks,
      headingIds,
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

        this.HeadingClick.emit({
          id,
          text,
          level,
          raw: text,
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
          this.CodeCopied.emit(code.textContent || '');
        }
      });
    });
  }

  /**
   * Watch the document's data-theme attribute for changes.
   * When the app theme switches (light ↔ dark) and mermaidTheme is 'auto',
   * re-render so mermaid diagrams pick up the new theme.
   */
  private setupThemeObserver(): void {
    if (typeof MutationObserver === 'undefined') return;

    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          this.onThemeAttributeChanged();
          break;
        }
      }
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  /**
   * Called when data-theme changes on the document root.
   * Triggers a full re-render when mermaid auto-theming is active.
   */
  private onThemeAttributeChanged(): void {
    if (this.MermaidTheme === 'auto' && this.EnableMermaid && this.hasMermaid && this.Data) {
      this.render();
    }
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
  public Refresh(): void {
    this.render();
  }

  /** @deprecated Use {@link Refresh}. */
  public refresh(): void {
    return this.Refresh();
  }

  /**
   * Get the current heading list (for TOC building)
   */
  public GetHeadings(): HeadingInfo[] {
    return this.markdownService.getHeadingList();
  }

  /** @deprecated Use {@link GetHeadings}. */
  public getHeadings(): HeadingInfo[] {
    return this.GetHeadings();
  }

  /**
   * Scroll to a heading by ID
   */
  public ScrollToHeading(headingId: string): void {
    const container = this.elementRef.nativeElement.querySelector('.mj-markdown-container');
    if (!container) return;

    const heading = container.querySelector(`#${headingId}`);
    if (heading) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** @deprecated Use {@link ScrollToHeading}. */
  public scrollToHeading(headingId: string): void {
    return this.ScrollToHeading(headingId);
  }
}
