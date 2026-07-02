import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { EntityFilterPanelComponent, EntityFilter } from './entity-filter-panel.component';

/**
 * DOM-level spec for <mj-entity-filter-panel> — a module-declared (standalone:false) component
 * configured via @Inputs. It renders the of-count summary, the reset/close buttons, and the
 * native text inputs; we assert summary rendering, button-click @Output emission, and that
 * the text inputs feed back into the EntityFilter via ngModel + (ngModelChange).
 *
 * The schema/status dropdowns are <mj-dropdown> (a real MJ component). Its custom (ValueChange)
 * path requires user interaction inside the dropdown's own popup, which renders/behaves outside
 * the scope of a unit fixture — so the dropdown's onSchemaChange/onStatusChange wiring is not
 * asserted here (it's covered by the handler-level logic). We assert everything the panel itself
 * owns in its own template.
 */

// Minimal EntityInfo-shaped objects — the component only reads SchemaName off them.
function entity(schemaName: string): EntityInfo {
  return { SchemaName: schemaName } as unknown as EntityInfo;
}

const DEFAULT_FILTERS: EntityFilter = {
  schemaName: null,
  entityName: '',
  entityStatus: null,
  baseTable: '',
};

function render(inputs: Record<string, unknown> = {}): ComponentFixture<EntityFilterPanelComponent> {
  return renderComponentFixture(EntityFilterPanelComponent, {
    imports: [CommonModule, FormsModule, MJButtonDirective, MJDropdownComponent],
    declarations: [EntityFilterPanelComponent],
    inputs: { filters: { ...DEFAULT_FILTERS }, ...inputs },
  });
}

describe('EntityFilterPanelComponent (DOM)', () => {
  it('renders the filtered/total count summary from the inputs', () => {
    const f = render({
      entities: [entity('dbo'), entity('crm'), entity('crm')],
      filteredEntities: [entity('crm')],
    });
    expect(text(f, '.summary-value')).toBe('1');
    expect(text(f, '.summary-label')).toBe('of 3');
  });

  it('renders a header title and the four filter groups', () => {
    const f = render();
    expect(text(f, '.filter-panel-header h3')).toBe('Entity Filters');
    // Schema, Entity Name, Base Table, Status
    expect(queryAll(f, '.filter-group').length).toBe(4);
  });

  it('emits closePanel when the close button is clicked', () => {
    const f = render();
    const closed = capture(f.componentInstance.closePanel);
    const closeBtn = query(f, 'button[aria-label="Close filter panel"]') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(closed).toHaveLength(1);
  });

  it('emits resetFilters when the reset button is clicked', () => {
    const f = render();
    const reset = capture(f.componentInstance.resetFilters);
    const resetBtn = query(f, 'button.reset-btn') as HTMLButtonElement;
    expect(resetBtn).not.toBeNull();
    resetBtn.click();
    expect(reset).toHaveLength(1);
  });

  it('builds schema options (All + distinct sorted schemas) from the entities input', () => {
    const f = render({ entities: [entity('zoo'), entity('alpha'), entity('alpha')] });
    // schemaOptions = [All Schemas, alpha, zoo]
    expect(f.componentInstance.schemaOptions.map((o) => o.value)).toEqual([null, 'alpha', 'zoo']);
  });

  it('typing into the Entity Name input updates the filter model and emits filtersChange + filterChange', () => {
    const f = render();
    const filtersChange = capture(f.componentInstance.filtersChange);
    const filterChange = capture(f.componentInstance.filterChange);

    const nameInput = queryAll(f, 'input.filter-input')[0] as HTMLInputElement;
    nameInput.value = 'Account';
    nameInput.dispatchEvent(new Event('input'));
    f.detectChanges();

    expect(f.componentInstance.filters.entityName).toBe('Account');
    expect(filtersChange).toHaveLength(1);
    expect(filtersChange[0].entityName).toBe('Account');
    expect(filterChange).toHaveLength(1);
  });

  it('typing into the Base Table input updates the filter model', () => {
    const f = render();
    const baseTableInput = queryAll(f, 'input.filter-input')[1] as HTMLInputElement;
    baseTableInput.value = 'tbl_account';
    baseTableInput.dispatchEvent(new Event('input'));
    f.detectChanges();

    expect(f.componentInstance.filters.baseTable).toBe('tbl_account');
  });
});
