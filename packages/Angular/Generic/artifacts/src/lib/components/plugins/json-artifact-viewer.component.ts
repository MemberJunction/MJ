import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { EscapeSQLString } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { DataSnapshot, RunView } from '@memberjunction/core';
import { MJArtifactVersionAttributeEntity } from '@memberjunction/core-entities';
import { CreateJsonSnapshot } from '../../snapshot-helpers';
import { OpenHtmlInSandboxedWindow, PrintHtmlInSandboxedIframe } from '../../utils/html-sandbox.util';

/**
 * Viewer component for JSON artifacts.
 * Supports extract rules - shows displayMarkdown, displayHtml, or raw JSON editor (in that priority order).
 * All content is displayed in the parent's Display tab.
 */
@Component({
  standalone: false,
  selector: 'mj-json-artifact-viewer',
  template: `
    <div class="json-artifact-viewer" [ngClass]="cssClass">
      <!-- Display toolbar -->
      <div class="display-toolbar">
        @if (displayHtml && displayMarkdown) {
          <div class="display-mode-toggle">
            <button class="btn-icon" [class.active]="ActiveDisplayMode === 'html'" (click)="SetDisplayMode('html')">
              <i class="fa-solid fa-desktop"></i> Interactive Mockup
            </button>
            <button class="btn-icon" [class.active]="ActiveDisplayMode === 'markdown'" (click)="SetDisplayMode('markdown')">
              <i class="fa-solid fa-file-lines"></i> Plan &amp; Architecture
            </button>
          </div>
        }
        <div class="display-toolbar-actions">
          <button class="btn-icon" title="Copy Content" (click)="onCopy()">
            <i class="fa-solid fa-copy"></i> Copy
          </button>
          @if (displayHtml && (!displayMarkdown || ActiveDisplayMode === 'html')) {
            <button class="btn-icon" title="Open in New Window" (click)="openInNewWindow()">
              <i class="fa-solid fa-up-right-from-square"></i> New Window
            </button>
            <button class="btn-icon" title="Print" (click)="printHtml()">
              <i class="fa-solid fa-print"></i> Print
            </button>
          }
        </div>
      </div>

      <!-- Display content: priority order = displayHtml > displayMarkdown > JSON editor -->
      <div class="display-content">
        @if (displayHtml && SafeDisplayHtml && (!displayMarkdown || ActiveDisplayMode === 'html')) {
          <!-- Opaque-origin sandboxed iframe for interactive HTML mockups via [srcdoc].
               SECURITY: never use a host-origin Blob URL and never add allow-same-origin,
               allow-popups, or allow-popups-to-escape-sandbox. With sandbox="allow-scripts"
               on [srcdoc], the frame executes in an opaque null origin with no access to host
               cookies, storage, or DOM. -->
          <iframe
            #htmlFrame
            [srcdoc]="SafeDisplayHtml"
            sandbox="allow-scripts"
            class="html-iframe"
            (load)="onIframeLoad()">
          </iframe>
        } @else if (displayMarkdown && (!displayHtml || ActiveDisplayMode === 'markdown')) {
          <div class="markdown-content">
            <mj-markdown [data]="displayMarkdown"
                         [enableCollapsibleHeadings]="true"
                         [enableLineNumbers]="true"
                         [enableSmartypants]="true"
                         [enableHtml]="true"></mj-markdown>
          </div>
        } @else {
          <div class="json-editor-container">
            <mj-code-editor
              [(ngModel)]="jsonContent"
              [language]="'json'"
              [readonly]="true"
              style="width: 100%; height: 100%;">
            </mj-code-editor>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .json-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .display-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: var(--mj-bg-surface-sunken);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .display-mode-toggle {
      display: flex;
      gap: 6px;
    }

    .display-toolbar-actions {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }

    .btn-icon {
      padding: 6px 12px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-strong);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      color: var(--mj-text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn-icon.active {
      background: var(--mj-brand-primary, #2563eb);
      border-color: var(--mj-brand-primary, #2563eb);
      color: var(--mj-text-inverse, #ffffff);
      font-weight: 600;
    }

    .btn-icon:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-text-disabled);
    }

    .display-content {
      flex: 1;
      overflow: auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .html-iframe {
      width: 100%;
      border: none;
      background: var(--mj-bg-surface);
      display: block;
      /* The frame is cross-origin (sandbox without allow-same-origin), so script-driven
         auto-resize is unavailable — fill the container instead. */
      flex: 1;
      min-height: 0;
    }

    .markdown-content {
      flex: 1;
      padding: 20px;
      overflow: auto;
      min-height: 0;
      background: var(--mj-bg-surface);
    }

    .json-editor-container {
      flex: 1;
      overflow: auto;
      min-height: 0;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'JsonArtifactViewerPlugin')
export class JsonArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  @ViewChild('htmlFrame') HtmlFrame?: ElementRef<HTMLIFrameElement>;

  /** @deprecated Use {@link HtmlFrame}. */
  get htmlFrame(): ElementRef<HTMLIFrameElement> | undefined {
    return this.HtmlFrame;
  }
  /** @deprecated Use {@link HtmlFrame}. */
  set htmlFrame(value: ElementRef<HTMLIFrameElement> | undefined) {
    this.HtmlFrame = value;
  }

  public JsonContent = '';

  /** @deprecated Use {@link JsonContent}. */
  public get jsonContent() {
    return this.JsonContent;
  }
  /** @deprecated Use {@link JsonContent}. */
  public set jsonContent(value) {
    this.JsonContent = value;
  }
  public DisplayMarkdown: string | null = null;

  /** @deprecated Use {@link DisplayMarkdown}. */
  public get displayMarkdown(): string | null {
    return this.DisplayMarkdown;
  }
  /** @deprecated Use {@link DisplayMarkdown}. */
  public set displayMarkdown(value: string | null) {
    this.DisplayMarkdown = value;
  }
  private _displayHtml: string | null = null;
  public SafeDisplayHtml: SafeHtml | null = null;

  public get DisplayHtml(): string | null {
    return this._displayHtml;
  }
  public set DisplayHtml(value: string | null) {
    if (value === this._displayHtml && (value === null || this.SafeDisplayHtml !== null)) {
      return;
    }
    this._displayHtml = value;
    this.SafeDisplayHtml = value ? this.sanitizer.bypassSecurityTrustHtml(value) : null;
  }

  /** @deprecated Use {@link DisplayHtml}. */
  public get displayHtml(): string | null {
    return this.DisplayHtml;
  }
  /** @deprecated Use {@link DisplayHtml}. */
  public set displayHtml(value: string | null) {
    this.DisplayHtml = value;
  }

  public ActiveDisplayMode: 'html' | 'markdown' = 'html';

  public SetDisplayMode(mode: 'html' | 'markdown'): void {
    this.ActiveDisplayMode = mode;
    this.cdr.detectChanges();
  }

  private versionAttributes: MJArtifactVersionAttributeEntity[] = [];

  /**
   * JSON artifacts always have content to display (JSON editor, displayHtml, or displayMarkdown)
   */
  public override get hasDisplayContent(): boolean {
    return true;
  }

  constructor(
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    super();
  }

  async ngOnInit(): Promise<void> {
    this.JsonContent = this.getContent();

    // Load version attributes to check for extract rules
    await this.loadVersionAttributes();

    // Trigger change detection after async load
    this.cdr.detectChanges();
  }

  /**
   * Override to return true when showing extracted displayHtml or displayMarkdown.
   * Returns false when showing raw JSON editor (no extract rules available).
   */
  public override get isShowingElevatedDisplay(): boolean {
    return !!(this.DisplayHtml || this.DisplayMarkdown);
  }

  /**
   * Override to tell parent whether to show raw JSON tab.
   * When showing elevated display (markdown/HTML), return true so parent shows JSON tab.
   * When showing raw JSON editor, return false (no need for duplicate JSON tab).
   */
  public override get parentShouldShowRawContent(): boolean {
    return this.isShowingElevatedDisplay;
  }

  private async loadVersionAttributes(): Promise<void> {
    if (!this.artifactVersion?.ID) {
      console.log('📦 JSON Plugin: No artifactVersion.ID, skipping attribute load');
      return;
    }

    console.log(`📦 JSON Plugin: Loading attributes for version ID: ${this.artifactVersion.ID}`);

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJArtifactVersionAttributeEntity>({
        EntityName: 'MJ: Artifact Version Attributes',
        ExtraFilter: `ArtifactVersionID='${EscapeSQLString(this.artifactVersion.ID)}'`,
        ResultType: 'entity_object'
      });

      console.log(`📦 JSON Plugin: RunView completed. Success=${result.Success}, Results count=${result.Results?.length || 0}`);

      if (result.Success && result.Results) {
        this.versionAttributes = result.Results;

        console.log(`📦 JSON Plugin: Loaded ${this.versionAttributes.length} attributes for version ${this.artifactVersion.ID}`);
        console.log(`📦 Attributes:`, this.versionAttributes.map(a => ({ name: a.Name, hasValue: !!a.Value })));

        // Check for displayHtml and displayMarkdown attributes (from extract rules)
        // Priority: displayHtml > displayMarkdown
        const displayHtmlAttr = this.versionAttributes.find(a => a.Name?.toLowerCase() === 'displayhtml');
        const displayMarkdownAttr = this.versionAttributes.find(a => a.Name?.toLowerCase() === 'displaymarkdown');

        console.log(`📦 displayHtmlAttr:`, displayHtmlAttr ? { name: displayHtmlAttr.Name, valueLength: displayHtmlAttr.Value?.length } : 'not found');
        console.log(`📦 displayMarkdownAttr:`, displayMarkdownAttr ? { name: displayMarkdownAttr.Name, valueLength: displayMarkdownAttr.Value?.length } : 'not found');

        // Parse attribute values - fix "null" string bug
        this.DisplayHtml = this.parseAttributeValue(displayHtmlAttr?.Value);
        this.DisplayMarkdown = this.parseAttributeValue(displayMarkdownAttr?.Value);
        this.ActiveDisplayMode = this.DisplayHtml ? 'html' : 'markdown';

        // Clean up double-escaped characters in HTML (from LLM generation)
        if (this.DisplayHtml) {
          this.DisplayHtml = this.cleanEscapedCharacters(this.DisplayHtml);
        }

        // Note: Markdown rendering is now handled by <mj-markdown> component in template

        console.log(`📦 JSON Plugin: displayHtml=${!!this.DisplayHtml} (${this.DisplayHtml?.length || 0} chars), displayMarkdown=${!!this.DisplayMarkdown} (${this.DisplayMarkdown?.length || 0} chars)`);
        console.log(`📦 isShowingElevatedDisplay=${this.isShowingElevatedDisplay}`);
      } else {
        console.log(`📦 JSON Plugin: No attributes found or query failed. Success=${result.Success}, ResultsLength=${result.Results?.length}`);
      }
    } catch (err) {
      console.error('📦 JSON Plugin: Error loading version attributes:', err);
    }
  }

  private parseAttributeValue(value: string | null | undefined): string | null {
    if (!value) return null;

    // Fix bug: Some extractors return string "null" instead of actual null
    if (value === 'null' || value.trim() === '') {
      return null;
    }

    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string') {
        // Check if parsed string is also "null"
        if (parsed === 'null' || parsed.trim() === '') {
          return null;
        }
        return parsed;
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If not valid JSON, return as-is (unless it's "null")
      return value === 'null' ? null : value;
    }
  }

  /**
   * Returns the iframe's document when accessible, or null.
   * With allow-same-origin removed from the sandbox (see template), the frame is
   * cross-origin to the app: contentDocument returns null or the access throws a
   * SecurityError depending on the browser. Both outcomes are tolerated — the
   * style/resize enhancements below are optional niceties, not requirements.
   */
  private getIframeDocument(): Document | null {
    try {
      const iframe = this.HtmlFrame?.nativeElement;
      if (!iframe) return null;
      return iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch {
      return null;
    }
  }

  OnIframeLoad(): void {
    // Inject base styles if HTML doesn't have them
    if (this.HtmlFrame) {
      const iframeDoc = this.getIframeDocument();

      if (iframeDoc) {
        // Check if HTML already has styles
        const hasStyles = iframeDoc.querySelector('style') || iframeDoc.querySelector('link[rel="stylesheet"]');

        if (!hasStyles) {
          // Inject minimal base styles for better defaults
          const style = iframeDoc.createElement('style');
          style.textContent = `
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 20px;
              padding: 0;
            }
            h1, h2, h3 { color: #2c3e50; margin-top: 1.5em; margin-bottom: 0.5em; }
            h1 { font-size: 2em; border-bottom: 2px solid #3498db; padding-bottom: 0.3em; }
            h2 { font-size: 1.5em; }
            table { border-collapse: collapse; width: 100%; margin: 1em 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f8f9fa; font-weight: 600; }
            pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
            code { background: #f6f8fa; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
          `;
          iframeDoc.head.appendChild(style);
        }

        // Inject width guardrails to prevent iframe content from causing horizontal overflow
        const widthOverride = iframeDoc.createElement('style');
        widthOverride.textContent = `
          html, body {
            max-width: 100% !important;
            overflow-x: hidden !important;
          }
          body {
            margin: 20px 10px 5px 20px !important; /* top right bottom left */
            padding: 0 !important;
            box-sizing: border-box !important;
          }
          img, svg, table, pre {
            max-width: 100% !important;
          }
        `;
        iframeDoc.head.appendChild(widthOverride);

        console.log('📦 Iframe loaded, hasStyles:', !!hasStyles);

        // Auto-resize iframe to fit content
        this.resizeIframeToContent();
      }
    }
  }

  /** @deprecated Use {@link OnIframeLoad}. */
  onIframeLoad(): void {
    return this.OnIframeLoad();
  }

  private resizeIframeToContent(): void {
    if (this.HtmlFrame) {
      const iframe = this.HtmlFrame.nativeElement;
      // Cross-origin (sandboxed) frames yield no document — the CSS flex sizing on
      // .html-iframe is the fallback in that case.
      const iframeDoc = this.getIframeDocument();

      if (iframeDoc && iframeDoc.body) {
        // Get the actual content height
        const contentHeight = Math.max(
          iframeDoc.body.scrollHeight,
          iframeDoc.body.offsetHeight,
          iframeDoc.documentElement.scrollHeight,
          iframeDoc.documentElement.offsetHeight
        );

        // Set iframe height to match content (with a bit of padding)
        iframe.style.height = `${contentHeight + 20}px`;

        console.log('📦 Iframe resized - Height:', contentHeight + 20, 'px');
      }
    }
  }

  OpenInNewWindow(): void {
    if (this.DisplayHtml) {
      OpenHtmlInSandboxedWindow(this.DisplayHtml, this.getDisplayTitle() || 'Artifact Preview');
    }
  }

  /** @deprecated Use {@link OpenInNewWindow}. */
  openInNewWindow(): void {
    return this.OpenInNewWindow();
  }

  PrintHtml(): void {
    if (this.DisplayHtml) {
      PrintHtmlInSandboxedIframe(this.DisplayHtml, { Title: this.getDisplayTitle() || 'Print' });
    }
  }

  /** @deprecated Use {@link PrintHtml}. */
  printHtml(): void {
    return this.PrintHtml();
  }

  OnCopy(): void {
    // Copy based on what's currently active in the display view
    const content =
      (this.ActiveDisplayMode === 'markdown' && this.DisplayMarkdown)
        ? this.DisplayMarkdown
        : (this.DisplayHtml || this.DisplayMarkdown || this.JsonContent);
    if (content) {
      navigator.clipboard.writeText(content).then(() => {
        console.log('✅ Copied content to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }

  /** @deprecated Use {@link OnCopy}. */
  onCopy(): void {
    return this.OnCopy();
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    return CreateJsonSnapshot(this.getRawContent(), this.getDisplayTitle());
  }

  /**
   * Clean up double-escaped characters that appear in LLM-generated HTML
   * Removes literal "\\n", "\\t", and "\\\"" which cause rendering issues
   */
  private cleanEscapedCharacters(html: string): string {
    // Remove escaped quotes (\" becomes ")
    let cleaned = html.replace(/\\"/g, '"');

    // Remove escaped newlines (\\n becomes nothing)
    // HTML doesn't need whitespace for formatting, and these cause display issues
    cleaned = cleaned.replace(/\\n/g, '');

    // Remove escaped tabs
    cleaned = cleaned.replace(/\\t/g, '');

    // Remove double-escaped tabs
    cleaned = cleaned.replace(/\\\\t/g, '');

    // Remove double-escaped newlines
    cleaned = cleaned.replace(/\\\\n/g, '');

    return cleaned;
  }
}
