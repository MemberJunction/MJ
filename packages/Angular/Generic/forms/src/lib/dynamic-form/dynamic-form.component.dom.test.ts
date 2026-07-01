import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { AgentResponseForm } from '@memberjunction/ai-core-plus';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { DynamicFormComponent } from './dynamic-form.component';
import { DynamicFormFieldComponent } from '../dynamic-form-field/dynamic-form-field.component';

/**
 * DOM spec for <mj-dynamic-form> — the top-level form container.
 *
 * Covers the template's two render modes and the gating between them:
 *  - @if(IsVisible) gating (no questions / Visible=false → renders nothing)
 *  - simple-choice mode (single buttongroup/radio, no title): one .choice-button
 *    per option, click → FormSubmitted with { [id]: value }, selected class
 *  - full-form mode: .form-title / .form-description rendering, MainQuestions
 *    rendered as <mj-dynamic-form-field>, the standard submit button, and the
 *    footer-choice branch that replaces the submit button.
 *  - disabled binding on buttons.
 *
 * The child <mj-dynamic-form-field> is declared alongside (it has its own
 * dedicated DOM spec); here we only assert that the right NUMBER of fields and
 * the right container chrome are produced by THIS component's template.
 */
describe('DynamicFormComponent (DOM)', () => {
  const imports = [CommonModule, FormsModule, ReactiveFormsModule, MJButtonDirective];
  const declarations = [DynamicFormComponent, DynamicFormFieldComponent];

  const render = (inputs: Record<string, unknown>) => renderComponentFixture(DynamicFormComponent, { imports, declarations, inputs });

  // ---- Visibility gating ----

  it('renders nothing when the form has no questions', () => {
    const def: AgentResponseForm = { title: 'Empty', questions: [] };
    const f = render({ FormDefinition: def });
    expect(query(f, '.dynamic-form')).toBeNull();
  });

  it('renders nothing when Visible is false', () => {
    const def: AgentResponseForm = { title: 'Hidden', questions: [{ id: 'q1', label: 'Name', type: { type: 'text' } }] };
    const f = render({ FormDefinition: def, Visible: false });
    expect(query(f, '.dynamic-form')).toBeNull();
  });

  // ---- Simple-choice mode ----

  it('renders simple-choice buttons for a single titleless buttongroup question', () => {
    const def: AgentResponseForm = {
      questions: [
        {
          id: 'q1',
          label: 'Pick',
          type: {
            type: 'buttongroup',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
        },
      ],
    };
    const f = render({ FormDefinition: def });
    expect(query(f, '.simple-choice-buttons')).not.toBeNull();
    const buttons = queryAll(f, 'button.choice-button');
    expect(buttons.length).toBe(2);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Yes', 'No']);
    // Simple-choice mode does NOT render the full <form>
    expect(query(f, 'form.response-form')).toBeNull();
  });

  it('emits FormSubmitted with the chosen value when a simple-choice button is clicked', () => {
    const def: AgentResponseForm = {
      questions: [
        {
          id: 'confirm',
          label: 'Pick',
          type: {
            type: 'buttongroup',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
        },
      ],
    };
    const f = render({ FormDefinition: def });
    const spy = vi.fn();
    f.componentInstance.FormSubmitted.subscribe(spy);
    (queryAll(f, 'button.choice-button')[0] as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith({ confirm: 'yes' });
  });

  it('does not emit FormSubmitted from a simple-choice click when Disabled', () => {
    const def: AgentResponseForm = {
      questions: [{ id: 'confirm', label: 'Pick', type: { type: 'buttongroup', options: [{ value: 'yes', label: 'Yes' }] } }],
    };
    const f = render({ FormDefinition: def, Disabled: true });
    const spy = vi.fn();
    f.componentInstance.FormSubmitted.subscribe(spy);
    (query(f, 'button.choice-button') as HTMLButtonElement).click();
    expect(spy).not.toHaveBeenCalled();
  });

  // ---- Full-form mode ----

  it('renders the title and description in full-form mode', () => {
    const def: AgentResponseForm = {
      title: 'Onboarding',
      description: 'Tell us about you',
      questions: [{ id: 'q1', label: 'Name', type: { type: 'text' } }],
    };
    const f = render({ FormDefinition: def });
    expect(text(f, '.form-title')).toContain('Onboarding');
    expect(text(f, '.form-description')).toContain('Tell us about you');
    expect(query(f, 'form.response-form')).not.toBeNull();
    expect(query(f, '.simple-choice-buttons')).toBeNull();
  });

  it('renders one <mj-dynamic-form-field> per main question', () => {
    const def: AgentResponseForm = {
      title: 'Form',
      questions: [
        { id: 'q1', label: 'Name', type: { type: 'text' } },
        { id: 'q2', label: 'Email', type: { type: 'email' } },
      ],
    };
    const f = render({ FormDefinition: def });
    expect(queryAll(f, 'mj-dynamic-form-field').length).toBe(2);
  });

  it('renders the standard submit button with the default label when no footer choice exists', () => {
    const def: AgentResponseForm = { title: 'Form', questions: [{ id: 'q1', label: 'Name', type: { type: 'text' } }] };
    const f = render({ FormDefinition: def });
    const submit = query(f, 'button.submit-button');
    expect(submit).not.toBeNull();
    expect(submit?.textContent).toContain('Submit');
  });

  it('renders a custom submit label from submitLabel', () => {
    const def: AgentResponseForm = {
      title: 'Form',
      submitLabel: 'Save Profile',
      questions: [{ id: 'q1', label: 'Name', type: { type: 'text' } }],
    };
    const f = render({ FormDefinition: def });
    expect(text(f, 'button.submit-button')).toContain('Save Profile');
  });

  it('disables the submit button when Disabled is true', () => {
    const def: AgentResponseForm = { title: 'Form', questions: [{ id: 'q1', label: 'Name', type: { type: 'text' } }] };
    const f = render({ FormDefinition: def, Disabled: true });
    expect((query(f, 'button.submit-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits FormSubmitted with the form value when a valid form is submitted', () => {
    const def: AgentResponseForm = { title: 'Form', questions: [{ id: 'name', label: 'Name', type: { type: 'text' } }] };
    const f = render({ FormDefinition: def });
    // Seed a value so the (optional) control has data; not required so it's already valid.
    f.componentInstance.FormGroup.get('name')?.setValue('Acme');
    const spy = vi.fn();
    f.componentInstance.FormSubmitted.subscribe(spy);
    (query(f, 'button.submit-button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith({ name: 'Acme' });
  });

  // ---- Footer-choice branch ----

  it('replaces the submit button with footer-choice buttons when a titled form has a buttongroup question', () => {
    const def: AgentResponseForm = {
      title: 'Review',
      questions: [
        { id: 'notes', label: 'Notes', type: { type: 'textarea' } },
        {
          id: 'decision',
          label: 'Decision',
          type: {
            type: 'buttongroup',
            options: [
              { value: 'approve', label: 'Approve' },
              { value: 'reject', label: 'Reject' },
            ],
          },
        },
      ],
    };
    const f = render({ FormDefinition: def });
    // No standard submit button…
    expect(query(f, 'button.submit-button')).toBeNull();
    // …instead one footer-choice button per option
    const footerButtons = queryAll(f, 'button.footer-choice-button');
    expect(footerButtons.length).toBe(2);
    expect(footerButtons.map((b) => b.textContent?.trim())).toEqual(['Approve', 'Reject']);
    // The buttongroup question is excluded from the main-question fields (only the textarea remains)
    expect(queryAll(f, 'mj-dynamic-form-field').length).toBe(1);
  });

  it('emits the full form value (including the chosen footer value) when a footer-choice button is clicked', () => {
    const def: AgentResponseForm = {
      title: 'Review',
      questions: [
        { id: 'notes', label: 'Notes', type: { type: 'textarea' } },
        {
          id: 'decision',
          label: 'Decision',
          type: {
            type: 'buttongroup',
            options: [
              { value: 'approve', label: 'Approve' },
              { value: 'reject', label: 'Reject' },
            ],
          },
        },
      ],
    };
    const f = render({ FormDefinition: def });
    f.componentInstance.FormGroup.get('notes')?.setValue('looks good');
    const spy = vi.fn();
    f.componentInstance.FormSubmitted.subscribe(spy);
    (queryAll(f, 'button.footer-choice-button')[0] as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith({ notes: 'looks good', decision: 'approve' });
  });
});
