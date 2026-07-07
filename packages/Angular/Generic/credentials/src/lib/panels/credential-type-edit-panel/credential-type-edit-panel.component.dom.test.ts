import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { CredentialTypeEditPanelComponent } from './credential-type-edit-panel.component';

/**
 * DOM spec for <mj-credential-type-edit-panel>. Module-declared (standalone:false), gated
 * by @if (isOpen), uses ngModel (FormsModule), renders <mj-loading> when loading. ngOnInit
 * does no data loading, so no provider is required for rendering. Internal (non-input) state
 * (`category`, `isNew`, `schemaFields`) is set in `setup` (before the single detectChanges)
 * to stay NG0100-safe per ANGULAR_TESTING_GUIDE.md §5.
 */

@Component({ standalone: false, selector: 'mj-loading', template: '<span class="stub-loading">loading</span>' })
class LoadingStubComponent {}

function render(
  inputs: Record<string, unknown> = {},
  setup?: (c: CredentialTypeEditPanelComponent) => void,
): ComponentFixture<CredentialTypeEditPanelComponent> {
  return renderComponentFixture(CredentialTypeEditPanelComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [CredentialTypeEditPanelComponent, LoadingStubComponent],
    inputs: { isOpen: true, ...inputs },
    setup,
  });
}

function btn(f: ComponentFixture<CredentialTypeEditPanelComponent>, selector: string): HTMLButtonElement {
  return query(f, selector) as HTMLButtonElement;
}

describe('CredentialTypeEditPanelComponent (DOM)', () => {
  it('does not render the panel when isOpen is false (@if gating)', () => {
    const f = render({ isOpen: false });
    expect(query(f, '.edit-panel')).toBeNull();
  });

  it('renders the panel when isOpen is true', () => {
    const f = render();
    expect(query(f, '.edit-panel')).not.toBeNull();
  });

  it('shows "Create Credential Type" title and Create label in new mode', () => {
    const f = render({}, (c) => {
      c.isNew = true;
    });
    expect(text(f, '.header-text h2')).toBe('Create Credential Type');
    expect(text(f, '.btn-primary span')).toBe('Create');
  });

  it('shows "Edit Credential Type" title, Save label and a Delete button in edit mode', () => {
    const f = render(); // default isNew=false
    expect(text(f, '.header-text h2')).toBe('Edit Credential Type');
    expect(text(f, '.btn-primary span')).toBe('Save');
    expect(query(f, '.btn-delete')).not.toBeNull();
  });

  it('hides the Delete button in new mode (@if !isNew)', () => {
    const f = render({}, (c) => {
      c.isNew = true;
    });
    expect(query(f, '.btn-delete')).toBeNull();
  });

  it('renders one category button per available category', () => {
    const f = render();
    expect(queryAll(f, '.category-btn').length).toBe(f.componentInstance.categories.length);
  });

  it('marks the default category (Integration) as selected and reflects its name in the subtitle', () => {
    const f = render(); // default category = 'Integration'
    expect(text(f, '.header-subtitle')).toBe('Integration credential type');
    const selected = queryAll(f, '.category-btn').filter((b) => b.classList.contains('selected'));
    expect(selected.length).toBe(1);
    expect(selected[0].textContent?.trim()).toBe('Integration');
  });

  it('changes the selected category when a different category button is clicked', () => {
    const f = render();
    const buttons = queryAll(f, '.category-btn') as HTMLButtonElement[];
    const aiIndex = f.componentInstance.categories.indexOf('AI');
    buttons[aiIndex].click(); // (click)="category = cat"
    f.detectChanges();
    expect(f.componentInstance.category).toBe('AI');
    expect(buttons[aiIndex].classList.contains('selected')).toBe(true);
  });

  it('disables the primary button when the name is empty (!canSave)', () => {
    const f = render(); // name empty by default
    expect(btn(f, '.btn-primary').disabled).toBe(true);
  });

  it('enables the primary button once a name is set (canSave)', () => {
    const f = render({}, (c) => {
      c.name = 'OpenAI';
    });
    expect(btn(f, '.btn-primary').disabled).toBe(false);
  });

  it('shows the "no fields" message when there are no schema fields', () => {
    const f = render();
    expect(query(f, '.no-fields-message')).not.toBeNull();
    expect(query(f, '.schema-fields')).toBeNull();
  });

  it('renders one schema-field row per defined field, and no "no fields" message', () => {
    const f = render({}, (c) => {
      c.schemaFields = [
        { name: 'apiKey', type: 'string', title: 'API Key', description: '', isSecret: true, required: true, order: 0 },
        { name: 'orgId', type: 'string', title: 'Org ID', description: '', isSecret: false, required: false, order: 1 },
      ];
    });
    expect(queryAll(f, '.schema-field').length).toBe(2);
    expect(query(f, '.no-fields-message')).toBeNull();
  });

  it('adds a schema field row when "Add Field" is clicked (event-driven CD)', () => {
    const f = render();
    expect(queryAll(f, '.schema-field').length).toBe(0);
    click(f, '.btn-add-field');
    f.detectChanges();
    expect(f.componentInstance.schemaFields.length).toBe(1);
    expect(queryAll(f, '.schema-field').length).toBe(1);
  });

  it('emits close when the close (X) button is clicked', () => {
    const f = render();
    const closed = capture(f.componentInstance.close);
    click(f, '.close-btn');
    expect(closed).toHaveLength(1);
  });

  it('emits close when the Cancel button is clicked', () => {
    const f = render();
    const closed = capture(f.componentInstance.close);
    click(f, '.btn-secondary');
    expect(closed).toHaveLength(1);
  });
});
