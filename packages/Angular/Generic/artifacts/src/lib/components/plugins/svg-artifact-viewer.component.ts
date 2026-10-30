import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MarkdownService } from '@memberjunction/ng-markdown';
import { MountInteractiveDiagram, type DiagramViewerInstance } from '@memberjunction/ai-diagrams/viewer';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';

/**
 * Viewer component for SVG artifacts.
 *
 * Uses DOMPurify's SVG profile (via `MarkdownService.sanitizeHtml`) instead of Angular's HTML
 * sanitizer so `<svg>`, `<style>`, `<desc>`, and `data-*` attributes survive intact.
 * When the SVG carries the MJ Diagram SVG Data Contract (`data-mj-diagram="1"`), mounts the
 * interactive diagram viewer (`MountInteractiveDiagram`) with click-to-inspect node details
 * and upstream/downstream path tracing.
 */
@Component({
  standalone: false,
  selector: 'mj-svg-artifact-viewer',
  template: `
    <div class="svg-artifact-viewer" [ngClass]="cssClass">
      <div class="svg-toolbar">
        <button class="btn-icon" [class.active]="ViewMode === 'preview'"
                title="Preview" (click)="SetViewMode('preview')">
          <i class="fa-solid fa-eye"></i> Preview
        </button>
        <button class="btn-icon" [class.active]="ViewMode === 'source'"
                title="Source" (click)="SetViewMode('source')">
          <i class="fa-solid fa-code"></i> Source
        </button>
        <button class="btn-icon" title="Copy SVG" (click)="OnCopy()">
          <i class="fa-solid fa-copy"></i> Copy
        </button>
      </div>
      <div class="svg-content-container">
        @if (ViewMode === 'preview') {
          @if (IsInteractiveDiagram) {
            <div #interactiveHost class="svg-interactive-host"></div>
          } @else {
            <div class="svg-preview">
              <div class="svg-wrapper" [innerHTML]="SafeSvgContent"></div>
            </div>
          }
        } @else {
          <mj-code-editor
            [(ngModel)]="SvgContent"
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
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .btn-icon {
      padding: 6px 12px;
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-icon:hover {
      background: var(--mj-bg-surface-hover);
      border-color: var(--mj-border-strong);
    }

    .btn-icon.active {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border-color: var(--mj-brand-primary);
    }

    .svg-content-container {
      flex: 1;
      overflow: auto;
    }

    .svg-interactive-host {
      padding: 12px;
      min-height: 100%;
      box-sizing: border-box;
    }

    .svg-preview {
      padding: 20px;
      background: var(--mj-bg-surface);
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
export class SvgArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit, AfterViewInit, OnDestroy {
  public SvgContent = '';
  public IsInteractiveDiagram = false;

  @ViewChild('interactiveHost')
  private interactiveHost?: ElementRef<HTMLElement>;

  private viewerInstance: DiagramViewerInstance | null = null;

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
    this.SetViewMode(value);
  }

  /**
   * SVG artifacts always have content to display
   */
  public override get hasDisplayContent(): boolean {
    return true;
  }

  constructor(
    private sanitizer: DomSanitizer,
    private markdownService: MarkdownService
  ) {
    super();
  }

  ngOnInit(): void {
    this.refreshSvgContent();
  }

  ngAfterViewInit(): void {
    this.mountInteractiveIfReady();
  }

  ngOnDestroy(): void {
    this.destroyInteractiveViewer();
  }

  public SetViewMode(mode: 'preview' | 'source'): void {
    if (this.ViewMode === mode) return;
    if (mode === 'source') {
      this.destroyInteractiveViewer();
    }
    this.ViewMode = mode;
    if (mode === 'preview' && this.IsInteractiveDiagram) {
      setTimeout(() => this.mountInteractiveIfReady(), 0);
    }
  }

  private refreshSvgContent(): void {
    this.SvgContent = this.getContent();
    this.IsInteractiveDiagram =
      this.SvgContent.includes('data-mj-diagram="1"') ||
      this.SvgContent.includes("data-mj-diagram='1'");
    const sanitized = this.markdownService.sanitizeHtml(this.SvgContent);
    this.SafeSvgContent = this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }

  private mountInteractiveIfReady(): void {
    this.destroyInteractiveViewer();
    if (!this.IsInteractiveDiagram || this.ViewMode !== 'preview') return;
    const host = this.interactiveHost?.nativeElement;
    if (!host) return;
    this.viewerInstance = MountInteractiveDiagram(host, this.SvgContent, {
      Sanitize: (raw) => this.markdownService.sanitizeHtml(raw),
    });
  }

  private destroyInteractiveViewer(): void {
    if (this.viewerInstance) {
      this.viewerInstance.Destroy();
      this.viewerInstance = null;
    }
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
