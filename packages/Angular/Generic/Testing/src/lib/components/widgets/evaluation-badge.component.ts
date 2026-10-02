import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { EvaluationPreferences, TestRunWithFeedback, GetQualityColor } from '../../models/evaluation.types';

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
  @Input() ExecutionStatus: string = 'Completed';

  /** @deprecated Use {@link ExecutionStatus}. */
  @Input() set executionStatus(value: string) {
    this.ExecutionStatus = value;
  }
  /** @deprecated Use {@link ExecutionStatus}. */
  get executionStatus(): string {
    return this.ExecutionStatus;
  }
  @Input() OriginalStatus: string = 'Passed';

  /** @deprecated Use {@link OriginalStatus}. */
  @Input() set originalStatus(value: string) {
    this.OriginalStatus = value;
  }
  /** @deprecated Use {@link OriginalStatus}. */
  get originalStatus(): string {
    return this.OriginalStatus;
  }
  @Input() AutoScore: number | null = null;

  /** @deprecated Use {@link AutoScore}. */
  @Input() set autoScore(value: number | null) {
    this.AutoScore = value;
  }
  /** @deprecated Use {@link AutoScore}. */
  get autoScore(): number | null {
    return this.AutoScore;
  }
  @Input() PassedChecks: number | null = null;

  /** @deprecated Use {@link PassedChecks}. */
  @Input() set passedChecks(value: number | null) {
    this.PassedChecks = value;
  }
  /** @deprecated Use {@link PassedChecks}. */
  get passedChecks(): number | null {
    return this.PassedChecks;
  }
  @Input() FailedChecks: number | null = null;

  /** @deprecated Use {@link FailedChecks}. */
  @Input() set failedChecks(value: number | null) {
    this.FailedChecks = value;
  }
  /** @deprecated Use {@link FailedChecks}. */
  get failedChecks(): number | null {
    return this.FailedChecks;
  }
  @Input() TotalChecks: number | null = null;

  /** @deprecated Use {@link TotalChecks}. */
  @Input() set totalChecks(value: number | null) {
    this.TotalChecks = value;
  }
  /** @deprecated Use {@link TotalChecks}. */
  get totalChecks(): number | null {
    return this.TotalChecks;
  }
  @Input() HumanRating: number | null = null;

  /** @deprecated Use {@link HumanRating}. */
  @Input() set humanRating(value: number | null) {
    this.HumanRating = value;
  }
  /** @deprecated Use {@link HumanRating}. */
  get humanRating(): number | null {
    return this.HumanRating;
  }
  @Input() HumanIsCorrect: boolean | null = null;

  /** @deprecated Use {@link HumanIsCorrect}. */
  @Input() set humanIsCorrect(value: boolean | null) {
    this.HumanIsCorrect = value;
  }
  /** @deprecated Use {@link HumanIsCorrect}. */
  get humanIsCorrect(): boolean | null {
    return this.HumanIsCorrect;
  }
  @Input() HasHumanFeedback: boolean = false;

  /** @deprecated Use {@link HasHumanFeedback}. */
  @Input() set hasHumanFeedback(value: boolean) {
    this.HasHumanFeedback = value;
  }
  /** @deprecated Use {@link HasHumanFeedback}. */
  get hasHumanFeedback(): boolean {
    return this.HasHumanFeedback;
  }
  @Input() Preferences: EvaluationPreferences | null = null;

  /** @deprecated Use {@link Preferences}. */
  @Input() set preferences(value: EvaluationPreferences | null) {
    this.Preferences = value;
  }
  /** @deprecated Use {@link Preferences}. */
  get preferences(): EvaluationPreferences | null {
    return this.Preferences;
  }
  @Input() Mode: EvaluationBadgeMode = 'compact';

  /** @deprecated Use {@link Mode}. */
  @Input() set mode(value: EvaluationBadgeMode) {
    this.Mode = value;
  }
  /** @deprecated Use {@link Mode}. */
  get mode(): EvaluationBadgeMode {
    return this.Mode;
  }

  GetExecIcon(): string {
    switch (this.ExecutionStatus) {
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

  /** @deprecated Use {@link GetExecIcon}. */
  getExecIcon(): string {
    return this.GetExecIcon();
  }

  GetExecClass(): string {
    switch (this.ExecutionStatus) {
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

  /** @deprecated Use {@link GetExecClass}. */
  getExecClass(): string {
    return this.GetExecClass();
  }

  GetExecText(): string {
    return this.OriginalStatus || this.ExecutionStatus;
  }

  /** @deprecated Use {@link GetExecText}. */
  getExecText(): string {
    return this.GetExecText();
  }

  GetHumanClass(): string {
    if (this.HumanRating == null) return '';
    if (this.HumanRating >= 8) return 'success';
    if (this.HumanRating >= 5) return 'warning';
    return 'danger';
  }

  /** @deprecated Use {@link GetHumanClass}. */
  getHumanClass(): string {
    return this.GetHumanClass();
  }

  GetAutoClass(): string {
    if (this.AutoScore == null) return '';
    if (this.AutoScore >= 0.8) return 'high';
    if (this.AutoScore >= 0.5) return '';
    return 'low';
  }

  /** @deprecated Use {@link GetAutoClass}. */
  getAutoClass(): string {
    return this.GetAutoClass();
  }

  FormatAutoScore(): string {
    if (this.AutoScore == null) return '—';
    return `${Math.round(this.AutoScore * 100)}%`;
  }

  /** @deprecated Use {@link FormatAutoScore}. */
  formatAutoScore(): string {
    return this.FormatAutoScore();
  }

  GetRatingStars(): string {
    if (this.HumanRating == null) return '';
    const filled = Math.round(this.HumanRating / 2);
    const empty = 5 - filled;
    return '★'.repeat(filled) + '☆'.repeat(empty);
  }

  /** @deprecated Use {@link GetRatingStars}. */
  getRatingStars(): string {
    return this.GetRatingStars();
  }

  GetQualityColorClass(): string {
    if (!this.Preferences) return 'neutral';

    const run: TestRunWithFeedback = {
      id: '',
      testId: '',
      testName: '',
      executionStatus: this.ExecutionStatus as TestRunWithFeedback['executionStatus'],
      originalStatus: this.OriginalStatus,
      duration: 0,
      cost: 0,
      runDateTime: new Date(),
      autoScore: this.AutoScore,
      passedChecks: this.PassedChecks,
      failedChecks: this.FailedChecks,
      totalChecks: this.TotalChecks,
      humanRating: this.HumanRating,
      humanIsCorrect: this.HumanIsCorrect,
      humanComments: null,
      hasHumanFeedback: this.HasHumanFeedback,
      feedbackId: null,
      tags: [],
      targetType: null,
      targetLogID: null
    };

    return GetQualityColor(run, this.Preferences);
  }

  /** @deprecated Use {@link GetQualityColorClass}. */
  getQualityColorClass(): string {
    return this.GetQualityColorClass();
  }

  GetPrimaryValue(): string {
    // Priority: Human > Auto > Execution
    if (this.Preferences?.showHuman && this.HasHumanFeedback && this.HumanRating != null) {
      return `${this.HumanRating}/10`;
    }
    if (this.Preferences?.showAuto && this.AutoScore != null) {
      return this.FormatAutoScore();
    }
    if (this.Preferences?.showExecution) {
      return this.OriginalStatus;
    }
    return '—';
  }

  /** @deprecated Use {@link GetPrimaryValue}. */
  getPrimaryValue(): string {
    return this.GetPrimaryValue();
  }
}
