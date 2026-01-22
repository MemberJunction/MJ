import { Component, OnInit, Input, Output, EventEmitter, Inject, ChangeDetectorRef } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { FeedbackSubmission, FeedbackResponse, FeedbackCategory, FeedbackSeverity, FeedbackEnvironment, CategoryOption, SeverityOption, EnvironmentOption } from '../feedback.types';
import { FeedbackConfig, FEEDBACK_CONFIG, FeedbackFieldConfig, mergeFieldConfig } from '../feedback.config';
import { DEFAULT_CATEGORIES, DEFAULT_SEVERITIES, DEFAULT_ENVIRONMENTS } from '../feedback.constants';
import { FeedbackService } from '../services/feedback.service';

@Component({
  selector: 'mj-feedback-form',
  template: `
    <kendo-dialog
      [title]="config.title || 'Submit Feedback'"
      [width]="700"
      [minHeight]="500"
      [autoFocusedElement]="'none'"
      (close)="OnCancel()">

      <!-- Subtitle -->
      <div class="feedback-subtitle" *ngIf="config.subtitle">
        {{ config.subtitle }}
      </div>

      <div class="feedback-form-content" *ngIf="!IsSubmitting && !SubmissionSuccess">
        <!-- Category -->
        <div class="feedback-section">
          <label class="feedback-label">
            Category <span class="required">*</span>
          </label>
          <kendo-dropdownlist
            [(ngModel)]="Category"
            [data]="Categories"
            textField="label"
            valueField="value"
            [valuePrimitive]="true"
            (valueChange)="OnCategoryChange($event)"
            style="width: 100%;">
          </kendo-dropdownlist>
          <div class="category-description" *ngIf="SelectedCategoryDescription">
            {{ SelectedCategoryDescription }}
          </div>
        </div>

        <!-- Title -->
        <div class="feedback-section">
          <label class="feedback-label">
            Title <span class="required">*</span>
          </label>
          <kendo-textbox
            [(ngModel)]="Title"
            (valueChange)="OnFieldChange()"
            placeholder="Brief summary of your feedback..."
            [maxlength]="256"
            style="width: 100%;">
          </kendo-textbox>
          <div class="char-count">{{ Title.length }}/256</div>
        </div>

        <!-- Description -->
        <div class="feedback-section">
          <label class="feedback-label">
            Description <span class="required">*</span>
          </label>
          <kendo-textarea
            [(ngModel)]="Description"
            (valueChange)="OnFieldChange()"
            placeholder="Please provide a detailed description..."
            [rows]="4"
            [maxlength]="10000"
            style="width: 100%;">
          </kendo-textarea>
          <div class="char-count" [class.warning]="Description.length < 20">
            {{ Description.length }}/10000 (minimum 20 characters)
          </div>
        </div>

        <!-- Bug-specific fields -->
        <ng-container *ngIf="Category === 'bug'">
          <!-- Steps to reproduce -->
          <div class="feedback-section" *ngIf="FieldConfig.showStepsToReproduce">
            <label class="feedback-label">
              Steps to Reproduce <span class="optional-hint">(recommended)</span>
            </label>
            <kendo-textarea
              [(ngModel)]="StepsToReproduce"
              placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
              [rows]="3"
              style="width: 100%;">
            </kendo-textarea>
          </div>

          <!-- Expected Behavior -->
          <div class="feedback-section" *ngIf="FieldConfig.showExpectedBehavior">
            <label class="feedback-label">Expected Behavior</label>
            <kendo-textarea
              [(ngModel)]="ExpectedBehavior"
              placeholder="What should have happened?"
              [rows]="2"
              style="width: 100%;">
            </kendo-textarea>
          </div>

          <!-- Actual Behavior -->
          <div class="feedback-section" *ngIf="FieldConfig.showActualBehavior">
            <label class="feedback-label">Actual Behavior</label>
            <kendo-textarea
              [(ngModel)]="ActualBehavior"
              placeholder="What actually happened?"
              [rows]="2"
              style="width: 100%;">
            </kendo-textarea>
          </div>

          <!-- Severity -->
          <div class="feedback-section" *ngIf="FieldConfig.showSeverity">
            <label class="feedback-label">Severity</label>
            <kendo-dropdownlist
              [(ngModel)]="Severity"
              [data]="Severities"
              textField="label"
              valueField="value"
              [valuePrimitive]="true"
              style="width: 200px;">
            </kendo-dropdownlist>
          </div>
        </ng-container>

        <!-- Feature-specific fields -->
        <ng-container *ngIf="Category === 'feature'">
          <div class="feedback-section" *ngIf="FieldConfig.showUseCase">
            <label class="feedback-label">
              Use Case <span class="optional-hint">(recommended)</span>
            </label>
            <kendo-textarea
              [(ngModel)]="UseCase"
              placeholder="What problem would this solve? Why is it needed?"
              [rows]="3"
              style="width: 100%;">
            </kendo-textarea>
          </div>

          <div class="feedback-section" *ngIf="FieldConfig.showProposedSolution">
            <label class="feedback-label">
              Proposed Solution <span class="optional-hint">(optional)</span>
            </label>
            <kendo-textarea
              [(ngModel)]="ProposedSolution"
              placeholder="How might this work?"
              [rows]="2"
              style="width: 100%;">
            </kendo-textarea>
          </div>
        </ng-container>

        <!-- Environment and Affected Area row -->
        <div class="feedback-row" *ngIf="FieldConfig.showEnvironment || FieldConfig.showAffectedArea">
          <div class="feedback-section half" *ngIf="FieldConfig.showEnvironment">
            <label class="feedback-label">Environment</label>
            <kendo-dropdownlist
              [(ngModel)]="Environment"
              [data]="Environments"
              textField="label"
              valueField="value"
              [valuePrimitive]="true"
              style="width: 100%;">
            </kendo-dropdownlist>
          </div>
          <div class="feedback-section half" *ngIf="FieldConfig.showAffectedArea && AffectedAreas.length > 0">
            <label class="feedback-label">Affected Area</label>
            <kendo-dropdownlist
              [(ngModel)]="AffectedArea"
              [data]="AffectedAreas"
              [valuePrimitive]="true"
              style="width: 100%;">
            </kendo-dropdownlist>
          </div>
        </div>

        <!-- Contact info row -->
        <div class="feedback-row" *ngIf="FieldConfig.showName || FieldConfig.showEmail">
          <div class="feedback-section half" *ngIf="FieldConfig.showName">
            <label class="feedback-label">Your Name <span class="optional-hint">(optional)</span></label>
            <kendo-textbox
              [(ngModel)]="Name"
              placeholder="John Doe"
              style="width: 100%;">
            </kendo-textbox>
          </div>
          <div class="feedback-section half" *ngIf="FieldConfig.showEmail">
            <label class="feedback-label">Email <span class="optional-hint">(for follow-up)</span></label>
            <kendo-textbox
              [(ngModel)]="Email"
              placeholder="john@example.com"
              style="width: 100%;">
            </kendo-textbox>
          </div>
        </div>

        <!-- Error message -->
        <div class="feedback-error" *ngIf="ErrorMessage">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ ErrorMessage }}</span>
        </div>
      </div>

      <!-- Loading state -->
      <div class="feedback-loading" *ngIf="IsSubmitting">
        <i class="fas fa-spinner fa-spin fa-2x"></i>
        <span>Submitting your feedback...</span>
      </div>

      <!-- Success state -->
      <div class="feedback-success" *ngIf="SubmissionSuccess">
        <i class="fas fa-check-circle fa-3x"></i>
        <h3>{{ config.successMessage || 'Thank you! Your feedback has been submitted.' }}</h3>
        <p *ngIf="IssueUrl && (config.showIssueLink !== false)">
          <a [href]="IssueUrl" target="_blank" rel="noopener noreferrer">
            View Issue #{{ IssueNumber }}
          </a>
        </p>
      </div>

      <kendo-dialog-actions layout="start">
        <ng-container *ngIf="!SubmissionSuccess">
          <button kendoButton
                  [primary]="true"
                  (click)="OnSubmit()"
                  [disabled]="!CanSubmit() || IsSubmitting">
            <i class="fas" [ngClass]="IsSubmitting ? 'fa-spinner fa-spin' : 'fa-paper-plane'"></i>
            {{ IsSubmitting ? 'Submitting...' : (config.submitButtonText || 'Submit') }}
          </button>
          <button kendoButton (click)="OnCancel()" [disabled]="IsSubmitting">Cancel</button>
        </ng-container>
        <ng-container *ngIf="SubmissionSuccess">
          <button kendoButton [primary]="true" (click)="OnCancel()">Close</button>
        </ng-container>
      </kendo-dialog-actions>
    </kendo-dialog>
  `,
  styles: [`
    :host {
      display: block;
    }

    .feedback-subtitle {
      color: #64748b;
      font-size: 14px;
      margin-bottom: 16px;
      padding: 0 20px;
    }

    .feedback-form-content {
      padding: 0 20px 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .feedback-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .feedback-section.half {
      flex: 1;
      min-width: 0;
    }

    .feedback-row {
      display: flex;
      gap: 16px;
    }

    .feedback-label {
      font-weight: 600;
      font-size: 14px;
      color: #333;
    }

    .required {
      color: #dc3545;
    }

    .optional-hint {
      font-weight: 400;
      font-size: 12px;
      color: #94a3b8;
    }

    .category-description {
      font-size: 12px;
      color: #64748b;
      font-style: italic;
    }

    .char-count {
      font-size: 11px;
      color: #94a3b8;
      text-align: right;
    }

    .char-count.warning {
      color: #f59e0b;
    }

    .feedback-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 60px 20px;
      color: #64748b;
    }

    .feedback-success {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 60px 20px;
      text-align: center;
    }

    .feedback-success i {
      color: #10b981;
    }

    .feedback-success h3 {
      color: #1e293b;
      margin: 0;
    }

    .feedback-success a {
      color: #2563eb;
      text-decoration: none;
    }

    .feedback-success a:hover {
      text-decoration: underline;
    }

    .feedback-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      color: #dc2626;
      font-size: 14px;
    }
  `]
})
export class FeedbackFormComponent implements OnInit {
  // Inputs for pre-filling
  @Input() PrefilledCategory?: FeedbackCategory | string;
  @Input() PrefilledTitle?: string;
  @Input() ContextData?: Record<string, unknown>;

  // Outputs
  @Output() Submitted = new EventEmitter<FeedbackSubmission>();
  @Output() Success = new EventEmitter<FeedbackResponse>();
  @Output() Error = new EventEmitter<Error>();
  @Output() Cancelled = new EventEmitter<void>();

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
    private dialogRef: DialogRef,
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

    const submission: FeedbackSubmission = {
      title: this.Title.trim(),
      description: this.Description.trim(),
      category: this.Category,
      metadata: this.ContextData
    };

    // Add category-specific fields
    if (this.Category === 'bug') {
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

    if (this.Category === 'feature') {
      if (this.UseCase.trim()) {
        submission.useCase = this.UseCase.trim();
      }
      if (this.ProposedSolution.trim()) {
        submission.proposedSolution = this.ProposedSolution.trim();
      }
    }

    // Add optional fields
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
   * Cancel and close the dialog
   */
  OnCancel(): void {
    this.Cancelled.emit();
    this.dialogRef.close({ success: this.SubmissionSuccess });
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
