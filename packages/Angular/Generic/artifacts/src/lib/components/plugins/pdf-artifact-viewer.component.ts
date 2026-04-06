import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';

/**
 * Viewer plugin for PDF artifact versions stored in MJStorage (ContentMode = 'File').
 *
 * Renders one page at a time using PDF.js with an in-process (fake) worker so
 * no separate worker bundle is required. Navigation arrows in the shared toolbar
 * let the user page through the document.
 */
@Component({
  standalone: false,
  selector: 'mj-pdf-artifact-viewer',
  template: `
    <div class="pdf-viewer">
      <mj-file-artifact-toolbar
        [fileName]="artifactVersion?.FileName || 'document.pdf'"
        [currentPage]="currentPage"
        [totalPages]="totalPages"
        [isDownloading]="isDownloading"
        [showPrint]="true"
        (download)="onDownload()"
        (print)="onPrint()"
        (prevPage)="goToPrevPage()"
        (nextPage)="goToNextPage()">
      </mj-file-artifact-toolbar>

      <div class="pdf-viewer__body">
        @if (isLoading) {
          <div class="pdf-viewer__state">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading PDF…</span>
          </div>
        } @else if (errorMessage) {
          <div class="pdf-viewer__state pdf-viewer__state--error">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{{ errorMessage }}</span>
          </div>
        } @else {
          <div class="pdf-viewer__canvas-wrap">
            <canvas #pdfCanvas></canvas>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .pdf-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface-sunken);
    }

    .pdf-viewer__body {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    .pdf-viewer__state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      height: 100%;
      color: var(--mj-text-muted);
      font-size: 14px;
    }

    .pdf-viewer__state--error {
      color: var(--mj-status-error-text);
    }

    .pdf-viewer__canvas-wrap {
      display: flex;
      justify-content: center;
      padding: 16px;
    }

    canvas {
      box-shadow: 0 2px 8px color-mix(in srgb, var(--mj-text-primary) 15%, transparent);
      max-width: 100%;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'PdfArtifactViewerPlugin')
export class PdfArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit, OnDestroy {

  @ViewChild('pdfCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  public isLoading = true;
  public isDownloading = false;
  public errorMessage = '';
  public currentPage = 1;
  public totalPages = 1;

  private pdfDoc: PdfDocumentProxy | null = null;
  private renderTask: PdfRenderTask | null = null;
  private downloadUrl = '';
  private _pdfjsLib: PdfJsLib | null = null;

  constructor(
    private fileService: ArtifactFileService,
    private cdr: ChangeDetectorRef,
  ) {
    super();
  }

  public override get hasDisplayContent(): boolean { return true; }
  public override get parentShouldShowRawContent(): boolean { return false; }
  public override GetStandardTabRemovals(): string[] { return ['JSON']; }

  async ngOnInit(): Promise<void> {
    await this.loadPdf();
  }

  ngOnDestroy(): void {
    this.cancelCurrentRender();
    this.pdfDoc?.destroy();
    this.pdfDoc = null;
  }

  public async goToNextPage(): Promise<void> {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      await this.renderPage(this.currentPage);
    }
  }

  public async goToPrevPage(): Promise<void> {
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.renderPage(this.currentPage);
    }
  }

  public async onDownload(): Promise<void> {
    if (!this.downloadUrl || this.isDownloading) {
      return;
    }
    this.isDownloading = true;
    this.cdr.markForCheck();
    try {
      await this.triggerBrowserDownload(this.downloadUrl, this.artifactVersion?.FileName || 'document.pdf');
    } finally {
      this.isDownloading = false;
      this.cdr.markForCheck();
    }
  }

  public onPrint(): void {
    if (!this.downloadUrl) {
      return;
    }
    // Open the PDF in a new tab so the browser's native print dialog handles it
    window.open(this.downloadUrl, '_blank');
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async loadPdf(): Promise<void> {
    if (!this.artifactVersion?.ID) {
      this.showError('No artifact version provided.');
      return;
    }

    try {
      await this.initPdfJs();
      let pdfDoc: PdfDocumentProxy;

      if (this.artifactVersion.ContentMode === 'File') {
        // File-backed: download from storage via pre-auth URL
        this.downloadUrl = await this.fileService.getDownloadUrl(this.artifactVersion.ID);
        pdfDoc = await this.loadPdfDocument(this.downloadUrl);
      } else {
        // Inline: content is a base64 data URL stored in the artifact version
        const content = this.artifactVersion.Content;
        if (!content) {
          this.showError('Artifact has no content.');
          return;
        }
        const arrayBuffer = this.fileService.dataUrlToArrayBuffer(content);
        pdfDoc = await this.loadPdfFromData(new Uint8Array(arrayBuffer));
        // Create an object URL for download/print support
        this.downloadUrl = this.fileService.dataUrlToObjectUrl(
          content,
          this.artifactVersion.MimeType || 'application/pdf'
        );
      }

      this.pdfDoc = pdfDoc;
      this.totalPages = pdfDoc.numPages;
      this.currentPage = 1;
      this.isLoading = false;
      this.cdr.detectChanges();
      await this.renderPage(1);
    } catch (err) {
      this.showError(`Could not load PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Dynamically import pdfjs-dist and point it at the bundled worker. */
  private async initPdfJs(): Promise<void> {
    const pdfjsLib = await import('pdfjs-dist') as unknown as PdfJsLib;
    // pdfjs-dist v4 requires an explicit workerSrc. The worker file is copied to
    // /assets/pdf.worker.min.mjs via the angular.json assets config in MJExplorer.
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';
    this._pdfjsLib = pdfjsLib;
  }

  private async loadPdfDocument(url: string): Promise<PdfDocumentProxy> {
    const pdfjsLib = this._pdfjsLib!;
    const loadingTask = pdfjsLib.getDocument(url);
    return loadingTask.promise;
  }

  private async loadPdfFromData(data: Uint8Array): Promise<PdfDocumentProxy> {
    const pdfjsLib = this._pdfjsLib!;
    const loadingTask = pdfjsLib.getDocument({ data });
    return loadingTask.promise;
  }

  private async renderPage(pageNum: number): Promise<void> {
    if (!this.pdfDoc || !this.canvasRef?.nativeElement) {
      return;
    }

    this.cancelCurrentRender();

    const page = await this.pdfDoc.getPage(pageNum) as PdfPageProxy;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: 1.5 * pixelRatio });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    // CSS size stays at logical pixels so the canvas is sharp on high-DPI screens
    canvas.style.width = `${viewport.width / pixelRatio}px`;
    canvas.style.height = `${viewport.height / pixelRatio}px`;

    const renderContext = { canvasContext: ctx, viewport };
    this.renderTask = page.render(renderContext) as PdfRenderTask;
    await this.renderTask.promise;
    this.renderTask = null;
    this.cdr.markForCheck();
  }

  private cancelCurrentRender(): void {
    if (this.renderTask) {
      this.renderTask.cancel();
      this.renderTask = null;
    }
  }

  private showError(message: string): void {
    this.isLoading = false;
    this.errorMessage = message;
    this.cdr.markForCheck();
  }

  private async triggerBrowserDownload(url: string, fileName: string): Promise<void> {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }
}

// ─── Minimal type shims for pdfjs-dist dynamic import ─────────────────────────
// We avoid a hard build-time dependency on pdfjs-dist types by declaring only
// the surface we actually use.

interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy(): void;
}

interface PdfPageProxy {
  getViewport(params: { scale: number }): { width: number; height: number };
  render(renderContext: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): PdfRenderTask;
}

interface PdfRenderTask {
  promise: Promise<void>;
  cancel(): void;
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: string | { data: Uint8Array }): { promise: Promise<PdfDocumentProxy> };
}
