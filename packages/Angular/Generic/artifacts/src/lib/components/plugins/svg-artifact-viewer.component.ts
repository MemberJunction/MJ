import { Component } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';

/**
 * Viewer component for SVG artifacts
 */
@Component({
  standalone: false,
  selector: 'mj-svg-artifact-viewer',
  template: `
    <div class="svg-artifact-viewer" [ngClass]="cssClass">
      <div class="svg-toolbar">
        <button class="btn-icon" [class.active]="viewMode === 'preview'"
                title="Preview" (click)="viewMode = 'preview'">
          <i class="fas fa-eye"></i> Preview
        </button>
        <button class="btn-icon" [class.active]="viewMode === 'source'"
                title="Source" (click)="viewMode = 'source'">
          <i class="fas fa-code"></i> Source
        </button>
        <button class="btn-icon" title="Copy SVG" (click)="onCopy()">
          <i class="fas fa-copy"></i> Copy
        </button>
      </div>
      <div class="svg-content-container">
        @if (viewMode === 'preview') {
          <div class="svg-preview">
            <div class="svg-wrapper" [innerHTML]="safeSvgContent"></div>
          </div>
        } @else {
          <mj-code-editor
            [(ngModel)]="svgContent"
            [language]="'xml'"
            [readonly]="readonly"
            style="width: 100%; height: 100%;">
          </mj-code-editor>
        }
      </div>
    </div>
  `,
  styles: [`
    .svg-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .svg-toolbar {
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

    .svg-content-container {
      flex: 1;
      overflow: auto;
    }

    .svg-preview {
      padding: 20px;
      background: white;
      height: 100%;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .svg-wrapper {
      max-width: 100%;
      max-height: 100%;
    }

    .svg-wrapper ::ng-deep svg {
      max-width: 100%;
      max-height: 100%;
      height: auto;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'SvgArtifactViewerPlugin')
export class SvgArtifactViewerComponent extends BaseArtifactViewerPluginComponent {
  public SvgContent = '';

  /** @deprecated Use {@link SvgContent}. */
  public get svgContent() {
    return this.SvgContent;
  }
  /** @deprecated Use {@link SvgContent}. */
  public set svgContent(value) {
    this.SvgContent = value;
  }
  public SafeSvgContent: SafeHtml = '';

  /** @deprecated Use {@link SafeSvgContent}. */
  public get safeSvgContent(): SafeHtml {
    return this.SafeSvgContent;
  }
  /** @deprecated Use {@link SafeSvgContent}. */
  public set safeSvgContent(value: SafeHtml) {
    this.SafeSvgContent = value;
  }
  public ViewMode: 'preview' | 'source' = 'preview';

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'preview' | 'source' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: 'preview' | 'source') {
    this.ViewMode = value;
  }

  /**
   * SVG artifacts always have content to display
   */
  public override get hasDisplayContent(): boolean {
    return true;
  }

  constructor(private sanitizer: DomSanitizer) {
    super();
  }

  ngOnInit(): void {
    this.SvgContent = this.getContent();
    // For SVG, we use sanitize with SecurityContext.HTML (1) to allow safe rendering
    this.SafeSvgContent = this.sanitizer.sanitize(1, this.SvgContent) || '';
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const content = this.getRawContent();
    if (!content) return null;
    const snap = new DataSnapshot();
    snap.title = this.getDisplayTitle() ?? undefined;
    snap.custom = { content };
    return snap;
  }

  OnCopy(): void {
    if (this.SvgContent) {
      navigator.clipboard.writeText(this.SvgContent).then(() => {
        console.log('✅ Copied SVG to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }

  /** @deprecated Use {@link OnCopy}. */
  onCopy(): void {
    return this.OnCopy();
  }
}
