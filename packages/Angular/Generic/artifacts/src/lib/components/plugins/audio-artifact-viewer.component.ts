import { ChangeDetectorRef, Component, inject, OnInit, Type } from '@angular/core';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { IArtifactPreviewComponent } from '../../interfaces/artifact-viewer-plugin.interface';
import { AudioArtifactPreviewComponent } from '../previews/audio-artifact-preview.component';
import { MJMediaPlayerComponent, MediaTrack } from '@memberjunction/ng-media-player';

/**
 * Minimal full-size viewer plugin for audio artifacts. Renders an `<audio controls>` player.
 * Supports both storage modes (see {@link VideoArtifactViewerComponent} for the same contract).
 *
 * Deliberately minimal — the inline experience lives in {@link AudioArtifactPreviewComponent}
 * (exposed via {@link previewComponentType}); this satisfies the required `componentType`.
 */
@Component({
    standalone: false,
    selector: 'mj-audio-artifact-viewer',
    template: `
        <div class="audio-viewer" [ngClass]="cssClass">
            @if (errorMessage) {
                <div class="audio-viewer__state audio-viewer__state--error">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    <span>{{ errorMessage }}</span>
                </div>
            } @else if (audioUrl) {
                <mj-media-player class="audio-viewer__player" [Tracks]="MediaTracks" (Ended)="onMediaEnded()"></mj-media-player>
            } @else {
                <div class="audio-viewer__state">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>Loading audio…</span>
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

            .audio-viewer {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                padding: 24px;
                background: var(--mj-bg-surface-sunken);
            }

            .audio-viewer__player {
                display: block;
                width: 100%;
                max-width: 640px;
            }

            .audio-viewer__state {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                color: var(--mj-text-muted);
                font-size: 14px;
            }

            .audio-viewer__state--error {
                color: var(--mj-status-error-text);
            }
        `,
    ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'AudioArtifactViewerPlugin')
export class AudioArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
    private readonly fileService = inject(ArtifactFileService);
    private readonly cdr = inject(ChangeDetectorRef);

    public audioUrl = '';
    public errorMessage = '';

    /**
     * Single-track input for the generic {@link MJMediaPlayerComponent}. Rebuilt whenever
     * {@link audioUrl} is (re)resolved via {@link setAudioUrl}; empty until a URL exists so the
     * player shows its own empty state.
     */
    public MediaTracks: MediaTrack[] = [];

    /** Set the resolved URL and recompute the single-element {@link MediaTracks} array in lockstep. */
    private setAudioUrl(url: string): void {
        this.audioUrl = url;
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

    /**
     * Inline-preview component for audio artifacts ({@link IArtifactViewerPluginPreviewStatics}).
     * STATIC so the resolver reads it off the constructor without instantiating this DI-using component.
     */
    public static readonly PreviewComponentType: Type<IArtifactPreviewComponent> = AudioArtifactPreviewComponent;

    /** Matches audio artifacts by type name or `audio/*` MIME. STATIC — drives preview resolution. */
    public static CanHandlePreview(artifactTypeName: string, contentType?: string): boolean {
        const mime = (contentType ?? '').toLowerCase();
        if (mime.startsWith('audio/')) {
            return true;
        }
        return (artifactTypeName ?? '').trim().toLowerCase() === 'audio';
    }

    public override get hasDisplayContent(): boolean {
        return true;
    }

    async ngOnInit(): Promise<void> {
        try {
            if (this.artifactVersion?.ContentMode === 'File' && this.artifactVersion.ID) {
                this.setAudioUrl(await this.fileService.getDownloadUrl(this.artifactVersion.ID));
            } else {
                const content = this.artifactVersion?.Content;
                if (content) {
                    this.setAudioUrl(content);
                } else {
                    this.errorMessage = 'This artifact has no audio content.';
                }
            }
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            this.errorMessage = `Could not load audio: ${detail}`;
        }
        this.cdr.markForCheck();
    }

    public onMediaError(): void {
        this.errorMessage = 'The audio could not be played. It may be corrupt or in an unsupported format.';
        this.setAudioUrl('');
        this.cdr.markForCheck();
    }

    /** Fired when the generic player reaches the end of the track. No-op affordance hook. */
    public onMediaEnded(): void {
        // Playback finished — nothing to persist for a one-shot artifact viewer.
    }

    public override GetCurrentStateSnapshot(): DataSnapshot | null {
        if (!this.artifactVersion) {
            return null;
        }
        const snap = new DataSnapshot();
        snap.title = this.getDisplayTitle() ?? undefined;
        snap.interpretation = `Audio (${this.artifactVersion.MimeType ?? 'audio'}).`;
        snap.custom = {
            mimeType: this.artifactVersion.MimeType ?? undefined,
            fileName: this.artifactVersion.FileName ?? undefined,
            contentMode: this.artifactVersion.ContentMode,
        };
        return snap;
    }
}
