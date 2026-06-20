import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { BaseArtifactPreviewComponent } from './base-artifact-preview.component';

/**
 * Inline preview for video artifacts. Renders a capped `<video controls preload="metadata">`
 * mini player inside the conversation message card. Click events on the player are stopped from
 * propagating so scrubbing / play-pause does NOT open the full-size viewer (the card's other
 * regions still open it).
 */
@Component({
    standalone: false,
    selector: 'mj-video-artifact-preview',
    template: `
        @if (errorMessage) {
            <div class="video-preview video-preview--error">
                <i class="fa-solid fa-film"></i>
                <span>{{ errorMessage }}</span>
            </div>
        } @else if (videoUrl) {
            <video
                class="video-preview__video"
                controls
                preload="metadata"
                [src]="videoUrl"
                (click)="$event.stopPropagation()"
                (error)="onMediaError()"
            ></video>
        }
    `,
    styles: [
        `
            :host {
                display: block;
            }

            /* Compact thumbnail height — kept in sync with the image preview (140px) so both
               visual media previews stay consistent and neither dominates the conversation.
               Video keeps width:100% (unlike image) because the player chrome reads better at
               full card width. */
            .video-preview__video {
                display: block;
                max-width: 100%;
                max-height: 140px;
                width: 100%;
                height: auto;
                border-radius: 6px;
                background: var(--mj-bg-surface-sunken);
            }

            .video-preview--error {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                color: var(--mj-text-muted);
                font-size: 13px;
            }
        `,
    ],
})
export class VideoArtifactPreviewComponent extends BaseArtifactPreviewComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    /** Resolved URL bound to `<video src>` — data URI (inline) or pre-auth URL (file). */
    public videoUrl = '';

    /** Non-empty hides the player and shows a compact error line. */
    public errorMessage = '';

    async ngOnInit(): Promise<void> {
        try {
            const url = await this.resolveContentUrl();
            if (url) {
                this.videoUrl = url;
            } else {
                this.errorMessage = 'No video content.';
            }
        } catch {
            this.errorMessage = 'Could not load video.';
        }
        this.cdr.markForCheck();
    }

    public onMediaError(): void {
        this.errorMessage = 'Video could not be played.';
        this.videoUrl = '';
        this.cdr.markForCheck();
    }
}
