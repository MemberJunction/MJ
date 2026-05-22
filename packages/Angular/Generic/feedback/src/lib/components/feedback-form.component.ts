import { Component, OnInit, Input, Output, EventEmitter, Inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FeedbackSubmission, FeedbackResponse, FeedbackCategory, FeedbackSeverity, FeedbackEnvironment } from '../feedback.types';
import { FeedbackConfig, FEEDBACK_CONFIG, FeedbackFieldConfig, mergeFieldConfig } from '../feedback.config';
import { FeedbackService } from '../services/feedback.service';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

@Component({
  standalone: true,
  imports: [FormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective, SharedGenericModule],
  selector: 'mj-feedback-form',
  template: `
    <mj-dialog
      [Visible]="DialogVisible"
      [Title]="config.title || 'Submit Feedback'"
      Size="lg"
      (Close)="OnCancel()">

      <!-- Subtitle -->
      @if (config.subtitle) {
        <div class="feedback-subtitle">
          {{ config.subtitle }}
        </div>
      }

      <!-- Privacy notice -->
      <div class="feedback-privacy-notice">
        <i class="fa-solid fa-circle-info"></i>
        <span>Feedback is submitted as a public GitHub issue. Please do not include confidential or sensitive information.</span>
      </div>

      @if (!IsSubmitting && !SubmissionSuccess) {
        <div class="feedback-form-content">
          <!-- Title -->
          <div class="feedback-section">
            <label class="feedback-label">
              Title <span class="required">*</span>
            </label>
            <input
              type="text"
              class="mj-input"
              [(ngModel)]="Title"
              (ngModelChange)="OnFieldChange()"
              placeholder="Brief summary of your feedback..."
              [maxlength]="256" />
            <div class="char-count" [class.warning]="Title.length > 0 && Title.length < 5">
              {{ Title.length }}/256 (minimum 5 characters)
            </div>
          </div>

          <!-- Description -->
          <div class="feedback-section">
            <label class="feedback-label">
              Description <span class="required">*</span>
            </label>
            <textarea
              class="mj-textarea"
              [(ngModel)]="Description"
              (ngModelChange)="OnFieldChange()"
              placeholder="Please provide a detailed description..."
              rows="4"
              [maxlength]="10000"></textarea>
            <div class="char-count" [class.warning]="Description.length > 0 && Description.length < 20">
              {{ Description.length }}/10000 (minimum 20 characters)
            </div>
            @if (IsClassifying) {
              <div class="classify-indicator">
                <i class="fas fa-spinner fa-spin"></i> Analyzing feedback type...
              </div>
            } @else if (WasAutoClassified) {
              <div class="classify-indicator classified">
                <i class="fas fa-wand-magic-sparkles"></i> Classified as {{ Category }}
              </div>
            }
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

            <!-- Severity is auto-classified by LLM, no dropdown needed -->
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

          <!-- Environment and affected area are auto-classified by LLM -->

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

          <!-- Screenshot opt-in -->
          @if (ScreenshotIncluded && ScreenshotDataUrl) {
            <div class="feedback-section">
              <label class="feedback-label">Screenshot</label>
              <div class="screenshot-preview">
                <img [src]="ScreenshotDataUrl" alt="Screenshot of current view" />
                <button class="screenshot-remove" (click)="RemoveScreenshot()" type="button" title="Remove screenshot">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div class="screenshot-public-notice">
                <i class="fa-solid fa-eye"></i> This screenshot will be included in the public GitHub issue.
              </div>
            </div>
          } @else if (ScreenshotDataUrl && !ScreenshotIncluded) {
            <div class="feedback-section">
              <button class="screenshot-include-btn" (click)="IncludeScreenshot()" type="button">
                <i class="fa-solid fa-camera"></i> Include screenshot of current view
              </button>
            </div>
          } @else if (IsCapturingScreenshot) {
            <div class="feedback-section">
              <div class="screenshot-loading">
                <i class="fas fa-spinner fa-spin"></i> Preparing screenshot...
              </div>
            </div>
          }

          <!-- Error message -->
          @if (ErrorMessage) {
            <div class="feedback-error">
              <i class="fas fa-exclamation-triangle"></i>
              <span>{{ ErrorMessage }}</span>
            </div>
          }

          <!-- Certification checkbox -->
          <label class="certification-label">
            <input type="checkbox" class="mj-checkbox" [(ngModel)]="CertificationAccepted" />
            <span class="certification-text">
              I certify that I am authorized to submit this on behalf of my organization and that this submission does not contain confidential or sensitive information. This will be posted to a public GitHub repository.
            </span>
          </label>
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
          @if (EmailWillBeSent && EmailSentTo) {
            <p class="feedback-success-message">
              You'll receive an email at <strong>{{ EmailSentTo }}</strong> when there are updates.
            </p>
          } @else if (FallbackContact) {
            <p class="feedback-success-message">
              For questions, contact <strong>{{ FallbackContact }}</strong>.
            </p>
          }
          @if (IssueUrl && (config.showIssueLink !== false)) {
            <p>
              <a [href]="IssueUrl" target="_blank" rel="noopener noreferrer">
                View Issue #{{ IssueNumber }}
              </a>
            </p>
          }
        </div>
      }

      <mj-dialog-actions>
        @if (!SubmissionSuccess) {
          <button
            mjButton
            variant="primary"
            (click)="OnSubmit()"
            [disabled]="!CanSubmit() || IsSubmitting"
            type="button">
            <i class="fas" [class.fa-spinner]="IsSubmitting" [class.fa-spin]="IsSubmitting" [class.fa-paper-plane]="!IsSubmitting"></i>
            {{ IsSubmitting ? 'Submitting...' : (config.submitButtonText || 'Submit') }}
          </button>
          <button mjButton (click)="OnCancel()" [disabled]="IsSubmitting" type="button">Cancel</button>
        }
        @if (SubmissionSuccess) {
          <button mjButton variant="primary" (click)="OnCancel()" type="button">Close</button>
        }
      </mj-dialog-actions>
    </mj-dialog>
  `,
  styles: [`
    :host {
      display: block;
    }

    /* Subtitle */
    .feedback-subtitle {
      color: var(--mj-text-secondary);
      font-size: var(--mj-text-sm);
      margin-bottom: var(--mj-space-2);
    }

    /* Privacy notice */
    .feedback-privacy-notice {
      display: flex;
      align-items: flex-start;
      gap: var(--mj-space-2);
      padding: var(--mj-space-2-5) var(--mj-space-3);
      background: var(--mj-status-warning-bg);
      border: 1px solid var(--mj-status-warning-border);
      border-radius: var(--mj-radius-md);
      font-size: var(--mj-text-xs);
      color: var(--mj-status-warning-text);
      margin-bottom: var(--mj-space-2);
    }

    .feedback-privacy-notice i {
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* Form content — horizontal padding prevents focus rings from being clipped by overflow */
    .feedback-form-content {
      display: flex;
      flex-direction: column;
      gap: var(--mj-space-4);
      max-height: 60vh;
      overflow-y: auto;
      padding: 0 var(--mj-space-1);
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

    .classify-indicator {
      font-size: var(--mj-text-xs);
      color: var(--mj-text-muted);
      display: flex;
      align-items: center;
      gap: var(--mj-space-1-5);
    }

    .classify-indicator.classified {
      color: var(--mj-brand-primary);
    }

    .char-count {
      font-size: var(--mj-text-xs);
      color: var(--mj-text-muted);
      text-align: right;
    }

    .char-count.warning {
      color: var(--mj-status-warning);
    }

    .screenshot-include-btn {
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      width: 100%;
      padding: var(--mj-space-2-5) var(--mj-space-3);
      border: 1px dashed var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      background: var(--mj-bg-surface);
      color: var(--mj-text-secondary);
      font-size: var(--mj-text-sm);
      font-family: var(--mj-font-family);
      cursor: pointer;
      transition: var(--mj-transition-fast);
    }

    .screenshot-include-btn:hover {
      border-color: var(--mj-brand-primary);
      color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 5%, var(--mj-bg-surface));
    }

    .screenshot-public-notice {
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      font-size: var(--mj-text-xs);
      color: var(--mj-status-warning-text);
      margin-top: var(--mj-space-1);
    }

    .screenshot-loading {
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      padding: var(--mj-space-4);
      border: 1px dashed var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      color: var(--mj-text-muted);
      font-size: var(--mj-text-sm);
    }

    /* Certification checkbox */
    .certification-label {
      display: flex;
      align-items: flex-start;
      gap: var(--mj-space-2);
      cursor: pointer;
      padding: var(--mj-space-3);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      background: var(--mj-bg-surface-sunken);
    }

    .certification-label input {
      flex-shrink: 0;
      margin-top: 2px;
    }

    .certification-text {
      font-size: var(--mj-text-xs);
      color: var(--mj-text-secondary);
      line-height: 1.5;
    }

    /* Screenshot preview */
    .screenshot-preview {
      position: relative;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      overflow: hidden;
    }

    .screenshot-preview img {
      width: 100%;
      display: block;
    }

    .screenshot-remove {
      position: absolute;
      top: var(--mj-space-1);
      right: var(--mj-space-1);
      width: 24px;
      height: 24px;
      border: none;
      border-radius: var(--mj-radius-sm);
      background: var(--mj-bg-overlay);
      color: var(--mj-text-inverse);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--mj-text-xs);
    }

    .screenshot-remove:hover {
      background: var(--mj-status-error);
    }

    /* Success state */
    .feedback-success {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--mj-space-4);
      padding: var(--mj-space-14) var(--mj-space-5);
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
export class FeedbackFormComponent implements OnInit {
  /** Controls mj-dialog visibility — set by FeedbackDialogService */
  DialogVisible = true;

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
  Environment: FeedbackEnvironment | '' = '';
  AffectedArea: string = '';
  Name: string = '';
  Email: string = '';


  // State
  IsSubmitting = false;
  IsClassifying = false;
  WasAutoClassified = false;
  SubmissionSuccess = false;
  ErrorMessage = '';
  private lastClassifiedTitle = '';
  private lastClassifiedDescription = '';
  IssueNumber?: number;
  IssueUrl?: string;
  /**
   * Email-notification state echoed back from the server, used to tailor
   * the success-dialog message:
   *   - EmailWillBeSent + EmailSentTo → "You'll get email updates at …"
   *   - Otherwise + FallbackContact   → "For questions, contact …"
   *   - Otherwise                     → bare-bones confirmation
   */
  EmailWillBeSent = false;
  EmailSentTo?: string;
  FallbackContact?: string;
  ScreenshotDataUrl?: string;
  ScreenshotIncluded = false;
  IsCapturingScreenshot = true;
  CertificationAccepted = false;
  private classifyTimeout?: ReturnType<typeof setTimeout>;

  // Merged field config
  FieldConfig: Required<FeedbackFieldConfig>;

  constructor(
    @Inject(FEEDBACK_CONFIG) public config: FeedbackConfig,
    private feedbackService: FeedbackService,
    private cdr: ChangeDetectorRef
  ) {
    this.FieldConfig = mergeFieldConfig(config.fields);
  }

  ngOnInit(): void {
    // Apply pre-filled values
    if (this.PrefilledCategory) {
      this.Category = this.PrefilledCategory;
    }
    if (this.PrefilledTitle) {
      this.Title = this.PrefilledTitle;
    }
    // Extract screenshot from context data — store locally but don't include in submission until user opts in
    if (this.ContextData?.['screenshot'] && typeof this.ContextData['screenshot'] === 'string') {
      this.ScreenshotDataUrl = this.ContextData['screenshot'] as string;
      delete this.ContextData['screenshot'];
    }
  }

  /**
   * User opts in to include the screenshot
   */
  IncludeScreenshot(): void {
    this.ScreenshotIncluded = true;
    if (this.ScreenshotDataUrl) {
      if (!this.ContextData) {
        this.ContextData = {};
      }
      this.ContextData['screenshot'] = this.ScreenshotDataUrl;
    }
    this.cdr.detectChanges();
  }

  /**
   * Remove the attached screenshot (opt back out)
   */
  RemoveScreenshot(): void {
    this.ScreenshotIncluded = false;
    if (this.ContextData) {
      delete this.ContextData['screenshot'];
    }
    this.cdr.detectChanges();
  }

  /**
   * Handle field value changes to ensure button state updates.
   * Triggers LLM auto-classification after a debounce when description is long enough.
   */
  OnFieldChange(): void {
    this.cdr.detectChanges();
    this.scheduleClassification();
  }

  /**
   * Schedule LLM classification with debounce (1 second after user stops typing)
   */
  private scheduleClassification(): void {
    if (this.classifyTimeout) {
      clearTimeout(this.classifyTimeout);
    }
    // Only classify if we have enough text and haven't already classified this content
    if (this.Title.trim().length >= 5 && this.Description.trim().length >= 20) {
      this.classifyTimeout = setTimeout(() => this.runClassification(), 1000);
    }
  }

  /**
   * Run LLM classification and apply suggestions
   */
  private async runClassification(): Promise<void> {
    if (this.IsClassifying || this.IsSubmitting) return;

    const title = this.Title.trim();
    const description = this.Description.trim();

    // Skip if content hasn't changed since last classification
    if (title === this.lastClassifiedTitle && description === this.lastClassifiedDescription) return;

    this.IsClassifying = true;
    this.cdr.detectChanges();

    const result = await this.feedbackService.Classify(title, description);

    this.IsClassifying = false;
    if (result) {
      this.Category = result.category;
      this.Severity = result.severity;
      this.WasAutoClassified = true;
      this.lastClassifiedTitle = title;
      this.lastClassifiedDescription = description;
    }
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
    if (!this.CertificationAccepted) {
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
        if (response.success) {
          this.SubmissionSuccess = true;
          this.IssueNumber = response.issueNumber;
          this.IssueUrl = response.issueUrl;
          this.EmailWillBeSent = response.emailWillBeSent === true;
          this.EmailSentTo = response.emailSentTo;
          this.FallbackContact = response.fallbackContact;
          this.Success.emit(response);
        } else {
          const message = response.error || 'Submission failed. Please try again.';
          this.ErrorMessage = message;
          this.Error.emit(new Error(message));
        }
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
   * Cancel and close the dialog
   */
  OnCancel(): void {
    this.DialogVisible = false;
    this.Cancelled.emit();
    this.DialogClosed.emit({ success: this.SubmissionSuccess });
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
