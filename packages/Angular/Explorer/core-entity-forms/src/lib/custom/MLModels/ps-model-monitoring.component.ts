import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogError, RunView, type RunViewResult } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import {
  PredictiveStudioRunModelMonitoringOperation,
  type MJMLModelEntity,
  type MJMLModelPublishRecordEntity,
  type MJMLMonitoringResultEntity,
  type MJScheduledJobRunEntity,
} from '@memberjunction/core-entities';
import { RegistryCheckDetails, type RegistryFindingLetter, type RegistryFindingOutcome } from '@memberjunction/predictive-studio-core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

/** One registry check finding about the model and the action the job took (§5.7 R7), newest run first. */
export interface RegistryFindingVM {
  /** The Registry Check job run that recorded it. */
  readonly RunID: string;
  /** When that run started. */
  readonly At: Date;
  /** The finding's letter: (a)–(i), (g) for the pre-change model migration. */
  readonly Finding: RegistryFindingLetter;
  /** What the job found. */
  readonly Detail: string;
  /** What the job did about it. */
  readonly Action: string;
  /** `remediated`, `recorded` or `retry`. */
  readonly Outcome: RegistryFindingOutcome;
}

/** The registry check job run columns the tab reads. */
type RegistryRunRow = Pick<MJScheduledJobRunEntity, 'ID' | 'StartedAt' | 'Details'>;

/** The Registry Check job (M6.4's metadata) whose runs' `Details` carry the findings. */
const REGISTRY_CHECK_JOB = 'Predictive Studio Registry Check';
/** How many of the job's newest runs that mention the model are read. */
const REGISTRY_RUNS_READ = 20;

/** A retrain trigger that fired in a period, with its reason. */
export interface MonitoringTriggerVM {
  /** The trigger's kind, as the monitoring row stores it. */
  readonly Kind: MJMLMonitoringResultEntity['TriggersFiredObject'][number]['kind'];
  /** Why it fired. */
  readonly Reason: string | null;
}

/** The challenger a fired trigger started: published automatically or withheld, with its paired comparison. */
export interface MonitoringChallengerVM {
  /** What became of the challenger, as the monitoring row stores it. */
  readonly Outcome: NonNullable<MJMLMonitoringResultEntity['ChallengerResultObject']>['outcome'];
  /** Why, when the gate withheld it. */
  readonly Reason: string | null;
  /** The live mirror's comparison in words, or null. */
  readonly Comparison: string | null;
  /** The publish record of an automatic publish, or null. */
  readonly PublishRecordID: string | null;
}

/** The period's rollback check (previous vs current model on the same rows) and any rollback it caused. */
export interface MonitoringRollbackVM {
  /** The check's result, as the monitoring row stores it. */
  readonly Kind: NonNullable<MJMLMonitoringResultEntity['RollbackCheckObject']>['kind'];
  /** Why no comparison ran, or null. */
  readonly Reason: string | null;
  /** The paired loss difference in words, or null. */
  readonly Comparison: string | null;
  /** The rollback's publish record, or null. */
  readonly PublishRecordID: string | null;
}

/** One monitored period as the tab shows it, read from its `MJ: ML Monitoring Results` row. */
export interface MonitoringPeriodVM {
  readonly ID: string;
  readonly Period: Date;
  readonly State: MJMLMonitoringResultEntity['State'];
  readonly JoinedRows: number;
  readonly PrimaryValue: number | null;
  readonly PrimaryLower: number | null;
  readonly PrimaryUpper: number | null;
  readonly CalibrationSlope: number | null;
  readonly CalibrationIntercept: number | null;
  readonly DriftAlarms: readonly string[];
  readonly Triggers: readonly MonitoringTriggerVM[];
  readonly Challenger: MonitoringChallengerVM | null;
  readonly Rollback: MonitoringRollbackVM | null;
  readonly ErrorMessage: string | null;
}

