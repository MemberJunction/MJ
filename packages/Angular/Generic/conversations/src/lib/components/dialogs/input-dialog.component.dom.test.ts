import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { InputDialogComponent } from './input-dialog.component';

/**
 * DOM spec for <mj-input-dialog> — a pure @Input-driven dialog body.
 * Covers the message/label rendering, the required-mark gating, the
 * text-vs-textarea input branch, and the optional second-input field.
 */
describe('InputDialogComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(InputDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [InputDialogComponent],
      inputs,
    });

  it('renders the message and the input label', () => {
    const f = render({ message: 'Name your conversation', inputLabel: 'Conversation name' });
    expect(text(f, '.dialog-message')).toContain('Name your conversation');
    expect(text(f, '.input-label')).toContain('Conversation name');
  });

  it('shows the required mark when required is true', () => {
    const f = render({ inputLabel: 'Name', required: true });
    expect(query(f, '.required-mark')).not.toBeNull();
  });

  it('omits the required mark when not required', () => {
    const f = render({ inputLabel: 'Name' });
    expect(query(f, '.required-mark')).toBeNull();
  });

  it('renders a single-line input for non-textarea types', () => {
    const f = render({ inputLabel: 'Name', inputType: 'text' });
    expect(query(f, 'input.mj-input')).not.toBeNull();
    expect(query(f, 'textarea.mj-textarea')).toBeNull();
  });

  it('renders a textarea for the "textarea" input type', () => {
    const f = render({ inputLabel: 'Notes', inputType: 'textarea' });
    expect(query(f, 'textarea.mj-textarea')).not.toBeNull();
    expect(query(f, 'input.mj-input')).toBeNull();
  });

  it('reflects the input type on the single-line input', () => {
    const f = render({ inputLabel: 'Email', inputType: 'email' });
    expect((query(f, 'input.mj-input') as HTMLInputElement).type).toBe('email');
  });

  it('renders the second input field when secondInputLabel is set', () => {
    const f = render({ inputLabel: 'Name', inputType: 'text', secondInputLabel: 'Description' });
    // first field is a single-line input, so the only textarea is the second field
    expect(queryAll(f, '.input-field').length).toBe(2);
    expect(query(f, 'textarea.mj-textarea')).not.toBeNull();
    expect(queryAll(f, '.input-label').some((l) => l.textContent?.includes('Description'))).toBe(true);
  });

  it('renders only one field when there is no second input', () => {
    const f = render({ inputLabel: 'Name', inputType: 'text' });
    expect(queryAll(f, '.input-field').length).toBe(1);
  });
});
