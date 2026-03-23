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
  standalone: false,
  selector: 'app-evaluation-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Compact mode: inline icons and values -->
    @if (mode === 'compact') {
      <div class="eval-badge compact">
        <!-- Execution status -->
        @if (preferences?.showExecution) {
          <span class="eval-item exec" [class]="getExecClass()">
            <i [class]="getExecIcon()"></i>
          </span>
        }
        <!-- Human rating -->
        @if (preferences?.showHuman && hasHumanFeedback && humanRating != null) {
          <span class="eval-item human">
            <i class="fa-solid fa-user"></i>
            <span class="value">{{ humanRating }}</span>
            @if (humanIsCorrect === true) {
              <i class="fa-solid fa-check correctness-icon"></i>
            }
            @if (humanIsCorrect === false) {
              <i class="fa-solid fa-xmark correctness-icon incorrect"></i>
            }
          </span>
        }
        <!-- Human pending indicator -->
        @if (preferences?.showHuman && !hasHumanFeedback) {
          <span class="eval-item human pending" title="Needs review">
            <i class="fa-solid fa-user-clock"></i>
          </span>
        }
        <!-- Auto score -->
        @if (preferences?.showAuto && autoScore != null) {
          <span class="eval-item auto" [class]="getAutoClass()">
            <i class="fa-solid fa-robot"></i>
            <span class="value">{{ formatAutoScore() }}</span>
          </span>
        }
      </div>
    }
    
    <!-- Expanded mode: stacked with labels -->
    @if (mode === 'expanded') {
      <div class="eval-badge expanded">
        <!-- Execution status -->
        @if (preferences?.showExecution) {
          <div class="eval-row">
            <span class="label">Status</span>
            <span class="value-wrap" [class]="getExecClass()">
              <i [class]="getExecIcon()"></i>
              <span class="text">{{ getExecText() }}</span>
            </span>
          </div>
        }
        <!-- Human rating -->
        @if (preferences?.showHuman) {
          <div class="eval-row">
            <span class="label">Human</span>
            @if (hasHumanFeedback && humanRating != null) {
              <span class="value-wrap" [class]="getHumanClass()">
                <span class="rating-stars">{{ getRatingStars() }}</span>
                <span class="rating-num">{{ humanRating }}/10</span>
                @if (humanIsCorrect === true) {
                  <span class="correctness"><i class="fa-solid fa-check"></i> Correct</span>
                }
                @if (humanIsCorrect === false) {
                  <span class="correctness incorrect"><i class="fa-solid fa-xmark"></i> Incorrect</span>
                }
              </span>
            }
            @if (!hasHumanFeedback) {
              <span class="value-wrap pending">
                <i class="fa-solid fa-clock"></i>
                <span class="text">Needs review</span>
              </span>
            }
          </div>
        }
        <!-- Auto score -->
        @if (preferences?.showAuto) {
          <div class="eval-row">
            <span class="label">Auto</span>
            @if (autoScore != null) {
              <span class="value-wrap" [class]="getAutoClass()">
                <div class="score-bar">
                  <div class="score-fill" [style.width.%]="(autoScore || 0) * 100"></div>
                </div>
                <span class="score-text">{{ formatAutoScore() }}</span>
                @if (totalChecks) {
                  <span class="checks">{{ passedChecks }}/{{ totalChecks }} checks</span>
                }
              </span>
            }
            @if (autoScore == null) {
              <span class="value-wrap na">
                <span class="text">Not evaluated</span>
              </span>
            }
          </div>
        }
      </div>
    }
    
    <!-- Inline mode: single primary value -->
    @if (mode === 'inline') {
      <span class="eval-badge inline" [class]="getQualityColorClass()">
        {{ getPrimaryValue() }}
      </span>
    }
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

    .eval-item.exec.success { color: var(--mj-status-success); }
    .eval-item.exec.error { color: var(--mj-status-error); }
    .eval-item.exec.timeout { color: var(--mj-status-warning); }
    .eval-item.exec.running { color: var(--mj-brand-primary); }
    .eval-item.exec.pending { color: var(--mj-text-disabled); }
    .eval-item.exec.skipped { color: var(--mj-text-disabled); }

    .eval-item.human {
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      border: 1px solid var(--mj-status-warning);
      color: var(--mj-text-secondary);
    }

    .eval-item.human.pending {
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-strong);
      color: var(--mj-text-muted);
    }

    .eval-item.human .value {
      font-weight: 700;
    }

    .correctness-icon {
      font-size: 10px;
      margin-left: 2px;
    }

    .correctness-icon.incorrect {
      color: var(--mj-status-error);
    }

    .eval-item.auto {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      border: 1px solid var(--mj-brand-primary);
      color: var(--mj-brand-primary-hover);
    }

    .eval-item.auto.high {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      border: 1px solid var(--mj-status-success);
      color: var(--mj-status-success);
    }

    .eval-item.auto.low {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border: 1px solid var(--mj-status-error);
      color: var(--mj-status-error);
    }

    .eval-item.auto .value {
      font-weight: 700;
    }

    /* Expanded mode */
    .eval-badge.expanded {
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      border: 1px solid var(--mj-border-default);
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
      color: var(--mj-text-muted);
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

    .eval-row .value-wrap.success { color: var(--mj-status-success); }
    .eval-row .value-wrap.error { color: var(--mj-status-error); }
    .eval-row .value-wrap.timeout { color: var(--mj-status-warning); }
    .eval-row .value-wrap.running { color: var(--mj-brand-primary); }
    .eval-row .value-wrap.pending { color: var(--mj-text-disabled); }
    .eval-row .value-wrap.na { color: var(--mj-text-disabled); }

    .eval-row .text {
      font-weight: 500;
    }

    .rating-stars {
      font-size: 10px;
      letter-spacing: 1px;
    }

    .rating-num {
      font-weight: 700;
      color: var(--mj-text-secondary);
    }

    .correctness {
      font-size: 11px;
      color: var(--mj-status-success);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .correctness.incorrect {
      color: var(--mj-status-error);
    }

    .score-bar {
      width: 60px;
      height: 6px;
      background: var(--mj-border-default);
      border-radius: 3px;
      overflow: hidden;
    }

    .score-fill {
      height: 100%;
      background: var(--mj-brand-primary);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .score-text {
      font-weight: 700;
      color: var(--mj-brand-primary-hover);
    }

    .checks {
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    /* Inline mode */
    .eval-badge.inline {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .eval-badge.inline.success {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }

    .eval-badge.inline.warning {
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      color: var(--mj-text-secondary);
    }

    .eval-badge.inline.danger {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      color: var(--mj-status-error);
    }

    .eval-badge.inline.neutral {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-muted);
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
