import { Component, OnInit, Input, ChangeDetectorRef } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { Metadata, UserInfo, RunView } from '@memberjunction/core';
import { MJTestRunFeedbackEntity } from '@memberjunction/core-entities';

export interface TestFeedbackDialogData {
  testRunId: string;
  conversationDetailId?: string;
  currentUser: UserInfo;
}

@Component({
  standalone: false,
  selector: 'mj-test-feedback-dialog',
  template: `
      @if (!isLoading) {
        <div class="feedback-dialog-content">
          <div class="feedback-section">
            <label class="feedback-label">Overall Rating</label>
            <div class="rating-scale">
              <div class="rating-numbers">
                @for (num of [1,2,3,4,5,6,7,8,9,10]; track num) {
                  <button
                    type="button"
                    class="rating-button"
                    [class.selected]="num === rating"
                    [class.hover]="num === hoverRating"
                    [class.low]="num <= 3"
                    [class.mid]="num >= 4 && num <= 6"
                    [class.high]="num >= 7"
                    (click)="setRating(num)"
                    (mouseenter)="hoverRating = num"
                    (mouseleave)="hoverRating = 0">
                    {{ num }}
                  </button>
                }
              </div>
              <div class="rating-labels">
                <span class="label-low">Poor</span>
                <span class="label-mid">Average</span>
                <span class="label-high">Excellent</span>
              </div>
              @if (rating > 0) {
                <div class="rating-description">
                  <span class="rating-value">{{ rating }}</span> / 10
                  <span class="rating-label">{{ getRatingLabel() }}</span>
                </div>
              }
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
            <label class="feedback-label" for="comments">Correction Summary / Comments <span class="optional-hint">(optional)</span></label>
            <textarea
              id="comments"
              class="feedback-textarea"
              [(ngModel)]="comments"
              placeholder="Provide detailed feedback, corrections, or comments about this test execution..."
            rows="6"></textarea>
          </div>
          @if (isSaving) {
            <div class="feedback-info">
              <i class="fas fa-spinner fa-spin"></i>
              <span>Saving feedback...</span>
            </div>
          }
          @if (errorMessage) {
            <div class="feedback-error">
              <i class="fas fa-exclamation-triangle"></i>
              <span>{{ errorMessage }}</span>
            </div>
          }
        </div>
      }
    
      @if (isLoading) {
        <div class="feedback-dialog-content">
          <div class="feedback-info">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading existing feedback...</span>
          </div>
        </div>
      }
    
      <kendo-dialog-actions layout="start">
        <button kendoButton
          [primary]="true"
          (click)="onSubmit()"
          [disabled]="!canSubmit() || isSaving || isLoading">
          <i class="fas" [ngClass]="isSaving ? 'fa-spinner fa-spin' : 'fa-check'"></i>
          {{ isSaving ? 'Saving...' : (existingFeedback ? 'Update Feedback' : 'Submit Feedback') }}
        </button>
        <button kendoButton (click)="onCancel()" [disabled]="isSaving || isLoading">Cancel</button>
      </kendo-dialog-actions>
    `,
  styles: [`
    :host {
      display: block;
    }

    /* Smooth fade-in for dialog content to prevent flash */
    ::ng-deep .k-dialog-wrapper {
      animation: dialogFadeIn 0.15s ease-out;
    }

    @keyframes dialogFadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    /* Prevent dialog content from scrolling */
    ::ng-deep .k-dialog-content {
      overflow: visible !important;
    }

    .feedback-dialog-content {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      animation: contentFadeIn 0.2s ease-out;
      overflow: visible;
    }

    @keyframes contentFadeIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .feedback-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .feedback-label {
      font-weight: 600;
      font-size: 14px;
      color: var(--mj-text-primary);
    }

    .optional-hint {
      font-weight: 400;
      font-size: 12px;
      color: var(--mj-text-disabled);
    }

    .rating-scale {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .rating-numbers {
      display: flex;
      gap: 6px;
    }

    .rating-button {
      width: 40px;
      height: 40px;
      border: 2px solid var(--mj-border-default);
      border-radius: 8px;
      background: var(--mj-bg-surface-card);
      color: var(--mj-text-muted);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .rating-button:hover,
    .rating-button.hover {
      transform: scale(1.1);
      box-shadow: var(--mj-shadow-md);
    }

    .rating-button.low:hover,
    .rating-button.low.hover {
      border-color: var(--mj-status-error);
      background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
      color: var(--mj-status-error);
    }

    .rating-button.mid:hover,
    .rating-button.mid.hover {
      border-color: var(--mj-status-warning);
      background: color-mix(in srgb, var(--mj-status-warning) 10%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
    }

    .rating-button.high:hover,
    .rating-button.high.hover {
      border-color: var(--mj-status-success);
      background: color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }

    .rating-button.selected {
      transform: scale(1.1);
      box-shadow: var(--mj-shadow-md);
    }

    .rating-button.selected.low {
      border-color: var(--mj-status-error);
      background: var(--mj-status-error);
      color: var(--mj-text-inverse);
    }

    .rating-button.selected.mid {
      border-color: var(--mj-status-warning);
      background: var(--mj-status-warning);
      color: var(--mj-text-inverse);
    }

    .rating-button.selected.high {
      border-color: var(--mj-status-success);
      background: var(--mj-status-success);
      color: var(--mj-text-inverse);
    }

    .rating-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--mj-text-disabled);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 0 4px;
    }

    .label-low { color: var(--mj-status-error); }
    .label-mid { color: var(--mj-status-warning); }
    .label-high { color: var(--mj-status-success); }

    .rating-description {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--mj-bg-surface-sunken);
      border-radius: 8px;
      font-size: 14px;
      color: var(--mj-text-muted);
    }

    .rating-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .rating-label {
      margin-left: auto;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
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
      color: var(--mj-text-primary);
    }

    .radio-option input[type="radio"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .feedback-textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      min-height: 120px;
    }

    .feedback-textarea:focus {
      outline: none;
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
    }

    .feedback-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      border-radius: 4px;
      color: var(--mj-brand-primary);
      font-size: 14px;
    }

    .feedback-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border-radius: 4px;
      color: var(--mj-status-error);
      font-size: 14px;
    }
  `]
})
export class TestFeedbackDialogComponent implements OnInit {
  private _data!: TestFeedbackDialogData;
  private dataLoaded = false;

