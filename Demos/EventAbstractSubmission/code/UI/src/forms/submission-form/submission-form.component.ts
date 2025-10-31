import { Component, ElementRef, OnInit } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { SubmissionEntity } from 'mj_generatedentities';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NotificationService } from '@progress/kendo-angular-notification';
import { trigger, state, style, transition, animate } from '@angular/animations';

// Simple markdown editor implementation
export interface MarkdownEditorConfig {
  placeholder: string;
  minHeight: string;
  previewMode: boolean;
  toolbar: boolean;
}

/**
 * Modern Submission Form Component with expandable sections and markdown support
 */
@Component({
  selector: 'mj-submission-form',
  templateUrl: './submission-form.component.html',
  styleUrls: ['./submission-form.component.scss'],
  animations: [
    trigger('slideToggle', [
      state('open', style({
        height: '*',
        opacity: 1,
        transform: 'translateY(0)',
        padding: '30px'
      })),
      state('closed', style({
        height: '0',
        opacity: 0,
        transform: 'translateY(-20px)',
        padding: '0',
        overflow: 'hidden'
      })),
      transition('closed => open', [
        animate('300ms ease-out')
      ]),
      transition('open => closed', [
        animate('200ms ease-in')
      ])
    ])
  ]
})
@RegisterClass(BaseFormComponent, 'Submissions')
export class SubmissionFormComponent extends BaseFormComponent implements OnInit {

  public record!: SubmissionEntity;
  public submissionForm!: FormGroup;
  public isEditing = false;
  public isSaving = false;

  // Section expansion states
  public expandedSections = {
    basic: true,
    content: true,
    details: false,
    additional: false
  };

  // Active tab for content section
  public activeContentTab = 'abstract';

  // Markdown preview states
  public abstractPreview = false;
  public objectivesPreview = false;

  // Session format options with icons
  sessionFormats = [
    { value: 'Keynote', label: 'Keynote Presentation', icon: '🎤', description: 'Main stage presentation for all attendees' },
    { value: 'Talk', label: 'Technical Talk', icon: '💻', description: 'In-depth technical presentation' },
    { value: 'Workshop', label: 'Workshop', icon: '🛠️', description: 'Hands-on learning session' },
    { value: 'Panel', label: 'Panel Discussion', icon: '👥', description: 'Interactive discussion with multiple speakers' },
    { value: 'Tutorial', label: 'Tutorial', icon: '📚', description: 'Step-by-step learning experience' },
    { value: 'Lightning', label: 'Lightning Talk', icon: '⚡', description: 'Quick 5-minute presentation' }
  ];

