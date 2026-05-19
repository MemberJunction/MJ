import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { MJTestRunFeedbackEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

export interface TestFeedbackDialogData {
  testRunId: string;
  conversationDetailId?: string;
  currentUser: UserInfo;
}

export interface TestFeedbackDialogResult {
  success: boolean;
  feedbackId?: string;
}

@Component({
  standalone: false,
  selector: 'mj-test-feedback-dialog',
  template: `
    @if (visible) {
      <div class="dialog-overlay" (click)="onOverlayClick($event)">
        <div class="dialog-container" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <h2 class="dialog-title">Provide Test Feedback</h2>
            <button type="button" class="dialog-close" (click)="onCancel()" [disabled]="isSaving">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
          <div class="dialog-body">
            @if (!isLoading) {
              <div class="feedback-dialog-content">
                <div class="feedback-section">
                  <label class="feedback-label">Overall Rating</label>
                  <div class="rating-scale">
                    <div class="rating-numbers">
                      @for (num of ratingNumbers; track num) {
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
          </div>
          <div class="dialog-actions">
            <button
              class="btn btn-primary"
              (click)="onSubmit()"
              [disabled]="!canSubmit() || isSaving || isLoading">
              <i class="fas" [ngClass]="isSaving ? 'fa-spinner fa-spin' : 'fa-check'"></i>
              {{ isSaving ? 'Saving...' : (existingFeedback ? 'Update Feedback' : 'Submit Feedback') }}
            </button>
            <button class="btn btn-secondary" (click)="onCancel()" [disabled]="isSaving || isLoading">Cancel</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--mj-bg-overlay, rgba(0, 0, 0, 0.5));
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: overlayFadeIn 0.15s ease-out;
    }

    @keyframes overlayFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .dialog-container {
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      width: 600px;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      animation: dialogSlideIn 0.2s ease-out;
    }

    @keyframes dialogSlideIn {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--mj-border-default);
    }

    .dialog-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .dialog-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 8px;
      color: var(--mj-text-muted);
      font-size: 16px;
      border-radius: 4px;
      transition: background 0.15s ease;
    }

    .dialog-close:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }

    .dialog-body {
      overflow-y: auto;
      flex: 1;
    }

    .dialog-actions {
      display: flex;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid var(--mj-border-default);
    }

    .btn {
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border-color: var(--mj-brand-primary);
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
    }

    .btn-secondary {
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      border-color: var(--mj-border-default);
    }

    .btn-secondary:hover:not(:disabled) {
      background: var(--mj-bg-surface-hover);
    }

    .feedback-dialog-content {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      overflow: visible;
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
      justify-content: space-between;
    }

    .rating-button {
      flex: 1;
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
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
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
export class TestFeedbackDialogComponent extends BaseAngularComponent implements OnInit {
  private _data!: TestFeedbackDialogData;
  private _visible = false;
  private dataLoaded = false;

  readonly ratingNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  @Input()
  set data(value: TestFeedbackDialogData) {
    this._data = value;
    if (value && this._visible && !this.dataLoaded) {
      this.initializeWithData();
    }
  }
  get data(): TestFeedbackDialogData {
    return this._data;
  }

  @Input()
  set visible(value: boolean) {
    const wasVisible = this._visible;
    this._visible = value;
    if (value && !wasVisible) {
      this.resetForm();
      if (this._data && !this.dataLoaded) {
        this.initializeWithData();
      }
    }
    if (!value && wasVisible) {
      this.dataLoaded = false;
    }
  }
  get visible(): boolean {
    return this._visible;
  }

  @Output() closed = new EventEmitter<TestFeedbackDialogResult>();

  rating = 0;
  hoverRating = 0;
  isCorrect: boolean | null = null;
  comments = '';
  isSaving = false;
  isLoading = false;
  errorMessage = '';
  existingFeedback: MJTestRunFeedbackEntity | null = null;

  private get metadata() { return this.ProviderToUse; }

  constructor(
    private cdr: ChangeDetectorRef
  ) { super(); }

  async ngOnInit(): Promise<void> {
    if (this._visible && this._data && !this.dataLoaded) {
      await this.initializeWithData();
    }
  }

  private resetForm(): void {
    this.rating = 0;
    this.hoverRating = 0;
    this.isCorrect = null;
    this.comments = '';
    this.isSaving = false;
    this.isLoading = false;
    this.errorMessage = '';
    this.existingFeedback = null;
  }

  private async initializeWithData(): Promise<void> {
    if (this.dataLoaded) return;
    this.dataLoaded = true;
    await this.loadExistingFeedback();
  }

  private async loadExistingFeedback(): Promise<void> {
    this.isLoading = true;

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
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
        feedback = this.existingFeedback;
      } else {
        feedback = await this.metadata.GetEntityObject<MJTestRunFeedbackEntity>(
          'MJ: Test Run Feedbacks',
          this.data.currentUser
        );
        feedback.TestRunID = this.data.testRunId;
        feedback.ReviewerUserID = this.data.currentUser.ID;
      }

      feedback.Rating = this.rating;
      feedback.IsCorrect = this.isCorrect;
      feedback.CorrectionSummary = this.comments.trim() || null;

      const result = await feedback.Save();

      if (result) {
        this.closed.emit({ success: true, feedbackId: feedback.ID });
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
    this.closed.emit({ success: false });
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isSaving) {
      this.onCancel();
    }
  }
}
