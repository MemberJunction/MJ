import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormControl } from '@angular/forms';
import { FormQuestion, FormOption } from '@memberjunction/ai-core-plus';

/**
 * Component for rendering individual form questions with various input types
 * Implements ControlValueAccessor for seamless integration with Angular forms
 */
@Component({
  selector: 'mj-form-question',
  templateUrl: './form-question.component.html',
  styleUrls: ['./form-question.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FormQuestionComponent),
      multi: true
    }
  ]
})
export class FormQuestionComponent implements ControlValueAccessor {
  @Input() question!: FormQuestion;
  @Input() control!: FormControl;

  public value: any = null;
  public disabled: boolean = false;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  /**
   * Get the question type (handles both simple string and complex types)
   */
  public get questionType(): string {
    return typeof this.question.type === 'string'
      ? this.question.type
      : this.question.type.type;
  }

  /**
   * Check if this is a choice-based question (buttongroup, radio, dropdown, checkbox)
   */
  public get isChoiceQuestion(): boolean {
    const type = this.questionType;
    return ['buttongroup', 'radio', 'dropdown', 'checkbox'].includes(type);
  }

  /**
   * Get options for choice questions
   */
  public get options(): FormOption[] {
    if (typeof this.question.type === 'object' && 'options' in this.question.type) {
      return this.question.type.options;
    }
    return [];
  }

  /**
   * Check if multiple selections are allowed (for checkbox type)
   */
  public get allowMultiple(): boolean {
    return this.questionType === 'checkbox' ||
      (typeof this.question.type === 'object' && 'multiple' in this.question.type && !!this.question.type.multiple);
  }

  /**
   * Get placeholder text for text inputs
   */
  public get placeholder(): string | undefined {
    if (typeof this.question.type === 'object' && 'placeholder' in this.question.type) {
      return this.question.type.placeholder as string;
    }
    return undefined;
  }

  /**
   * Get min value for number/currency inputs
   */
  public get min(): number | undefined {
    if (typeof this.question.type === 'object' && 'min' in this.question.type) {
      return this.question.type.min as number;
    }
    return undefined;
  }

  /**
   * Get max value for number/currency inputs
   */
  public get max(): number | undefined {
    if (typeof this.question.type === 'object' && 'max' in this.question.type) {
      return this.question.type.max as number;
    }
    return undefined;
  }

  /**
   * Get step value for number/currency inputs
   */
  public get step(): number | undefined {
    if (typeof this.question.type === 'object' && 'step' in this.question.type) {
      return this.question.type.step as number;
    }
    return undefined;
  }

  /**
   * Get prefix for currency inputs
   */
  public get prefix(): string | undefined {
    if (typeof this.question.type === 'object' && 'prefix' in this.question.type) {
      return this.question.type.prefix as string;
    }
    return undefined;
  }

  /**
   * Get suffix for currency inputs
   */
  public get suffix(): string | undefined {
    if (typeof this.question.type === 'object' && 'suffix' in this.question.type) {
      return this.question.type.suffix as string;
    }
    return undefined;
  }

  /**
   * Handle value changes
   */
  public onValueChange(newValue: any): void {
    this.value = newValue;
    this.onChange(newValue);
    this.onTouched();
  }

  /**
   * Handle checkbox toggle for multiple selection
   */
  public toggleCheckbox(option: FormOption): void {
    if (!this.allowMultiple) {
      // Single selection mode
      this.onValueChange(option.value);
    } else {
      // Multiple selection mode
      const currentValues = Array.isArray(this.value) ? this.value : [];
      const index = currentValues.indexOf(option.value);

      let newValues: any[];
      if (index > -1) {
        // Remove if already selected
        newValues = currentValues.filter((v: any) => v !== option.value);
      } else {
        // Add if not selected
        newValues = [...currentValues, option.value];
      }

      this.onValueChange(newValues);
    }
  }

  /**
   * Check if a checkbox option is selected
   */
  public isChecked(option: FormOption): boolean {
    if (!this.allowMultiple) {
      return this.value === option.value;
    } else {
      return Array.isArray(this.value) && this.value.includes(option.value);
    }
  }

  // ControlValueAccessor implementation
  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  /**
   * Track by function for options list
   */
  public trackByValue(index: number, option: FormOption): any {
    return option.value;
  }
}
