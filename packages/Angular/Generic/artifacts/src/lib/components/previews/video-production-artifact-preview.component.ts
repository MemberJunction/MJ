import { Component, OnInit } from '@angular/core';
import type { VideoGenerationSpec, VideoRenderedFormatOutput } from '@memberjunction/video-studio-core';
import { BaseArtifactPreviewComponent } from './base-artifact-preview.component';

/**
 * Compact card preview for `Video Production` artifacts.
 * When `Output.Videos` has at least one rendered format, renders a compact `<mj-storage-media-player>`
 * of the first rendered format; when no `Output` exists yet, renders the current production status line.
 */
@Component({
  selector: 'mj-video-production-artifact-preview',
  standalone: false,
  template: `
    <div class="vp-preview">
      @if (FirstVideoFileID) {
        <div class="vp-preview__player" (click)="$event.stopPropagation()">
          <mj-storage-media-player
            [FileID]="FirstVideoFileID"
            [PosterFileID]="Spec?.Output?.PosterFileID ?? null"
            [Provider]="ProviderToUse"
            [ShowTranscript]="false"
            [ShowTranscriptToggle]="false"
            [ShowWaveform]="false"
            [ShowSpeedControl]="false"
            [ShowSkipControls]="false"
            [ShowVolume]="false"
          ></mj-storage-media-player>
        </div>
      } @else if (Spec) {
        <div class="vp-preview__status">
          <i class="fa-solid fa-clapperboard vp-preview__status-icon" aria-hidden="true"></i>
          <span class="vp-preview__status-text">{{ Spec.Status }}</span>
        </div>
      } @else {
        <div class="vp-preview__empty">
          <i class="fa-solid fa-film vp-preview__status-icon" aria-hidden="true"></i>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .vp-preview {
        width: 100%;
        border-radius: var(--mj-radius-sm, 6px);
        overflow: hidden;
        background: var(--mj-bg-surface-sunken);
      }
      .vp-preview__player {
        width: 100%;
        max-height: 140px;
        overflow: hidden;
      }
      .vp-preview__status,
      .vp-preview__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 110px;
        padding: 12px;
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
      }
      .vp-preview__status-icon {
        font-size: 20px;
        color: var(--mj-text-muted);
      }
    `,
  ],
})
export class VideoProductionArtifactPreviewComponent
  extends BaseArtifactPreviewComponent
  implements OnInit
{
  public Spec: VideoGenerationSpec | null = null;
  public FirstVideoFileID: string | null = null;

  ngOnInit(): void {
    this.parseSpec();
    this.isLoading = false;
  }

  private parseSpec(): void {
    this.Spec = null;
    this.FirstVideoFileID = null;

    const raw = this.artifactVersion?.Content;
    if (!raw || typeof raw !== 'string') {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as VideoGenerationSpec;
      if (!parsed || typeof parsed !== 'object' || !parsed.Film || !parsed.Status) {
        return;
      }
      this.Spec = parsed;

      const videos = parsed.Output?.Videos;
      if (videos && typeof videos === 'object') {
        const entries = Object.values(videos).filter(
          (v): v is VideoRenderedFormatOutput => Boolean(v && v.FileID),
        );
        if (entries.length > 0 && entries[0].FileID) {
          this.FirstVideoFileID = entries[0].FileID;
        }
      }
    } catch {
      this.Spec = null;
      this.FirstVideoFileID = null;
    }
  }
}
