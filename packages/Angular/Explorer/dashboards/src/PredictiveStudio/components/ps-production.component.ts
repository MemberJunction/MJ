import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AngularSplitModule } from 'angular-split';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { CompositeKey, LogError, RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { MJMLModelEntity, MJMLModelPublishRecordEntity, MJMLModelScoringBindingEntity, MJProcessRunDetailEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { NavigationService } from '@memberjunction/ng-shared';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSProcessRunRow, PrimaryModelScore, FormatMetricValue } from '../predictive-studio.view-models';
import { HumanizeCron, ModeBadgeClass, StatusVariant } from '../production-distribution';
import { JsonParse, TransitionRefusalText } from '@memberjunction/predictive-studio-core';
import { PSOperateDialogComponent } from './ps-operate-dialog.component';
import { PSPredictionsGridComponent } from './ps-predictions-grid.component';

/**
 * A model's deployment state, derived from its `ArtifactStatus` and the cached bindings and Record Processes.
 * `unscorable` overrides the others: a model whose artifact is missing, fails its registered hash, or exists only on a
 * pre-change local path cannot score, so it is never shown as Bound/Scheduled (which would promise results a run can't
 * deliver).
 */
type DeployState = 'unscorable' | 'bound' | 'scheduled' | 'idle';

/** One scoring binding shown in a model's deployment detail. */
interface BindingVM {
  id: string;
  targetEntity: string;
  /** The binding's prediction feature name. */
  featureName: string;
  /** The column the latest value is also copied into, or null. */
  targetColumn: string | null;
  mode: MJMLModelScoringBindingEntity['Mode'];
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
  /** Why the model cannot score (its `ArtifactStatus` in words), or null when it can. */
  unscorableReason: string | null;
  /** The last auto-train outcome of the model's pipeline (published, or withheld with the reason), or null. */
  autoTrainOutcome: string | null;
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
  imports: [CommonModule, AngularSplitModule, SharedGenericModule, MJButtonDirective, PSOperateDialogComponent, PSPredictionsGridComponent],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-production.component.css'],
  template: `
    <div class="ps-panel ps-production" data-testid="ps-production-panel">
      @if (Models.length === 0) {
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
        @if (!IsRunFocused) {
          <div class="prod-kpis" data-testid="ps-production-kpis">
            <div class="ps-kpi"><div class="label">Published</div><div class="val">{{ Models.length }}</div></div>
            <div class="ps-kpi"><div class="label">Scheduled</div><div class="val">{{ ScheduledModelCount }}</div></div>
            <div class="ps-kpi"><div class="label">Bound (write-back)</div><div class="val">{{ BoundModelCount }}</div></div>
            <div class="ps-kpi"><div class="label">Idle</div><div class="val">{{ IdleModelCount }}</div></div>
          </div>
        }

        <div class="prod-layout" [class.list-collapsed]="IsListCollapsed">
          @if (IsListCollapsed) {
            <div class="prod-collapsed-strip" data-testid="ps-production-collapsed-rail">
              <button class="prod-rail-collapse" type="button" (click)="ToggleList()" aria-label="Expand models list" title="Expand list">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
              <div class="prod-collapsed-strip-label"><i class="fa-solid fa-satellite-dish"></i></div>
            </div>
          }

          <as-split direction="horizontal" class="prod-splitter" unit="percent" [gutterSize]="6" (dragEnd)="OnSplitDragEnd($event.sizes)">
            @if (!IsListCollapsed) {
              <as-split-area [size]="ListSizePct" [minSize]="18" [maxSize]="50">
                <!-- master list -->
                <div class="ps-card mlist" data-testid="ps-production-list">
                  <div class="ps-card-head">
                    <h3>Published models</h3>
                    <div style="display:flex;gap:6px;align-items:center">
                      <span class="ps-badge gray">{{ Models.length }}</span>
                      <button class="prod-collapse-btn" type="button" (click)="ToggleList()" title="Collapse list" aria-label="Collapse list">
                        <i class="fa-solid fa-chevron-left"></i>
                      </button>
                    </div>
                  </div>
                  <div class="ps-card-body" style="padding:8px">
                    @for (m of Models; track m.modelId) {
                      <div class="mrow" data-testid="ps-production-row" [class.sel]="IsSelected(m.modelId)" (click)="Select(m.modelId)">
                        <div class="ico" [class]="'st-' + m.deployState"><i [class]="DeployIcon(m.deployState)"></i></div>
                        <div style="flex:1;min-width:0">
                          <div class="nm">{{ m.label }}</div>
                          <div class="ln2 ps-muted ps-small">v{{ m.version }} · {{ m.algorithm }}</div>
                        </div>
                        <div class="meta">
                          <span class="ps-badge" [class]="DeployBadge(m.deployState)">{{ DeployLabel(m.deployState) }}</span>
                          <div class="ps-mono ps-small ps-muted">{{ m.holdoutMetric }}</div>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </as-split-area>
            }

            <as-split-area [size]="IsListCollapsed ? 100 : DetailSizePct" [minSize]="50">
              <!-- detail -->
              <div class="ps-col detail" [class.focused-run]="SelectedRunId && IsRunFocused" data-testid="ps-production-detail">
                <!-- 1. MODEL HEADER CARD -->
                <div class="ps-card prod-header-card" [class.collapsed]="IsHeaderCollapsed">
                  @if (!IsHeaderCollapsed) {
                    <div class="ps-card-body dh">
                      <div class="big-ico" [class]="'st-' + Selected.deployState"><i [class]="DeployIcon(Selected.deployState)"></i></div>
                      <div style="flex:1;min-width:0">
                        <h2 data-testid="ps-production-detail-name">{{ Selected.label }} <span class="ps-tag ps-mono">v{{ Selected.version }}</span></h2>
                        <div class="ps-muted ps-small sub">{{ Selected.algorithm }} · {{ Selected.problemType }} · holdout {{ Selected.holdoutMetric }}</div>
                      </div>
                      <span class="ps-badge" data-testid="ps-deploy-state" [class]="DeployBadge(Selected.deployState)">{{ DeployLabel(Selected.deployState) }}</span>
                      <button mjButton variant="primary" size="sm" data-testid="ps-production-operate" [disabled]="!CanOperate(Selected)" [title]="Selected.unscorableReason || 'Operate this model'" (click)="OperateOpen = true">
                        <i class="fa-solid fa-rocket"></i> Operate
                      </button>
                      <button class="ps-card-collapse-btn" type="button" (click)="ToggleHeaderCollapse()" title="Collapse model header" aria-label="Collapse model header">
                        <i class="fa-solid fa-chevron-up"></i>
                      </button>
                    </div>
                  } @else {
                    <div class="ps-card-body dh-compact" (click)="ToggleHeaderCollapse()">
                      <div class="mini-ico" [class]="'st-' + Selected.deployState"><i [class]="DeployIcon(Selected.deployState)"></i></div>
                      <div class="compact-info">
                        <strong>{{ Selected.label }}</strong>
                        <span class="ps-tag ps-mono ps-small">v{{ Selected.version }}</span>
                        <span class="ps-muted ps-small">· {{ Selected.algorithm }}</span>
                      </div>
                      <span class="ps-badge" [class]="DeployBadge(Selected.deployState)">{{ DeployLabel(Selected.deployState) }}</span>
                      <button mjButton variant="primary" size="sm" data-testid="ps-production-operate-compact" [disabled]="!CanOperate(Selected)" (click)="$event.stopPropagation(); OperateOpen = true">
                        <i class="fa-solid fa-rocket"></i> Operate
                      </button>
                      <button class="ps-card-collapse-btn" type="button" (click)="$event.stopPropagation(); ToggleHeaderCollapse()" title="Expand model header" aria-label="Expand model header">
                        <i class="fa-solid fa-chevron-down"></i>
                      </button>
                    </div>
                  }
                </div>

                <!-- 2. DEPLOYMENT STATUS CARD -->
                <div class="ps-card prod-deployment-card" [class.collapsed]="IsDeploymentCollapsed">
                  <div class="ps-card-head clickable" (click)="ToggleDeploymentCollapse()">
                    <div style="display:flex;align-items:center;gap:8px">
                      <i class="fa-solid fa-network-wired" style="color:var(--mj-brand-primary)"></i>
                      <h3>Deployment</h3>
                      <span class="ps-muted ps-small">{{ Selected.processCount }} process{{ Selected.processCount === 1 ? '' : 'es' }} · {{ Selected.bindingCount }} binding{{ Selected.bindingCount === 1 ? '' : 's' }}</span>
                      @if (IsDeploymentCollapsed && SelectedBindings.length > 0) {
                        <span class="ps-badge gray ps-small">{{ SelectedBindings[0].targetEntity }} · {{ SelectedBindings[0].featureName }}</span>
                      }
                    </div>
                    <div style="display:flex;align-items:center;gap:6px">
                      <button class="ps-card-collapse-btn" type="button" (click)="$event.stopPropagation(); ToggleDeploymentCollapse()" [title]="IsDeploymentCollapsed ? 'Expand deployment' : 'Collapse deployment'" [attr.aria-label]="IsDeploymentCollapsed ? 'Expand deployment' : 'Collapse deployment'">
                        <i class="fa-solid" [class.fa-chevron-up]="!IsDeploymentCollapsed" [class.fa-chevron-down]="IsDeploymentCollapsed"></i>
                      </button>
                    </div>
                  </div>
                  @if (!IsDeploymentCollapsed) {
                    <div class="ps-card-body">
                      @if (AutoTrainOutcomeError && Selected.processCount > 0) {
                        <div class="ps-callout warn ps-small" data-testid="ps-auto-train-outcome-error">
                          <i class="fa-solid fa-triangle-exclamation"></i>
                          <div>The last auto-train outcome could not be read: {{ AutoTrainOutcomeError }}</div>
                        </div>
                      }
                      @if (Selected.autoTrainOutcome) {
                        <div class="ps-small ps-muted" data-testid="ps-auto-train-outcome" style="margin-bottom:8px">
                          <i class="fa-solid fa-robot"></i> Last auto-train: {{ Selected.autoTrainOutcome }}
                        </div>
                      }
                      @if (Selected.deployState === 'unscorable') {
                        <div class="ps-callout warn" data-testid="ps-production-unscorable">
                          <i class="fa-solid fa-triangle-exclamation"></i>
                          <div class="ps-small">This model is <strong>unscorable</strong>: {{ Selected.unscorableReason }} Its pipeline is retrained automatically; a model published through the lifecycle gate replaces it.</div>
                        </div>
                      } @else if (Selected.deployState === 'idle') {
                        <div class="ps-callout info">
                          <i class="fa-solid fa-circle-info"></i>
                          <div class="ps-small">This model is published but <strong>not operating</strong> yet — nothing scores with it. Click <strong>Operate</strong> above to run it now, schedule it to run regularly, or write predictions back to a column.</div>
                        </div>
                      } @else {
                        @if (SelectedBindings.length > 0) {
                          <div class="ps-section-title">Scoring bindings</div>
                          @for (b of SelectedBindings; track b.id) {
                            <div class="bind-row" data-testid="ps-production-binding">
                              <i class="fa-solid fa-arrow-right-to-bracket ps-muted"></i>
                              <div style="flex:1">
                                <div class="ps-small"><strong>{{ b.targetEntity }}</strong> · {{ b.featureName }}</div>
                                <div class="ps-muted ps-small">{{ b.targetColumn ? 'copied to ' + b.targetColumn + ' · ' : '' }}{{ b.mode }}{{ b.schedulePhrase ? ' · ' + b.schedulePhrase : '' }}</div>
                              </div>
                              <span class="ps-badge" [class]="ModeBadge(b.mode)">{{ b.mode }}</span>
                              <button mjButton variant="secondary" size="sm" data-testid="ps-production-binding-open" title="Edit or withdraw this binding in the model's Bindings section" (click)="OpenBindings()">
                                <i class="fa-solid fa-pen-to-square"></i> Bindings
                              </button>
                            </div>
                          }
                        } @else {
                          <div class="ps-small ps-muted">Scheduled to run, writing generic output to the process run history (no write-back column).</div>
                        }
                        @if (Selected.lastScoredAt) {
                          <div class="ps-divider"></div>
                          <div class="ps-row" style="justify-content:space-between"><span class="ps-muted ps-small">Last scored</span><span class="ps-small">{{ Selected.lastScoredAt | date:'medium' }}{{ Selected.lastRowCount !== null ? ' · ' + Selected.lastRowCount + ' rows' : '' }}</span></div>
                        }
                      }
                    </div>
                  }
                </div>

                <!-- 3. RUN HISTORY CARD -->
                <div class="ps-card run-card" [class.drilldown-active]="SelectedRunId" [class.focus-fill]="SelectedRunId && IsRunFocused">
                  <div class="ps-card-head">
                    <div style="display:flex;align-items:center;gap:8px">
                      <i class="fa-solid fa-clock-rotate-left" style="color:var(--mj-status-info)"></i>
                      <h3>Run history</h3>
                      <span class="ps-muted ps-small">last 90 days · newest first</span>
                    </div>
                    @if (SelectedRunId) {
                      <div style="display:flex;align-items:center;gap:8px">
                        <button class="ps-focus-toggle-btn" type="button" (click)="ToggleRunFocus()" [class.active]="IsRunFocused" [title]="IsRunFocused ? 'Exit focus (expand header & deployment)' : 'Focus mode (collapse header & deployment)'">
                          <i class="fa-solid" [class.fa-compress]="IsRunFocused" [class.fa-expand]="!IsRunFocused"></i>
                          <span>{{ IsRunFocused ? 'Exit Focus' : 'Focus' }}</span>
                        </button>
                      </div>
                    }
                  </div>
                  <div class="ps-card-body run-card-body">
                    @if (SelectedRunId) {
                      <!-- run drill-in: unified predictions grid with virtual scrolling, name resolution, charts & history -->
                      <div class="run-drill-nav">
                        <button class="run-back" data-testid="ps-production-run-back" (click)="CloseRun()">
                          <i class="fa-solid fa-arrow-left"></i> All runs
                        </button>
                        <span class="ps-tag ps-mono ps-small">Run: {{ SelectedRunId }}</span>
                      </div>
                      <ps-predictions-grid
                        data-testid="ps-production-run-grid"
                        [Provider]="Provider"
                        [ModelId]="Selected.modelId"
                        [RunId]="SelectedRunId"
                        [EntityName]="SelectedTargetEntityName"
                        [ProblemType]="Selected.problemType"
                        [Title]="Selected.label + ' — Run Predictions'"
                        [Height]="RunGridHeight">
                      </ps-predictions-grid>
                    } @else if (LoadingRuns) {
                      <mj-loading text="Loading runs..." size="small"></mj-loading>
                    } @else if (Runs.length === 0) {
                      <div class="ps-small ps-muted">No runs recorded yet. Each time this model runs as a Record Process, its predictions are saved to the process run history — even without a scoring binding.</div>
                    } @else {
                      <table class="runs-table">
                        <thead><tr><th>When</th><th>Status</th><th>Scored</th><th>Process</th><th></th></tr></thead>
                        <tbody>
                          @for (r of Runs; track r.ID) {
                            <tr data-testid="ps-production-run" class="run-row" (click)="OpenRun(r.ID)">
                              <td>{{ (r.StartTime || r.CreatedAt) | date:'short' }}</td>
                              <td><span class="ps-badge" [class]="RunBadge(r.Status)">{{ r.Status }}</span></td>
                              <td class="ps-mono">{{ r.SuccessCount }}<span class="ps-muted">/{{ r.TotalItemCount || 0 }}</span></td>
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
            </as-split-area>
          </as-split>
    </div>

        <ps-operate-dialog
          [Visible]="OperateOpen"
          [modelId]="Selected.modelId"
          [ModelLabel]="Selected.label"
          [engine]="Engine"
          [provider]="ProviderToUse"
          [CurrentUser]="ProviderToUse.CurrentUser"
          (Close)="OnOperateClose($event)">
        </ps-operate-dialog>
      }
    </div>
  `,
})
export class PSProductionComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  /** The Predictive Studio engine the host has configured. */
  @Input() Engine!: PredictiveStudioEngine;

  private cdr = inject(ChangeDetectorRef);
  private navigationService = inject(NavigationService);
  private modelsSub?: Subscription;

  /** The published models, as the list shows them. */
  public Models: ProductionModelVM[] = [];

  /** The selected model's ID. */
  public SelectedModelId = '';

  /** The selected model's scoring bindings. */
  public SelectedBindings: BindingVM[] = [];

  /** The selected model's recent runs. */
  public Runs: PSProcessRunRow[] = [];

  /** True while the selected model's runs load. */
  public LoadingRuns = false;

  /** True while a run's details load. */
  public LoadingDetails = false;

  /** Whether the "Operate this model" dialog is open for the selected model. */
  public OperateOpen = false;

  /** The run whose per-record predictions are drilled into (null = the run list). */
  public SelectedRunId: string | null = null;

  /** The opened run's details. */
  public RunDetails: RunDetailVM[] = [];

  /** The list pane's width, in percent. */
  public ListSizePct = 30;

  /** The detail pane's width, in percent. */
  public DetailSizePct = 70;

  /** True when the list pane is collapsed. */
  public IsListCollapsed = false;

  /** True when the model header card is collapsed. */
  public IsHeaderCollapsed = false;

  /** True when the deployment card is collapsed. */
  public IsDeploymentCollapsed = false;

  /** True in run focus mode (header and deployment collapsed). */
  public IsRunFocused = false;

  /** The run grid's CSS height for the current layout. */
  public get RunGridHeight(): string {
    if (this.IsRunFocused || (this.IsHeaderCollapsed && this.IsDeploymentCollapsed)) {
      return '740px';
    }
    return '520px';
  }

  ngOnInit(): void {
    this.loadLayoutPrefs();
    // Reactive: rebuild the published-model list on any MJ: ML Models change (save/delete/remote-invalidate).
    this.modelsSub = this.Engine
      .ObserveProperty<MJMLModelEntity>('_Models')
      .subscribe(() => {
        this.rebuildModels();
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.modelsSub?.unsubscribe();
  }

  // ---- layout splitter resizing & persistence ----

  /** Collapses or expands the model header card. */
  public ToggleHeaderCollapse(): void {
    this.IsHeaderCollapsed = !this.IsHeaderCollapsed;
    this.updateFocusState();
    this.saveLayoutPrefs();
    this.cdr.detectChanges();
  }

  /** Collapses or expands the deployment card. */
  public ToggleDeploymentCollapse(): void {
    this.IsDeploymentCollapsed = !this.IsDeploymentCollapsed;
    this.updateFocusState();
    this.saveLayoutPrefs();
    this.cdr.detectChanges();
  }

  /** Enters or leaves run focus mode. */
  public ToggleRunFocus(): void {
    this.IsRunFocused = !this.IsRunFocused;
    if (this.IsRunFocused) {
      this.IsHeaderCollapsed = true;
      this.IsDeploymentCollapsed = true;
    } else {
      this.IsHeaderCollapsed = false;
      this.IsDeploymentCollapsed = false;
    }
    this.saveLayoutPrefs();
    this.cdr.detectChanges();
  }

  private updateFocusState(): void {
    this.IsRunFocused = this.IsHeaderCollapsed && this.IsDeploymentCollapsed;
  }

  /** Restores the saved pane layout; an absent, malformed or non-object setting leaves the defaults. */
  private loadLayoutPrefs(): void {
    const parsed = JsonParse.ParseJsonText(UserInfoEngine.Instance.GetSetting('mj.predictiveStudio.production.layout'), 'mj.predictiveStudio.production.layout');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return;
    const prefs = parsed.Value;
    const listSizePct = JsonParse.JsonNumber(prefs, 'listSizePct');
    if (listSizePct !== null && listSizePct >= 15 && listSizePct <= 60) {
      this.ListSizePct = listSizePct;
      this.DetailSizePct = 100 - listSizePct;
    }
    const isListCollapsed = JsonParse.JsonBoolean(prefs, 'isListCollapsed');
    if (isListCollapsed !== null) this.IsListCollapsed = isListCollapsed;
    const isHeaderCollapsed = JsonParse.JsonBoolean(prefs, 'isHeaderCollapsed');
    if (isHeaderCollapsed !== null) this.IsHeaderCollapsed = isHeaderCollapsed;
    const isDeploymentCollapsed = JsonParse.JsonBoolean(prefs, 'isDeploymentCollapsed');
    if (isDeploymentCollapsed !== null) this.IsDeploymentCollapsed = isDeploymentCollapsed;
    const isRunFocused = JsonParse.JsonBoolean(prefs, 'isRunFocused');
    if (isRunFocused !== null) this.IsRunFocused = isRunFocused;
  }

  /** Keeps the pane widths after a splitter drag. */
  public OnSplitDragEnd(sizes: readonly (number | '*')[]): void {
    if (Array.isArray(sizes) && sizes.length === 2 && typeof sizes[0] === 'number' && typeof sizes[1] === 'number') {
      this.ListSizePct = Math.round(sizes[0]);
      this.DetailSizePct = Math.round(sizes[1]);
      this.saveLayoutPrefs();
    }
  }

  /** Collapses or expands the list pane. */
  public ToggleList(): void {
    this.IsListCollapsed = !this.IsListCollapsed;
    this.saveLayoutPrefs();
    this.cdr.detectChanges();
  }

  private saveLayoutPrefs(): void {
    const prefs = {
      listSizePct: this.ListSizePct,
      detailSizePct: this.DetailSizePct,
      isListCollapsed: this.IsListCollapsed,
      isHeaderCollapsed: this.IsHeaderCollapsed,
      isDeploymentCollapsed: this.IsDeploymentCollapsed,
      isRunFocused: this.IsRunFocused,
    };
    UserInfoEngine.Instance.SetSettingDebounced('mj.predictiveStudio.production.layout', JSON.stringify(prefs));
  }

  // ---- KPIs ----

  /** Published models with a schedule. */
  public get ScheduledModelCount(): number {
    return this.Models.filter((m) => m.deployState === 'scheduled' || m.scheduledCount > 0).length;
  }

  /** Published models with a write-back binding. */
  public get BoundModelCount(): number {
    return this.Models.filter((m) => m.bindingCount > 0).length;
  }

  /** Published models with neither. */
  public get IdleModelCount(): number {
    return this.Models.filter((m) => m.deployState === 'idle').length;
  }

  // ---- reactive list build (DB-light, from caches) ----

  private rebuildModels(): void {
    this.Models = (this.Engine?.PublishedModels || []).map((m) => this.toVM(m));
    void this.refreshAutoTrainOutcomes();
    if (!this.Models.some((m) => UUIDsEqual(m.modelId, this.SelectedModelId))) {
      const first = this.Models[0]?.modelId || '';
      if (first) {
        this.Select(first);
      } else {
        this.SelectedModelId = '';
        this.SelectedBindings = [];
        this.Runs = [];
      }
    } else {
      this.SelectedBindings = this.bindingsForModel(this.SelectedModelId);
    }
  }

  private toVM(m: MJMLModelEntity): ProductionModelVM {
    const bindings = this.Engine.ScoringBindingsForPipeline(m.PipelineID);
    const processes = this.Engine.RecordProcessesForModel(m.ID);
    const scheduledCount = processes.filter((p) => !!p.ScheduleEnabled).length
      + bindings.filter((b) => b.Mode === 'Scheduled').length;
    const lastScoredAt = bindings.reduce<Date | null>(
      (acc, b) => (b.LastScoredAt && (!acc || b.LastScoredAt.getTime() > acc.getTime()) ? b.LastScoredAt : acc),
      null,
    );
    const found = bindings.find((b) => b.LastRowCount !== null && b.LastRowCount !== undefined)?.LastRowCount;
    const lastRowCount = found === null || found === undefined ? null : found;
    const score = PrimaryModelScore(m);
    // named with its metric: a lower-is-better loss and a higher-is-better AUC must not read as the same kind of number
    const holdoutMetric = score !== null ? `${score.label} ${FormatMetricValue(score.key, score.value)}` : '—';
    return {
      modelId: m.ID,
      label: this.Engine.ModelDisplayName(m),
      algorithm: this.Engine.AlgorithmName(m.AlgorithmID),
      problemType: m.ProblemType === null || m.ProblemType === undefined ? '—' : m.ProblemType,
      version: m.Version,
      holdoutMetric,
      deployState: PSProductionComponent.UnscorableReason(m.ArtifactStatus) !== null ? 'unscorable' : bindings.length > 0 ? 'bound' : scheduledCount > 0 ? 'scheduled' : 'idle',
      bindingCount: bindings.length,
      processCount: processes.length,
      scheduledCount,
      lastScoredAt,
      lastRowCount,
      unscorableReason: PSProductionComponent.UnscorableReason(m.ArtifactStatus),
      autoTrainOutcome: this.autoTrainOutcomes.Get(m.ID) || null,
    };
  }

  /** Each production model's last auto-train outcome, by model ID (filled asynchronously). */
  private autoTrainOutcomes = new UUIDMap<string>();
  /** Why the last auto-train outcomes could not be read, or null when they were (shown in place of the outcome line). */
  public AutoTrainOutcomeError: string | null = null;

  /**
   * Why a model with `status` cannot score, or null when it can: a missing artifact, one whose bytes fail its registered
   * hash, or one that exists only on a pre-change local path.
   */
  public static UnscorableReason(status: MJMLModelEntity['ArtifactStatus']): string | null {
    switch (status) {
      case 'missing': return "the model's artifact file is missing.";
      case 'hash-mismatch': return "the model's artifact bytes do not match its registered hash.";
      case 'legacy-local': return "the model's artifact exists only on a local path from before the lifecycle gate, so it cannot be verified.";
      default: return null;
    }
  }

  /** True when the model can be operated: it is not unscorable. */
  public CanOperate(vm: ProductionModelVM): boolean {
    return vm.deployState !== 'unscorable';
  }

  /** Loads the last auto-train outcome of every production model and re-renders the rows that changed. */
  private async refreshAutoTrainOutcomes(): Promise<void> {
    const ids = this.Models.filter((m) => this.Engine.RecordProcessesForModel(m.modelId).length > 0).map((m) => m.modelId);
    if (ids.length === 0) return;
    try {
      this.autoTrainOutcomes = await this.LoadAutoTrainOutcomes(ids);
      this.AutoTrainOutcomeError = null;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      LogError(`Predictive Studio production: reading the last auto-train outcomes failed: ${reason}`);
      this.AutoTrainOutcomeError = reason;
      this.cdr.detectChanges();
      return;
    }
    this.Models = this.Models.map((vm) => ({ ...vm, autoTrainOutcome: this.autoTrainOutcomes.Get(vm.modelId) || null }));
    this.cdr.detectChanges();
  }

  /**
   * The last auto-train outcome of each model's pipeline: the newest `MJ: ML Model Publish Records` row, over the
   * pipeline's models, whose `Initiator` is auto-train — "published", or "withheld: <reason>" (one batched `RunView`).
   *
   * @throws Error with the read's message when the publish records cannot be read
   */
  protected async LoadAutoTrainOutcomes(modelIds: readonly string[]): Promise<UUIDMap<string>> {
    const pipelineOf = new UUIDMap<string>();
    for (const m of [...(this.Engine.Models || []), ...this.Engine.PublishedModels]) pipelineOf.Set(m.ID, m.PipelineID);
    const pipelines = new UUIDSet();
    for (const id of modelIds) {
      const pipeline = pipelineOf.Get(id);
      if (pipeline) pipelines.Add(pipeline);
    }
    const candidates = [...pipelineOf].filter(([, pipeline]) => pipelines.Has(pipeline)).map(([id]) => `'${EscapeSQLString(id)}'`);
    const [result] = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews<MJMLModelPublishRecordEntity>([
      {
        EntityName: 'MJ: ML Model Publish Records',
        ExtraFilter: `ModelID IN (${candidates.join(',')}) AND Kind IN ('publish','refusal') AND Initiator LIKE '%auto-train%'`,
        OrderBy: 'RecordedAt DESC',
        MaxRows: 500,
        ResultType: 'entity_object',
      },
    ]);
    if (!result || !result.Success) throw new Error(result?.ErrorMessage || 'the publish records read returned no result');
    const newestByPipeline = new UUIDMap<string>();
    for (const r of result.Results) {
      const initiator = r.InitiatorObject;
      const pipeline = r.ModelID ? pipelineOf.Get(r.ModelID) : undefined;
      if (!pipeline || newestByPipeline.Has(pipeline) || initiator.kind !== 'system' || initiator.component !== 'auto-train') continue;
      newestByPipeline.Set(pipeline, PSProductionComponent.OutcomeText(r));
    }
    const out = new UUIDMap<string>();
    for (const id of modelIds) {
      const pipeline = pipelineOf.Get(id);
      const text = pipeline ? newestByPipeline.Get(pipeline) : undefined;
      if (text) out.Set(id, text);
    }
    return out;
  }

  /** An auto-train publish record in words: "published", or "withheld: <reason>". */
  public static OutcomeText(r: MJMLModelPublishRecordEntity): string {
    if (r.Kind === 'publish') return 'published';
    const refusal = r.RefusalObject;
    return refusal ? `withheld: ${TransitionRefusalText.For(refusal)}` : 'withheld';
  }

  /** The bindings of the model's pipeline (a binding scores with whichever version of it is Published). */
  private bindingsForModel(modelId: string): BindingVM[] {
    const model = this.Engine.PublishedModels.find((m) => UUIDsEqual(m.ID, modelId));
    return model ? this.Engine.ScoringBindingsForPipeline(model.PipelineID).map((b) => this.toBindingVM(b)) : [];
  }

  private toBindingVM(b: MJMLModelScoringBindingEntity): BindingVM {
    const process = this.Engine.RecordProcessByID(b.RecordProcessID);
    return {
      id: b.ID,
      targetEntity: this.resolveEntityName(b),
      featureName: b.FeatureName,
      targetColumn: b.TargetColumn || null,
      mode: b.Mode,
      schedulePhrase: b.Mode === 'Scheduled' ? HumanizeCron(process?.CronExpression === null || process?.CronExpression === undefined ? null : process.CronExpression) : null,
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

  /** The selected model's target entity name, when known. */
  public get SelectedTargetEntityName(): string | null {
    if (this.SelectedBindings.length > 0 && this.SelectedBindings[0].targetEntity !== '—') {
      return this.SelectedBindings[0].targetEntity;
    }
    const model = this.Engine?.PublishedModels?.find((m) => UUIDsEqual(m.ID, this.Selected.modelId));
    if (model?.PipelineID) {
      const pipeline = this.Engine?.Pipelines?.find((p) => UUIDsEqual(p.ID, model.PipelineID));
      if (pipeline?.TargetEntityID) {
        const ent = this.ProviderToUse.Entities.find((e) => UUIDsEqual(e.ID, pipeline.TargetEntityID));
        if (ent) return ent.Name;
      }
    }
    return null;
  }

  // ---- selection + on-demand run history ----

  /** The selected model (an empty placeholder when none). */
  public get Selected(): ProductionModelVM {
    return (
      this.Models.find((m) => UUIDsEqual(m.modelId, this.SelectedModelId)) ||
      this.Models[0] || {
        modelId: '', label: '—', algorithm: '—', problemType: '—', version: 0, holdoutMetric: '—',
        deployState: 'idle', bindingCount: 0, processCount: 0, scheduledCount: 0, lastScoredAt: null, lastRowCount: null,
        unscorableReason: null, autoTrainOutcome: null,
      }
    );
  }

  /**
   * Close the Operate dialog. On a successful change the dialog already refreshed the engine
   * (Config(true)) — the reactive `_Models` subscription re-renders the deploy state — but the
   * on-demand run history + bindings of the SELECTED model are not part of that stream, so reload them
   * here so a just-created run / binding shows immediately.
   */
  public OnOperateClose(result: { changed: boolean }): void {
    this.OperateOpen = false;
    if (result.changed && this.SelectedModelId) {
      this.SelectedBindings = this.bindingsForModel(this.SelectedModelId);
      void this.loadRuns(this.SelectedModelId);
    }
  }

  /** True for the selected row (IDs compared case-insensitively: SQL Server and PostgreSQL spell a UUID in different cases). */
  public IsSelected(id: string): boolean {
    return UUIDsEqual(id, this.SelectedModelId);
  }

  /** Selects a model and loads its runs and bindings. */
  public Select(id: string): void {
    this.SelectedModelId = id;
    this.SelectedBindings = this.bindingsForModel(id);
    this.CloseRun();
    void this.loadRuns(id);
  }

  // ---- run drill-in: per-record predictions (on demand) ----

  /** Drill into a run's per-record predictions (`MJ: Process Run Details` `ResultPayload`). */
  public OpenRun(runId: string): void {
    this.SelectedRunId = runId;
    void this.loadRunDetails(runId);
  }

  /** Leaves the run drill-in for the run list. */
  public CloseRun(): void {
    this.SelectedRunId = null;
    this.RunDetails = [];
  }

  private async loadRunDetails(runId: string): Promise<void> {
    this.LoadingDetails = true;
    this.RunDetails = [];
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const r = await rv.RunView<MJProcessRunDetailEntity>(
        {
          EntityName: 'MJ: Process Run Details',
          ExtraFilter: `ProcessRunID='${EscapeSQLString(runId)}'`,
          OrderBy: '__mj_CreatedAt ASC',
          MaxRows: 200,
          ResultType: 'entity_object',
        },
        this.ProviderToUse.CurrentUser,
      );
      this.RunDetails = r.Success ? (r.Results || []).map((d) => this.toDetailVM(d)) : [];
    } finally {
      this.LoadingDetails = false;
      this.cdr.detectChanges();
    }
  }

  /** Project a Process Run Detail into a per-record prediction row, parsing the ML `ResultPayload`. */
  private toDetailVM(d: MJProcessRunDetailEntity): RunDetailVM {
    let score = '—';
    let cls: string | null = null;
    let scoredAt: string | null = d.CompletedAt ? d.CompletedAt.toISOString() : null;
    // An absent, malformed or non-object payload (not an ML result) keeps the defaults, so the row shows '—'.
    const parsed = JsonParse.ParseJsonText(d.ResultPayload, 'ResultPayload');
    if (parsed.Ok && JsonParse.IsJsonObject(parsed.Value)) {
      const p = parsed.Value;
      const value = JsonParse.JsonNumber(p, 'score');
      if (value !== null) score = value.toFixed(4);
      const c = p['class'];
      cls = typeof c === 'string' ? c : null;
      const at = p['scoredAt'];
      if (typeof at === 'string') scoredAt = at;
    }
    return { recordId: d.RecordID === null || d.RecordID === undefined ? '—' : d.RecordID, status: d.Status, score, class: cls, scoredAt };
  }

  /** On-demand run history for the selected model (DB-light — only the selected model, capped). */
  private async loadRuns(modelId: string): Promise<void> {
    this.LoadingRuns = true;
    this.Runs = [];
    this.cdr.detectChanges();
    try {
      this.Runs = await this.Engine.LoadRecentRunsForModel(
        modelId,
        this.ProviderToUse,
        this.ProviderToUse.CurrentUser,
        { sinceDays: 90, maxRows: 50 },
      );
    } finally {
      this.LoadingRuns = false;
      this.cdr.detectChanges();
    }
  }

  // ---- display helpers ----

  /** The icon of a deployment state. */
  public DeployIcon(state: DeployState): string {
    switch (state) {
      case 'unscorable': return 'fa-solid fa-triangle-exclamation';
      case 'bound': return 'fa-solid fa-arrow-right-to-bracket';
      case 'scheduled': return 'fa-solid fa-clock';
      case 'idle': return 'fa-solid fa-circle-pause';
    }
  }

  /** The label of a deployment state. */
  public DeployLabel(state: DeployState): string {
    switch (state) {
      case 'unscorable': return 'Unscorable';
      case 'bound': return 'Bound';
      case 'scheduled': return 'Scheduled';
      case 'idle': return 'Idle';
    }
  }

  /** The badge variant of a deployment state. */
  public DeployBadge(state: DeployState): StatusVariant {
    switch (state) {
      case 'unscorable': return 'amber';
      case 'bound': return 'green';
      case 'scheduled': return 'blue';
      case 'idle': return 'gray';
    }
  }

  /**
   * Opens the selected model's record, whose model detail hosts the Bindings section where its pipeline's scoring
   * bindings are created, edited and withdrawn (D4-48: the editor lives in the forms package, not here).
   */
  public OpenBindings(): void {
    if (!this.SelectedModelId) return;
    this.navigationService.OpenEntityRecord('MJ: ML Models', CompositeKey.FromID(this.SelectedModelId));
  }

  /** The badge variant of a binding mode. */
  public ModeBadge(mode: BindingVM['mode']): StatusVariant {
    return ModeBadgeClass(mode);
  }

  /** The badge variant of a run status. */
  public RunBadge(status: string): StatusVariant {
    const s = (status || '').toLowerCase();
    if (s.includes('complete') || s.includes('success')) return 'green';
    if (s.includes('fail') || s.includes('error')) return 'red';
    if (s.includes('run') || s.includes('progress')) return 'blue';
    return 'gray';
  }

}
