import { describe, it, expect } from 'vitest';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { EntityFieldsGridComponent } from './entity-fields-grid.component';
import type { ColumnSpec } from '../../database-designer.types';

/**
 * DOM coverage for <mj-database-fields-grid> (module-declared, OnPush) — the inline field editor.
 * Three auto-managed rows (ID / __mj_CreatedAt / __mj_UpdatedAt) are always rendered; user columns
 * follow. Reserved names surface an inline error badge + error banner and gate HasErrors. Add/Delete
 * are driven by button-click events (which correctly re-render an OnPush view). ColumnsChanged emits
 * on every mutation. Pure @Input, no DI/async beyond event-driven CD.
 */

const col = (over: Partial<ColumnSpec> = {}): ColumnSpec =>
  ({ Name: 'Title', Type: 'string', IsNullable: true, ...over }) as ColumnSpec;

const render = (Columns: ColumnSpec[], Mode: 'create' | 'modify' = 'create') =>
  renderComponentFixture(EntityFieldsGridComponent, {
    imports: [MJAlertComponent, MJButtonDirective],
    declarations: [EntityFieldsGridComponent],
    inputs: { Columns, Mode },
  });

describe('EntityFieldsGridComponent (DOM)', () => {
  it('always injects the three auto-managed column rows', () => {
    const fixture = render([]);
    const autoRows = queryAll(fixture, '.auto-col-row');
    expect(autoRows.length).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('ID');
    expect(fixture.nativeElement.textContent).toContain('__mj_CreatedAt');
    expect(fixture.nativeElement.textContent).toContain('__mj_UpdatedAt');
  });

  it('shows the empty-row hint when no user columns are defined', () => {
    const fixture = render([]);
    expect(query(fixture, '.empty-row')).not.toBeNull();
    expect(queryAll(fixture, '.field-row').length).toBe(0);
  });

  it('renders one editable field-row per user column with its name value', () => {
    const fixture = render([col({ Name: 'FirstName' }), col({ Name: 'LastName' })]);
    const fieldRows = queryAll(fixture, '.field-row');
    expect(fieldRows.length).toBe(2);
    const nameInput = query(fixture, '.field-row .col-name input') as HTMLInputElement;
    expect(nameInput.value).toBe('FirstName');
    expect(query(fixture, '.empty-row')).toBeNull();
  });

  it('flags a reserved column name with an error banner and inline badge', () => {
    const fixture = render([col({ Name: 'ID' })]);
    expect(query(fixture, 'mj-alert')).not.toBeNull();
    expect(query(fixture, '.field-row.row-error')).not.toBeNull();
    expect(query(fixture, '.reserved-badge')).not.toBeNull();
  });

  it('does not show the error banner when all column names are valid', () => {
    const fixture = render([col({ Name: 'ValidName' })]);
    expect(query(fixture, 'mj-alert')).toBeNull();
    expect(query(fixture, '.field-row.row-error')).toBeNull();
  });

  it('appends a new row and emits ColumnsChanged when Add Column is clicked', () => {
    const fixture = render([col({ Name: 'A' })]);
    const changes = capture(fixture.componentInstance.ColumnsChanged);
    const addBtn = query(fixture, '.add-field-bar button') as HTMLButtonElement;
    addBtn.click();
    fixture.detectChanges(false);
    expect(queryAll(fixture, '.field-row').length).toBe(2);
    expect(changes.length).toBeGreaterThan(0);
  });

  it('shows a delete action in create mode (not a hide toggle)', () => {
    const fixture = render([col({ Name: 'A' })]);
    expect(query(fixture, '.field-row .delete-btn')).not.toBeNull();
  });
});
