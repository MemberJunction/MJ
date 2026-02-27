import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  ChangeDetectionStrategy
} from '@angular/core';
import { Subject, Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { takeUntil, map, shareReplay } from 'rxjs/operators';
import {
  TestingInstrumentationService,
  FeedbackPending,
  FeedbackStats,
  TestRunWithFeedbackSummary,
  EvaluationSummaryMetrics
} from '../services/testing-instrumentation.service';

type ViewMode = 'queue' | 'history';
type HistorySort = 'date' | 'rating' | 'test-name';

interface ReviewFormState {
  rating: number | null;
  isCorrect: boolean | null;
  comments: string;
}

@Component({
  standalone: false,
  selector: 'app-testing-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Page Header -->
    <div class="review-page">
      <div class="page-header">
        <div class="header-left">
          <h2>
            <i class="fa-solid fa-clipboard-check"></i>
            Human Review
          </h2>
          @if (PendingCount > 0) {
            <div class="pending-badge">
              <span class="badge-count">{{ PendingCount }}</span>
              <span class="badge-text">pending</span>
            </div>
          }
        </div>
        <button class="refresh-btn" (click)="Refresh()" [disabled]="IsRefreshing">
          <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsRefreshing"></i>
          {{ IsRefreshing ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>

      <!-- KPI Summary Row -->
      @if (Metrics) {
        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-icon orange">
              <i class="fa-solid fa-hourglass-half"></i>
            </div>
            <div class="kpi-content">
              <div class="kpi-value">{{ Metrics.humanPendingCount }}</div>
              <div class="kpi-label">Pending Review</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon green">
              <i class="fa-solid fa-check-circle"></i>
            </div>
            <div class="kpi-content">
              <div class="kpi-value">{{ Metrics.humanReviewedCount }}</div>
              <div class="kpi-label">Reviewed</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon gold">
              <i class="fa-solid fa-star"></i>
            </div>
            <div class="kpi-content">
              <div class="kpi-value">{{ FormatDecimal(Metrics.humanAvgRating, 1) }}<span class="kpi-unit">/10</span></div>
              <div class="kpi-label">Avg Rating</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon blue">
              <i class="fa-solid fa-handshake"></i>
            </div>
            <div class="kpi-content">
              <div class="kpi-value">{{ FormatDecimal(Metrics.agreementRate, 0) }}<span class="kpi-unit">%</span></div>
              <div class="kpi-label">Agreement Rate</div>
            </div>
          </div>
        </div>
      }

      <!-- View Mode Toggle -->
      <div class="view-toggle-bar">
        <div class="toggle-group">
          <button class="toggle-btn" [class.active]="CurrentView === 'queue'" (click)="SetView('queue')">
            <i class="fa-solid fa-list-check"></i>
            Review Queue
          </button>
          <button class="toggle-btn" [class.active]="CurrentView === 'history'" (click)="SetView('history')">
            <i class="fa-solid fa-clock-rotate-left"></i>
            History
          </button>
        </div>
      </div>

      <!-- Review Queue View -->
      @if (CurrentView === 'queue') {
        <div class="content-card">
          @if (PendingItems.length === 0) {
            <div class="empty-state">
              <i class="fa-solid fa-circle-check"></i>
              <h3>All caught up!</h3>
              <p>No tests currently require human review.</p>
            </div>
          } @else {
            <div class="queue-list">
              @for (item of PendingItems; track item.testRunID) {
                <div class="queue-item" [class.expanded]="ExpandedItemId === item.testRunID">
                  <div class="queue-item-header" (click)="ToggleExpand(item.testRunID)">
                    <div class="item-info">
                      <div class="item-name">{{ item.testName }}</div>
                      <div class="item-meta">
                        <span class="meta-time">
                          <i class="fa-solid fa-clock"></i>
                          {{ FormatRelativeTime(item.runDateTime) }}
                        </span>
                        <app-score-indicator [score]="item.automatedScore" [showBar]="true"></app-score-indicator>
                        <app-test-status-badge [status]="$any(item.automatedStatus)"></app-test-status-badge>
                      </div>
                    </div>
                    <div class="item-actions-area">
                      <span class="reason-badge" [class]="'reason-' + item.reason">
                        @if (item.reason === 'no-feedback') {
                          <i class="fa-solid fa-comment-slash"></i> No Feedback
                        } @else if (item.reason === 'high-score-failed') {
                          <i class="fa-solid fa-triangle-exclamation"></i> Score Mismatch
                        } @else {
                          <i class="fa-solid fa-circle-question"></i> Needs Verification
                        }
                      </span>
                      <button class="expand-toggle">
                        <i class="fa-solid" [class.fa-chevron-down]="ExpandedItemId !== item.testRunID"
                           [class.fa-chevron-up]="ExpandedItemId === item.testRunID"></i>
                      </button>
                    </div>
                  </div>

                  @if (ExpandedItemId === item.testRunID) {
                    <div class="review-form-panel">
                      <!-- Rating -->
                      <div class="form-section">
                        <label class="form-label">Rating</label>
                        <div class="rating-row">
                          @for (n of RatingNumbers; track n) {
                            <button class="rating-circle"
                                    [class.selected]="FormState.rating != null && n <= FormState.rating"
                                    [class.current]="FormState.rating === n"
                                    (click)="SelectRating(n)">
                              {{ n }}
                            </button>
                          }
                          @if (FormState.rating != null) {
                            <span class="rating-display">{{ FormState.rating }}/10</span>
                          }
                        </div>
                      </div>

                      <!-- Correctness -->
                      <div class="form-section">
                        <label class="form-label">Is the automated result correct?</label>
                        <div class="correctness-row">
                          <button class="correctness-btn correct"
                                  [class.active]="FormState.isCorrect === true"
                                  (click)="SelectCorrectness(true)">
                            <i class="fa-solid fa-check"></i> Correct
                          </button>
                          <button class="correctness-btn incorrect"
                                  [class.active]="FormState.isCorrect === false"
                                  (click)="SelectCorrectness(false)">
                            <i class="fa-solid fa-xmark"></i> Incorrect
                          </button>
                        </div>
                      </div>

                      <!-- Notes -->
                      <div class="form-section">
                        <label class="form-label">Notes (optional)</label>
                        <textarea class="notes-textarea"
                                  rows="3"
                                  placeholder="Add any comments about this evaluation..."
                                  [value]="FormState.comments"
                                  (input)="OnCommentsChange($event)"></textarea>
                      </div>

                      <!-- Actions -->
                      <div class="form-actions">
                        <button class="submit-btn"
                                [disabled]="!IsFormValid || IsSubmitting"
                                (click)="SubmitReview(item)">
                          <i class="fa-solid fa-paper-plane"></i>
                          {{ IsSubmitting ? 'Submitting...' : 'Submit' }}
                        </button>
                        <button class="skip-btn" (click)="SkipItem()">
                          <i class="fa-solid fa-forward"></i> Skip
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- History View -->
      @if (CurrentView === 'history') {
        <div class="content-card">
          <!-- Filter Bar -->
          <div class="history-filters">
            <div class="search-wrapper">
              <i class="fa-solid fa-search"></i>
              <input type="text"
                     placeholder="Search by test name..."
                     [value]="HistorySearchText"
                     (input)="OnHistorySearch($event)" />
            </div>
            <div class="sort-control">
              <label>Sort by:</label>
              <select [value]="HistorySortField" (change)="OnHistorySortChange($event)">
                <option value="date">Date</option>
                <option value="rating">Rating</option>
                <option value="test-name">Test Name</option>
              </select>
            </div>
          </div>

          @if (FilteredHistoryItems.length === 0) {
            <div class="empty-state">
              <i class="fa-solid fa-folder-open"></i>
              <h3>No reviewed items</h3>
              <p>Reviewed tests will appear here once feedback is submitted.</p>
            </div>
          } @else {
            <div class="history-list">
              @for (item of FilteredHistoryItems; track item.id) {
                <div class="history-item">
                  <div class="history-item-main">
                    <div class="history-name">{{ item.testName }}</div>
                    <div class="history-date">
                      <i class="fa-solid fa-calendar"></i>
                      {{ FormatRelativeTime(item.runDateTime) }}
                    </div>
                  </div>
                  <div class="history-rating">
                    <div class="rating-dots">
                      @for (n of RatingNumbers; track n) {
                        <span class="rating-dot" [class.filled]="item.humanRating != null && n <= item.humanRating"></span>
                      }
                    </div>
                    <span class="rating-label">{{ item.humanRating ?? 0 }}/10</span>
                  </div>
                  <div class="history-verdict">
                    @if (item.humanIsCorrect === true) {
                      <span class="verdict correct">
                        <i class="fa-solid fa-check"></i> Correct
                      </span>
                    } @else if (item.humanIsCorrect === false) {
                      <span class="verdict incorrect">
                        <i class="fa-solid fa-xmark"></i> Incorrect
                      </span>
                    }
                  </div>
                  <div class="history-auto-score">
                    <app-score-indicator [score]="item.score" [showBar]="true"></app-score-indicator>
                  </div>
                  @if (item.humanComments) {
                    <div class="history-comments"
                         [class.expanded]="ExpandedHistoryId === item.id"
                         (click)="ToggleHistoryComment(item.id)">
                      <p>{{ item.humanComments }}</p>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Calibration Insights -->
      <div class="calibration-section">
        <h3>
          <i class="fa-solid fa-scale-balanced"></i>
          Human vs Auto Agreement
        </h3>
        <div class="calibration-body">
          <div class="gauge-display">
            <div class="gauge-ring">
              <svg viewBox="0 0 120 120" class="gauge-svg">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" stroke-width="10" />
                <circle cx="60" cy="60" r="52" fill="none"
                        [attr.stroke]="AgreementColor"
                        stroke-width="10"
                        stroke-linecap="round"
                        [attr.stroke-dasharray]="AgreementDash"
                        stroke-dashoffset="0"
                        transform="rotate(-90 60 60)" />
              </svg>
              <div class="gauge-value">{{ FormatDecimal(AgreementRate, 0) }}%</div>
            </div>
          </div>
          <div class="calibration-text">
            <p class="calibration-description">
              Measures how often human reviewers agree with automated evaluation scores.
            </p>
            @if (AgreementRate < 70) {
              <div class="calibration-warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Low agreement may indicate evaluation criteria need refinement.
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .review-page {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-left h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-left h2 i {
      color: #3b82f6;
    }

    .pending-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
      border: 1px solid #fb923c;
      border-radius: 20px;
    }

    .badge-count {
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      color: white;
      min-width: 24px;
      height: 24px;
      padding: 0 6px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }

    .badge-text {
      font-size: 12px;
      font-weight: 600;
      color: #ea580c;
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: white;
      color: #64748b;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .refresh-btn:hover:not(:disabled) {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* KPI Row */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }

    .kpi-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .kpi-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      color: white;
      flex-shrink: 0;
    }

    .kpi-icon.orange { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); }
    .kpi-icon.green { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }
    .kpi-icon.gold { background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%); }
    .kpi-icon.blue { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }

    .kpi-content {
      flex: 1;
      min-width: 0;
    }

    .kpi-value {
      font-size: 26px;
      font-weight: 700;
      color: #1e293b;
      line-height: 1;
      margin-bottom: 4px;
    }

    .kpi-unit {
      font-size: 14px;
      font-weight: 500;
      color: #64748b;
    }

    .kpi-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* View Toggle */
    .view-toggle-bar {
      margin-bottom: 20px;
    }

    .toggle-group {
      display: inline-flex;
      background: white;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      overflow: hidden;
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border: none;
      background: white;
      color: #64748b;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .toggle-btn:hover:not(.active) {
      background: #f8fafc;
    }

    .toggle-btn.active {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
    }

    /* Content Card */
    .content-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      margin-bottom: 20px;
    }

    /* Queue List */
    .queue-list {
      max-height: 600px;
      overflow-y: auto;
    }

    .queue-item {
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.2s ease;
    }

    .queue-item.expanded {
      background: #f8fafc;
    }

    .queue-item:last-child {
      border-bottom: none;
    }

    .queue-item-header {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .queue-item-header:hover {
      background: rgba(59, 130, 246, 0.04);
    }

    .item-info {
      flex: 1;
      min-width: 0;
    }

    .item-name {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-meta {
      display: flex;
      gap: 14px;
      font-size: 12px;
      color: #64748b;
      align-items: center;
      flex-wrap: wrap;
    }

    .meta-time {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .item-actions-area {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .reason-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 11px;
      font-weight: 600;
    }

    .reason-no-feedback {
      background: #dbeafe;
      color: #1e40af;
    }

    .reason-high-score-failed {
      background: #ffedd5;
      color: #c2410c;
    }

    .reason-low-score-passed {
      background: #fef9c3;
      color: #a16207;
    }

    .expand-toggle {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .expand-toggle:hover {
      background: #e2e8f0;
      color: #64748b;
    }

    /* Review Form */
    .review-form-panel {
      padding: 20px 20px 20px 36px;
      border-top: 1px solid #e2e8f0;
      background: white;
    }

    .form-section {
      margin-bottom: 20px;
    }

    .form-section:last-of-type {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }

    /* Rating Circles */
    .rating-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .rating-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid #e2e8f0;
      background: white;
      color: #94a3b8;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .rating-circle:hover {
      border-color: #3b82f6;
      color: #3b82f6;
      transform: scale(1.1);
    }

    .rating-circle.selected {
      background: #3b82f6;
      border-color: #3b82f6;
      color: white;
    }

    .rating-circle.current {
      background: #2563eb;
      border-color: #1d4ed8;
      color: white;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.35);
    }

    .rating-display {
      margin-left: 12px;
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
    }

    /* Correctness Buttons */
    .correctness-row {
      display: flex;
      gap: 12px;
    }

    .correctness-btn {
      flex: 1;
      max-width: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      background: white;
      font-size: 14px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .correctness-btn.correct:hover,
    .correctness-btn.correct.active {
      border-color: #22c55e;
      background: #f0fdf4;
      color: #166534;
    }

    .correctness-btn.incorrect:hover,
    .correctness-btn.incorrect.active {
      border-color: #ef4444;
      background: #fef2f2;
      color: #991b1b;
    }

    /* Notes */
    .notes-textarea {
      width: 100%;
      max-width: 500px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      min-height: 72px;
      box-sizing: border-box;
    }

    .notes-textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    /* Form Actions */
    .form-actions {
      display: flex;
      gap: 12px;
    }

    .submit-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 11px 22px;
      border: none;
      border-radius: 8px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .submit-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }

    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .skip-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 11px 20px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: white;
      color: #64748b;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .skip-btn:hover {
      border-color: #cbd5e1;
      background: #f8fafc;
    }

    /* History Filters */
    .history-filters {
      display: flex;
      gap: 16px;
      padding: 16px 20px;
      border-bottom: 1px solid #f1f5f9;
      align-items: center;
    }

    .search-wrapper {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-wrapper > i {
      position: absolute;
      left: 12px;
      color: #94a3b8;
      font-size: 13px;
    }

    .search-wrapper input {
      width: 100%;
      padding: 10px 12px 10px 36px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 13px;
    }

    .search-wrapper input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .sort-control {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #64748b;
      flex-shrink: 0;
    }

    .sort-control select {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 12px;
      background: white;
    }

    /* History List */
    .history-list {
      max-height: 600px;
      overflow-y: auto;
    }

    .history-item {
      padding: 16px 20px;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .history-item:last-child {
      border-bottom: none;
    }

    .history-item-main {
      flex: 1;
      min-width: 160px;
    }

    .history-name {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 4px;
    }

    .history-date {
      font-size: 12px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .history-rating {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .rating-dots {
      display: flex;
      gap: 3px;
    }

    .rating-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #e2e8f0;
    }

    .rating-dot.filled {
      background: #f59e0b;
    }

    .rating-label {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }

    .history-verdict {
      flex-shrink: 0;
    }

    .verdict {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      border-radius: 14px;
      font-size: 11px;
      font-weight: 600;
    }

    .verdict.correct {
      background: #dcfce7;
      color: #166534;
    }

    .verdict.incorrect {
      background: #fee2e2;
      color: #991b1b;
    }

    .history-auto-score {
      flex-shrink: 0;
    }

    .history-comments {
      width: 100%;
      margin-top: 8px;
      padding: 10px 14px;
      background: #f8fafc;
      border-radius: 8px;
      border-left: 3px solid #3b82f6;
      cursor: pointer;
    }

    .history-comments p {
      margin: 0;
      font-size: 13px;
      color: #475569;
      line-height: 1.5;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .history-comments.expanded p {
      white-space: normal;
    }

    /* Empty State */
    .empty-state {
      padding: 60px 20px;
      text-align: center;
    }

    .empty-state i {
      font-size: 52px;
      margin-bottom: 16px;
      color: #22c55e;
    }

    .empty-state h3 {
      font-size: 18px;
      color: #1e293b;
      margin: 0 0 8px 0;
      font-weight: 600;
    }

    .empty-state p {
      font-size: 14px;
      color: #94a3b8;
      margin: 0;
    }

    /* Calibration Section */
    .calibration-section {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .calibration-section h3 {
      margin: 0 0 20px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .calibration-section h3 i {
      color: #3b82f6;
    }

    .calibration-body {
      display: flex;
      align-items: center;
      gap: 32px;
    }

    .gauge-display {
      flex-shrink: 0;
    }

    .gauge-ring {
      position: relative;
      width: 120px;
      height: 120px;
    }

    .gauge-svg {
      width: 100%;
      height: 100%;
    }

    .gauge-value {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 800;
      color: #1e293b;
    }

    .calibration-text {
      flex: 1;
    }

    .calibration-description {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #64748b;
      line-height: 1.6;
    }

    .calibration-warning {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: #92400e;
    }

    .calibration-warning i {
      color: #d97706;
      font-size: 16px;
      flex-shrink: 0;
    }

    /* Success toast animation */
    .queue-item {
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .kpi-row {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 768px) {
      .review-page {
        padding: 16px;
      }

      .page-header {
        flex-direction: column;
        gap: 16px;
        align-items: flex-start;
      }

      .kpi-row {
        grid-template-columns: 1fr 1fr;
      }

      .kpi-card {
        padding: 16px;
      }

      .kpi-value {
        font-size: 22px;
      }

      .queue-item-header {
        flex-wrap: wrap;
      }

      .item-actions-area {
        width: 100%;
        justify-content: flex-end;
        margin-top: 8px;
      }

      .correctness-row {
        flex-direction: column;
      }

      .correctness-btn {
        max-width: 100%;
      }

      .history-item {
        flex-direction: column;
        align-items: flex-start;
      }

      .calibration-body {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
    }
  `]
})
export class TestingReviewComponent implements OnInit, OnDestroy {
  @Input() initialState: Record<string, unknown> | null = null;
  @Output() stateChange = new EventEmitter<Record<string, unknown>>();

  private destroy$ = new Subject<void>();

  // View state
  CurrentView: ViewMode = 'queue';
  ExpandedItemId: string | null = null;
  ExpandedHistoryId: string | null = null;
  IsRefreshing = false;
  IsSubmitting = false;
  HistorySearchText = '';
  HistorySortField: HistorySort = 'date';

  // Form state for active review
  FormState: ReviewFormState = { rating: null, isCorrect: null, comments: '' };

  // Data
  PendingItems: FeedbackPending[] = [];
  HistoryItems: TestRunWithFeedbackSummary[] = [];
  FilteredHistoryItems: TestRunWithFeedbackSummary[] = [];
  Metrics: EvaluationSummaryMetrics | null = null;
  PendingCount = 0;

  // Constants
  readonly RatingNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.restoreState();
    this.setupSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ------------------------------------------------------------------
  //  Computed properties
  // ------------------------------------------------------------------

  get IsFormValid(): boolean {
    return this.FormState.rating != null && this.FormState.isCorrect != null;
  }

  get AgreementRate(): number {
    return this.Metrics?.agreementRate ?? 0;
  }

  get AgreementColor(): string {
    const rate = this.AgreementRate;
    if (rate >= 80) return '#22c55e';
    if (rate >= 60) return '#eab308';
    return '#ef4444';
  }

  get AgreementDash(): string {
    const circumference = 2 * Math.PI * 52; // r=52
    const filled = (this.AgreementRate / 100) * circumference;
    return `${filled} ${circumference}`;
  }

  // ------------------------------------------------------------------
  //  Setup
  // ------------------------------------------------------------------

  private restoreState(): void {
    if (!this.initialState) return;
    const view = this.initialState['viewMode'] as string | undefined;
    if (view === 'queue' || view === 'history') {
      this.CurrentView = view;
    }
  }

  private setupSubscriptions(): void {
    this.instrumentationService.pendingFeedback$
      .pipe(takeUntil(this.destroy$))
      .subscribe(items => {
        this.PendingItems = items;
        this.PendingCount = items.length;
        this.cdr.markForCheck();
      });

    this.instrumentationService.evaluationMetrics$
      .pipe(takeUntil(this.destroy$))
      .subscribe(metrics => {
        this.Metrics = metrics;
        this.cdr.markForCheck();
      });

    this.instrumentationService.testRunsWithFeedback$
      .pipe(takeUntil(this.destroy$))
      .subscribe(runs => {
        this.HistoryItems = runs.filter(r => r.hasHumanFeedback);
        this.applyHistoryFilters();
        this.cdr.markForCheck();
      });
  }

  // ------------------------------------------------------------------
  //  View toggling
  // ------------------------------------------------------------------

  SetView(mode: ViewMode): void {
    this.CurrentView = mode;
    this.ExpandedItemId = null;
    this.emitState();
    this.cdr.markForCheck();
  }

  // ------------------------------------------------------------------
  //  Queue interactions
  // ------------------------------------------------------------------

  ToggleExpand(testRunID: string): void {
    if (this.ExpandedItemId === testRunID) {
      this.ExpandedItemId = null;
    } else {
      this.ExpandedItemId = testRunID;
      this.resetForm();
    }
    this.cdr.markForCheck();
  }

  SelectRating(n: number): void {
    this.FormState = { ...this.FormState, rating: n };
    this.cdr.markForCheck();
  }

  SelectCorrectness(value: boolean): void {
    this.FormState = { ...this.FormState, isCorrect: value };
    this.cdr.markForCheck();
  }

  OnCommentsChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.FormState = { ...this.FormState, comments: target.value };
  }

  async SubmitReview(item: FeedbackPending): Promise<void> {
    if (!this.IsFormValid || this.IsSubmitting) return;

    this.IsSubmitting = true;
    this.cdr.markForCheck();

    try {
      const success = await this.instrumentationService.submitFeedback(
        item.testRunID,
        this.FormState.rating!,
        this.FormState.isCorrect!,
        this.FormState.comments
      );

      if (success) {
        this.ExpandedItemId = null;
        this.resetForm();
      }
    } finally {
      this.IsSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  SkipItem(): void {
    const currentIndex = this.PendingItems.findIndex(
      i => i.testRunID === this.ExpandedItemId
    );
    this.ExpandedItemId = null;
    this.resetForm();

    // Expand the next item if available
    if (currentIndex >= 0 && currentIndex + 1 < this.PendingItems.length) {
      this.ExpandedItemId = this.PendingItems[currentIndex + 1].testRunID;
    }
    this.cdr.markForCheck();
  }

  // ------------------------------------------------------------------
  //  History interactions
  // ------------------------------------------------------------------

  OnHistorySearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.HistorySearchText = target.value;
    this.applyHistoryFilters();
    this.cdr.markForCheck();
  }

  OnHistorySortChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.HistorySortField = target.value as HistorySort;
    this.applyHistoryFilters();
    this.cdr.markForCheck();
  }

  ToggleHistoryComment(id: string): void {
    this.ExpandedHistoryId = this.ExpandedHistoryId === id ? null : id;
    this.cdr.markForCheck();
  }

  // ------------------------------------------------------------------
  //  Refresh
  // ------------------------------------------------------------------

  Refresh(): void {
    this.IsRefreshing = true;
    this.cdr.markForCheck();
    this.instrumentationService.refresh();

    setTimeout(() => {
      this.IsRefreshing = false;
      this.cdr.markForCheck();
    }, 1500);
  }

  // ------------------------------------------------------------------
  //  Formatting helpers
  // ------------------------------------------------------------------

  FormatDecimal(value: number | undefined | null, decimals: number): string {
    if (value == null) return '0';
    return value.toFixed(decimals);
  }

  FormatRelativeTime(date: Date): string {
    const now = Date.now();
    const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) return `${diffWeeks}w ago`;

    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths}mo ago`;
  }

  // ------------------------------------------------------------------
  //  Private helpers
  // ------------------------------------------------------------------

  private resetForm(): void {
    this.FormState = { rating: null, isCorrect: null, comments: '' };
  }

  private applyHistoryFilters(): void {
    let items = [...this.HistoryItems];

    // Search filter
    if (this.HistorySearchText) {
      const term = this.HistorySearchText.toLowerCase();
      items = items.filter(i => i.testName.toLowerCase().includes(term));
    }

    // Sort
    items.sort((a, b) => {
      switch (this.HistorySortField) {
        case 'date':
          return b.runDateTime.getTime() - a.runDateTime.getTime();
        case 'rating':
          return (b.humanRating ?? 0) - (a.humanRating ?? 0);
        case 'test-name':
          return a.testName.localeCompare(b.testName);
        default:
          return 0;
      }
    });

    this.FilteredHistoryItems = items;
  }

  private emitState(): void {
    this.stateChange.emit({ viewMode: this.CurrentView });
  }
}
