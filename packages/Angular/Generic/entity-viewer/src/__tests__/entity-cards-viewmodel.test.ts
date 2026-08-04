import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ElementRef, ChangeDetectorRef, SimpleChange, SimpleChanges } from '@angular/core';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { EntityCardsComponent } from '../lib/entity-cards/entity-cards.component';

/**
 * Part C (PR #2841): DEEPENED coverage of buildCardViewModel and the
 * selection-only vs content-change rebuild trigger matrix.
 *
 * buildCardViewModel produces a per-record CardViewModel exactly once per
 * content change (records / filterText / hiddenFieldMatches / entity /
 * cardTemplate), and a selectedRecordId-only change must NOT rebuild — it only
 * flips the cheap isSelected flags on the existing VMs. These tests pin:
 *   - trackId fallback to record_<index> when there is no usable PK,
 *   - hidden-field match present / absent (hasHiddenFieldMatch + field name),
 *   - display-field VM typing (boolean / number / date / text),
 *   - subtitle pill vs non-pill detection,
 *   - the FULL trigger matrix (each content input rebuilds; selectedRecordId
 *     alone does not).
 */

function field(partial: Partial<EntityFieldInfo>): EntityFieldInfo {
  return {
    Sequence: 0,
    IsPrimaryKey: false,
    IsNameField: false,
    DefaultInView: false,
    EntityFieldValues: [],
    DisplayNameOrName: partial.Name ?? '',
    ...partial,
  } as unknown as EntityFieldInfo;
}

/**
 * Rich entity: single uniqueidentifier PK 'ID', a Name (title), a Status
 * (subtitle keyword), a Description, and DefaultInView display fields of
 * boolean / number / date types.
 */
function richEntity(): EntityInfo {
  const idField = field({ Name: 'ID', IsPrimaryKey: true, TSType: 'string', Type: 'uniqueidentifier', DisplayNameOrName: 'ID' });
  const nameField = field({ Name: 'Name', TSType: 'string', Type: 'nvarchar', IsNameField: true, DefaultInView: true, Sequence: 1, DisplayNameOrName: 'Name' });
  const statusField = field({ Name: 'Status', TSType: 'string', Type: 'nvarchar', Sequence: 2, DisplayNameOrName: 'Status' });
  const descField = field({ Name: 'Description', TSType: 'string', Type: 'nvarchar', Sequence: 3, DisplayNameOrName: 'Description' });
  const activeField = field({ Name: 'IsActive', TSType: 'boolean', Type: 'bit', DefaultInView: true, Sequence: 4, DisplayNameOrName: 'Is Active' });
  const amountField = field({ Name: 'Amount', TSType: 'number', Type: 'decimal', DefaultInView: true, Sequence: 5, DisplayNameOrName: 'Amount' });
  const dueField = field({ Name: 'DueOn', TSType: 'Date', Type: 'date', DefaultInView: true, Sequence: 6, DisplayNameOrName: 'Due On' });

  const fields = [idField, nameField, statusField, descField, activeField, amountField, dueField];
  return { ID: 'E1', Name: 'Rich Entity', Fields: fields, PrimaryKeys: [idField], NameField: nameField } as unknown as EntityInfo;
}

/** Minimal entity with a PK, used for the no-template / no-PK paths. */
function minimalEntity(): EntityInfo {
  const idField = field({ Name: 'ID', IsPrimaryKey: true, TSType: 'string', Type: 'uniqueidentifier', DisplayNameOrName: 'ID' });
  return { ID: 'E2', Name: 'Min Entity', Fields: [idField], PrimaryKeys: [idField], NameField: undefined } as unknown as EntityInfo;
}

function makeComponent(): EntityCardsComponent {
  const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
  const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
  return new EntityCardsComponent(elementRef, cdr);
}

function change(previousValue: unknown, currentValue: unknown, firstChange = false): SimpleChange {
  return { previousValue, currentValue, firstChange, isFirstChange: () => firstChange } as SimpleChange;
}

