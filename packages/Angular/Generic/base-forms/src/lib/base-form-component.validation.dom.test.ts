import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { capture } from '@memberjunction/ng-test-utils';
import { BaseEntity, BaseEntityResult, EntityInfo } from '@memberjunction/core';
import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/global';
import { BaseFormComponent } from './base-form-component';

/**
 * How `BaseFormComponent.SaveRecord()` reports a REFUSED save to the fields and the user.
 *
 * Two refusals exist. A local `Validate()` refusal is known before the wire is touched; a
 * `ValidateAsync()` refusal happens on the server and comes back on `record.LatestResult.Errors`
 * (rehydrated by the provider). Expected behaviour, written first: both must reach the fields through
 * the SAME `FormContext` publication — `showValidation`, `validationErrors`, a bumped
 * `validationRevision` — with the same warning toast and `ValidationFailed` event, so a rule that
 * paints a field red when written synchronously paints it identically when written asynchronously.
 * A server refusal that names no field has nothing to paint and keeps the plain error toast.
 *
 * The form is constructed in an injection context with `ChangeDetectorRef` / `ElementRef` provided
 * explicitly: this is a class-behaviour spec (the template is empty), so no lifecycle hook runs and
 * nothing needs a live provider. The record is a REAL `BaseEntity` whose `Save()` is the only thing
 * doubled — it registers the result a provider would have registered and returns false.
 */

@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;
}

/** A real BaseEntity whose Save() plays the provider: registers a result, returns its Success. */
class RefusingEntity extends BaseEntity {
  /** null = the save succeeds; otherwise the Errors the server would have returned. */
  public refuseWith: unknown[] | null = null;
  public refusalMessage = '';
  public saveCalls = 0;

  public override async Save(): Promise<boolean> {
    this.saveCalls++;
    const result = new BaseEntityResult();
    result.Type = this.IsSaved ? 'update' : 'create';
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    if (this.refuseWith) {
      result.Success = false;
      result.Message = this.refusalMessage;
      result.Errors = this.refuseWith;
      this.RegisterResultHistoryEntry(result);
      return false;
    }
    result.Success = true;
    this.RegisterResultHistoryEntry(result);
    return true;
  }
}

const SCOPE_ID = '11111111-2222-3333-4444-555555555555';

function makeEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000002',
    Name: 'Test Tag Scopes',
    Status: 'Active',
    BaseTable: 'TestTagScope',
    BaseView: 'vwTestTagScopes',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', DisplayName: 'Scope Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F3', Name: 'TagID', Type: 'uniqueidentifier', AllowsNull: true, AllowUpdateAPI: true },
    ],
  });
}

function makeRecord(): RefusingEntity {
  const entity = new RefusingEntity(makeEntityInfo());
  entity.SetMany({ ID: SCOPE_ID, Name: 'Scope A', TagID: null }, true, true);
  return entity;
}

function makeForm(record: BaseEntity): TestForm {
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.record = record;
  form.EditMode = true;
  return form;
}

const SERVER_MESSAGE = 'Cannot add TagScope row for tag "Global" because it is marked IsGlobal=1.';

