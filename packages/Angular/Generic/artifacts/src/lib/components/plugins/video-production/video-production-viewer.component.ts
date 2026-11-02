import { Component, Input, OnChanges, OnInit, SimpleChanges, Type } from '@angular/core';
import { DataSnapshot, LogError } from '@memberjunction/core';
import { BrandKitEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MediaTrack } from '@memberjunction/ng-media-player';
import {
  DescribeGeneratedAssets,
  FormatAsOfCardText,
  type VideoCompositionSource,
  type VideoFormat,
  type VideoGenerationSpec,
  type VideoRenderedFormatOutput,
} from '@memberjunction/video-studio-core';
import { IArtifactPreviewComponent } from '../../../interfaces/artifact-viewer-plugin.interface';
import {
  ArtifactViewerTab,
  BaseArtifactViewerPluginComponent,
} from '../../base-artifact-viewer.component';
import { VideoProductionArtifactPreviewComponent } from '../../previews/video-production-artifact-preview.component';
import { type VideoBeatStripItem } from './video-beat-strip.component';
import {
  BuildBriefMarkdown,
  BuildDataMarkdown,
  BuildStyleMarkdown,
} from './video-production-markdown';
import { VideoProductionReviewTabComponent } from './video-production-review-tab.component';
import { VideoProductionStoryboardTabComponent } from './video-production-storyboard-tab.component';
import {
  GetVideoStatusBadgeVariant,
  type VideoBadgeVariant,
} from './video-status-badge';
import { FormatVideoTime } from './video-time-format';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Artifact viewer plugin for the `Video Production` artifact type (`VideoGenerationSpec` JSON).
 */