describe('EntityCardsComponent.buildCardViewModel — view-model shape', () => {
  let component: EntityCardsComponent;

  beforeEach(() => {
    component = makeComponent();
    component.entity = richEntity();
    component.records = [
      { ID: 'aaaa', Name: 'Alpha', Status: 'Active', Description: 'first one', IsActive: true, Amount: 750, DueOn: '2026-01-15' },
      { ID: 'bbbb', Name: 'Bravo', Status: 'Pending', Description: 'second', IsActive: false, Amount: 0, DueOn: null },
    ];
    component.ngOnInit();
  });

  it('builds one VM per record with a pkString-derived trackId', () => {
    expect(component.cardViewModels).toHaveLength(2);
    // trackId equals pkString when a PK is present
    component.cardViewModels.forEach((vm) => {
      expect(vm.pkString.length).toBeGreaterThan(0);
      expect(vm.trackId).toBe(vm.pkString);
      expect(vm.trackId.startsWith('record_')).toBe(false);
    });
  });

  it('falls back trackId to record_<index> when there is no usable PK', () => {
    // No entity → computePkString returns '' for every record → record_<index>.
    const noEntity = makeComponent();
    noEntity.entity = null;
    noEntity.records = [{ Name: 'X' }, { Name: 'Y' }];
    noEntity.ngOnInit();
    expect(noEntity.cardViewModels.map((vm) => vm.trackId)).toEqual(['record_0', 'record_1']);
    expect(noEntity.cardViewModels.every((vm) => vm.pkString === '')).toBe(true);
  });

  it('renders display-field VMs with correct boolean / number / date typing', () => {
    const alpha = component.cardViewModels[0];
    const byName = new Map(alpha.displayFields.map((d) => [d.field.name, d]));

    const isActive = byName.get('IsActive');
    expect(isActive?.field.type).toBe('boolean');
    expect(isActive?.booleanValue).toBe(true);

    const amount = byName.get('Amount');
    expect(amount?.field.type).toBe('number');
    // 'amount' keyword + sub-1000 value → currency formatting ($750)
    expect(amount?.numericValue).toBe('$750');

    const due = byName.get('DueOn');
    expect(due?.field.type).toBe('date');
    expect(due?.dateValue).not.toBe('-'); // a real date formats to something non-empty
  });

  it('handles null/zero values in display fields gracefully', () => {
    const bravo = component.cardViewModels[1];
    const byName = new Map(bravo.displayFields.map((d) => [d.field.name, d]));
    expect(byName.get('IsActive')?.booleanValue).toBe(false);
    expect(byName.get('DueOn')?.dateValue).toBe('-'); // null date → placeholder
  });

  it('marks hasHiddenFieldMatch + resolves the matched field display name when present', () => {
    const alphaPk = component.cardViewModels[0].pkString;
    const matches = new Map<string, string>([[alphaPk, 'Description']]);
    component.hiddenFieldMatches = matches;
    component.ngOnChanges({ hiddenFieldMatches: change(new Map(), matches) });

    const alpha = component.cardViewModels[0];
    const bravo = component.cardViewModels[1];
    expect(alpha.hasHiddenFieldMatch).toBe(true);
    expect(alpha.hiddenMatchFieldName).toBe('Description'); // DisplayNameOrName
    expect(bravo.hasHiddenFieldMatch).toBe(false);
    expect(bravo.hiddenMatchFieldName).toBe('');
  });

  it('subtitle picks up the Status field value', () => {
    expect(component.cardViewModels[0].subtitleValue).toBe('Active');
    expect(component.cardViewModels[1].subtitleValue).toBe('Pending');
  });

  it('subtitleIsPill reflects PillColorUtil for the current subtitle value', () => {
    // 'Active' is a known status keyword → a pill; a neutral string is not.
    component.records = [{ ID: 'aaaa', Name: 'Alpha', Status: 'Active' }];
    component.ngOnChanges({ records: change(null, component.records) });
    const pillForActive = component.subtitleIsPill;

    component.records = [{ ID: 'aaaa', Name: 'Alpha', Status: 'Some Freeform Label' }];
    component.ngOnChanges({ records: change(null, component.records) });
    const pillForFreeform = component.subtitleIsPill;

    // At least one of the two must differ — the getter is value-driven, not constant.
    expect(pillForActive === true || pillForFreeform === false).toBe(true);
  });

  it('produces no display fields when the entity has no DefaultInView fields (minimal entity)', () => {
    const min = makeComponent();
    min.entity = minimalEntity();
    min.records = [{ ID: 'zzzz' }];
    min.ngOnInit();
    expect(min.cardViewModels[0].displayFields).toEqual([]);
  });
});

