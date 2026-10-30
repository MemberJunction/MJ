import { ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';
import { LogError, RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  DescribeGeneratedAssets,
  type CriticRound,
  type GateRecord,
  type GeneratedAssetDisclosureItem,
  type RubricCriterionScore,
  type VideoGenerationSpec,
  type VideoReviewRecord,
} from '@memberjunction/video-studio-core';
import {
  FormatVideoTime,
  GetVideoStatusBadgeVariant,
  type VideoBadgeVariant,
} from './video-time-format';

@Component({
  selector: 'mj-video-production-review-tab',
  standalone: false,
  templateUrl: './video-production-review-tab.component.html',
  styleUrls: ['./video-production-review-tab.component.css'],
})
export class VideoProductionReviewTabComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private _spec: VideoGenerationSpec | null = null;
  private _initialized = false;
  private _resolveToken = 0;
  private _modelRows: Array<{ ID: string; Name: string }> = [];

  public GeneratedAssets: GeneratedAssetDisclosureItem[] = [];

  @Input()
  set Spec(value: VideoGenerationSpec | null) {
    this._spec = value;
    this.GeneratedAssets = DescribeGeneratedAssets(value ?? {}).Items;
    if (this._initialized) {
      void this.resolveModelNames();
    }
  }
  get Spec(): VideoGenerationSpec | null {
    return this._spec;
  }

  async ngOnInit(): Promise<void> {
    this._initialized = true;
    this.GeneratedAssets = DescribeGeneratedAssets(this._spec ?? {}).Items;
    await this.resolveModelNames();
  }

  public get Review(): VideoReviewRecord | null {
    return this._spec?.Review ?? null;
  }

  public get Gates(): GateRecord[] {
    return this._spec?.Review?.Gates ?? [];
  }

  public get Rounds(): CriticRound[] {
    return this._spec?.Review?.Rounds ?? [];
  }

  public get CriteriaScores(): RubricCriterionScore[] {
    return this._spec?.Review?.Scores?.Criteria ?? [];
  }

  public BadgeVariant(statusOrSeverity: string | null | undefined): VideoBadgeVariant {
    return GetVideoStatusBadgeVariant(statusOrSeverity);
  }

  public FormatSeconds(seconds: number | undefined): string {
    return seconds !== undefined ? FormatVideoTime(seconds) : '—';
  }

  public FormatBeats(item: GeneratedAssetDisclosureItem): string {
    return item.Beats.length > 0 ? item.Beats.map(b => b.Key).join(', ') : '—';
  }

  public FormatDuration(item: GeneratedAssetDisclosureItem): string {
    return item.DurationSeconds !== undefined ? FormatVideoTime(item.DurationSeconds) : '—';
  }

  public FormatCost(item: GeneratedAssetDisclosureItem): string {
    return item.Cost !== undefined ? `$${item.Cost.toFixed(2)}` : '—';
  }

  public GetModelLabel(modelId: string): string {
    if (!modelId) {
      return '—';
    }
    const match = this._modelRows.find(r => UUIDsEqual(r.ID, modelId));
    return match?.Name || modelId;
  }

  private async resolveModelNames(): Promise<void> {
    const token = ++this._resolveToken;
    const modelIds = Array.from(
      new Set(
        this.GeneratedAssets.map(item => item.ModelID?.trim()).filter(
          (id): id is string => Boolean(id && id.length > 0),
        ),
      ),
    );
    if (modelIds.length === 0) {
      this._modelRows = [];
      this.cdr.markForCheck();
      return;
    }

    const quotedIds = modelIds.map(id => `'${EscapeSQLString(id)}'`).join(', ');
    try {
      const rv = new RunView(this.RunViewToUse);
      const result = await rv.RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: AI Models',
        ExtraFilter: `ID IN (${quotedIds})`,
        Fields: ['ID', 'Name'],
        ResultType: 'simple',
      });
      if (token !== this._resolveToken) {
        return;
      }
      if (result.Success && Array.isArray(result.Results)) {
        this._modelRows = result.Results.filter(r => Boolean(r?.ID && r?.Name));
      } else {
        this._modelRows = [];
      }
    } catch (err) {
      LogError(err);
      if (token !== this._resolveToken) {
        return;
      }
      this._modelRows = [];
    }
    this.cdr.markForCheck();
  }
}