@Component({
  selector: 'mj-video-production-viewer',
  standalone: false,
  templateUrl: './video-production-viewer.component.html',
  styleUrls: ['./video-production-viewer.component.css'],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'VideoProductionViewerPlugin')
export class VideoProductionViewerComponent
  extends BaseArtifactViewerPluginComponent
  implements OnInit, OnChanges
{
  public static readonly PreviewComponentType: Type<IArtifactPreviewComponent> =
    VideoProductionArtifactPreviewComponent;

  public static CanHandlePreview(artifactTypeName: string, _contentType?: string): boolean {
    return (artifactTypeName ?? '').trim().toLowerCase() === 'video production';
  }

  /**
   * Optional pre-resolved brand kit display name provided by a host surface.
   */
  @Input() BrandKitName: string | null = null;

  public Spec: VideoGenerationSpec | null = null;
  public AvailableFormats: VideoFormat[] = [];
  public SelectedFormat: VideoFormat = '16:9';
  public InlineTracks: MediaTrack[] = [];
  public BeatStripItems: VideoBeatStripItem[] = [];

  private cachedAsOfInput: string | undefined = undefined;
  private cachedAsOfText = '';

  public override get hasDisplayContent(): boolean {
    return true;
  }

  ngOnInit(): void {
    this.parseSpec();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['artifactVersion'] && !changes['artifactVersion'].firstChange) {
      this.parseSpec();
    }
  }

  public get Title(): string {
    const displayName = this.getDisplayName();
    if (displayName && displayName !== 'Untitled Artifact') {
      return displayName;
    }
    return this.Spec?.Film?.OneSentence || 'Video production';
  }

  public get SelectedVideo(): VideoRenderedFormatOutput | null {
    if (!this.Spec?.Output?.Videos) {
      return null;
    }
    return this.Spec.Output.Videos[this.SelectedFormat] ?? null;
  }

  public get HasRenderedOutput(): boolean {
    return this.AvailableFormats.length > 0 && this.SelectedVideo !== null;
  }

  public get DurationSeconds(): number {
    return this.SelectedVideo?.DurationSeconds ?? this.Spec?.Film?.DurationSeconds ?? 0;
  }

  public get HasDurationStat(): boolean {
    return Number.isFinite(this.DurationSeconds) && this.DurationSeconds > 0;
  }

  public get FormattedDuration(): string {
    return FormatVideoTime(this.DurationSeconds);
  }

  public get StatusText(): string | null {
    return this.cleanStatValue(this.Spec?.Status);
  }

  public get StatusBadgeVariant(): VideoBadgeVariant {
    return GetVideoStatusBadgeVariant(this.Spec?.Status);
  }

  public get DisplayFormats(): VideoFormat[] {
    if (this.AvailableFormats.length > 0) {
      return this.AvailableFormats;
    }
    if (Array.isArray(this.Spec?.Film?.Formats) && this.Spec.Film.Formats.length > 0) {
      return this.Spec.Film.Formats.filter((fmt): fmt is VideoFormat => Boolean(this.cleanStatValue(fmt)));
    }
    if (Array.isArray(this.Spec?.Deliverables?.Formats) && this.Spec.Deliverables.Formats.length > 0) {
      return this.Spec.Deliverables.Formats.filter((fmt): fmt is VideoFormat => Boolean(this.cleanStatValue(fmt)));
    }
    return [];
  }

  public get ArchetypeText(): string | null {
    return this.cleanStatValue(this.Spec?.Archetype?.Name);
  }

  public get BrandKitText(): string | null {
    const explicit = this.cleanStatValue(this.BrandKitName);
    if (explicit) {
      return explicit;
    }
    const brandKitId = this.cleanStatValue(this.Spec?.BrandKitID);
    if (!brandKitId) {
      return null;
    }
    try {
      const providerEngine = this.ProviderToUse
        ? (BrandKitEngine.GetProviderInstance<BrandKitEngine>(
            this.ProviderToUse,
            BrandKitEngine,
          ) as BrandKitEngine | undefined)
        : undefined;
      const kits = providerEngine?.BrandKits?.length
        ? providerEngine.BrandKits
        : (BrandKitEngine.Instance?.BrandKits ?? []);
      const match = kits.find(k => k?.ID && UUIDsEqual(k.ID, brandKitId));
      if (match?.Name) {
        return this.cleanStatValue(match.Name);
      }
    } catch {
      // Ignore when BrandKitEngine is not initialized in standalone unit tests
    }
    return UUID_PATTERN.test(brandKitId) ? null : brandKitId;
  }

  public get BeatsCountText(): string | null {
    const count = this.BeatStripItems.length;
    if (count === 0) {
      return null;
    }
    return `${count} ${count === 1 ? 'beat' : 'beats'}`;
  }

  public get HasDataBadge(): boolean {
    return Boolean(this.Spec?.DataBindings && this.Spec.DataBindings.length > 0);
  }

  public get NarrationSummaryText(): string | null {
    const narration = this.Spec?.Audio?.Narration;
    if (!narration) {
      return null;
    }
    if (narration.Enabled === false) {
      return 'Silent (no voiceover)';
    }
    const scriptCount = Array.isArray(narration.Script) ? narration.Script.length : 0;
    if (scriptCount > 0) {
      return `Voiceover (${scriptCount} ${scriptCount === 1 ? 'segment' : 'segments'})`;
    }
    if (this.cleanStatValue(narration.VoiceID)) {
      return 'Voiceover on';
    }
    return null;
  }

  public get CaptionsSummaryText(): string | null {
    const captions = this.cleanStatValue(this.Spec?.Audio?.Captions);
    if (captions === 'Burned') {
      return 'Burned captions';
    }
    if (captions === 'Sidecar') {
      return 'Sidecar captions';
    }
    return null;
  }

  public get SoundSummaryText(): string | null {
    const parts: string[] = [];
    if (this.NarrationSummaryText) {
      parts.push(this.NarrationSummaryText);
    }
    if (this.CaptionsSummaryText) {
      parts.push(this.CaptionsSummaryText);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  public get GeneratedSummaryLine(): string | null {
    return this.Spec ? this.cleanStatValue(DescribeGeneratedAssets(this.Spec).SummaryLine) : null;
  }

  public get QualityScoreText(): string | null {
    const scores = this.Spec?.Review?.Scores;
    if (
      !scores ||
      typeof scores.OverallScore !== 'number' ||
      !Number.isFinite(scores.OverallScore) ||
      typeof scores.MaxScore !== 'number' ||
      !Number.isFinite(scores.MaxScore) ||
      scores.MaxScore <= 0
    ) {
      return null;
    }
    return `${scores.OverallScore} / ${scores.MaxScore}`;
  }

  public get VersionAndUpdatedText(): string | null {
    const parts: string[] = [];
    const versionNumber = this.artifactVersion?.VersionNumber;
    if (typeof versionNumber === 'number' && Number.isFinite(versionNumber) && versionNumber > 0) {
      parts.push(`v${versionNumber}`);
    }
    const updatedDate = this.formatUpdatedDate(
      this.artifactVersion?.__mj_UpdatedAt ??
        this.artifactVersion?.__mj_CreatedAt ??
        this.Spec?.Output?.RenderMetadata?.RenderedAt,
    );
    if (updatedDate) {
      parts.push(updatedDate);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  public get InlineStorageWarningText(): string | null {
    const video = this.SelectedVideo;
    if (this.HasRenderedOutput && video && !video.FileID && video.InlineBase64) {
      return 'Stored inline: no file storage account was set up.';
    }
    return null;
  }

  public get DataAsOfText(): string {
    const asOf = this.Spec?.DataSnapshot?.AsOf;
    if (!asOf) {
      return '';
    }
    if (this.cachedAsOfInput === asOf) {
      return this.cachedAsOfText;
    }
    this.cachedAsOfInput = asOf;
    try {
      this.cachedAsOfText = FormatAsOfCardText(asOf);
    } catch (err) {
      LogError(
        `VideoProductionViewerComponent: invalid DataSnapshot.AsOf "${asOf}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.cachedAsOfText = '';
    }
    return this.cachedAsOfText;
  }

  public SelectFormat(format: VideoFormat): void {
    if (this.SelectedFormat !== format) {
      this.SelectedFormat = format;
      this.rebuildInlineTracks();
    }
  }

  public override GetAdditionalTabs(): ArtifactViewerTab[] {
    if (!this.Spec && this.artifactVersion?.Content) {
      this.parseSpec();
    }
    const spec = this.Spec;
    if (!spec) {
      return [];
    }

    const tabs: ArtifactViewerTab[] = [
      {
        label: 'Brief',
        icon: 'fa-solid fa-file-lines',
        contentType: 'markdown',
        content: () => BuildBriefMarkdown(spec),
      },
      {
        label: 'Storyboard',
        icon: 'fa-solid fa-film',
        contentType: 'component',
        component: VideoProductionStoryboardTabComponent,
        componentInputs: () => ({
          Spec: this.Spec,
          Provider: this.ProviderToUse,
        }),
      },
      {
        label: 'Style',
        icon: 'fa-solid fa-palette',
        contentType: 'markdown',
        content: () => BuildStyleMarkdown(spec),
      },
      {
        label: 'Data',
        icon: 'fa-solid fa-database',
        contentType: 'markdown',
        content: () => BuildDataMarkdown(spec),
      },
      {
        label: 'Review',
        icon: 'fa-solid fa-clipboard-check',
        contentType: 'component',
        component: VideoProductionReviewTabComponent,
        componentInputs: () => ({
          Spec: this.Spec,
          Provider: this.ProviderToUse,
        }),
      },
    ];

    const sourceMap = spec.Output?.Source;
    if (sourceMap && typeof sourceMap === 'object') {
      const entries = Object.entries(sourceMap).filter(
        (entry): entry is [VideoFormat, VideoCompositionSource] =>
          Boolean(entry[1] && typeof entry[1] === 'object' && entry[1].Files),
      );
      for (const [fmt, bundle] of entries) {
        tabs.push({
          label: `Source ${fmt}`,
          icon: 'fa-solid fa-code',
          contentType: 'code',
          language: 'html',
          content: () =>
            Object.entries(bundle.Files)
              .map(([filePath, fileContent]) => `<!-- ${filePath} -->\n${fileContent}`)
              .join('\n\n'),
        });
      }
    }

    return tabs;
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    if (!this.Spec && this.artifactVersion?.Content) {
      this.parseSpec();
    }
    if (!this.Spec) {
      return null;
    }
    const snap = new DataSnapshot();
    snap.title = this.Title;
    snap.interpretation = `Viewing Video Production (${this.Spec.Status}) in ${this.SelectedFormat} format.`;
    snap.custom = {
      selectedFormat: this.SelectedFormat,
      status: this.Spec.Status,
      availableFormats: this.AvailableFormats,
      oneSentence: this.Spec.Film.OneSentence,
    };
    return snap;
  }

  private cleanStatValue(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const lower = trimmed.toLowerCase();
    if (lower === 'none' || lower === 'null' || lower === 'undefined') {
      return null;
    }
    return trimmed;
  }

  private formatUpdatedDate(raw: Date | string | null | undefined): string | null {
    if (!raw) {
      return null;
    }
    if (raw instanceof Date) {
      if (Number.isNaN(raw.getTime()) || raw.getTime() <= 0) {
        return null;
      }
      return raw.toISOString().slice(0, 10);
    }
    const cleaned = this.cleanStatValue(raw);
    if (!cleaned) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleaned);
    if (!match) {
      return null;
    }
    const parsed = new Date(cleaned);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  private parseSpec(): void {
    this.Spec = null;
    this.AvailableFormats = [];
    this.InlineTracks = [];
    this.BeatStripItems = [];
    this.cachedAsOfInput = undefined;
    this.cachedAsOfText = '';

    if (!this.artifactVersion?.Content) {
      return;
    }

    const parsed = this.parseJsonContent<VideoGenerationSpec>();
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !parsed.Film ||
      typeof parsed.Film !== 'object' ||
      !parsed.Status
    ) {
      return;
    }

    this.Spec = parsed;

    const beats = Array.isArray(parsed.Beats) ? parsed.Beats : [];
    this.BeatStripItems = beats
      .filter(b => b && typeof b === 'object' && this.cleanStatValue(b.Label))
      .map(beat => ({
        Key: beat.Key,
        Label: beat.Label,
        Seconds: Math.max(1, (beat.EndSeconds ?? 0) - (beat.StartSeconds ?? 0)),
        Detail: beat.Purpose,
      }));

    const videos = parsed.Output?.Videos;
    if (videos && typeof videos === 'object') {
      const formats = Object.keys(videos).filter(
        fmt => Boolean(videos[fmt as VideoFormat]),
      ) as VideoFormat[];
      this.AvailableFormats = formats;
    }

    if (this.AvailableFormats.length > 0) {
      if (!this.AvailableFormats.includes(this.SelectedFormat)) {
        this.SelectedFormat = this.AvailableFormats[0];
      }
    } else if (Array.isArray(parsed.Film.Formats) && parsed.Film.Formats.length > 0) {
      this.SelectedFormat = parsed.Film.Formats[0];
    } else {
      this.SelectedFormat = '16:9';
    }

    this.rebuildInlineTracks();
  }

  private rebuildInlineTracks(): void {
    const video = this.SelectedVideo;
    if (video && !video.FileID && video.InlineBase64) {
      const mime = video.MimeType || 'video/mp4';
      this.InlineTracks = [
        {
          Id: `inline-${this.SelectedFormat}`,
          Kind: 'video',
          Url: `data:${mime};base64,${video.InlineBase64}`,
          MimeType: mime,
        },
      ];
    } else {
      this.InlineTracks = [];
    }
  }
}
