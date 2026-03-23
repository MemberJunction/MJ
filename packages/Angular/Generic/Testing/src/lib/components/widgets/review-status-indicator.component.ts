import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * Review status for a test run or set of runs
 */
export type ReviewStatus = 'reviewed' | 'needs-review' | 'not-reviewed';

/**
 * Indicator showing the review/feedback status of a test run.
 *
 * Usage:
 * ```html
 * <app-review-status-indicator
 *   [hasReview]="true"
 *   [reviewedCount]="5"
 *   [totalCount]="10"
 *   [mode]="'badge'"
 * ></app-review-status-indicator>
 * ```
 */
@Component({
  standalone: false,
  selector: 'app-review-status-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Badge mode: single status -->
    @if (mode === 'badge') {
      <span class="review-indicator badge" [class]="getStatusClass()">
        <i [class]="getStatusIcon()"></i>
        @if (showText) {
          <span class="text">{{ getStatusText() }}</span>
        }
      </span>
    }
    
    <!-- Count mode: X/Y reviewed -->
    @if (mode === 'count') {
      <span class="review-indicator count" [class]="getCountClass()">
        <i [class]="getCountIcon()"></i>
        <span class="numbers">{{ reviewedCount }}/{{ totalCount }}</span>
        @if (showLabel) {
          <span class="label">reviewed</span>
        }
      </span>
    }
    
    <!-- Progress mode: visual bar -->
    @if (mode === 'progress') {
      <div class="review-indicator progress">
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="getPercentage()"></div>
        </div>
        <span class="progress-text">{{ reviewedCount }}/{{ totalCount }}</span>
      </div>
    }
    `,
  styles: [`
    .review-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }

    /* Badge mode */
    .review-indicator.badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 500;
    }

    .review-indicator.badge.reviewed {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }

    .review-indicator.badge.needs-review {
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      color: var(--mj-text-secondary);
    }

    .review-indicator.badge.not-reviewed {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-muted);
    }

    .review-indicator.badge i {
      font-size: 10px;
    }

    /* Count mode */
    .review-indicator.count {
      font-weight: 500;
    }

    .review-indicator.count.complete {
      color: var(--mj-status-success);
    }

    .review-indicator.count.partial {
      color: var(--mj-status-warning);
    }

    .review-indicator.count.none {
      color: var(--mj-text-disabled);
    }

    .review-indicator.count i {
      font-size: 11px;
    }

    .review-indicator.count .numbers {
      font-weight: 700;
    }

    .review-indicator.count .label {
      font-weight: 400;
      color: var(--mj-text-muted);
    }

    /* Progress mode */
    .review-indicator.progress {
      gap: 8px;
    }

    .progress-bar {
      width: 60px;
      height: 6px;
      background: var(--mj-border-default);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--mj-status-success);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 11px;
      font-weight: 600;
      color: var(--mj-text-secondary);
    }
  `]
})
export class ReviewStatusIndicatorComponent {
  /** Whether this single item has been reviewed */
  @Input() hasReview: boolean = false;

  /** Count of reviewed items (for aggregate display) */
  @Input() reviewedCount: number = 0;

  /** Total count of items (for aggregate display) */
  @Input() totalCount: number = 0;

  /** Display mode */
  @Input() mode: 'badge' | 'count' | 'progress' = 'badge';

  /** Whether to show text label in badge mode */
  @Input() showText: boolean = true;

  /** Whether to show "reviewed" label in count mode */
  @Input() showLabel: boolean = false;

  getStatusClass(): string {
    if (this.hasReview) return 'reviewed';
    return 'not-reviewed';
  }

  getStatusIcon(): string {
    if (this.hasReview) return 'fa-solid fa-clipboard-check';
    return 'fa-solid fa-clipboard-question';
  }

  getStatusText(): string {
    if (this.hasReview) return 'Reviewed';
    return 'Needs Review';
  }

  getCountClass(): string {
    if (this.totalCount === 0) return 'none';
    if (this.reviewedCount >= this.totalCount) return 'complete';
    if (this.reviewedCount > 0) return 'partial';
    return 'none';
  }

  getCountIcon(): string {
    if (this.totalCount === 0) return 'fa-solid fa-minus';
    if (this.reviewedCount >= this.totalCount) return 'fa-solid fa-check-circle';
    if (this.reviewedCount > 0) return 'fa-solid fa-clock';
    return 'fa-solid fa-clipboard';
  }

  getPercentage(): number {
    if (this.totalCount === 0) return 0;
    return (this.reviewedCount / this.totalCount) * 100;
  }
}
