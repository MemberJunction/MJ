import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { FormQuestion } from '@memberjunction/ai-core-plus';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { DynamicFormFieldComponent } from './dynamic-form-field.component';

/**
 * DOM spec for <mj-dynamic-form-field> — the per-question input renderer.
 * Covers the native-HTML type branches (text/email/textarea/radio/checkbox/dropdown/
 * slider/datetime/time) plus buttongroup (mjButton directive), the label/help/required
 * gating, the WidthClass binding, the disabled binding, and OnValueChange wiring.
 *
 * The mj-numeric-input / mj-datepicker branches (number/currency/date/daterange) are
 * deferred — those child components are not declared here and exercising them adds no
 * coverage of THIS component's template logic beyond what the native branches prove.
 */
describe('DynamicFormFieldComponent (DOM)', () => {
  const render = (question: FormQuestion, extra?: { value?: unknown; control?: FormControl }) =>
    renderComponentFixture(DynamicFormFieldComponent, {
      imports: [CommonModule, FormsModule, ReactiveFormsModule, MJButtonDirective],
      declarations: [DynamicFormFieldComponent],
      inputs: { Question: question, Control: extra?.control ?? new FormControl(extra?.value ?? null) },
    });

  it('renders the label and required indicator when the question is required', () => {
    const f = render({ id: 'q1', label: 'Company Name', type: { type: 'text' }, required: true });
    expect(text(f, '.question-label')).toContain('Company Name');
    expect(query(f, '.required-indicator')).not.toBeNull();
    expect(query(f, '.form-question')?.classList.contains('required')).toBe(true);
  });

  it('omits the required indicator when not required', () => {
    const f = render({ id: 'q1', label: 'Company Name', type: { type: 'text' } });
    expect(query(f, '.required-indicator')).toBeNull();
    expect(query(f, '.form-question')?.classList.contains('required')).toBe(false);
  });

  it('renders help text when provided', () => {
    const f = render({ id: 'q1', label: 'Revenue', type: { type: 'text' }, helpText: 'Annual revenue in USD' });
    expect(text(f, '.help-text')).toContain('Annual revenue in USD');
  });

  it('renders a text input for type "text" with the medium width class', () => {
    const f = render({ id: 'q1', label: 'Name', type: { type: 'text' } });
    expect(query(f, 'input[type="text"].question-input')).not.toBeNull();
    expect(query(f, '.input-container')?.classList.contains('width-medium')).toBe(true);
  });

  it('renders an email input with the wide width class for type "email"', () => {
    const f = render({ id: 'q1', label: 'Email', type: { type: 'email' } });
    expect(query(f, 'input[type="email"].question-input')).not.toBeNull();
    expect(query(f, '.input-container')?.classList.contains('width-wide')).toBe(true);
  });

  it('renders a textarea with the full width class for type "textarea"', () => {
    const f = render({ id: 'q1', label: 'Notes', type: { type: 'textarea' } });
    expect(query(f, 'textarea.question-textarea')).not.toBeNull();
    expect(query(f, '.input-container')?.classList.contains('width-full')).toBe(true);
  });

  it('honors an explicit widthHint over the type default', () => {
    const f = render({ id: 'q1', label: 'Name', type: { type: 'text' }, widthHint: 'narrow' });
    expect(query(f, '.input-container')?.classList.contains('width-narrow')).toBe(true);
  });

  it('renders the placeholder on a text input', () => {
    const f = render({ id: 'q1', label: 'Name', type: { type: 'text', placeholder: 'Type here' } });
    expect((query(f, 'input[type="text"]') as HTMLInputElement).placeholder).toBe('Type here');
  });

  it('renders one radio option per choice and reflects the selected value as checked', () => {
    // The radio's [checked] binds to the component's own Value (CVA state), so seed it via
    // writeValue() in setup — before the first render — to stay NG0100-safe.
    const f = renderComponentFixture(DynamicFormFieldComponent, {
      imports: [CommonModule, FormsModule, ReactiveFormsModule, MJButtonDirective],
      declarations: [DynamicFormFieldComponent],
      inputs: {
        Question: {
          id: 'q1',
          label: 'Size',
          type: {
            type: 'radio',
            options: [
              { value: 's', label: 'Small' },
              { value: 'l', label: 'Large' },
            ],
          },
        },
        Control: new FormControl(null),
      },
      setup: (c) => c.writeValue('l'),
    });
    const radios = queryAll(f, 'input[type="radio"]') as HTMLInputElement[];
    expect(radios.length).toBe(2);
    expect(radios.find((r) => r.value === 'l')?.checked).toBe(true);
    expect(radios.find((r) => r.value === 's')?.checked).toBe(false);
  });

  it('renders checkboxes for a checkbox question, one per option', () => {
    const f = render({
      id: 'q1',
      label: 'Toppings',
      type: {
        type: 'checkbox',
        multiple: true,
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    });
    expect(queryAll(f, 'input[type="checkbox"]').length).toBe(2);
  });

  it('renders a dropdown with a placeholder option plus one per choice', () => {
    const f = render({
      id: 'q1',
      label: 'Country',
      type: {
        type: 'dropdown',
        options: [
          { value: 'us', label: 'US' },
          { value: 'ca', label: 'CA' },
        ],
      },
    });
    // "Select an option..." + 2 real options
    expect(queryAll(f, 'select.question-dropdown option').length).toBe(3);
  });

  it('renders a buttongroup with one mjButton per option', () => {
    const f = render({
      id: 'q1',
      label: 'Choose',
      type: {
        type: 'buttongroup',
        options: [
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
        ],
      },
    });
    const buttons = queryAll(f, 'button.buttongroup-option');
    expect(buttons.length).toBe(2);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['X', 'Y']);
  });

  it('renders a range input for type "slider"', () => {
    const f = render({ id: 'q1', label: 'Volume', type: { type: 'slider', min: 0, max: 10, step: 1 } });
    expect(query(f, 'input[type="range"].question-slider')).not.toBeNull();
  });

  it('renders a datetime-local input for type "datetime"', () => {
    const f = render({ id: 'q1', label: 'When', type: { type: 'datetime' } });
    expect(query(f, 'input[type="datetime-local"]')).not.toBeNull();
  });

  it('renders a time input for type "time"', () => {
    const f = render({ id: 'q1', label: 'At', type: { type: 'time' } });
    expect(query(f, 'input[type="time"]')).not.toBeNull();
  });

  it('disables the text input when setDisabledState(true) is applied before render', () => {
    const f = renderComponentFixture(DynamicFormFieldComponent, {
      imports: [CommonModule, FormsModule, ReactiveFormsModule, MJButtonDirective],
      declarations: [DynamicFormFieldComponent],
      inputs: { Question: { id: 'q1', label: 'Name', type: { type: 'text' } }, Control: new FormControl(null) },
      setup: (c) => c.setDisabledState(true),
    });
    expect((query(f, 'input[type="text"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('calls OnValueChange (CVA onChange) when the text input fires an input event', () => {
    const f = render({ id: 'q1', label: 'Name', type: { type: 'text' } });
    const captured: unknown[] = [];
    f.componentInstance.registerOnChange((v) => captured.push(v));
    const input = query(f, 'input[type="text"]') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    expect(captured).toEqual(['hello']);
  });

  it('emits the option value through OnValueChange when a buttongroup button is clicked', () => {
    const f = render({
      id: 'q1',
      label: 'Choose',
      type: {
        type: 'buttongroup',
        options: [
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
        ],
      },
    });
    const onChange = vi.fn();
    f.componentInstance.registerOnChange(onChange);
    (queryAll(f, 'button.buttongroup-option')[1] as HTMLButtonElement).click();
    expect(onChange).toHaveBeenCalledWith('y');
  });

  it('shows the required validation message when the control is invalid and touched', () => {
    const control = new FormControl(null);
    control.setErrors({ required: true });
    control.markAsTouched();
    const f = render({ id: 'q1', label: 'Name', type: { type: 'text' } }, { control });
    expect(text(f, '.validation-error')).toContain('This field is required');
  });
});
