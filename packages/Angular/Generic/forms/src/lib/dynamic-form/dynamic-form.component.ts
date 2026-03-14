/**
 * @fileoverview Dynamic Form Component
 *
 * Top-level container that renders a complete form from an `AgentResponseForm`
 * schema definition. Automatically builds a reactive `FormGroup`, handles
 * validation, and emits structured response data on submission.
 *
 * Supports two rendering modes:
 * - **Simple choice mode**: Single buttongroup/radio question with no title —
 *   renders as standalone buttons for quick one-click responses.
 * - **Full form mode**: Title bar, description, multiple fields, and an action
 *   footer with either a Submit button or choice buttons.
 *
 * @example Basic usage
 * ```html
 * <mj-dynamic-form
 *   [FormDefinition]="responseForm"
 *   [Disabled]="isSaving"
 *   (FormSubmitted)="onFormSubmitted($event)">
 * </mj-dynamic-form>
 * ```
 *
 * @example With visibility control
 * ```html
 * <mj-dynamic-form
 *   [FormDefinition]="responseForm"
 *   [Visible]="isLastMessage && isOwner"
 *   (FormSubmitted)="onFormSubmitted($event)">
 * </mj-dynamic-form>
 * ```
 *
 * @module @memberjunction/ng-forms
 */

import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { AgentResponseForm, FormQuestion, FormOption } from '@memberjunction/ai-core-plus';

@Component({
    standalone: false,
    selector: 'mj-dynamic-form',
    templateUrl: './dynamic-form.component.html',
    styleUrls: ['./dynamic-form.component.css']
})
export class DynamicFormComponent implements OnInit {
    /**
     * The form schema that drives rendering.
     * Contains title, description, questions array, and optional submit label.
     */
    @Input() FormDefinition!: AgentResponseForm;

    /**
     * Whether the form is disabled (e.g. while saving).
     * Disables all inputs and buttons.
     */
    @Input() Disabled = false;

    /**
     * Controls overall visibility. When `false`, the component renders nothing.
     * Defaults to `true` so the form is always shown unless explicitly hidden.
     */
    @Input() Visible = true;

    /**
     * Emitted when the user submits the form. The payload is a key-value map
     * where keys are question IDs and values are the user's responses.
     */
    @Output() FormSubmitted = new EventEmitter<Record<string, string | number | boolean | Date>>();

    /** The reactive form group built from the form definition */
    public FormGroup!: FormGroup;

    /** Whether a submission is in progress */
    public IsSubmitting = false;

    private cdr = inject(ChangeDetectorRef);

    ngOnInit(): void {
        this.buildFormGroup();
    }

    /**
     * Whether this form renders as a simple choice (single buttongroup/radio, no title).
     */
    public get IsSimpleChoice(): boolean {
        if (!this.FormDefinition) return false;
        return (
            this.FormDefinition.questions.length === 1 &&
            !this.FormDefinition.title &&
            this.isChoiceQuestion(this.FormDefinition.questions[0])
        );
    }

    /**
     * The choice question that should render in the footer (if present).
     * When a form has a buttongroup/radio question, those buttons replace
     * the standard Submit button in the footer.
     */
    public get FooterChoiceQuestion(): FormQuestion | null {
        if (!this.FormDefinition || this.IsSimpleChoice) return null;
        const choiceQuestions = this.FormDefinition.questions.filter(q => this.isChoiceQuestion(q));
        return choiceQuestions.length > 0 ? choiceQuestions[choiceQuestions.length - 1] : null;
    }

    /**
     * Questions rendered in the main form area (excludes footer choice question).
     */
    public get MainQuestions(): FormQuestion[] {
        if (!this.FormDefinition) return [];
        const footerChoice = this.FooterChoiceQuestion;
        if (!footerChoice) return this.FormDefinition.questions;
        return this.FormDefinition.questions.filter(q => q.id !== footerChoice.id);
    }

    /**
     * Whether to show the standard Submit button (true when no footer choice question).
     */
    public get ShowSubmitButton(): boolean {
        return !this.FooterChoiceQuestion;
    }

    /**
     * Whether the form should be visible (has questions and Visible is true).
     */
    public get IsVisible(): boolean {
        return (
            this.Visible &&
            !!this.FormDefinition &&
            this.FormDefinition.questions.length > 0
        );
    }

    /**
     * Text for the submit button. Falls back to "Submit" if not specified.
     */
    public get SubmitLabel(): string {
        return this.FormDefinition?.submitLabel || 'Submit';
    }

