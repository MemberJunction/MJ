import { Component, OnInit, Input } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { Metadata, UserInfo, RunView } from '@memberjunction/core';
import { TestRunFeedbackEntity } from '@memberjunction/core-entities';

export interface TestFeedbackDialogData {
  testRunId: string;
  conversationDetailId?: string;
  currentUser: UserInfo;
}

@Component({
  standalone: false,
  selector: 'mj-test-feedback-dialog',
  template: `
    <kendo-dialog
      [title]="existingFeedback ? 'Update Test Feedback' : 'Provide Test Feedback'"
      [width]="600"
      [height]="680"
      (close)="onCancel()">

      <div class="feedback-dialog-content" *ngIf="!isLoading">
        <div class="feedback-section">
          <label class="feedback-label">Overall Rating</label>
          <div class="star-rating">
            <span *ngFor="let star of [1,2,3,4,5]"
                  class="star"
                  [class.selected]="star <= rating"
                  [class.hover]="star <= hoverRating"
                  (click)="setRating(star)"
                  (mouseenter)="hoverRating = star"
                  (mouseleave)="hoverRating = 0">
              <i class="fas fa-star"></i>
            </span>
            <span class="rating-text" *ngIf="rating > 0">{{ rating }} / 5</span>
          </div>
        </div>

        <div class="feedback-section">
          <label class="feedback-label" for="correct">Was the result correct?</label>
          <div class="correctness-options">
            <label class="radio-option">
              <input type="radio" name="correct" [value]="true" [(ngModel)]="isCorrect">
              <span>Yes</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="correct" [value]="false" [(ngModel)]="isCorrect">
              <span>No</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="correct" [value]="null" [(ngModel)]="isCorrect">
              <span>Not Sure</span>
            </label>
          </div>
        </div>

        <div class="feedback-section">
          <label class="feedback-label" for="comments">Correction Summary / Comments</label>
          <textarea
            id="comments"
            class="feedback-textarea"
            [(ngModel)]="comments"
            placeholder="Provide detailed feedback, corrections, or comments about this test execution..."
            rows="10"></textarea>
        </div>

        <div class="feedback-info" *ngIf="isSaving">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Saving feedback...</span>
        </div>

        <div class="feedback-error" *ngIf="errorMessage">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ errorMessage }}</span>
        </div>
      </div>

      <div class="feedback-dialog-content" *ngIf="isLoading">
        <div class="feedback-info">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading existing feedback...</span>
        </div>
      </div>

      <kendo-dialog-actions>
        <button kendoButton (click)="onCancel()" [disabled]="isSaving || isLoading">Cancel</button>
        <button kendoButton
                [primary]="true"
                (click)="onSubmit()"
                [disabled]="!canSubmit() || isSaving || isLoading">
          <i class="fas" [ngClass]="isSaving ? 'fa-spinner fa-spin' : 'fa-check'"></i>
          {{ isSaving ? 'Saving...' : (existingFeedback ? 'Update Feedback' : 'Submit Feedback') }}
        </button>
      </kendo-dialog-actions>
    </kendo-dialog>
  `,
  styles: [`
    .feedback-dialog-content {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .feedback-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .feedback-label {
      font-weight: 600;
      font-size: 14px;
      color: #333;
    }

    .star-rating {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .star {
      font-size: 28px;
      color: #ddd;
      cursor: pointer;
      transition: color 0.2s ease;
    }

    .star.selected,
    .star.hover {
      color: #ffa500;
    }

    .star:hover {
      transform: scale(1.1);
    }

    .rating-text {
      font-size: 14px;
      font-weight: 600;
      color: #666;
      margin-left: 8px;
    }

    .correctness-options {
      display: flex;
      gap: 20px;
      padding: 8px 0;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 14px;
      color: #333;
    }

    .radio-option input[type="radio"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .feedback-textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      min-height: 120px;
    }

    .feedback-textarea:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
    }

    .feedback-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #e3f2fd;
      border-radius: 4px;
      color: #1976d2;
      font-size: 14px;
    }

    .feedback-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #ffebee;
      border-radius: 4px;
      color: #c62828;
      font-size: 14px;
    }
  `]
})
export class TestFeedbackDialogComponent implements OnInit {
  @Input() data!: TestFeedbackDialogData;

  rating = 0;
  hoverRating = 0;
  isCorrect: boolean | null = null;
  comments = '';
  isSaving = false;
  isLoading = false;
  errorMessage = '';
  existingFeedback: TestRunFeedbackEntity | null = null;

  private metadata = new Metadata();

  constructor(private dialogRef: DialogRef) {}

  async ngOnInit(): Promise<void> {
    if (!this.data) {
      this.errorMessage = 'Invalid dialog data';
      return;
    }

    // Load existing feedback if it exists
    await this.loadExistingFeedback();
  }

  private async loadExistingFeedback(): Promise<void> {
    this.isLoading = true;

    try {
      const rv = new RunView();
      const result = await rv.RunView<TestRunFeedbackEntity>({
        EntityName: 'MJ: Test Run Feedbacks',
        ExtraFilter: `TestRunID='${this.data.testRunId}' AND ReviewerUserID='${this.data.currentUser.ID}'`,
        ResultType: 'entity_object'
      }, this.data.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        this.existingFeedback = result.Results[0];

        // Pre-populate form with existing feedback
        this.rating = this.existingFeedback.Rating || 0;
        this.isCorrect = this.existingFeedback.IsCorrect;
        this.comments = this.existingFeedback.CorrectionSummary || '';
      }
    } catch (error) {
      console.error('Error loading existing feedback:', error);
      // Don't show error to user - just allow them to create new feedback
    } finally {
      this.isLoading = false;
    }
  }

  setRating(star: number): void {
    this.rating = star;
  }

  canSubmit(): boolean {
    return this.rating > 0 && this.comments.trim().length > 0;
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit() || this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      let feedback: TestRunFeedbackEntity;

      if (this.existingFeedback) {
        // Update existing feedback
        feedback = this.existingFeedback;
      } else {
        // Create new feedback entity
        feedback = await this.metadata.GetEntityObject<TestRunFeedbackEntity>(
          'MJ: Test Run Feedbacks',
          this.data.currentUser
        );
        feedback.TestRunID = this.data.testRunId;
        feedback.ReviewerUserID = this.data.currentUser.ID;
      }

      // Update fields (for both new and existing)
      feedback.Rating = this.rating;
      feedback.IsCorrect = this.isCorrect;
      feedback.CorrectionSummary = this.comments.trim() || null;

      const result = await feedback.Save();

      if (result) {
        this.dialogRef.close({ success: true, feedbackId: feedback.ID });
      } else {
        this.errorMessage = feedback.LatestResult?.Message || 'Failed to save feedback';
        this.isSaving = false;
      }
    } catch (error) {
      this.errorMessage = (error as Error).message || 'An error occurred while saving feedback';
      this.isSaving = false;
    }
  }

  onCancel(): void {
    this.dialogRef.close({ success: false });
  }
}
