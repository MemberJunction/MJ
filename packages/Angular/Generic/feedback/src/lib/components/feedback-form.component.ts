import { Component, OnInit, Input, Output, EventEmitter, Inject, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { FeedbackSubmission, FeedbackResponse, FeedbackCategory, FeedbackSeverity, FeedbackEnvironment, CategoryOption, SeverityOption, EnvironmentOption } from '../feedback.types';
import { FeedbackConfig, FEEDBACK_CONFIG, FeedbackFieldConfig, mergeFieldConfig } from '../feedback.config';
import { DEFAULT_CATEGORIES, DEFAULT_SEVERITIES, DEFAULT_ENVIRONMENTS } from '../feedback.constants';
import { FeedbackService } from '../services/feedback.service';

@Component({
  standalone: false,
  selector: 'mj-feedback-form',
  template: `
    <dialog #dialogEl class="mj-dialog" (close)="OnDialogClose()">
      <div class="mj-dialog-header">
        <h2 class="mj-dialog-title">{{ config.title || 'Submit Feedback' }}</h2>
        <button class="mj-dialog-close" (click)="OnCancel()" type="button">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Subtitle -->
      @if (config.subtitle) {
        <div class="feedback-subtitle">
          {{ config.subtitle }}
        </div>
      }

      @if (!IsSubmitting && !SubmissionSuccess) {
        <div class="feedback-form-content">
          <!-- Category -->
          <div class="feedback-section">
            <label class="feedback-label">
              Category <span class="required">*</span>
            </label>
            <select
              class="mj-select"
              [(ngModel)]="Category"
              (ngModelChange)="OnCategoryChange($event)">
              @for (cat of Categories; track cat.value) {
                <option [value]="cat.value">{{ cat.label }}</option>
              }
            </select>
            @if (SelectedCategoryDescription) {
              <div class="category-description">
                {{ SelectedCategoryDescription }}
              </div>
            }
          </div>

          <!-- Title -->
          <div class="feedback-section">
            <label class="feedback-label">
              Title <span class="required">*</span>
            </label>
            <input
              type="text"
              class="mj-input"
              [(ngModel)]="Title"
              (input)="OnFieldChange()"
              placeholder="Brief summary of your feedback..."
              [maxlength]="256" />
            <div class="char-count">{{ Title.length }}/256</div>
          </div>

          <!-- Description -->
          <div class="feedback-section">
            <label class="feedback-label">
              Description <span class="required">*</span>
            </label>
            <textarea
              class="mj-textarea"
              [(ngModel)]="Description"
              (input)="OnFieldChange()"
              placeholder="Please provide a detailed description..."
              rows="4"
              [maxlength]="10000"></textarea>
            <div class="char-count" [ngClass]="{'warning': Description.length < 20}">
              {{ Description.length }}/10000 (minimum 20 characters)
            </div>
          </div>

          <!-- Bug-specific fields -->
          @if (Category === 'bug') {
            <!-- Steps to reproduce -->
            @if (FieldConfig.showStepsToReproduce) {
              <div class="feedback-section">
                <label class="feedback-label">
                  Steps to Reproduce <span class="optional-hint">(recommended)</span>
                </label>
                <textarea
                  class="mj-textarea"
                  [(ngModel)]="StepsToReproduce"
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  rows="3"></textarea>
              </div>
            }

            <!-- Expected Behavior -->
            @if (FieldConfig.showExpectedBehavior) {
              <div class="feedback-section">
                <label class="feedback-label">Expected Behavior</label>
                <textarea
                  class="mj-textarea"
                  [(ngModel)]="ExpectedBehavior"
                  placeholder="What should have happened?"
                  rows="2"></textarea>
              </div>
            }

            <!-- Actual Behavior -->
            @if (FieldConfig.showActualBehavior) {
              <div class="feedback-section">
                <label class="feedback-label">Actual Behavior</label>
                <textarea
                  class="mj-textarea"
                  [(ngModel)]="ActualBehavior"
                  placeholder="What actually happened?"
                  rows="2"></textarea>
              </div>
            }

            <!-- Severity -->
            @if (FieldConfig.showSeverity) {
              <div class="feedback-section">
                <label class="feedback-label">Severity</label>
                <select class="mj-select" [(ngModel)]="Severity" style="width: 200px;">
                  @for (sev of Severities; track sev.value) {
                    <option [value]="sev.value">{{ sev.label }}</option>
                  }
                </select>
              </div>
            }
          }

          <!-- Feature-specific fields -->
          @if (Category === 'feature') {
            @if (FieldConfig.showUseCase) {
              <div class="feedback-section">
                <label class="feedback-label">
                  Use Case <span class="optional-hint">(recommended)</span>
                </label>
                <textarea
                  class="mj-textarea"
                  [(ngModel)]="UseCase"
                  placeholder="What problem would this solve? Why is it needed?"
                  rows="3"></textarea>
              </div>
            }

            @if (FieldConfig.showProposedSolution) {
              <div class="feedback-section">
                <label class="feedback-label">
                  Proposed Solution <span class="optional-hint">(optional)</span>
                </label>
                <textarea
                  class="mj-textarea"
                  [(ngModel)]="ProposedSolution"
                  placeholder="How might this work?"
                  rows="2"></textarea>
              </div>
            }
          }

          <!-- Environment and Affected Area row -->
          @if (FieldConfig.showEnvironment || FieldConfig.showAffectedArea) {
            <div class="feedback-row">
              @if (FieldConfig.showEnvironment) {
                <div class="feedback-section half">
                  <label class="feedback-label">Environment</label>
                  <select class="mj-select" [(ngModel)]="Environment">
                    @for (env of Environments; track env.value) {
                      <option [value]="env.value">{{ env.label }}</option>
                    }
                  </select>
                </div>
              }
              @if (FieldConfig.showAffectedArea && AffectedAreas.length > 0) {
                <div class="feedback-section half">
                  <label class="feedback-label">Affected Area</label>
                  <select class="mj-select" [(ngModel)]="AffectedArea">
                    @for (area of AffectedAreas; track area) {
                      <option [value]="area">{{ area }}</option>
                    }
                  </select>
                </div>
              }
            </div>
          }

          <!-- Contact info row -->
          @if (FieldConfig.showName || FieldConfig.showEmail) {
            <div class="feedback-row">
              @if (FieldConfig.showName) {
                <div class="feedback-section half">
                  <label class="feedback-label">Your Name <span class="optional-hint">(optional)</span></label>
                  <input
                    type="text"
                    class="mj-input"
                    [(ngModel)]="Name"
                    placeholder="John Doe" />
                </div>
              }
              @if (FieldConfig.showEmail) {
                <div class="feedback-section half">
                  <label class="feedback-label">Email <span class="optional-hint">(for follow-up)</span></label>
                  <input
                    type="text"
                    class="mj-input"
                    [(ngModel)]="Email"
                    placeholder="john@example.com" />
                </div>
              }
            </div>
          }

          <!-- Error message -->
          @if (ErrorMessage) {
            <div class="feedback-error">
              <i class="fas fa-exclamation-triangle"></i>
              <span>{{ ErrorMessage }}</span>
            </div>
          }
        </div>
      }

      <!-- Loading state -->
      @if (IsSubmitting) {
        <mj-loading text="Submitting your feedback..." size="medium"></mj-loading>
      }

      <!-- Success state -->
      @if (SubmissionSuccess) {
        <div class="feedback-success">
          <i class="fas fa-check-circle fa-3x"></i>
          <h3>{{ config.successMessage || 'Thank you! Your feedback has been submitted.' }}</h3>
          @if (IssueUrl && (config.showIssueLink !== false)) {
            <p>
              <a [href]="IssueUrl" target="_blank" rel="noopener noreferrer">
                View Issue #{{ IssueNumber }}
              </a>
            </p>
          }
        </div>
      }

      <div class="mj-dialog-actions">
        @if (!SubmissionSuccess) {
          <button
            class="mj-btn mj-btn-primary"
            (click)="OnSubmit()"
            [disabled]="!CanSubmit() || IsSubmitting"
            type="button">
            <i class="fas" [ngClass]="IsSubmitting ? 'fa-spinner fa-spin' : 'fa-paper-plane'"></i>
            {{ IsSubmitting ? 'Submitting...' : (config.submitButtonText || 'Submit') }}
          </button>
          <button class="mj-btn" (click)="OnCancel()" [disabled]="IsSubmitting" type="button">Cancel</button>
        }
        @if (SubmissionSuccess) {
          <button class="mj-btn mj-btn-primary" (click)="OnCancel()" type="button">Close</button>
        }
      </div>
    </dialog>
  `,
  styles: [`
    :host {
      display: block;
    }

    /* Dialog base */
    .mj-dialog {
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      box-shadow: var(--mj-shadow-xl);
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      padding: 0;
      max-width: 700px;
      width: 90vw;
    }

    .mj-dialog::backdrop {
      background: var(--mj-bg-overlay);
    }

    /* Dialog header */
    .mj-dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--mj-space-4) var(--mj-space-5);
      border-bottom: 1px solid var(--mj-border-subtle);
    }

    .mj-dialog-title {
      margin: 0;
      font-size: var(--mj-text-lg);
      font-weight: var(--mj-font-semibold);
      color: var(--mj-text-primary);
    }

    .mj-dialog-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--mj-space-8);
      height: var(--mj-space-8);
      border: none;
      border-radius: var(--mj-radius-md);
      background: transparent;
      color: var(--mj-text-muted);
      cursor: pointer;
      transition: var(--mj-transition-fast);
    }

    .mj-dialog-close:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }

    /* Dialog actions */
    .mj-dialog-actions {
      display: flex;
      gap: var(--mj-space-3);
      padding: var(--mj-space-4) var(--mj-space-5);
      border-top: 1px solid var(--mj-border-subtle);
    }

    /* Subtitle */
    .feedback-subtitle {
      color: var(--mj-text-secondary);
      font-size: var(--mj-text-sm);
      margin-bottom: var(--mj-space-4);
      padding: 0 var(--mj-space-5);
    }

    /* Form content */
    .feedback-form-content {
      padding: 0 var(--mj-space-5) var(--mj-space-5) var(--mj-space-5);
      display: flex;
      flex-direction: column;
      gap: var(--mj-space-4);
      max-height: 60vh;
      overflow-y: auto;
    }

    .feedback-section {
      display: flex;
      flex-direction: column;
      gap: var(--mj-space-1-5);
    }

    .feedback-section.half {
      flex: 1;
      min-width: 0;
    }

    .feedback-row {
      display: flex;
      gap: var(--mj-space-4);
    }

    /* Labels */
    .feedback-label {
      font-weight: var(--mj-font-semibold);
      font-size: var(--mj-text-sm);
      color: var(--mj-text-primary);
    }

    .required {
      color: var(--mj-status-error);
    }

    .optional-hint {
      font-weight: var(--mj-font-normal);
      font-size: var(--mj-text-xs);
      color: var(--mj-text-muted);
    }

    .category-description {
      font-size: var(--mj-text-xs);
      color: var(--mj-text-secondary);
      font-style: italic;
    }

    .char-count {
      font-size: var(--mj-text-xs);
      color: var(--mj-text-muted);
      text-align: right;
    }

    .char-count.warning {
      color: var(--mj-status-warning);
    }

    /* Form controls */
    .mj-input,
    .mj-textarea,
    .mj-select {
      width: 100%;
      padding: var(--mj-space-2) var(--mj-space-3);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      font-size: var(--mj-text-sm);
      font-family: var(--mj-font-family);
      transition: var(--mj-transition-fast);
      box-sizing: border-box;
    }

    .mj-input:focus,
    .mj-textarea:focus,
    .mj-select:focus {
      outline: none;
      border-color: var(--mj-border-focus);
      box-shadow: var(--mj-focus-ring);
    }

    .mj-input::placeholder,
    .mj-textarea::placeholder {
      color: var(--mj-text-muted);
    }

    .mj-textarea {
      resize: vertical;
      min-height: var(--mj-space-15);
    }

    .mj-select {
      appearance: auto;
    }

    /* Buttons */
    .mj-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--mj-space-2);
      padding: var(--mj-space-2) var(--mj-space-4);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      font-size: var(--mj-text-sm);
      font-weight: var(--mj-font-medium);
      font-family: var(--mj-font-family);
      cursor: pointer;
      transition: var(--mj-transition-fast);
    }

    .mj-btn:hover:not(:disabled) {
      background: var(--mj-bg-surface-hover);
    }

    .mj-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .mj-btn-primary {
      background: var(--mj-brand-primary);
      color: var(--mj-brand-on-primary);
      border-color: var(--mj-brand-primary);
    }

    .mj-btn-primary:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
      border-color: var(--mj-brand-primary-hover);
    }

    /* Success state */
    .feedback-success {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--mj-space-4);
      padding: var(--mj-space-15) var(--mj-space-5);
      text-align: center;
    }

    .feedback-success i {
      color: var(--mj-status-success);
    }

    .feedback-success h3 {
      color: var(--mj-text-primary);
      margin: 0;
    }

    .feedback-success a {
      color: var(--mj-text-link);
      text-decoration: none;
    }

    .feedback-success a:hover {
      text-decoration: underline;
      color: var(--mj-text-link-hover);
    }

    /* Error state */
    .feedback-error {
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      padding: var(--mj-space-3);
      background: var(--mj-status-error-bg);
      border: 1px solid var(--mj-status-error-border);
      border-radius: var(--mj-radius-md);
      color: var(--mj-status-error-text);
      font-size: var(--mj-text-sm);
    }
  `]
})
export class FeedbackFormComponent implements OnInit, AfterViewInit {
  @ViewChild('dialogEl') DialogEl!: ElementRef<HTMLDialogElement>;

  // Inputs for pre-filling
  @Input() PrefilledCategory?: FeedbackCategory | string;
  @Input() PrefilledTitle?: string;
  @Input() ContextData?: Record<string, unknown>;
  /** Current page/view name (for apps where URL doesn't reflect navigation) */
  @Input() CurrentPage?: string;

  // Outputs
  @Output() Submitted = new EventEmitter<FeedbackSubmission>();
  @Output() Success = new EventEmitter<FeedbackResponse>();
  @Output() Error = new EventEmitter<Error>();
  @Output() Cancelled = new EventEmitter<void>();
  @Output() DialogClosed = new EventEmitter<{ success: boolean }>();

  // Form fields
  Category: string = 'bug';
  Title: string = '';
  Description: string = '';
  StepsToReproduce: string = '';
  ExpectedBehavior: string = '';
  ActualBehavior: string = '';
  Severity: FeedbackSeverity = 'minor';
  UseCase: string = '';
  ProposedSolution: string = '';
  Environment: FeedbackEnvironment = 'production';
  AffectedArea: string = '';
  Name: string = '';
  Email: string = '';

  // Options
  Categories: CategoryOption[] = DEFAULT_CATEGORIES;
  Severities: SeverityOption[] = DEFAULT_SEVERITIES;
  Environments: EnvironmentOption[] = DEFAULT_ENVIRONMENTS;
  AffectedAreas: string[] = [];

  // State
  IsSubmitting = false;
  SubmissionSuccess = false;
  ErrorMessage = '';
  IssueNumber?: number;
  IssueUrl?: string;

  // Merged field config
  FieldConfig: Required<FeedbackFieldConfig>;

  constructor(
    @Inject(FEEDBACK_CONFIG) public config: FeedbackConfig,
    private feedbackService: FeedbackService,
    private cdr: ChangeDetectorRef
  ) {
    this.FieldConfig = mergeFieldConfig(config.fields);
    this.AffectedAreas = this.FieldConfig.affectedAreas;
  }

  ngOnInit(): void {
    // Apply pre-filled values
    if (this.PrefilledCategory) {
      this.Category = this.PrefilledCategory;
    }
    if (this.PrefilledTitle) {
      this.Title = this.PrefilledTitle;
    }
  }

  ngAfterViewInit(): void {
    if (this.DialogEl?.nativeElement) {
      this.DialogEl.nativeElement.showModal();
    }
  }

  /**
   * Get description for selected category
   */
  get SelectedCategoryDescription(): string {
    const category = this.Categories.find(c => c.value === this.Category);
    return category?.description || '';
  }

  /**
   * Handle category change
   */
  OnCategoryChange(value: string): void {
    this.Category = value;
    this.cdr.detectChanges();
  }

  /**
   * Handle field value changes to ensure button state updates
   */
  OnFieldChange(): void {
    this.cdr.detectChanges();
  }

  /**
   * Check if form is valid for submission
   */
  CanSubmit(): boolean {
    if (!this.Title.trim() || this.Title.length < 5) {
      return false;
    }
    if (!this.Description.trim() || this.Description.length < 20) {
      return false;
    }
    if (!this.Category) {
      return false;
    }
    return true;
  }

  /**
   * Submit the feedback
   */
  async OnSubmit(): Promise<void> {
    if (!this.CanSubmit() || this.IsSubmitting) {
      return;
    }

    this.IsSubmitting = true;
    this.ErrorMessage = '';
    this.cdr.detectChanges();

    const submission = this.buildSubmission();
    this.Submitted.emit(submission);

    this.feedbackService.Submit(submission).subscribe({
      next: (response) => {
        this.IsSubmitting = false;
        this.SubmissionSuccess = true;
        this.IssueNumber = response.issueNumber;
        this.IssueUrl = response.issueUrl;
        this.Success.emit(response);
        this.cdr.detectChanges();
      },
      error: (error: Error) => {
        this.IsSubmitting = false;
        this.ErrorMessage = error.message;
        this.Error.emit(error);
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Build the feedback submission object from current form state
   */
  private buildSubmission(): FeedbackSubmission {
    const submission: FeedbackSubmission = {
      title: this.Title.trim(),
      description: this.Description.trim(),
      category: this.Category,
      metadata: this.ContextData,
      currentPage: this.CurrentPage
    };

    if (this.Category === 'bug') {
      this.applyBugFields(submission);
    }
    if (this.Category === 'feature') {
      this.applyFeatureFields(submission);
    }
    this.applyOptionalFields(submission);

    return submission;
  }

  private applyBugFields(submission: FeedbackSubmission): void {
    if (this.StepsToReproduce.trim()) {
      submission.stepsToReproduce = this.StepsToReproduce.trim();
    }
    if (this.ExpectedBehavior.trim()) {
      submission.expectedBehavior = this.ExpectedBehavior.trim();
    }
    if (this.ActualBehavior.trim()) {
      submission.actualBehavior = this.ActualBehavior.trim();
    }
    if (this.Severity) {
      submission.severity = this.Severity;
    }
  }

  private applyFeatureFields(submission: FeedbackSubmission): void {
    if (this.UseCase.trim()) {
      submission.useCase = this.UseCase.trim();
    }
    if (this.ProposedSolution.trim()) {
      submission.proposedSolution = this.ProposedSolution.trim();
    }
  }

  private applyOptionalFields(submission: FeedbackSubmission): void {
    if (this.Environment && this.FieldConfig.showEnvironment) {
      submission.environment = this.Environment;
    }
    if (this.AffectedArea && this.FieldConfig.showAffectedArea) {
      submission.affectedArea = this.AffectedArea;
    }
    if (this.Name.trim() && this.FieldConfig.showName) {
      submission.name = this.Name.trim();
    }
    if (this.Email.trim() && this.FieldConfig.showEmail) {
      submission.email = this.Email.trim();
    }
  }

  /**
   * Handle native dialog close event (e.g., Escape key)
   */
  OnDialogClose(): void {
    this.DialogClosed.emit({ success: this.SubmissionSuccess });
  }

  /**
   * Cancel and close the dialog
   */
  OnCancel(): void {
    this.Cancelled.emit();
    if (this.DialogEl?.nativeElement?.open) {
      this.DialogEl.nativeElement.close(); // fires native 'close' event → OnDialogClose() → DialogClosed.emit()
    }
  }

  /**
   * Reset the form
   */
  Reset(): void {
    this.Title = '';
    this.Description = '';
    this.StepsToReproduce = '';
    this.ExpectedBehavior = '';
    this.ActualBehavior = '';
    this.UseCase = '';
    this.ProposedSolution = '';
    this.Name = '';
    this.Email = '';
    this.ErrorMessage = '';
    this.SubmissionSuccess = false;
    this.cdr.detectChanges();
  }
}
