import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { MediaTrack } from '@memberjunction/ng-media-player';
import { BaseArtifactPreviewComponent } from './base-artifact-preview.component';

/**
 * Inline preview for audio artifacts. Embeds the generic {@link MJMediaPlayerComponent}
 * (`mj-media-player`) in a compact, thumbnail-sized configuration inside the conversation message
 * card. Click events are stopped from propagating so using the transport controls does NOT open
 * the full-size viewer.
 *
 * Compact gating: only play/pause + scrubber + time are shown. Transcript, waveform, speed,
 * skip, volume and fullscreen chrome are turned OFF so the player reads cleanly at preview size.
 */
@Component({
    standalone: false,
    selector: 'mj-audio-artifact-preview',
    template: `
        @if (errorMessage) {
            <div class="audio-preview audio-preview--error">
                <i class="fa-solid fa-music"></i>
                <span>{{ errorMessage }}</span>
            </div>
        } @else if (isLoading) {
            <mj-loading text="Loading audio..." size="small"></mj-loading>
        } @else if (audioUrl) {
            <mj-media-player
                class="audio-preview__player"
                [Tracks]="MediaTracks"
                [ShowTranscript]="false"
                [ShowTranscriptToggle]="false"
                [ShowWaveform]="false"
                [ShowSpeedControl]="false"
                [ShowSkipControls]="false"
                [ShowVolume]="false"
                [ShowFullscreen]="false"
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

            .audio-preview__player {
                display: block;
                width: 100%;
                max-width: 100%;
            }

            .audio-preview--error {
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
export class AudioArtifactPreviewComponent extends BaseArtifactPreviewComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    /** Resolved URL — data URI (inline) or pre-auth URL (file). Funneled through {@link setAudioUrl}. */
    public AudioUrl = '';

    /** @deprecated Use {@link AudioUrl}. */
    public get audioUrl() {
        return this.AudioUrl;
    }
    /** @deprecated Use {@link AudioUrl}. */
    public set audioUrl(value) {
        this.AudioUrl = value;
    }


    /** Non-empty hides the player and shows a compact error line. */
    public errorMessage = '';

    /**
     * Single-track input for the generic {@link MJMediaPlayerComponent}. Rebuilt in lockstep with
     * {@link audioUrl} via {@link setAudioUrl}; `[]` until a URL exists so the player shows its empty state.
     */
    public MediaTracks: MediaTrack[] = [];

    /** Set the resolved URL and recompute the single-element {@link MediaTracks} array in lockstep. */
    private setAudioUrl(url: string): void {
        this.AudioUrl = url;
        this.MediaTracks = url
            ? [
                  {
                      Id: this.artifactVersion?.ID ?? 'audio',
                      Kind: 'audio',
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
                this.setAudioUrl(url);
            } else {
                this.errorMessage = 'No audio content.';
            }
        } catch {
            this.errorMessage = 'Could not load audio.';
        }
        this.cdr.markForCheck();
    }

    public OnMediaError(): void {
        this.errorMessage = 'Audio could not be played.';
        this.setAudioUrl('');
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnMediaError}. */
    public onMediaError(): void {
        return this.OnMediaError();
    }

    /** Fired when the generic player reaches the end of the track. No-op affordance hook. */
    public OnMediaEnded(): void {
        // Playback finished — nothing to persist for an inline preview.
    }

    /** @deprecated Use {@link OnMediaEnded}. */
    public onMediaEnded(): void {
        return this.OnMediaEnded();
    }
}
