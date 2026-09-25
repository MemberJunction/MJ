import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { BaseFormComponentEventCodes, FormEditingCompleteEvent, PendingRecordItem } from '@memberjunction/ng-base-types';
import { BaseFormComponent } from './base-form-component';

/**
 * `BaseFormComponent.HasUnsavedChangesBeyondRecord` — unsaved work a form holds that its record's
 * own fields don't show: pending related records (a child grid's edits/deletes) and
 * `HasAdditionalUnsavedChanges`. Hosts consult it before tearing a form down (the standard-form
 * switch), so it must be a pure read: it must NOT raise EDITING_COMPLETE (child grids commit
 * in-progress edits on that) and must NOT rebuild the form's pending-records list (the save
 * pipeline owns it). A descendant grid is played by an MJGlobal listener that answers
 * POPULATE_PENDING_RECORDS the way `join-grid` does.
 */

@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;
  public ExtraDirty = false;
  override get HasAdditionalUnsavedChanges(): boolean { return this.ExtraDirty; }
  public get PendingRecordsForTest(): PendingRecordItem[] { return this.PendingRecords; }
}

function makeEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000001-0000-0000-0000-00000000B755',
    Name: 'Test Unsaved Entities',
    Status: 'Active',
    BaseTable: 'TestUnsavedEntity',
    BaseView: 'vwTestUnsavedEntities',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
    ],
  });
}

/** BaseEntity is abstract; a bare concrete subclass is all this test needs. */
class TestEntity extends BaseEntity {}

function makeRecord(): BaseEntity {
  const record = new TestEntity(makeEntityInfo());
  record.SetMany({ ID: '11111111-2222-3333-4444-555555555555', Name: 'Original' }, true, true);
  return record;
}

function makeForm(): TestForm {
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.record = makeRecord();
  return form;
}

describe('BaseFormComponent.HasUnsavedChangesBeyondRecord', () => {
  let sub: Subscription | null = null;
  let answerWith: PendingRecordItem[] = [];
  let subEventCodes: string[] = [];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    answerWith = [];
    subEventCodes = [];
    // Plays a descendant grid: reports its pending changes on POPULATE_PENDING_RECORDS.
    sub = MJGlobal.Instance.GetEventListener(false).subscribe((e) => {
      if (e.event !== MJEventType.ComponentEvent || e.eventCode !== BaseFormComponentEventCodes.BASE_CODE) return;
      const args = e.args as FormEditingCompleteEvent;
      subEventCodes.push(args.subEventCode);
      if (args.subEventCode === BaseFormComponentEventCodes.POPULATE_PENDING_RECORDS) {
        args.pendingChanges.push(...answerWith);
      }
    });
  });

  afterEach(() => {
    sub?.unsubscribe();
    sub = null;
  });

  it('is false for a clean form with no pending records', () => {
    expect(makeForm().HasUnsavedChangesBeyondRecord).toBe(false);
  });

  it('ignores the record\'s own fields (the caller decides about those)', () => {
    const form = makeForm();
    form.record.SetMany({ Name: 'Edited' });
    expect(form.record.Dirty).toBe(true);
    expect(form.HasUnsavedChangesBeyondRecord).toBe(false);
  });

  it('is true when HasAdditionalUnsavedChanges is true', () => {
    const form = makeForm();
    form.ExtraDirty = true;
    expect(form.HasUnsavedChangesBeyondRecord).toBe(true);
  });

  it('is true when a descendant reports a dirty pending record', () => {
    const child = makeRecord();
    child.SetMany({ Name: 'Child edit' });
    answerWith = [{ entityObject: child, action: 'save' }];
    expect(makeForm().HasUnsavedChangesBeyondRecord).toBe(true);
  });

  it('is true when a descendant reports a pending delete', () => {
    answerWith = [{ entityObject: makeRecord(), action: 'delete' }];
    expect(makeForm().HasUnsavedChangesBeyondRecord).toBe(true);
  });

  it('ignores a clean pending save', () => {
    answerWith = [{ entityObject: makeRecord(), action: 'save' }];
    expect(makeForm().HasUnsavedChangesBeyondRecord).toBe(false);
  });

  it('is a pure read: no EDITING_COMPLETE, and the form\'s pending-records list is untouched', () => {
    const form = makeForm();
    const child = makeRecord();
    child.SetMany({ Name: 'Child edit' });
    answerWith = [{ entityObject: child, action: 'save' }];
    const before = form.PendingRecordsForTest;
    expect(form.HasUnsavedChangesBeyondRecord).toBe(true);
    expect(subEventCodes).toEqual([BaseFormComponentEventCodes.POPULATE_PENDING_RECORDS]);
    expect(form.PendingRecordsForTest).toBe(before);
    expect(form.PendingRecordsForTest).toHaveLength(0);
  });
});
