import { ChangeDetectorRef, Component, ElementRef, Input, OnInit, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MintMediaAccessUrl } from '@memberjunction/ng-media-player';
import {
  DescribeGeneratedAssets,
  type VideoBeat,
  type VideoFormat,
  type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import { type VideoBeatStripItem } from './video-beat-strip.component';
import { FormatVideoTimeRange } from './video-time-format';

export interface StoryboardBeatRow {
  Beat: VideoBeat;
  TimeRange: string;
  OnScreenTextJoined: string;
  NarrationText: string;
  UsesGeneratedAsset: boolean;
}

export interface StoryboardContactSheetItem {
  Format: VideoFormat;
  FileID: string;
  Url: string | null;
  Failed: boolean;
}

@Component({
  selector: 'mj-video-production-storyboard-tab',
  standalone: false,
  templateUrl: './video-production-storyboard-tab.component.html',
  styleUrls: ['./video-production-storyboard-tab.component.css'],
})
export class VideoProductionStoryboardTabComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private hostRef = inject(ElementRef<HTMLElement>);
  private _spec: VideoGenerationSpec | null = null;
  private _initialized = false;
  private _resolveToken = 0;

  public BeatRows: StoryboardBeatRow[] = [];
  public BeatStripItems: VideoBeatStripItem[] = [];
  public ActiveBeatKey: string | null = null;
  public ContactSheets: StoryboardContactSheetItem[] = [];

  @Input()
  set Spec(value: VideoGenerationSpec | null) {
    this._spec = value;
    this.rebuildRows();
    if (this._initialized) {
      void this.resolveContactSheets();
    }
  }
  get Spec(): VideoGenerationSpec | null {
    return this._spec;
  }

  async ngOnInit(): Promise<void> {
    this._initialized = true;
    this.rebuildRows();
    await this.resolveContactSheets();
  }

  public OnBeatPicked(beatKey: string): void {
    this.ActiveBeatKey = beatKey;
    this.cdr.markForCheck();
    const hostEl = this.hostRef?.nativeElement;
    if (!hostEl) {
      return;
    }
    const rows = Array.from(hostEl.querySelectorAll('.vp-storyboard-beat-row')) as HTMLElement[];
    const matchingRow = rows.find(row => row.getAttribute('data-beat-key') === beatKey);
    if (matchingRow && typeof matchingRow.scrollIntoView === 'function') {
      matchingRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  private rebuildRows(): void {
    const beats = this._spec?.Beats ?? [];
    const script = this._spec?.Audio?.Narration?.Script ?? [];
    const narrationByKey = new Map<string, string>();
    for (const line of script) {
      if (line.Key) {
        narrationByKey.set(line.Key, line.Text);
      }
      if (line.BeatKey) {
        narrationByKey.set(line.BeatKey, line.Text);
      }
    }

    const generatedKeys = new Set(DescribeGeneratedAssets(this._spec ?? {}).Items.map(i => i.Key));

    this.BeatStripItems = beats.map(beat => ({
      Key: beat.Key,
      Label: beat.Label,
      Seconds: Math.max(1, (beat.EndSeconds ?? 0) - (beat.StartSeconds ?? 0)),
      Detail: beat.Purpose,
    }));

    if (this.ActiveBeatKey && !beats.some(b => b.Key === this.ActiveBeatKey)) {
      this.ActiveBeatKey = null;
    }

    this.BeatRows = beats.map(beat => {
      const lookupKey = beat.NarrationKey || beat.Key;
      const narration = narrationByKey.get(lookupKey) ?? narrationByKey.get(beat.Key) ?? '—';
      const onScreen =
        Array.isArray(beat.OnScreenText) && beat.OnScreenText.length > 0
          ? beat.OnScreenText.join(' · ')
          : '—';
      const usesGeneratedAsset =
        Array.isArray(beat.AssetRefs) && beat.AssetRefs.some(key => generatedKeys.has(key));
      return {
        Beat: beat,
        TimeRange: FormatVideoTimeRange(beat.StartSeconds, beat.EndSeconds),
        OnScreenTextJoined: onScreen,
        NarrationText: narration,
        UsesGeneratedAsset: usesGeneratedAsset,
      };
    });
  }

  private async resolveContactSheets(): Promise<void> {
    const token = ++this._resolveToken;
    const sheetMap = this._spec?.Output?.ContactSheetFileIDs;
    if (!sheetMap || typeof sheetMap !== 'object') {
      this.ContactSheets = [];
      this.cdr.markForCheck();
      return;
    }

    const items: StoryboardContactSheetItem[] = [];
    for (const [fmt, rawValue] of Object.entries(sheetMap)) {
      const format = fmt as VideoFormat;
      if (Array.isArray(rawValue)) {
        for (const fileId of rawValue) {
          if (typeof fileId === 'string' && fileId.trim().length > 0 && !fileId.trim().startsWith('inline:')) {
            items.push({ Format: format, FileID: fileId, Url: null, Failed: false });
          }
        }
      } else if (
        typeof rawValue === 'string' &&
        (rawValue as string).trim().length > 0 &&
        !(rawValue as string).trim().startsWith('inline:')
      ) {
        items.push({ Format: format, FileID: rawValue as string, Url: null, Failed: false });
      }
    }

    if (items.length === 0) {
      this.ContactSheets = [];
      this.cdr.markForCheck();
      return;
    }

    this.ContactSheets = items;
    this.cdr.markForCheck();

    const results = await Promise.all(
      items.map(item => MintMediaAccessUrl(this.ProviderToUse, item.FileID)),
    );
    if (token !== this._resolveToken) {
      return;
    }

    this.ContactSheets = items.map((item, idx) => {
      const ok = Boolean(results[idx]?.Success && results[idx]?.Url);
      return {
        ...item,
        Url: ok ? results[idx]!.Url! : null,
        Failed: !ok,
      };
    });
    this.cdr.markForCheck();
  }
}