/** One plotted period: its point and its interval whisker, in chart coordinates. */
interface ChartPointVM {
  readonly ID: string;
  readonly X: number;
  readonly Y: number;
  readonly YLower: number;
  readonly YUpper: number;
  readonly Fired: boolean;
  readonly Title: string;
}

/** The chart: the plotted points and the reference band (the published holdout interval). */
interface ChartVM {
  readonly Points: readonly ChartPointVM[];
  readonly Band: { readonly Y: number; readonly Height: number } | null;
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 160;
const CHART_PAD = 16;

/**
 * **PSModelMonitoringComponent** (L2) — a Published model's monitoring, one row of `MJ: ML Monitoring Results` per
 * period: the primary score with its interval against the reference band (the interval of the holdout score the model
 * was published on), calibration slope and intercept, drift alarms per input, the retrain triggers that fired with their
 * reasons, the challenger a trigger started (published automatically, with a link to its publish record, or withheld
 * with the reason) and its paired comparison, and the rollback check with any rollback it caused. "Check now" runs
 * `PredictiveStudio.RunModelMonitoring` as the user. Never routes: a record link is {@link OpenPublishRecord}.
 */
@Component({
  standalone: true,
  selector: 'ps-model-monitoring',
  imports: [CommonModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ps-mon" data-testid="ps-model-monitoring">
      <div class="ps-mon-head">
        <span class="ps-mon-sub">One row per monitored period; the band is the holdout interval the model was published on.</span>
        <button mjButton variant="secondary" size="sm" data-testid="ps-monitoring-check-now" [disabled]="Checking || !Model" (click)="CheckNow()">
          <i [class]="Checking ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-heart-pulse'"></i> Check now
        </button>
      </div>
      @if (CheckMessage) {
        <div class="ps-mon-error" data-testid="ps-monitoring-check-error">{{ CheckMessage }}</div>
      }
      @if (Loading) {
        <div class="ps-mon-note"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading monitoring results…</div>
      } @else if (ErrorMessage) {
        <div class="ps-mon-error" data-testid="ps-monitoring-error">{{ ErrorMessage }}</div>
      } @else if (Periods.length === 0) {
        <div class="ps-mon-note" data-testid="ps-monitoring-empty">No period of this model has been monitored yet.</div>
      } @else {
        <svg class="ps-mon-chart" [attr.viewBox]="'0 0 ' + ChartWidth + ' ' + ChartHeight" preserveAspectRatio="none" role="img" aria-label="Primary score per period">
          @if (Chart.Band; as band) {
            <rect class="ps-mon-band" data-testid="ps-monitoring-band" x="0" [attr.y]="band.Y" [attr.width]="ChartWidth" [attr.height]="band.Height"></rect>
          }
          @for (p of Chart.Points; track p.ID) {
            <line class="ps-mon-whisker" [attr.x1]="p.X" [attr.x2]="p.X" [attr.y1]="p.YLower" [attr.y2]="p.YUpper"></line>
            <circle data-testid="ps-monitoring-point" [class]="p.Fired ? 'ps-mon-point fired' : 'ps-mon-point'" [attr.cx]="p.X" [attr.cy]="p.Y" r="4">
              <title>{{ p.Title }}</title>
            </circle>
          }
        </svg>

        @for (period of Periods; track period.ID) {
          <div class="ps-mon-row" data-testid="ps-monitoring-period">
            <div class="ps-mon-line">
              <strong>{{ period.Period | date: 'mediumDate' : 'UTC' }}</strong>
              <span class="ps-mon-state">{{ period.State }}</span>
              @if (period.PrimaryValue !== null) {
                <span class="ps-mon-mono">{{ period.PrimaryValue | number: '1.3-3' }} [{{ period.PrimaryLower | number: '1.3-3' }}, {{ period.PrimaryUpper | number: '1.3-3' }}]</span>
              }
              <span class="ps-mon-muted">{{ period.JoinedRows }} joined rows</span>
              @if (period.CalibrationSlope !== null) {
                <span class="ps-mon-muted">calibration slope {{ period.CalibrationSlope | number: '1.2-2' }}, intercept {{ period.CalibrationIntercept | number: '1.2-2' }}</span>
              }
            </div>
            @if (period.DriftAlarms.length > 0) {
              <div class="ps-mon-drift" data-testid="ps-monitoring-drift">Drift alarm on {{ period.DriftAlarms.join(', ') }}</div>
            }
            @for (t of period.Triggers; track $index) {
              <div class="ps-mon-trigger" data-testid="ps-monitoring-trigger"><i class="fa-solid fa-bolt"></i> {{ t.Kind }}{{ t.Reason ? ': ' + t.Reason : '' }}</div>
            }
            @if (period.Challenger; as ch) {
              <div class="ps-mon-detail" data-testid="ps-monitoring-challenger">
                Challenger {{ ch.Outcome }}{{ ch.Reason ? ' — ' + ch.Reason : '' }}{{ ch.Comparison ? ' · ' + ch.Comparison : '' }}
                @if (ch.PublishRecordID; as id) {
                  <button mjButton variant="flat" size="sm" type="button" data-testid="ps-monitoring-challenger-record" [attr.data-record-id]="id" (click)="OpenPublishRecord.emit(id)">record</button>
                }
              </div>
            }
            @if (period.Rollback; as rb) {
              <div class="ps-mon-detail" data-testid="ps-monitoring-rollback-check">
                Rollback check: {{ rb.Kind }}{{ rb.Reason ? ' — ' + rb.Reason : '' }}{{ rb.Comparison ? ' · ' + rb.Comparison : '' }}
                @if (rb.PublishRecordID; as id) {
                  <button mjButton variant="flat" size="sm" type="button" data-testid="ps-monitoring-rollback" [attr.data-record-id]="id" (click)="OpenPublishRecord.emit(id)">rollback record</button>
                }
              </div>
            }
            @if (period.ErrorMessage) {
              <div class="ps-mon-error">{{ period.ErrorMessage }}</div>
            }
          </div>
        }
      }
      @if (Findings.length > 0) {
        <div class="ps-mon-findings" data-testid="ps-monitoring-findings">
          <strong>Registry check</strong>
          @for (f of Findings; track f.RunID + '-' + $index) {
            <div class="ps-mon-detail" data-testid="ps-monitoring-finding">
              ({{ f.Finding }}) {{ f.Detail }} — {{ f.Action }}
              <span class="ps-mon-muted">{{ f.At | date: 'medium' }} · {{ f.Outcome }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .ps-mon { display: flex; flex-direction: column; gap: 8px; }
    .ps-mon-head { display: flex; align-items: center; gap: 8px; }
    .ps-mon-sub, .ps-mon-muted { font-size: 12px; color: var(--mj-text-muted); }
    .ps-mon-sub { flex: 1; }
    .ps-mon-note { font-size: 13px; color: var(--mj-text-muted); padding: 8px 0; }
    .ps-mon-error { font-size: 13px; color: var(--mj-status-error-text); background: var(--mj-status-error-bg); border: 1px solid var(--mj-status-error-border); border-radius: 6px; padding: 8px 10px; }
    .ps-mon-chart { width: 100%; height: 160px; background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-subtle); border-radius: 8px; }
    .ps-mon-band { fill: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent); }
    .ps-mon-whisker { stroke: var(--mj-text-muted); stroke-width: 1.5; }
    .ps-mon-point { fill: var(--mj-brand-primary); }
    .ps-mon-point.fired { fill: var(--mj-status-warning); }
    .ps-mon-row { border: 1px solid var(--mj-border-subtle); border-radius: 8px; padding: 8px 12px; background: var(--mj-bg-surface); }
    .ps-mon-line { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 13px; color: var(--mj-text-primary); }
    .ps-mon-state { font-size: 12px; color: var(--mj-text-secondary); }
    .ps-mon-mono { font-family: var(--mj-font-family-mono); }
    .ps-mon-drift, .ps-mon-trigger { font-size: 13px; color: var(--mj-status-warning-text); margin-top: 4px; }
    .ps-mon-findings { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: var(--mj-text-primary); border-top: 1px solid var(--mj-border-subtle); padding-top: 8px; }
    .ps-mon-detail { font-size: 13px; color: var(--mj-text-secondary); margin-top: 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  `],
})
export class PSModelMonitoringComponent extends BaseAngularComponent implements OnInit {
  /** The model whose monitoring is shown; a change reloads the tab (after the first load in `ngOnInit`). */
  @Input()
  set Model(value: MJMLModelEntity | null) {
    if (value === this.model) return;
    this.model = value;
    if (this.initialized) void this.Reload();
  }
  get Model(): MJMLModelEntity | null {
    return this.model;
  }

  /** A request to open a publish record (a challenger's publish or an automatic rollback); the host navigates. */
  @Output() OpenPublishRecord = new EventEmitter<string>();

  /** The monitored periods, oldest first. */
  public Periods: readonly MonitoringPeriodVM[] = [];

  /** The registry check's findings about the model, newest run first. */
  public Findings: readonly RegistryFindingVM[] = [];

  /** The plotted points and the reference band. */
  public Chart: ChartVM = { Points: [], Band: null };

  /** True while the rows load. */
  public Loading = false;

  /** True while "Check now" runs. */
  public Checking = false;

  /** Why the rows could not be read, or null. */
  public ErrorMessage: string | null = null;

  /** Why "Check now" failed, or null. */
  public CheckMessage: string | null = null;

  /** The chart's viewBox width, in chart units. */
  public readonly ChartWidth = CHART_WIDTH;
  /** The chart's viewBox height, in chart units. */
  public readonly ChartHeight = CHART_HEIGHT;

  private readonly cdr = inject(ChangeDetectorRef);
  private model: MJMLModelEntity | null = null;
  /** True once `ngOnInit` ran: every input, the Provider included, is bound, so a Model change reloads. */
  private initialized = false;
  /** Counts loads; a load whose token is no longer the latest drops its result (the model changed while it read). */
  private loadToken = 0;

  /** The first load, once every input (the Provider included) is bound. */
  public ngOnInit(): void {
    this.initialized = true;
    void this.Reload();
  }

  /**
   * Reads the model's monitoring rows and the reference band, and rebuilds the chart. A load the model changed under
   * (a newer load started) discards what it read, so the tab never shows another model's monitoring.
   */
  public async Reload(): Promise<void> {
    const token = ++this.loadToken;
    const model = this.Model;
    if (!model) {
      this.Periods = [];
      this.Findings = [];
      this.Chart = { Points: [], Band: null };
      this.Loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.Loading = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      const { Rows, Band, RegistryRuns } = await this.LoadPeriods(model.ID);
      if (token !== this.loadToken) return;
      this.Periods = Rows.map((r) => PSModelMonitoringComponent.ToPeriod(r));
      this.Chart = PSModelMonitoringComponent.BuildChart(this.Periods, Band);
      this.Findings = RegistryRuns.flatMap((run) =>
        RegistryCheckDetails.FindingsAbout(run.Details, model.ID).map((finding): RegistryFindingVM => ({ RunID: run.ID, At: new Date(run.StartedAt), ...finding })),
      );
    } catch (e) {
      if (token !== this.loadToken) return;
      const reason = e instanceof Error ? e.message : String(e);
      LogError(`Predictive Studio model monitoring: reading the monitoring of ML Model ${model.ID} failed: ${reason}`);
      this.Periods = [];
      this.Findings = [];
      this.Chart = { Points: [], Band: null };
      this.ErrorMessage = `The monitoring results could not be read: ${reason}`;
    } finally {
      if (token === this.loadToken) {
        this.Loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  /** Runs the model's monitoring now through `PredictiveStudio.RunModelMonitoring`, as the user, then reloads. */
  public async CheckNow(): Promise<void> {
    if (!this.Model || this.Checking) return;
    this.Checking = true;
    this.CheckMessage = null;
    this.cdr.markForCheck();
    try {
      const provider = this.ProviderToUse;
      const result = await new PredictiveStudioRunModelMonitoringOperation().Execute({ modelId: this.Model.ID }, { provider, user: provider.CurrentUser });
      if (!result.Success) this.CheckMessage = result.ErrorMessage || 'The monitoring check did not run.';
      else await this.Reload();
    } catch (e) {
      this.CheckMessage = e instanceof Error ? e.message : String(e);
    } finally {
      this.Checking = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The model's monitoring rows, oldest period first; the reference band — the interval of the holdout score on the
   * model's newest publish record —; and the newest Registry Check job runs whose `Details` name the model, through the
   * host's provider (one batched `RunViews`). The runs are pre-filtered by the model's ID as a token of `Details` (a UUID
   * matches no other model) and read structurally after ({@link RegistryCheckDetails.FindingsAbout}); the read stays a
   * RunView so the job runs' entity permissions apply.
   *
   * @throws Error naming the read that failed, with its message
   */
  protected async LoadPeriods(modelId: string): Promise<{ Rows: MJMLMonitoringResultEntity[]; Band: { Lower: number; Upper: number } | null; RegistryRuns: RegistryRunRow[] }> {
    const id = EscapeSQLString(modelId);
    const results = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews([
      { EntityName: 'MJ: ML Monitoring Results', ExtraFilter: `ModelID='${id}'`, OrderBy: 'Period ASC', ResultType: 'entity_object' },
      { EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ModelID='${id}' AND Kind='publish'`, OrderBy: 'RecordedAt DESC', MaxRows: 1, ResultType: 'entity_object' },
      {
        EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ScheduledJob='${EscapeSQLString(REGISTRY_CHECK_JOB)}' AND Details LIKE '%${id}%'`,
        OrderBy: 'StartedAt DESC', MaxRows: REGISTRY_RUNS_READ, Fields: ['ID', 'StartedAt', 'Details'], ResultType: 'simple',
      },
    ]);
    // RunViews answers in request order: the monitoring rows, the newest publish record, the Registry Check runs.
    const periods: RunViewResult<MJMLMonitoringResultEntity> | undefined = results[0];
    const publishes: RunViewResult<MJMLModelPublishRecordEntity> | undefined = results[1];
    const registry: RunViewResult<RegistryRunRow> | undefined = results[2];
    if (!periods?.Success) throw new Error(`the monitoring results: ${periods?.ErrorMessage || 'the view returned no result'}`);
    if (!publishes?.Success) throw new Error(`the publish record: ${publishes?.ErrorMessage || 'the view returned no result'}`);
    if (!registry?.Success) throw new Error(`the Registry Check runs: ${registry?.ErrorMessage || 'the view returned no result'}`);
    const interval = publishes.Results[0]?.EvidenceObject?.holdoutPrimary.interval;
    const runs = registry.Results.map((r): RegistryRunRow => ({ ID: r.ID, StartedAt: r.StartedAt, Details: r.Details }));
    return { Rows: periods.Results, Band: interval ? { Lower: interval.lower, Upper: interval.upper } : null, RegistryRuns: runs };
  }

  /** One monitoring row as a period, its JSON columns read through their typed accessors. */
  public static ToPeriod(r: MJMLMonitoringResultEntity): MonitoringPeriodVM {
    const calibration = r.CalibrationObject;
    return {
      ID: r.ID,
      Period: r.Period,
      State: r.State,
      JoinedRows: r.JoinedRows,
      PrimaryValue: r.PrimaryValue,
      PrimaryLower: r.PrimaryLower,
      PrimaryUpper: r.PrimaryUpper,
      CalibrationSlope: calibration ? calibration.slope : null,
      CalibrationIntercept: calibration ? calibration.intercept : null,
      DriftAlarms: (r.DriftAlarmsObject || []).map((a) => a.input),
      Triggers: (r.TriggersFiredObject || []).map((t) => ({ Kind: t.kind, Reason: t.reason })),
      Challenger: PSModelMonitoringComponent.challengerOf(r.ChallengerResultObject),
      Rollback: PSModelMonitoringComponent.rollbackOf(r.RollbackCheckObject),
      ErrorMessage: r.ErrorMessage,
    };
  }

  /** Scales the evaluated periods and the band into chart coordinates. */
  public static BuildChart(periods: readonly MonitoringPeriodVM[], band: { Lower: number; Upper: number } | null): ChartVM {
    const plotted = periods.filter((p) => p.State === 'evaluated' && p.PrimaryValue !== null);
    const values: number[] = [];
    for (const p of plotted) values.push(p.PrimaryValue || 0, p.PrimaryLower === null ? p.PrimaryValue || 0 : p.PrimaryLower, p.PrimaryUpper === null ? p.PrimaryValue || 0 : p.PrimaryUpper);
    if (band) values.push(band.Lower, band.Upper);
    if (values.length === 0) return { Points: [], Band: null };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const y = (v: number): number => CHART_PAD + (1 - (v - min) / span) * (CHART_HEIGHT - 2 * CHART_PAD);
    const step = plotted.length > 1 ? (CHART_WIDTH - 2 * CHART_PAD) / (plotted.length - 1) : 0;
    const points = plotted.map((p, i): ChartPointVM => {
      const value = p.PrimaryValue || 0;
      return {
        ID: p.ID,
        X: plotted.length > 1 ? CHART_PAD + i * step : CHART_WIDTH / 2,
        Y: y(value),
        YLower: y(p.PrimaryLower === null ? value : p.PrimaryLower),
        YUpper: y(p.PrimaryUpper === null ? value : p.PrimaryUpper),
        Fired: p.Triggers.length > 0,
        Title: `${p.Period.toISOString().slice(0, 10)}: ${value.toFixed(3)}`,
      };
    });
    return { Points: points, Band: band ? { Y: y(band.Upper), Height: Math.max(1, y(band.Lower) - y(band.Upper)) } : null };
  }

  /** The challenger outcome of a period, or null when no trigger started one and the binding mirrors none. */
  private static challengerOf(c: MJMLMonitoringResultEntity['ChallengerResultObject']): MonitoringChallengerVM | null {
    if (!c || (c.outcome === 'none' && c.mirror === null)) return null;
    const mirror = c.mirror;
    return {
      Outcome: c.outcome,
      Reason: c.reason,
      Comparison: mirror ? `live mirror: ${mirror.paired} paired rows, ${mirror.agreement === null ? 'no decision agreement (not a classifier)' : `${(mirror.agreement * 100).toFixed(1)}% agreement`}, mean score difference ${mirror.meanScoreDelta.toFixed(3)}` : null,
      PublishRecordID: c.recordId,
    };
  }

  /** The rollback check of a period, or null when none ran or the protocol has no rollback rule. */
  private static rollbackOf(c: MJMLMonitoringResultEntity['RollbackCheckObject']): MonitoringRollbackVM | null {
    if (!c || c.kind === 'off') return null;
    if (c.kind === 'no-predecessor') return { Kind: c.kind, Reason: 'no earlier published model to compare against', Comparison: null, PublishRecordID: null };
    if (c.kind === 'not-eligible') return { Kind: c.kind, Reason: c.reason, Comparison: null, PublishRecordID: null };
    const last = c.comparisons.length > 0 ? c.comparisons[c.comparisons.length - 1] : null;
    return {
      Kind: c.kind,
      Reason: null,
      Comparison: last ? `paired loss difference [${last.lower.toFixed(3)}, ${last.upper.toFixed(3)}] on ${c.sharedRowIds} shared rows` : null,
      PublishRecordID: c.recordId,
    };
  }
}
