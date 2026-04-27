import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { DataSnapshot } from '@memberjunction/core';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';

/**
 * Viewer plugin for PDF artifact versions stored in MJStorage (ContentMode = 'File')
 * or as inline base64 content (ContentMode = 'Inline').
 *
 * Renders one page at a time using PDF.js. The toolbar provides page navigation
 * (including a direct page-jump input), zoom in/out, download, and print.
 *
 * Aspect-ratio preservation: the canvas backing buffer is sized at full HiDPI
 * resolution while the CSS size uses `aspect-ratio` + `height: auto` so both
 * dimensions scale proportionally. Pages wider than the panel scroll horizontally
 * inside the body — no max-width clamping, which is required for zoom to work.
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
        [showZoom]="true"
        [zoomPercent]="zoomPercent"
        [canZoomIn]="canZoomIn"
        [canZoomOut]="canZoomOut"
        (download)="onDownload()"
        (print)="onPrint()"
        (prevPage)="goToPrevPage()"
        (nextPage)="goToNextPage()"
        (pageChange)="onPageChange($event)"
        (zoomIn)="onZoomIn()"
        (zoomOut)="onZoomOut()"
        (zoomReset)="onZoomReset()"
      >
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
  styles: [
    `
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
        /* Prevent centered overflow from clipping the left side of zoomed pages.
         min-width: fit-content makes the wrap grow to fit the canvas so the
         parent overflow:auto container can scroll to both edges. */
        min-width: fit-content;
      }

      canvas {
        display: block;
        box-shadow: 0 2px 8px color-mix(in srgb, var(--mj-text-primary) 15%, transparent);
        /* Natural size — do NOT add max-width:100% here.
         renderPage sets width/aspect-ratio/height inline so the canvas renders at
         exactly the zoomed logical size. The scroll area (overflow:auto on the body)
         handles pages wider than the panel, which is the correct UX for zoom. */
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'PdfArtifactViewerPlugin')
export class PdfArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit, OnDestroy {
  @ViewChild('pdfCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  public isLoading = true;
  public isDownloading = false;
  public errorMessage = '';
  public currentPage = 1;
  public totalPages = 1;
  public zoomLevel = 1.0;

  private pdfDoc: PdfDocumentProxy | null = null;
  private renderTask: PdfRenderTask | null = null;
  private downloadUrl = '';
  private _pdfjsLib: PdfJsLib | null = null;

  /** Discrete zoom steps — 50 % to 400 %. */
  private readonly ZOOM_STEPS = [0.5, 0.67, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];
  /** Base render scale (logical pixels per PDF point at zoom 1.0). */
  private readonly BASE_SCALE = 1.5;

  constructor(
    private fileService: ArtifactFileService,
    private cdr: ChangeDetectorRef,
  ) {
    super();
  }

  public override get hasDisplayContent(): boolean {
    return true;
  }

  /** Current zoom as an integer percentage for toolbar display. */
  public get zoomPercent(): number {
    return Math.round(this.zoomLevel * 100);
  }

  public get canZoomIn(): boolean {
    return this.zoomLevel < this.ZOOM_STEPS[this.ZOOM_STEPS.length - 1];
  }

  public get canZoomOut(): boolean {
    return this.zoomLevel > this.ZOOM_STEPS[0];
  }

  async ngOnInit(): Promise<void> {
    await this.loadPdf();
  }

  ngOnDestroy(): void {
    this.cancelCurrentRender();
    this.pdfDoc?.destroy();
    this.pdfDoc = null;
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  public async goToNextPage(): Promise<void> {
    await this.onPageChange(this.currentPage + 1);
  }

  public async goToPrevPage(): Promise<void> {
    await this.onPageChange(this.currentPage - 1);
  }

  public async onPageChange(page: number): Promise<void> {
    const clamped = Math.max(1, Math.min(page, this.totalPages));
    if (clamped !== this.currentPage) {
      this.currentPage = clamped;
      await this.renderPage(this.currentPage);
    }
  }

  // ─── Zoom ────────────────────────────────────────────────────────────────────

  public async onZoomIn(): Promise<void> {
    const next = this.ZOOM_STEPS.find((z) => z > this.zoomLevel);
    if (next !== undefined) {
      this.zoomLevel = next;
      await this.renderPage(this.currentPage);
    }
  }

  public async onZoomOut(): Promise<void> {
    for (let i = this.ZOOM_STEPS.length - 1; i >= 0; i--) {
      if (this.ZOOM_STEPS[i] < this.zoomLevel) {
        this.zoomLevel = this.ZOOM_STEPS[i];
        await this.renderPage(this.currentPage);
        return;
      }
    }
  }

  public async onZoomReset(): Promise<void> {
    if (this.zoomLevel !== 1.0) {
      this.zoomLevel = 1.0;
      await this.renderPage(this.currentPage);
    }
  }

  // ─── Download / Print ───────────────────────────────────────────────────────

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
        this.downloadUrl = this.fileService.dataUrlToObjectUrl(content, this.artifactVersion.MimeType || 'application/pdf');
      }

      this.pdfDoc = pdfDoc;
      this.totalPages = pdfDoc.numPages;
      this.currentPage = 1;
      this.isLoading = false;
      // detectChanges() forces a synchronous DOM update so the canvas element
      // exists before renderPage() tries to draw on it.
      this.cdr.detectChanges();
      await this.setFitWidthZoom();
      await this.renderPage(1);
    } catch (err) {
      this.showError(`Could not load PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Set the initial zoom so the first page fills the available panel width.
   * Uses the exact ratio rather than snapping to a ZOOM_STEP so the page fits
   * pixel-perfectly. Subsequent +/- presses will snap to the nearest step.
   */
  private async setFitWidthZoom(): Promise<void> {
    if (!this.pdfDoc || !this.canvasRef?.nativeElement) {
      return;
    }
    const page = (await this.pdfDoc.getPage(1)) as PdfPageProxy;
    // naturalViewport.width is the CSS pixel width of the page at zoom = 1.0
    const naturalViewport = page.getViewport({ scale: this.BASE_SCALE });
    const body = this.canvasRef.nativeElement.closest('.pdf-viewer__body') as HTMLElement | null;
    const availableWidth = (body?.clientWidth ?? 0) - 32; // 16px padding each side
    if (availableWidth > 0 && naturalViewport.width > 0) {
      const fitZoom = availableWidth / naturalViewport.width;
      this.zoomLevel = Math.max(this.ZOOM_STEPS[0], Math.min(fitZoom, this.ZOOM_STEPS[this.ZOOM_STEPS.length - 1]));
    }
  }

  /** Dynamically import pdfjs-dist and point it at the bundled worker. */
  private async initPdfJs(): Promise<void> {
    const pdfjsLib = (await import('pdfjs-dist')) as unknown as PdfJsLib;
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

    const page = (await this.pdfDoc.getPage(pageNum)) as PdfPageProxy;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    // Scale = base * zoom * devicePixelRatio so backing buffer is always HiDPI-sharp.
    const viewport = page.getViewport({ scale: this.BASE_SCALE * this.zoomLevel * pixelRatio });

    // Backing buffer: full HiDPI resolution.
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // CSS logical pixel dimensions at the current zoom level.
    const cssWidth = viewport.width / pixelRatio;
    const cssHeight = viewport.height / pixelRatio;

    canvas.style.width = `${cssWidth}px`;
    // aspect-ratio + height:auto: when cssWidth is set explicitly and the page
    // renders at its natural size, the browser derives height proportionally.
    // Pages wider than the panel scroll horizontally — the body handles overflow.
    canvas.style.aspectRatio = `${cssWidth} / ${cssHeight}`;
    canvas.style.height = 'auto';

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

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const snap = new DataSnapshot();
    snap.title = this.getDisplayTitle() ?? undefined;
    snap.interpretation = `PDF document, ${this.totalPages} page${this.totalPages !== 1 ? 's' : ''}. Currently viewing page ${this.currentPage}.`;
    snap.custom = {
      pageCount: this.totalPages,
      currentPage: this.currentPage,
      fileName: this.artifactVersion.FileName ?? undefined,
      mimeType: this.artifactVersion.MimeType ?? 'application/pdf',
      contentMode: this.artifactVersion.ContentMode,
    };
    return snap;
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
