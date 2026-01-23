import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, ViewContainerRef } from '@angular/core';
import { Observable, Subject, combineLatest, BehaviorSubject } from 'rxjs';
import { takeUntil, map, distinctUntilChanged } from 'rxjs/operators';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { GraphQLTestingClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { TestingInstrumentationService, TestRunSummary } from '../services/testing-instrumentation.service';
import { TestRunDialogComponent, TestStatus } from '@memberjunction/ng-testing';

interface ExecutionListItem {
  id: string;
  testId: string;
  testName: string;
  suiteName: string;
  status: TestStatus;
  score: number;
  duration: number;
  cost: number;
  startedAt: Date;
  completedAt: Date | null;
  progress: number;
}

interface ExecutionFilters {
  status: string;
  suite: string;
  timeRange: string;
  searchText: string;
}

@Component({
  selector: 'app-testing-execution',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="testing-execution" kendoDialogContainer>
      <!-- Premium Header with Gradient -->
      <div class="execution-header">
        <div class="header-left">
          <div class="header-icon">
            <i class="fa-solid fa-play-circle"></i>
          </div>
          <div class="header-text">
            <h2>Test Execution Monitor</h2>
            <div class="header-meta">
              <span class="last-updated">
                <i class="fa-solid fa-clock"></i>
                Updated {{ lastUpdated | date:'shortTime' }}
              </span>
              @if (hasRunningTests$ | async) {
                <div class="live-indicator">
                  <span class="pulse"></span>
                  <span class="text">Live</span>
                </div>
              }
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button class="action-btn refresh-btn" (click)="refresh()" [disabled]="isRefreshing">
            <i class="fa-solid fa-sync-alt" [class.spinning]="isRefreshing"></i>
            <span>Refresh</span>
          </button>
          <button class="action-btn primary-btn" (click)="startNewTest()">
            <i class="fa-solid fa-play"></i>
            <span>Run Test</span>
          </button>
        </div>
      </div>

      <!-- Smart Filter Bar -->
      <div class="filter-bar">
        <div class="filter-chips">
          <button
            class="filter-chip"
            [class.active]="filters.status === 'all'"
            (click)="filters.status = 'all'; onFilterChange()"
          >
            All
          </button>
          <button
            class="filter-chip running"
            [class.active]="filters.status === 'running'"
            (click)="filters.status = 'running'; onFilterChange()"
          >
            <i class="fa-solid fa-spinner fa-spin"></i>
            Running
          </button>
          <button
            class="filter-chip passed"
            [class.active]="filters.status === 'passed'"
            (click)="filters.status = 'passed'; onFilterChange()"
          >
            <i class="fa-solid fa-check"></i>
            Passed
          </button>
          <button
            class="filter-chip failed"
            [class.active]="filters.status === 'failed'"
            (click)="filters.status = 'failed'; onFilterChange()"
          >
            <i class="fa-solid fa-times"></i>
            Failed
          </button>
        </div>

        <div class="filter-controls">
          <div class="time-select">
            <select [(ngModel)]="filters.timeRange" (change)="onFilterChange()">
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
          </div>

          <div class="search-input">
            <i class="fa-solid fa-search"></i>
            <input
              type="text"
              [(ngModel)]="filters.searchText"
              (input)="onFilterChange()"
              placeholder="Search tests..."
            />
            @if (filters.searchText) {
              <button class="clear-btn" (click)="clearSearch()">
                <i class="fa-solid fa-times"></i>
              </button>
            }
          </div>
        </div>
      </div>

      <!-- KPI Cards (Actionable) -->
      <div class="kpi-grid">
        <div
          class="kpi-card running clickable"
          (click)="filterByStatus('running')"
        >
          <div class="kpi-icon">
            <i class="fa-solid fa-spinner fa-spin"></i>
          </div>
          <div class="kpi-content">
            <div class="kpi-value">{{ (runningCount$ | async) ?? 0 }}</div>
            <div class="kpi-label">Running Now</div>
          </div>
          <div class="kpi-arrow">
            <i class="fa-solid fa-chevron-right"></i>
          </div>
        </div>

        <div
          class="kpi-card passed clickable"
          (click)="filterByStatus('passed')"
        >
          <div class="kpi-icon">
            <i class="fa-solid fa-check-circle"></i>
          </div>
          <div class="kpi-content">
            <div class="kpi-value">{{ (completedTodayCount$ | async) ?? 0 }}</div>
            <div class="kpi-label">Passed {{ getTimeRangeLabel() }}</div>
          </div>
          <div class="kpi-arrow">
            <i class="fa-solid fa-chevron-right"></i>
          </div>
        </div>

        <div
          class="kpi-card failed clickable"
          (click)="filterByStatus('failed')"
        >
          <div class="kpi-icon">
            <i class="fa-solid fa-exclamation-circle"></i>
          </div>
          <div class="kpi-content">
            <div class="kpi-value">{{ (failedTodayCount$ | async) ?? 0 }}</div>
            <div class="kpi-label">Failed {{ getTimeRangeLabel() }}</div>
          </div>
          <div class="kpi-arrow">
            <i class="fa-solid fa-chevron-right"></i>
          </div>
        </div>

        <div class="kpi-card duration">
          <div class="kpi-icon">
            <i class="fa-solid fa-clock"></i>
          </div>
          <div class="kpi-content">
            <div class="kpi-value">{{ formatDuration((avgDurationToday$ | async) ?? 0) }}</div>
            <div class="kpi-label">Avg Duration</div>
          </div>
        </div>
      </div>

      <div class="execution-content">
        <div class="execution-list">
          <div class="list-header">
            <div class="header-cell test-name">Test Name</div>
            <div class="header-cell status">Status</div>
            <div class="header-cell score">Score</div>
            <div class="header-cell duration">Duration</div>
            <div class="header-cell cost">Cost</div>
            <div class="header-cell timestamp">Started At</div>
            <div class="header-cell actions">Actions</div>
          </div>

          @if (isLoading) {
            <div class="loading-placeholder">
              <mj-loading text="Loading test executions..."></mj-loading>
            </div>
          } @else if ((filteredExecutions$ | async)?.length === 0) {
            <div class="no-data">
              <i class="fa-solid fa-inbox"></i>
              <p>No test executions found</p>
              <button class="action-btn primary" (click)="startNewTest()">
                <i class="fa-solid fa-play"></i>
                Run Your First Test
              </button>
            </div>
          }

          @for (execution of (filteredExecutions$ | async) ?? []; track execution.id) {
            <div class="execution-row" [class.running]="execution.status === 'Running'">
              <div class="cell test-name">
                <div class="test-info">
                  <div class="name">{{ execution.testName }}</div>
                  <div class="suite">{{ execution.suiteName }}</div>
                </div>
              </div>
              <div class="cell status">
                <app-test-status-badge [status]="execution.status"></app-test-status-badge>
                @if (execution.status === 'Running') {
                  <div class="progress-bar">
                    <div class="progress-fill" [style.width.%]="execution.progress"></div>
                  </div>
                }
              </div>
              <div class="cell score">
                <app-score-indicator
                  [score]="execution.score"
                  [showBar]="false"
                  [showIcon]="false"
                ></app-score-indicator>
              </div>
              <div class="cell duration">
                {{ formatDuration(execution.duration) }}
              </div>
              <div class="cell cost">
                <app-cost-display [cost]="execution.cost" [showIcon]="false"></app-cost-display>
              </div>
              <div class="cell timestamp">
                {{ execution.startedAt | date:'short' }}
              </div>
              <div class="cell actions">
                <button class="icon-btn" (click)="viewDetails(execution)" title="View Details">
                  <i class="fa-solid fa-eye"></i>
                </button>
                @if (execution.status === 'Running') {
                  <button class="icon-btn danger" (click)="cancelExecution(execution)" title="Cancel">
                    <i class="fa-solid fa-stop"></i>
                  </button>
                } @else {
                  <button class="icon-btn" (click)="rerunTest(execution)" title="Re-run">
                    <i class="fa-solid fa-redo"></i>
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ============================================
       Testing Execution - Premium Design System
       ============================================ */

    .testing-execution {
      padding: 24px;
      height: 100%;
      overflow-y: auto;
      background: linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%);
    }

    /* Premium Header */
    .execution-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      padding: 24px 28px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(99, 102, 241, 0.25);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-icon {
      width: 48px;
      height: 48px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: white;
    }

    .header-text h2 {
      margin: 0 0 4px 0;
      font-size: 20px;
      font-weight: 600;
      color: white;
    }

    .header-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .last-updated {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.8);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .last-updated i {
      font-size: 11px;
    }

    .live-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      color: white;
    }

    .pulse {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      animation: pulse 2s infinite;
      box-shadow: 0 0 8px #22c55e;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .refresh-btn {
      background: rgba(255, 255, 255, 0.15);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }

    .refresh-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.25);
      transform: translateY(-1px);
    }

    .primary-btn {
      background: white;
      color: #6366f1;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .primary-btn:hover {
      background: #f8f9ff;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Smart Filter Bar */
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      padding: 16px 20px;
      background: white;
      border-radius: 14px;
      box-shadow: 0 2px 12px rgba(99, 102, 241, 0.06);
    }

    .filter-chips {
      display: flex;
      gap: 8px;
    }

    .filter-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: #f1f5f9;
      border: 2px solid transparent;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .filter-chip:hover {
      background: #e2e8f0;
      color: #475569;
    }

    .filter-chip.active {
      background: #6366f1;
      color: white;
      border-color: #6366f1;
    }

    .filter-chip.running.active {
      background: #3b82f6;
      border-color: #3b82f6;
    }

    .filter-chip.passed.active {
      background: #22c55e;
      border-color: #22c55e;
    }

    .filter-chip.failed.active {
      background: #ef4444;
      border-color: #ef4444;
    }

    .filter-chip i {
      font-size: 11px;
    }

    .filter-controls {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .time-select select {
      padding: 10px 14px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      color: #475569;
      background: white;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .time-select select:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .search-input {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      min-width: 250px;
      transition: all 0.2s ease;
    }

    .search-input:focus-within {
      border-color: #6366f1;
      background: white;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .search-input i {
      color: #94a3b8;
      font-size: 14px;
    }

    .search-input input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 13px;
      color: #334155;
    }

    .search-input input::placeholder {
      color: #94a3b8;
    }

    .clear-btn {
      padding: 4px 8px;
      border: none;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;
    }

    .clear-btn:hover {
      background: #e2e8f0;
      color: #64748b;
    }

    /* KPI Cards Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }

    .kpi-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: white;
      border-radius: 14px;
      box-shadow: 0 2px 12px rgba(99, 102, 241, 0.06);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      border-radius: 4px 0 0 4px;
    }

    .kpi-card.clickable {
      cursor: pointer;
    }

    .kpi-card.clickable:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.15);
    }

    .kpi-card.running::before { background: linear-gradient(180deg, #3b82f6, #60a5fa); }
    .kpi-card.passed::before { background: linear-gradient(180deg, #22c55e, #4ade80); }
    .kpi-card.failed::before { background: linear-gradient(180deg, #ef4444, #f87171); }
    .kpi-card.duration::before { background: linear-gradient(180deg, #8b5cf6, #a78bfa); }

    .kpi-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .kpi-card.running .kpi-icon {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }

    .kpi-card.passed .kpi-icon {
      background: rgba(34, 197, 94, 0.1);
      color: #22c55e;
    }

    .kpi-card.failed .kpi-icon {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }

    .kpi-card.duration .kpi-icon {
      background: rgba(139, 92, 246, 0.1);
      color: #8b5cf6;
    }

    .kpi-content {
      flex: 1;
    }

    .kpi-value {
      font-size: 26px;
      font-weight: 700;
      color: #1e293b;
      line-height: 1;
      margin-bottom: 4px;
    }

    .kpi-label {
      font-size: 12px;
      font-weight: 500;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi-arrow {
      color: #cbd5e1;
      font-size: 14px;
      opacity: 0;
      transition: all 0.3s ease;
    }

    .kpi-card.clickable:hover .kpi-arrow {
      opacity: 1;
      color: #6366f1;
      transform: translateX(4px);
    }

    /* Execution List Container */
    .execution-content {
      background: white;
      border-radius: 14px;
      box-shadow: 0 2px 12px rgba(99, 102, 241, 0.06);
      overflow: hidden;
    }

    .execution-list {
      display: flex;
      flex-direction: column;
    }

    /* List Header */
    .list-header {
      display: grid;
      grid-template-columns: 2fr 120px 100px 100px 140px 100px;
      gap: 20px;
      padding: 16px 24px;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .header-cell {
      display: flex;
      align-items: center;
    }

    /* Execution Row */
    .execution-row {
      display: grid;
      grid-template-columns: 2fr 120px 100px 100px 140px 100px;
      gap: 20px;
      padding: 18px 24px;
      border-bottom: 1px solid #f1f5f9;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .execution-row:last-child {
      border-bottom: none;
    }

    .execution-row:hover {
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.03) 0%, rgba(139, 92, 246, 0.03) 100%);
    }

    .execution-row.running {
      background: linear-gradient(90deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%);
      border-left: 3px solid #3b82f6;
    }

    .execution-row.running:hover {
      background: linear-gradient(90deg, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.06) 100%);
    }

    /* Cells */
    .cell {
      display: flex;
      align-items: center;
      font-size: 13px;
      color: #334155;
    }

    .cell.test-name {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .test-info .name {
      font-weight: 600;
      color: #1e293b;
      font-size: 14px;
    }

    .test-info .suite {
      font-size: 12px;
      color: #64748b;
    }

    .cell.status {
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: #e2e8f0;
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .cell.actions {
      gap: 8px;
      justify-content: flex-end;
    }

    /* Action Buttons */
    .icon-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #64748b;
      cursor: pointer;
      border-radius: 10px;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 14px;
    }

    .icon-btn:hover {
      background: #6366f1;
      border-color: #6366f1;
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }

    .icon-btn.danger:hover {
      background: #ef4444;
      border-color: #ef4444;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }

    /* Loading State */
    .loading-placeholder {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 80px 40px;
      background: linear-gradient(180deg, #fafbff 0%, #f8fafc 100%);
    }

    /* Empty State */
    .no-data {
      padding: 80px 40px;
      text-align: center;
      background: linear-gradient(180deg, #fafbff 0%, #f8fafc 100%);
    }

    .no-data i {
      font-size: 64px;
      color: #cbd5e1;
      margin-bottom: 20px;
    }

    .no-data p {
      font-size: 16px;
      color: #64748b;
      margin-bottom: 24px;
    }

    .no-data .action-btn {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      padding: 12px 24px;
      border-radius: 12px;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
    }

    .no-data .action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(99, 102, 241, 0.4);
    }

    /* Responsive */
    @media (max-width: 1400px) {
      .kpi-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 1200px) {
      .filter-bar {
        flex-direction: column;
        align-items: stretch;
      }

      .filter-chips {
        justify-content: center;
      }

      .filter-controls {
        justify-content: center;
      }

      .list-header,
      .execution-row {
        grid-template-columns: 1fr 100px 80px 100px;
      }

      .header-cell.cost,
      .header-cell.timestamp,
      .cell.cost,
      .cell.timestamp {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .kpi-grid {
        grid-template-columns: 1fr;
      }

      .search-input {
        min-width: 200px;
      }
    }
  `]
})
export class TestingExecutionComponent implements OnInit, OnDestroy {
  @Input() initialState?: any;
  @Output() stateChange = new EventEmitter<any>();

  private destroy$ = new Subject<void>();
  private activeDialogRef: DialogRef | null = null;

  isRefreshing = false;
  isLoading = false;
  lastUpdated = new Date();
  filters: ExecutionFilters = {
    status: 'all',
    suite: 'all',
    timeRange: 'month',  // Default to "This Month" to show more data
    searchText: ''
  };

  // Track previous time range to detect changes requiring server re-query
  private previousTimeRange: string = 'month';

  // BehaviorSubject to trigger client-side filter updates
  private filterTrigger$ = new BehaviorSubject<void>(undefined);

  executions$!: Observable<ExecutionListItem[]>;
  filteredExecutions$!: Observable<ExecutionListItem[]>;
  runningCount$!: Observable<number>;
  completedTodayCount$!: Observable<number>;
  failedTodayCount$!: Observable<number>;
  avgDurationToday$!: Observable<number>;
  hasRunningTests$!: Observable<boolean>;

  private testingClient: GraphQLTestingClient;

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef,
    private viewContainerRef: ViewContainerRef
  ) {
    // Initialize GraphQL testing client for cancel/rerun operations
    const dataProvider = Metadata.Provider as GraphQLDataProvider;
    this.testingClient = new GraphQLTestingClient(dataProvider);

    // Subscribe to loading state
    this.instrumentationService.isLoading$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(loading => {
      this.isLoading = loading;
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    // Apply initial state if provided
    if (this.initialState) {
      this.filters = { ...this.filters, ...this.initialState.filters };
    }

    // Set the service date range based on the selected time range filter
    this.updateServiceDateRange();

    this.setupObservables();
  }

  ngOnDestroy(): void {
    // Close any open dialog when component is destroyed
    if (this.activeDialogRef) {
      try {
        this.activeDialogRef.close();
      } catch (error) {
        // Dialog might already be closed, ignore error
      }
      this.activeDialogRef = null;
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables(): void {
    this.executions$ = this.instrumentationService.testRuns$.pipe(
      map(runs => runs.map(run => this.mapToExecutionItem(run))),
      takeUntil(this.destroy$)
    );

    // Combine executions with filter trigger to react to client-side filter changes
    this.filteredExecutions$ = combineLatest([
      this.executions$,
      this.filterTrigger$
    ]).pipe(
      map(([executions]) => this.applyFilters(executions)),
      takeUntil(this.destroy$)
    );

    // KPI counts are now based on the full executions$ (which respects the service date range)
    // This means the counts will match the selected time range filter
    this.runningCount$ = this.executions$.pipe(
      map(execs => execs.filter(e => e.status === 'Running').length)
    );

    this.completedTodayCount$ = this.executions$.pipe(
      map(execs => execs.filter(e => e.status === 'Passed').length)
    );

    this.failedTodayCount$ = this.executions$.pipe(
      map(execs => execs.filter(e => e.status === 'Failed' || e.status === 'Error').length)
    );

    this.avgDurationToday$ = this.executions$.pipe(
      map(execs => {
        const completedExecs = execs.filter(e => e.completedAt || e.status !== 'Running');
        if (completedExecs.length === 0) return 0;
        const totalDuration = completedExecs.reduce((sum, e) => sum + e.duration, 0);
        return totalDuration / completedExecs.length;
      })
    );

    this.hasRunningTests$ = this.runningCount$.pipe(
      map(count => count > 0)
    );
  }

  private mapToExecutionItem(run: TestRunSummary): ExecutionListItem {
    const startedAt = run.runDateTime;
    const completedAt = null;
    const duration = run.duration;
    const progress = run.status === 'Running' ? Math.random() * 100 : 100;

    return {
      id: run.id,
      testId: run.testId,
      testName: run.testName,
      suiteName: run.suiteName,
      status: run.status as TestStatus,
      score: run.score,
      duration,
      cost: run.cost,
      startedAt,
      completedAt,
      progress
    };
  }

  private applyFilters(executions: ExecutionListItem[]): ExecutionListItem[] {
    let filtered = [...executions];

    // Apply status filter
    if (this.filters.status !== 'all') {
      if (this.filters.status === 'running') {
        filtered = filtered.filter(e => e.status === 'Running');
      } else if (this.filters.status === 'completed') {
        filtered = filtered.filter(e => e.status === 'Passed' || e.status === 'Skipped');
      } else if (this.filters.status === 'failed') {
        filtered = filtered.filter(e => e.status === 'Failed' || e.status === 'Error');
      } else if (this.filters.status === 'passed') {
        filtered = filtered.filter(e => e.status === 'Passed');
      }
    }

    // Note: Time range filtering is now handled by the service via updateServiceDateRange()
    // This ensures the KPIs and list use the same data set

    // Apply search text filter
    if (this.filters.searchText) {
      const searchLower = this.filters.searchText.toLowerCase();
      filtered = filtered.filter(e =>
        e.testName.toLowerCase().includes(searchLower) ||
        e.suiteName.toLowerCase().includes(searchLower)
      );
    }

    // Sort by most recent first
    filtered.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    return filtered;
  }

  onFilterChange(): void {
    // Only re-query server when time range changes - status/search filtering is client-side only
    if (this.filters.timeRange !== this.previousTimeRange) {
      this.previousTimeRange = this.filters.timeRange;
      this.updateServiceDateRange();
    }

    // Trigger client-side filter update via observable
    this.filterTrigger$.next();

    this.emitStateChange();
    this.cdr.markForCheck();
  }

  private updateServiceDateRange(): void {
    const now = new Date();
    let startDate: Date;

    switch (this.filters.timeRange) {
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
      case 'all':
      default:
        // For "all time", use a very old date (e.g., 1 year ago)
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    this.instrumentationService.setDateRange(startDate, now);
  }

  clearSearch(): void {
    this.filters.searchText = '';
    this.onFilterChange();
  }

  refresh(): void {
    this.isRefreshing = true;
    this.instrumentationService.refresh();
    setTimeout(() => {
      this.isRefreshing = false;
      this.lastUpdated = new Date();
      this.cdr.markForCheck();
    }, 1000);
  }

  filterByStatus(status: string): void {
    this.filters.status = status;
    this.onFilterChange();
  }

  startNewTest(): void {
    this.activeDialogRef = this.dialogService.open({
      content: TestRunDialogComponent,
      width: 1000,
      height: 750,
      title: 'Run Test',
      actions: []
    });

    this.activeDialogRef.result.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result) => {
        if (result && typeof result === 'object' && 'testExecuted' in result && result.testExecuted) {
          this.refresh();
        }
      },
      error: () => {
        this.activeDialogRef = null;
      },
      complete: () => {
        this.activeDialogRef = null;
      }
    });
  }

  viewDetails(execution: ExecutionListItem): void {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(execution.id));
  }

  async cancelExecution(execution: ExecutionListItem): Promise<void> {
    // For now, show a notification - full cancel support requires server-side CancelTest mutation
    // which we documented in the plan but haven't implemented yet
    SharedService.Instance.CreateSimpleNotification(
      `Cancellation requested for "${execution.testName}". Full cancellation support coming soon.`,
      'warning',
      3000
    );

    // Refresh after a delay to pick up any status changes
    setTimeout(() => this.refresh(), 1500);
  }

  async rerunTest(execution: ExecutionListItem): Promise<void> {
    if (!execution.testId) {
      SharedService.Instance.CreateSimpleNotification(
        'Cannot re-run: Test ID not available',
        'error',
        3000
      );
      return;
    }

    // Open the test run dialog with the test pre-selected
    this.activeDialogRef = this.dialogService.open({
      content: TestRunDialogComponent,
      width: 1000,
      height: 750,
      title: 'Re-run Test',
      actions: []
    });

    // Pre-configure the dialog with the test
    const dialogComponent = this.activeDialogRef.content.instance;
    dialogComponent.runMode = 'test';
    dialogComponent.selectedTestId = execution.testId;

    this.activeDialogRef.result.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result) => {
        if (result && typeof result === 'object' && 'testExecuted' in result && result.testExecuted) {
          SharedService.Instance.CreateSimpleNotification(
            `Test "${execution.testName}" completed`,
            'success',
            3000
          );
          this.refresh();
        }
      },
      error: () => {
        this.activeDialogRef = null;
      },
      complete: () => {
        this.activeDialogRef = null;
      }
    });
  }

  formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  getTimeRangeLabel(): string {
    switch (this.filters.timeRange) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'all': return 'All Time';
      default: return '';
    }
  }

  private emitStateChange(): void {
    this.stateChange.emit({
      filters: this.filters
    });
  }
}
