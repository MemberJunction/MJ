import { Component } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';

/**
 * Viewer component for HTML artifacts
 */
@Component({
  standalone: false,
  selector: 'mj-html-artifact-viewer',
  template: `
    <div class="html-artifact-viewer" [ngClass]="cssClass">
      <div class="html-toolbar">
        <button class="btn-icon" [class.active]="viewMode === 'preview'"
                title="Preview" (click)="viewMode = 'preview'">
          <i class="fas fa-eye"></i> Preview
        </button>
        <button class="btn-icon" [class.active]="viewMode === 'source'"
                title="Source" (click)="viewMode = 'source'">
          <i class="fas fa-code"></i> Source
        </button>
        <button class="btn-icon" title="Copy HTML" (click)="onCopy()">
          <i class="fas fa-copy"></i> Copy
        </button>
      </div>
      <div class="html-content-container">
        @if (viewMode === 'preview') {
          <div class="html-preview">
            <div [innerHTML]="safeHtmlContent"></div>
          </div>
        } @else {
          <mj-code-editor
            [(ngModel)]="htmlContent"
            [language]="'html'"
            [readonly]="readonly"
            style="width: 100%; height: 100%;">
          </mj-code-editor>
        }
      </div>
    </div>
  `,
  styles: [`
    .html-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .html-toolbar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
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

    .btn-icon.active {
      background: #007acc;
      color: white;
      border-color: #007acc;
    }

    .html-content-container {
      flex: 1;
      overflow: auto;
    }

    .html-preview {
      padding: 20px;
      background: white;
      height: 100%;
      overflow: auto;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'HtmlArtifactViewerPlugin')
export class HtmlArtifactViewerComponent extends BaseArtifactViewerPluginComponent {
  public htmlContent = '';
  public safeHtmlContent: SafeHtml = '';
  public viewMode: 'preview' | 'source' = 'preview';

  /**
   * HTML artifacts always have content to display
   */
  public override get hasDisplayContent(): boolean {
    return true;
  }

  constructor(private sanitizer: DomSanitizer) {
    super();
  }

  ngOnInit(): void {
    // Get content and clean up double-escaped characters that can appear in LLM-generated HTML
    // These appear as literal "\\n", "\\t", "\\\"" in the string and cause rendering issues
    let content = this.getContent();

    // Remove escaped quotes (\" becomes ")
    content = content.replace(/\\"/g, '"');

    // Remove double-escaped newlines (\\n becomes nothing)
    // HTML doesn't need whitespace for formatting, and these cause display issues
    content = content.replace(/\\n/g, '');
    content = content.replace(/\\\\n/g, '');

    // Also remove double-escaped tabs if present
    content = content.replace(/\\t/g, '');
    content = content.replace(/\\\\t/g, '');

    this.htmlContent = content;
    this.safeHtmlContent = this.sanitizer.sanitize(1, this.htmlContent) || '';
  }

  onCopy(): void {
    if (this.htmlContent) {
      navigator.clipboard.writeText(this.htmlContent).then(() => {
        console.log('✅ Copied HTML to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }
}