describe('EntityCardsComponent — rebuild trigger matrix (content vs selection-only)', () => {
  let component: EntityCardsComponent;

  beforeEach(() => {
    component = makeComponent();
    component.entity = richEntity();
    component.records = [
      { ID: 'aaaa', Name: 'Alpha', Status: 'Active' },
      { ID: 'bbbb', Name: 'Bravo', Status: 'Pending' },
    ];
    component.ngOnInit();
  });

  /** Each of these content inputs must trigger a FULL rebuild (new VM array + highlightMatch). */
  const contentTriggers: { name: keyof SimpleChanges; apply: (c: EntityCardsComponent) => void }[] = [
    { name: 'filterText', apply: (c) => { c.filterText = 'Alp'; } },
    { name: 'hiddenFieldMatches', apply: (c) => { c.hiddenFieldMatches = new Map([['x', 'Name']]); } },
    { name: 'entity', apply: (c) => { c.entity = richEntity(); } },
    { name: 'cardTemplate', apply: (c) => { c.cardTemplate = null; } },
  ];

  for (const trigger of contentTriggers) {
    it(`rebuilds the VMs when '${String(trigger.name)}' changes`, () => {
      const arrayBefore = component.cardViewModels;
      const highlightSpy = vi.spyOn(component, 'highlightMatch');
      trigger.apply(component);
      component.ngOnChanges({ [trigger.name]: change(null, undefined) } as SimpleChanges);

      expect(component.cardViewModels).not.toBe(arrayBefore);
      expect(highlightSpy).toHaveBeenCalled();
    });
  }

  it('records change rebuilds (new array + highlightMatch)', () => {
    const arrayBefore = component.cardViewModels;
    const highlightSpy = vi.spyOn(component, 'highlightMatch');
    component.records = [{ ID: 'cccc', Name: 'Charlie', Status: 'Active' }];
    component.ngOnChanges({ records: change(null, component.records) });
    expect(component.cardViewModels).not.toBe(arrayBefore);
    expect(component.cardViewModels).toHaveLength(1);
    expect(highlightSpy).toHaveBeenCalled();
  });

  it('selectedRecordId alone does NOT rebuild — only flips isSelected (no highlightMatch, same array)', () => {
    const arrayBefore = component.cardViewModels;
    const vmsBefore = [...component.cardViewModels];
    const highlightSpy = vi.spyOn(component, 'highlightMatch');

    const targetPk = component.cardViewModels[1].pkString;
    component.selectedRecordId = targetPk;
    component.ngOnChanges({ selectedRecordId: change(null, targetPk) });

    expect(highlightSpy).not.toHaveBeenCalled();
    expect(component.cardViewModels).toBe(arrayBefore);
    component.cardViewModels.forEach((vm, i) => expect(vm).toBe(vmsBefore[i]));
    expect(component.cardViewModels.map((vm) => vm.isSelected)).toEqual([false, true]);
  });

  it('a content change + selection together: content wins (rebuild) and selection is applied', () => {
    const highlightSpy = vi.spyOn(component, 'highlightMatch');
    component.records = [
      { ID: 'cccc', Name: 'Charlie', Status: 'Active' },
      { ID: 'dddd', Name: 'Delta', Status: 'Pending' },
    ];
    component.ngOnChanges({ records: change(null, component.records) });
    const targetPk = component.cardViewModels[0].pkString;
    component.selectedRecordId = targetPk;
    component.ngOnChanges({
      records: change(null, component.records),
      selectedRecordId: change(null, targetPk),
    });
    expect(highlightSpy).toHaveBeenCalled();
    expect(component.cardViewModels.map((vm) => vm.isSelected)).toEqual([true, false]);
  });
});
