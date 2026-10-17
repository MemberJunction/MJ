import { AfterViewChecked, Component, ElementRef, OnInit, QueryList, Type, ViewChildren } from '@angular/core';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MediaTrack } from '@memberjunction/ng-media-player';
import type {
  VideoCompositionSource,
  VideoFormat,
  VideoGenerationSpec,
  VideoRenderedFormatOutput,
} from '@memberjunction/video-studio-core';
import { IArtifactPreviewComponent } from '../../../interfaces/artifact-viewer-plugin.interface';
import {
  ArtifactViewerTab,
  BaseArtifactViewerPluginComponent,
} from '../../base-artifact-viewer.component';
import { VideoProductionArtifactPreviewComponent } from '../../previews/video-production-artifact-preview.component';
import {
  BuildBriefMarkdown,
  BuildDataMarkdown,
  BuildStyleMarkdown,
  FormatAsOfCardText,
} from './video-production-markdown';
import { VideoProductionReviewTabComponent } from './video-production-review-tab.component';
import { VideoProductionStoryboardTabComponent } from './video-production-storyboard-tab.component';

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
  implements OnInit, AfterViewChecked
{
  public static readonly PreviewComponentType: Type<IArtifactPreviewComponent> =
    VideoProductionArtifactPreviewComponent;

  public static CanHandlePreview(artifactTypeName: string, _contentType?: string): boolean {
    return (artifactTypeName ?? '').trim().toLowerCase() === 'video production';
  }

  public Spec: VideoGenerationSpec | null = null;
  public AvailableFormats: VideoFormat[] = [];
  public SelectedFormat: VideoFormat = '16:9';
  public InlineTracks: MediaTrack[] = [];

  @ViewChildren('formatBtn')
  private formatButtonRefs?: QueryList<ElementRef<HTMLButtonElement>>;

  public override get hasDisplayContent(): boolean {
    return true;
  }

  ngOnInit(): void {
    this.parseSpec();
  }

  ngAfterViewChecked(): void {
    // MJButtonDirective's @HostBinding('attr.aria-pressed') returns null when Toggleable is false,
    // which runs after template attribute bindings and removes [attr.aria-pressed]. Re-apply it here.
    this.formatButtonRefs?.forEach((ref) => {
      const el = ref.nativeElement;
      const fmt = el.getAttribute('data-format');
      if (fmt) {
        el.setAttribute('aria-pressed', String(this.SelectedFormat === fmt));
      }
    });
  }

  public get Title(): string {
    const displayName = this.getDisplayName();
    if (displayName && displayName !== 'Untitled Artifact') {
      return displayName;
    }
    return this.Spec?.Film?.OneSentence || 'Video Production';
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

  public get HasDataBadge(): boolean {
    return Boolean(
      this.Spec?.DataBindings &&
        this.Spec.DataBindings.length > 0 &&
        this.Spec?.DataSnapshot?.AsOf,
    );
  }

  public get DataAsOfText(): string {
    const asOf = this.Spec?.DataSnapshot?.AsOf;
    if (!asOf) {
      return '';
    }
    try {
      return FormatAsOfCardText(asOf);
    } catch {
      return `Data as of ${asOf}`;
    }
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

  private parseSpec(): void {
    this.Spec = null;
    this.AvailableFormats = [];
    this.InlineTracks = [];

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
