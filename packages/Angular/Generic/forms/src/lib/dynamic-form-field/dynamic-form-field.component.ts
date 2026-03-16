/**
 * @fileoverview Dynamic Form Field Component
 *
 * Renders a single form field based on a `FormQuestion` definition from
 * `@memberjunction/ai-core-plus`. Supports 14+ input types including text,
 * textarea, email, number, currency, date, datetime, time, daterange,
 * buttongroup, radio, dropdown, checkbox, and slider.
 *
 * Implements `ControlValueAccessor` for seamless integration with Angular
 * Reactive Forms. Width is automatically sized based on field type or an
 * explicit `widthHint` on the question definition.
 *
 * @example
 * ```html
 * <mj-dynamic-form-field
 *   [Question]="question"
 *   [Control]="formGroup.get(question.id)"
 *   [formControlName]="question.id">
 * </mj-dynamic-form-field>
 * ```
 *
 * @module @memberjunction/ng-forms
 */

import { Component, Input, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormControl } from '@angular/forms';
import { FormQuestion, FormOption } from '@memberjunction/ai-core-plus';

@Component({
    standalone: false,
    selector: 'mj-dynamic-form-field',
    templateUrl: './dynamic-form-field.component.html',
    styleUrls: ['./dynamic-form-field.component.css'],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => DynamicFormFieldComponent),
            multi: true
        }
    ]
})
export class DynamicFormFieldComponent implements ControlValueAccessor, OnInit {
    /**
     * The question definition that drives this field's rendering.
     * Determines the input type, label, validation, options, and layout.
     */
    @Input() Question!: FormQuestion;

    /**
     * The reactive FormControl bound to this field.
     * Used for validation state display and dropdown binding.
     */
    @Input() Control!: FormControl;

    /** Current field value (managed by ControlValueAccessor) */
    public Value: string | number | boolean | Date | Record<string, Date> | (string | number | boolean)[] | null = null;

    /** Whether this field is disabled */
    public Disabled = false;

    private onChange: (value: string | number | boolean | Date | Record<string, Date> | (string | number | boolean)[] | null) => void = () => {};
    private onTouched: () => void = () => {};

    ngOnInit(): void {
        // No-op; field is configured via inputs
    }

    /**
     * Resolved question type string (handles both simple string and object types).
     */
    public get QuestionType(): string {
        return typeof this.Question.type === 'string'
            ? this.Question.type
            : this.Question.type.type;
    }

    /**
     * Whether this is a choice-based question (buttongroup, radio, dropdown, checkbox).
     */
    public get IsChoiceQuestion(): boolean {
        return ['buttongroup', 'radio', 'dropdown', 'checkbox'].includes(this.QuestionType);
    }

    /**
     * Available options for choice-type questions.
     */
    public get Options(): FormOption[] {
        if (typeof this.Question.type === 'object' && 'options' in this.Question.type) {
            return this.Question.type.options;
        }
        return [];
    }

    /**
     * Whether multiple selections are allowed (for checkbox type).
     */
    public get AllowMultiple(): boolean {
        return this.QuestionType === 'checkbox' ||
            (typeof this.Question.type === 'object' && 'multiple' in this.Question.type && !!this.Question.type.multiple);
    }

    /**
     * CSS class controlling the field width based on `widthHint` or intelligent defaults.
     *
     * Width mapping:
     * - `'narrow'` (~200px): numbers, dates, times
     * - `'medium'` (~450px): text inputs (default)
     * - `'wide'` (100%): emails, buttongroup, radio, checkbox
     * - `'full'` (100%): textarea
     * - `'auto'` (150–350px): dropdowns
     */
    public get WidthClass(): string {
        if (this.Question.widthHint) {
            return `width-${this.Question.widthHint}`;
        }
        const type = this.QuestionType;
        if (['number', 'currency', 'date', 'datetime', 'time'].includes(type)) return 'width-narrow';
        if (['buttongroup', 'radio', 'checkbox'].includes(type)) return 'width-wide';
        if (type === 'dropdown') return 'width-auto';
        if (type === 'textarea') return 'width-full';
        if (type === 'email') return 'width-wide';
        return 'width-medium';
    }

