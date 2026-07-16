import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MJAccordionModule, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { ApplicationDialogComponent, ApplicationDialogData } from './application-dialog.component';
import type { MJEntityEntity } from '@memberjunction/core-entities';

/**
 * DOM coverage for <mj-application-dialog> — a standalone:false, default-CD reactive-form dialog
 * (`extends BaseAngularComponent`). Renders only when `[visible]` is true; on becoming visible its
 * ngOnChanges runs the ASYNC `initializeDialog()` which loads the full entity catalog via
 * `RunView.FromMetadataProvider(this.ProviderToUse)`. We feed that through a `createFakeProvider` on
 * the `[Provider]` input (no backend) and flush microtasks past the isLoading flip before asserting —
 * autoDetect + a macrotask, per the zoneless recipe.
 *
 * The dialog uses the REAL lightweight `mj-accordion-panel` (which projects the form fields via
 * <ng-content>, eager) + `button[mjButton]`; `mj-alert` is a light stub (error branch only). Covered:
 * the Create title, the required-name gate on the primary submit button, the available-entity chips
 * built from the fake catalog, add→assign moving an entity from available to assigned, and the cancel
 * `result` emission. Save (Metadata + entity.Save) needs a backend → out of unit-DOM scope. Save/Cancel
 * follow the MJ convention: confirm LEFT, cancel RIGHT.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<span class="stub-alert"><ng-content></ng-content></span>' })
class StubAlert {
  @Input() Variant = '';
  @Input() Message = '';
}

const ENTITIES = [
  { ID: 'e1', Name: 'Accounts', Description: 'Account records' },
  { ID: 'e2', Name: 'Contacts', Description: 'Contact records' },
] as unknown as MJEntityEntity[];

const CREATE: ApplicationDialogData = { mode: 'create' };

async function render(data: ApplicationDialogData = CREATE, visible = true) {
  const fixture = renderComponentFixture(ApplicationDialogComponent, {
    imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule, MJAccordionModule, MJButtonDirective, StubAlert],
    declarations: [ApplicationDialogComponent],
    inputs: { data, Provider: createFakeProvider({ runViewResults: ENTITIES }), visible },
    autoDetect: true,
  });
  // initializeDialog() is async (loadAllEntities via RunView); let it settle then flush the CD.
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges(false);
  return fixture;
}

const submitBtn = (f: Awaited<ReturnType<typeof render>>) => query(f, '.modal-footer button[type="submit"]') as HTMLButtonElement;

describe('ApplicationDialogComponent (DOM)', () => {
  it('does not render the dialog when not visible', async () => {
    const fixture = await render(CREATE, false);
    expect(query(fixture, '.modal-dialog')).toBeNull();
  });

  it('renders the Create title and loads the available-entity chips from the provider', async () => {
    const fixture = await render();
    expect(text(fixture, '.modal-title')).toContain('Create New Application');
    const chips = queryAll(fixture, '.entity-chip');
    expect(chips.length).toBe(2);
    expect(chips.map((c) => c.textContent?.trim()).join(' ')).toContain('Accounts');
  });

  it('disables the primary submit button while the required name is empty', async () => {
    const fixture = await render();
    expect(submitBtn(fixture).disabled).toBe(true);
    fixture.componentInstance.applicationForm.get('name')!.setValue('My App');
    fixture.detectChanges(false);
    expect(submitBtn(fixture).disabled).toBe(false);
  });

  it('moves an entity from available to assigned when its chip is clicked', async () => {
    const fixture = await render();
    (queryAll(fixture, '.entity-chip')[0] as HTMLElement).click();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.applicationEntities.length).toBe(1);
    expect(fixture.componentInstance.applicationEntities[0].entity.Name).toBe('Accounts');
    // The assigned list now shows an entity-item, and only one chip remains available.
    expect(queryAll(fixture, '.entity-item').length).toBe(1);
    expect(queryAll(fixture, '.entity-chip').length).toBe(1);
  });

  it('emits {action:cancel} when the Cancel button is clicked', async () => {
    const fixture = await render();
    const results = capture(fixture.componentInstance.result);
    // Cancel is the second footer button (confirm on the LEFT, cancel on the RIGHT).
    const footerButtons = queryAll(fixture, '.modal-footer button');
    (footerButtons[footerButtons.length - 1] as HTMLElement).click();
    expect(results).toEqual([{ action: 'cancel' }]);
  });
});
