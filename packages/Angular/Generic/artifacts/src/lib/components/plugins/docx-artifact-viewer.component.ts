import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { DataSnapshot } from '@memberjunction/core';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';

/**
 * Viewer plugin for Word (DOCX) artifact versions stored in MJStorage.
 *
 * Downloads the binary file and hands the bytes to `mj-docx-preview`, Explorer's one Word renderer (mammoth to
 * sanitized HTML), which the Files form shares.
 *
 * Printing opens the sanitized content in a child window so the browser's
 * native print dialog renders the Word document faithfully.
 */
@Component({
  standalone: false,
  selector: 'mj-docx-artifact-viewer',
  template: `
    <div class="docx-viewer">
      <mj-file-artifact-toolbar
        [fileName]="artifactVersion.FileName || 'document.docx'"
        [isDownloading]="isDownloading"
        [showPrint]="true"
        (download)="onDownload()"
        (print)="onPrint()"
      >
      </mj-file-artifact-toolbar>

      <div class="docx-viewer__body">
        @if (!arrayBuffer && !errorMessage) {
          <div class="docx-viewer__state">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading document…</span>
          </div>
        } @else if (errorMessage) {
          <div class="docx-viewer__state docx-viewer__state--error">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{{ errorMessage }}</span>
          </div>
        } @else {
          <mj-docx-preview [arrayBuffer]="arrayBuffer" (loaded)="OnPreviewLoaded($event)" (failed)="showError($event)"></mj-docx-preview>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .docx-viewer {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--mj-bg-surface);
      }

      .docx-viewer__body {
        flex: 1;
        min-height: 0;
        overflow: auto;
      }

      .docx-viewer__state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        height: 100%;
        color: var(--mj-text-muted);
        font-size: 14px;
      }

      .docx-viewer__state--error {
        color: var(--mj-status-error-text);
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'DocxArtifactViewerPlugin')
export class DocxArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  public isLoading = true;
  public IsDownloading = false;

  /** @deprecated Use {@link IsDownloading}. */
  public get isDownloading() {
    return this.IsDownloading;
  }
  /** @deprecated Use {@link IsDownloading}. */
  public set isDownloading(value) {
    this.IsDownloading = value;
  }
  public errorMessage = '';
  public SafeHtml: SafeHtml = '';

  /** @deprecated Use {@link SafeHtml}. */
  public get safeHtml(): SafeHtml {
    return this.SafeHtml;
  }
  /** @deprecated Use {@link SafeHtml}. */
  public set safeHtml(value: SafeHtml) {
    this.SafeHtml = value;
  }

  /** Raw HTML produced by mammoth — kept for print. Set when the preview reports it loaded. */
  private rawHtml = '';
  private downloadUrl = '';
  /** The document's bytes, handed to the shared preview once downloaded. */
  public arrayBuffer: ArrayBuffer | null = null;

  constructor(
    private fileService: ArtifactFileService,
    private cdr: ChangeDetectorRef,
  ) {
    super();
  }

  public override get hasDisplayContent(): boolean {
    return true;
  }

  async ngOnInit(): Promise<void> {
    await this.loadDocument();
  }

  public async OnDownload(): Promise<void> {
    if (!this.downloadUrl || this.IsDownloading) {
      return;
    }
    this.IsDownloading = true;
    this.cdr.markForCheck();
    try {
      await this.triggerBrowserDownload(this.downloadUrl, this.artifactVersion?.FileName || 'document.docx');
    } finally {
      this.IsDownloading = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link OnDownload}. */
  public async onDownload(): Promise<void> {
    return this.OnDownload();
  }

  public OnPrint(): void {
    if (!this.rawHtml) {
      return;
    }
    this.openPrintWindow(this.rawHtml);
  }

  /** @deprecated Use {@link OnPrint}. */
  public onPrint(): void {
    return this.OnPrint();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async loadDocument(): Promise<void> {
    if (!this.artifactVersion?.ID) {
      this.showError('No artifact version provided.');
      return;
    }

    try {
      let arrayBuffer: ArrayBuffer;

      if (this.artifactVersion.ContentMode === 'File') {
        // File-backed: download from storage via pre-auth URL
        this.downloadUrl = await this.fileService.getDownloadUrl(this.artifactVersion.ID);
        arrayBuffer = await this.fetchAsArrayBuffer(this.downloadUrl);
      } else {
        // Inline: content is a base64 data URL stored in the artifact version
        const content = this.artifactVersion.Content;
        if (!content) {
          this.showError('Artifact has no content.');
          return;
        }
        arrayBuffer = this.fileService.dataUrlToArrayBuffer(content);
        // Create an object URL for download support
        this.downloadUrl = this.fileService.dataUrlToObjectUrl(
          content,
          this.artifactVersion.MimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
      }

      this.arrayBuffer = arrayBuffer;
      this.cdr.markForCheck();
    } catch (err) {
      this.showError(`Could not load document: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** The shared preview has drawn the document: keep its HTML for print and clear the loading state. */
  public OnPreviewLoaded(html: string): void {
    this.rawHtml = html;
    this.SafeHtml = html;
    this.isLoading = false;
    this.cdr.markForCheck();
  }

  private async fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching file`);
    }
    return response.arrayBuffer();
  }

  /** Open a minimal print window containing only the document HTML. */
  private openPrintWindow(html: string): void {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      console.warn('[DocxViewer] Popup was blocked — cannot print');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${this.artifactVersion?.FileName ?? 'Document'}</title>
          <style>
            body { font-family: Georgia, serif; font-size: 13pt; line-height: 1.6; margin: 2cm; color: #000; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #999; padding: 4px 8px; }
            th { background: #eee; font-weight: bold; }
            img { max-width: 100%; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }

  public showError(message: string): void {
    this.isLoading = false;
    this.errorMessage = message;
    this.cdr.markForCheck();
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const snap = new DataSnapshot();
    snap.title = this.getDisplayTitle() ?? undefined;
    snap.interpretation = 'Word document (.docx).';
    snap.custom = {
      fileName: this.artifactVersion.FileName ?? undefined,
      mimeType: this.artifactVersion.MimeType ?? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentMode: this.artifactVersion.ContentMode,
    };
    return snap;
  }
}
