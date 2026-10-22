import { ChangeDetectorRef, Component, Input, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';
import { Metadata, RunView, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  MJArtifactEntity,
  MJArtifactVersionEntity,
  MJExperimentSessionEntity,
  PredictiveStudioControlExperimentSessionOperation,
  PredictiveStudioExperimentSessionAction,
} from '@memberjunction/core-entities';
import { type ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSIterationCard, PSLeaderboardEntry } from '../predictive-studio.types';
import {
  PSKanbanColumns,
  DeriveLeaderboard,
  GroupIterationsToKanban,
} from '../predictive-studio.view-models';
import { PSConfirmModalComponent } from './ps-confirm-modal.component';
import { PSRunExperimentModalComponent } from './ps-run-experiment-modal.component';

/** A budget gauge derived from the session's budget JSON + actual iteration spend. */
interface BudgetGaugeVM {
  label: string;
  fillPct: number;
  centerText: string;
  value: string;
  cap: string;
  color: string;
}

/**
 * Experiments panel: a kanban of iteration cards in Running / Completed / Pruned columns, a leaderboard
 * strip ranked by score, and budget gauges — all live against `MJ: Experiment Sessions` + their
 * `MJ: Experiment Session Iterations`:
 *
 * - The **active session** is the first Running session, else the most-recently-created one.
 * - The **kanban** + **leaderboard** are derived from that session's iterations (grouped by status,
 *   ranked by score) via the pure {@link groupIterationsToKanban} / {@link deriveLeaderboard} helpers.
 * - **Budget gauges** combine the session's budget JSON caps with actual iteration spend (compute
 *   cost, iteration count).
 * - **Pause / Cancel** call the {@link PredictiveStudioControlExperimentSessionOperation} Remote Op
 *   behind a confirmation; on success the engine refreshes.
 *
 * Empty state when there are no sessions. 100% entity-agnostic.
 */
@Component({
  standalone: true,
  selector: 'ps-experiments',
  imports: [CommonModule, MJButtonDirective, PSConfirmModalComponent, PSRunExperimentModalComponent, ArtifactsModule],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-experiments.component.css'],
  template: `
    <div class="ps-panel ps-experiments" data-testid="ps-experiments-panel">
      @if (!session) {
        <div class="ps-empty" data-testid="ps-experiments-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-flask"></i></span>
          <h3>No experiment sessions yet</h3>
          <p>Launch an experiment to watch the Model Dev Agent search algorithms and feature sets in waves, or configure a manual multi-algorithm tournament.</p>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button mjButton variant="primary" size="sm" data-testid="ps-experiments-new-btn-empty" (click)="openNewExperimentModal()">
              <i class="fa-solid fa-flask"></i> New Experiment
            </button>
          </div>
        </div>
      } @else {
        <!-- session header strip -->
        <div class="sess-head">
          <div>
            <div class="ps-small ps-muted" style="display: flex; align-items: center; gap: 8px;">
              <span>Experiment session</span>
              @if (sessions.length > 1) {
                <span class="ps-muted">· Switch:</span>
                <select class="mj-input" style="padding: 2px 6px; font-size: 12px; height: 26px;"
                  [value]="sessionId" (change)="selectSession($any($event.target).value)">
                  @for (s of sessions; track s.ID) {
                    <option [value]="s.ID">{{ s.Name }} ({{ s.Status }})</option>
                  }
                </select>
              }
            </div>
            <h2>{{ session.Name }} <span class="ps-badge" [class]="sessionBadgeClass"><span class="ps-dot" [style.background]="sessionDotColor"></span> {{ session.Status }}</span></h2>
          </div>
          <span class="ps-spacer"></span>
          <span class="ps-small ps-muted">{{ iterationCountLabel }}</span>
          <button mjButton variant="secondary" size="sm" data-testid="ps-experiments-view-artifact" [disabled]="artifactLoading" (click)="viewResultsArtifact()">
            <i class="fa-solid fa-flask-vial"></i> {{ artifactLoading ? 'Loading…' : 'View Results Artifact' }}
          </button>
          <button mjButton variant="primary" size="sm" data-testid="ps-experiments-new-btn" (click)="openNewExperimentModal()">
            <i class="fa-solid fa-plus"></i> New Experiment
          </button>
          @if (canPause) {
            <button mjButton variant="secondary" size="sm" data-testid="ps-experiments-pause" (click)="requestControl('pause')"><i class="fa-solid fa-pause"></i> Pause</button>
          }
          @if (canResume) {
            <button mjButton variant="secondary" size="sm" data-testid="ps-experiments-resume" (click)="requestControl('resume')"><i class="fa-solid fa-play"></i> Resume</button>
          }
          @if (canCancel) {
            <button mjButton variant="danger" size="sm" data-testid="ps-experiments-cancel" (click)="requestControl('cancel')"><i class="fa-solid fa-stop"></i> Cancel</button>
          }
        </div>

        <!-- Leaderboard strip -->
        <div class="ps-card" data-testid="ps-experiments-leaderboard">
          <div class="ps-card-body lead-strip">
            <div class="lead-lbl">
              <div class="t"><i class="fa-solid fa-trophy" style="color:var(--mj-status-warning)"></i> Leaderboard</div>
              <div class="ps-small ps-muted">{{ leaderboard.length }} scored · by metric</div>
            </div>
            @if (leaderboard.length === 0) {
              <span class="ps-small ps-muted">No scored iterations yet.</span>
            }
            @for (lp of leaderboard; track lp.rank) {
              <div class="lp" [class.best]="lp.best" [class.pruned]="lp.pruned">
                <span class="ps-rank" [class.gold]="lp.best">{{ lp.rank }}</span>
                <span class="algo-ic" [style.background]="lp.algorithmColor"><i [class]="lp.algorithmIcon"></i></span>
                <div><div class="nm">{{ lp.algorithm }}</div><div class="fs ps-muted ps-small">{{ lp.features }}</div></div>
                <span class="auc" [class.win]="lp.best">{{ lp.auc | number: '1.3-3' }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Budget rail -->
        @if (budget.length > 0) {
          <div class="ps-card">
            <div class="ps-card-body budget-rail">
              @for (b of budget; track b.label) {
                <div class="bud">
                  <div class="ps-gauge" [style.--ps-p]="b.fillPct" [style.--ps-gauge-color]="b.color">
                    <span class="g-val">{{ b.centerText }}</span>
                  </div>
                  <div style="flex:1">
                    <div class="ps-section-title">{{ b.label }}</div>
                    <div class="b-val"><strong>{{ b.value }}</strong> <span class="ps-muted ps-small">/ {{ b.cap }}</span></div>
                    <div class="ps-bar" style="margin-top:6px;max-width:150px"><span [style.width.%]="b.fillPct" [style.background]="b.color"></span></div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Kanban -->
        <div class="kanban" data-testid="ps-experiments-kanban">
          <div class="kcol run" data-testid="ps-kanban-col-running">
            <div class="kcol-head"><i class="fa-solid fa-spinner"></i><h3>Running</h3><span class="cnt">{{ kanban.Running.length }}</span></div>
            <div class="kbody">
              @for (c of kanban.Running; track c.Iteration) {
                <ng-container [ngTemplateOutlet]="iterCard" [ngTemplateOutletContext]="{ c: c }"></ng-container>
              }
              @if (kanban.Running.length === 0) { <span class="ps-small ps-muted">No running iterations.</span> }
            </div>
          </div>
          <div class="kcol done" data-testid="ps-kanban-col-completed">
            <div class="kcol-head"><i class="fa-solid fa-circle-check"></i><h3>Completed</h3><span class="cnt">{{ kanban.Completed.length }}</span></div>
            <div class="kbody">
              @for (c of kanban.Completed; track c.Iteration) {
                <ng-container [ngTemplateOutlet]="iterCard" [ngTemplateOutletContext]="{ c: c }"></ng-container>
              }
              @if (kanban.Completed.length === 0) { <span class="ps-small ps-muted">No completed iterations.</span> }
            </div>
          </div>
          <div class="kcol prune" data-testid="ps-kanban-col-pruned">
            <div class="kcol-head"><i class="fa-solid fa-scissors"></i><h3>Pruned</h3><span class="cnt">{{ kanban.Pruned.length }}</span></div>
            <div class="kbody">
              @for (c of kanban.Pruned; track c.Iteration) {
                <ng-container [ngTemplateOutlet]="iterCard" [ngTemplateOutletContext]="{ c: c }"></ng-container>
              }
              @if (kanban.Pruned.length === 0) { <span class="ps-small ps-muted">Nothing pruned.</span> }
            </div>
          </div>
        </div>

        <ng-template #iterCard let-c="c">
          <div class="icard" [class.best]="c.status === 'Best'" [class.running]="c.status === 'Running'" [class.pruned]="c.status === 'Pruned'">
            <div class="ic-top">
              <span class="algo-ic" [style.background]="c.algorithmColor"><i [class]="c.algorithmIcon"></i></span>
              <div><div class="nm">{{ c.algorithm }}</div><div class="it ps-muted ps-small">{{ c.iteration }}</div></div>
              <span class="ps-spacer"></span>
              <span class="ps-badge" [class]="statusBadgeClass(c.status)">{{ statusLabel(c.status) }}</span>
            </div>
            <div class="feat-chips">
              @for (f of c.features; track f) { <span class="ps-tag">{{ f }}</span> }
            </div>
            @if (c.status === 'Running') {
              <div class="ic-prog">
                <div class="ps-bar run"><span [style.width.%]="c.Progress"></span></div>
                <div class="meta"><span class="ps-muted ps-small">{{ c.ProgressDetail }}</span></div>
              </div>
            } @else {
              <div class="ic-score">
                <span class="v" [class.green]="c.status === 'Best'">{{ c.score | number: '1.3-3' }}</span>
                <span class="lbl ps-muted ps-small">score · {{ c.ScoreDelta }}</span>
              </div>
            }
            <div class="rationale"><i class="fa-solid fa-robot"></i><span class="ps-small">{{ c.rationale }}</span></div>
          </div>
        </ng-template>
      }

      @if (pendingAction) {
        <ps-confirm-modal
          [title]="pendingTitle"
          [icon]="pendingIcon"
          [confirmIcon]="pendingIcon"
          [confirmLabel]="pendingConfirmLabel"
          [variant]="pendingAction === 'cancel' ? 'danger' : 'warn'"
          [busy]="busy"
          (confirmed)="confirmControl()"
          (cancelled)="cancelControl()">
          <div [innerHTML]="pendingMessage"></div>
        </ps-confirm-modal>
      }

      @if (showArtifactModal && activeArtifactId) {
        <div class="ps-modal-backdrop" (click)="closeArtifactModal()">
          <div class="ps-modal-dialog" style="max-width: 960px; width: 92vw; height: 85vh; display: flex; flex-direction: column; padding: 0; overflow: hidden;"
            (click)="$event.stopPropagation()">
            <div style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
              <mj-artifact-viewer-panel
                [artifactId]="activeArtifactId"
                [currentUser]="currentUser!"
                [showCloseButton]="true"
                (closed)="closeArtifactModal()">
              </mj-artifact-viewer-panel>
            </div>
          </div>
        </div>
      }

      @if (showNewExperimentModal) {
        <ps-run-experiment-modal
          [engine]="engine"
          [provider]="provider"
          [currentUser]="currentUser"
          (started)="onExperimentStarted($event)"
          (closed)="closeNewExperimentModal()">
        </ps-run-experiment-modal>
      }
    </div>
  `,
})
export class PSExperimentsComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  /** Provider to route the control Remote Op + engine refresh through (multi-provider correctness). */
  @Input() provider: IMetadataProvider | null = null;
  /** Acting user for the engine refresh after a mutation. */
  @Input() CurrentUser: UserInfo | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo | null) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo | null {
    return this.CurrentUser;
  }

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  /** The currently-displayed session ID (first Running, else most recent). */
  public sessionId = '';
  public Kanban: PSKanbanColumns = { Running: [], Completed: [], Pruned: [] };

  /** @deprecated Use {@link Kanban}. */
  public get kanban(): PSKanbanColumns {
    return this.Kanban;
  }
  /** @deprecated Use {@link Kanban}. */
  public set kanban(value: PSKanbanColumns) {
    this.Kanban = value;
  }
  public Leaderboard: PSLeaderboardEntry[] = [];

  /** @deprecated Use {@link Leaderboard}. */
  public get leaderboard(): PSLeaderboardEntry[] {
    return this.Leaderboard;
  }
  /** @deprecated Use {@link Leaderboard}. */
  public set leaderboard(value: PSLeaderboardEntry[]) {
    this.Leaderboard = value;
  }
  public Budget: BudgetGaugeVM[] = [];

  /** @deprecated Use {@link Budget}. */
  public get budget(): BudgetGaugeVM[] {
    return this.Budget;
  }
  /** @deprecated Use {@link Budget}. */
  public set budget(value: BudgetGaugeVM[]) {
    this.Budget = value;
  }

  /** Pending control action awaiting confirmation (null when no modal is open). */
  public PendingAction: PredictiveStudioExperimentSessionAction | null = null;

  /** @deprecated Use {@link PendingAction}. */
  public get pendingAction(): PredictiveStudioExperimentSessionAction | null {
    return this.PendingAction;
  }
  /** @deprecated Use {@link PendingAction}. */
  public set pendingAction(value: PredictiveStudioExperimentSessionAction | null) {
    this.PendingAction = value;
  }
  /** Remote Op in flight. */
  public Busy = false;

  /** @deprecated Use {@link Busy}. */
  public get busy() {
    return this.Busy;
  }
  /** @deprecated Use {@link Busy}. */
  public set busy(value) {
    this.Busy = value;
  }

  public ShowNewExperimentModal = false;

  /** @deprecated Use {@link ShowNewExperimentModal}. */
  public get showNewExperimentModal() {
    return this.ShowNewExperimentModal;
  }
  /** @deprecated Use {@link ShowNewExperimentModal}. */
  public set showNewExperimentModal(value) {
    this.ShowNewExperimentModal = value;
  }
  public ShowArtifactModal = false;

  /** @deprecated Use {@link ShowArtifactModal}. */
  public get showArtifactModal() {
    return this.ShowArtifactModal;
  }
  /** @deprecated Use {@link ShowArtifactModal}. */
  public set showArtifactModal(value) {
    this.ShowArtifactModal = value;
  }
  public ActiveArtifactId: string | null = null;

  /** @deprecated Use {@link ActiveArtifactId}. */
  public get activeArtifactId(): string | null {
    return this.ActiveArtifactId;
  }
  /** @deprecated Use {@link ActiveArtifactId}. */
  public set activeArtifactId(value: string | null) {
    this.ActiveArtifactId = value;
  }
  public ArtifactLoading = false;

  /** @deprecated Use {@link ArtifactLoading}. */
  public get artifactLoading() {
    return this.ArtifactLoading;
  }
  /** @deprecated Use {@link ArtifactLoading}. */
  public set artifactLoading(value) {
    this.ArtifactLoading = value;
  }

  public get Sessions(): MJExperimentSessionEntity[] {
    return this.engine?.Sessions ?? [];
  }

  /** @deprecated Use {@link Sessions}. */
  public get sessions(): MJExperimentSessionEntity[] {
    return this.Sessions;
  }

  public SelectSession(id: string): void {
    this.sessionId = id;
    this.rebuild();
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link SelectSession}. */
  public selectSession(id: string): void {
    return this.SelectSession(id);
  }

  public OpenNewExperimentModal(): void {
    this.ShowNewExperimentModal = true;
  }

  /** @deprecated Use {@link OpenNewExperimentModal}. */
  public openNewExperimentModal(): void {
    return this.OpenNewExperimentModal();
  }

  public CloseNewExperimentModal(): void {
    this.ShowNewExperimentModal = false;
  }

  /** @deprecated Use {@link CloseNewExperimentModal}. */
  public closeNewExperimentModal(): void {
    return this.CloseNewExperimentModal();
  }

  public async OnExperimentStarted(newSessionId: string): Promise<void> {
    this.CloseNewExperimentModal();
    await this.engine.Config(true, this.currentUser ?? undefined, this.provider ?? undefined);
    this.sessionId = newSessionId;
    this.rebuild();
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnExperimentStarted}. */
  public async onExperimentStarted(newSessionId: string): Promise<void> {
    return this.OnExperimentStarted(newSessionId);
  }

  public CloseArtifactModal(): void {
    this.ShowArtifactModal = false;
    this.ActiveArtifactId = null;
  }

  /** @deprecated Use {@link CloseArtifactModal}. */
  public closeArtifactModal(): void {
    return this.CloseArtifactModal();
  }

  public async ViewResultsArtifact(): Promise<void> {
    const s = this.session;
    if (!s || this.ArtifactLoading) return;

    this.ArtifactLoading = true;
    try {
      const p = this.provider ?? Metadata.Provider;
      const rv = new RunView();
      const res = await rv.RunView<MJArtifactEntity>({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `Name LIKE '${s.Name}%' OR Comments LIKE '%${s.ID}%'`,
        ResultType: 'entity_object',
      }, this.currentUser ?? undefined);

      if (res.Success && res.Results && res.Results.length > 0) {
        this.ActiveArtifactId = res.Results[0].ID;
        this.ShowArtifactModal = true;
        return;
      }

      const art = await p.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.currentUser ?? undefined);
      art.Name = `${s.Name} — Results`;
      art.Description = `Modeling results, leaderboard, and winning model metrics for ${s.Name}.`;
      art.TypeID = 'D41AB707-58F1-4413-8725-9DF31C95F4C5';
      art.Comments = `Auto-generated for Experiment Session ${s.ID}`;
      const saved = await art.Save();
      if (!saved) {
        this.notifications.CreateSimpleNotification('Could not generate artifact record.', 'error', 5000);
        return;
      }

      const ver = await p.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.currentUser ?? undefined);
      ver.ArtifactID = art.ID;
      ver.VersionNumber = 1;
      ver.Comments = 'Initial results artifact';

      const planSpec = this.parsePlanSpec(s.PlanSpec);
      const winningRow = this.leaderboard[0];
      const winningIteration = winningRow
        ? this.engine.IterationsForSession(s.ID).find((it) => this.engine.AlgorithmForIteration(it.ID) === winningRow.algorithm && it.Score === winningRow.auc)
        : undefined;
      const winningRun = winningIteration ? this.engine.TrainingRuns.find((r) => UUIDsEqual(r.ExperimentSessionIterationID, winningIteration.ID)) : undefined;
      const winningModelId = winningRun?.ResultingModelID ?? undefined;

      const payload = {
        Name: s.Name,
        Goal: s.Goal || planSpec?.Goal || 'Predictive modeling experiment',
        TargetMetric: planSpec?.TargetDefinition?.SuccessMetric || 'Score',
        Summary: `Experiment session completed with ${this.leaderboard.length} iterations. Winning algorithm: ${winningRow?.algorithm ?? 'None'}.`,
        Leaderboard: this.leaderboard.map((lb) => ({
          rank: lb.rank,
          algorithm: lb.algorithm,
          algorithmName: lb.algorithm,
          featureSet: lb.features,
          score: lb.auc,
          isWinner: lb.best,
        })),
        BestModelID: winningModelId,
        BestModel: winningModelId && winningRow ? { ID: winningModelId, Name: winningRow.algorithm } : undefined,
        Markdown: `## Experiment Session: ${s.Name}\n\n**Status:** ${s.Status}\n**Goal:** ${s.Goal || 'N/A'}\n\n### Leaderboard\n\nRanked by metric:\n` +
          this.leaderboard.map(l => `- **#${l.rank} ${l.algorithm}**: Score ${l.auc.toFixed(3)} (${l.features})`).join('\n'),
      };

      ver.Content = JSON.stringify(payload);
      await ver.Save();

      this.ActiveArtifactId = art.ID;
      this.ShowArtifactModal = true;
    } catch (e) {
      this.notifications.CreateSimpleNotification(`Error: ${e instanceof Error ? e.message : String(e)}`, 'error', 5000);
    } finally {
      this.ArtifactLoading = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link ViewResultsArtifact}. */
  public async viewResultsArtifact(): Promise<void> {
    return this.ViewResultsArtifact();
  }

  private parsePlanSpec(raw: string | null): ModelingPlanSpec | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ModelingPlanSpec;
    } catch {
      return null;
    }
  }

  ngOnInit(): void {
    this.selectActiveSession();
    this.rebuild();
  }

  // ---- active session selection ----

  /** Pick the most relevant session to display: first Running, else the most-recently-created. */
  private selectActiveSession(): void {
    const sessions = this.engine?.Sessions ?? [];
    const running = sessions.find((s) => s.Status === 'Running');
    // Sessions are loaded OrderBy '__mj_CreatedAt DESC', so index 0 is the most recent.
    this.sessionId = (running ?? sessions[0])?.ID ?? '';
  }

  public get Session(): MJExperimentSessionEntity | undefined {
    return this.engine?.Sessions.find((s) => UUIDsEqual(s.ID, this.sessionId));
  }

  /** @deprecated Use {@link Session}. */
  public get session(): MJExperimentSessionEntity | undefined {
    return this.Session;
  }

  public get IterationCountLabel(): string {
    const total = this.Kanban.Running.length + this.Kanban.Completed.length + this.Kanban.Pruned.length;
    return `${total} iteration${total === 1 ? '' : 's'}`;
  }

  /** @deprecated Use {@link IterationCountLabel}. */
  public get iterationCountLabel(): string {
    return this.IterationCountLabel;
  }

  // ---- derivations ----

  private rebuild(): void {
    if (!this.sessionId) {
      this.Kanban = { Running: [], Completed: [], Pruned: [] };
      this.Leaderboard = [];
      this.Budget = [];
      return;
    }
    const rows = this.engine.IterationRowsForSession(this.sessionId);
    this.Kanban = GroupIterationsToKanban(rows);
    this.Leaderboard = DeriveLeaderboard(rows);
    this.Budget = this.buildBudget(rows);
  }

  /** Build the budget gauges from the session's budget JSON caps + actual iteration spend. */
  private buildBudget(rows: { ComputeCost: number | null }[]): BudgetGaugeVM[] {
    const session = this.Session;
    if (!session) return [];
    const budgetJson = this.parseBudget(session.Budget);
    const gauges: BudgetGaugeVM[] = [];

    const spentCost = rows.reduce((sum, r) => sum + (r.ComputeCost ?? 0), 0);
    const maxCost = budgetJson.maxComputeCost;
    if (maxCost != null && maxCost > 0) {
      gauges.push(this.gauge('Compute cost', spentCost, maxCost, 'var(--ps-gauge-cost)', (v) => `$${v.toFixed(0)}`, `$${maxCost.toFixed(0)} cap`));
    }

    const iterations = rows.length;
    const maxIterations = budgetJson.maxIterations;
    if (maxIterations != null && maxIterations > 0) {
      gauges.push(this.gauge('Iterations', iterations, maxIterations, 'var(--ps-gauge-iterations)', (v) => `${v}`, `${maxIterations} trials`));
    }
    return gauges;
  }

  /** Construct a single gauge VM (fill clamped to 0..100). */
  private gauge(label: string, value: number, cap: number, color: string, fmt: (v: number) => string, capLabel: string): BudgetGaugeVM {
    const fillPct = Math.max(0, Math.min(100, Math.round((value / cap) * 100)));
    return { label, fillPct, centerText: `${fillPct}%`, value: fmt(value), cap: capLabel, color };
  }

  /** Tolerant parse of the session's budget JSON (accepts a few common key spellings). */
  private parseBudget(json: string | null): { maxComputeCost: number | null; maxIterations: number | null } {
    if (!json) return { maxComputeCost: null, maxIterations: null };
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const num = (...keys: string[]): number | null => {
        for (const k of keys) {
          const v = parsed[k];
          if (typeof v === 'number' && Number.isFinite(v)) return v;
        }
        return null;
      };
      return {
        maxComputeCost: num('maxComputeCost', 'maxCost', 'computeBudget'),
        maxIterations: num('maxIterations', 'maxTrials', 'iterationBudget'),
      };
    } catch {
      return { maxComputeCost: null, maxIterations: null };
    }
  }

  // ---- session status chrome ----

  public get SessionBadgeClass(): string {
    switch (this.Session?.Status) {
      case 'Running': return 'green';
      case 'Paused': return 'amber';
      case 'Cancelled': return 'red';
      case 'Completed': return 'blue';
      default: return 'gray';
    }
  }

  /** @deprecated Use {@link SessionBadgeClass}. */
  public get sessionBadgeClass(): string {
    return this.SessionBadgeClass;
  }
  public get SessionDotColor(): string {
    switch (this.Session?.Status) {
      case 'Running': return 'var(--mj-status-success)';
      case 'Paused': return 'var(--mj-status-warning)';
      case 'Cancelled': return 'var(--mj-status-error)';
      default: return 'var(--mj-text-muted)';
    }
  }

  /** @deprecated Use {@link SessionDotColor}. */
  public get sessionDotColor(): string {
    return this.SessionDotColor;
  }

  public StatusBadgeClass(status: PSIterationCard['Status']): string {
    switch (status) {
      case 'Best': return 'green';
      case 'Completed': return 'gray';
      case 'AwaitingApproval': return 'amber';
      case 'Pruned': return 'red';
      case 'Running': return 'blue';
    }
  }

  /** @deprecated Use {@link StatusBadgeClass}. */
  public statusBadgeClass(status: PSIterationCard['Status']): string {
    return this.StatusBadgeClass(status);
  }

  public StatusLabel(status: PSIterationCard['Status']): string {
    switch (status) {
      case 'Best': return 'Best';
      case 'AwaitingApproval': return 'Awaiting approval';
      default: return status;
    }
  }

  /** @deprecated Use {@link StatusLabel}. */
  public statusLabel(status: PSIterationCard['Status']): string {
    return this.StatusLabel(status);
  }

  // ---- control availability ----

  public get CanPause(): boolean {
    return this.Session?.Status === 'Running';
  }

  /** @deprecated Use {@link CanPause}. */
  public get canPause(): boolean {
    return this.CanPause;
  }
  public get CanResume(): boolean {
    return this.Session?.Status === 'Paused';
  }

  /** @deprecated Use {@link CanResume}. */
  public get canResume(): boolean {
    return this.CanResume;
  }
  public get CanCancel(): boolean {
    const s = this.Session?.Status;
    return s === 'Running' || s === 'Paused' || s === 'AwaitingApproval';
  }

  /** @deprecated Use {@link CanCancel}. */
  public get canCancel(): boolean {
    return this.CanCancel;
  }

  // ---- control flow (Remote Op) ----

  public RequestControl(action: PredictiveStudioExperimentSessionAction): void {
    if (!this.Session) return;
    this.PendingAction = action;
  }

  /** @deprecated Use {@link RequestControl}. */
  public requestControl(action: PredictiveStudioExperimentSessionAction): void {
    return this.RequestControl(action);
  }

  public CancelControl(): void {
    if (this.Busy) return;
    this.PendingAction = null;
  }

  /** @deprecated Use {@link CancelControl}. */
  public cancelControl(): void {
    return this.CancelControl();
  }

  public get PendingTitle(): string {
    switch (this.PendingAction) {
      case 'pause': return 'Pause experiment';
      case 'resume': return 'Resume experiment';
      case 'cancel': return 'Cancel experiment';
      default: return '';
    }
  }

  /** @deprecated Use {@link PendingTitle}. */
  public get pendingTitle(): string {
    return this.PendingTitle;
  }
  public get PendingIcon(): string {
    switch (this.PendingAction) {
      case 'pause': return 'fa-solid fa-pause';
      case 'resume': return 'fa-solid fa-play';
      case 'cancel': return 'fa-solid fa-stop';
      default: return 'fa-solid fa-check';
    }
  }

  /** @deprecated Use {@link PendingIcon}. */
  public get pendingIcon(): string {
    return this.PendingIcon;
  }
  public get PendingConfirmLabel(): string {
    switch (this.PendingAction) {
      case 'pause': return 'Pause';
      case 'resume': return 'Resume';
      case 'cancel': return 'Cancel run';
      default: return 'Confirm';
    }
  }

  /** @deprecated Use {@link PendingConfirmLabel}. */
  public get pendingConfirmLabel(): string {
    return this.PendingConfirmLabel;
  }
  public get PendingMessage(): string {
    const name = escapeHtml(this.Session?.Name ?? 'this session');
    switch (this.PendingAction) {
      case 'pause':
        return `Pause <strong>${name}</strong>? The orchestrator stops at the next wave checkpoint; in-flight iterations finish. You can resume later.`;
      case 'resume':
        return `Resume <strong>${name}</strong>? The orchestrator continues searching from where it paused.`;
      case 'cancel':
        return `Cancel <strong>${name}</strong>? This stops the search at the next checkpoint. Completed iterations and the leaderboard are kept, but the session cannot be resumed.`;
      default:
        return '';
    }
  }

  /** @deprecated Use {@link PendingMessage}. */
  public get pendingMessage(): string {
    return this.PendingMessage;
  }

  /** Run the control Remote Op, then refresh the engine + close on success. */
  public async ConfirmControl(): Promise<void> {
    if (!this.PendingAction || !this.Session || this.Busy) return;
    this.Busy = true;
    const action = this.PendingAction;
    const sessionId = this.Session.ID;
    const name = this.Session.Name;
    try {
      const op = new PredictiveStudioControlExperimentSessionOperation();
      const result = await op.Execute(
        { sessionId, action },
        { provider: this.provider ?? undefined, user: this.CurrentUser ?? undefined },
      );
      if (result.Success) {
        this.notifications.CreateSimpleNotification(
          `${name} → ${result.Output?.status ?? action}`,
          'success',
          3500,
        );
        await this.refreshAfterMutation();
        this.PendingAction = null;
      } else {
        this.notifications.CreateSimpleNotification(
          result.ErrorMessage || `Could not ${action} ${name}.`,
          'error',
          5000,
        );
      }
    } catch (e) {
      this.notifications.CreateSimpleNotification(
        `${action} failed: ${e instanceof Error ? e.message : String(e)}`,
        'error',
        5000,
      );
    } finally {
      this.Busy = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link ConfirmControl}. */
  public async confirmControl(): Promise<void> {
    return this.ConfirmControl();
  }

  /** Force-refresh the engine's cached sessions/iterations, then rebuild. */
  private async refreshAfterMutation(): Promise<void> {
    await this.engine.Config(true, this.CurrentUser ?? undefined, this.provider ?? undefined);
    this.selectActiveSession();
    this.rebuild();
    this.cdr.detectChanges();
  }
}

/** Minimal HTML-escape for interpolating session names into the modal's innerHTML message. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
