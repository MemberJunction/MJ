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
  selector: 'app-review-status-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Badge mode: single status -->
    <span class="review-indicator badge" *ngIf="mode === 'badge'" [class]="getStatusClass()">
      <i [class]="getStatusIcon()"></i>
      <span class="text" *ngIf="showText">{{ getStatusText() }}</span>
    </span>

    <!-- Count mode: X/Y reviewed -->
    <span class="review-indicator count" *ngIf="mode === 'count'" [class]="getCountClass()">
      <i [class]="getCountIcon()"></i>
      <span class="numbers">{{ reviewedCount }}/{{ totalCount }}</span>
      <span class="label" *ngIf="showLabel">reviewed</span>
    </span>

    <!-- Progress mode: visual bar -->
    <div class="review-indicator progress" *ngIf="mode === 'progress'">
      <div class="progress-bar">
        <div class="progress-fill" [style.width.%]="getPercentage()"></div>
      </div>
      <span class="progress-text">{{ reviewedCount }}/{{ totalCount }}</span>
    </div>
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
      background: #dcfce7;
      color: #166534;
    }

    .review-indicator.badge.needs-review {
      background: #fef3c7;
      color: #92400e;
    }

    .review-indicator.badge.not-reviewed {
      background: #f3f4f6;
      color: #6b7280;
    }

    .review-indicator.badge i {
      font-size: 10px;
    }

    /* Count mode */
    .review-indicator.count {
      font-weight: 500;
    }

    .review-indicator.count.complete {
      color: #22c55e;
    }

    .review-indicator.count.partial {
      color: #f59e0b;
    }

    .review-indicator.count.none {
      color: #9ca3af;
    }

    .review-indicator.count i {
      font-size: 11px;
    }

    .review-indicator.count .numbers {
      font-weight: 700;
    }

    .review-indicator.count .label {
      font-weight: 400;
      color: #64748b;
    }

    /* Progress mode */
    .review-indicator.progress {
      gap: 8px;
    }

    .progress-bar {
      width: 60px;
      height: 6px;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 11px;
      font-weight: 600;
      color: #475569;
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
