import { Component, OnInit, OnDestroy, ChangeDetectorRef, SecurityContext, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { DataSnapshot } from '@memberjunction/core';
import { BaseArtifactViewerPluginComponent, FILE_EXPORT_KEY, type ArtifactExportOption } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { FetchArrayBuffer } from '../previews/office-preview.logic';
import { PrintHtmlInSandboxedIframe } from '../../utils/html-sandbox.util';

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
        @if (!ArrayBuffer && !errorMessage) {
          <div class="docx-viewer__state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Loading document…</span>
          </div>
        } @else if (errorMessage) {
          <div class="docx-viewer__state docx-viewer__state--error">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>{{ errorMessage }}</span>
          </div>
        } @else {
          <mj-docx-preview [ArrayBuffer]="ArrayBuffer" (Loaded)="OnPreviewLoaded($event)" (Failed)="ShowError($event)"></mj-docx-preview>
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
export class DocxArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit, OnDestroy {
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
  private isObjectUrl = false;
  /** The document's bytes, handed to the shared preview once downloaded. */
  public ArrayBuffer: ArrayBuffer | null = null;

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

  ngOnDestroy(): void {
    this.revokeObjectUrl();
  }

  private revokeObjectUrl(): void {
    if (this.isObjectUrl && this.downloadUrl) {
      URL.revokeObjectURL(this.downloadUrl);
    }
    this.isObjectUrl = false;
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
      this.ShowError('No artifact version provided.');
      return;
    }

    try {
      let arrayBuffer: ArrayBuffer;

      this.revokeObjectUrl();
      if (this.artifactVersion.ContentMode === 'File') {
        // File-backed: download from storage via pre-auth URL
        this.downloadUrl = await this.fileService.GetDownloadUrl(this.artifactVersion.ID, false, this.Provider);
        arrayBuffer = await FetchArrayBuffer(this.downloadUrl);
      } else {
        // Inline: content is a base64 data URL stored in the artifact version
        const content = this.artifactVersion.Content;
        if (!content) {
          this.ShowError('Artifact has no content.');
          return;
        }
        arrayBuffer = this.fileService.DataUrlToArrayBuffer(content);
        // Create an object URL for download support
        this.downloadUrl = this.fileService.DataUrlToObjectUrl(
          content,
          this.artifactVersion.MimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
        this.isObjectUrl = true;
      }

      this.ArrayBuffer = arrayBuffer;
      this.cdr.markForCheck();
    } catch (err) {
      this.ShowError(`Could not load document: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** The shared preview has drawn the document: keep its HTML for print and clear the loading state. */
  public OnPreviewLoaded(html: string): void {
    this.rawHtml = html;
    this.SafeHtml = html;
    this.cdr.markForCheck();
  }


  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Open a minimal print window containing only the document HTML. The window shares this one's origin, so what goes
   * into it is sanitized as the display path sanitizes it, and the file name is escaped before it sits in `<title>`.
   */
  private openPrintWindow(html: string): void {
    const cleanHtml = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
    PrintHtmlInSandboxedIframe(cleanHtml, {
      Title: this.artifactVersion?.FileName ?? 'Document',
      TrustedPrintCss:
        'body { font-family: Georgia, serif; font-size: 13pt; line-height: 1.6; margin: 2cm; color: #000; } table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #999; padding: 4px 8px; } th { background: #eee; font-weight: bold; } img { max-width: 100%; }',
    });
  }

  public ShowError(message: string): void {
    this.errorMessage = message;
    this.cdr.markForCheck();
  }

  /** The original file, once it has loaded. */
  public override GetExportOptions(): ArtifactExportOption[] {
    return this.downloadUrl ? [this.FileExportOption('Word (.docx)', 'fa-solid fa-file-word', 'The original file')] : [];
  }

  public override async RunExport(key: string): Promise<void> {
    return key === FILE_EXPORT_KEY ? this.OnDownload() : super.RunExport(key);
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
