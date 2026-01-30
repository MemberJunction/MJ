import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  ViewContainerRef,
  HostListener
} from '@angular/core';
import { Observable, Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { CompositeKey } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { TestingDialogService } from '@memberjunction/ng-testing';
import { EvaluationPreferences, DEFAULT_EVALUATION_PREFERENCES } from '@memberjunction/ng-testing';
import {
  TestingInstrumentationService,
  TestRunWithFeedbackSummary,
  EvaluationSummaryMetrics
} from '../services/testing-instrumentation.service';

type StatusFilter = 'all' | 'running' | 'passed' | 'failed' | 'error';
type TimeRange = 'today' | 'week' | 'month' | '90days';

interface RunsFilterState {
  status: StatusFilter;
  timeRange: TimeRange;
  searchText: string;
}

interface FilteredStats {
  totalRuns: number;
  passRate: number;
  avgDuration: number;
  totalCost: number;
}

@Component({
  selector: 'app-testing-runs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Page Header -->
    <div class="runs-container" (keydown.escape)="CloseDetailPanel()">
      <div class="page-header">
        <div class="header-title">
          <i class="fa-solid fa-list-check"></i>
          <h2>Test Runs</h2>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="Refresh()" [disabled]="IsRefreshing">
            <i class="fa-solid fa-sync-alt" [class.spinning]="IsRefreshing"></i>
            Refresh
          </button>
          <button class="btn btn-primary" (click)="StartNewTest()">
            <i class="fa-solid fa-play"></i>
            Run Test
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="filter-bar">
        <div class="filter-left">
          <div class="filter-chips">
            @for (chip of StatusChips; track chip.value) {
              <button
                class="chip"
                [class.active]="filterState.status === chip.value"
                [attr.data-status]="chip.value"
                (click)="SetStatusFilter(chip.value)"
              >
                @if (chip.icon) {
                  <i [class]="chip.icon"></i>
                }
                {{ chip.label }}
              </button>
            }
          </div>
          <span class="result-count">{{ (FilteredRuns$ | async)?.length ?? 0 }} results</span>
        </div>
        <div class="filter-right">
          <select
            class="time-select"
            [value]="filterState.timeRange"
            (change)="OnTimeRangeChange($event)"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="90days">Last 90 Days</option>
          </select>
          <div class="search-box">
            <i class="fa-solid fa-search"></i>
            <input
              type="text"
              placeholder="Search by test name..."
              [value]="filterState.searchText"
              (input)="OnSearchInput($event)"
            />
            @if (filterState.searchText) {
              <button class="clear-search" (click)="ClearSearch()">
                <i class="fa-solid fa-times"></i>
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Summary Stats Row -->
      @if (FilteredStats$ | async; as stats) {
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-icon total"><i class="fa-solid fa-hashtag"></i></div>
            <div class="stat-body">
              <div class="stat-value">{{ stats.totalRuns }}</div>
              <div class="stat-label">Total Runs</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon pass"><i class="fa-solid fa-check-circle"></i></div>
            <div class="stat-body">
              <div class="stat-value">{{ FormatPercent(stats.passRate) }}</div>
              <div class="stat-label">Pass Rate</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon duration"><i class="fa-solid fa-clock"></i></div>
            <div class="stat-body">
              <div class="stat-value">{{ FormatDuration(stats.avgDuration) }}</div>
              <div class="stat-label">Avg Duration</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon cost"><i class="fa-solid fa-dollar-sign"></i></div>
            <div class="stat-body">
              <div class="stat-value">{{ FormatCostTotal(stats.totalCost) }}</div>
              <div class="stat-label">Total Cost</div>
            </div>
          </div>
        </div>
      }

      <!-- Runs Table -->
      <div class="runs-table-wrapper">
        <div class="table-header">
          <div class="col col-name">Test Name</div>
          <div class="col col-eval">Evaluation</div>
          <div class="col col-score">Score</div>
          <div class="col col-duration">Duration</div>
          <div class="col col-cost">Cost</div>
          <div class="col col-time">Started</div>
          <div class="col col-actions">Actions</div>
        </div>

        @if (instrumentationService.isLoading$ | async) {
          <div class="table-loading">
            <mj-loading text="Loading test runs..."></mj-loading>
          </div>
        } @else if ((FilteredRuns$ | async)?.length === 0) {
          <div class="table-empty">
            <i class="fa-solid fa-inbox"></i>
            <p>No test runs found</p>
            <span class="empty-hint">Try adjusting your filters or run a new test.</span>
          </div>
        } @else {
          @for (run of FilteredRuns$ | async; track TrackByRunId($index, run)) {
            <div
              class="table-row"
              [class.is-running]="run.status === 'Running'"
              [class.is-selected]="SelectedRun?.id === run.id"
              (click)="SelectRun(run)"
            >
              <div class="col col-name">
                <span class="test-name-link" (click)="NavigateToTest(run, $event)">
                  {{ run.testName }}
                </span>
              </div>
              <div class="col col-eval">
                <app-evaluation-badge
                  [executionStatus]="run.status"
                  [originalStatus]="run.status"
                  [autoScore]="run.score"
                  [passedChecks]="run.passedChecks"
                  [failedChecks]="run.failedChecks"
                  [totalChecks]="run.totalChecks"
                  [humanRating]="run.humanRating"
                  [humanIsCorrect]="run.humanIsCorrect"
                  [hasHumanFeedback]="run.hasHumanFeedback"
                  [preferences]="EvalPreferences"
                  mode="compact"
                ></app-evaluation-badge>
              </div>
              <div class="col col-score">
                <app-score-indicator [score]="run.score" [showBar]="true"></app-score-indicator>
              </div>
              <div class="col col-duration">{{ FormatDuration(run.duration) }}</div>
              <div class="col col-cost">
                <app-cost-display [cost]="run.cost"></app-cost-display>
              </div>
              <div class="col col-time">{{ FormatRelativeTime(run.runDateTime) }}</div>
              <div class="col col-actions">
                <button class="icon-btn" title="View details" (click)="SelectRun(run); $event.stopPropagation()">
                  <i class="fa-solid fa-eye"></i>
                </button>
                <button class="icon-btn" title="Re-run test" (click)="RerunTest(run); $event.stopPropagation()">
                  <i class="fa-solid fa-rotate-right"></i>
                </button>
              </div>
            </div>
          }
        }
      </div>

      <!-- Detail Panel (slide-in) -->
      @if (SelectedRun) {
        <div class="detail-overlay" (click)="CloseDetailPanel()"></div>
        <div class="detail-panel">
          <div class="detail-panel-header">
            <div class="detail-title-section">
              <h3>{{ SelectedRun.testName }}</h3>
              <app-test-status-badge [status]="SelectedRun.status"></app-test-status-badge>
            </div>
            <button class="close-btn" (click)="CloseDetailPanel()">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>

          <div class="detail-panel-body">
            <!-- Metrics row -->
            <div class="detail-metrics">
              <div class="detail-metric">
                <span class="dm-label">Score</span>
                <app-score-indicator [score]="SelectedRun.score" [showBar]="true"></app-score-indicator>
              </div>
              <div class="detail-metric">
                <span class="dm-label">Duration</span>
                <span class="dm-value">{{ FormatDuration(SelectedRun.duration) }}</span>
              </div>
              <div class="detail-metric">
                <span class="dm-label">Cost</span>
                <app-cost-display [cost]="SelectedRun.cost"></app-cost-display>
              </div>
              <div class="detail-metric">
                <span class="dm-label">Started</span>
                <span class="dm-value">{{ FormatDateTime(SelectedRun.runDateTime) }}</span>
              </div>
            </div>

            <!-- Evaluation Badge (expanded) -->
            <div class="detail-section">
              <h4><i class="fa-solid fa-clipboard-check"></i> Evaluation</h4>
              <app-evaluation-badge
                [executionStatus]="SelectedRun.status"
                [originalStatus]="SelectedRun.status"
                [autoScore]="SelectedRun.score"
                [passedChecks]="SelectedRun.passedChecks"
                [failedChecks]="SelectedRun.failedChecks"
                [totalChecks]="SelectedRun.totalChecks"
                [humanRating]="SelectedRun.humanRating"
                [humanIsCorrect]="SelectedRun.humanIsCorrect"
                [hasHumanFeedback]="SelectedRun.hasHumanFeedback"
                [preferences]="EvalPreferences"
                mode="expanded"
              ></app-evaluation-badge>
            </div>

            <!-- Execution Context -->
            @if (SelectedRun.targetType) {
              <div class="detail-section">
                <h4><i class="fa-solid fa-server"></i> Execution Context</h4>
                <mj-execution-context></mj-execution-context>
              </div>
            }

            <!-- Inline Feedback Form -->
            <div class="detail-section feedback-section">
              <h4><i class="fa-solid fa-comment-dots"></i> Human Feedback</h4>
              @if (SelectedRun.hasHumanFeedback) {
                <div class="existing-feedback">
                  <span class="feedback-label">Rating:</span>
                  <span class="feedback-value">{{ SelectedRun.humanRating }}/10</span>
                  <span class="feedback-label">Correct:</span>
                  <span class="feedback-value">
                    @if (SelectedRun.humanIsCorrect === true) {
                      <i class="fa-solid fa-check" style="color: #22c55e"></i> Yes
                    } @else if (SelectedRun.humanIsCorrect === false) {
                      <i class="fa-solid fa-times" style="color: #ef4444"></i> No
                    } @else {
                      --
                    }
                  </span>
                  @if (SelectedRun.humanComments) {
                    <div class="feedback-comments">{{ SelectedRun.humanComments }}</div>
                  }
                </div>
              } @else {
                <div class="feedback-form">
                  <div class="rating-row">
                    <label>Rating</label>
                    <div class="rating-buttons">
                      @for (n of RatingValues; track n) {
                        <button
                          class="rating-btn"
                          [class.selected]="feedbackRating === n"
                          (click)="feedbackRating = n"
                        >
                          {{ n }}
                        </button>
                      }
                    </div>
                  </div>
                  <div class="correctness-row">
                    <label>Is the result correct?</label>
                    <div class="toggle-group">
                      <button
                        class="toggle-btn"
                        [class.active]="feedbackIsCorrect === true"
                        (click)="feedbackIsCorrect = true"
                      >
                        <i class="fa-solid fa-check"></i> Yes
                      </button>
                      <button
                        class="toggle-btn"
                        [class.active]="feedbackIsCorrect === false"
                        (click)="feedbackIsCorrect = false"
                      >
                        <i class="fa-solid fa-times"></i> No
                      </button>
                    </div>
                  </div>
                  <div class="comments-row">
                    <label>Comments</label>
                    <textarea
                      rows="3"
                      placeholder="Optional feedback comments..."
                      [value]="feedbackComments"
                      (input)="OnFeedbackCommentInput($event)"
                    ></textarea>
                  </div>
                  <button
                    class="btn btn-primary submit-feedback-btn"
                    (click)="SubmitFeedback()"
                    [disabled]="IsSubmittingFeedback"
                  >
                    <i class="fa-solid fa-paper-plane"></i>
                    {{ IsSubmittingFeedback ? 'Submitting...' : 'Submit Feedback' }}
                  </button>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    /* ==========================================
       Testing Runs Component
       ========================================== */

    .runs-container {
      padding: 24px;
      height: 100%;
      overflow-y: auto;
      background: #f8fafc;
      position: relative;
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-title i {
      font-size: 22px;
      color: #6366f1;
    }

    .header-title h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
    }

    .header-actions {
      display: flex;
      gap: 10px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .btn-secondary {
      background: white;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #f1f5f9;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      padding: 14px 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .filter-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .filter-chips {
      display: flex;
      gap: 6px;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      background: #f1f5f9;
      border: 2px solid transparent;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .chip:hover {
      background: #e2e8f0;
    }

    .chip.active {
      background: #6366f1;
      color: white;
      border-color: #6366f1;
    }

    .chip.active[data-status="running"] {
      background: #3b82f6;
      border-color: #3b82f6;
    }

    .chip.active[data-status="passed"] {
      background: #22c55e;
      border-color: #22c55e;
    }

    .chip.active[data-status="failed"] {
      background: #ef4444;
      border-color: #ef4444;
    }

    .chip.active[data-status="error"] {
      background: #f59e0b;
      border-color: #f59e0b;
    }

    .result-count {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 500;
      white-space: nowrap;
    }

    .filter-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .time-select {
      padding: 8px 12px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: #475569;
      background: white;
      cursor: pointer;
    }

    .time-select:focus {
      outline: none;
      border-color: #6366f1;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      min-width: 220px;
      transition: border-color 0.2s ease;
    }

    .search-box:focus-within {
      border-color: #6366f1;
      background: white;
    }

    .search-box i {
      color: #94a3b8;
      font-size: 13px;
    }

    .search-box input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 13px;
      color: #334155;
    }

    .search-box input::placeholder {
      color: #94a3b8;
    }

    .clear-search {
      border: none;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
    }

    .clear-search:hover {
      color: #64748b;
      background: #e2e8f0;
    }

    /* Stats Row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 20px;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .stat-icon {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .stat-icon.total { background: rgba(99, 102, 241, 0.1); color: #6366f1; }
    .stat-icon.pass { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
    .stat-icon.duration { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
    .stat-icon.cost { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

    .stat-body {
      flex: 1;
    }

    .stat-value {
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
      line-height: 1.1;
    }

    .stat-label {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }

    /* Runs Table */
    .runs-table-wrapper {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      overflow: hidden;
    }

    .table-header {
      display: grid;
      grid-template-columns: 2fr 140px 120px 100px 100px 120px 90px;
      gap: 12px;
      padding: 14px 24px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .table-row {
      display: grid;
      grid-template-columns: 2fr 140px 120px 100px 100px 120px 90px;
      gap: 12px;
      padding: 14px 24px;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      transition: background 0.15s ease;
      align-items: center;
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row:hover {
      background: #f8fafc;
    }

    .table-row.is-selected {
      background: rgba(99, 102, 241, 0.06);
      border-left: 3px solid #6366f1;
    }

    .table-row.is-running {
      background: rgba(59, 130, 246, 0.04);
    }

    .table-row.is-running .test-name-link::after {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #3b82f6;
      border-radius: 50%;
      margin-left: 8px;
      animation: pulse-dot 1.5s infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .col {
      display: flex;
      align-items: center;
      font-size: 13px;
      color: #334155;
      overflow: hidden;
    }

    .test-name-link {
      font-weight: 600;
      color: #1e293b;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .test-name-link:hover {
      color: #6366f1;
      text-decoration: underline;
    }

    .col-actions {
      gap: 6px;
      justify-content: flex-end;
    }

    .icon-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #64748b;
      cursor: pointer;
      border-radius: 8px;
      font-size: 13px;
      transition: all 0.2s ease;
    }

    .icon-btn:hover {
      background: #6366f1;
      border-color: #6366f1;
      color: white;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
    }

    /* Table states */
    .table-loading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 80px 40px;
    }

    .table-empty {
      padding: 80px 40px;
      text-align: center;
    }

    .table-empty i {
      font-size: 48px;
      color: #cbd5e1;
      margin-bottom: 16px;
    }

    .table-empty p {
      font-size: 16px;
      color: #64748b;
      margin: 0 0 8px 0;
    }

    .empty-hint {
      font-size: 13px;
      color: #94a3b8;
    }

    /* Detail Panel Overlay */
    .detail-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.2);
      z-index: 999;
    }

    /* Detail Panel */
    .detail-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 520px;
      max-width: 90vw;
      background: white;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      animation: slideIn 0.25s ease-out;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .detail-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 20px 24px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }

    .detail-title-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .detail-title-section h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .close-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      color: #64748b;
      cursor: pointer;
      font-size: 14px;
      flex-shrink: 0;
      margin-left: 12px;
      transition: all 0.15s ease;
    }

    .close-btn:hover {
      background: #f1f5f9;
      color: #1e293b;
    }

    .detail-panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
    }

    .detail-metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 24px;
    }

    .detail-metric {
      padding: 12px;
      background: #f8fafc;
      border-radius: 8px;
      border-left: 3px solid #6366f1;
    }

    .dm-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .dm-value {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
    }

    .detail-section {
      margin-bottom: 24px;
    }

    .detail-section h4 {
      font-size: 13px;
      font-weight: 700;
      color: #475569;
      margin: 0 0 12px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .detail-section h4 i {
      color: #6366f1;
      font-size: 14px;
    }

    /* Feedback Section */
    .existing-feedback {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      padding: 14px;
      background: #f0fdf4;
      border-radius: 8px;
      font-size: 13px;
    }

    .feedback-label {
      font-weight: 600;
      color: #64748b;
    }

    .feedback-value {
      color: #1e293b;
      font-weight: 500;
    }

    .feedback-comments {
      width: 100%;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #dcfce7;
      font-size: 13px;
      color: #475569;
      font-style: italic;
    }

    .feedback-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .feedback-form label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 6px;
    }

    .rating-buttons {
      display: flex;
      gap: 4px;
    }

    .rating-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #e2e8f0;
      background: white;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .rating-btn:hover {
      border-color: #6366f1;
      color: #6366f1;
    }

    .rating-btn.selected {
      background: #6366f1;
      border-color: #6366f1;
      color: white;
    }

    .toggle-group {
      display: flex;
      gap: 8px;
    }

    .toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 2px solid #e2e8f0;
      background: white;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .toggle-btn.active {
      border-color: #6366f1;
      background: rgba(99, 102, 241, 0.08);
      color: #6366f1;
    }

    .comments-row textarea {
      width: 100%;
      padding: 10px 12px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: #334155;
      resize: vertical;
      box-sizing: border-box;
    }

    .comments-row textarea:focus {
      outline: none;
      border-color: #6366f1;
    }

    .comments-row textarea::placeholder {
      color: #94a3b8;
    }

    .submit-feedback-btn {
      align-self: flex-start;
    }

    /* Responsive */
    @media (max-width: 1400px) {
      .stats-row {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 1200px) {
      .filter-bar {
        flex-direction: column;
        align-items: stretch;
      }

      .filter-left, .filter-right {
        justify-content: center;
      }

      .table-header, .table-row {
        grid-template-columns: 2fr 120px 100px 100px 80px;
      }

      .col-eval, .col-time {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .stats-row {
        grid-template-columns: 1fr;
      }

      .detail-panel {
        width: 100vw;
        max-width: 100vw;
      }
    }
  `]
})
export class TestingRunsComponent implements OnInit, OnDestroy {
  @Input() initialState: Record<string, unknown> | null = null;
  @Output() stateChange = new EventEmitter<Record<string, unknown>>();

  private destroy$ = new Subject<void>();
  private filterTrigger$ = new BehaviorSubject<void>(undefined);

  // Filter state
  filterState: RunsFilterState = {
    status: 'all',
    timeRange: 'month',
    searchText: ''
  };

  // Feedback form state
  feedbackRating = 5;
  feedbackIsCorrect: boolean | null = null;
  feedbackComments = '';
  IsSubmittingFeedback = false;
  IsRefreshing = false;

  SelectedRun: TestRunWithFeedbackSummary | null = null;

  EvalPreferences: EvaluationPreferences = { ...DEFAULT_EVALUATION_PREFERENCES, showAuto: true };

  // Observables
  FilteredRuns$!: Observable<TestRunWithFeedbackSummary[]>;
  FilteredStats$!: Observable<FilteredStats>;

  // Constants
  readonly StatusChips: Array<{ value: StatusFilter; label: string; icon: string }> = [
    { value: 'all', label: 'All', icon: '' },
    { value: 'running', label: 'Running', icon: 'fa-solid fa-spinner fa-spin' },
    { value: 'passed', label: 'Passed', icon: 'fa-solid fa-check' },
    { value: 'failed', label: 'Failed', icon: 'fa-solid fa-times' },
    { value: 'error', label: 'Error', icon: 'fa-solid fa-exclamation-triangle' }
  ];

  readonly RatingValues: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  constructor(
    public instrumentationService: TestingInstrumentationService,
    private testingDialogService: TestingDialogService,
    private cdr: ChangeDetectorRef,
    private viewContainerRef: ViewContainerRef
  ) {}

  ngOnInit(): void {
    this.applyInitialState();
    this.updateServiceDateRange();
    this.setupObservables();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown.escape')
  OnEscapeKey(): void {
    if (this.SelectedRun) {
      this.CloseDetailPanel();
    }
  }

  // ------- Public Methods -------

  SetStatusFilter(status: StatusFilter): void {
    this.filterState.status = status;
    this.filterTrigger$.next();
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  OnTimeRangeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.filterState.timeRange = select.value as TimeRange;
    this.updateServiceDateRange();
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  OnSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.filterState.searchText = input.value;
    this.filterTrigger$.next();
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  ClearSearch(): void {
    this.filterState.searchText = '';
    this.filterTrigger$.next();
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  Refresh(): void {
    this.IsRefreshing = true;
    this.instrumentationService.refresh();
    setTimeout(() => {
      this.IsRefreshing = false;
      this.cdr.markForCheck();
    }, 1000);
  }

  StartNewTest(): void {
    this.testingDialogService.OpenTestRunDialog({ viewContainerRef: this.viewContainerRef });
  }

  SelectRun(run: TestRunWithFeedbackSummary): void {
    this.SelectedRun = run;
    this.resetFeedbackForm();
    this.cdr.markForCheck();
  }

  CloseDetailPanel(): void {
    this.SelectedRun = null;
    this.cdr.markForCheck();
  }

  NavigateToTest(run: TestRunWithFeedbackSummary, event: MouseEvent): void {
    event.stopPropagation();
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(run.id));
  }

  RerunTest(run: TestRunWithFeedbackSummary): void {
    if (!run.testId) return;
    this.testingDialogService.OpenTestDialog(run.testId, this.viewContainerRef);
  }

  async SubmitFeedback(): Promise<void> {
    if (!this.SelectedRun) return;

    this.IsSubmittingFeedback = true;
    this.cdr.markForCheck();

    const success = await this.instrumentationService.submitFeedback(
      this.SelectedRun.id,
      this.feedbackRating,
      this.feedbackIsCorrect === true,
      this.feedbackComments
    );

    this.IsSubmittingFeedback = false;

    if (success) {
      // Update the selected run to reflect feedback was submitted
      this.SelectedRun = {
        ...this.SelectedRun,
        hasHumanFeedback: true,
        humanRating: this.feedbackRating,
        humanIsCorrect: this.feedbackIsCorrect,
        humanComments: this.feedbackComments
      };
    }

    this.cdr.markForCheck();
  }

  OnFeedbackCommentInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.feedbackComments = textarea.value;
  }

  TrackByRunId(_index: number, run: TestRunWithFeedbackSummary): string {
    return run.id;
  }

  // ------- Formatting Helpers -------

  FormatDuration(milliseconds: number): string {
    if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  FormatRelativeTime(date: Date): string {
    const now = Date.now();
    const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
    const diffMs = now - then;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return this.formatShortDate(date);
  }

  FormatDateTime(date: Date): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  FormatPercent(value: number): string {
    return `${Math.round(value)}%`;
  }

  FormatCostTotal(cost: number): string {
    if (cost < 0.01) return '$0.00';
    if (cost < 1) return `$${cost.toFixed(2)}`;
    return `$${cost.toFixed(2)}`;
  }

  // ------- Private Methods -------

  private setupObservables(): void {
    const data$ = this.instrumentationService.testRunsWithFeedback$.pipe(
      takeUntil(this.destroy$)
    );

    this.FilteredRuns$ = combineLatest([data$, this.filterTrigger$]).pipe(
      map(([runs]) => this.applyClientFilters(runs)),
      takeUntil(this.destroy$)
    );

    this.FilteredStats$ = this.FilteredRuns$.pipe(
      map(runs => this.computeStats(runs)),
      takeUntil(this.destroy$)
    );
  }

  private applyClientFilters(runs: TestRunWithFeedbackSummary[]): TestRunWithFeedbackSummary[] {
    let filtered = runs;

    filtered = this.filterByStatus(filtered);
    filtered = this.filterBySearch(filtered);
    filtered = this.sortRunsWithRunningFirst(filtered);

    return filtered;
  }

  private filterByStatus(runs: TestRunWithFeedbackSummary[]): TestRunWithFeedbackSummary[] {
    const status = this.filterState.status;
    if (status === 'all') return runs;

    const statusMap: Record<string, string[]> = {
      running: ['Running'],
      passed: ['Passed'],
      failed: ['Failed'],
      error: ['Error', 'Timeout']
    };

    const validStatuses = statusMap[status] ?? [];
    return runs.filter(r => validStatuses.includes(r.status));
  }

  private filterBySearch(runs: TestRunWithFeedbackSummary[]): TestRunWithFeedbackSummary[] {
    const text = this.filterState.searchText.toLowerCase().trim();
    if (!text) return runs;
    return runs.filter(r => r.testName.toLowerCase().includes(text));
  }

  private sortRunsWithRunningFirst(runs: TestRunWithFeedbackSummary[]): TestRunWithFeedbackSummary[] {
    return [...runs].sort((a, b) => {
      // Running tests at the top
      if (a.status === 'Running' && b.status !== 'Running') return -1;
      if (a.status !== 'Running' && b.status === 'Running') return 1;
      // Then by StartedAt DESC
      return b.runDateTime.getTime() - a.runDateTime.getTime();
    });
  }

  private computeStats(runs: TestRunWithFeedbackSummary[]): FilteredStats {
    const total = runs.length;
    if (total === 0) {
      return { totalRuns: 0, passRate: 0, avgDuration: 0, totalCost: 0 };
    }

    const passed = runs.filter(r => r.status === 'Passed').length;
    const passRate = (passed / total) * 100;

    const completedRuns = runs.filter(r => r.duration > 0 && r.status !== 'Running');
    const avgDuration = completedRuns.length > 0
      ? completedRuns.reduce((sum, r) => sum + r.duration, 0) / completedRuns.length
      : 0;

    const totalCost = runs.reduce((sum, r) => sum + r.cost, 0);

    return { totalRuns: total, passRate, avgDuration, totalCost };
  }

  private updateServiceDateRange(): void {
    const now = new Date();
    let startDate: Date;

    switch (this.filterState.timeRange) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    this.instrumentationService.setDateRange(startDate, now);
  }

  private applyInitialState(): void {
    if (!this.initialState) return;

    const state = this.initialState;
    if (state['status'] && typeof state['status'] === 'string') {
      this.filterState.status = state['status'] as StatusFilter;
    }
    if (state['timeRange'] && typeof state['timeRange'] === 'string') {
      this.filterState.timeRange = state['timeRange'] as TimeRange;
    }
    if (state['searchText'] && typeof state['searchText'] === 'string') {
      this.filterState.searchText = state['searchText'] as string;
    }
  }

  private emitStateChange(): void {
    this.stateChange.emit({
      status: this.filterState.status,
      timeRange: this.filterState.timeRange,
      searchText: this.filterState.searchText
    });
  }

  private resetFeedbackForm(): void {
    this.feedbackRating = 5;
    this.feedbackIsCorrect = null;
    this.feedbackComments = '';
    this.IsSubmittingFeedback = false;
  }

  private formatShortDate(date: Date): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
