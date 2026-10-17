import { ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MintMediaAccessUrl } from '@memberjunction/ng-media-player';
import {
  DescribeGeneratedAssets,
  type VideoBeat,
  type VideoFormat,
  type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

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
  template: `
    <div class="vp-storyboard-tab">
      <section class="vp-storyboard-section">
        <h3 class="vp-section-title">Storyboard Beats</h3>
        @if (BeatRows.length > 0) {
          <div class="vp-table-wrapper">
            <table class="vp-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Label</th>
                  <th>Purpose</th>
                  <th>On-Screen Text</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                @for (row of BeatRows; track row.Beat.Key) {
                  <tr class="vp-storyboard-beat-row">
                    <td class="vp-cell-mono">{{ row.TimeRange }}</td>
                    <td class="vp-cell-strong">
                      {{ row.Beat.Label }}
                      @if (row.UsesGeneratedAsset) {
                        <span class="vp-generated-chip">AI-generated</span>
                      }
                    </td>
                    <td>{{ row.Beat.Purpose }}</td>
                    <td>{{ row.OnScreenTextJoined }}</td>
                    <td>{{ row.NarrationText }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <mj-empty-state
            Icon="fa-solid fa-film"
            Title="No Storyboard Beats"
            Message="No storyboard beats have been defined for this production yet."
          ></mj-empty-state>
        }
      </section>

      @if (ContactSheets.length > 0) {
        <section class="vp-storyboard-section">
          <h3 class="vp-section-title">Contact Sheets</h3>
          <div class="vp-contact-sheets-grid">
            @for (sheet of ContactSheets; track sheet.FileID) {
              <div class="vp-contact-sheet-card">
                <div class="vp-contact-sheet-header">
                  <span class="vp-format-pill">{{ sheet.Format }}</span>
                </div>
                @if (sheet.Url) {
                  <img
                    class="vp-contact-sheet-img"
                    [src]="sheet.Url"
                    [alt]="'Contact sheet (' + sheet.Format + ')'"
                  />
                } @else if (sheet.Failed) {
                  <div class="vp-contact-sheet-placeholder">Contact sheet unavailable.</div>
                } @else {
                  <div class="vp-contact-sheet-placeholder">
                    <mj-loading size="small"></mj-loading>
                  </div>
                }
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .vp-storyboard-tab {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 16px;
        color: var(--mj-text-primary);
      }

      .vp-storyboard-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .vp-section-title {
        margin: 0;
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
      }

      .vp-table-wrapper {
        overflow-x: auto;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface);
      }

      .vp-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--mj-text-sm);
      }

      .vp-table th,
      .vp-table td {
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid var(--mj-border-subtle);
        vertical-align: top;
      }

      .vp-table th {
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        font-weight: var(--mj-font-semibold);
      }

      .vp-table tbody tr:last-child td {
        border-bottom: none;
      }

      .vp-cell-mono {
        font-family: var(--mj-font-family-mono);
        white-space: nowrap;
        color: var(--mj-text-secondary);
      }

      .vp-cell-strong {
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-primary);
      }

      .vp-generated-chip {
        display: inline-block;
        margin-left: 6px;
        padding: 2px 6px;
        border-radius: var(--mj-radius-sm);
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-medium);
        background: var(--mj-status-warning-bg);
        color: var(--mj-status-warning-text);
        border: 1px solid var(--mj-status-warning-border);
      }

      .vp-contact-sheets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }

      .vp-contact-sheet-card {
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface-card);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .vp-contact-sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .vp-format-pill {
        display: inline-block;
        padding: 2px 8px;
        border-radius: var(--mj-radius-sm);
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-medium);
      }

      .vp-contact-sheet-img {
        width: 100%;
        height: auto;
        border-radius: var(--mj-radius-sm);
        display: block;
      }

      .vp-contact-sheet-placeholder {
        padding: 24px;
        text-align: center;
        color: var(--mj-text-muted);
        font-size: var(--mj-text-sm);
      }
    `,
  ],
})
export class VideoProductionStoryboardTabComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private _spec: VideoGenerationSpec | null = null;
  private _initialized = false;
  private _resolveToken = 0;

  public BeatRows: StoryboardBeatRow[] = [];
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
        TimeRange: `${beat.StartSeconds}s – ${beat.EndSeconds}s`,
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
          if (typeof fileId === 'string' && fileId.length > 0) {
            items.push({ Format: format, FileID: fileId, Url: null, Failed: false });
          }
        }
      } else if (typeof rawValue === 'string' && (rawValue as string).length > 0) {
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
