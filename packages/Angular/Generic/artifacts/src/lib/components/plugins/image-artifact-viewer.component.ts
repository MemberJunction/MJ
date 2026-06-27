import { ChangeDetectorRef, Component, OnDestroy, OnInit, Type } from '@angular/core';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { IArtifactPreviewComponent } from '../../interfaces/artifact-viewer-plugin.interface';
import { ImageArtifactPreviewComponent } from '../previews/image-artifact-preview.component';

/**
 * Lookup table for synthesizing a download filename when the artifact version
 * has no `FileName` set. Covers the MIME types declared by the seed `Image`
 * artifact type (`image/*`); anything not listed falls back to `img`.
 *
 * Exported so the unit test can assert the mapping without instantiating an
 * Angular component (the package's vitest config uses the `node` environment).
 */
export const IMAGE_MIME_EXTENSION_MAP: Readonly<Record<string, string>> = Object.freeze({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/tiff': 'tif',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'image/heif': 'heif',
});

/**
 * Pure helper that synthesizes a safe download filename from an artifact's
 * name + MIME type. Pulled out as a top-level function (not a class method) so
 * the vitest `node`-environment unit test can exercise it directly.
 *
 * - Strips characters illegal on common filesystems (anything not
 *   `[A-Za-z0-9._-]`) and replaces them with underscores.
 * - Picks the extension from {@link IMAGE_MIME_EXTENSION_MAP}, defaulting to
 *   `img` if the MIME type is missing or unrecognized.
 * - Falls back to the literal `image` when no name is supplied.
 *
 * @param name   Artifact name (e.g. `"Generated image 1"`). Optional.
 * @param mime   MIME type from the artifact version (e.g. `"image/jpeg"`). Optional.
 * @returns      Sanitized filename with extension (e.g. `"Generated_image_1.jpg"`).
 */
export function buildImageDownloadFileName(name: string | null | undefined, mime: string | null | undefined): string {
    // `??` falls back on null/undefined but NOT empty / whitespace-only names —
    // those should also use the default, so trim first and check for length.
    const trimmed = name?.trim();
    const baseName = trimmed && trimmed.length > 0 ? trimmed : 'image';
    const safeBase = baseName.replace(/[^A-Za-z0-9._-]/g, '_');
    const normalizedMime = (mime ?? '').toLowerCase();
    const extension = IMAGE_MIME_EXTENSION_MAP[normalizedMime] ?? 'img';
    // If the name already ends with the right extension, don't append it again
    // (e.g. metadata round-tripped through a file upload).
    return safeBase.toLowerCase().endsWith(`.${extension}`) ? safeBase : `${safeBase}.${extension}`;
}

/**
 * Viewer plugin for raster image artifact versions (`image/png`, `image/jpeg`,
 * `image/webp`, etc.). Vector SVG is handled by `SvgArtifactViewerPlugin`.
 *
 * Storage modes both supported (same contract as `PdfArtifactViewerPlugin`):
 *   - `ContentMode === 'Text'` — `artifactVersion.Content` is a `data:image/<mime>;base64,…` URI.
 *     We bind it directly to `<img [src]>`; the browser decodes inline.
 *   - `ContentMode === 'File'`  — bytes live in MJStorage. We fetch a
 *     pre-authenticated URL via `ArtifactFileService.getDownloadUrl()` and
 *     bind that to `<img [src]>`.
 *
 * UX highlights:
 *   - Click the image to toggle **fit** (default — `object-fit: contain` inside
 *     the panel) ↔ **actual** size (1:1 pixels, scrolls within the panel body).
 *   - Toolbar provides Download (reuses base class `triggerBrowserDownload`) and
 *     Print (opens in a new tab so the browser's native print dialog handles it).
 *   - Loading and error states match the PDF plugin's vocabulary, so behavior
 *     across all file-style viewers is consistent.
 *   - Image dimensions are surfaced as a small chip once the browser has decoded
 *     the image (`naturalWidth × naturalHeight`).
 *
 * Design tokens are used for every color so the plugin adapts to light / dark
 * themes — see root `CLAUDE.md` "Design Token System".
 *
 * @see PdfArtifactViewerComponent — the dual-storage reference implementation.
 * @see plans/artifact-attachment-unification.md — the broader artifact-as-canonical-storage design.
 * @see docs/chat-ui-image-display-bugs.md — context for why this plugin exists (Bug B).
 */
