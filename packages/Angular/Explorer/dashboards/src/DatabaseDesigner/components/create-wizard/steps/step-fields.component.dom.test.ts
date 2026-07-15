import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import type { ColumnSpec } from '../../../database-designer.types.js';
import { StepFieldsComponent } from './step-fields.component';

/**
 * DOM coverage for <mj-entity-step-fields> — a thin OnPush wrapper that hosts the heavy
 * <mj-database-fields-grid> in create mode, forwarding [Columns] down and re-emitting
 * (ColumnsChanged) up. The grid is replaced with a lightweight selector/binding stub (its own
 * tests cover it); these specs verify the wrapper's pass-through contract. Single sync render.
 */

@Component({ standalone: true, selector: 'mj-database-fields-grid', template: '' })
class FieldsGridStub {
  @Input() Columns: ColumnSpec[] = [];
  @Input() Mode = '';
  @Output() ColumnsChanged = new EventEmitter<ColumnSpec[]>();
}

const COLUMNS: ColumnSpec[] = [
  { Name: 'id', Type: 'uuid', IsNullable: false },
  { Name: 'title', Type: 'string', MaxLength: 200, IsNullable: true },
];

const render = () =>
  renderComponentFixture(StepFieldsComponent, {
    imports: [FieldsGridStub],
    declarations: [StepFieldsComponent],
    inputs: { InitialColumns: COLUMNS },
  });

const gridStub = (fixture: ReturnType<typeof render>) =>
  fixture.debugElement.query(By.directive(FieldsGridStub)).componentInstance as FieldsGridStub;

describe('StepFieldsComponent (DOM)', () => {
  it('renders the fields grid in create mode', () => {
    const fixture = render();
    expect(query(fixture, 'mj-database-fields-grid')).not.toBeNull();
    expect(gridStub(fixture).Mode).toBe('create');
  });

  it('forwards InitialColumns down to the grid [Columns] input', () => {
    expect(gridStub(render()).Columns).toBe(COLUMNS);
  });

  it('re-emits ColumnsChanged when the grid reports a change', () => {
    const fixture = render();
    const changed = capture(fixture.componentInstance.ColumnsChanged);
    const next: ColumnSpec[] = [{ Name: 'id', Type: 'uuid', IsNullable: false }];
    gridStub(fixture).ColumnsChanged.emit(next);
    expect(changed).toEqual([next]);
  });
});
