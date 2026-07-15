import { describe, it, expect } from 'vitest';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { StepRelationshipsComponent } from './step-relationships.component';
import type { EntityInfo } from '@memberjunction/core';
import type { ColumnSpec, ForeignKeySpec } from '../../../database-designer.types';

/**
 * DOM coverage for <mj-entity-step-relationships> (module-declared, OnPush) — the wizard FK step.
 * FK target data (schema/table/column dropdowns) comes from `new Metadata().Entities`, so we install
 * a fake GLOBAL provider carrying a small entity set. The step starts with zero rows (the info blurb
 * + Add button only); clicking "Add Relationship" appends one FK card with the cascading selects and
 * emits ForeignKeysChanged; deleting removes it. Add/Delete are real click events (drive OnPush CD).
 * We assert the row scaffolding + emissions, not the D3-free but metadata-heavy cascade internals.
 */

const FAKE_ENTITIES = [
  { ID: 'e1', SchemaName: 'crm', BaseTable: 'Account', Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsVirtual: false }] },
  { ID: 'e2', SchemaName: 'crm', BaseTable: 'Contact', Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsVirtual: false }] },
] as unknown as EntityInfo[];

const col = (Name: string): ColumnSpec => ({ Name, Type: 'uuid', IsNullable: true }) as ColumnSpec;

const render = (AvailableColumns: ColumnSpec[] = [col('AccountID')]) =>
  renderComponentFixture(StepRelationshipsComponent, {
    imports: [MJButtonDirective],
    declarations: [StepRelationshipsComponent],
    inputs: { AvailableColumns, InitialForeignKeys: [] },
  });

const addBtn = (fixture: ReturnType<typeof render>) => query(fixture, '.add-bar button') as HTMLButtonElement;

describe('StepRelationshipsComponent (DOM)', () => {
  const install = useFakeGlobalProvider();

  it('starts with the info blurb and no FK rows', () => {
    install({ entities: FAKE_ENTITIES });
    const fixture = render();
    expect(query(fixture, '.step-info')).not.toBeNull();
    expect(queryAll(fixture, '.fk-row').length).toBe(0);
  });

  it('always offers the Add Relationship button', () => {
    install({ entities: FAKE_ENTITIES });
    const fixture = render();
    expect(addBtn(fixture)).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Add Relationship');
  });

  it('appends one FK card when Add Relationship is clicked', () => {
    install({ entities: FAKE_ENTITIES });
    const fixture = render();
    addBtn(fixture).click();
    fixture.detectChanges(false);
    expect(queryAll(fixture, '.fk-row').length).toBe(1);
    expect(text(fixture, '.fk-row-label')).toContain('Relationship 1');
  });

  it('renders the cascading selects (source / schema / table / column / fk-type) on a new row', () => {
    install({ entities: FAKE_ENTITIES });
    const fixture = render();
    addBtn(fixture).click();
    fixture.detectChanges(false);
    expect(queryAll(fixture, '.fk-row .fk-field select').length).toBe(5);
  });

  it('populates the target-schema dropdown from provider entities (crm present)', () => {
    install({ entities: FAKE_ENTITIES });
    const fixture = render();
    addBtn(fixture).click();
    fixture.detectChanges(false);
    // Second select is the Target Schema dropdown.
    const schemaSelect = queryAll(fixture, '.fk-row .fk-field select')[1] as HTMLSelectElement;
    const values = Array.from(schemaSelect.options).map((o) => o.value);
    expect(values).toContain('crm');
  });

  it('emits ForeignKeysChanged when a relationship is added', () => {
    install({ entities: FAKE_ENTITIES });
    const fixture = render();
    const changes = capture<ForeignKeySpec[]>(fixture.componentInstance.ForeignKeysChanged);
    addBtn(fixture).click();
    fixture.detectChanges(false);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[changes.length - 1].length).toBe(1);
  });

  it('removes the FK card when its delete button is clicked', () => {
    install({ entities: FAKE_ENTITIES });
    const fixture = render();
    addBtn(fixture).click();
    fixture.detectChanges(false);
    (query(fixture, '.fk-row .delete-btn') as HTMLButtonElement).click();
    fixture.detectChanges(false);
    expect(queryAll(fixture, '.fk-row').length).toBe(0);
  });
});
