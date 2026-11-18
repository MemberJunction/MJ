import { Component, OnInit } from '@angular/core';
import {
  DescribeGeneratedAssets,
  type VideoGenerationSpec,
  type VideoRenderedFormatOutput,
} from '@memberjunction/video-studio-core';
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
      @if (HasGeneratedAssets) {
        <span class="vp-preview__generated-chip">AI-generated</span>
      }
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
        position: relative;
        width: 100%;
        border-radius: var(--mj-radius-sm);
        overflow: hidden;
        background: var(--mj-bg-surface-sunken);
      }
      .vp-preview__generated-chip {
        position: absolute;
        top: var(--mj-space-1-5);
        right: var(--mj-space-1-5);
        z-index: 2;
        padding: var(--mj-space-0-5) var(--mj-space-1-5);
        border-radius: var(--mj-radius-sm);
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-medium);
        background: var(--mj-status-warning-bg);
        color: var(--mj-status-warning-text);
        border: 1px solid var(--mj-status-warning-border);
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
        gap: var(--mj-space-2);
        height: 110px;
        padding: var(--mj-space-3);
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
      }
      .vp-preview__status-icon {
        font-size: var(--mj-text-xl);
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
  public HasGeneratedAssets = false;

  ngOnInit(): void {
    this.parseSpec();
    this.isLoading = false;
  }

  private parseSpec(): void {
    this.Spec = null;
    this.FirstVideoFileID = null;
    this.HasGeneratedAssets = false;

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
      this.HasGeneratedAssets = DescribeGeneratedAssets(parsed).SummaryLine !== null;

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
      this.HasGeneratedAssets = false;
    }
  }
}
