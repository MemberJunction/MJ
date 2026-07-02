import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJMLModelEntity, MJMLModelScoringBindingEntity, MJProcessRunDetailEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSProcessRunRow, primaryAuc } from '../predictive-studio.view-models';
import { humanizeCron, StatusVariant } from '../production-distribution';
import { PSOperateDialogComponent } from './ps-operate-dialog.component';

/** A model's deployment state, derived purely from cached bindings + Record Processes. */
type DeployState = 'bound' | 'scheduled' | 'idle';

/** One scoring binding shown in a model's deployment detail. */
interface BindingVM {
  id: string;
  targetEntity: string;
  targetColumn: string;
  mode: string;
  schedulePhrase: string | null;
}

/** One published model in the production control tower (DB-light — all fields from engine caches). */
interface ProductionModelVM {
  modelId: string;
  label: string;
  algorithm: string;
  problemType: string;
  version: number;
  holdoutMetric: string;
  deployState: DeployState;
  bindingCount: number;
  processCount: number;
  scheduledCount: number;
  /** Most recent scored-at across the model's bindings (cached lineage — no DB hit). */
  lastScoredAt: Date | null;
  lastRowCount: number | null;
}

/** One per-record prediction in a run's drill-in (parsed from `MJ: Process Run Details` `ResultPayload`). */
interface RunDetailVM {
  recordId: string;
  status: string;
  /** Formatted numeric prediction, or '—'. */
  score: string;
  /** Predicted class label (classification), or null. */
  class: string | null;
  /** ISO timestamp the prediction was produced (`$.scoredAt`), or the detail's completion time. */
  scoredAt: string | null;
}

/**
 * Models in Production — the **model-centric** control tower. Every approved (Published) model appears
 * here whether it's idle, scheduled, or bound — a scoring binding is a *deployment marker*, not a
 * prerequisite to appear or to run. Reactive + DB-light: the published-model list and each model's
 * deployment state come straight from the `PredictiveStudioEngine` caches (a `BaseEngine` subclass) via
 * `ObserveProperty`, so it re-renders on any model/binding change with no polling; a model's **past runs**
 * are loaded on demand when selected (`MJ: Process Runs` grow unbounded — never bulk-cached).
 *
 * Entity-agnostic: model labels derive from the producing pipeline; binding targets come from the binding
 * rows. **Operate** (the rocket button) opens the {@link PSOperateDialogComponent} to run/schedule/bind the
 * model; clicking a run drills into its per-record predictions (`MJ: Process Run Details`).
 */
