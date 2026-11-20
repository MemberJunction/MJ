import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { capture } from '@memberjunction/ng-test-utils';
import { BaseEntity, BaseEntityResult, EntityInfo } from '@memberjunction/core';
import { BaseFormComponent } from './base-form-component';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});

/**
 * A refused delete reports the server's reason (#6270). `Delete()` returning false leaves the
 * reason on `record.LatestResult`; the form puts it in the toast and in `RecordDeleteFailed`
 * instead of a bare "Error deleting record".
 */

@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;
}

/** A real BaseEntity whose Delete() plays the provider: registers a failed result, returns false. */
class RefusingDeleteEntity extends BaseEntity {
  public refusalMessage = '';
  public refusalErrors: unknown[] = [];

  public override async Delete(): Promise<boolean> {
    const result = new BaseEntityResult();
    result.Type = 'delete';
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    result.Success = false;
    result.Message = this.refusalMessage;
    result.Errors = this.refusalErrors;
    this.RegisterResultHistoryEntry(result);
    return false;
  }
}

function makeRecord(): RefusingDeleteEntity {
  const info = new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000003',
    Name: 'Test Delete Widgets',
    Status: 'Active',
    BaseTable: 'TestDeleteWidget',
    BaseView: 'vwTestDeleteWidgets',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
    ],
  });
  const entity = new RefusingDeleteEntity(info);
  entity.SetMany({ ID: '11111111-2222-3333-4444-555555555555', Name: 'Widget A' }, true, true);
  return entity;
}

function makeForm(record: BaseEntity): TestForm {
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.record = record;
  return form;
}

describe('BaseFormComponent.OnDeleteRequested — a refused delete', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
  });

  it('shows the server reason in the toast and in RecordDeleteFailed', async () => {
    const record = makeRecord();
    record.refusalMessage = 'The record is referenced by 3 Orders.';
    const form = makeForm(record);
    const toasts = capture(form.Notification);
    const failed = capture(form.RecordDeleteFailed);

    await form.OnDeleteRequested();

    expect(toasts.map(t => t.Message)).toEqual(['Delete failed: The record is referenced by 3 Orders.']);
    expect(toasts[0].Type).toBe('error');
    expect(failed.map(f => f.ErrorMessage)).toEqual(['Delete failed: The record is referenced by 3 Orders.']);
  });

  it('falls back to the generic text when the result carries no reason', async () => {
    const record = makeRecord();
    const form = makeForm(record);
    const toasts = capture(form.Notification);
    const failed = capture(form.RecordDeleteFailed);

    await form.OnDeleteRequested();

    expect(toasts.map(t => t.Message)).toEqual(['Error deleting record']);
    expect(failed.map(f => f.ErrorMessage)).toEqual(['Error deleting record']);
  });
});
