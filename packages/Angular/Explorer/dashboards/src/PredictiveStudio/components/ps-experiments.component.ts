import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import {
  PSBudgetGauge, PSIterationCard, PSLeaderboardEntry,
  SAMPLE_BUDGET, SAMPLE_COMPLETED, SAMPLE_LEADERBOARD, SAMPLE_PRUNED, SAMPLE_RUNNING,
} from '../predictive-studio.types';

/**
 * Experiments panel (mockup experiments-2): a kanban of iteration cards in Running / Completed /
 * Pruned columns, a leaderboard strip ranked by holdout AUC, and budget gauges (compute / iterations
 * / wall-clock). Binds to live Experiment Sessions + Iterations when present, otherwise representative
 * samples to convey the full UX.
 */
@Component({
  standalone: true,
  selector: 'ps-experiments',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-experiments.component.scss'],
  template: `
    <div class="ps-panel ps-experiments">
      <!-- session header strip -->
      <div class="sess-head">
        <div>
          <div class="ps-small ps-muted">Experiments · Member Renewal</div>
          <h2>{{ sessionName }} <span class="ps-badge green"><span class="ps-dot" style="background:var(--mj-status-success)"></span> {{ sessionStatus }}</span></h2>
        </div>
        <span class="ps-spacer"></span>
        <span class="ps-small ps-muted">started 38 min ago · driven by <strong>Model Dev Agent</strong></span>
        <button mjButton variant="secondary" size="sm"><i class="fa-solid fa-pause"></i> Pause</button>
        <button mjButton variant="danger" size="sm"><i class="fa-solid fa-stop"></i> Cancel</button>
      </div>

      <!-- Leaderboard strip -->
      <div class="ps-card">
        <div class="ps-card-body lead-strip">
          <div class="lead-lbl">
            <div class="t"><i class="fa-solid fa-trophy" style="color:var(--mj-status-warning)"></i> Leaderboard</div>
            <div class="ps-small ps-muted">{{ leaderboard.length }} evaluated · holdout AUC</div>
          </div>
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

      <!-- Kanban -->
      <div class="kanban">
        <div class="kcol run">
          <div class="kcol-head"><i class="fa-solid fa-spinner"></i><h3>Running</h3><span class="cnt">{{ running.length }}</span></div>
          <div class="kbody">
            @for (c of running; track c.iteration) {
              <ng-container *ngTemplateOutlet="iterCard; context: { c: c }"></ng-container>
            }
          </div>
        </div>
        <div class="kcol done">
          <div class="kcol-head"><i class="fa-solid fa-circle-check"></i><h3>Completed</h3><span class="cnt">{{ completed.length }}</span></div>
          <div class="kbody">
            @for (c of completed; track c.iteration) {
              <ng-container *ngTemplateOutlet="iterCard; context: { c: c }"></ng-container>
            }
          </div>
        </div>
        <div class="kcol prune">
          <div class="kcol-head"><i class="fa-solid fa-scissors"></i><h3>Pruned</h3><span class="cnt">{{ pruned.length }}</span></div>
          <div class="kbody">
            @for (c of pruned; track c.iteration) {
              <ng-container *ngTemplateOutlet="iterCard; context: { c: c }"></ng-container>
            }
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
              <div class="meta"><span class="ps-muted ps-small">{{ c.progressDetail }}</span><span class="ps-mono">{{ c.progress }}%</span></div>
            </div>
          } @else {
            <div class="ic-score">
              <span class="v" [class.green]="c.status === 'Best'">{{ c.score | number: '1.3-3' }}</span>
              <span class="lbl ps-muted ps-small">holdout AUC · {{ c.scoreDelta }}</span>
            </div>
          }
          <div class="rationale"><i class="fa-solid fa-robot"></i><span class="ps-small">{{ c.rationale }}</span></div>
        </div>
      </ng-template>
    </div>
  `,
})
export class PSExperimentsComponent {
  @Input() engine!: PredictiveStudioEngine;

  public get sessionName(): string {
    return this.engine?.Sessions[0]?.Name ?? 'Renewal AUC Search';
  }
  public get sessionStatus(): string {
    return this.engine?.Sessions[0]?.Status ?? 'Running';
  }

  public get leaderboard(): PSLeaderboardEntry[] {
    return SAMPLE_LEADERBOARD;
  }
  public get budget(): PSBudgetGauge[] {
    return SAMPLE_BUDGET;
  }
  public get running(): PSIterationCard[] {
    return SAMPLE_RUNNING;
  }
  public get completed(): PSIterationCard[] {
    return SAMPLE_COMPLETED;
  }
  public get pruned(): PSIterationCard[] {
    return SAMPLE_PRUNED;
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
}
