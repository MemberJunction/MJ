import { ChangeDetectorRef, Component, Input, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  MJExperimentSessionEntity,
  PredictiveStudioControlExperimentSessionOperation,
  PredictiveStudioExperimentSessionAction,
} from '@memberjunction/core-entities';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSIterationCard, PSLeaderboardEntry } from '../predictive-studio.types';
import {
  PSKanbanColumns,
  deriveLeaderboard,
  groupIterationsToKanban,
} from '../predictive-studio.view-models';
import { PSConfirmModalComponent } from './ps-confirm-modal.component';

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
  imports: [CommonModule, MJButtonDirective, PSConfirmModalComponent],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-experiments.component.scss'],
  template: `
    <div class="ps-panel ps-experiments" data-testid="ps-experiments-panel">
      @if (!session) {
        <div class="ps-empty" data-testid="ps-experiments-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-flask"></i></span>
          <h3>No experiment sessions yet</h3>
          <p>Launch an experiment to watch the Model Dev Agent search algorithms and feature sets in waves. Running and completed iterations will appear here with a live leaderboard.</p>
        </div>
      } @else {
        <!-- session header strip -->
        <div class="sess-head">
          <div>
            <div class="ps-small ps-muted">Experiment session</div>
            <h2>{{ session.Name }} <span class="ps-badge" [class]="sessionBadgeClass"><span class="ps-dot" [style.background]="sessionDotColor"></span> {{ session.Status }}</span></h2>
          </div>
          <span class="ps-spacer"></span>
          <span class="ps-small ps-muted">{{ iterationCountLabel }}</span>
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
            <div class="kcol-head"><i class="fa-solid fa-spinner"></i><h3>Running</h3><span class="cnt">{{ kanban.running.length }}</span></div>
            <div class="kbody">
              @for (c of kanban.running; track c.iteration) {
                <ng-container [ngTemplateOutlet]="iterCard" [ngTemplateOutletContext]="{ c: c }"></ng-container>
              }
              @if (kanban.running.length === 0) { <span class="ps-small ps-muted">No running iterations.</span> }
            </div>
          </div>
          <div class="kcol done" data-testid="ps-kanban-col-completed">
            <div class="kcol-head"><i class="fa-solid fa-circle-check"></i><h3>Completed</h3><span class="cnt">{{ kanban.completed.length }}</span></div>
            <div class="kbody">
              @for (c of kanban.completed; track c.iteration) {
                <ng-container [ngTemplateOutlet]="iterCard" [ngTemplateOutletContext]="{ c: c }"></ng-container>
              }
              @if (kanban.completed.length === 0) { <span class="ps-small ps-muted">No completed iterations.</span> }
            </div>
          </div>
          <div class="kcol prune" data-testid="ps-kanban-col-pruned">
            <div class="kcol-head"><i class="fa-solid fa-scissors"></i><h3>Pruned</h3><span class="cnt">{{ kanban.pruned.length }}</span></div>
            <div class="kbody">
              @for (c of kanban.pruned; track c.iteration) {
                <ng-container [ngTemplateOutlet]="iterCard" [ngTemplateOutletContext]="{ c: c }"></ng-container>
              }
              @if (kanban.pruned.length === 0) { <span class="ps-small ps-muted">Nothing pruned.</span> }
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
                <div class="ps-bar run"><span [style.width.%]="c.progress"></span></div>
                <div class="meta"><span class="ps-muted ps-small">{{ c.progressDetail }}</span></div>
              </div>
            } @else {
              <div class="ic-score">
                <span class="v" [class.green]="c.status === 'Best'">{{ c.score | number: '1.3-3' }}</span>
                <span class="lbl ps-muted ps-small">score · {{ c.scoreDelta }}</span>
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
    </div>
  `,
})
export class PSExperimentsComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  /** Provider to route the control Remote Op + engine refresh through (multi-provider correctness). */
  @Input() provider: IMetadataProvider | null = null;
  /** Acting user for the engine refresh after a mutation. */
  @Input() currentUser: UserInfo | null = null;

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  /** The currently-displayed session ID (first Running, else most recent). */
  public sessionId = '';
  public kanban: PSKanbanColumns = { running: [], completed: [], pruned: [] };
  public leaderboard: PSLeaderboardEntry[] = [];
  public budget: BudgetGaugeVM[] = [];

  /** Pending control action awaiting confirmation (null when no modal is open). */
  public pendingAction: PredictiveStudioExperimentSessionAction | null = null;
  /** Remote Op in flight. */
  public busy = false;

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

  public get session(): MJExperimentSessionEntity | undefined {
    return this.engine?.Sessions.find((s) => s.ID === this.sessionId);
  }

  public get iterationCountLabel(): string {
    const total = this.kanban.running.length + this.kanban.completed.length + this.kanban.pruned.length;
    return `${total} iteration${total === 1 ? '' : 's'}`;
  }

  // ---- derivations ----

  private rebuild(): void {
    if (!this.sessionId) {
      this.kanban = { running: [], completed: [], pruned: [] };
      this.leaderboard = [];
      this.budget = [];
      return;
    }
    const rows = this.engine.IterationRowsForSession(this.sessionId);
    this.kanban = groupIterationsToKanban(rows);
    this.leaderboard = deriveLeaderboard(rows);
    this.budget = this.buildBudget(rows);
  }

  /** Build the budget gauges from the session's budget JSON caps + actual iteration spend. */
  private buildBudget(rows: { ComputeCost: number | null }[]): BudgetGaugeVM[] {
    const session = this.session;
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

  public get sessionBadgeClass(): string {
    switch (this.session?.Status) {
      case 'Running': return 'green';
      case 'Paused': return 'amber';
      case 'Cancelled': return 'red';
      case 'Completed': return 'blue';
      default: return 'gray';
    }
  }
  public get sessionDotColor(): string {
    switch (this.session?.Status) {
      case 'Running': return 'var(--mj-status-success)';
      case 'Paused': return 'var(--mj-status-warning)';
      case 'Cancelled': return 'var(--mj-status-error)';
      default: return 'var(--mj-text-muted)';
    }
  }

  public statusBadgeClass(status: PSIterationCard['status']): string {
    switch (status) {
      case 'Best': return 'green';
      case 'Completed': return 'gray';
      case 'AwaitingApproval': return 'amber';
      case 'Pruned': return 'red';
      case 'Running': return 'blue';
    }
  }

  public statusLabel(status: PSIterationCard['status']): string {
    switch (status) {
      case 'Best': return 'Best';
      case 'AwaitingApproval': return 'Awaiting approval';
      default: return status;
    }
  }

  // ---- control availability ----

  public get canPause(): boolean {
    return this.session?.Status === 'Running';
  }
  public get canResume(): boolean {
    return this.session?.Status === 'Paused';
  }
  public get canCancel(): boolean {
    const s = this.session?.Status;
    return s === 'Running' || s === 'Paused' || s === 'AwaitingApproval';
  }

  // ---- control flow (Remote Op) ----

  public requestControl(action: PredictiveStudioExperimentSessionAction): void {
    if (!this.session) return;
    this.pendingAction = action;
  }

  public cancelControl(): void {
    if (this.busy) return;
    this.pendingAction = null;
  }

  public get pendingTitle(): string {
    switch (this.pendingAction) {
      case 'pause': return 'Pause experiment';
      case 'resume': return 'Resume experiment';
      case 'cancel': return 'Cancel experiment';
      default: return '';
    }
  }
  public get pendingIcon(): string {
    switch (this.pendingAction) {
      case 'pause': return 'fa-solid fa-pause';
      case 'resume': return 'fa-solid fa-play';
      case 'cancel': return 'fa-solid fa-stop';
      default: return 'fa-solid fa-check';
    }
  }
  public get pendingConfirmLabel(): string {
    switch (this.pendingAction) {
      case 'pause': return 'Pause';
      case 'resume': return 'Resume';
      case 'cancel': return 'Cancel run';
      default: return 'Confirm';
    }
  }
  public get pendingMessage(): string {
    const name = escapeHtml(this.session?.Name ?? 'this session');
    switch (this.pendingAction) {
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

  /** Run the control Remote Op, then refresh the engine + close on success. */
  public async confirmControl(): Promise<void> {
    if (!this.pendingAction || !this.session || this.busy) return;
    this.busy = true;
    const action = this.pendingAction;
    const sessionId = this.session.ID;
    const name = this.session.Name;
    try {
      const op = new PredictiveStudioControlExperimentSessionOperation();
      const result = await op.Execute(
        { sessionId, action },
        { provider: this.provider ?? undefined, user: this.currentUser ?? undefined },
      );
      if (result.Success) {
        this.notifications.CreateSimpleNotification(
          `${name} → ${result.Output?.status ?? action}`,
          'success',
          3500,
        );
        await this.refreshAfterMutation();
        this.pendingAction = null;
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
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  /** Force-refresh the engine's cached sessions/iterations, then rebuild. */
  private async refreshAfterMutation(): Promise<void> {
    await this.engine.Config(true, this.currentUser ?? undefined, this.provider ?? undefined);
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
