import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, click, hasClass, typeInto, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { MjLabelCreateComponent } from './label-create.component';

/**
 * DOM spec for <mj-label-create> — a module-declared (standalone:false) OnPush wizard.
 *
 * Why this spec drives the wizard through its REAL public methods + DOM events rather
 * than seeding `CreateStep` by hand:
 *   - ngOnInit calls resetCreateDialog(), which forces the wizard back to the 'entity'
 *     step on the first change-detection pass. Any state seeded BEFORE that first pass is
 *     wiped, and state seeded AFTER it (a plain property assignment) doesn't render on an
 *     OnPush component in zoneless mode. So the honest way to reach a later step is to
 *     navigate to it the way the user does: SelectEntity() -> click a record -> Continue.
 *   - We render with autoDetect:true and await whenStable() after each interaction. The
 *     component's own markForCheck() calls (in its handlers and after the async record load)
 *     then flush correctly, NG0100-safe.
 *
 * The wizard reads its records list from ProviderToUse via RunView, so we supply rows through
 * createFakeProvider({ runViewResults }). It reads the trackable-entity list from
 * ProviderToUse.Entities in ngOnInit's entity branch, so we attach an empty Entities array
 * (createFakeProvider only stubs RunView/CurrentUser/EntityByName).
 *
 * Deferred (not in this spec): the 'creating' and 'done' step templates. Reaching them runs
 * CreateLabels(), which constructs a real GraphQLVersionHistoryClient against
 * GraphQLDataProvider.Instance — there is no injectable seam to fake it, so those steps are
 * not honestly unit-testable here. The Created/Cancel @Output emitters ARE covered (Cancel
 * via the details-step button; FinishCreate's payload via a direct call).
 */

const CUSTOMERS = { Name: 'Customers', Fields: [{ Name: 'Name', TSType: 'string' }] } as unknown as EntityInfo;

function providerWith(rows: Array<Record<string, unknown>>): IMetadataProvider {
  const p = createFakeProvider({ runViewResults: rows });
  // createFakeProvider doesn't stub `.Entities`; ngOnInit's entity branch reads it.
  (p as unknown as { Entities: unknown[] }).Entities = [];
  return p;
}

function render(rows: Array<Record<string, unknown>> = []): ComponentFixture<MjLabelCreateComponent> {
  return renderComponentFixture(MjLabelCreateComponent, {
    imports: [CommonModule, FormsModule, SharedGenericModule, MJEmptyStateComponent],
    declarations: [MjLabelCreateComponent],
    inputs: { Provider: providerWith(rows) },
    autoDetect: true,
  });
}

/** Navigate the wizard to the records step by selecting an entity (loads records via RunView). */
async function gotoRecords(f: ComponentFixture<MjLabelCreateComponent>): Promise<void> {
  f.componentInstance.SelectEntity(CUSTOMERS);
  await f.whenStable();
}

describe('MjLabelCreateComponent (DOM, wizard)', () => {
  it('starts on the entity step and shows the empty-entity state when no entities are trackable', () => {
    const f = render();

    // Step indicator is visible (not the creating/done states)
    expect(query(f, '.step-indicator')).not.toBeNull();
    // Step 1 is the active step
    expect(hasClass(f, '.step-indicator .step', 'active')).toBe(true);
    // Empty entity list state (no trackable entities)
    expect(text(f, '.entity-list-empty')).toBe('No entities match your search.');
  });

  it('renders selectable records on the records step and toggles the .selected class on click', async () => {
    const f = render([
      { ID: 'r1', Name: 'Acme Corp' },
      { ID: 'r2', Name: 'Globex' },
    ]);
    await gotoRecords(f);

    const options = queryAll(f, '.record-option');
    expect(options.length).toBe(2);
    expect(text(f, '.record-name')).toBe('Acme Corp');
    expect(hasClass(f, '.record-option', 'selected')).toBe(false);

    click(f, '.record-option'); // toggle the first record (event marks the view dirty)
    await f.whenStable();

    expect(hasClass(f, '.record-option', 'selected')).toBe(true);
    expect(text(f, '.selection-count')).toBe('1 selected');
  });

  it('disables Continue until at least one record is selected', async () => {
    const f = render([{ ID: 'r1', Name: 'Acme Corp' }]);
    await gotoRecords(f);

    expect((query(f, '.records-footer .btn-primary') as HTMLButtonElement).disabled).toBe(true);

    click(f, '.record-option'); // select it
    await f.whenStable();

    expect((query(f, '.records-footer .btn-primary') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Select All selects every record and updates the selection count', async () => {
    const f = render([
      { ID: 'r1', Name: 'Acme Corp' },
      { ID: 'r2', Name: 'Globex' },
      { ID: 'r3', Name: 'Initech' },
    ]);
    await gotoRecords(f);

    // First "Select All" button in the selection-actions toolbar
    click(f, '.selection-actions .btn-text');
    await f.whenStable();

    expect(text(f, '.selection-count')).toBe('3 selected');
    expect(queryAll(f, '.record-option.selected').length).toBe(3);
  });

  it('advances to the details step and pre-fills a suggested single-record label name', async () => {
    const f = render([{ ID: 'r1', Name: 'Acme Corp' }]);
    await gotoRecords(f);

    click(f, '.record-option'); // select
    await f.whenStable();
    click(f, '.records-footer .btn-primary'); // Continue -> details
    await f.whenStable();

    expect(query(f, '.details-footer')).not.toBeNull();
    expect(text(f, '.details-summary .summary-item')).toContain('Customers');
    // suggestLabelName() uses "<DisplayName> v1.0" for a single selected record
    const nameInput = query(f, '.form-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Acme Corp v1.0');
  });

  it('disables the Create button on the details step when the label name is blank', async () => {
    const f = render([{ ID: 'r1', Name: 'Acme Corp' }]);
    await gotoRecords(f);
    click(f, '.record-option');
    await f.whenStable();
    click(f, '.records-footer .btn-primary');
    await f.whenStable();

    // The name input arrives pre-filled (suggested) so Create starts enabled.
    expect((query(f, '.details-footer .btn-primary') as HTMLButtonElement).disabled).toBe(false);

    // Type a whitespace-only name through the real input (ngModel two-way -> LabelName,
    // a DOM input event that marks the OnPush view dirty). [disabled]="!LabelName.trim()".
    typeInto(f, '.form-input', '   ');
    await f.whenStable();

    expect(f.componentInstance.LabelName).toBe('   ');
    expect((query(f, '.details-footer .btn-primary') as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits Cancel when the details-step Cancel button is clicked', async () => {
    const f = render([{ ID: 'r1', Name: 'Acme Corp' }]);
    await gotoRecords(f);
    click(f, '.record-option');
    await f.whenStable();
    click(f, '.records-footer .btn-primary');
    await f.whenStable();

    const cancelled = capture(f.componentInstance.Cancel);
    click(f, '.details-footer .btn-secondary');

    expect(cancelled).toHaveLength(1);
  });

  it('FinishCreate emits Created with the captured label/item counts', () => {
    const f = render();
    const c = f.componentInstance;
    c.CreatedLabelCount = 3;
    c.CreatedItemCount = 12;

    const created = capture(c.Created);
    c.FinishCreate();

    expect(created).toEqual([{ LabelCount: 3, ItemCount: 12 }]);
  });
});
