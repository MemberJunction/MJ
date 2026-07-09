import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, click, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { CredentialCategoryEditPanelComponent } from './credential-category-edit-panel.component';

/**
 * DOM spec for <mj-credential-category-edit-panel>. Module-declared (standalone:false),
 * gated by @if (isOpen), uses ngModel (FormsModule) and renders <mj-loading> when loading.
 * It loads categories via RunView.FromMetadataProvider(ProviderToUse) in ngOnInit, so we
 * inject a fake provider with canned rows — no backend. A tiny stub stands in for
 * <mj-loading> (from SharedGenericModule) so we don't pull the whole shared module.
 *
 * Internal (non-input) state like `name` / `isNew` is set in `setup` (before the single
 * detectChanges) to stay NG0100-safe per ANGULAR_TESTING_GUIDE.md §5.
 */

// Stub for the <mj-loading> element referenced in the template.
@Component({ standalone: false, selector: 'mj-loading', template: '<span class="stub-loading">loading</span>' })
class LoadingStubComponent {}

const CATEGORIES = [
  { ID: 'c1', Name: 'Production', ParentID: null, Description: null, IconClass: null },
  { ID: 'c2', Name: 'Development', ParentID: null, Description: null, IconClass: null },
];

function render(
  inputs: Record<string, unknown> = {},
  setup?: (c: CredentialCategoryEditPanelComponent) => void,
): ComponentFixture<CredentialCategoryEditPanelComponent> {
  return renderComponentFixture(CredentialCategoryEditPanelComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [CredentialCategoryEditPanelComponent, LoadingStubComponent],
    inputs: { Provider: createFakeProvider({ runViewResults: CATEGORIES }), isOpen: true, ...inputs },
    setup,
  });
}

function btn(f: ComponentFixture<CredentialCategoryEditPanelComponent>, selector: string): HTMLButtonElement {
  return query(f, selector) as HTMLButtonElement;
}

describe('CredentialCategoryEditPanelComponent (DOM, data-bound)', () => {
  it('does not render the panel when isOpen is false (@if gating)', () => {
    const f = render({ isOpen: false });
    expect(query(f, '.edit-panel')).toBeNull();
    expect(query(f, '.panel-backdrop')).toBeNull();
  });

  it('renders the panel chrome with the .open class when isOpen is true', () => {
    const f = render();
    expect(query(f, '.edit-panel')).not.toBeNull();
    expect((query(f, '.edit-panel') as HTMLElement).classList.contains('open')).toBe(true);
  });

  it('shows the "Create Category" title and Create button label in new mode', () => {
    const f = render({}, (c) => {
      c.isNew = true;
    });
    expect(text(f, '.header-text h2')).toBe('Create Category');
    expect(text(f, '.btn-primary span')).toBe('Create');
  });

  it('shows the "Edit Category" title and Save label, plus a Delete button, in edit mode', () => {
    const f = render(); // default isNew=false → edit mode
    expect(text(f, '.header-text h2')).toBe('Edit Category');
    expect(text(f, '.btn-primary span')).toBe('Save');
    expect(query(f, '.btn-delete')).not.toBeNull();
  });

  it('hides the Delete button in new mode (@if !isNew)', () => {
    const f = render({}, (c) => {
      c.isNew = true;
    });
    expect(query(f, '.btn-delete')).toBeNull();
  });

  it('disables the primary (Save) button when the name is empty (!canSave)', () => {
    const f = render();
    expect(btn(f, '.btn-primary').disabled).toBe(true);
  });

  it('enables the primary button once a name is set (canSave)', () => {
    const f = render({}, (c) => {
      c.name = 'My Category';
    });
    expect(btn(f, '.btn-primary').disabled).toBe(false);
  });

  it('renders one icon-suggestion button per configured suggestion', () => {
    const f = render();
    expect(queryAll(f, '.icon-btn').length).toBe(f.componentInstance.iconSuggestions.length);
  });

  it('marks an icon button selected and updates iconClass when clicked (event-driven CD)', () => {
    const f = render();
    const first = f.componentInstance.iconSuggestions[0];
    click(f, '.icon-btn'); // click drives CD the zoneless-correct way
    f.detectChanges();
    expect(f.componentInstance.iconClass).toBe(first.icon);
    expect((queryAll(f, '.icon-btn')[0] as HTMLElement).classList.contains('selected')).toBe(true);
    // icon preview block appears once iconClass is set
    expect(query(f, '.icon-preview')).not.toBeNull();
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

  it('renders the loaded categories as parent <option>s (data-bound from fake provider)', async () => {
    const f = render();
    // loadCategories() is fire-and-forgotten in ngOnInit; flush its promise chain, re-render.
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
    // availableParentCategories returns allCategories (no current category) → 2 + "No parent"
    const options = queryAll(f, '#categoryParent option');
    expect(options.length).toBe(CATEGORIES.length + 1);
    const labels = options.map((o) => o.textContent?.trim());
    expect(labels).toContain('Production');
    expect(labels).toContain('Development');
  });
});
