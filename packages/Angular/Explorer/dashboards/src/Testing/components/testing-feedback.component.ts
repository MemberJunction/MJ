import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { TestingInstrumentationService, FeedbackPending, FeedbackStats } from '../services/testing-instrumentation.service';
import { TestStatus } from './widgets/test-status-badge.component';

interface FeedbackFilter {
  status: 'all' | 'pending' | 'reviewed';
  reason: 'all' | 'no-feedback' | 'high-score-failed' | 'low-score-passed';
  searchText: string;
}

interface EnhancedFeedbackPending extends FeedbackPending {
  feedbackRating: number;
  feedbackIsCorrect: boolean;
  feedbackComments: string;
}

@Component({
  selector: 'app-testing-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="testing-feedback">
      <div class="feedback-header">
        <div class="header-left">
          <h2>
            <i class="fa-solid fa-clipboard-check"></i>
            Human Feedback Review
          </h2>
          <div class="pending-badge" *ngIf="(pendingCount$ | async) || 0 > 0">
            <span class="badge-count">{{ (pendingCount$ | async) }}</span>
            <span class="badge-text">Pending Review</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="action-btn" (click)="refresh()">
            <i class="fa-solid fa-refresh"></i>
            Refresh
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="feedback-filters">
        <div class="filter-group">
          <label>Status</label>
          <select [(ngModel)]="filters.status" (change)="onFilterChange()">
            <option value="all">All</option>
            <option value="pending">Pending Review</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Reason</label>
          <select [(ngModel)]="filters.reason" (change)="onFilterChange()">
            <option value="all">All Reasons</option>
            <option value="no-feedback">No Feedback</option>
            <option value="high-score-failed">High Score but Failed</option>
            <option value="low-score-passed">Low Score but Passed</option>
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

      <!-- Summary Cards -->
      <div class="feedback-summary">
        <div class="summary-card">
          <div class="summary-icon pending">
            <i class="fa-solid fa-hourglass-half"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (pendingCount$ | async) || 0 }}</div>
            <div class="summary-label">Pending Review</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon discrepancy">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (discrepancyCount$ | async) || 0 }}</div>
            <div class="summary-label">Score Discrepancies</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon reviewed">
            <i class="fa-solid fa-check-circle"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (reviewedCount$ | async) || 0 }}</div>
            <div class="summary-label">Reviewed</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon accuracy">
            <i class="fa-solid fa-bullseye"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (accuracyRate$ | async) || 0 | number:'1.1-1' }}%</div>
            <div class="summary-label">Human-AI Agreement</div>
          </div>
        </div>
      </div>

      <!-- Pending Reviews List -->
      <div class="feedback-content">
        <div class="content-header">
          <h3>
            <i class="fa-solid fa-list-check"></i>
            Tests Requiring Review
          </h3>
          <div class="sort-controls">
            <label>Sort by:</label>
            <select [(ngModel)]="sortBy" (change)="onSortChange()">
              <option value="date">Date</option>
              <option value="priority">Priority</option>
              <option value="test-name">Test Name</option>
            </select>
          </div>
        </div>

        <div class="feedback-list">
          @for (item of (filteredFeedback$ | async) ?? []; track item.testRunID) {
            <div class="feedback-item" [class.expanded]="expandedItem === item.testRunID">
              <div class="item-header" (click)="toggleExpanded(item.testRunID)">
                <div class="item-main">
                  <div class="item-title">{{ item.testName }}</div>
                  <div class="item-meta">
                    <span class="meta-date">
                      <i class="fa-solid fa-clock"></i>
                      {{ item.runDateTime | date:'short' }}
                    </span>
                    <span class="meta-score">
                      Automated Score: <strong>{{ item.automatedScore.toFixed(4) }}</strong>
                    </span>
                    <span class="meta-status">
                      Status: <app-test-status-badge [status]="getTestStatus(item.automatedStatus)"></app-test-status-badge>
                    </span>
                  </div>
                </div>
                <div class="item-reason">
                  <span class="reason-badge" [class]="item.reason">
                    <i class="fa-solid" [class.fa-circle-info]="item.reason === 'no-feedback'"
                       [class.fa-arrow-up]="item.reason === 'high-score-failed'"
                       [class.fa-arrow-down]="item.reason === 'low-score-passed'"></i>
                    {{ formatReason(item.reason) }}
                  </span>
                </div>
                <button class="expand-btn">
                  <i class="fa-solid" [class.fa-chevron-down]="expandedItem !== item.testRunID"
                     [class.fa-chevron-up]="expandedItem === item.testRunID"></i>
                </button>
              </div>

              @if (expandedItem === item.testRunID) {
                <div class="item-content">
                  <div class="feedback-form">
                    <div class="form-section">
                      <h4>Provide Your Feedback</h4>
                      <div class="form-row">
                        <div class="form-group">
                          <label>Human Rating (1-10)</label>
                          <input
                            type="number"
                            [(ngModel)]="item.feedbackRating"
                            min="1"
                            max="10"
                            class="rating-input"
                            placeholder="Rate 1-10"
                          />
                        </div>
                        <div class="form-group">
                          <label>Is Automated Result Correct?</label>
                          <div class="checkbox-group">
                            <label class="checkbox-label">
                              <input type="checkbox" [(ngModel)]="item.feedbackIsCorrect" />
                              <span>Yes, the automated assessment is correct</span>
                            </label>
                          </div>
                        </div>
                      </div>
                      <div class="form-group">
                        <label>Comments / Notes</label>
                        <textarea
                          [(ngModel)]="item.feedbackComments"
                          rows="4"
                          class="comments-textarea"
                          placeholder="Provide detailed feedback about this test result..."
                        ></textarea>
                      </div>
                      <div class="form-actions">
                        <button class="submit-btn" (click)="submitFeedback(item)">
                          <i class="fa-solid fa-paper-plane"></i>
                          Submit Feedback
                        </button>
                        <button class="skip-btn" (click)="skipFeedback(item)">
                          <i class="fa-solid fa-forward"></i>
                          Skip for Now
                        </button>
                      </div>
                    </div>

                    <div class="context-section">
                      <h4>Test Context</h4>
                      <div class="context-details">
                        <div class="detail-item">
                          <span class="detail-label">Test Run ID</span>
                          <span class="detail-value">{{ item.testRunID }}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Automated Score</span>
                          <span class="detail-value">
                            <app-score-indicator [score]="item.automatedScore" [showBar]="true"></app-score-indicator>
                          </span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Status</span>
                          <span class="detail-value">
                            <app-test-status-badge [status]="getTestStatus(item.automatedStatus)"></app-test-status-badge>
                          </span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Run Date</span>
                          <span class="detail-value">{{ item.runDateTime | date:'medium' }}</span>
                        </div>
                      </div>
                      <button class="view-details-btn" (click)="viewFullDetails(item)">
                        <i class="fa-solid fa-external-link"></i>
                        View Full Test Details
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          } @empty {
            <div class="empty-state">
              <i class="fa-solid fa-check-double"></i>
              <h3>All Caught Up!</h3>
              <p>No tests currently require feedback review.</p>
            </div>
          }
        </div>
      </div>

      <!-- Feedback Statistics -->
      <div class="feedback-stats">
        <div class="stats-section">
          <h3>
            <i class="fa-solid fa-chart-pie"></i>
            Feedback Statistics
          </h3>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Total Feedback Submitted</div>
              <div class="stat-value">{{ (totalFeedback$ | async) || 0 }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Avg Rating</div>
              <div class="stat-value">{{ (avgRating$ | async) || 0 | number:'1.1-1' }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Agreement Rate</div>
              <div class="stat-value">{{ (agreementRate$ | async) || 0 | number:'1.1-1' }}%</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Disagreement Rate</div>
              <div class="stat-value">{{ (disagreementRate$ | async) || 0 | number:'1.1-1' }}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .testing-feedback {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
    }

    .feedback-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
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

    .pending-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: #fff3e0;
      border: 2px solid #ff9800;
      border-radius: 20px;
    }

    .badge-count {
      background: #ff9800;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }

    .badge-text {
      font-size: 12px;
      font-weight: 600;
      color: #ff9800;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      color: #666;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .action-btn:hover {
      background: #f5f5f5;
    }

    .feedback-filters {
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
      background: white;
    }

    .search-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-input-wrapper i {
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

    .feedback-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .summary-icon {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: white;
    }

    .summary-icon.pending {
      background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
    }

    .summary-icon.discrepancy {
      background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
    }

    .summary-icon.reviewed {
      background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
    }

    .summary-icon.accuracy {
      background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
    }

    .summary-content {
      flex: 1;
    }

    .summary-value {
      font-size: 28px;
      font-weight: 700;
      color: #333;
      line-height: 1;
      margin-bottom: 6px;
    }

    .summary-label {
      font-size: 11px;
      color: #666;
      font-weight: 600;
      text-transform: uppercase;
    }

    .feedback-content {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      margin-bottom: 24px;
    }

    .content-header {
      padding: 20px;
      background: #f8f9fa;
      border-bottom: 2px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .content-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .content-header h3 i {
      color: #2196f3;
    }

    .sort-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #666;
    }

    .sort-controls select {
      padding: 6px 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
    }

    .feedback-list {
      max-height: 800px;
      overflow-y: auto;
    }

    .feedback-item {
      border-bottom: 1px solid #f0f0f0;
      transition: all 0.3s ease;
    }

    .feedback-item.expanded {
      background: #f8f9fa;
    }

    .item-header {
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .item-header:hover {
      background: rgba(33, 150, 243, 0.05);
    }

    .item-main {
      flex: 1;
    }

    .item-title {
      font-size: 15px;
      font-weight: 600;
      color: #333;
      margin-bottom: 8px;
    }

    .item-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #666;
    }

    .item-meta span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .item-reason {
      min-width: 180px;
    }

    .reason-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .reason-badge.no-feedback {
      background: #e3f2fd;
      color: #2196f3;
    }

    .reason-badge.high-score-failed {
      background: #ffebee;
      color: #f44336;
    }

    .reason-badge.low-score-passed {
      background: #fff3e0;
      color: #ff9800;
    }

    .expand-btn {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: all 0.2s ease;
      font-size: 16px;
    }

    .expand-btn:hover {
      background: #e0e0e0;
    }

    .item-content {
      padding: 20px;
      border-top: 1px solid #e0e0e0;
      animation: slideDown 0.3s ease;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .feedback-form {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
    }

    .form-section h4,
    .context-section h4 {
      margin: 0 0 16px 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      padding-bottom: 12px;
      border-bottom: 2px solid #f0f0f0;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 16px;
      margin-bottom: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-group label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .rating-input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .checkbox-group {
      display: flex;
      align-items: center;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #333;
      cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .comments-textarea {
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
      resize: vertical;
    }

    .form-actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }

    .submit-btn,
    .skip-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .submit-btn {
      background: #2196f3;
      color: white;
    }

    .submit-btn:hover {
      background: #1976d2;
    }

    .skip-btn {
      background: #f5f5f5;
      color: #666;
    }

    .skip-btn:hover {
      background: #e0e0e0;
    }

    .context-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }

    .detail-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background: white;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
    }

    .detail-label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .detail-value {
      font-size: 13px;
      font-weight: 500;
      color: #333;
    }

    .view-details-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px;
      border: 1px solid #2196f3;
      border-radius: 4px;
      background: white;
      color: #2196f3;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .view-details-btn:hover {
      background: #e3f2fd;
    }

    .empty-state {
      padding: 80px 20px;
      text-align: center;
      color: #999;
    }

    .empty-state i {
      font-size: 64px;
      margin-bottom: 20px;
      opacity: 0.3;
      color: #4caf50;
    }

    .empty-state h3 {
      font-size: 20px;
      color: #666;
      margin: 0 0 12px 0;
    }

    .empty-state p {
      font-size: 14px;
      margin: 0;
    }

    .feedback-stats {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .feedback-stats h3 {
      margin: 0 0 20px 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f0f0f0;
    }

    .feedback-stats h3 i {
      color: #2196f3;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .stat-card {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 6px;
      text-align: center;
    }

    .stat-label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #333;
    }

    @media (max-width: 1200px) {
      .feedback-form {
        grid-template-columns: 1fr;
      }

      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class TestingFeedbackComponent implements OnInit, OnDestroy {
  @Input() initialState?: any;
  @Output() stateChange = new EventEmitter<any>();

  private destroy$ = new Subject<void>();

  filters: FeedbackFilter = {
    status: 'pending',
    reason: 'all',
    searchText: ''
  };

  sortBy: 'date' | 'priority' | 'test-name' = 'priority';
  expandedItem: string | null = null;

  pendingFeedback$!: Observable<EnhancedFeedbackPending[]>;
  filteredFeedback$!: Observable<EnhancedFeedbackPending[]>;
  pendingCount$!: Observable<number>;
  discrepancyCount$!: Observable<number>;
  reviewedCount$!: Observable<number>;
  accuracyRate$!: Observable<number>;
  totalFeedback$!: Observable<number>;
  avgRating$!: Observable<number>;
  agreementRate$!: Observable<number>;
  disagreementRate$!: Observable<number>;

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setupObservables();

    if (this.initialState) {
      this.filters = { ...this.filters, ...this.initialState.filters };
      this.sortBy = this.initialState.sortBy || 'priority';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables(): void {
    this.pendingFeedback$ = this.instrumentationService.pendingFeedback$.pipe(
      map(feedback => feedback.map(f => ({
        ...f,
        feedbackRating: 5,
        feedbackIsCorrect: true,
        feedbackComments: ''
      }))),
      takeUntil(this.destroy$)
    );

    this.filteredFeedback$ = this.pendingFeedback$.pipe(
      map(feedback => this.filterAndSort(feedback))
    );

    this.pendingCount$ = this.pendingFeedback$.pipe(
      map(feedback => feedback.length)
    );

    this.discrepancyCount$ = this.pendingFeedback$.pipe(
      map(feedback => feedback.filter(f =>
        f.reason === 'high-score-failed' || f.reason === 'low-score-passed'
      ).length)
    );

    // Load real feedback statistics from the service
    const feedbackStats$ = this.instrumentationService.feedbackStats$;

    this.reviewedCount$ = feedbackStats$.pipe(
      map(stats => stats.reviewedCount),
      takeUntil(this.destroy$)
    );

    this.accuracyRate$ = feedbackStats$.pipe(
      map(stats => stats.accuracyRate),
      takeUntil(this.destroy$)
    );

    this.totalFeedback$ = feedbackStats$.pipe(
      map(stats => stats.totalFeedback),
      takeUntil(this.destroy$)
    );

    this.avgRating$ = feedbackStats$.pipe(
      map(stats => stats.avgRating),
      takeUntil(this.destroy$)
    );

    this.agreementRate$ = feedbackStats$.pipe(
      map(stats => stats.agreementRate),
      takeUntil(this.destroy$)
    );

    this.disagreementRate$ = feedbackStats$.pipe(
      map(stats => stats.disagreementRate),
      takeUntil(this.destroy$)
    );
  }

  private filterAndSort(feedback: any[]): any[] {
    let filtered = [...feedback];

    // Note: 'reviewed' status would need to query Test Run Feedback entity separately
    // For now, we only show pending items (all items from pendingFeedback$ are pending by definition)
    if (this.filters.status === 'reviewed') {
      filtered = []; // No reviewed items in this stream
    }

    if (this.filters.reason !== 'all') {
      filtered = filtered.filter(f => f.reason === this.filters.reason);
    }

    if (this.filters.searchText) {
      const searchLower = this.filters.searchText.toLowerCase();
      filtered = filtered.filter(f =>
        f.testName.toLowerCase().includes(searchLower)
      );
    }

    filtered.sort((a, b) => {
      if (this.sortBy === 'date') {
        return b.runDateTime.getTime() - a.runDateTime.getTime();
      } else if (this.sortBy === 'priority') {
        const priorityOrder = { 'high-score-failed': 1, 'low-score-passed': 2, 'no-feedback': 3 };
        return (priorityOrder[a.reason as keyof typeof priorityOrder] || 99) -
               (priorityOrder[b.reason as keyof typeof priorityOrder] || 99);
      } else {
        return a.testName.localeCompare(b.testName);
      }
    });

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

  onSortChange(): void {
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  toggleExpanded(testRunID: string): void {
    this.expandedItem = this.expandedItem === testRunID ? null : testRunID;
  }

  submitFeedback(item: any): void {
    console.log('Submit feedback:', item);
    this.expandedItem = null;
    this.cdr.markForCheck();
  }

  skipFeedback(item: any): void {
    console.log('Skip feedback:', item);
    this.expandedItem = null;
    this.cdr.markForCheck();
  }

  viewFullDetails(item: any): void {
    console.log('View full details:', item);
  }

  refresh(): void {
    this.instrumentationService.refresh();
  }

  formatReason(reason: string): string {
    switch (reason) {
      case 'no-feedback': return 'No Feedback';
      case 'high-score-failed': return 'High Score but Failed';
      case 'low-score-passed': return 'Low Score but Passed';
      default: return reason;
    }
  }

  getTestStatus(status: string): TestStatus {
    // Convert automatedStatus string to TestStatus type
    return status as TestStatus;
  }

  private emitStateChange(): void {
    this.stateChange.emit({
      filters: this.filters,
      sortBy: this.sortBy
    });
  }
}
