import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import type { BaseEntity } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { RecordSelectorComponent } from './record-selector.component';

/**
 * DOM-level spec for <mj-record-selector> — a dual-list "shuttle" picker. It is a
 * module-declared (standalone:false) component configured purely via @Inputs, so we render
 * it with renderComponentFixture + declarations/imports (no projected children).
 *
 * The template reads each record through `item.Get(DisplayField)`, so the rows only need a
 * minimal `.Get()` — we build small fakes rather than full BaseEntity instances. The single
 * documented `unknown` seam casts them to BaseEntity[] for the typed @Input.
 */

// Minimal stand-in for a BaseEntity row: the template only ever calls .Get(fieldName).
class FakeRow {
  constructor(private readonly values: Record<string, string>) {}
  Get(field: string): string {
    return this.values[field];
  }
}

const asEntities = (rows: FakeRow[]): BaseEntity[] => rows as unknown as BaseEntity[];

function render(inputs: Record<string, unknown>): ComponentFixture<RecordSelectorComponent> {
  return renderComponentFixture(RecordSelectorComponent, {
    imports: [CommonModule, MJButtonDirective],
    declarations: [RecordSelectorComponent],
    inputs,
  });
}

const makeRows = (...names: string[]): FakeRow[] => names.map((n) => new FakeRow({ Name: n }));

// The two list columns are .unselected-list and .selected-list; rows are .list-item within each.
const unselectedItems = (f: ComponentFixture<RecordSelectorComponent>): Element[] => queryAll(f, '.unselected-list .list-item');
const selectedItems = (f: ComponentFixture<RecordSelectorComponent>): Element[] => queryAll(f, '.selected-list .list-item');

describe('RecordSelectorComponent (DOM)', () => {
  it('renders the available (unselected) and selected records in their columns', () => {
    const f = render({
      DisplayField: 'Name',
      UnselectedRecords: asEntities(makeRows('Alpha', 'Beta')),
      SelectedRecords: asEntities(makeRows('Gamma')),
    });

    expect(unselectedItems(f).map((el) => el.textContent?.trim())).toEqual(['Alpha', 'Beta']);
    expect(selectedItems(f).map((el) => el.textContent?.trim())).toEqual(['Gamma']);
  });

  it('renders the display-field text for each row via item.Get(DisplayField)', () => {
    const f = render({
      DisplayField: 'Name',
      UnselectedRecords: asEntities(makeRows('Alpha')),
    });
    expect(text(f, '.unselected-list .list-item')).toBe('Alpha');
  });

  it('does NOT render the icon span when DisplayIconField is empty', () => {
    const f = render({
      DisplayField: 'Name',
      DisplayIconField: '',
      UnselectedRecords: asEntities(makeRows('Alpha')),
    });
    expect(queryAll(f, '.unselected-list .item-icon')).toHaveLength(0);
  });

  it('renders the icon span (with the icon class) when DisplayIconField is set', () => {
    const row = new FakeRow({ Name: 'Alpha', Icon: 'fa-solid fa-star' });
    const f = render({
      DisplayField: 'Name',
      DisplayIconField: 'Icon',
      UnselectedRecords: asEntities([row]),
    });
    const icon = queryAll(f, '.unselected-list .item-icon');
    expect(icon).toHaveLength(1);
    expect(icon[0].classList.contains('fa-star')).toBe(true);
  });

  it('applies the `active` class to an unselected row when it is clicked (highlight)', () => {
    const f = render({
      DisplayField: 'Name',
      UnselectedRecords: asEntities(makeRows('Alpha', 'Beta')),
    });
    // click the second row → SelectedUnselectedIndex = 1
    (unselectedItems(f)[1] as HTMLElement).click();
    f.detectChanges();

    expect(unselectedItems(f)[0].classList.contains('active')).toBe(false);
    expect(unselectedItems(f)[1].classList.contains('active')).toBe(true);
  });

  it('double-clicking an available row transfers it to selected and emits RecordSelected', () => {
    const f = render({
      DisplayField: 'Name',
      UnselectedRecords: asEntities(makeRows('Alpha', 'Beta')),
      SelectedRecords: asEntities([]),
    });
    const emitted = capture(f.componentInstance.RecordSelected);

    (unselectedItems(f)[0] as HTMLElement).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    f.detectChanges();

    expect(unselectedItems(f).map((el) => el.textContent?.trim())).toEqual(['Beta']);
    expect(selectedItems(f).map((el) => el.textContent?.trim())).toEqual(['Alpha']);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].map((r) => r.Get('Name'))).toEqual(['Alpha']);
  });

  it('the "transfer to selected" button is disabled until an available row is highlighted', () => {
    const f = render({
      DisplayField: 'Name',
      UnselectedRecords: asEntities(makeRows('Alpha')),
    });
    const btn = f.nativeElement.querySelector('button[title="Transfer to selected"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    (unselectedItems(f)[0] as HTMLElement).click();
    f.detectChanges();
    expect(btn.disabled).toBe(false);
  });

  it('the "transfer to available" button is disabled until a selected row is highlighted', () => {
    const f = render({
      DisplayField: 'Name',
      SelectedRecords: asEntities(makeRows('Gamma')),
    });
    const btn = f.nativeElement.querySelector('button[title="Transfer to available"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    (selectedItems(f)[0] as HTMLElement).click();
    f.detectChanges();
    expect(btn.disabled).toBe(false);
  });

  it('"transfer all to selected" moves every available row over and emits RecordSelected', () => {
    const f = render({
      DisplayField: 'Name',
      UnselectedRecords: asEntities(makeRows('Alpha', 'Beta')),
      SelectedRecords: asEntities([]),
    });
    const emitted = capture(f.componentInstance.RecordSelected);

    click(f, 'button[title="Transfer all to selected"]');
    f.detectChanges();

    expect(unselectedItems(f)).toHaveLength(0);
    expect(selectedItems(f).map((el) => el.textContent?.trim())).toEqual(['Alpha', 'Beta']);
    expect(emitted).toHaveLength(1);
  });

  it('"transfer all to available" moves every selected row back and emits RecordUnselected', () => {
    const f = render({
      DisplayField: 'Name',
      UnselectedRecords: asEntities([]),
      SelectedRecords: asEntities(makeRows('Gamma', 'Delta')),
    });
    const emitted = capture(f.componentInstance.RecordUnselected);

    click(f, 'button[title="Transfer all to available"]');
    f.detectChanges();

    expect(selectedItems(f)).toHaveLength(0);
    expect(unselectedItems(f).map((el) => el.textContent?.trim())).toEqual(['Gamma', 'Delta']);
    expect(emitted).toHaveLength(1);
  });
});
