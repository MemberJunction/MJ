import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { EvaluationPreferences, TestRunWithFeedback, getQualityColor } from '../../models/evaluation.types';

/**
 * Display mode for the evaluation badge
 */
export type EvaluationBadgeMode = 'compact' | 'expanded' | 'inline';

/**
 * Evaluation badge component that displays test run evaluation data
 * based on user preferences (execution, human, auto).
 *
 * Usage:
 * ```html
 * <app-evaluation-badge
 *   [executionStatus]="'Completed'"
 *   [originalStatus]="'Passed'"
 *   [autoScore]="0.85"
 *   [humanRating]="8"
 *   [humanIsCorrect]="true"
 *   [hasHumanFeedback]="true"
 *   [preferences]="evalPrefs"
 *   [mode]="'compact'"
 * ></app-evaluation-badge>
 * ```
 */
@Component({
  selector: 'app-evaluation-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Compact mode: inline icons and values -->
    <div class="eval-badge compact" *ngIf="mode === 'compact'">
      <!-- Execution status -->
      <span class="eval-item exec" *ngIf="preferences?.showExecution" [class]="getExecClass()">
        <i [class]="getExecIcon()"></i>
      </span>

      <!-- Human rating -->
      <span class="eval-item human" *ngIf="preferences?.showHuman && hasHumanFeedback && humanRating != null">
        <i class="fa-solid fa-user"></i>
        <span class="value">{{ humanRating }}</span>
        <i class="fa-solid fa-check correctness-icon" *ngIf="humanIsCorrect === true"></i>
        <i class="fa-solid fa-xmark correctness-icon incorrect" *ngIf="humanIsCorrect === false"></i>
      </span>

      <!-- Human pending indicator -->
      <span class="eval-item human pending" *ngIf="preferences?.showHuman && !hasHumanFeedback" title="Needs review">
        <i class="fa-solid fa-user-clock"></i>
      </span>

      <!-- Auto score -->
      <span class="eval-item auto" *ngIf="preferences?.showAuto && autoScore != null" [class]="getAutoClass()">
        <i class="fa-solid fa-robot"></i>
        <span class="value">{{ formatAutoScore() }}</span>
      </span>
    </div>

    <!-- Expanded mode: stacked with labels -->
    <div class="eval-badge expanded" *ngIf="mode === 'expanded'">
      <!-- Execution status -->
      <div class="eval-row" *ngIf="preferences?.showExecution">
        <span class="label">Status</span>
        <span class="value-wrap" [class]="getExecClass()">
          <i [class]="getExecIcon()"></i>
          <span class="text">{{ getExecText() }}</span>
        </span>
      </div>

      <!-- Human rating -->
      <div class="eval-row" *ngIf="preferences?.showHuman">
        <span class="label">Human</span>
        <span class="value-wrap" *ngIf="hasHumanFeedback && humanRating != null" [class]="getHumanClass()">
          <span class="rating-stars">{{ getRatingStars() }}</span>
          <span class="rating-num">{{ humanRating }}/10</span>
          <span class="correctness" *ngIf="humanIsCorrect === true"><i class="fa-solid fa-check"></i> Correct</span>
          <span class="correctness incorrect" *ngIf="humanIsCorrect === false"><i class="fa-solid fa-xmark"></i> Incorrect</span>
        </span>
        <span class="value-wrap pending" *ngIf="!hasHumanFeedback">
          <i class="fa-solid fa-clock"></i>
          <span class="text">Needs review</span>
        </span>
      </div>

      <!-- Auto score -->
      <div class="eval-row" *ngIf="preferences?.showAuto">
        <span class="label">Auto</span>
        <span class="value-wrap" *ngIf="autoScore != null" [class]="getAutoClass()">
          <div class="score-bar">
            <div class="score-fill" [style.width.%]="(autoScore || 0) * 100"></div>
          </div>
          <span class="score-text">{{ formatAutoScore() }}</span>
          <span class="checks" *ngIf="totalChecks">{{ passedChecks }}/{{ totalChecks }} checks</span>
        </span>
        <span class="value-wrap na" *ngIf="autoScore == null">
          <span class="text">Not evaluated</span>
        </span>
      </div>
    </div>

    <!-- Inline mode: single primary value -->
    <span class="eval-badge inline" *ngIf="mode === 'inline'" [class]="getQualityColorClass()">
      {{ getPrimaryValue() }}
    </span>
  `,
  styles: [`
    .eval-badge {
      display: inline-flex;
      align-items: center;
      font-size: 12px;
    }

    /* Compact mode */
    .eval-badge.compact {
      gap: 8px;
    }

    .eval-item {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }

    .eval-item.exec {
      font-size: 11px;
    }

    .eval-item.exec.success { color: #22c55e; }
    .eval-item.exec.error { color: #ef4444; }
    .eval-item.exec.timeout { color: #f97316; }
    .eval-item.exec.running { color: #3b82f6; }
    .eval-item.exec.pending { color: #9ca3af; }
    .eval-item.exec.skipped { color: #a1a1aa; }

    .eval-item.human {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border: 1px solid #f59e0b;
      color: #92400e;
    }

    .eval-item.human.pending {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      color: #6b7280;
    }

    .eval-item.human .value {
      font-weight: 700;
    }

    .correctness-icon {
      font-size: 10px;
      margin-left: 2px;
    }

    .correctness-icon.incorrect {
      color: #ef4444;
    }

    .eval-item.auto {
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
      border: 1px solid #93c5fd;
      color: #1d4ed8;
    }

    .eval-item.auto.high {
      background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
      border: 1px solid #86efac;
      color: #166534;
    }

    .eval-item.auto.low {
      background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
      border: 1px solid #fca5a5;
      color: #991b1b;
    }

    .eval-item.auto .value {
      font-weight: 700;
    }

    /* Expanded mode */
    .eval-badge.expanded {
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .eval-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    .eval-row .label {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      width: 70px;
      flex-shrink: 0;
    }

    .eval-row .value-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .eval-row .value-wrap.success { color: #22c55e; }
    .eval-row .value-wrap.error { color: #ef4444; }
    .eval-row .value-wrap.timeout { color: #f97316; }
    .eval-row .value-wrap.running { color: #3b82f6; }
    .eval-row .value-wrap.pending { color: #9ca3af; }
    .eval-row .value-wrap.na { color: #9ca3af; }

    .eval-row .text {
      font-weight: 500;
    }

    .rating-stars {
      font-size: 10px;
      letter-spacing: 1px;
    }

    .rating-num {
      font-weight: 700;
      color: #92400e;
    }

    .correctness {
      font-size: 11px;
      color: #22c55e;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .correctness.incorrect {
      color: #ef4444;
    }

    .score-bar {
      width: 60px;
      height: 6px;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
    }

    .score-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #22c55e 100%);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .score-text {
      font-weight: 700;
      color: #1d4ed8;
    }

    .checks {
      font-size: 11px;
      color: #64748b;
    }

    /* Inline mode */
    .eval-badge.inline {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .eval-badge.inline.success {
      background: #dcfce7;
      color: #166534;
    }

    .eval-badge.inline.warning {
      background: #fef3c7;
      color: #92400e;
    }

    .eval-badge.inline.danger {
      background: #fee2e2;
      color: #991b1b;
    }

    .eval-badge.inline.neutral {
      background: #f3f4f6;
      color: #6b7280;
    }
  `]
})
export class EvaluationBadgeComponent {
  @Input() executionStatus: string = 'Completed';
  @Input() originalStatus: string = 'Passed';
  @Input() autoScore: number | null = null;
  @Input() passedChecks: number | null = null;
  @Input() failedChecks: number | null = null;
  @Input() totalChecks: number | null = null;
  @Input() humanRating: number | null = null;
  @Input() humanIsCorrect: boolean | null = null;
  @Input() hasHumanFeedback: boolean = false;
  @Input() preferences: EvaluationPreferences | null = null;
  @Input() mode: EvaluationBadgeMode = 'compact';

  getExecIcon(): string {
    switch (this.executionStatus) {
      case 'Completed':
      case 'Passed':
        return 'fa-solid fa-circle-check';
      case 'Failed':
        return 'fa-solid fa-circle-xmark';
      case 'Error':
        return 'fa-solid fa-triangle-exclamation';
      case 'Timeout':
        return 'fa-solid fa-clock';
      case 'Running':
        return 'fa-solid fa-spinner fa-spin';
      case 'Pending':
        return 'fa-solid fa-circle-dot';
      case 'Skipped':
        return 'fa-solid fa-forward';
      default:
        return 'fa-solid fa-circle-question';
    }
  }

  getExecClass(): string {
    switch (this.executionStatus) {
      case 'Completed':
      case 'Passed':
        return 'success';
      case 'Failed':
        return 'error';
      case 'Error':
        return 'error';
      case 'Timeout':
        return 'timeout';
      case 'Running':
        return 'running';
      case 'Pending':
        return 'pending';
      case 'Skipped':
        return 'skipped';
      default:
        return 'pending';
    }
  }

  getExecText(): string {
    return this.originalStatus || this.executionStatus;
  }

  getHumanClass(): string {
    if (this.humanRating == null) return '';
    if (this.humanRating >= 8) return 'success';
    if (this.humanRating >= 5) return 'warning';
    return 'danger';
  }

  getAutoClass(): string {
    if (this.autoScore == null) return '';
    if (this.autoScore >= 0.8) return 'high';
    if (this.autoScore >= 0.5) return '';
    return 'low';
  }

  formatAutoScore(): string {
    if (this.autoScore == null) return '—';
    return `${Math.round(this.autoScore * 100)}%`;
  }

  getRatingStars(): string {
    if (this.humanRating == null) return '';
    const filled = Math.round(this.humanRating / 2);
    const empty = 5 - filled;
    return '★'.repeat(filled) + '☆'.repeat(empty);
  }

  getQualityColorClass(): string {
    if (!this.preferences) return 'neutral';

    const run: TestRunWithFeedback = {
      id: '',
      testId: '',
      testName: '',
      executionStatus: this.executionStatus as TestRunWithFeedback['executionStatus'],
      originalStatus: this.originalStatus,
      duration: 0,
      cost: 0,
      runDateTime: new Date(),
      autoScore: this.autoScore,
      passedChecks: this.passedChecks,
      failedChecks: this.failedChecks,
      totalChecks: this.totalChecks,
      humanRating: this.humanRating,
      humanIsCorrect: this.humanIsCorrect,
      humanComments: null,
      hasHumanFeedback: this.hasHumanFeedback,
      feedbackId: null,
      tags: [],
      targetType: null,
      targetLogID: null
    };

    return getQualityColor(run, this.preferences);
  }

  getPrimaryValue(): string {
    // Priority: Human > Auto > Execution
    if (this.preferences?.showHuman && this.hasHumanFeedback && this.humanRating != null) {
      return `${this.humanRating}/10`;
    }
    if (this.preferences?.showAuto && this.autoScore != null) {
      return this.formatAutoScore();
    }
    if (this.preferences?.showExecution) {
      return this.originalStatus;
    }
    return '—';
  }
}
