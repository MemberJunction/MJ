import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { TestingInstrumentationService, FeedbackPending, FeedbackStats } from '../services/testing-instrumentation.service';
import { TestRunFeedbackEntity, TestSuiteEntity, TestRunEntity } from '@memberjunction/core-entities';

type TestStatus = 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Pending';

interface FeedbackFilter {
  status: 'all' | 'pending' | 'reviewed';
  reason: 'all' | 'no-feedback' | 'high-score-failed' | 'low-score-passed';
  suiteId: string | null;
  searchText: string;
}

interface EnhancedFeedbackPending extends FeedbackPending {
  feedbackRating: number;
  feedbackIsCorrect: boolean;
  feedbackComments: string;
}

interface ReviewedFeedback {
  id: string;
  testRunID: string;
  testName: string;
  rating: number;
  isCorrect: boolean;
  comments: string;
  reviewerName: string;
  reviewedAt: Date;
  automatedScore: number;
  automatedStatus: string;
}

interface SuiteAggregation {
  suiteId: string;
  suiteName: string;
  totalRuns: number;
  reviewedCount: number;
  pendingCount: number;
  avgRating: number;
  agreementRate: number;
  passRate: number;
}

type ViewMode = 'pending' | 'reviewed' | 'suites';

@Component({
  selector: 'app-testing-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="testing-feedback">
      <!-- Header -->
      <div class="feedback-header">
        <div class="header-left">
          <h2>
            <i class="fa-solid fa-clipboard-check"></i>
            Human Feedback Review
          </h2>
          <div class="pending-badge" *ngIf="(pendingCount$ | async) as count">
            <span class="badge-count" *ngIf="count > 0">{{ count }}</span>
            <span class="badge-text">{{ count > 0 ? 'Pending Review' : 'All Reviewed' }}</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="action-btn refresh-btn" (click)="refresh()" [disabled]="isRefreshing">
            <i class="fa-solid fa-refresh" [class.fa-spin]="isRefreshing"></i>
            {{ isRefreshing ? 'Refreshing...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards - Clickable -->
      <div class="feedback-summary">
        <div class="summary-card clickable" [class.active]="viewMode === 'pending'" (click)="setViewMode('pending')">
          <div class="summary-icon pending">
            <i class="fa-solid fa-hourglass-half"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (pendingCount$ | async) ?? 0 }}</div>
            <div class="summary-label">Pending Review</div>
          </div>
          <i class="fa-solid fa-chevron-right summary-arrow"></i>
        </div>
        <div class="summary-card clickable" [class.active]="viewMode === 'reviewed'" (click)="setViewMode('reviewed')">
          <div class="summary-icon reviewed">
            <i class="fa-solid fa-check-circle"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (reviewedCount$ | async) ?? 0 }}</div>
            <div class="summary-label">Reviewed</div>
          </div>
          <i class="fa-solid fa-chevron-right summary-arrow"></i>
        </div>
        <div class="summary-card clickable" [class.active]="viewMode === 'suites'" (click)="setViewMode('suites')">
          <div class="summary-icon suites">
            <i class="fa-solid fa-layer-group"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (suiteCount$ | async) ?? 0 }}</div>
            <div class="summary-label">Test Suites</div>
          </div>
          <i class="fa-solid fa-chevron-right summary-arrow"></i>
        </div>
        <div class="summary-card">
          <div class="summary-icon accuracy">
            <i class="fa-solid fa-bullseye"></i>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ (accuracyRate$ | async) ?? 0 | number:'1.1-1' }}%</div>
            <div class="summary-label">Human-AI Agreement</div>
          </div>
        </div>
      </div>

      <!-- Filters Bar -->
      <div class="feedback-filters">
        <div class="filter-group">
          <label>View</label>
          <select [(ngModel)]="viewMode" (change)="onViewModeChange()">
            <option value="pending">Pending Reviews</option>
            <option value="reviewed">Reviewed Feedback</option>
            <option value="suites">By Test Suite</option>
          </select>
        </div>
        <div class="filter-group" *ngIf="viewMode === 'pending'">
          <label>Reason</label>
          <select [(ngModel)]="filters.reason" (change)="onFilterChange()">
            <option value="all">All Reasons</option>
            <option value="no-feedback">No Feedback</option>
            <option value="high-score-failed">High Score but Failed</option>
            <option value="low-score-passed">Low Score but Passed</option>
          </select>
        </div>
        <div class="filter-group" *ngIf="viewMode !== 'suites'">
          <label>Test Suite</label>
          <select [(ngModel)]="filters.suiteId" (change)="onFilterChange()">
            <option [ngValue]="null">All Suites</option>
            <option *ngFor="let suite of testSuites$ | async" [ngValue]="suite.ID">{{ suite.Name }}</option>
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
            <button class="clear-btn" *ngIf="filters.searchText" (click)="clearSearch()">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Pending Reviews View -->
      <div class="feedback-content" *ngIf="viewMode === 'pending'">
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

        <div class="feedback-list" *ngIf="(filteredPending$ | async) as items">
          <ng-container *ngIf="items.length > 0; else emptyPending">
            <div class="feedback-item" *ngFor="let item of items; trackBy: trackByTestRunId"
                 [class.expanded]="expandedItem === item.testRunID">
              <div class="item-header" (click)="toggleExpanded(item.testRunID)">
                <div class="item-main">
                  <div class="item-title">{{ item.testName }}</div>
                  <div class="item-meta">
                    <span class="meta-date">
                      <i class="fa-solid fa-clock"></i>
                      {{ item.runDateTime | date:'short' }}
                    </span>
                    <span class="meta-score">
                      Score: <strong>{{ (item.automatedScore * 10).toFixed(2) }}</strong>/10
                    </span>
                    <span class="meta-status" [class]="'status-' + item.automatedStatus.toLowerCase()">
                      {{ item.automatedStatus }}
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

              <div class="item-content" *ngIf="expandedItem === item.testRunID" [@slideDown]>
                <div class="feedback-form">
                  <div class="form-section">
                    <h4>Provide Your Feedback</h4>
                    <div class="rating-section">
                      <label>Human Rating</label>
                      <div class="rating-stars-input">
                        <button *ngFor="let star of [1,2,3,4,5,6,7,8,9,10]"
                                class="star-btn"
                                [class.filled]="star <= item.feedbackRating"
                                (click)="setRating(item, star)">
                          <i class="fa-solid fa-star"></i>
                        </button>
                        <span class="rating-display">{{ item.feedbackRating }}/10</span>
                      </div>
                    </div>
                    <div class="correctness-section">
                      <label>Is the Automated Result Correct?</label>
                      <div class="correctness-buttons">
                        <button class="correctness-btn correct" [class.active]="item.feedbackIsCorrect === true"
                                (click)="setCorrectness(item, true)">
                          <i class="fa-solid fa-check"></i>
                          Correct
                        </button>
                        <button class="correctness-btn incorrect" [class.active]="item.feedbackIsCorrect === false"
                                (click)="setCorrectness(item, false)">
                          <i class="fa-solid fa-times"></i>
                          Incorrect
                        </button>
                      </div>
                    </div>
                    <div class="form-group">
                      <label>Comments / Correction Notes</label>
                      <textarea
                        [(ngModel)]="item.feedbackComments"
                        rows="3"
                        class="comments-textarea"
                        placeholder="Explain your assessment or provide correction notes..."
                      ></textarea>
                    </div>
                    <div class="form-actions">
                      <button class="submit-btn" (click)="submitFeedback(item)" [disabled]="isSubmitting">
                        <i class="fa-solid fa-paper-plane"></i>
                        {{ isSubmitting ? 'Submitting...' : 'Submit Feedback' }}
                      </button>
                      <button class="view-btn" (click)="viewFullDetails(item)">
                        <i class="fa-solid fa-external-link"></i>
                        View Full Details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ng-container>
          <ng-template #emptyPending>
            <div class="empty-state success">
              <i class="fa-solid fa-check-double"></i>
              <h3>All Caught Up!</h3>
              <p>No tests currently require feedback review.</p>
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Reviewed Feedback View -->
      <div class="feedback-content" *ngIf="viewMode === 'reviewed'">
        <div class="content-header">
          <h3>
            <i class="fa-solid fa-history"></i>
            Reviewed Feedback History
          </h3>
          <div class="sort-controls">
            <label>Sort by:</label>
            <select [(ngModel)]="reviewedSortBy" (change)="onReviewedSortChange()">
              <option value="date">Review Date</option>
              <option value="rating">Rating</option>
              <option value="test-name">Test Name</option>
            </select>
          </div>
        </div>

        <div class="feedback-list" *ngIf="(filteredReviewed$ | async) as items">
          <ng-container *ngIf="items.length > 0; else emptyReviewed">
            <div class="reviewed-item" *ngFor="let item of items; trackBy: trackByReviewedId">
              <div class="reviewed-header">
                <div class="reviewed-main">
                  <div class="reviewed-title">{{ item.testName }}</div>
                  <div class="reviewed-meta">
                    <span class="meta-reviewer">
                      <i class="fa-solid fa-user"></i>
                      {{ item.reviewerName }}
                    </span>
                    <span class="meta-date">
                      <i class="fa-solid fa-calendar"></i>
                      {{ item.reviewedAt | date:'short' }}
                    </span>
                  </div>
                </div>
                <div class="reviewed-rating">
                  <div class="rating-stars">
                    <i class="fa-solid fa-star" *ngFor="let s of [1,2,3,4,5,6,7,8,9,10]"
                       [class.filled]="s <= item.rating"></i>
                  </div>
                  <span class="rating-text">{{ item.rating }}/10</span>
                </div>
                <div class="reviewed-verdict">
                  <span class="verdict-badge" [class.correct]="item.isCorrect" [class.incorrect]="!item.isCorrect">
                    <i class="fa-solid" [class.fa-check]="item.isCorrect" [class.fa-times]="!item.isCorrect"></i>
                    {{ item.isCorrect ? 'Correct' : 'Incorrect' }}
                  </span>
                </div>
                <button class="view-btn-small" (click)="viewTestRun(item.testRunID)">
                  <i class="fa-solid fa-external-link"></i>
                </button>
              </div>
              <div class="reviewed-comments" *ngIf="item.comments">
                <p>{{ item.comments }}</p>
              </div>
            </div>
          </ng-container>
          <ng-template #emptyReviewed>
            <div class="empty-state">
              <i class="fa-solid fa-clipboard"></i>
              <h3>No Reviews Yet</h3>
              <p>No feedback has been submitted yet. Start by reviewing pending tests.</p>
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Test Suite Aggregation View -->
      <div class="feedback-content" *ngIf="viewMode === 'suites'">
        <div class="content-header">
          <h3>
            <i class="fa-solid fa-layer-group"></i>
            Feedback by Test Suite
          </h3>
        </div>

        <div class="suites-list" *ngIf="(suiteAggregations$ | async) as suites">
          <ng-container *ngIf="suites.length > 0; else emptySuites">
            <div class="suite-card" *ngFor="let suite of suites; trackBy: trackBySuiteId"
                 (click)="selectSuite(suite.suiteId)">
              <div class="suite-header">
                <div class="suite-icon">
                  <i class="fa-solid fa-layer-group"></i>
                </div>
                <div class="suite-info">
                  <h4>{{ suite.suiteName }}</h4>
                  <div class="suite-meta">
                    <span>{{ suite.totalRuns }} test runs</span>
                  </div>
                </div>
              </div>
              <div class="suite-stats">
                <div class="suite-stat">
                  <div class="stat-value pending">{{ suite.pendingCount }}</div>
                  <div class="stat-label">Pending</div>
                </div>
                <div class="suite-stat">
                  <div class="stat-value reviewed">{{ suite.reviewedCount }}</div>
                  <div class="stat-label">Reviewed</div>
                </div>
                <div class="suite-stat">
                  <div class="stat-value">{{ suite.avgRating | number:'1.1-1' }}</div>
                  <div class="stat-label">Avg Rating</div>
                </div>
                <div class="suite-stat">
                  <div class="stat-value" [class.good]="suite.agreementRate >= 70" [class.bad]="suite.agreementRate < 50">
                    {{ suite.agreementRate | number:'1.0-0' }}%
                  </div>
                  <div class="stat-label">Agreement</div>
                </div>
                <div class="suite-stat">
                  <div class="stat-value" [class.good]="suite.passRate >= 80" [class.bad]="suite.passRate < 50">
                    {{ suite.passRate | number:'1.0-0' }}%
                  </div>
                  <div class="stat-label">Pass Rate</div>
                </div>
              </div>
              <i class="fa-solid fa-chevron-right suite-arrow"></i>
            </div>
          </ng-container>
          <ng-template #emptySuites>
            <div class="empty-state">
              <i class="fa-solid fa-layer-group"></i>
              <h3>No Test Suites</h3>
              <p>No test suites have been created yet.</p>
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Summary Statistics -->
      <div class="feedback-stats">
        <h3>
          <i class="fa-solid fa-chart-pie"></i>
          Feedback Statistics
        </h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Feedback</div>
            <div class="stat-value">{{ (totalFeedback$ | async) ?? 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avg Rating</div>
            <div class="stat-value">{{ (avgRating$ | async) ?? 0 | number:'1.1-1' }}/10</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Agreement Rate</div>
            <div class="stat-value">{{ (agreementRate$ | async) ?? 0 | number:'1.1-1' }}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Discrepancy Count</div>
            <div class="stat-value">{{ (discrepancyCount$ | async) ?? 0 }}</div>
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

    .testing-feedback {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    /* Header */
    .feedback-header {
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

    .action-btn {
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

    .action-btn:hover:not(:disabled) {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Summary Cards */
    .feedback-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      gap: 16px;
      transition: all 0.2s ease;
      position: relative;
    }

    .summary-card.clickable {
      cursor: pointer;
    }

    .summary-card.clickable:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    }

    .summary-card.active {
      border: 2px solid #3b82f6;
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    }

    .summary-icon {
      width: 52px;
      height: 52px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: white;
      flex-shrink: 0;
    }

    .summary-icon.pending {
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
    }

    .summary-icon.reviewed {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    }

    .summary-icon.suites {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    }

    .summary-icon.accuracy {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }

    .summary-content {
      flex: 1;
    }

    .summary-value {
      font-size: 28px;
      font-weight: 700;
      color: #1e293b;
      line-height: 1;
      margin-bottom: 4px;
    }

    .summary-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-arrow {
      color: #94a3b8;
      font-size: 14px;
    }

    /* Filters */
    .feedback-filters {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      background: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      flex-wrap: wrap;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 140px;
    }

    .filter-group.search {
      flex: 1;
      min-width: 200px;
    }

    .filter-group label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .filter-group select {
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 13px;
      background: white;
      color: #1e293b;
      cursor: pointer;
    }

    .filter-group select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .search-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-input-wrapper > i {
      position: absolute;
      left: 12px;
      color: #94a3b8;
      font-size: 13px;
    }

    .search-input-wrapper input {
      flex: 1;
      padding: 10px 40px 10px 36px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 13px;
    }

    .search-input-wrapper input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .clear-btn {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 6px;
      border-radius: 4px;
    }

    .clear-btn:hover {
      color: #64748b;
      background: #f1f5f9;
    }

    /* Content Area */
    .feedback-content {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      margin-bottom: 20px;
    }

    .content-header {
      padding: 20px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .content-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .content-header h3 i {
      color: #3b82f6;
    }

    .sort-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #64748b;
    }

    .sort-controls select {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 12px;
      background: white;
    }

    /* Feedback List */
    .feedback-list {
      max-height: 600px;
      overflow-y: auto;
    }

    .feedback-item {
      border-bottom: 1px solid #f1f5f9;
      transition: all 0.2s ease;
    }

    .feedback-item.expanded {
      background: #f8fafc;
    }

    .item-header {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .item-header:hover {
      background: rgba(59, 130, 246, 0.04);
    }

    .item-main {
      flex: 1;
      min-width: 0;
    }

    .item-title {
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
      gap: 16px;
      font-size: 12px;
      color: #64748b;
      flex-wrap: wrap;
    }

    .item-meta span {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .meta-status {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
    }

    .meta-status.status-passed { background: #dcfce7; color: #16a34a; }
    .meta-status.status-failed { background: #fee2e2; color: #dc2626; }
    .meta-status.status-error { background: #fef3c7; color: #d97706; }
    .meta-status.status-running { background: #dbeafe; color: #2563eb; }

    .item-reason {
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

    .reason-badge.no-feedback {
      background: #dbeafe;
      color: #2563eb;
    }

    .reason-badge.high-score-failed {
      background: #fee2e2;
      color: #dc2626;
    }

    .reason-badge.low-score-passed {
      background: #fef3c7;
      color: #d97706;
    }

    .expand-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      transition: all 0.2s ease;
      font-size: 14px;
    }

    .expand-btn:hover {
      background: #e2e8f0;
      color: #64748b;
    }

    /* Expanded Content */
    .item-content {
      padding: 20px;
      border-top: 1px solid #e2e8f0;
      background: white;
    }

    .feedback-form {
      max-width: 600px;
    }

    .form-section h4 {
      margin: 0 0 20px 0;
      font-size: 15px;
      font-weight: 600;
      color: #1e293b;
    }

    .rating-section,
    .correctness-section {
      margin-bottom: 20px;
    }

    .rating-section label,
    .correctness-section label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 10px;
    }

    .rating-stars-input {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .star-btn {
      background: none;
      border: none;
      font-size: 22px;
      color: #e2e8f0;
      cursor: pointer;
      padding: 2px;
      transition: all 0.15s ease;
    }

    .star-btn:hover {
      transform: scale(1.2);
    }

    .star-btn.filled {
      color: #f59e0b;
    }

    .rating-display {
      margin-left: 12px;
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
    }

    .correctness-buttons {
      display: flex;
      gap: 12px;
    }

    .correctness-btn {
      flex: 1;
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
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .correctness-btn.correct:hover,
    .correctness-btn.correct.active {
      border-color: #22c55e;
      background: #f0fdf4;
      color: #16a34a;
    }

    .correctness-btn.incorrect:hover,
    .correctness-btn.incorrect.active {
      border-color: #ef4444;
      background: #fef2f2;
      color: #dc2626;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 8px;
    }

    .comments-textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      min-height: 80px;
    }

    .comments-textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }

    .submit-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
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
      opacity: 0.6;
      cursor: not-allowed;
    }

    .view-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: white;
      color: #64748b;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .view-btn:hover {
      border-color: #cbd5e1;
      background: #f8fafc;
    }

    /* Reviewed Items */
    .reviewed-item {
      padding: 16px 20px;
      border-bottom: 1px solid #f1f5f9;
    }

    .reviewed-header {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .reviewed-main {
      flex: 1;
      min-width: 0;
    }

    .reviewed-title {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 4px;
    }

    .reviewed-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #64748b;
    }

    .reviewed-meta span {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .reviewed-rating {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .rating-stars {
      display: flex;
      gap: 2px;
    }

    .rating-stars i {
      font-size: 12px;
      color: #e2e8f0;
    }

    .rating-stars i.filled {
      color: #f59e0b;
    }

    .rating-text {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }

    .reviewed-verdict {
      flex-shrink: 0;
    }

    .verdict-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 11px;
      font-weight: 600;
    }

    .verdict-badge.correct {
      background: #dcfce7;
      color: #16a34a;
    }

    .verdict-badge.incorrect {
      background: #fee2e2;
      color: #dc2626;
    }

    .view-btn-small {
      background: none;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px;
      color: #64748b;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .view-btn-small:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .reviewed-comments {
      margin-top: 12px;
      padding: 12px;
      background: #f8fafc;
      border-radius: 8px;
      border-left: 3px solid #3b82f6;
    }

    .reviewed-comments p {
      margin: 0;
      font-size: 13px;
      color: #475569;
      line-height: 1.5;
    }

    /* Suite Cards */
    .suites-list {
      padding: 16px;
    }

    .suite-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: 12px;
    }

    .suite-card:hover {
      border-color: #3b82f6;
      background: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .suite-card:last-child {
      margin-bottom: 0;
    }

    .suite-header {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
      min-width: 0;
    }

    .suite-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 18px;
      flex-shrink: 0;
    }

    .suite-info h4 {
      margin: 0 0 4px 0;
      font-size: 15px;
      font-weight: 600;
      color: #1e293b;
    }

    .suite-meta {
      font-size: 12px;
      color: #64748b;
    }

    .suite-stats {
      display: flex;
      gap: 20px;
    }

    .suite-stat {
      text-align: center;
      min-width: 60px;
    }

    .suite-stat .stat-value {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
    }

    .suite-stat .stat-value.pending {
      color: #f97316;
    }

    .suite-stat .stat-value.reviewed {
      color: #22c55e;
    }

    .suite-stat .stat-value.good {
      color: #22c55e;
    }

    .suite-stat .stat-value.bad {
      color: #ef4444;
    }

    .suite-stat .stat-label {
      font-size: 10px;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
    }

    .suite-arrow {
      color: #94a3b8;
      font-size: 14px;
    }

    /* Empty States */
    .empty-state {
      padding: 60px 20px;
      text-align: center;
    }

    .empty-state i {
      font-size: 56px;
      margin-bottom: 16px;
      color: #cbd5e1;
    }

    .empty-state.success i {
      color: #22c55e;
    }

    .empty-state h3 {
      font-size: 18px;
      color: #475569;
      margin: 0 0 8px 0;
      font-weight: 600;
    }

    .empty-state p {
      font-size: 14px;
      color: #94a3b8;
      margin: 0;
    }

    /* Statistics */
    .feedback-stats {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .feedback-stats h3 {
      margin: 0 0 20px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .feedback-stats h3 i {
      color: #3b82f6;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
    }

    .stat-card {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 16px;
      border-radius: 10px;
      text-align: center;
    }

    .stat-card .stat-label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .stat-card .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .feedback-summary {
        grid-template-columns: repeat(2, 1fr);
      }

      .suite-stats {
        flex-wrap: wrap;
        gap: 12px;
      }
    }

    @media (max-width: 768px) {
      .testing-feedback {
        padding: 16px;
      }

      .feedback-header {
        flex-direction: column;
        gap: 16px;
        align-items: flex-start;
      }

      .feedback-summary {
        grid-template-columns: 1fr 1fr;
      }

      .summary-card {
        padding: 16px;
      }

      .summary-value {
        font-size: 22px;
      }

      .feedback-filters {
        flex-direction: column;
      }

      .filter-group {
        min-width: 100%;
      }

      .item-header {
        flex-wrap: wrap;
      }

      .item-reason {
        width: 100%;
        margin-top: 8px;
      }

      .correctness-buttons {
        flex-direction: column;
      }

      .form-actions {
        flex-direction: column;
      }

      .reviewed-header {
        flex-wrap: wrap;
      }

      .suite-card {
        flex-direction: column;
        align-items: flex-start;
      }

      .suite-stats {
        width: 100%;
        justify-content: space-between;
      }
    }
  `],
  animations: []
})
export class TestingFeedbackComponent implements OnInit, OnDestroy {
  @Input() initialState?: {
    filters?: Partial<FeedbackFilter>;
    viewMode?: ViewMode;
    sortBy?: string;
  };
  @Output() stateChange = new EventEmitter<{
    filters: FeedbackFilter;
    viewMode: ViewMode;
    sortBy: string;
  }>();

  private destroy$ = new Subject<void>();
  private filterTrigger$ = new BehaviorSubject<void>(undefined);
  private metadata = new Metadata();

  viewMode: ViewMode = 'pending';
  isRefreshing = false;
  isSubmitting = false;
  expandedItem: string | null = null;

  filters: FeedbackFilter = {
    status: 'all',
    reason: 'all',
    suiteId: null,
    searchText: ''
  };

  sortBy: 'date' | 'priority' | 'test-name' = 'date';
  reviewedSortBy: 'date' | 'rating' | 'test-name' = 'date';

  // Observables
  pendingCount$!: Observable<number>;
  reviewedCount$!: Observable<number>;
  suiteCount$!: Observable<number>;
  accuracyRate$!: Observable<number>;
  totalFeedback$!: Observable<number>;
  avgRating$!: Observable<number>;
  agreementRate$!: Observable<number>;
  discrepancyCount$!: Observable<number>;

  filteredPending$!: Observable<EnhancedFeedbackPending[]>;
  filteredReviewed$!: Observable<ReviewedFeedback[]>;
  suiteAggregations$!: Observable<SuiteAggregation[]>;
  testSuites$!: Observable<TestSuiteEntity[]>;

  // Local data cache for filtering
  private pendingData: EnhancedFeedbackPending[] = [];
  private reviewedData: ReviewedFeedback[] = [];

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.initialState) {
      if (this.initialState.filters) {
        this.filters = { ...this.filters, ...this.initialState.filters };
      }
      if (this.initialState.viewMode) {
        this.viewMode = this.initialState.viewMode;
      }
      if (this.initialState.sortBy) {
        this.sortBy = this.initialState.sortBy as 'date' | 'priority' | 'test-name';
      }
    }

    this.setupObservables();
    this.loadTestSuites();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables(): void {
    // Stats from service
    const feedbackStats$ = this.instrumentationService.feedbackStats$.pipe(
      takeUntil(this.destroy$),
      shareReplay(1)
    );

    this.pendingCount$ = this.instrumentationService.pendingFeedback$.pipe(
      map(items => items.length),
      takeUntil(this.destroy$)
    );

    this.reviewedCount$ = feedbackStats$.pipe(
      map(stats => stats.reviewedCount)
    );

    this.accuracyRate$ = feedbackStats$.pipe(
      map(stats => stats.accuracyRate)
    );

    this.totalFeedback$ = feedbackStats$.pipe(
      map(stats => stats.totalFeedback)
    );

    this.avgRating$ = feedbackStats$.pipe(
      map(stats => stats.avgRating)
    );

    this.agreementRate$ = feedbackStats$.pipe(
      map(stats => stats.agreementRate)
    );

    this.discrepancyCount$ = this.instrumentationService.pendingFeedback$.pipe(
      map(items => items.filter(f =>
        f.reason === 'high-score-failed' || f.reason === 'low-score-passed'
      ).length),
      takeUntil(this.destroy$)
    );

    // Filtered pending items
    this.filteredPending$ = combineLatest([
      this.instrumentationService.pendingFeedback$,
      this.filterTrigger$
    ]).pipe(
      map(([items]) => {
        const enhanced = items.map(f => ({
          ...f,
          feedbackRating: 5,
          feedbackIsCorrect: true,
          feedbackComments: ''
        }));
        this.pendingData = enhanced;
        return this.filterAndSortPending(enhanced);
      }),
      takeUntil(this.destroy$)
    );

    // Load and filter reviewed feedback
    this.filteredReviewed$ = combineLatest([
      this.loadReviewedFeedback(),
      this.filterTrigger$
    ]).pipe(
      map(([items]) => {
        this.reviewedData = items;
        return this.filterAndSortReviewed(items);
      }),
      takeUntil(this.destroy$)
    );

    // Suite aggregations
    this.suiteAggregations$ = this.loadSuiteAggregations().pipe(
      takeUntil(this.destroy$)
    );

    this.suiteCount$ = this.suiteAggregations$.pipe(
      map(suites => suites.length)
    );
  }

  private async loadTestSuites(): Promise<void> {
    const rv = new RunView();
    const result = await rv.RunView<TestSuiteEntity>({
      EntityName: 'MJ: Test Suites',
      ExtraFilter: "Status = 'Active'",
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    this.testSuites$ = new BehaviorSubject(result.Results || []).asObservable();
    this.cdr.markForCheck();
  }

  private loadReviewedFeedback(): Observable<ReviewedFeedback[]> {
    return combineLatest([
      this.instrumentationService.dateRange$,
      this.instrumentationService.isLoading$
    ]).pipe(
      switchMap(([dateRange]) => {
        return new Observable<ReviewedFeedback[]>(observer => {
          this.loadReviewedFeedbackAsync(dateRange.start, dateRange.end).then(
            data => {
              observer.next(data);
              observer.complete();
            },
            error => observer.error(error)
          );
        });
      }),
      shareReplay(1)
    );
  }

  private async loadReviewedFeedbackAsync(start: Date, end: Date): Promise<ReviewedFeedback[]> {
    const rv = new RunView();
    const result = await rv.RunView<TestRunFeedbackEntity>({
      EntityName: 'MJ: Test Run Feedbacks',
      ExtraFilter: `__mj_CreatedAt >= '${start.toISOString()}' AND __mj_CreatedAt <= '${end.toISOString()}'`,
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 500,
      ResultType: 'entity_object'
    });

    const feedbacks = result.Results || [];

    // Get test run details for each feedback
    if (feedbacks.length === 0) return [];

    const testRunIds = feedbacks.map(f => f.TestRunID);
    const testRunResult = await rv.RunView<TestRunEntity>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: `ID IN ('${testRunIds.join("','")}')`,
      ResultType: 'entity_object'
    });

    const testRunMap = new Map<string, TestRunEntity>();
    (testRunResult.Results || []).forEach(tr => testRunMap.set(tr.ID, tr));

    return feedbacks.map(f => {
      const testRun = testRunMap.get(f.TestRunID);
      return {
        id: f.ID,
        testRunID: f.TestRunID,
        testName: testRun?.Test || 'Unknown Test',
        rating: f.Rating || 0,
        isCorrect: f.IsCorrect ?? true,
        comments: f.CorrectionSummary || '',
        reviewerName: f.ReviewerUser || 'Unknown',
        reviewedAt: f.__mj_CreatedAt ? new Date(f.__mj_CreatedAt) : new Date(),
        automatedScore: testRun?.Score || 0,
        automatedStatus: testRun?.Status || 'Unknown'
      };
    });
  }

  private loadSuiteAggregations(): Observable<SuiteAggregation[]> {
    return combineLatest([
      this.instrumentationService.dateRange$,
      this.instrumentationService.isLoading$
    ]).pipe(
      switchMap(([dateRange]) => {
        return new Observable<SuiteAggregation[]>(observer => {
          this.loadSuiteAggregationsAsync(dateRange.start, dateRange.end).then(
            data => {
              observer.next(data);
              observer.complete();
            },
            error => observer.error(error)
          );
        });
      }),
      shareReplay(1)
    );
  }

  private async loadSuiteAggregationsAsync(start: Date, end: Date): Promise<SuiteAggregation[]> {
    const rv = new RunView();

    // Get all test suites
    const suitesResult = await rv.RunView<TestSuiteEntity>({
      EntityName: 'MJ: Test Suites',
      ExtraFilter: "Status = 'Active'",
      ResultType: 'entity_object'
    });

    const suites = suitesResult.Results || [];
    if (suites.length === 0) return [];

    // Get test runs in date range
    const runsResult = await rv.RunView<TestRunEntity>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      ResultType: 'entity_object'
    });

    const runs = runsResult.Results || [];

    // Get feedback in date range
    const feedbackResult = await rv.RunView<TestRunFeedbackEntity>({
      EntityName: 'MJ: Test Run Feedbacks',
      ExtraFilter: `__mj_CreatedAt >= '${start.toISOString()}'`,
      ResultType: 'entity_object'
    });

    const feedbacks = feedbackResult.Results || [];
    const feedbackMap = new Map<string, TestRunFeedbackEntity>();
    feedbacks.forEach(f => feedbackMap.set(f.TestRunID, f));

    // Aggregate by suite (simplified - would need TestSuiteTest join for accuracy)
    const aggregations: SuiteAggregation[] = suites.map(suite => {
      // Filter runs by test suite (simplified)
      const suiteRuns = runs; // In reality, need to join through TestSuiteTest

      const totalRuns = suiteRuns.length;
      const passedRuns = suiteRuns.filter(r => r.Status === 'Passed').length;

      const reviewedRuns = suiteRuns.filter(r => feedbackMap.has(r.ID));
      const reviewedCount = reviewedRuns.length;
      const pendingCount = totalRuns - reviewedCount;

      const ratings = reviewedRuns
        .map(r => feedbackMap.get(r.ID)?.Rating || 0)
        .filter(r => r > 0);
      const avgRating = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : 0;

      const correctCount = reviewedRuns
        .filter(r => feedbackMap.get(r.ID)?.IsCorrect === true).length;
      const agreementRate = reviewedCount > 0
        ? (correctCount / reviewedCount) * 100
        : 0;

      const passRate = totalRuns > 0 ? (passedRuns / totalRuns) * 100 : 0;

      return {
        suiteId: suite.ID,
        suiteName: suite.Name,
        totalRuns,
        reviewedCount,
        pendingCount,
        avgRating,
        agreementRate,
        passRate
      };
    });

    return aggregations.sort((a, b) => b.pendingCount - a.pendingCount);
  }

  private filterAndSortPending(items: EnhancedFeedbackPending[]): EnhancedFeedbackPending[] {
    let filtered = [...items];

    // Filter by reason
    if (this.filters.reason !== 'all') {
      filtered = filtered.filter(f => f.reason === this.filters.reason);
    }

    // Filter by search text
    if (this.filters.searchText) {
      const searchLower = this.filters.searchText.toLowerCase();
      filtered = filtered.filter(f =>
        f.testName.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (this.sortBy === 'date') {
        return b.runDateTime.getTime() - a.runDateTime.getTime();
      } else if (this.sortBy === 'priority') {
        const priorityOrder = { 'high-score-failed': 1, 'low-score-passed': 2, 'no-feedback': 3 };
        return (priorityOrder[a.reason] || 99) - (priorityOrder[b.reason] || 99);
      } else {
        return a.testName.localeCompare(b.testName);
      }
    });

    return filtered;
  }

  private filterAndSortReviewed(items: ReviewedFeedback[]): ReviewedFeedback[] {
    let filtered = [...items];

    // Filter by search text
    if (this.filters.searchText) {
      const searchLower = this.filters.searchText.toLowerCase();
      filtered = filtered.filter(f =>
        f.testName.toLowerCase().includes(searchLower) ||
        f.reviewerName.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (this.reviewedSortBy === 'date') {
        return b.reviewedAt.getTime() - a.reviewedAt.getTime();
      } else if (this.reviewedSortBy === 'rating') {
        return b.rating - a.rating;
      } else {
        return a.testName.localeCompare(b.testName);
      }
    });

    return filtered;
  }

  // Event handlers
  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.expandedItem = null;
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  onViewModeChange(): void {
    this.expandedItem = null;
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  onFilterChange(): void {
    this.filterTrigger$.next();
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  onSortChange(): void {
    this.filterTrigger$.next();
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  onReviewedSortChange(): void {
    this.filterTrigger$.next();
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.filters.searchText = '';
    this.onFilterChange();
  }

  toggleExpanded(testRunID: string): void {
    this.expandedItem = this.expandedItem === testRunID ? null : testRunID;
  }

  setRating(item: EnhancedFeedbackPending, rating: number): void {
    item.feedbackRating = rating;
  }

  setCorrectness(item: EnhancedFeedbackPending, isCorrect: boolean): void {
    item.feedbackIsCorrect = isCorrect;
  }

  async submitFeedback(item: EnhancedFeedbackPending): Promise<void> {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.cdr.markForCheck();

    try {
      const success = await this.instrumentationService.submitFeedback(
        item.testRunID,
        item.feedbackRating,
        item.feedbackIsCorrect,
        item.feedbackComments
      );

      if (success) {
        this.expandedItem = null;
        // Refresh will happen via the service
      } else {
        console.error('Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  viewFullDetails(item: EnhancedFeedbackPending): void {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(item.testRunID));
  }

  viewTestRun(testRunId: string): void {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(testRunId));
  }

  selectSuite(suiteId: string): void {
    this.filters.suiteId = suiteId;
    this.viewMode = 'pending';
    this.onFilterChange();
  }

  refresh(): void {
    this.isRefreshing = true;
    this.cdr.markForCheck();

    this.instrumentationService.refresh();

    setTimeout(() => {
      this.isRefreshing = false;
      this.cdr.markForCheck();
    }, 1500);
  }

  formatReason(reason: string): string {
    switch (reason) {
      case 'no-feedback': return 'No Feedback';
      case 'high-score-failed': return 'High Score Failed';
      case 'low-score-passed': return 'Low Score Passed';
      default: return reason;
    }
  }

  // Track by functions
  trackByTestRunId(index: number, item: EnhancedFeedbackPending): string {
    return item.testRunID;
  }

  trackByReviewedId(index: number, item: ReviewedFeedback): string {
    return item.id;
  }

  trackBySuiteId(index: number, item: SuiteAggregation): string {
    return item.suiteId;
  }

  private emitStateChange(): void {
    this.stateChange.emit({
      filters: this.filters,
      viewMode: this.viewMode,
      sortBy: this.sortBy
    });
  }
}
