import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { BaseArtifactPreviewComponent } from './base-artifact-preview.component';

/**
 * Inline preview for audio artifacts. Renders an `<audio controls>` mini player inside the
 * conversation message card. Click events are stopped from propagating so using the transport
 * controls does NOT open the full-size viewer.
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
        } @else if (audioUrl) {
            <audio
                class="audio-preview__audio"
                controls
                preload="metadata"
                [src]="audioUrl"
                (click)="$event.stopPropagation()"
                (error)="onMediaError()"
            ></audio>
        }
    `,
    styles: [
        `
            :host {
                display: block;
            }

            .audio-preview__audio {
                display: block;
                width: 100%;
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

    /** Resolved URL bound to `<audio src>` — data URI (inline) or pre-auth URL (file). */
    public audioUrl = '';

    /** Non-empty hides the player and shows a compact error line. */
    public errorMessage = '';

    async ngOnInit(): Promise<void> {
        try {
            const url = await this.resolveContentUrl();
            if (url) {
                this.audioUrl = url;
            } else {
                this.errorMessage = 'No audio content.';
            }
        } catch {
            this.errorMessage = 'Could not load audio.';
        }
        this.cdr.markForCheck();
    }

    public onMediaError(): void {
        this.errorMessage = 'Audio could not be played.';
        this.audioUrl = '';
        this.cdr.markForCheck();
    }
}