  // Form progress
  public formProgress = 0;

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private notificationService: NotificationService
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    this.initializeForm();
    this.checkIfEditing();
    this.calculateProgress();
  }

  private initializeForm(): void {
    this.submissionForm = this.fb.group({
      SubmissionTitle: ['', [Validators.required, Validators.maxLength(200)]],
      SubmissionAbstract: ['', [Validators.required, Validators.minLength(100)]],
      SessionFormat: ['Talk', Validators.required],
      SpeakerID: ['', Validators.required],
      EventID: ['', Validators.required],
      Status: ['Draft', Validators.required],
      Keywords: [''],
      TargetAudience: [''],
      Prerequisites: [''],
      LearningObjectives: [''],
      AdditionalNotes: ['']
    });

    // Watch for form changes to update progress
    this.submissionForm.valueChanges.subscribe(() => {
      this.calculateProgress();
    });
  }

  private checkIfEditing(): void {
    if (this.record && this.record.ID) {
      this.isEditing = true;
      this.populateForm();
    }
  }

  private populateForm(): void {
    if (this.record) {
      const recordAny = this.record as any;
      this.submissionForm.patchValue({
        SubmissionTitle: this.record.SubmissionTitle || '',
        SubmissionAbstract: this.record.SubmissionAbstract || '',
        SessionFormat: this.record.SessionFormat || 'Talk',
        SpeakerID: recordAny.SpeakerID || '',
        EventID: this.record.EventID || '',
        Status: this.record.Status || 'Draft',
        Keywords: recordAny.Keywords || '',
        TargetAudience: recordAny.TargetAudience || '',
        Prerequisites: recordAny.Prerequisites || '',
        LearningObjectives: recordAny.LearningObjectives || '',
        AdditionalNotes: recordAny.AdditionalNotes || ''
      });
    }
  }

  /**
   * Toggle section expansion
   */
  public toggleSection(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  /**
   * Calculate form completion progress
   */
  private calculateProgress(): void {
    const controls = this.submissionForm.controls;
    const totalControls = Object.keys(controls).length;
    const filledControls = Object.values(controls).filter(control => {
      const value = control.value;
      return value && value.toString().trim().length > 0;
    }).length;
    
    this.formProgress = Math.round((filledControls / totalControls) * 100);
  }

  /**
   * Get selected session format details
   */
  public getSelectedFormat(): any {
    const formatValue = this.submissionForm.get('SessionFormat')?.value;
    return this.sessionFormats.find(f => f.value === formatValue) || this.sessionFormats[1];
  }

  /**
   * Simple markdown to HTML conversion for preview
   */
  public markdownToHtml(markdown: string): string {
    if (!markdown) return '';
    
    return markdown
      .replace(/^### (.*$)/gim, '<h3 class="md-h3">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="md-h2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="md-h1">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="md-code">$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.+)$/gm, '<p>$1</p>')
      .replace(/<p><\/p>/g, '')
      .replace(/<p>(<h[1-6]>)/g, '$1')
      .replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  }

  /**
   * Get character count for abstract
   */
  public getAbstractCharacterCount(): number {
    return this.submissionForm.get('SubmissionAbstract')?.value?.length || 0;
  }

  /**
   * Get word count for abstract
   */
  public getAbstractWordCount(): number {
    const abstract = this.submissionForm.get('SubmissionAbstract')?.value || '';
    return abstract.trim().split(/\s+/).filter((word: string) => word.length > 0).length;
  }

  /**
   * Check if form field has error
   */
  public hasError(fieldName: string, errorName: string): boolean {
    const field = this.submissionForm.get(fieldName);
    return field?.touched && field?.hasError(errorName) || false;
  }

  /**
   * Get field error message
   */
  public getErrorMessage(fieldName: string): string {
    const field = this.submissionForm.get(fieldName);
    
    if (field?.errors) {
      if (field.errors['required']) {
        return 'This field is required';
      }
      if (field.errors['maxlength']) {
        return `Maximum length is ${field.errors['maxlength'].requiredLength} characters`;
      }
      if (field.errors['minlength']) {
        return `Minimum length is ${field.errors['minlength'].requiredLength} characters`;
      }
    }
    
    return '';
  }

  /**
   * Save the submission
   */
  public async saveSubmission(): Promise<void> {
    if (this.submissionForm.invalid) {
      this.markFormGroupTouched(this.submissionForm);
      this.showWarning('Please fill in all required fields');
      return;
    }

    this.isSaving = true;
    
    try {
      const formData = this.submissionForm.value;
      
      // Create or update the submission record
      if (this.isEditing && this.record) {
        Object.assign(this.record, formData);
        await this.record.Save();
        this.showSuccess('Submission updated successfully');
      } else {
        // TODO: Create new submission - need proper entity initialization
        this.showWarning('Creating new submissions - functionality to be implemented');
        return;
      }
      
      // Notify parent component of changes
      // TODO: Implement proper refresh mechanism
      // this.Refresh();
      
    } catch (error) {
      console.error('Error saving submission:', error);
      this.showError('Error saving submission');
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Submit for review
   */
  public async submitForReview(): Promise<void> {
    if (this.submissionForm.invalid) {
      this.markFormGroupTouched(this.submissionForm);
      this.showWarning('Please fill in all required fields before submitting');
      return;
    }

    this.submissionForm.patchValue({ Status: 'Submitted' });
    await this.saveSubmission();
  }

  /**
   * Cancel editing
   */
  public cancel(): void {
    if (this.isEditing) {
      this.populateForm(); // Reset to original values
    } else {
      this.submissionForm.reset();
    }
  }

  /**
   * Mark all form controls as touched
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  /**
   * Show success notification
   */
  private showSuccess(message: string): void {
    this.notificationService.show({
      content: message,
      hideAfter: 3000,
      position: { horizontal: 'right', vertical: 'top' },
      animation: { type: 'fade', duration: 300 },
      type: { style: 'success', icon: true }
    });
  }

  /**
   * Show error notification
   */
  private showError(message: string): void {
    this.notificationService.show({
      content: message,
      hideAfter: 5000,
      position: { horizontal: 'right', vertical: 'top' },
      animation: { type: 'fade', duration: 300 },
      type: { style: 'error', icon: true }
    });
  }

  /**
   * Show warning notification
   */
  private showWarning(message: string): void {
    this.notificationService.show({
      content: message,
      hideAfter: 4000,
      position: { horizontal: 'right', vertical: 'top' },
      animation: { type: 'fade', duration: 300 },
      type: { style: 'warning', icon: true }
    });
  }
}
