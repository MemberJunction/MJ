import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { AgentResponseForm, FormQuestion } from '@memberjunction/ai-core-plus';

/**
 * Component for displaying agent response forms with dynamic questions
 * Handles both simple button choices and complex multi-question forms
 */
@Component({
  standalone: false,
  selector: 'mj-agent-response-form',
  templateUrl: './agent-response-form.component.html',
  styleUrls: ['./agent-response-form.component.css']
})
export class AgentResponseFormComponent implements OnInit {
  @Input() responseForm!: AgentResponseForm;
  @Input() disabled: boolean = false;
  @Input() isLastMessage: boolean = false;
  @Input() isConversationOwner: boolean = false;

  @Output() formSubmitted = new EventEmitter<Record<string, any>>();

  public formGroup!: FormGroup;
  public isSubmitting: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    console.log('AgentResponseForm ngOnInit:', {
      hasResponseForm: !!this.responseForm,
      responseForm: this.responseForm,
      disabled: this.disabled,
      isLastMessage: this.isLastMessage,
      isConversationOwner: this.isConversationOwner,
      isVisible: this.isVisible,
      isSimpleChoice: this.isSimpleChoice
    });
    this.buildFormGroup();
  }

  /**
   * Check if this is a simple choice (single question with buttongroup/radio, no title)
   * Simple choices render as buttons only, complex forms render as full forms
   */
  public get isSimpleChoice(): boolean {
    if (!this.responseForm) return false;

    return (
      this.responseForm.questions.length === 1 &&
      !this.responseForm.title &&
      this.isChoiceQuestion(this.responseForm.questions[0])
    );
  }

  /**
   * Get the choice question that should be rendered in the footer (if any)
   * Forms with a buttongroup/radio question have those buttons in the footer instead of Submit
   */
  public get footerChoiceQuestion(): FormQuestion | null {
    if (!this.responseForm || this.isSimpleChoice) return null;

    // Find the last buttongroup/radio question - it becomes the footer action
    const choiceQuestions = this.responseForm.questions.filter(q => this.isChoiceQuestion(q));
    return choiceQuestions.length > 0 ? choiceQuestions[choiceQuestions.length - 1] : null;
  }

  /**
   * Get questions to render in the main form area (excludes footer choice question)
   */
  public get mainQuestions(): FormQuestion[] {
    if (!this.responseForm) return [];

    const footerChoice = this.footerChoiceQuestion;
    if (!footerChoice) return this.responseForm.questions;

    return this.responseForm.questions.filter(q => q.id !== footerChoice.id);
  }

  /**
   * Check if we should show the standard Submit button (no footer choice question)
   */
  public get showSubmitButton(): boolean {
    return !this.footerChoiceQuestion;
  }

  /**
   * Check if component should be visible
   */
  public get isVisible(): boolean {
    return (
      this.isLastMessage &&
      this.isConversationOwner &&
      this.responseForm &&
      this.responseForm.questions.length > 0
    );
  }

  /**
   * Get submit button label
   */
  public get submitLabel(): string {
    return this.responseForm.submitLabel || 'Submit';
  }

  /**
   * Check if a question is a choice-based question
   */
  private isChoiceQuestion(question: FormQuestion): boolean {
    const type = typeof question.type === 'string' ? question.type : question.type.type;
    return ['buttongroup', 'radio'].includes(type);
  }

  /**
   * Build the reactive form group from the response form definition
   */
  private buildFormGroup(): void {
    const controls: Record<string, FormControl> = {};

    for (const question of this.responseForm.questions) {
      const validators = [];
      if (question.required) {
        validators.push(Validators.required);
      }

      // Add email validator for email questions
      const questionType = typeof question.type === 'string' ? question.type : question.type.type;
      if (questionType === 'email') {
        validators.push(Validators.email);
      }

      // Add min/max validators for number/currency questions
      if (['number', 'currency'].includes(questionType) && typeof question.type === 'object') {
        if ('min' in question.type && question.type.min != null) {
          validators.push(Validators.min(question.type.min as number));
        }
        if ('max' in question.type && question.type.max != null) {
          validators.push(Validators.max(question.type.max as number));
        }
      }

      // Initialize value based on question type
      let initialValue = question.defaultValue;
      if (!initialValue) {
        // For checkbox with multiple selection, initialize as empty array
        if (questionType === 'checkbox' && typeof question.type === 'object' && 'multiple' in question.type && question.type.multiple) {
          initialValue = [];
        } else {
          initialValue = null;
        }
      }

      controls[question.id] = new FormControl(initialValue, validators);
    }

    this.formGroup = new FormGroup(controls);
  }

  /**
   * Get FormControl for a specific question
   */
  public getControl(questionId: string): FormControl {
    return this.formGroup.get(questionId) as FormControl;
  }

  /**
   * Handle simple choice button click (for single question forms)
   */
  public onSimpleChoiceClick(value: any): void {
    if (!this.disabled && !this.isSubmitting) {
      const question = this.responseForm.questions[0];
      this.isSubmitting = true;
      this.formSubmitted.emit({ [question.id]: value });

      // Reset submitting state after a short delay
      setTimeout(() => {
        this.isSubmitting = false;
        this.cdr.detectChanges();
      }, 1000);
    }
  }

  /**
   * Handle footer choice button click (for forms with choice buttons in footer)
   * Submits the form with all field values plus the selected choice
   */
  public onFooterChoiceClick(value: any): void {
    if (!this.disabled && !this.isSubmitting && this.footerChoiceQuestion) {
      // First validate any required fields in the main form
      const mainControlKeys = this.mainQuestions.map(q => q.id);
      let hasInvalidFields = false;

      for (const key of mainControlKeys) {
        const control = this.formGroup.get(key);
        if (control?.invalid) {
          control.markAsTouched();
          hasInvalidFields = true;
        }
      }

      if (hasInvalidFields) {
        return;
      }

      this.isSubmitting = true;

      // Gather all form values and add the choice value
      const formData = { ...this.formGroup.value };
      formData[this.footerChoiceQuestion.id] = value;

      this.formSubmitted.emit(formData);

      // Reset form and submitting state
      Promise.resolve().then(() => {
        this.formGroup.reset();
        this.isSubmitting = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Handle full form submission
   */
  public onSubmit(): void {
    if (this.formGroup.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.formGroup.controls).forEach(key => {
        this.formGroup.controls[key].markAsTouched();
      });
      return;
    }

    if (!this.disabled && !this.isSubmitting) {
      this.isSubmitting = true;
      this.formSubmitted.emit(this.formGroup.value);

      // Reset form and submitting state
      Promise.resolve().then(() => {
        this.formGroup.reset();
        this.isSubmitting = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Get options for a choice question (used in simple choice mode)
   */
  public getOptions(question: FormQuestion): any[] {
    if (typeof question.type === 'object' && 'options' in question.type) {
      return question.type.options;
    }
    return [];
  }

  /**
   * Check if question has an icon
   */
  public hasIcon(option: any): boolean {
    return option && option.icon;
  }

  /**
   * Track by function for questions list
   */
  public trackByQuestionId(index: number, question: FormQuestion): string {
    return question.id;
  }

  /**
   * Track by function for options list
   */
  public trackByValue(index: number, option: any): any {
    return option.value;
  }
}
