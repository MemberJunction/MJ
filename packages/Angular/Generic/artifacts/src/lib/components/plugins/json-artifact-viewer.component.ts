import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { RunView } from '@memberjunction/core';
import { MJArtifactVersionAttributeEntity } from '@memberjunction/core-entities';

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
        <button class="btn-icon" title="Copy Content" (click)="onCopy()">
          <i class="fas fa-copy"></i> Copy
        </button>
        @if (displayHtml) {
          <button class="btn-icon" title="Open in New Window" (click)="openInNewWindow()">
            <i class="fas fa-external-link-alt"></i> New Window
          </button>
          <button class="btn-icon" title="Print" (click)="printHtml()">
            <i class="fas fa-print"></i> Print
          </button>
        }
      </div>

      <!-- Display content: priority order = displayHtml > displayMarkdown > JSON editor -->
      <div class="display-content">
        @if (displayHtml && htmlBlobUrl) {
          <!-- Sandboxed iframe for rich HTML using blob URL -->
          <iframe
            #htmlFrame
            [src]="htmlBlobUrl"
            sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals"
            class="html-iframe"
            (load)="onIframeLoad()">
          </iframe>
        } @else if (displayMarkdown) {
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
      justify-content: flex-end;
      gap: 8px;
      padding: 8px;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }

    .btn-icon {
      padding: 6px 12px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn-icon:hover {
      background: #e9ecef;
      border-color: #999;
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
      background: white;
      display: block;
    }

    .markdown-content {
      flex: 1;
      padding: 20px;
      overflow: auto;
      min-height: 0;
      background: white;
    }

    .json-editor-container {
      flex: 1;
      overflow: auto;
      min-height: 0;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'JsonArtifactViewerPlugin')
export class JsonArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit, OnDestroy {
  @ViewChild('htmlFrame') htmlFrame?: ElementRef<HTMLIFrameElement>;

  public jsonContent = '';
  public displayMarkdown: string | null = null;
  public displayHtml: string | null = null;
  public htmlBlobUrl: SafeResourceUrl | null = null;
  private versionAttributes: MJArtifactVersionAttributeEntity[] = [];
  private unsafeBlobUrl: string | null = null; // Keep unsafe URL for cleanup

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

  ngOnDestroy(): void {
    // Clean up blob URL to prevent memory leaks
    if (this.unsafeBlobUrl) {
      URL.revokeObjectURL(this.unsafeBlobUrl);
      this.unsafeBlobUrl = null;
      this.htmlBlobUrl = null;
    }
  }

  async ngOnInit(): Promise<void> {
    this.jsonContent = this.getContent();

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
    return !!(this.displayHtml || this.displayMarkdown);
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
      const rv = new RunView();
      const result = await rv.RunView<MJArtifactVersionAttributeEntity>({
        EntityName: 'MJ: Artifact Version Attributes',
        ExtraFilter: `ArtifactVersionID='${this.artifactVersion.ID}'`,
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
        this.displayHtml = this.parseAttributeValue(displayHtmlAttr?.Value);
        this.displayMarkdown = this.parseAttributeValue(displayMarkdownAttr?.Value);

        // Clean up double-escaped characters in HTML (from LLM generation)
        if (this.displayHtml) {
          this.displayHtml = this.cleanEscapedCharacters(this.displayHtml);
        }

        // Create blob URL for HTML to avoid srcdoc sanitization issues
        if (this.displayHtml) {
          const blob = new Blob([this.displayHtml], { type: 'text/html' });
          this.unsafeBlobUrl = URL.createObjectURL(blob);
          // Sanitize the blob URL so Angular trusts it in the iframe
          this.htmlBlobUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.unsafeBlobUrl);
        }

        // Note: Markdown rendering is now handled by <mj-markdown> component in template

        console.log(`📦 JSON Plugin: displayHtml=${!!this.displayHtml} (${this.displayHtml?.length || 0} chars), displayMarkdown=${!!this.displayMarkdown} (${this.displayMarkdown?.length || 0} chars)`);
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

  onIframeLoad(): void {
    // Inject base styles if HTML doesn't have them
    if (this.htmlFrame) {
      const iframe = this.htmlFrame.nativeElement;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

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

        // Inject width override to ensure content fills iframe
        const widthOverride = iframeDoc.createElement('style');
        widthOverride.textContent = `
          body {
            max-width: none !important;
            width: 100% !important;
            margin: 20px 10px 5px 20px !important; /* top right bottom left */
            padding: 0 !important;
            box-sizing: border-box !important;
          }
        `;
        iframeDoc.head.appendChild(widthOverride);

        console.log('📦 Iframe loaded, hasStyles:', !!hasStyles);

        // Auto-resize iframe to fit content
        this.resizeIframeToContent();
      }
    }
  }

  private resizeIframeToContent(): void {
    if (this.htmlFrame) {
      const iframe = this.htmlFrame.nativeElement;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

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

        // Get the iframe's actual width (excluding borders)
        const iframeWidth = iframe.clientWidth;

        // Force body to use full iframe width with consistent margins
        if (iframeDoc.body) {
          const marginSize = 20; // 20px margins on each side
          const bodyWidth = iframeWidth - (marginSize * 2);

          iframeDoc.body.style.width = `${bodyWidth}px`;
          iframeDoc.body.style.maxWidth = 'none';
          iframeDoc.body.style.margin = `${marginSize}px`;
          iframeDoc.body.style.padding = '0';
          iframeDoc.body.style.boxSizing = 'border-box';
        }

        console.log('📦 Iframe resized - Height:', contentHeight + 20, 'px, Width:', iframeWidth, 'px');
      }
    }
  }

  openInNewWindow(): void {
    if (this.displayHtml) {
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(this.displayHtml);
        newWindow.document.close();
      }
    }
  }

  printHtml(): void {
    if (this.htmlFrame) {
      const iframe = this.htmlFrame.nativeElement;
      const iframeWindow = iframe.contentWindow;
      if (iframeWindow) {
        iframeWindow.focus();
        iframeWindow.print();
      }
    }
  }

  onCopy(): void {
    // Copy based on what's being displayed - prioritize displayHtml
    const content = this.displayHtml || this.displayMarkdown || this.jsonContent;
    if (content) {
      navigator.clipboard.writeText(content).then(() => {
        console.log('✅ Copied content to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
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