    /** Get the FormControl for a specific question by ID */
    public GetControl(questionId: string): FormControl {
        return this.FormGroup.get(questionId) as FormControl;
    }

    /** Handle simple choice button click (single-question forms) */
    public OnSimpleChoiceClick(value: string | number | boolean): void {
        if (!this.Disabled) {
            const question = this.FormDefinition.questions[0];
            // Update the FormControl so external readers (e.g. collectFormData) can access the value
            this.FormGroup.get(question.id)?.setValue(value);
            this.FormSubmitted.emit({ [question.id]: value });
        }
    }

    /** Whether a given option value is the currently selected simple choice */
    public IsSimpleChoiceSelected(value: string | number | boolean): boolean {
        if (!this.IsSimpleChoice) return false;
        const question = this.FormDefinition.questions[0];
        const control = this.FormGroup.get(question.id);
        return control?.value === value;
    }

    /** Handle footer choice button click — selects the option and emits the form data */
    public OnFooterChoiceClick(value: string | number | boolean): void {
        if (!this.Disabled && this.FooterChoiceQuestion) {
            const mainControlKeys = this.MainQuestions.map(q => q.id);
            let hasInvalidFields = false;

            for (const key of mainControlKeys) {
                const control = this.FormGroup.get(key);
                if (control?.invalid) {
                    control.markAsTouched();
                    hasInvalidFields = true;
                }
            }

            if (hasInvalidFields) return;

            // Update the FormControl so external readers (e.g. collectFormData) can access the value
            this.FormGroup.get(this.FooterChoiceQuestion.id)?.setValue(value);
            const formData = { ...this.FormGroup.value };
            this.FormSubmitted.emit(formData);
        }
    }

    /** Whether a given option value is the currently selected footer choice */
    public IsFooterChoiceSelected(value: string | number | boolean): boolean {
        if (!this.FooterChoiceQuestion) return false;
        const control = this.FormGroup.get(this.FooterChoiceQuestion.id);
        return control?.value === value;
    }

    /** Handle full form submission */
    public OnSubmit(): void {
        if (this.FormGroup.invalid) {
            Object.keys(this.FormGroup.controls).forEach(key => {
                this.FormGroup.controls[key].markAsTouched();
            });
            return;
        }

        if (!this.Disabled && !this.IsSubmitting) {
            this.IsSubmitting = true;
            this.FormSubmitted.emit(this.FormGroup.value);

            // Reset submitting state after a short delay — the parent container
            // is responsible for hiding the form or handling the response
            setTimeout(() => {
                this.IsSubmitting = false;
                this.cdr.detectChanges();
            }, 1000);
        }
    }

    /** Get options for a choice question */
    public GetOptions(question: FormQuestion): FormOption[] {
        if (typeof question.type === 'object' && 'options' in question.type) {
            return question.type.options;
        }
        return [];
    }

    /** Check if an option has an icon */
    public HasIcon(option: FormOption): boolean {
        return !!option?.icon;
    }

    /** Track-by function for questions */
    public TrackByQuestionId(_index: number, question: FormQuestion): string {
        return question.id;
    }

    /** Track-by function for options */
    public TrackByValue(_index: number, option: FormOption): string | number | boolean {
        return option.value;
    }

    private isChoiceQuestion(question: FormQuestion): boolean {
        const type = typeof question.type === 'string' ? question.type : question.type.type;
        return ['buttongroup', 'radio'].includes(type);
    }

    private buildFormGroup(): void {
        const controls: Record<string, FormControl> = {};

        for (const question of this.FormDefinition.questions) {
            const validators = [];
            if (question.required) {
                validators.push(Validators.required);
            }

            const questionType = typeof question.type === 'string' ? question.type : question.type.type;
            if (questionType === 'email') {
                validators.push(Validators.email);
            }

            if (['number', 'currency'].includes(questionType) && typeof question.type === 'object') {
                if ('min' in question.type && question.type.min != null) {
                    validators.push(Validators.min(question.type.min as number));
                }
                if ('max' in question.type && question.type.max != null) {
                    validators.push(Validators.max(question.type.max as number));
                }
            }

            let initialValue = question.defaultValue;
            if (!initialValue) {
                if (questionType === 'checkbox' && typeof question.type === 'object' && 'multiple' in question.type && question.type.multiple) {
                    initialValue = [];
                } else {
                    initialValue = null;
                }
            }

            controls[question.id] = new FormControl(initialValue, validators);
        }

        this.FormGroup = new FormGroup(controls);
    }
}