describe('BaseFormComponent publishes a refused save to the fields', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
  });

  describe('a SERVER refusal that names a field (ValidateAsync ran in MJAPI)', () => {
    it('paints it exactly like a local Validate() refusal: showValidation + the errors + a revision, warning toast, ValidationFailed', async () => {
      const record = makeRecord();
      record.refuseWith = [new ValidationErrorInfo('TagID', SERVER_MESSAGE, 'abc', ValidationErrorType.Failure)];
      record.refusalMessage = SERVER_MESSAGE;
      const form = makeForm(record);
      const toasts = capture(form.Notification);
      const validationFailed = capture(form.ValidationFailed);
      const saveFailed = capture(form.RecordSaveFailed);

      const ok = await form.SaveRecord(false);

      expect(ok).toBe(false);
      expect(record.saveCalls, 'sync validation passed, so the save really went out').toBe(1);
      const ctx = form.formContext;
      expect(ctx.showValidation).toBe(true);
      expect(ctx.validationRevision).toBe(1);
      expect(ctx.validationErrors).toHaveLength(1);
      expect(ctx.validationErrors?.[0]).toBeInstanceOf(ValidationErrorInfo);
      expect(ctx.validationErrors?.[0]).toMatchObject({ Source: 'TagID', Message: SERVER_MESSAGE });

      expect(toasts).toHaveLength(1);
      expect(toasts[0].Type).toBe('warning');
      expect(toasts[0].Message).toBe('Validation Errors\n' + SERVER_MESSAGE);
      expect(validationFailed).toEqual([{ EntityName: 'Test Tag Scopes', Errors: [SERVER_MESSAGE] }]);
      // The existing failed-save contract is kept for hosts that close/reset on it.
      expect(saveFailed).toHaveLength(1);
      expect(saveFailed[0].ErrorMessage).toContain(SERVER_MESSAGE);
    });

    it('accepts PLAIN-object errors too (a provider that did not rehydrate) — normalised to ValidationErrorInfo', async () => {
      const record = makeRecord();
      record.refuseWith = [{ Source: 'TagID', Message: SERVER_MESSAGE, Value: null, Type: 'Failure' }];
      const form = makeForm(record);

      await form.SaveRecord(false);

      expect(form.formContext.showValidation).toBe(true);
      expect(form.formContext.validationErrors?.[0]).toBeInstanceOf(ValidationErrorInfo);
      expect(form.formContext.validationErrors?.[0].Source).toBe('TagID');
    });

    it('carries field-agnostic entries along in the toast when at least one entry names a field', async () => {
      const record = makeRecord();
      record.refuseWith = [
        new ValidationErrorInfo('TagID', SERVER_MESSAGE, 'abc'),
        new ValidationErrorInfo('', 'Also: the scope policy was reviewed.', null, ValidationErrorType.Warning),
      ];
      const form = makeForm(record);
      const toasts = capture(form.Notification);

      await form.SaveRecord(false);

      expect(form.formContext.validationErrors).toHaveLength(2);
      expect(toasts[0].Message).toBe('Validation Errors\n' + SERVER_MESSAGE + '\nAlso: the scope policy was reviewed.');
    });
  });

  describe('a SERVER refusal with NO field source', () => {
    it('stays toast-only: error toast with the readable text, nothing published to the fields, no ValidationFailed', async () => {
      const record = makeRecord();
      record.refuseWith = [new ValidationErrorInfo('', 'Tenant quota exceeded.', null)];
      record.refusalMessage = 'Tenant quota exceeded.';
      const form = makeForm(record);
      const toasts = capture(form.Notification);
      const validationFailed = capture(form.ValidationFailed);
      const saveFailed = capture(form.RecordSaveFailed);

      await form.SaveRecord(false);

      expect(form.formContext.showValidation).toBe(false);
      expect(form.formContext.validationErrors).toEqual([]);
      expect(form.formContext.validationRevision).toBe(0);
      expect(toasts).toEqual([{ Message: 'Save failed: Tenant quota exceeded.', Type: 'error', Duration: 5000 }]);
      expect(validationFailed).toEqual([]);
      expect(saveFailed).toEqual([{ EntityName: 'Test Tag Scopes', ErrorMessage: 'Save failed: Tenant quota exceeded.' }]);
    });

    it('a Source that is not one of this record\'s fields counts as no source', async () => {
      const record = makeRecord();
      record.refuseWith = [new ValidationErrorInfo('SomeChildEntityField', 'child problem', null)];
      const form = makeForm(record);

      await form.SaveRecord(false);

      expect(form.formContext.showValidation).toBe(false);
    });

    it('a plain failure with no Errors at all (a SQL error) keeps the classic error toast', async () => {
      const record = makeRecord();
      record.refuseWith = [];
      record.refusalMessage = 'Timeout expired while saving.';
      const form = makeForm(record);
      const toasts = capture(form.Notification);

      await form.SaveRecord(false);

      expect(toasts).toEqual([{ Message: 'Save failed: Timeout expired while saving.', Type: 'error', Duration: 5000 }]);
      expect(form.formContext.showValidation).toBe(false);
    });
  });

  describe('parity with the LOCAL Validate() refusal', () => {
    it('a sync refusal goes through the same publication (same shape, same toast form) and never calls Save()', async () => {
      const record = makeRecord();
      record.Set('Name', null); // NOT nullable — the real BaseEntity.Validate() refuses this
      const form = makeForm(record);
      const toasts = capture(form.Notification);
      const validationFailed = capture(form.ValidationFailed);

      const ok = await form.SaveRecord(false);

      expect(ok).toBe(false);
      expect(record.saveCalls).toBe(0);
      const ctx = form.formContext;
      expect(ctx.showValidation).toBe(true);
      expect(ctx.validationRevision).toBe(1);
      expect(ctx.validationErrors?.[0]).toMatchObject({ Source: 'Name' });
      expect(toasts[0].Type).toBe('warning');
      expect(toasts[0].Message.startsWith('Validation Errors\n')).toBe(true);
      expect(validationFailed).toHaveLength(1);
    });
  });

  describe('revisions and clearing', () => {
    it('every failed save bumps the revision, so a field can tell a new failure from the one it already handled', async () => {
      const record = makeRecord();
      record.refuseWith = [new ValidationErrorInfo('TagID', SERVER_MESSAGE, 'abc')];
      const form = makeForm(record);

      await form.SaveRecord(false);
      await form.SaveRecord(false);

      expect(form.formContext.validationRevision).toBe(2);
    });

    it('a successful save clears the published errors', async () => {
      const record = makeRecord();
      record.refuseWith = [new ValidationErrorInfo('TagID', SERVER_MESSAGE, 'abc')];
      const form = makeForm(record);
      await form.SaveRecord(false);
      expect(form.formContext.showValidation, 'precondition').toBe(true);

      record.refuseWith = null;
      const ok = await form.SaveRecord(false);

      expect(ok).toBe(true);
      expect(form.formContext.showValidation).toBe(false);
      expect(form.formContext.validationErrors).toEqual([]);
    });
  });
});
