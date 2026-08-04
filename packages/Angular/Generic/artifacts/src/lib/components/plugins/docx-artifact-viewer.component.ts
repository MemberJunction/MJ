import { Component, OnInit, ChangeDetectorRef, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { DataSnapshot } from '@memberjunction/core';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';

/**
 * Viewer plugin for Word (DOCX) artifact versions stored in MJStorage.
 *
 * Downloads the binary file, converts it to HTML using mammoth.js, then
 * sanitizes the HTML before binding it with [innerHTML].
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
        @if (isLoading) {
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
          <div class="docx-viewer__content" [innerHTML]="safeHtml"></div>
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

      .docx-viewer__content {
        padding: 32px 48px;
        max-width: 900px;
        margin: 0 auto;
        color: var(--mj-text-primary);
        font-size: 14px;
        line-height: 1.7;
      }

      /* Normalize headings produced by mammoth */
      .docx-viewer__content :is(h1, h2, h3, h4, h5, h6) {
        color: var(--mj-text-primary);
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }

      .docx-viewer__content table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
      }

      .docx-viewer__content :is(td, th) {
        border: 1px solid var(--mj-border-default);
        padding: 6px 10px;
      }

      .docx-viewer__content th {
        background: var(--mj-bg-surface-card);
        font-weight: 600;
      }

      .docx-viewer__content a {
        color: var(--mj-text-link);
      }

      .docx-viewer__content img {
        max-width: 100%;
        height: auto;
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'DocxArtifactViewerPlugin')
export class DocxArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  public isLoading = true;
  public isDownloading = false;
  public errorMessage = '';
  public safeHtml: SafeHtml = '';

  /** Raw HTML produced by mammoth — kept for print. */
  private rawHtml = '';
  private downloadUrl = '';

  constructor(
    private fileService: ArtifactFileService,
    private sanitizer: DomSanitizer,
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

  public async onDownload(): Promise<void> {
    if (!this.downloadUrl || this.isDownloading) {
      return;
    }
    this.isDownloading = true;
    this.cdr.markForCheck();
    try {
      await this.triggerBrowserDownload(this.downloadUrl, this.artifactVersion?.FileName || 'document.docx');
    } finally {
      this.isDownloading = false;
      this.cdr.markForCheck();
    }
  }

  public onPrint(): void {
    if (!this.rawHtml) {
      return;
    }
    this.openPrintWindow(this.rawHtml);
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

      const html = await this.convertDocxToHtml(arrayBuffer);
      this.rawHtml = html;
      const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
      this.safeHtml = sanitized;
      this.isLoading = false;
      this.cdr.markForCheck();
    } catch (err) {
      this.showError(`Could not load document: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async convertDocxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ arrayBuffer });
    if (result.messages?.length) {
      // Log warnings from mammoth (e.g. unsupported features) without breaking display
      result.messages.forEach((m) => console.warn('[DocxViewer] mammoth:', m.message));
    }
    return result.value;
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

  private showError(message: string): void {
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
