import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, click, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { CredentialEditPanelComponent } from './credential-edit-panel.component';

/**
 * DOM spec for <mj-credential-edit-panel>. Module-declared (standalone:false), gated by
 * @if (isOpen), uses ngModel (FormsModule), renders <mj-loading> while loading.
 *
 * ngOnInit calls loadCategories() which runs RunView.FromMetadataProvider(this.ProviderToUse),
 * so a fake provider (returning no rows) is supplied via the `Provider` input — this is a
 * data-bound component per ANGULAR_TESTING_GUIDE.md §6. The component extends
 * BaseAngularComponent, so `Provider` is inherited.
 *
 * Internal (non-input) state (`name`, `isNew`, `selectedTypeId`, `schemaFields`,
 * `credentialValues`) is set in `setup` BEFORE the single detectChanges to stay NG0100-safe
 * (§5). credentialTypes is left empty so no BaseEntity instances are needed to render.
 */

@Component({ standalone: false, selector: 'mj-loading', template: '<span class="stub-loading">loading</span>' })
class LoadingStubComponent {}

// Returns no category rows — loadCategories() resolves cleanly, nothing to render for categories.
const provider = createFakeProvider({ runViewResults: [] });

function render(inputs: Record<string, unknown> = {}, setup?: (c: CredentialEditPanelComponent) => void): ComponentFixture<CredentialEditPanelComponent> {
  return renderComponentFixture(CredentialEditPanelComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [CredentialEditPanelComponent, LoadingStubComponent],
    inputs: { isOpen: true, Provider: provider, ...inputs },
    setup,
  });
}

function btn(f: ComponentFixture<CredentialEditPanelComponent>, selector: string): HTMLButtonElement {
  return query(f, selector) as HTMLButtonElement;
}

describe('CredentialEditPanelComponent (DOM)', () => {
  it('does not render the panel when isOpen is false (@if gating)', () => {
    const f = render({ isOpen: false });
    expect(query(f, '.edit-panel')).toBeNull();
  });

  it('renders the panel when isOpen is true', () => {
    const f = render();
    expect(query(f, '.edit-panel')).not.toBeNull();
  });

  it('shows "Create Credential" title and Create label in new mode', () => {
    const f = render({}, (c) => {
      c.isNew = true;
    });
    expect(text(f, '.header-text h2')).toBe('Create Credential');
    expect(text(f, '.btn-primary span')).toBe('Create');
  });

  it('shows "Edit Credential" title, Save label and a Delete button in edit mode', () => {
    const f = render(); // default isNew=false
    expect(text(f, '.header-text h2')).toBe('Edit Credential');
    expect(text(f, '.btn-primary span')).toBe('Save');
    expect(query(f, '.btn-delete')).not.toBeNull();
  });

  it('hides the Delete button in new mode (@if !isNew)', () => {
    const f = render({}, (c) => {
      c.isNew = true;
    });
    expect(query(f, '.btn-delete')).toBeNull();
  });

  it('shows the default-icon header and "Select a credential type" subtitle when no type is selected', () => {
    const f = render(); // selectedTypeId empty → selectedType null
    expect(query(f, '.header-icon.default')).not.toBeNull();
    expect(text(f, '.header-subtitle')).toBe('Select a credential type');
  });

  it('shows the "select a credential type" message in new mode with no type chosen', () => {
    const f = render({}, (c) => {
      c.isNew = true;
    });
    expect(query(f, '.no-type-message')).not.toBeNull();
  });

  it('disables the primary button when the name is empty (!canSave)', () => {
    const f = render({}, (c) => {
      c.isNew = true;
    }); // name empty, no type
    expect(btn(f, '.btn-primary').disabled).toBe(true);
  });

  it('keeps the primary button disabled when a name is set but no type is chosen (!canSave)', () => {
    const f = render({}, (c) => {
      c.isNew = true;
      c.name = 'Prod Key';
    });
    expect(btn(f, '.btn-primary').disabled).toBe(true);
  });

  it('enables the primary button once a name and a type are set with no required fields (canSave)', () => {
    const f = render({}, (c) => {
      c.name = 'Prod Key';
      c.selectedTypeId = 'type-1';
    });
    expect(btn(f, '.btn-primary').disabled).toBe(false);
  });

  it('keeps the primary button disabled when a required schema field is unfilled', () => {
    const f = render({}, (c) => {
      c.name = 'Prod Key';
      c.selectedTypeId = 'type-1';
      c.schemaFields = [{ name: 'apiKey', type: 'string', title: 'API Key', description: '', isSecret: true, required: true, order: 0 }];
      c.credentialValues = {}; // required field empty
    });
    expect(btn(f, '.btn-primary').disabled).toBe(true);
  });

  it('enables the primary button when the required schema field is filled', () => {
    const f = render({}, (c) => {
      c.name = 'Prod Key';
      c.selectedTypeId = 'type-1';
      c.schemaFields = [{ name: 'apiKey', type: 'string', title: 'API Key', description: '', isSecret: true, required: true, order: 0 }];
      c.credentialValues = { apiKey: 'sk-123' };
    });
    expect(btn(f, '.btn-primary').disabled).toBe(false);
  });

  it('renders the Credential Values section with one row per schema field', () => {
    const f = render({}, (c) => {
      c.selectedTypeId = 'type-1';
      c.schemaFields = [
        { name: 'apiKey', type: 'string', title: 'API Key', description: '', isSecret: true, required: true, order: 0 },
        { name: 'orgId', type: 'string', title: 'Org ID', description: '', isSecret: false, required: false, order: 1 },
      ];
      c.credentialValues = { apiKey: '', orgId: '' };
    });
    // Only the schema-field rows live inside the encrypted "Credential Values" section.
    const valueLabels = queryAll(f, 'label[for^="field-"]');
    expect(valueLabels.length).toBe(2);
    expect(query(f, '.encrypted-badge')).not.toBeNull();
  });

  it('renders a secret field as a password input with a visibility toggle', () => {
    const f = render({}, (c) => {
      c.selectedTypeId = 'type-1';
      c.schemaFields = [{ name: 'apiKey', type: 'string', title: 'API Key', description: '', isSecret: true, required: true, order: 0 }];
      c.credentialValues = { apiKey: 'sk-123' };
    });
    const input = query(f, '#field-apiKey') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(query(f, '.toggle-visibility-btn')).not.toBeNull();
  });

  it('toggles a secret field to a text input when the visibility button is clicked', () => {
    const f = render({}, (c) => {
      c.selectedTypeId = 'type-1';
      c.schemaFields = [{ name: 'apiKey', type: 'string', title: 'API Key', description: '', isSecret: true, required: true, order: 0 }];
      c.credentialValues = { apiKey: 'sk-123' };
    });
    expect((query(f, '#field-apiKey') as HTMLInputElement).type).toBe('password');
    click(f, '.toggle-visibility-btn');
    f.detectChanges();
    expect(f.componentInstance.isSecretVisible('apiKey')).toBe(true);
    expect((query(f, '#field-apiKey') as HTMLInputElement).type).toBe('text');
  });

  it('applies the input-error class and renders an alert when nameError is set', () => {
    const f = render({}, (c) => {
      c.isNew = true;
      c.nameError = 'A credential named "x" already exists for this type.';
    });
    expect((query(f, '#credentialName') as HTMLInputElement).classList.contains('input-error')).toBe(true);
    const alert = query(f, '.field-error[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('already exists');
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