    /** Placeholder text for text-based inputs */
    public get Placeholder(): string | undefined {
        if (typeof this.Question.type === 'object' && 'placeholder' in this.Question.type) {
            return this.Question.type.placeholder as string;
        }
        return undefined;
    }

    /** Minimum value for numeric inputs */
    public get Min(): number | undefined {
        if (typeof this.Question.type === 'object' && 'min' in this.Question.type) {
            return this.Question.type.min as number;
        }
        return undefined;
    }

    /** Maximum value for numeric inputs */
    public get Max(): number | undefined {
        if (typeof this.Question.type === 'object' && 'max' in this.Question.type) {
            return this.Question.type.max as number;
        }
        return undefined;
    }

    /** Step increment for numeric inputs */
    public get Step(): number | undefined {
        if (typeof this.Question.type === 'object' && 'step' in this.Question.type) {
            return this.Question.type.step as number;
        }
        return undefined;
    }

    /** Prefix string for currency inputs (e.g. "$") */
    public get Prefix(): string | undefined {
        if (typeof this.Question.type === 'object' && 'prefix' in this.Question.type) {
            return this.Question.type.prefix as string;
        }
        return undefined;
    }

    /** Suffix string for currency/slider inputs (e.g. "USD", "%") */
    public get Suffix(): string | undefined {
        if (typeof this.Question.type === 'object' && 'suffix' in this.Question.type) {
            return this.Question.type.suffix as string;
        }
        return undefined;
    }

    /** Handle value changes from any input type */
    public OnValueChange(newValue: string | number | boolean | Date | Record<string, Date> | (string | number | boolean)[] | null): void {
        this.Value = newValue;
        this.onChange(newValue);
        this.onTouched();
    }

    /** Toggle a checkbox option (supports single and multiple selection) */
    public ToggleCheckbox(option: FormOption): void {
        if (!this.AllowMultiple) {
            this.OnValueChange(option.value);
        } else {
            const currentValues = Array.isArray(this.Value) ? this.Value : [];
            const index = currentValues.indexOf(option.value);
            const newValues = index > -1
                ? currentValues.filter((v: string | number | boolean) => v !== option.value)
                : [...currentValues, option.value];
            this.OnValueChange(newValues);
        }
    }

    /** Check whether a checkbox option is currently selected */
    public IsChecked(option: FormOption): boolean {
        if (!this.AllowMultiple) {
            return this.Value === option.value;
        }
        return Array.isArray(this.Value) && this.Value.includes(option.value);
    }

    /** Get slider configuration with defaults */
    public GetSliderConfig(): { min: number; max: number; step?: number; suffix?: string } {
        if (typeof this.Question.type === 'object' && this.Question.type.type === 'slider') {
            return {
                min: this.Question.type.min,
                max: this.Question.type.max,
                step: this.Question.type.step,
                suffix: this.Question.type.suffix
            };
        }
        return { min: 0, max: 100, step: 1 };
    }

    /** Handle date range start date change */
    public OnDateRangeStartChange(value: Date): void {
        const current = (this.Value as Record<string, Date>) || {};
        this.OnValueChange({ ...current, start: value });
    }

    /** Handle date range end date change */
    public OnDateRangeEndChange(value: Date): void {
        const current = (this.Value as Record<string, Date>) || {};
        this.OnValueChange({ ...current, end: value });
    }

    /** Track-by function for options lists */
    public TrackByValue(_index: number, option: FormOption): string | number | boolean {
        return option.value;
    }

    // ControlValueAccessor implementation
    writeValue(value: string | number | boolean | Date | Record<string, Date> | (string | number | boolean)[] | null): void {
        this.Value = value;
    }

    registerOnChange(fn: (value: string | number | boolean | Date | Record<string, Date> | (string | number | boolean)[] | null) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.Disabled = isDisabled;
    }
}
