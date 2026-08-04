import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { MediaTrack } from '@memberjunction/ng-media-player';
import { BaseArtifactPreviewComponent } from './base-artifact-preview.component';

/**
 * Inline preview for video artifacts. Embeds the generic {@link MJMediaPlayerComponent}
 * (`mj-media-player`) in a compact, thumbnail-sized configuration inside the conversation message
 * card. Click events on the player are stopped from propagating so scrubbing / play-pause does
 * NOT open the full-size viewer (the card's other regions still open it).
 *
 * Compact gating: play/pause + scrubber + time (and fullscreen, which is handy for a tiny video
 * surface) are shown. Transcript, waveform, speed, skip and volume chrome are turned OFF so the
 * player reads cleanly at preview size and doesn't crowd the card.
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
            <mj-media-player
                class="video-preview__player"
                [Tracks]="MediaTracks"
                [ShowTranscript]="false"
                [ShowTranscriptToggle]="false"
                [ShowWaveform]="false"
                [ShowSpeedControl]="false"
                [ShowSkipControls]="false"
                [ShowVolume]="false"
                (click)="$event.stopPropagation()"
                (Ended)="onMediaEnded()"
            ></mj-media-player>
        }
    `,
    styles: [
        `
            :host {
                display: block;
            }

            /* Compact thumbnail — cap the height so the video surface stays consistent with the
               image preview (140px) and neither dominates the conversation card. */
            .video-preview__player {
                display: block;
                width: 100%;
                max-width: 100%;
                max-height: 140px;
                border-radius: 6px;
                overflow: hidden;
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

    /** Resolved URL — data URI (inline) or pre-auth URL (file). Funneled through {@link setVideoUrl}. */
    public videoUrl = '';

    /** Non-empty hides the player and shows a compact error line. */
    public errorMessage = '';

    /**
     * Single-track input for the generic {@link MJMediaPlayerComponent}. Rebuilt in lockstep with
     * {@link videoUrl} via {@link setVideoUrl}; `[]` until a URL exists so the player shows its empty state.
     */
    public MediaTracks: MediaTrack[] = [];

    /** Set the resolved URL and recompute the single-element {@link MediaTracks} array in lockstep. */
    private setVideoUrl(url: string): void {
        this.videoUrl = url;
        this.MediaTracks = url
            ? [
                  {
                      Id: this.artifactVersion?.ID ?? 'video',
                      Kind: 'video',
                      Url: url,
                      MimeType: this.artifactVersion?.MimeType ?? undefined,
                  },
              ]
            : [];
    }

    async ngOnInit(): Promise<void> {
        try {
            const url = await this.resolveContentUrl();
            if (url) {
                this.setVideoUrl(url);
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
        this.setVideoUrl('');
        this.cdr.markForCheck();
    }

    /** Fired when the generic player reaches the end of the track. No-op affordance hook. */
    public onMediaEnded(): void {
        // Playback finished — nothing to persist for an inline preview.
    }
}