  @Input()
  set data(value: TestFeedbackDialogData) {
    this._data = value;
    // When data is set after component creation (via DialogService),
    // trigger loading since ngOnInit already ran
    if (value && !this.dataLoaded) {
      this.initializeWithData();
    }
  }
  get data(): TestFeedbackDialogData {
    return this._data;
  }

  rating = 0;
  hoverRating = 0;
  isCorrect: boolean | null = null;
  comments = '';
  isSaving = false;
  isLoading = false;
  errorMessage = '';
  existingFeedback: MJTestRunFeedbackEntity | null = null;

  private metadata = new Metadata();

  constructor(
    private dialogRef: DialogRef,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    // If data was set via template binding (not DialogService), load here
    if (this._data && !this.dataLoaded) {
      await this.initializeWithData();
    }
    // If data not set yet (DialogService pattern), the setter will trigger loading
  }

  private async initializeWithData(): Promise<void> {
    if (this.dataLoaded) return;
    this.dataLoaded = true;

    // Load existing feedback if it exists
    await this.loadExistingFeedback();
  }

  private async loadExistingFeedback(): Promise<void> {
    this.isLoading = true;

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJTestRunFeedbackEntity>({
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
      this.cdr.detectChanges(); // zone.js 0.15: async RunView doesn't trigger CD
    }
  }

  setRating(value: number): void {
    this.rating = value;
  }

  getRatingLabel(): string {
    if (this.rating <= 3) return 'Poor';
    if (this.rating <= 5) return 'Below Average';
    if (this.rating <= 6) return 'Average';
    if (this.rating <= 7) return 'Good';
    if (this.rating <= 8) return 'Very Good';
    if (this.rating <= 9) return 'Excellent';
    return 'Outstanding';
  }

  canSubmit(): boolean {
    // Rating is required, comments are optional
    return this.rating > 0;
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit() || this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      let feedback: MJTestRunFeedbackEntity;

      if (this.existingFeedback) {
        // Update existing feedback
        feedback = this.existingFeedback;
      } else {
        // Create new feedback entity
        feedback = await this.metadata.GetEntityObject<MJTestRunFeedbackEntity>(
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
