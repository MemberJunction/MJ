import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';

/**
 * Viewer component for JSON artifacts
 */
@Component({
  selector: 'mj-json-artifact-viewer',
  template: `
    <div class="json-artifact-viewer" [ngClass]="cssClass">
      <div class="json-toolbar">
        <button class="btn-icon" title="Copy JSON" (click)="onCopy()">
          <i class="fas fa-copy"></i> Copy
        </button>
      </div>
      <div class="json-editor-container">
        <mj-code-editor
          [(ngModel)]="jsonContent"
          [language]="'json'"
          [readonly]="readonly"
          style="width: 100%; height: 100%;">
        </mj-code-editor>
      </div>
    </div>
  `,
  styles: [`
    .json-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .json-toolbar {
      display: flex;
      justify-content: flex-end;
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

    .json-editor-container {
      flex: 1;
      overflow: auto;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'JsonArtifactViewerPlugin')
export class JsonArtifactViewerComponent extends BaseArtifactViewerPluginComponent {
  public jsonContent = '';

  ngOnInit(): void {
    this.jsonContent = this.getContent();
  }

  onCopy(): void {
    if (this.jsonContent) {
      navigator.clipboard.writeText(this.jsonContent).then(() => {
        console.log('✅ Copied JSON to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }
}
