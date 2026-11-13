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
import { MountDiagramViewer, type DiagramViewerInstance } from '@memberjunction/ai-diagrams/viewer';

/** A rendered image the reader clicked or activated: what a host needs to show it full size. */
export class ImageClickedEventArgs {
  constructor(
    /** The image's `src`, as rendered (absolute). */
    public readonly Src: string,
    /** Its alt text; '' when it has none. */
    public readonly Alt: string,
  ) {}
}
// Collapsible section toggle is handled inline in setupCollapsibleListeners

/** Inputs whose change re-parses the markdown, by camelCase name. */
const RERENDER_INPUTS = new Set([
  'data',
  'enableHighlight',
  'enableMermaid',
  'enableMath',
  'enableCodeCopy',
  'enableCollapsibleHeadings',
  'collapsibleHeadingLevel',
  'collapsibleDefaultExpanded',
  'autoExpandLevels',
  'enableAlerts',
  'enableSmartypants',
  'enableSvgRenderer',
  'enableHtml',
  'enableJavaScript',
  'enableHeadingIds',
  'headingIdPrefix',
  'mermaidTheme',
  'sanitize',
  'openLinksInNewTab',
]);

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
  template: ` <div class="mj-markdown-container" [class]="containerClass"></div> `,
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
   * Enable TeX math (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`), typeset as MathML
   */
  @Input() EnableMath: boolean = DEFAULT_MARKDOWN_CONFIG.enableMath;

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
   * Whether links open in a new browser tab (`target="_blank"` with `rel="noopener noreferrer"`).
   * In-page fragment links (`#heading`) and non-navigational schemes (`mailto:`, `tel:`, `sms:`)
   * stay in the current tab. Default `false`.
   */
  @Input() OpenLinksInNewTab: boolean = false;

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
   * Emitted when a rendered image is clicked (or focused and activated with Enter or Space), so a
   * host can show it full size; a chat opens its image viewer. Images react only while something
   * is bound to this output, so a host that does not listen keeps inert images. An image inside a
   * link keeps the link's behaviour and is not reported.
   */
  @Output() ImageClicked = new EventEmitter<ImageClickedEventArgs>();

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
  private hasMath: boolean = false;
  private hasCodeBlocks: boolean = false;
  private themeObserver: MutationObserver | null = null;
  private diagramViewers: DiagramViewerInstance[] = [];
  private renderSeq = 0;
  private isDestroyed = false;

  // Streaming fast-path state
  private lastRenderedMarkdown: string = '';
  private committedPrefixMarkdown: string = '';
  private committedPrefixHtml: string = '';
  private committedPrefixNodeCount: number = 0;
  private tailNodeCount: number = 0;
  private prefixHeadingList: HeadingInfo[] = [];
  private prefixHeadingTexts: Set<string> = new Set<string>();
  private currentHeadingList: HeadingInfo[] = [];
  private streamingFallbackForced: boolean = false;
  private containerElement: HTMLElement | null = null;
  private pendingRenderMarkdown: string | null = null;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private sanitizer: DomSanitizer,
    private markdownService: MarkdownService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Each input binds under its PascalCase name and a deprecated camelCase alias (Data / data),
    // and SimpleChanges keys by whichever name the template bound, so compare camelCased names.
    const needsRerender = Object.keys(changes).some((name) =>
      RERENDER_INPUTS.has(name.charAt(0).toLowerCase() + name.slice(1))
    );

    if (needsRerender) {
      const configChanged = Object.keys(changes).some((name) => {
        const lower = name.charAt(0).toLowerCase() + name.slice(1);
        return lower !== 'data' && RERENDER_INPUTS.has(lower);
      });
      if (configChanged) {
        this.resetStreamingState();
      }
      this.render();
    }
  }

  ngAfterViewInit(): void {
    if (this.pendingRenderMarkdown !== null) {
      const md = this.pendingRenderMarkdown;
      this.pendingRenderMarkdown = null;
      this.renderFull(md, this.renderSeq);
    } else if (this.Data) {
      void this.postRenderProcessing(this.renderSeq);
    }

    this.setupThemeObserver();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.renderSeq++;
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.destroyDiagramViewers();
    this.cleanupEventListeners();
    this.resetStreamingState();
  }

  private destroyDiagramViewers(): void {
    for (const v of this.diagramViewers) {
      v.Destroy();
    }
    this.diagramViewers = [];
  }

  private getContainer(): HTMLElement | null {
    if (!this.containerElement) {
      this.containerElement = this.elementRef.nativeElement.querySelector('.mj-markdown-container');
    }
    return this.containerElement;
  }

  private resetStreamingState(): void {
    this.lastRenderedMarkdown = '';
    this.committedPrefixMarkdown = '';
    this.committedPrefixHtml = '';
    this.committedPrefixNodeCount = 0;
    this.tailNodeCount = 0;
    this.prefixHeadingList = [];
    this.prefixHeadingTexts.clear();
    this.currentHeadingList = [];
    this.streamingFallbackForced = false;
  }

  private buildConfig(): MarkdownConfig {
    return {
      enableHighlight: this.EnableHighlight,
      enableMermaid: this.EnableMermaid,
      enableMath: this.EnableMath,
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
  }

  private prepareHtml(rawHtml: string): string {
    const bypassAngularSanitizer = this.EnableSvgRenderer || this.EnableHtml;
    if (this.Sanitize && !bypassAngularSanitizer) {
      return this.sanitizer.sanitize(SecurityContext.HTML, rawHtml) || '';
    }
    return rawHtml;
  }

  private updateContentFlags(html: string): void {
    this.hasMermaid = html.includes('language-mermaid') || html.includes('class="mermaid"');
    this.hasCodeBlocks = html.includes('<pre>') && html.includes('<code');
    this.hasMath = html.includes('class="mj-math') || /<math[\s>]/.test(html);
  }

  /**
   * Linear O(N) non-regex detector for whole-document Markdown cross-references:
   * - Reference-style link definitions: `[id]: url`
   * - Footnote definitions: `[^id]:`
   * - Table-of-contents directives: `[toc]` or `[[toc]]`
   *
   * Uses pure string scanning with zero regular expressions to avoid polynomial backtracking (ReDoS).
   */
  private hasWholeDocCrossRef(text: string): boolean {
    if (!text.includes('[')) {
      return false;
    }
    if (text.toLowerCase().includes('[toc]')) {
      return true;
    }
    if (!text.includes(']:')) {
      return false;
    }

    let lineStart = 0;
    const len = text.length;
    while (lineStart < len) {
      const nlIdx = text.indexOf('\n', lineStart);
      const rawLineEnd = nlIdx === -1 ? len : nlIdx;
      const lineEnd = rawLineEnd > lineStart && text.charCodeAt(rawLineEnd - 1) === 13 ? rawLineEnd - 1 : rawLineEnd;

      let pos = lineStart;
      while (pos < lineEnd && (text.charCodeAt(pos) === 32 || text.charCodeAt(pos) === 9)) {
        pos++;
      }
      if (pos < lineEnd && text.charCodeAt(pos) === 91 /* '[' */) {
        const closeBracket = text.indexOf(']', pos + 1);
        if (closeBracket > pos + 1 && closeBracket + 1 < lineEnd && text.charCodeAt(closeBracket + 1) === 58 /* ':' */) {
          if (text.charCodeAt(pos + 1) === 94 /* '^' */) {
            return true;
          }
          let afterColon = closeBracket + 2;
          while (afterColon < lineEnd && (text.charCodeAt(afterColon) === 32 || text.charCodeAt(afterColon) === 9)) {
            afterColon++;
          }
          if (afterColon < lineEnd) {
            return true;
          }
        }
      }

      if (nlIdx === -1) {
        break;
      }
      lineStart = nlIdx + 1;
    }

    return false;
  }

  private canStreamAppend(markdown: string): boolean {
    if (!this.lastRenderedMarkdown || this.streamingFallbackForced) return false;
    if (markdown.length <= this.lastRenderedMarkdown.length) return false;
    if (!markdown.startsWith(this.lastRenderedMarkdown)) return false;
    if (this.EnableCollapsibleHeadings) return false;
    // Scan only the uncommitted tail (+1 newline lookbehind) so per-frame checks stay O(1)
    const scanStart = this.committedPrefixMarkdown.length > 0 ? this.committedPrefixMarkdown.length - 1 : 0;
    const uncommittedWindow = markdown.slice(scanStart);
    return !this.hasWholeDocCrossRef(uncommittedWindow);
  }

  private hasDuplicateHeadingsAgainstPrefix(tokens: ReturnType<MarkdownService['ParseToTokens']>): boolean {
    if (!this.EnableHeadingIds) return false;
    const seenInTail = new Set<string>();
    for (const t of tokens) {
      if (t.type === 'heading') {
        const key = t.text.toLowerCase();
        if (this.prefixHeadingTexts.has(key) || seenInTail.has(key)) {
          return true;
        }
        seenInTail.add(key);
      }
    }
    return false;
  }

  /**
   * Render the markdown content
   */
  private render(): void {
    const seq = ++this.renderSeq;
    if (!this.Data) {
      this.destroyDiagramViewers();
      this.resetStreamingState();
      const container = this.getContainer();
      if (container) {
        container.innerHTML = '';
      }
      this.RenderedContent = '';
      this.cdr.markForCheck();
      return;
    }

    this.renderStartTime = performance.now();
    const config = this.buildConfig();
    this.markdownService.configureMarked(config);

    if (this.canStreamAppend(this.Data)) {
      this.renderIncremental(this.Data, seq);
    } else {
      this.renderFull(this.Data, seq);
    }
  }

  private renderFull(markdown: string, seq: number, forceSinglePass: boolean = false): void {
    this.destroyDiagramViewers();
    this.resetStreamingState();
    if (forceSinglePass) {
      this.streamingFallbackForced = true;
    }

    const container = this.getContainer();
    if (!container) {
      this.pendingRenderMarkdown = markdown;
      return;
    }

    let targetPrefixCount = 0;
    let splitIndex = 0;
    const mayHaveMultipleBlocks =
      !forceSinglePass &&
      !this.EnableCollapsibleHeadings &&
      markdown.includes('\n\n') &&
      !this.hasWholeDocCrossRef(markdown);

    let tokens: ReturnType<MarkdownService['ParseToTokens']> | null = null;
    if (mayHaveMultipleBlocks) {
      tokens = this.markdownService.ParseToTokens(markdown);
      const hasDef = tokens.some((t) => t.type === 'def');
      const hasHtml = this.EnableHtml && tokens.some((t) => t.type === 'html');
      const headingTokens = tokens.filter((t) => t.type === 'heading');
      const hasDuplicateHeadingTexts =
        this.EnableHeadingIds &&
        new Set(headingTokens.map((t) => (t.type === 'heading' ? t.text.toLowerCase() : ''))).size < headingTokens.length;
      if (hasDef || hasHtml || hasDuplicateHeadingTexts) {
        this.streamingFallbackForced = true;
      } else {
        const substantive = tokens.filter((t) => t.type !== 'space');
        if (substantive.length > 1) {
          targetPrefixCount = substantive.length - 1;
          let counted = 0;
          for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.type !== 'space') {
              counted++;
            }
            splitIndex += t.raw.length;
            if (counted === targetPrefixCount) {
              if (i + 1 < tokens.length && tokens[i + 1].type === 'space') {
                splitIndex += tokens[i + 1].raw.length;
              }
              break;
            }
          }
        }
      }
    }

    if (targetPrefixCount > 0 && splitIndex > 0 && splitIndex < markdown.length && tokens) {
      const prefixMarkdown = markdown.slice(0, splitIndex);
      const tailMarkdown = markdown.slice(splitIndex);

      const rawPrefixHtml = this.markdownService.parse(prefixMarkdown);
      const prefixHtml = this.prepareHtml(rawPrefixHtml);
      const prefixHeadings = this.markdownService.getHeadingList();

      const rawTailHtml = this.markdownService.parse(tailMarkdown);
      const tailHtml = this.prepareHtml(rawTailHtml);
      const tailHeadings = this.markdownService.getHeadingList();

      const template = document.createElement('template');
      template.innerHTML = prefixHtml;
      const prefixNodes = Array.from(template.content.childNodes);

      const tailTemplate = document.createElement('template');
      tailTemplate.innerHTML = tailHtml;
      const tailNodes = Array.from(tailTemplate.content.childNodes);

      container.replaceChildren(...prefixNodes, ...tailNodes);

      this.committedPrefixMarkdown = prefixMarkdown;
      this.committedPrefixHtml = prefixHtml;
      this.committedPrefixNodeCount = prefixNodes.length;
      this.tailNodeCount = tailNodes.length;
      this.prefixHeadingList = prefixHeadings;
      for (const h of prefixHeadings) {
        this.prefixHeadingTexts.add(h.text.toLowerCase());
      }
      this.currentHeadingList = [...prefixHeadings, ...tailHeadings];

      const fullHtml = prefixHtml + tailHtml;
      this.updateContentFlags(fullHtml);
      this.RenderedContent = this.sanitizer.bypassSecurityTrustHtml(fullHtml);
    } else {
      let html = this.markdownService.parse(markdown);
      html = this.prepareHtml(html);
      this.currentHeadingList = this.markdownService.getHeadingList();

      container.innerHTML = html;
      this.tailNodeCount = container.childNodes.length;
      this.committedPrefixNodeCount = 0;
      this.committedPrefixMarkdown = '';
      this.committedPrefixHtml = '';
      this.prefixHeadingList = [];
      this.prefixHeadingTexts.clear();

      this.updateContentFlags(html);
      this.RenderedContent = this.sanitizer.bypassSecurityTrustHtml(html);
    }

    this.lastRenderedMarkdown = markdown;
    this.cdr.markForCheck();
    Promise.resolve().then(() => this.postRenderProcessing(seq));
  }

  private renderIncremental(markdown: string, seq: number): void {
    const container = this.getContainer();
    if (!container) {
      this.pendingRenderMarkdown = markdown;
      return;
    }

    // Tokenize ONLY the uncommitted tail so per-chunk lexing is O(1) in total document size
    const uncommittedOffset = this.committedPrefixMarkdown.length;
    const uncommittedMarkdown = markdown.slice(uncommittedOffset);
    const tokens = this.markdownService.ParseToTokens(uncommittedMarkdown);
    if (
      tokens.some((t) => t.type === 'def') ||
      (this.EnableHtml && tokens.some((t) => t.type === 'html')) ||
      this.hasDuplicateHeadingsAgainstPrefix(tokens)
    ) {
      this.renderFull(markdown, seq, true);
      return;
    }

    const substantive = tokens.filter((t) => t.type !== 'space');
    const targetPrefixCount = Math.max(0, substantive.length - 1);

    let splitInUncommitted = 0;
    if (targetPrefixCount > 0) {
      let counted = 0;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== 'space') {
          counted++;
        }
        splitInUncommitted += t.raw.length;
        if (counted === targetPrefixCount) {
          if (i + 1 < tokens.length && tokens[i + 1].type === 'space') {
            splitInUncommitted += tokens[i + 1].raw.length;
          }
          break;
        }
      }
    }

    let splitIndex = uncommittedOffset + splitInUncommitted;
    if (splitIndex < uncommittedOffset || splitIndex >= markdown.length) {
      splitIndex = uncommittedOffset;
    }

    // Remove ONLY the mutable tail nodes from previous frame
    for (let i = 0; i < this.tailNodeCount; i++) {
      container.lastChild?.remove();
    }
    this.tailNodeCount = 0;

    // Clean up any diagram viewers attached to removed tail elements
    if (this.diagramViewers.length > 0) {
      this.diagramViewers = this.diagramViewers.filter((v) => {
        if (!container.contains(v.Svg)) {
          v.Destroy();
          return false;
        }
        return true;
      });
    }

    // Graduate new blocks to stable prefix if boundary advanced
    if (splitIndex > uncommittedOffset) {
      const sliceMarkdown = markdown.slice(uncommittedOffset, splitIndex);
      const rawSliceHtml = this.markdownService.parse(sliceMarkdown);
      const sliceHtml = this.prepareHtml(rawSliceHtml);
      const sliceHeadings = this.markdownService.getHeadingList();

      const template = document.createElement('template');
      template.innerHTML = sliceHtml;
      const newPrefixNodes = Array.from(template.content.childNodes);
      container.appendChild(template.content);

      this.committedPrefixNodeCount += newPrefixNodes.length;
      this.committedPrefixMarkdown += sliceMarkdown;
      this.committedPrefixHtml += sliceHtml;
      this.prefixHeadingList.push(...sliceHeadings);
      for (const h of sliceHeadings) {
        this.prefixHeadingTexts.add(h.text.toLowerCase());
      }
    }

    // Render the active tail
    const tailMarkdown = markdown.slice(this.committedPrefixMarkdown.length);
    const rawTailHtml = this.markdownService.parse(tailMarkdown);
    const tailHtml = this.prepareHtml(rawTailHtml);
    const tailHeadings = this.markdownService.getHeadingList();
    this.currentHeadingList = [...this.prefixHeadingList, ...tailHeadings];

    const tailTemplate = document.createElement('template');
    tailTemplate.innerHTML = tailHtml;
    const tailNodes = Array.from(tailTemplate.content.childNodes);
    this.tailNodeCount = tailNodes.length;
    container.appendChild(tailTemplate.content);

    const fullHtml = this.committedPrefixHtml + tailHtml;
    this.updateContentFlags(fullHtml);
    this.RenderedContent = this.sanitizer.bypassSecurityTrustHtml(fullHtml);
    this.lastRenderedMarkdown = markdown;

    this.cdr.markForCheck();
    Promise.resolve().then(() => this.postRenderProcessing(seq));
  }

  /**
   * Process rendered content after DOM update
   * Handles syntax highlighting, mermaid rendering, interactive MJ diagrams, copy buttons, etc.
   */
  private async postRenderProcessing(seq = this.renderSeq): Promise<void> {
    if (this.isDestroyed || seq !== this.renderSeq) return;
    const container = this.elementRef.nativeElement.querySelector('.mj-markdown-container');
    if (!container) return;

    // Open external/inline links in a new tab when opted in
    if (this.OpenLinksInNewTab) {
      this.applyLinkTargets(container as HTMLElement);
    }

    // Add copy buttons to code blocks
    if (this.EnableCodeCopy && this.hasCodeBlocks) {
      this.markdownService.addCodeCopyButtons(container as HTMLElement);
    }

    // Initialize collapsible headings
    if (this.EnableCollapsibleHeadings) {
      this.markdownService.initializeCollapsibleHeadings(container as HTMLElement);
      this.setupCollapsibleListeners(container as HTMLElement);
    }

    // Typeset TeX math (async: KaTeX loads on first use). With math off, MathML that arrived as
    // markup still renders, so it still gets the styled-letter fix.
    if (this.hasMath) {
      if (this.EnableMath) {
        await this.markdownService.RenderMath(container as HTMLElement);
        if (this.isDestroyed || seq !== this.renderSeq) return;
      } else {
        this.markdownService.UseUnicodeMathLetters(container as HTMLElement);
      }
    }

    // Render mermaid diagrams (async)
    if (this.EnableMermaid && this.hasMermaid) {
      await this.markdownService.renderMermaid(container as HTMLElement);
      if (this.isDestroyed || seq !== this.renderSeq) return;
    }

    // Upgrade any MJ Interactive Diagram SVGs (`svg[data-mj-diagram="1"]`) embedded in markdown
    await this.mountEmbeddedInteractiveDiagrams(container as HTMLElement, seq);
    if (this.isDestroyed || seq !== this.renderSeq) return;

    // Setup heading click listeners
    if (this.EnableHeadingIds) {
      this.setupHeadingClickListeners(container as HTMLElement);
    }

    // Setup code copy listeners for custom event emission
    if (this.EnableCodeCopy) {
      this.setupCodeCopyListeners(container as HTMLElement);
    }

    // Setup image click listeners, only when a host listens
    if (this.ImageClicked.observed) {
      this.setupImageClickListeners(container as HTMLElement);
    }

    // Emit rendered event
    const renderTime = performance.now() - this.renderStartTime;
    const headingIds = this.GetHeadings();

    this.Rendered.emit({
      html: (container as HTMLElement).innerHTML,
      renderTime,
      hasMermaid: this.hasMermaid,
      hasCodeBlocks: this.hasCodeBlocks,
      headingIds,
    });
  }

  /**
   * Stamp `target="_blank"` and `rel="noopener noreferrer"` on rendered HTML links when
   * {@link OpenLinksInNewTab} is enabled. In-page fragment links (`#section`), non-navigational
   * protocol-handler links (`mailto:`, `tel:`, `sms:`), SVG diagram links, and anchors that
   * already declare an explicit `target` keep their behaviour.
   */
  private applyLinkTargets(container: HTMLElement): void {
    container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
      if (anchor.closest('svg')) {
        return;
      }
      const href = (anchor.getAttribute('href') || '').trim();
      if (!href || href.startsWith('#') || /^(mailto|tel|sms|javascript|vbscript|data):/i.test(href)) {
        return;
      }
      if (!anchor.hasAttribute('target')) {
        anchor.setAttribute('target', '_blank');
      }
      if (anchor.getAttribute('target') === '_blank') {
        const existingRel = (anchor.getAttribute('rel') || '').trim();
        const tokens = existingRel ? existingRel.split(/\s+/) : [];
        if (!tokens.includes('noopener')) {
          tokens.push('noopener');
        }
        if (!tokens.includes('noreferrer')) {
          tokens.push('noreferrer');
        }
        anchor.setAttribute('rel', tokens.join(' '));
      }
    });
  }

  /**
   * Loads the MJ diagram renderer on demand when a fenced ```mj-diagram block is encountered.
   */
  public LoadDiagramRenderer(): Promise<typeof import('@memberjunction/ai-diagrams')> {
    // MEASURED BUNDLE DEFERRAL: load @memberjunction/ai-diagrams (and @dagrejs/dagre) only when an mj-diagram fence is present
    return import('@memberjunction/ai-diagrams');
  }

  /**
   * Upgrades rendered MJ diagram SVGs (`svg[data-mj-diagram="1"]`) and fenced ```mj-diagram JSON spec
   * blocks in place into interactive diagram viewers.
   */
  private async mountEmbeddedInteractiveDiagrams(container: HTMLElement, seq: number): Promise<void> {
    if (!this.EnableSvgRenderer) return;
    const fences = container.querySelectorAll<HTMLElement>('pre > code.language-mj-diagram');
    if (fences.length > 0) {
      try {
        const { RenderDiagram } = await this.LoadDiagramRenderer();
        if (this.isDestroyed || seq !== this.renderSeq) return;
        fences.forEach((codeEl) => {
          const pre = codeEl.parentElement;
          const raw = codeEl.textContent?.trim();
          if (!pre || !raw) return;
          try {
            const rendered = RenderDiagram(JSON.parse(raw));
            if (rendered.Success) {
              const wrapper = document.createElement('div');
              wrapper.className = 'svg-rendered';
              wrapper.innerHTML = this.markdownService.SanitizeHtml(rendered.Svg);
              pre.replaceWith(wrapper);
            }
          } catch {
            // Leave malformed JSON blocks as code
          }
        });
      } catch (error: unknown) {
        console.warn('Failed to load the MJ diagram renderer:', error);
      }
    }
    if (this.isDestroyed || seq !== this.renderSeq) return;
    container.querySelectorAll<SVGSVGElement>('svg[data-mj-diagram="1"]').forEach((svg) => {
      if (!svg.closest('.mjd-shell')) {
        this.diagramViewers.push(MountDiagramViewer(svg));
      }
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
      if (heading.classList.contains('mj-heading-wired')) return;
      heading.classList.add('mj-heading-wired');
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
   * Report clicks on rendered images, except those inside a link or marked decorative
   * (`role="presentation"`, e.g. a mention badge's avatar), and make them reachable by keyboard. The class lets the stylesheet show them as zoomable, and marks an image already wired:
   * post-render processing can run twice over the same DOM (ngAfterViewInit and the render
   * microtask on first render), and a second listener would report every click twice.
   */
  private setupImageClickListeners(container: HTMLElement): void {
    container.querySelectorAll<HTMLImageElement>('img:not([role="presentation"])').forEach((img) => {
      if (img.closest('a') || img.classList.contains('mj-markdown-image-clickable')) return;
      img.classList.add('mj-markdown-image-clickable');
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      const report = () => this.ImageClicked.emit(new ImageClickedEventArgs(img.src, img.alt));
      img.addEventListener('click', report);
      img.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        report();
      });
    });
  }

  /**
   * Setup listeners to emit code copy events
   */
  private setupCodeCopyListeners(container: HTMLElement): void {
    const copyButtons = container.querySelectorAll('.code-copy-btn');

    copyButtons.forEach((button) => {
      if (button.classList.contains('mj-code-copy-wired')) return;
      button.classList.add('mj-code-copy-wired');
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
      this.resetStreamingState();
      this.render();
    }
  }

  /**
   * Cleanup event listeners
   */
  private cleanupEventListeners(): void {
    const container = this.getContainer();
    if (!container) return;

    // Clone and replace to remove all listeners
    const clone = container.cloneNode(true);
    container.parentNode?.replaceChild(clone, container);
    this.containerElement = clone as HTMLElement;
  }

  /**
   * Force a re-render of the markdown content
   */
  public Refresh(): void {
    this.resetStreamingState();
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
    return this.currentHeadingList.length > 0
      ? this.currentHeadingList
      : this.markdownService.getHeadingList();
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
