import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { RunView } from '@memberjunction/core';
import { ArtifactVersionAttributeEntity } from '@memberjunction/core-entities';
import { marked } from 'marked';

/**
 * Viewer component for JSON artifacts.
 * Supports extract rules - shows displayMarkdown, displayHtml, or raw JSON editor (in that priority order).
 * All content is displayed in the parent's Display tab.
 */
@Component({
  selector: 'mj-json-artifact-viewer',
  template: `
    <div class="json-artifact-viewer" [ngClass]="cssClass">
      <!-- Display toolbar -->
      <div class="display-toolbar">
        <button class="btn-icon" title="Copy Content" (click)="onCopy()">
          <i class="fas fa-copy"></i> Copy
        </button>
      </div>

      <!-- Display content: priority order = displayMarkdown > displayHtml > JSON editor -->
      <div class="display-content">
        @if (displayMarkdown) {
          <div class="markdown-content" [innerHTML]="renderedMarkdown"></div>
        } @else if (displayHtml) {
          <div class="html-content" [innerHTML]="displayHtml"></div>
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
    }

    .btn-icon:hover {
      background: #e9ecef;
      border-color: #999;
    }

    .display-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .markdown-content,
    .html-content {
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
export class JsonArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  public jsonContent = '';
  public displayMarkdown: string | null = null;
  public displayHtml: string | null = null;
  public renderedMarkdown: SafeHtml | null = null;
  private versionAttributes: ArtifactVersionAttributeEntity[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    super();
  }

  async ngOnInit(): Promise<void> {
    this.jsonContent = this.getContent();

    // Load version attributes to check for extract rules
    await this.loadVersionAttributes();

    // Trigger change detection after async load
    this.cdr.detectChanges();
  }

  /**
   * Override to return true when showing extracted displayMarkdown or displayHtml.
   * Returns false when showing raw JSON editor (no extract rules available).
   */
  public override get isShowingElevatedDisplay(): boolean {
    return !!(this.displayMarkdown || this.displayHtml);
  }

  private async loadVersionAttributes(): Promise<void> {
    if (!this.artifactVersion?.ID) {
      console.log('📦 JSON Plugin: No artifactVersion.ID, skipping attribute load');
      return;
    }

    console.log(`📦 JSON Plugin: Loading attributes for version ID: ${this.artifactVersion.ID}`);

    try {
      const rv = new RunView();
      const result = await rv.RunView<ArtifactVersionAttributeEntity>({
        EntityName: 'MJ: Artifact Version Attributes',
        ExtraFilter: `ArtifactVersionID='${this.artifactVersion.ID}'`,
        ResultType: 'entity_object'
      });

      console.log(`📦 JSON Plugin: RunView completed. Success=${result.Success}, Results count=${result.Results?.length || 0}`);

      if (result.Success && result.Results) {
        this.versionAttributes = result.Results;

        console.log(`📦 JSON Plugin: Loaded ${this.versionAttributes.length} attributes for version ${this.artifactVersion.ID}`);
        console.log(`📦 Attributes:`, this.versionAttributes.map(a => ({ name: a.Name, hasValue: !!a.Value })));

        // Check for displayMarkdown or displayHtml attributes (from extract rules)
        const displayMarkdownAttr = this.versionAttributes.find(a => a.Name?.toLowerCase() === 'displaymarkdown');
        const displayHtmlAttr = this.versionAttributes.find(a => a.Name?.toLowerCase() === 'displayhtml');

        console.log(`📦 displayMarkdownAttr:`, displayMarkdownAttr ? { name: displayMarkdownAttr.Name, valueLength: displayMarkdownAttr.Value?.length } : 'not found');
        console.log(`📦 displayHtmlAttr:`, displayHtmlAttr ? { name: displayHtmlAttr.Name, valueLength: displayHtmlAttr.Value?.length } : 'not found');

        // Parse attribute values
        this.displayMarkdown = this.parseAttributeValue(displayMarkdownAttr?.Value);
        this.displayHtml = this.parseAttributeValue(displayHtmlAttr?.Value);

        // Convert markdown to HTML if we have markdown content
        if (this.displayMarkdown) {
          try {
            const html = marked.parse(this.displayMarkdown) as string;
            this.renderedMarkdown = this.sanitizer.sanitize(1, html); // 1 = SecurityContext.HTML
          } catch (err) {
            console.error('📦 Error converting markdown to HTML:', err);
            // Fallback to plain text
            this.renderedMarkdown = this.displayMarkdown;
          }
        }

        console.log(`📦 JSON Plugin: displayMarkdown=${!!this.displayMarkdown} (${this.displayMarkdown?.length} chars), displayHtml=${!!this.displayHtml} (${this.displayHtml?.length} chars)`);
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

    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string') {
        return parsed;
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If not valid JSON, return as-is
      return value;
    }
  }

  onCopy(): void {
    // Copy based on what's being displayed
    const content = this.displayMarkdown || this.displayHtml || this.jsonContent;
    if (content) {
      navigator.clipboard.writeText(content).then(() => {
        console.log('✅ Copied content to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }
}
