import { Component, Input, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { Metadata, RunView, EntityFieldInfo, EntityFieldTSType } from '@memberjunction/core';
import {
  MJMLModelScoringBindingEntity,
  MJProcessRunEntity,
} from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import {
  buildDistribution,
  humanizeCron,
  modelLabel,
  modeBadgeClass,
  summarizeRun,
  DistributionResult,
  RunSummary,
  StatusVariant,
  PRODUCTION_SAMPLE_CAP,
} from '../production-distribution';

/**
 * One deployment row in the "Models in Production" control tower — a published model wired to a
 * target entity + column via a scoring binding, with its mode/schedule, last run, and the live
 * distribution of the column it writes. Fully entity-agnostic: nothing here knows or cares which
 * entity/column a binding targets.
 */
interface ProductionRowVM {
  bindingId: string;
  /** Model display: "<Pipeline> v<Version>" (falls back to "Model v<Version>"). */
  modelLabel: string;
  algorithm: string;
  problemType: string;
  modelStatus: string;
  /** Target entity display name resolved from TargetEntityID, or the denormalized name, or '—'. */
  targetEntity: string;
  targetColumn: string;
  /** Scoring mode: OnDemand | Scheduled | Materialized. */
  mode: string;
  /** Human schedule phrase ("Monthly", "Daily at 06:00", or raw cron) when Scheduled. */
  schedulePhrase: string | null;
  /** Bound Record Process name (when one is linked). */
  processName: string | null;
  lastScoredAt: Date | null;
  lastRowCount: number | null;
  /** Latest Process Run summary for the bound process (resolved on demand). */
  lastRun: RunSummary | null;
  /** Generic distribution of the written column's current values across the population. */
  distribution: DistributionResult | null;
  /** True while the per-row run-history + distribution lookups are in flight. */
  loadingDetail: boolean;
}

/**
 * Models in Production panel — the deployment / control-tower view. For every active scoring binding
 * (a published model wired to a target entity + column), shows what the model writes, on what schedule,
 * when it last ran, and the current distribution of the written column across the population.
 *
 * 100% entity-agnostic + metadata-driven: the target entity and column come from the binding row; the
 * distribution is computed generically (numeric → neutral terciles; categorical → group-by-value counts)
 * over a RunView of the target entity, capped + bucketed client-side. No Member/renewal hardcoding.
 */
@Component({
  standalone: true,
  selector: 'ps-production',
  imports: [CommonModule, SharedGenericModule],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-production.component.scss'],
  templateUrl: './ps-production.component.html',
})
export class PSProductionComponent extends BaseAngularComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;

  public rows: ProductionRowVM[] = [];
  public loading = true;

  private readonly md = inject(Metadata);

  async ngOnInit(): Promise<void> {
    await this.buildRows();
  }

  /** Total records scored across all production bindings in their last run (a headline metric). */
  public get totalLastScored(): number {
    return this.rows.reduce((sum, r) => sum + (r.lastRowCount ?? 0), 0);
  }

  public get scheduledCount(): number {
    return this.rows.filter((r) => r.mode === 'Scheduled').length;
  }

  // ---- build ----

  private async buildRows(): Promise<void> {
    this.loading = true;
    const bindings = this.engine?.ScoringBindings ?? [];
    this.rows = bindings.map((b) => this.toRowVM(b));
    this.loading = false;
    // Kick off per-row detail (run history + distribution) without blocking initial render.
    await Promise.all(this.rows.map((row, i) => this.loadRowDetail(row, bindings[i])));
  }

  private toRowVM(b: MJMLModelScoringBindingEntity): ProductionRowVM {
    const model = this.engine.ModelByID(b.MLModelID);
    const process = this.engine.RecordProcessByID(b.RecordProcessID);
    return {
      bindingId: b.ID,
      modelLabel: modelLabel(model?.Pipeline, model?.Version),
      algorithm: model ? this.engine.AlgorithmName(model.AlgorithmID) : '—',
      problemType: model?.ProblemType ?? '—',
      modelStatus: model?.Status ?? '—',
      targetEntity: this.resolveEntityName(b),
      targetColumn: b.TargetColumn ?? '—',
      mode: b.Mode,
      schedulePhrase: b.Mode === 'Scheduled' ? humanizeCron(process?.CronExpression ?? null) : null,
      processName: b.RecordProcess ?? process?.Name ?? null,
      lastScoredAt: b.LastScoredAt ?? null,
      lastRowCount: b.LastRowCount ?? null,
      lastRun: null,
      distribution: null,
      loadingDetail: true,
    };
  }

  /** Resolve the target entity's display name: denormalized name → EntityInfo by ID → '—'. */
  private resolveEntityName(b: MJMLModelScoringBindingEntity): string {
    if (b.TargetEntity) return b.TargetEntity;
    if (b.TargetEntityID) {
      const entity = this.md.Entities.find((e) => e.ID === b.TargetEntityID);
      if (entity) return entity.Name;
    }
    return '—';
  }

  // ---- per-row detail: latest run + distribution ----

  private async loadRowDetail(row: ProductionRowVM, b: MJMLModelScoringBindingEntity): Promise<void> {
    try {
      await Promise.all([this.loadLastRun(row, b), this.loadDistribution(row, b)]);
    } finally {
      row.loadingDetail = false;
    }
  }

  /** Load the most-recent Process Run for the binding's bound Record Process. */
  private async loadLastRun(row: ProductionRowVM, b: MJMLModelScoringBindingEntity): Promise<void> {
    if (!b.RecordProcessID) return;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJProcessRunEntity>(
      {
        EntityName: 'MJ: Process Runs',
        ExtraFilter: `RecordProcessID='${b.RecordProcessID}'`,
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 1,
        ResultType: 'entity_object',
      },
      this.ProviderToUse.CurrentUser,
    );
    const latest = result.Success ? result.Results?.[0] : undefined;
    if (latest) {
      row.lastRun = summarizeRun({
        Status: latest.Status,
        EndTime: latest.EndTime,
        StartTime: latest.StartTime,
        CreatedAt: latest.__mj_CreatedAt,
        SuccessCount: latest.SuccessCount,
        ErrorCount: latest.ErrorCount,
        TotalItemCount: latest.TotalItemCount,
      });
    }
  }

  /**
   * Compute a generic distribution of the bound column's current values across the target entity's
   * population. Numeric/probability columns → neutral terciles; class/string columns → group-by-value.
   * Capped + bucketed client-side. Entity-agnostic — driven entirely by binding metadata.
   */
  private async loadDistribution(row: ProductionRowVM, b: MJMLModelScoringBindingEntity): Promise<void> {
    if (!b.TargetEntityID || !b.TargetColumn) return;
    const entity = this.md.Entities.find((e) => e.ID === b.TargetEntityID);
    if (!entity) return;
    const field = entity.Fields.find((f) => f.Name.toLowerCase() === b.TargetColumn!.toLowerCase());
    if (!field) return;

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: entity.Name,
        Fields: [b.TargetColumn],
        ExtraFilter: `[${b.TargetColumn}] IS NOT NULL`,
        MaxRows: PRODUCTION_SAMPLE_CAP,
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!result.Success) return;
    const values = (result.Results ?? []).map((r) => r[b.TargetColumn!]);
    row.distribution = buildDistribution(values, this.isNumericField(field));
  }

  private isNumericField(field: EntityFieldInfo): boolean {
    return field.TSType === EntityFieldTSType.Number;
  }

  /** Template helper — delegates to the pure {@link modeBadgeClass} mapper. */
  public modeBadge(mode: string): StatusVariant {
    return modeBadgeClass(mode);
  }
}