@Component({
    standalone: false,
    selector: 'mj-image-artifact-viewer',
    template: `
        <div class="image-viewer" [ngClass]="cssClass">
            <mj-file-artifact-toolbar
                [fileName]="toolbarFileName"
                [isDownloading]="isDownloading"
                [showPrint]="true"
                (download)="onDownload()"
                (print)="onPrint()"
            >
            </mj-file-artifact-toolbar>

            <div
                class="image-viewer__body"
                [class.image-viewer__body--actual]="displayMode === 'actual'"
            >
                @if (errorMessage) {
                    <div class="image-viewer__state image-viewer__state--error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                } @else {
                    @if (isLoading) {
                        <div class="image-viewer__state">
                            <i class="fas fa-spinner fa-spin"></i>
                            <span>Loading image…</span>
                        </div>
                    }
                    @if (imageUrl) {
                        <!-- The img is rendered even while loading=true (with opacity 0)
                             so the browser starts decoding immediately. The (load) handler
                             flips isLoading=false once dimensions are known. -->
                        <img
                            class="image-viewer__img"
                            [class.image-viewer__img--actual]="displayMode === 'actual'"
                            [class.image-viewer__img--hidden]="isLoading"
                            [src]="imageUrl"
                            [alt]="imageAltText"
                            [title]="
                                displayMode === 'fit'
                                    ? 'Click to view at actual size'
                                    : 'Click to fit to window'
                            "
                            (load)="onImageLoad($event)"
                            (error)="onImageError()"
                            (click)="toggleDisplayMode()"
                        />
                    }
                }
            </div>

            @if (naturalWidth && naturalHeight && !isLoading && !errorMessage) {
                <div class="image-viewer__dimensions">{{ naturalWidth }} × {{ naturalHeight }}</div>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
            }

            .image-viewer {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: var(--mj-bg-surface-sunken);
                position: relative;
            }

            .image-viewer__body {
                flex: 1;
                min-height: 0;
                overflow: auto;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
            }

            /* "Actual size" mode: allow scrolling from the top-left so large images
               don't get re-centered as the user pans. The browser handles overflow. */
            .image-viewer__body--actual {
                align-items: flex-start;
                justify-content: flex-start;
            }

            .image-viewer__state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                color: var(--mj-text-muted);
                font-size: 14px;
            }

            .image-viewer__state--error {
                color: var(--mj-status-error-text);
            }

            .image-viewer__img {
                /* Fit mode (default): never exceeds the panel, preserves aspect ratio. */
                max-width: 100%;
                max-height: 100%;
                width: auto;
                height: auto;
                object-fit: contain;
                cursor: zoom-in;
                background: var(--mj-bg-surface);
                border-radius: 4px;
                box-shadow: 0 2px 8px color-mix(in srgb, var(--mj-text-primary) 12%, transparent);
                transition: opacity 0.18s ease-out;
            }

            /* Actual-size mode: render at the image's intrinsic dimensions so the body
               scroll-area handles anything larger than the panel. */
            .image-viewer__img--actual {
                max-width: none;
                max-height: none;
                width: auto;
                height: auto;
                cursor: zoom-out;
            }

            /* Pre-load: keep the <img> in the DOM (so the browser decodes it) but
               invisible and out of layout flow so the spinner sits centered. */
            .image-viewer__img--hidden {
                opacity: 0;
                position: absolute;
                pointer-events: none;
            }

            .image-viewer__dimensions {
                position: absolute;
                bottom: 8px;
                right: 12px;
                padding: 2px 8px;
                background: color-mix(in srgb, var(--mj-bg-surface-elevated) 90%, transparent);
                border: 1px solid var(--mj-border-default);
                border-radius: 12px;
                color: var(--mj-text-muted);
                font-size: 11px;
                font-variant-numeric: tabular-nums;
                pointer-events: none;
                /* Don't intercept clicks meant for the image-toggle. */
            }
        `,
    ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'ImageArtifactViewerPlugin')
export class ImageArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit, OnDestroy {
    /** Current resolved URL to bind to the `<img src>` — either a data URI (inline) or a pre-auth URL (file). */
    public imageUrl = '';

    /** True from `ngOnInit` until the `<img>` `(load)` event fires (or an error happens). */
    public isLoading = true;

    /** Set while the download is in flight, to drive the toolbar spinner. */
    public isDownloading = false;

    /** User-facing error message; non-empty hides the image and shows the error block. */
    public errorMessage = '';

    /** Click-to-toggle display mode. `'fit'` = contained in the panel, `'actual'` = 1:1 with scroll. */
    public displayMode: 'fit' | 'actual' = 'fit';

    /** Native image dimensions, populated by the `(load)` event. Null until then. */
    public naturalWidth: number | null = null;
    public naturalHeight: number | null = null;

    /**
     * Object URL we lazily build from inline data so Download / Print have a real
     * URL to anchor on. Tracked here so `ngOnDestroy` can release it via
     * `URL.revokeObjectURL`. Null until the user clicks Download or Print.
     */
    private inlineObjectUrl: string | null = null;

    constructor(
        private fileService: ArtifactFileService,
        private cdr: ChangeDetectorRef,
    ) {
        super();
    }

    /**
     * Inline-preview component for image artifacts ({@link IArtifactViewerPluginPreviewStatics}).
     * STATIC so the resolver can read it off the registered constructor WITHOUT instantiating this
     * Angular component. Surfaces a contained thumbnail inside conversation message cards; the full
     * viewer (this class) remains the required `componentType`.
     */
    public static readonly PreviewComponentType: Type<IArtifactPreviewComponent> = ImageArtifactPreviewComponent;

    /** Matches raster image artifacts by type name or `image/*` MIME. STATIC — drives preview resolution. */
    public static CanHandlePreview(artifactTypeName: string, contentType?: string): boolean {
        const mime = (contentType ?? '').toLowerCase();
        if (mime.startsWith('image/')) {
            return true;
        }
        return (artifactTypeName ?? '').trim().toLowerCase() === 'image';
    }

    /** Opt in to the wrapper's "Display" tab — without this the panel only shows Details/JSON. */
    public override get hasDisplayContent(): boolean {
        return true;
    }

    /** Filename surfaced by the toolbar in the center of the bar. */
    public get toolbarFileName(): string {
        return this.artifactVersion?.FileName || this.artifactVersion?.Name || 'image';
    }

    /** Accessible alt text — prefers a descriptive name over a raw filename. */
    public get imageAltText(): string {
        return this.artifactVersion?.Name || this.artifactVersion?.FileName || 'Image artifact';
    }

    async ngOnInit(): Promise<void> {
        await this.resolveImageUrl();
    }

    ngOnDestroy(): void {
        // Release any blob URL we built for Download / Print so the browser
        // doesn't hold the raw bytes in memory after the panel closes.
        if (this.inlineObjectUrl) {
            URL.revokeObjectURL(this.inlineObjectUrl);
            this.inlineObjectUrl = null;
        }
    }

    // ─── Loading ────────────────────────────────────────────────────────────────

    /**
     * Resolve the image URL based on the artifact version's `ContentMode`.
     * Sets `imageUrl` (which the template binds to `<img src>`) or `errorMessage`.
     * Loading state remains `true` until the browser fires `(load)` on the `<img>`.
     */
    private async resolveImageUrl(): Promise<void> {
        if (!this.artifactVersion?.ID) {
            this.showError('No artifact version provided.');
            return;
        }

        // Defensive MIME check — refuse to render non-image artifacts. If we get here
        // it's a metadata bug somewhere (the ArtifactType registry routed something
        // non-image to the image plugin), and silently showing a broken-image icon
        // would mask the real issue.
        const mime = (this.artifactVersion.MimeType ?? '').toLowerCase();
        if (mime && !mime.startsWith('image/')) {
            this.showError(`This viewer cannot display content of type "${this.artifactVersion.MimeType}".`);
            return;
        }

        try {
            if (this.artifactVersion.ContentMode === 'File') {
                // File-backed: fetch a pre-auth URL from MJStorage via the shared service.
                // ArtifactFileService caches the URL so reopening the same artifact is instant.
                this.imageUrl = await this.fileService.getDownloadUrl(this.artifactVersion.ID);
            } else {
                // Inline ('Text' mode): Content is a data URI ready to bind directly.
                const content = this.artifactVersion.Content;
                if (!content) {
                    this.showError('This artifact has no image content.');
                    return;
                }
                this.imageUrl = content;
            }
            this.cdr.markForCheck();
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            this.showError(`Could not load image: ${detail}`);
        }
    }

    public onImageLoad(event: Event): void {
        const img = event.target as HTMLImageElement;
        this.naturalWidth = img.naturalWidth || null;
        this.naturalHeight = img.naturalHeight || null;
        this.isLoading = false;
        this.cdr.markForCheck();
    }

    public onImageError(): void {
        this.showError('The image could not be displayed. It may be corrupt or in an unsupported format.');
    }

    private showError(message: string): void {
        this.isLoading = false;
        this.errorMessage = message;
        this.cdr.markForCheck();
    }

    // ─── User actions ───────────────────────────────────────────────────────────

    public toggleDisplayMode(): void {
        // Don't toggle while loading or errored — the user has nothing to react to yet.
        if (this.isLoading || this.errorMessage) {
            return;
        }
        this.displayMode = this.displayMode === 'fit' ? 'actual' : 'fit';
        this.cdr.markForCheck();
    }

    /**
     * Download the image to disk. Uses the inherited `triggerBrowserDownload`
     * helper so the fetch → blob → object-URL → anchor pattern is shared across
     * every file-backed viewer (PDF, XLSX, DOCX, and now Image).
     */
    public async onDownload(): Promise<void> {
        if (this.isDownloading || !this.imageUrl) {
            return;
        }
        this.isDownloading = true;
        this.cdr.markForCheck();
        try {
            const sourceUrl = this.ensureDownloadableUrl();
            const fileName = buildImageDownloadFileName(
                this.artifactVersion?.FileName ?? this.artifactVersion?.Name ?? null,
                this.artifactVersion?.MimeType ?? null,
            );
            await this.triggerBrowserDownload(sourceUrl, fileName);
        } finally {
            this.isDownloading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Open the image in a new browser tab so the user can use the browser's
     * native print dialog. We deliberately don't manage a print pipeline
     * ourselves — same approach as `PdfArtifactViewerComponent.onPrint()`.
     */
    public onPrint(): void {
        if (!this.imageUrl) {
            return;
        }
        const sourceUrl = this.ensureDownloadableUrl();
        window.open(sourceUrl, '_blank');
    }

    /**
     * Returns a URL suitable for `<a download>` / `window.open` use.
     *   - File mode: `imageUrl` is already a pre-auth blob URL — use it directly.
     *   - Inline mode: `imageUrl` is a data URI; we lazily turn it into a blob URL
     *     (cached on the instance) for nicer download UX. Some browsers truncate
     *     long data URIs in the downloads tray; blob URLs preserve the filename.
     */
    private ensureDownloadableUrl(): string {
        if (this.artifactVersion?.ContentMode === 'File') {
            return this.imageUrl;
        }
        if (this.inlineObjectUrl) {
            return this.inlineObjectUrl;
        }
        const mime = this.artifactVersion?.MimeType || 'application/octet-stream';
        this.inlineObjectUrl = this.fileService.dataUrlToObjectUrl(this.imageUrl, mime);
        return this.inlineObjectUrl;
    }

    // ─── Snapshot ───────────────────────────────────────────────────────────────

    /**
     * Required by the base class. Returns a structured summary of the artifact
     * in its current display state — used by snapshot-consuming features
     * (e.g. agent context capture, share / export flows).
     */
    public override GetCurrentStateSnapshot(): DataSnapshot | null {
        if (!this.artifactVersion) {
            return null;
        }
        const snap = new DataSnapshot();
        snap.title = this.getDisplayTitle() ?? undefined;

        const dimensionPart =
            this.naturalWidth && this.naturalHeight ? ` ${this.naturalWidth} × ${this.naturalHeight}` : '';
        const mimeLabel = this.artifactVersion.MimeType ?? 'image';
        snap.interpretation = `Image (${mimeLabel}${dimensionPart}).`;

        snap.custom = {
            mimeType: this.artifactVersion.MimeType ?? undefined,
            fileName: this.artifactVersion.FileName ?? undefined,
            contentMode: this.artifactVersion.ContentMode,
            width: this.naturalWidth ?? undefined,
            height: this.naturalHeight ?? undefined,
            displayMode: this.displayMode,
        };
        return snap;
    }
}
