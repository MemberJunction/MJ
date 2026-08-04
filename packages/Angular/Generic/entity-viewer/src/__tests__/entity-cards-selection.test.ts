import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ElementRef, ChangeDetectorRef, SimpleChanges, SimpleChange } from '@angular/core';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { EntityCardsComponent } from '../lib/entity-cards/entity-cards.component';

/**
 * Fix A regression coverage: a selection-only change (selectedRecordId) must
 * flip the cheap isSelected flags on the EXISTING card view-models WITHOUT
 * rebuilding them — i.e. without re-running the per-card buildPkString()
 * allocations or the RegExp-building highlightMatch() calls. A records change,
 * by contrast, must rebuild.
 */

// Minimal EntityInfo mock — just enough for buildPkString (PrimaryKeys) and
// the template-generation heuristics (Fields). Single uniqueidentifier PK 'ID'.
function mockEntity(): EntityInfo {
  const idField = {
    Name: 'ID',
    IsPrimaryKey: true,
    TSType: 'string',
    Type: 'uniqueidentifier',
    Sequence: 0,
    IsNameField: false,
    DefaultInView: false,
    DisplayNameOrName: 'ID',
    EntityFieldValues: [],
  } as unknown as EntityFieldInfo;

  const nameField = {
    Name: 'Name',
    IsPrimaryKey: false,
    TSType: 'string',
    Type: 'nvarchar',
    Sequence: 1,
    IsNameField: true,
    DefaultInView: true,
    DisplayNameOrName: 'Name',
    EntityFieldValues: [],
  } as unknown as EntityFieldInfo;

  const fields = [idField, nameField];

  return {
    ID: 'E1',
    Name: 'Test Entity',
    Fields: fields,
    PrimaryKeys: [idField],
    NameField: nameField,
  } as unknown as EntityInfo;
}

function makeComponent(): EntityCardsComponent {
  const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
  const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
  return new EntityCardsComponent(elementRef, cdr);
}

function change(previousValue: unknown, currentValue: unknown, firstChange = false): SimpleChange {
  return { previousValue, currentValue, firstChange, isFirstChange: () => firstChange } as SimpleChange;
}

describe('EntityCardsComponent — selection-only updates (Fix A)', () => {
  let component: EntityCardsComponent;

  beforeEach(() => {
    component = makeComponent();
    component.entity = mockEntity();
    component.records = [
      { ID: 'a', Name: 'Alpha' },
      { ID: 'b', Name: 'Bravo' },
      { ID: 'c', Name: 'Charlie' },
    ];
    component.ngOnInit();
  });

  // The pkString format is CompositeKey.ToConcatenatedString() (e.g. "ID|a"),
  // not the raw PK value. Resolve the real strings from the built VMs so the
  // tests are robust to that format.
  function pk(index: number): string {
    return component.cardViewModels[index].pkString;
  }

  it('builds VMs with pkStrings and no selection initially', () => {
    expect(component.cardViewModels).toHaveLength(3);
    expect(component.cardViewModels.every(vm => vm.pkString.length > 0)).toBe(true);
    expect(component.cardViewModels.every(vm => !vm.isSelected)).toBe(true);
  });

  it('selection-only change flips the correct isSelected flag WITHOUT re-running highlightMatch', () => {
    const highlightSpy = vi.spyOn(component, 'highlightMatch');

    const targetPk = pk(1);
    component.selectedRecordId = targetPk;
    const changes: SimpleChanges = { selectedRecordId: change(null, targetPk) };
    component.ngOnChanges(changes);

    expect(highlightSpy).not.toHaveBeenCalled();
    expect(component.cardViewModels.map(vm => vm.isSelected)).toEqual([false, true, false]);
  });

  it('selection-only change preserves the array and every VM object reference', () => {
    const arrayBefore = component.cardViewModels;
    const vmsBefore = [...component.cardViewModels];

    const targetPk = pk(2);
    component.selectedRecordId = targetPk;
    component.ngOnChanges({ selectedRecordId: change(null, targetPk) });

    // Same array instance and same VM instances — only the flags mutated in place.
    expect(component.cardViewModels).toBe(arrayBefore);
    component.cardViewModels.forEach((vm, i) => expect(vm).toBe(vmsBefore[i]));
    expect(component.cardViewModels.map(vm => vm.isSelected)).toEqual([false, false, true]);
  });

  it('clearing the selection unsets all isSelected flags', () => {
    const firstPk = pk(0);
    component.selectedRecordId = firstPk;
    component.ngOnChanges({ selectedRecordId: change(null, firstPk) });
    expect(component.cardViewModels.map(vm => vm.isSelected)).toEqual([true, false, false]);

    component.selectedRecordId = null;
    component.ngOnChanges({ selectedRecordId: change(firstPk, null) });
    expect(component.cardViewModels.every(vm => !vm.isSelected)).toBe(true);
  });

  it('a records change DOES rebuild the VMs (new array + highlightMatch runs)', () => {
    const arrayBefore = component.cardViewModels;
    const highlightSpy = vi.spyOn(component, 'highlightMatch');

    component.records = [
      { ID: 'x', Name: 'Xray' },
      { ID: 'y', Name: 'Yankee' },
    ];
    component.ngOnChanges({ records: change(null, component.records) });

    expect(component.cardViewModels).not.toBe(arrayBefore);
    expect(component.cardViewModels).toHaveLength(2);
    expect(component.cardViewModels.every(vm => vm.pkString.length > 0)).toBe(true);
    expect(highlightSpy).toHaveBeenCalled();
  });

  it('a combined records+selectedRecordId change rebuilds and sets selection correctly', () => {
    const highlightSpy = vi.spyOn(component, 'highlightMatch');
    component.records = [
      { ID: 'x', Name: 'Xray' },
      { ID: 'y', Name: 'Yankee' },
    ];
    // Match the second new record's pkString format ("ID|y").
    const targetPk = component.cardViewModels[1].pkString.replace(/[^|]+$/, 'y');
    component.selectedRecordId = targetPk;
    component.ngOnChanges({
      records: change(null, component.records),
      selectedRecordId: change(null, targetPk),
    });

    // content change wins → full rebuild, which also sets isSelected correctly
    expect(highlightSpy).toHaveBeenCalled();
    expect(component.cardViewModels.map(vm => vm.isSelected)).toEqual([false, true]);
  });

  it('selection-only change still requests a scroll-to-selected', () => {
    const targetPk = pk(1);
    component.selectedRecordId = targetPk;
    component.ngOnChanges({ selectedRecordId: change(null, targetPk) });
    // pendingScrollToSelected is private; assert via behavior in ngAfterViewChecked.
    const scrollSpy = vi
      .spyOn(component as unknown as { scrollToSelectedCard: () => void }, 'scrollToSelectedCard')
      .mockImplementation(() => {});
    vi.useFakeTimers();
    component.ngAfterViewChecked();
    vi.runAllTimers();
    expect(scrollSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
