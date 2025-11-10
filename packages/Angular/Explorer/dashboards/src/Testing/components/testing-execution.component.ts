import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { TestingInstrumentationService, TestRunSummary } from '../services/testing-instrumentation.service';

interface ExecutionListItem {
  id: string;
  testName: string;
  suiteName: string;
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Pending';
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
    <div class="testing-execution">
      <div class="execution-header">
        <div class="header-left">
          <h2>
            <i class="fa-solid fa-play-circle"></i>
            Test Execution Monitor
          </h2>
          <div class="live-indicator" *ngIf="hasRunningTests$ | async">
            <span class="pulse"></span>
            <span class="text">Live</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="action-btn refresh" (click)="refresh()" [disabled]="isRefreshing">
            <i class="fa-solid fa-refresh" [class.spinning]="isRefreshing"></i>
            Refresh
          </button>
          <button class="action-btn primary" (click)="startNewTest()">
            <i class="fa-solid fa-play"></i>
            Run Test
          </button>
        </div>
      </div>

      <div class="execution-filters">
        <div class="filter-group">
          <label>Status</label>
          <select [(ngModel)]="filters.status" (change)="onFilterChange()">
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="passed">Passed</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Time Range</label>
          <select [(ngModel)]="filters.timeRange" (change)="onFilterChange()">
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
        <div class="filter-group search">
          <label>Search</label>
          <div class="search-input-wrapper">
            <i class="fa-solid fa-search"></i>
            <input
              type="text"
              [(ngModel)]="filters.searchText"
              (input)="onFilterChange()"
              placeholder="Search tests..."
            />
            <button
              class="clear-btn"
              *ngIf="filters.searchText"
              (click)="clearSearch()"
            >
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="execution-summary">
        <div class="summary-card">
          <div class="summary-icon running">
            <i class="fa-solid fa-spinner fa-spin"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (runningCount$ | async) || 0 }}</div>
            <div class="summary-label">Running Now</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon completed">
            <i class="fa-solid fa-check-circle"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (completedTodayCount$ | async) || 0 }}</div>
            <div class="summary-label">Completed Today</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon failed">
            <i class="fa-solid fa-exclamation-circle"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (failedTodayCount$ | async) || 0 }}</div>
            <div class="summary-label">Failed Today</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon duration">
            <i class="fa-solid fa-clock"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ formatDuration((avgDurationToday$ | async) || 0) }}</div>
            <div class="summary-label">Avg Duration Today</div>
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

          @if ((filteredExecutions$ | async)?.length === 0) {
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
    .testing-execution {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
    }

    .execution-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-left h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-left h2 i {
      color: #2196f3;
    }

    .live-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: #e3f2fd;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      color: #2196f3;
    }

    .pulse {
      width: 8px;
      height: 8px;
      background: #2196f3;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .action-btn.refresh {
      background: white;
      border: 1px solid #ddd;
      color: #666;
    }

    .action-btn.refresh:hover:not(:disabled) {
      background: #f5f5f5;
    }

    .action-btn.primary {
      background: #2196f3;
      color: white;
    }

    .action-btn.primary:hover {
      background: #1976d2;
    }

    .action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .action-btn i.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .execution-filters {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 150px;
    }

    .filter-group.search {
      flex: 1;
    }

    .filter-group label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .filter-group select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
      color: #333;
      background: white;
    }

    .search-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-input-wrapper i.fa-search {
      position: absolute;
      left: 12px;
      color: #999;
      font-size: 12px;
    }

    .search-input-wrapper input {
      flex: 1;
      padding: 8px 40px 8px 36px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
    }

    .clear-btn {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 4px;
    }

    .clear-btn:hover {
      color: #333;
    }

    .execution-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .summary-card {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .summary-icon {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .summary-icon.running {
      background: #e3f2fd;
      color: #2196f3;
    }

    .summary-icon.completed {
      background: #e8f5e9;
      color: #4caf50;
    }

    .summary-icon.failed {
      background: #ffebee;
      color: #f44336;
    }

    .summary-icon.duration {
      background: #fff3e0;
      color: #ff9800;
    }

    .summary-content {
      flex: 1;
    }

    .summary-value {
      font-size: 24px;
      font-weight: 700;
      color: #333;
      line-height: 1;
      margin-bottom: 4px;
    }

    .summary-label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      font-weight: 600;
    }

    .execution-content {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .execution-list {
      display: flex;
      flex-direction: column;
    }

    .list-header {
      display: grid;
      grid-template-columns: 2fr 140px 100px 100px 100px 150px 100px;
      gap: 16px;
      padding: 16px;
      background: #f8f9fa;
      border-bottom: 2px solid #e0e0e0;
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .execution-row {
      display: grid;
      grid-template-columns: 2fr 140px 100px 100px 100px 150px 100px;
      gap: 16px;
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s ease;
    }

    .execution-row:hover {
      background: #f8f9fa;
    }

    .execution-row.running {
      background: #e3f2fd;
    }

    .execution-row.running:hover {
      background: #bbdefb;
    }

    .cell {
      display: flex;
      align-items: center;
      font-size: 13px;
      color: #333;
    }

    .cell.test-name {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .test-info .name {
      font-weight: 500;
      color: #333;
    }

    .test-info .suite {
      font-size: 11px;
      color: #666;
    }

    .cell.status {
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: #e0e0e0;
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #2196f3;
      transition: width 0.3s ease;
    }

    .cell.actions {
      gap: 8px;
    }

    .icon-btn {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 6px;
      border-radius: 4px;
      transition: all 0.2s ease;
      font-size: 14px;
    }

    .icon-btn:hover {
      background: #f0f0f0;
      color: #2196f3;
    }

    .icon-btn.danger:hover {
      background: #ffebee;
      color: #f44336;
    }

    .no-data {
      padding: 60px 20px;
      text-align: center;
      color: #999;
    }

    .no-data i {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .no-data p {
      font-size: 14px;
      margin-bottom: 20px;
    }

    @media (max-width: 1200px) {
      .execution-filters {
        flex-wrap: wrap;
      }

      .filter-group {
        min-width: 120px;
      }
    }
  `]
})
export class TestingExecutionComponent implements OnInit, OnDestroy {
  @Input() initialState?: any;
  @Output() stateChange = new EventEmitter<any>();

  private destroy$ = new Subject<void>();

  isRefreshing = false;
  filters: ExecutionFilters = {
    status: 'all',
    suite: 'all',
    timeRange: 'today',
    searchText: ''
  };

  executions$!: Observable<ExecutionListItem[]>;
  filteredExecutions$!: Observable<ExecutionListItem[]>;
  runningCount$!: Observable<number>;
  completedTodayCount$!: Observable<number>;
  failedTodayCount$!: Observable<number>;
  avgDurationToday$!: Observable<number>;
  hasRunningTests$!: Observable<boolean>;

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setupObservables();

    if (this.initialState) {
      this.filters = { ...this.filters, ...this.initialState.filters };
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables(): void {
    this.executions$ = this.instrumentationService.testRuns$.pipe(
      map(runs => runs.map(run => this.mapToExecutionItem(run))),
      takeUntil(this.destroy$)
    );

    this.filteredExecutions$ = combineLatest([
      this.executions$
    ]).pipe(
      map(([executions]) => this.applyFilters(executions)),
      takeUntil(this.destroy$)
    );

    this.runningCount$ = this.executions$.pipe(
      map(execs => execs.filter(e => e.status === 'Running').length)
    );

    this.completedTodayCount$ = this.executions$.pipe(
      map(execs => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return execs.filter(e =>
          e.status === 'Passed' &&
          e.startedAt >= today
        ).length;
      })
    );

    this.failedTodayCount$ = this.executions$.pipe(
      map(execs => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return execs.filter(e =>
          e.status === 'Failed' &&
          e.startedAt >= today
        ).length;
      })
    );

    this.avgDurationToday$ = this.executions$.pipe(
      map(execs => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayExecs = execs.filter(e => e.startedAt >= today && e.completedAt);
        if (todayExecs.length === 0) return 0;
        const totalDuration = todayExecs.reduce((sum, e) => sum + e.duration, 0);
        return totalDuration / todayExecs.length;
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
      testName: run.testName,
      suiteName: run.suiteName,
      status: run.status,
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

    if (this.filters.timeRange !== 'all') {
      const now = new Date();
      let startDate = new Date();

      if (this.filters.timeRange === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (this.filters.timeRange === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (this.filters.timeRange === 'month') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      filtered = filtered.filter(e => e.startedAt >= startDate);
    }

    if (this.filters.searchText) {
      const searchLower = this.filters.searchText.toLowerCase();
      filtered = filtered.filter(e =>
        e.testName.toLowerCase().includes(searchLower) ||
        e.suiteName.toLowerCase().includes(searchLower)
      );
    }

    filtered.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    return filtered;
  }

  onFilterChange(): void {
    this.emitStateChange();
    this.cdr.markForCheck();
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
      this.cdr.markForCheck();
    }, 1000);
  }

  startNewTest(): void {
    console.log('Start new test');
  }

  viewDetails(execution: ExecutionListItem): void {
    console.log('View details:', execution);
  }

  cancelExecution(execution: ExecutionListItem): void {
    console.log('Cancel execution:', execution);
  }

  rerunTest(execution: ExecutionListItem): void {
    console.log('Re-run test:', execution);
  }

  formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private emitStateChange(): void {
    this.stateChange.emit({
      filters: this.filters
    });
  }
}
