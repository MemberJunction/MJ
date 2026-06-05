import { ChangeDetectorRef, Component, inject, OnInit, Type } from '@angular/core';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { IArtifactPreviewComponent } from '../../interfaces/artifact-viewer-plugin.interface';
import { VideoArtifactPreviewComponent } from '../previews/video-artifact-preview.component';

/**
 * Minimal full-size viewer plugin for video artifacts. Renders a `<video controls>` player that
 * fills the panel. Supports both storage modes:
 *   - `ContentMode === 'File'` — fetch a pre-auth URL from MJStorage via {@link ArtifactFileService}.
 *   - `ContentMode === 'Text'` — `Content` is a `data:<mime>;base64,…` URI, bound directly.
 *
 * Deliberately minimal — the richer inline experience lives in {@link VideoArtifactPreviewComponent}
 * (exposed via {@link previewComponentType}); this just needs to satisfy the required `componentType`.
 */
@Component({
    standalone: false,
    selector: 'mj-video-artifact-viewer',
    template: `
        <div class="video-viewer" [ngClass]="cssClass">
            @if (errorMessage) {
                <div class="video-viewer__state video-viewer__state--error">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    <span>{{ errorMessage }}</span>
                </div>
            } @else if (videoUrl) {
                <video class="video-viewer__video" controls preload="metadata" [src]="videoUrl" (error)="onMediaError()"></video>
            } @else {
                <div class="video-viewer__state">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>Loading video…</span>
                </div>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
            }

            .video-viewer {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                padding: 16px;
                background: var(--mj-bg-surface-sunken);
            }

            .video-viewer__video {
                max-width: 100%;
                max-height: 100%;
                border-radius: 4px;
                background: var(--mj-bg-surface);
            }

            .video-viewer__state {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                color: var(--mj-text-muted);
                font-size: 14px;
            }

            .video-viewer__state--error {
                color: var(--mj-status-error-text);
            }
        `,
    ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'VideoArtifactViewerPlugin')
export class VideoArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
    private readonly fileService = inject(ArtifactFileService);
    private readonly cdr = inject(ChangeDetectorRef);

    public videoUrl = '';
    public errorMessage = '';

    /**
     * Inline-preview component for video artifacts ({@link IArtifactViewerPluginPreviewStatics}).
     * STATIC so the resolver reads it off the constructor without instantiating this DI-using component.
     */
    public static readonly PreviewComponentType: Type<IArtifactPreviewComponent> = VideoArtifactPreviewComponent;

    /** Matches video artifacts by type name or `video/*` MIME. STATIC — drives preview resolution. */
    public static CanHandlePreview(artifactTypeName: string, contentType?: string): boolean {
        const mime = (contentType ?? '').toLowerCase();
        if (mime.startsWith('video/')) {
            return true;
        }
        return (artifactTypeName ?? '').trim().toLowerCase() === 'video';
    }

    public override get hasDisplayContent(): boolean {
        return true;
    }

    async ngOnInit(): Promise<void> {
        try {
            if (this.artifactVersion?.ContentMode === 'File' && this.artifactVersion.ID) {
                this.videoUrl = await this.fileService.getDownloadUrl(this.artifactVersion.ID);
            } else {
                const content = this.artifactVersion?.Content;
                if (content) {
                    this.videoUrl = content;
                } else {
                    this.errorMessage = 'This artifact has no video content.';
                }
            }
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            this.errorMessage = `Could not load video: ${detail}`;
        }
        this.cdr.markForCheck();
    }

    public onMediaError(): void {
        this.errorMessage = 'The video could not be played. It may be corrupt or in an unsupported format.';
        this.videoUrl = '';
        this.cdr.markForCheck();
    }

    public override GetCurrentStateSnapshot(): DataSnapshot | null {
        if (!this.artifactVersion) {
            return null;
        }
        const snap = new DataSnapshot();
        snap.title = this.getDisplayTitle() ?? undefined;
        snap.interpretation = `Video (${this.artifactVersion.MimeType ?? 'video'}).`;
        snap.custom = {
            mimeType: this.artifactVersion.MimeType ?? undefined,
            fileName: this.artifactVersion.FileName ?? undefined,
            contentMode: this.artifactVersion.ContentMode,
        };
        return snap;
    }
}
