import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { capture } from '@memberjunction/ng-test-utils';
import { BaseEntity, BaseEntityResult, EntityInfo } from '@memberjunction/core';
import type { DuplicateEntryCandidate, DuplicateEntryCheckResult } from '@memberjunction/graphql-dataprovider';
import { BaseFormComponent } from './base-form-component';
import { DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS, type DuplicateEntryCheckFunction } from './duplicate-entry-check/duplicate-entry-check';

/**
 * How `BaseFormComponent` drives the entry-time duplicate check: an edit to a NEW record starts it,
 * a saved record never does, a save clears the notice, and a flagged candidate opens through the
 * form's `Navigate` event rather than a router. The timing rules themselves are specified in
 * `__tests__/duplicate-entry-check.test.ts`.
 *
 * As in `base-form-component.validation.dom.test.ts`, the form is constructed in an injection
 * context with no template, and the record is a REAL `BaseEntity` whose `Save()` alone is doubled.
 * The server call is the form's own `CheckDuplicateEntry` extension point, overridden.
 */

@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;
  public readonly Check = vi.fn<DuplicateEntryCheckFunction>();

  protected override CheckDuplicateEntry(entityName: string, values: Record<string, unknown>): Promise<DuplicateEntryCheckResult> {
    return this.Check(entityName, values);
  }
}

/** A real BaseEntity whose Save() plays a provider that accepts the save. */
class AcceptingEntity extends BaseEntity {
  public override async Save(): Promise<boolean> {
    const result = new BaseEntityResult();
    result.Type = 'create';
    result.Success = true;
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    this.RegisterResultHistoryEntry(result);
    return true;
  }
}

/** A unique entity name per test: NotConfigured answers are remembered for the session by name. */
let entityName = '';

function makeEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000003',
    Name: entityName,
    Status: 'Active',
    BaseTable: 'TestAccount',
    BaseView: 'vwTestAccounts',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: true, AllowUpdateAPI: true },
      { ID: 'F3', Name: 'City', Type: 'nvarchar', Length: 200, AllowsNull: true, AllowUpdateAPI: true },
    ],
  });
}

/** A record being entered: NewRecord() leaves it unsaved. */
function newRecord(values: Record<string, unknown>): AcceptingEntity {
  const entity = new AcceptingEntity(makeEntityInfo());
  entity.NewRecord();
  entity.SetMany(values);
  return entity;
}

/** A record loaded from the database: SetMany with replaceOldValues marks it saved. */
function savedRecord(values: Record<string, unknown>): AcceptingEntity {
  const entity = new AcceptingEntity(makeEntityInfo());
  entity.SetMany({ ID: '11111111-2222-3333-4444-555555555555', ...values }, true, true);
  return entity;
}

function makeForm(record: BaseEntity): TestForm {
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.record = record;
  form.EditMode = !record.IsSaved;
  return form;
}

const FLAGGED: DuplicateEntryCandidate = { RecordID: 'acct-7', DisplayName: 'Acme Corp', VectorScore: 0.93, Probability: 0.81 };

describe('BaseFormComponent: the entry-time duplicate check', () => {
  let forms: TestForm[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    entityName = `Test Accounts ${Math.random()}`;
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
  });

  afterEach(() => {
    forms.forEach(f => f.ngOnDestroy());
    forms = [];
    vi.useRealTimers();
  });

  function formFor(record: BaseEntity): TestForm {
    const form = makeForm(record);
    form.Check.mockResolvedValue({ Status: 'Checked', Candidates: [FLAGGED] });
    forms.push(form);
    return form;
  }

  it('checks a new record after an edit and the debounce, with its entered values', async () => {
    const form = formFor(newRecord({ Name: 'Acme', City: 'Boston' }));

    form.OnFieldEdited();
    await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS);

    expect(form.Check).toHaveBeenCalledWith(entityName, { Name: 'Acme', City: 'Boston' });
    expect(form.ShowDuplicateEntryNotice).toBe(true);
    expect(form.DuplicateEntryCheck.Candidates).toEqual([FLAGGED]);
  });

  it('makes no call for a saved record', async () => {
    const form = formFor(savedRecord({ Name: 'Acme' }));

    form.OnFieldEdited();
    await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS * 10);

    expect(form.Check).not.toHaveBeenCalled();
    expect(form.ShowDuplicateEntryNotice).toBe(false);
  });

  it('clears the notice once the record is saved, and never blocks the save', async () => {
    const form = formFor(newRecord({ Name: 'Acme' }));
    form.OnFieldEdited();
    await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS);
    expect(form.ShowDuplicateEntryNotice).toBe(true);

    const saved = await form.SaveRecord(false);

    expect(saved).toBe(true);
    expect(form.ShowDuplicateEntryNotice).toBe(false);
    expect(form.DuplicateEntryCheck.Candidates).toEqual([]);
  });

  it('hides the notice when the person dismisses it', async () => {
    const form = formFor(newRecord({ Name: 'Acme' }));
    form.OnFieldEdited();
    await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS);

    form.DismissDuplicateNotice();

    expect(form.ShowDuplicateEntryNotice).toBe(false);
  });

  it('opens a flagged candidate through Navigate, in a new tab, keyed by the entity\'s real key', () => {
    const form = formFor(newRecord({ Name: 'Acme' }));
    const navigations = capture(form.Navigate);

    form.OpenDuplicateCandidate(FLAGGED);

    expect(navigations).toHaveLength(1);
    const event = navigations[0];
    expect(event.Kind).toBe('record');
    if (event.Kind !== 'record') return;
    expect(event.EntityName).toBe(entityName);
    expect(event.OpenInNewTab).toBe(true);
    expect(event.PrimaryKey.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'acct-7' }]);
  });
});