@Component({
  standalone: true,
  selector: 'ps-production',
  imports: [CommonModule, SharedGenericModule, MJButtonDirective, PSOperateDialogComponent],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-production.component.scss'],
  template: `
    <div class="ps-panel ps-production" data-testid="ps-production-panel">
      @if (models.length === 0) {
        <div class="ps-empty" data-testid="ps-production-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-satellite-dish"></i></span>
          <h3>No models in production yet</h3>
          <p>
            When you publish a trained model in the Model Registry it shows up here — ready to schedule,
            bind to a column, and run. Train a pipeline and promote the model to Published to get started.
          </p>
        </div>
      } @else {
        <!-- KPI strip -->
        <div class="prod-kpis" data-testid="ps-production-kpis">
          <div class="ps-kpi"><div class="label">Published</div><div class="val">{{ models.length }}</div></div>
          <div class="ps-kpi"><div class="label">Scheduled</div><div class="val">{{ scheduledModelCount }}</div></div>
          <div class="ps-kpi"><div class="label">Bound (write-back)</div><div class="val">{{ boundModelCount }}</div></div>
          <div class="ps-kpi"><div class="label">Idle</div><div class="val">{{ idleModelCount }}</div></div>
        </div>

        <div class="prod-layout">
          <!-- master list -->
          <div class="ps-card mlist" data-testid="ps-production-list">
            <div class="ps-card-head"><h3>Published models</h3><span class="ps-badge gray">{{ models.length }}</span></div>
            <div class="ps-card-body" style="padding:8px">
              @for (m of models; track m.modelId) {
                <div class="mrow" data-testid="ps-production-row" [class.sel]="m.modelId === selectedModelId" (click)="select(m.modelId)">
                  <div class="ico" [class]="'st-' + m.deployState"><i [class]="deployIcon(m.deployState)"></i></div>
                  <div style="flex:1;min-width:0">
                    <div class="nm">{{ m.label }}</div>
                    <div class="ln2 ps-muted ps-small">v{{ m.version }} · {{ m.algorithm }}</div>
                  </div>
                  <div class="meta">
                    <span class="ps-badge" [class]="deployBadge(m.deployState)">{{ deployLabel(m.deployState) }}</span>
                    <div class="ps-mono ps-small ps-muted">{{ m.holdoutMetric }}</div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- detail -->
          <div class="ps-col detail" data-testid="ps-production-detail">
            <div class="ps-card">
              <div class="ps-card-body dh">
                <div class="big-ico" [class]="'st-' + selected.deployState"><i [class]="deployIcon(selected.deployState)"></i></div>
                <div style="flex:1">
                  <h2 data-testid="ps-production-detail-name">{{ selected.label }} <span class="ps-tag ps-mono">v{{ selected.version }}</span></h2>
                  <div class="ps-muted ps-small sub">{{ selected.algorithm }} · {{ selected.problemType }} · holdout {{ selected.holdoutMetric }}</div>
                </div>
                <span class="ps-badge" [class]="deployBadge(selected.deployState)">{{ deployLabel(selected.deployState) }}</span>
                <button mjButton variant="primary" size="sm" data-testid="ps-production-operate" (click)="operateOpen = true">
                  <i class="fa-solid fa-rocket"></i> Operate
                </button>
              </div>
            </div>

            <!-- deployment status -->
            <div class="ps-card">
              <div class="ps-card-head"><h3>Deployment</h3>
                <span class="ps-muted ps-small">{{ selected.processCount }} process{{ selected.processCount === 1 ? '' : 'es' }} · {{ selected.bindingCount }} binding{{ selected.bindingCount === 1 ? '' : 's' }}</span>
              </div>
              <div class="ps-card-body">
                @if (selected.deployState === 'idle') {
                  <div class="ps-callout info">
                    <i class="fa-solid fa-circle-info"></i>
                    <div class="ps-small">This model is published but <strong>not operating</strong> yet — nothing scores with it. Click <strong>Operate</strong> above to run it now, schedule it to run regularly, or write predictions back to a column.</div>
                  </div>
                } @else {
                  @if (selectedBindings.length > 0) {
                    <div class="ps-section-title">Scoring bindings</div>
                    @for (b of selectedBindings; track b.id) {
                      <div class="bind-row">
                        <i class="fa-solid fa-arrow-right-to-bracket ps-muted"></i>
                        <div style="flex:1">
                          <div class="ps-small"><strong>{{ b.targetEntity }}</strong>.{{ b.targetColumn }}</div>
                          <div class="ps-muted ps-small">{{ b.mode }}{{ b.schedulePhrase ? ' · ' + b.schedulePhrase : '' }}</div>
                        </div>
                        <span class="ps-badge" [class]="modeBadge(b.mode)">{{ b.mode }}</span>
                      </div>
                    }
                  } @else {
                    <div class="ps-small ps-muted">Scheduled to run, writing generic output to the process run history (no write-back column).</div>
                  }
                  @if (selected.lastScoredAt) {
                    <div class="ps-divider"></div>
                    <div class="ps-row" style="justify-content:space-between"><span class="ps-muted ps-small">Last scored</span><span class="ps-small">{{ selected.lastScoredAt | date:'medium' }}{{ selected.lastRowCount != null ? ' · ' + selected.lastRowCount + ' rows' : '' }}</span></div>
                  }
                }
              </div>
            </div>

            <!-- past runs (on demand) -->
            <div class="ps-card">
              <div class="ps-card-head"><h3>Run history</h3><span class="ps-muted ps-small">last 90 days · newest first</span></div>
              <div class="ps-card-body">
                @if (selectedRunId) {
                  <!-- run drill-in: per-record predictions from Process Run Details -->
                  <button class="run-back" data-testid="ps-production-run-back" (click)="closeRun()">
                    <i class="fa-solid fa-arrow-left"></i> All runs
                  </button>
                  @if (loadingDetails) {
                    <mj-loading text="Loading predictions..." size="small"></mj-loading>
                  } @else if (runDetails.length === 0) {
                    <div class="ps-small ps-muted">No per-record predictions recorded for this run.</div>
                  } @else {
                    <table class="runs-table" data-testid="ps-production-run-detail">
                      <thead><tr><th>Record</th><th>Status</th><th>Prediction</th><th>Scored</th></tr></thead>
                      <tbody>
                        @for (d of runDetails; track d.recordId) {
                          <tr>
                            <td class="ps-mono ps-small">{{ d.recordId }}</td>
                            <td><span class="ps-badge" [class]="runBadge(d.status)">{{ d.status }}</span></td>
                            <td class="ps-mono">{{ d.score }}@if (d.class) { <span class="ps-muted"> · {{ d.class }}</span> }</td>
                            <td class="ps-small ps-muted">{{ d.scoredAt ? (d.scoredAt | date:'short') : '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                } @else if (loadingRuns) {
                  <mj-loading text="Loading runs..." size="small"></mj-loading>
                } @else if (runs.length === 0) {
                  <div class="ps-small ps-muted">No runs recorded yet. Each time this model runs as a Record Process, its predictions are saved to the process run history — even without a scoring binding.</div>
                } @else {
                  <table class="runs-table">
                    <thead><tr><th>When</th><th>Status</th><th>Scored</th><th>Process</th><th></th></tr></thead>
                    <tbody>
                      @for (r of runs; track r.ID) {
                        <tr data-testid="ps-production-run" class="run-row" (click)="openRun(r.ID)">
                          <td>{{ (r.StartTime || r.CreatedAt) | date:'short' }}</td>
                          <td><span class="ps-badge" [class]="runBadge(r.Status)">{{ r.Status }}</span></td>
                          <td class="ps-mono">{{ r.SuccessCount }}<span class="ps-muted">/{{ r.TotalItemCount ?? 0 }}</span></td>
                          <td class="ps-small ps-muted">{{ r.ProcessName || '—' }}</td>
                          <td class="run-right">@if (r.DryRun) { <span class="ps-tag amber">dry run</span> }<i class="fa-solid fa-chevron-right ps-muted"></i></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </div>
            </div>
          </div>
        </div>

        <ps-operate-dialog
          [Visible]="operateOpen"
          [modelId]="selected.modelId"
          [modelLabel]="selected.label"
          [engine]="engine"
          [provider]="ProviderToUse"
          [currentUser]="ProviderToUse.CurrentUser"
          (Close)="onOperateClose($event)">
        </ps-operate-dialog>
      }
    </div>
  `,
})
export class PSProductionComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() engine!: PredictiveStudioEngine;

  private cdr = inject(ChangeDetectorRef);
  private modelsSub?: Subscription;

  public models: ProductionModelVM[] = [];
  public selectedModelId = '';
  public selectedBindings: BindingVM[] = [];
  public runs: PSProcessRunRow[] = [];
  public loadingRuns = false;
  /** Whether the "Operate this model" dialog is open for the selected model. */
  public operateOpen = false;
  /** The run whose per-record predictions are drilled into (null = the run list). */
  public selectedRunId: string | null = null;
  public runDetails: RunDetailVM[] = [];
  public loadingDetails = false;

  ngOnInit(): void {
    // Reactive: rebuild the published-model list on any MJ: ML Models change (save/delete/remote-invalidate).
    this.modelsSub = this.engine
      .ObserveProperty<MJMLModelEntity>('_Models')
      .subscribe(() => {
        this.rebuildModels();
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.modelsSub?.unsubscribe();
  }

  // ---- KPIs ----

  public get scheduledModelCount(): number {
    return this.models.filter((m) => m.deployState === 'scheduled' || m.scheduledCount > 0).length;
  }
  public get boundModelCount(): number {
    return this.models.filter((m) => m.bindingCount > 0).length;
  }
  public get idleModelCount(): number {
    return this.models.filter((m) => m.deployState === 'idle').length;
  }

  // ---- reactive list build (DB-light, from caches) ----

  private rebuildModels(): void {
    this.models = (this.engine?.PublishedModels ?? []).map((m) => this.toVM(m));
    if (!this.models.some((m) => UUIDsEqual(m.modelId, this.selectedModelId))) {
      const first = this.models[0]?.modelId ?? '';
      if (first) {
        this.select(first);
      } else {
        this.selectedModelId = '';
        this.selectedBindings = [];
        this.runs = [];
      }
    } else {
      this.selectedBindings = this.bindingsForModel(this.selectedModelId);
    }
  }

  private toVM(m: MJMLModelEntity): ProductionModelVM {
    const bindings = this.engine.ScoringBindings.filter((b) => UUIDsEqual(b.MLModelID, m.ID));
    const processes = this.engine.RecordProcessesForModel(m.ID);
    const scheduledCount = processes.filter((p) => !!p.ScheduleEnabled).length
      + bindings.filter((b) => b.Mode === 'Scheduled').length;
    const lastScoredAt = bindings.reduce<Date | null>(
      (acc, b) => (b.LastScoredAt && (!acc || b.LastScoredAt.getTime() > acc.getTime()) ? b.LastScoredAt : acc),
      null,
    );
    const lastRowCount = bindings.find((b) => b.LastRowCount != null)?.LastRowCount ?? null;
    const auc = primaryAuc(m);
    return {
      modelId: m.ID,
      label: this.engine.ModelDisplayName(m),
      algorithm: this.engine.AlgorithmName(m.AlgorithmID),
      problemType: m.ProblemType ?? '—',
      version: m.Version,
      holdoutMetric: auc != null ? auc.toFixed(3) : '—',
      deployState: bindings.length > 0 ? 'bound' : scheduledCount > 0 ? 'scheduled' : 'idle',
      bindingCount: bindings.length,
      processCount: processes.length,
      scheduledCount,
      lastScoredAt,
      lastRowCount,
    };
  }

  private bindingsForModel(modelId: string): BindingVM[] {
    return this.engine.ScoringBindings
      .filter((b) => UUIDsEqual(b.MLModelID, modelId))
      .map((b) => this.toBindingVM(b));
  }

  private toBindingVM(b: MJMLModelScoringBindingEntity): BindingVM {
    const process = this.engine.RecordProcessByID(b.RecordProcessID);
    return {
      id: b.ID,
      targetEntity: this.resolveEntityName(b),
      targetColumn: b.TargetColumn ?? '(generic output)',
      mode: b.Mode,
      schedulePhrase: b.Mode === 'Scheduled' ? humanizeCron(process?.CronExpression ?? null) : null,
    };
  }

  private resolveEntityName(b: MJMLModelScoringBindingEntity): string {
    if (b.TargetEntity) return b.TargetEntity;
    if (b.TargetEntityID) {
      const entity = this.ProviderToUse.Entities.find((e) => UUIDsEqual(e.ID, b.TargetEntityID));
      if (entity) return entity.Name;
    }
    return '—';
  }

  // ---- selection + on-demand run history ----

  public get selected(): ProductionModelVM {
    return (
      this.models.find((m) => UUIDsEqual(m.modelId, this.selectedModelId)) ??
      this.models[0] ?? {
        modelId: '', label: '—', algorithm: '—', problemType: '—', version: 0, holdoutMetric: '—',
        deployState: 'idle', bindingCount: 0, processCount: 0, scheduledCount: 0, lastScoredAt: null, lastRowCount: null,
      }
    );
  }

  /**
   * Close the Operate dialog. On a successful change the dialog already refreshed the engine
   * (Config(true)) — the reactive `_Models` subscription re-renders the deploy state — but the
   * on-demand run history + bindings of the SELECTED model are not part of that stream, so reload them
   * here so a just-created run / binding shows immediately.
   */
  public onOperateClose(result: { changed: boolean }): void {
    this.operateOpen = false;
    if (result.changed && this.selectedModelId) {
      this.selectedBindings = this.bindingsForModel(this.selectedModelId);
      void this.loadRuns(this.selectedModelId);
    }
  }

  public select(id: string): void {
    this.selectedModelId = id;
    this.selectedBindings = this.bindingsForModel(id);
    this.closeRun();
    void this.loadRuns(id);
  }

  // ---- run drill-in: per-record predictions (on demand) ----

  /** Drill into a run's per-record predictions (`MJ: Process Run Details` `ResultPayload`). */
  public openRun(runId: string): void {
    this.selectedRunId = runId;
    void this.loadRunDetails(runId);
  }

  public closeRun(): void {
    this.selectedRunId = null;
    this.runDetails = [];
  }

  private async loadRunDetails(runId: string): Promise<void> {
    this.loadingDetails = true;
    this.runDetails = [];
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const r = await rv.RunView<MJProcessRunDetailEntity>(
        {
          EntityName: 'MJ: Process Run Details',
          ExtraFilter: `ProcessRunID='${runId}'`,
          OrderBy: '__mj_CreatedAt ASC',
          MaxRows: 200,
          ResultType: 'entity_object',
        },
        this.ProviderToUse.CurrentUser,
      );
      this.runDetails = r.Success ? (r.Results ?? []).map((d) => this.toDetailVM(d)) : [];
    } finally {
      this.loadingDetails = false;
      this.cdr.detectChanges();
    }
  }

  /** Project a Process Run Detail into a per-record prediction row, parsing the ML `ResultPayload`. */
  private toDetailVM(d: MJProcessRunDetailEntity): RunDetailVM {
    let score = '—';
    let cls: string | null = null;
    let scoredAt: string | null = d.CompletedAt ? d.CompletedAt.toISOString() : null;
    if (d.ResultPayload) {
      try {
        const p = JSON.parse(d.ResultPayload) as { score?: number; class?: string; scoredAt?: string };
        if (typeof p.score === 'number') {
          score = p.score.toFixed(4);
        }
        cls = p.class ?? null;
        scoredAt = p.scoredAt ?? scoredAt;
      } catch {
        /* leave defaults — a non-ML payload (or malformed) just shows '—' */
      }
    }
    return { recordId: d.RecordID ?? '—', status: d.Status, score, class: cls, scoredAt };
  }

  /** On-demand run history for the selected model (DB-light — only the selected model, capped). */
  private async loadRuns(modelId: string): Promise<void> {
    this.loadingRuns = true;
    this.runs = [];
    this.cdr.detectChanges();
    try {
      this.runs = await this.engine.LoadRecentRunsForModel(
        modelId,
        this.ProviderToUse,
        this.ProviderToUse.CurrentUser,
        { sinceDays: 90, maxRows: 50 },
      );
    } finally {
      this.loadingRuns = false;
      this.cdr.detectChanges();
    }
  }

  // ---- display helpers ----

  public deployIcon(state: DeployState): string {
    switch (state) {
      case 'bound': return 'fa-solid fa-arrow-right-to-bracket';
      case 'scheduled': return 'fa-solid fa-clock';
      case 'idle': return 'fa-solid fa-circle-pause';
    }
  }
  public deployLabel(state: DeployState): string {
    switch (state) {
      case 'bound': return 'Bound';
      case 'scheduled': return 'Scheduled';
      case 'idle': return 'Idle';
    }
  }
  public deployBadge(state: DeployState): StatusVariant {
    switch (state) {
      case 'bound': return 'green';
      case 'scheduled': return 'blue';
      case 'idle': return 'gray';
    }
  }
  public modeBadge(mode: string): StatusVariant {
    return mode === 'Scheduled' ? 'blue' : mode === 'Materialized' ? 'green' : 'gray';
  }
  public runBadge(status: string): StatusVariant {
    const s = (status || '').toLowerCase();
    if (s.includes('complete') || s.includes('success')) return 'green';
    if (s.includes('fail') || s.includes('error')) return 'red';
    if (s.includes('run') || s.includes('progress')) return 'blue';
    return 'gray';
  }
}
