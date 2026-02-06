import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TestRunSummary } from '../../services/testing-instrumentation.service';
import { OracleResult } from './oracle-breakdown-table.component';

@Component({
  standalone: false,
  selector: 'app-test-run-detail-panel',
  template: `
    @if (testRun) {
      <div class="test-run-detail-panel">
        <div class="detail-header">
          <div class="header-left">
            <h3>{{ testRun.testName }}</h3>
            <div class="header-meta">
              <span class="test-type">
                <i class="fa-solid fa-tag"></i>
                {{ testRun.testType }}
              </span>
              <span class="run-time">
                <i class="fa-solid fa-clock"></i>
                {{ testRun.runDateTime | date:'medium' }}
              </span>
            </div>
          </div>
          <div class="header-right">
            <app-test-status-badge [status]="testRun.status"></app-test-status-badge>
            @if (closeable) {
              <button class="close-btn" (click)="onClose()">
                <i class="fa-solid fa-times"></i>
              </button>
            }
          </div>
        </div>
        <div class="detail-content">
          <!-- Main Metrics -->
          <div class="metrics-section">
            <div class="metric-card">
              <div class="metric-label">Score</div>
              <app-score-indicator [score]="testRun.score" [showBar]="true" [showIcon]="true"></app-score-indicator>
            </div>
            <div class="metric-card">
              <div class="metric-label">Cost</div>
              <app-cost-display [cost]="testRun.cost" [showIcon]="true"></app-cost-display>
            </div>
            <div class="metric-card">
              <div class="metric-label">Duration</div>
              <div class="metric-value">{{ formatDuration(testRun.duration) }}</div>
            </div>
            @if (testRun.targetType) {
              <div class="metric-card">
                <div class="metric-label">Target</div>
                <div class="metric-value target-link" (click)="onViewTarget()">
                  <i class="fa-solid fa-external-link-alt"></i>
                  {{ testRun.targetType }}
                </div>
              </div>
            }
          </div>
          <!-- Oracle Breakdown -->
          @if (oracleResults && oracleResults.length > 0) {
            <div class="oracle-section">
              <app-oracle-breakdown-table [results]="oracleResults"></app-oracle-breakdown-table>
            </div>
          }
          <!-- Result Details -->
          @if (resultDetails) {
            <div class="details-section">
              <div class="section-header">
                <h4>
                  <i class="fa-solid fa-file-alt"></i>
                  Result Details
                </h4>
                <button class="toggle-btn" (click)="toggleResultDetails()">
                  <i class="fa-solid" [class.fa-chevron-down]="!showResultDetails" [class.fa-chevron-up]="showResultDetails"></i>
                </button>
              </div>
              @if (showResultDetails) {
                <div class="details-content">
                  <pre class="json-viewer">{{ formatJSON(resultDetails) }}</pre>
                </div>
              }
            </div>
          }
          <!-- Feedback Section -->
          <div class="feedback-section">
            <div class="section-header">
              <h4>
                <i class="fa-solid fa-comment-dots"></i>
                Human Feedback
              </h4>
            </div>
            <div class="feedback-form">
              <div class="form-row">
                <div class="form-group">
                  <label>Rating (1-10)</label>
                  <input
                    type="number"
                    [(ngModel)]="feedbackRating"
                    min="1"
                    max="10"
                    class="rating-input"
                    />
                </div>
                <div class="form-group">
                  <label>Is Correct?</label>
                  <div class="checkbox-group">
                    <label class="checkbox-label">
                      <input type="checkbox" [(ngModel)]="feedbackIsCorrect" />
                      <span>Yes, the automated result is correct</span>
                    </label>
                  </div>
                </div>
              </div>
              <div class="form-group">
                <label>Comments</label>
                <textarea
                  [(ngModel)]="feedbackComments"
                  rows="3"
                  class="comments-textarea"
                  placeholder="Enter your feedback comments..."
                ></textarea>
              </div>
              <button class="submit-btn" (click)="onSubmitFeedback()" [disabled]="submittingFeedback">
                <i class="fa-solid fa-paper-plane"></i>
                {{ submittingFeedback ? 'Submitting...' : 'Submit Feedback' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
    `,
  styles: [`
    .test-run-detail-panel {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .detail-header {
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .header-left h3 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .header-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      opacity: 0.9;
    }

    .header-meta span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .close-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .detail-content {
      padding: 20px;
    }

    .metrics-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .metric-card {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid #2196f3;
    }

    .metric-label {
      font-size: 11px;
      color: #666;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .metric-value {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .target-link {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #2196f3;
      cursor: pointer;
      font-size: 14px;
    }

    .target-link:hover {
      text-decoration: underline;
    }

    .oracle-section,
    .details-section,
    .feedback-section {
      margin-bottom: 24px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
    }

    .section-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-header h4 i {
      color: #2196f3;
    }

    .toggle-btn {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.2s ease;
    }

    .toggle-btn:hover {
      background: #f0f0f0;
    }

    .details-content {
      margin-top: 12px;
    }

    .json-viewer {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 16px;
      font-size: 11px;
      line-height: 1.5;
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
    }

    .feedback-form {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
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

    .submit-btn {
      background: #2196f3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s ease;
    }

    .submit-btn:hover:not(:disabled) {
      background: #1976d2;
    }

    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .form-row {
        grid-template-columns: 1fr;
      }

      .metrics-section {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class TestRunDetailPanelComponent {
  @Input() testRun!: TestRunSummary;
  @Input() oracleResults: OracleResult[] = [];
  @Input() resultDetails: any = null;
  @Input() closeable = true;

  @Output() close = new EventEmitter<void>();
  @Output() viewTarget = new EventEmitter<{ type: string; id: string }>();
  @Output() submitFeedback = new EventEmitter<{
    rating: number;
    isCorrect: boolean;
    comments: string;
  }>();

  showResultDetails = false;
  feedbackRating = 5;
  feedbackIsCorrect = true;
  feedbackComments = '';
  submittingFeedback = false;

  formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  formatJSON(obj: any): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (error) {
      return String(obj);
    }
  }

  toggleResultDetails(): void {
    this.showResultDetails = !this.showResultDetails;
  }

  onClose(): void {
    this.close.emit();
  }

  onViewTarget(): void {
    if (this.testRun.targetType && this.testRun.targetLogID) {
      this.viewTarget.emit({
        type: this.testRun.targetType,
        id: this.testRun.targetLogID
      });
    }
  }

  async onSubmitFeedback(): Promise<void> {
    this.submittingFeedback = true;
    this.submitFeedback.emit({
      rating: this.feedbackRating,
      isCorrect: this.feedbackIsCorrect,
      comments: this.feedbackComments
    });

    // Reset after submission
    setTimeout(() => {
      this.submittingFeedback = false;
      this.feedbackRating = 5;
      this.feedbackIsCorrect = true;
      this.feedbackComments = '';
    }, 1000);
  }
}
