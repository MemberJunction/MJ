import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';

/**
 * Viewer component for Markdown artifacts
 */
@Component({
  standalone: false,
  selector: 'mj-markdown-artifact-viewer',
  template: `
    <div class="markdown-artifact-viewer" [ngClass]="cssClass">
      <div class="markdown-toolbar">
        <button class="btn-icon" [class.active]="viewMode === 'preview'"
                title="Preview" (click)="viewMode = 'preview'">
          <i class="fas fa-eye"></i> Preview
        </button>
        <button class="btn-icon" [class.active]="viewMode === 'source'"
                title="Source" (click)="viewMode = 'source'">
          <i class="fas fa-code"></i> Source
        </button>
        <button class="btn-icon" title="Copy Markdown" (click)="onCopy()">
          <i class="fas fa-copy"></i> Copy
        </button>
      </div>
      <div class="markdown-content-container">
        @if (viewMode === 'preview') {
          <div class="markdown-preview">
            <mj-markdown [data]="markdownContent"
                         [enableCollapsibleHeadings]="true"
                         [enableLineNumbers]="true"
                         [enableSmartypants]="true"
                         [enableHtml]="true"></mj-markdown>
          </div>
        } @else {
          <mj-code-editor
            [(ngModel)]="markdownContent"
            [language]="'markdown'"
            [readonly]="readonly"
            style="width: 100%; height: 100%;">
          </mj-code-editor>
        }
      </div>
    </div>
  `,
  styles: [`
    .markdown-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .markdown-toolbar {
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

    .markdown-content-container {
      flex: 1;
      overflow: auto;
    }

    .markdown-preview {
      padding: 20px;
      background: white;
      height: 100%;
      overflow: auto;
    }

    .markdown-preview ::ng-deep h1 {
      font-size: 2em;
      margin-top: 0.67em;
      margin-bottom: 0.67em;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 0.3em;
    }

    .markdown-preview ::ng-deep h2 {
      font-size: 1.5em;
      margin-top: 0.83em;
      margin-bottom: 0.83em;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 0.3em;
    }

    .markdown-preview ::ng-deep code {
      background: #f6f8fa;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
    }

    .markdown-preview ::ng-deep pre {
      background: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow: auto;
    }

    .markdown-preview ::ng-deep blockquote {
      border-left: 4px solid #dfe2e5;
      padding-left: 16px;
      color: #6a737d;
      margin: 0;
    }

    .markdown-preview ::ng-deep table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
    }

    .markdown-preview ::ng-deep th,
    .markdown-preview ::ng-deep td {
      border: 1px solid #dfe2e5;
      padding: 8px 16px;
    }

    .markdown-preview ::ng-deep th {
      background: #f6f8fa;
      font-weight: 600;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'MarkdownArtifactViewerPlugin')
export class MarkdownArtifactViewerComponent extends BaseArtifactViewerPluginComponent {
  public markdownContent = '';
  public viewMode: 'preview' | 'source' = 'preview';

  /**
   * Markdown artifacts always have content to display
   */
  public override get hasDisplayContent(): boolean {
    return true;
  }

  ngOnInit(): void {
    this.markdownContent = this.getContent();
  }

  onCopy(): void {
    if (this.markdownContent) {
      navigator.clipboard.writeText(this.markdownContent).then(() => {
        console.log('✅ Copied markdown to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }
}
