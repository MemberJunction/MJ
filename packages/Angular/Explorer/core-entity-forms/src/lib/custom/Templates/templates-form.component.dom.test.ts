/**
 * The Templates admin form must persist the embedded editor's Template Contents when the OUTER
 * Save runs, in the same transaction as the Template itself.
 *
 * The defect this pins: the form saved the Template through the base pipeline, reported success,
 * and only then walked its own copy of the content list calling `Save()` on each row outside any
 * transaction. A content whose save returned false reached `console.error` and nothing else: no
 * mutation carrying the content was issued, the Template kept its fields, and the editor showed
 * "Unsaved changes" indefinitely. The content is now a pending record of the form, so `Validate()`
 * covers it and `InternalSaveRecord()` commits template + content through ONE transaction group.
 *
 * Class-behaviour spec, like base-form-component.validation.dom.test.ts: the form is constructed in
 * an injection context with its injected services provided, the template is empty so no lifecycle
 * hook runs, and the `<mj-template-editor>` view child is a stub that hands back the content rows a
 * real editor would report from `getPendingChanges()`. The records are REAL `BaseEntity`s whose
 * `Save()` is the only thing doubled, so validation and dirty tracking are the real thing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BaseEntity, BaseEntityResult, EntityInfo, IMetadataProvider, TransactionGroupBase } from '@memberjunction/core';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJTemplateFormComponentExtended } from './templates-form.component';
import type { TemplateEditorComponent } from '../../shared/components/template-editor.component';

// Only LogError is doubled; every other export (BaseEntity, EntityInfo, …) stays real.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});

const TEMPLATE_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const CONTENT_ID = 'BBBBBBBB-0000-0000-0000-000000000001';
const USER_ID = 'CCCCCCCC-0000-0000-0000-000000000001';
const TYPE_ID = 'DDDDDDDD-0000-0000-0000-000000000001';

/** A real BaseEntity whose Save() plays the provider: records the transaction group it was saved under. */
class RecordingEntity extends BaseEntity {
  public saveCalls = 0;
  public savedUnder: TransactionGroupBase | null = null;
  public savedTemplateID: unknown = undefined;

  public override async Save(): Promise<boolean> {
    this.saveCalls++;
    this.savedUnder = this.TransactionGroup;
    this.savedTemplateID = this.Get('TemplateID');
    const result = new BaseEntityResult();
    result.Type = this.IsSaved ? 'update' : 'create';
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    result.Success = true;
    this.RegisterResultHistoryEntry(result);
    // A real save refreshes the record from the server, which resets every field's old value.
    this.SetMany(this.GetAll(), true, true);
    return true;
  }
}

function templateEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000001',
    Name: 'MJ: Templates',
    Status: 'Active',
    BaseTable: 'Template',
    BaseView: 'vwTemplates',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 255, AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F3', Name: 'UserID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F4', Name: 'CategoryID', Type: 'uniqueidentifier', AllowsNull: true, AllowUpdateAPI: true },
    ],
  });
}

function contentEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000002-0000-0000-0000-000000000002',
    Name: 'MJ: Template Contents',
    Status: 'Active',
    BaseTable: 'TemplateContent',
    BaseView: 'vwTemplateContents',
    Fields: [
      { ID: 'G1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'G2', Name: 'TemplateID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'G3', Name: 'TypeID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'G4', Name: 'TemplateText', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true },
      { ID: 'G5', Name: 'Priority', Type: 'int', AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'G6', Name: 'IsActive', Type: 'bit', AllowsNull: false, AllowUpdateAPI: true },
    ],
  });
}

/** An already-saved Template whose Name the user just edited. */
function makeTemplate(): RecordingEntity {
  const t = new RecordingEntity(templateEntityInfo());
  t.SetMany({ ID: TEMPLATE_ID, Name: 'Welcome email', UserID: USER_ID, CategoryID: null }, true, true);
  t.Set('Name', 'Welcome email v2');
  return t;
}

/** A content row that exists only in the editor so far; `typeID` null reproduces a missing required field. */
function makeNewContent(typeID: string | null = TYPE_ID): RecordingEntity {
  const c = new RecordingEntity(contentEntityInfo());
  c.SetMany({ ID: CONTENT_ID, TemplateID: TEMPLATE_ID, TypeID: typeID, TemplateText: 'Hello {{ Name }}', Priority: 1, IsActive: true }, true, false);
  return c;
}

/** A transaction-group double: records Submit() and returns success. */
class FakeTransactionGroup {
  public submitCalls = 0;
  public async Submit(): Promise<boolean> {
    this.submitCalls++;
    return true;
  }
}

function fakeProvider(tg: FakeTransactionGroup): IMetadataProvider {
  return {
    CurrentUser: { ID: USER_ID, Name: 'Test User', Email: 'test@example.com' },
    CreateTransactionGroup: async () => tg,
  } as unknown as IMetadataProvider;
}

/** Stands in for the <mj-template-editor> view child: reports the given rows as its pending changes. */
function fakeEditor(pending: RecordingEntity[]) {
  return {
    getPendingChanges: () => pending.map(entityObject => ({ entityObject, action: 'save' as const })),
    markContentsSaved: vi.fn(),
  };
}

function makeForm(record: RecordingEntity, editor: ReturnType<typeof fakeEditor>, tg: FakeTransactionGroup): MJTemplateFormComponentExtended {
  const form = TestBed.runInInjectionContext(() => new MJTemplateFormComponentExtended());
  form.record = record as unknown as MJTemplateFormComponentExtended['record'];
  form.Provider = fakeProvider(tg);
  form.templateEditor = editor as unknown as TemplateEditorComponent;
  form.EditMode = true;
  return form;
}

describe('MJTemplateFormComponentExtended.SaveRecord persists the editor contents', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
        { provide: MJConfirmService, useValue: { Confirm: async () => true } },
      ],
    });
  });

  it('issues the Template Content save in the SAME transaction as the Template', async () => {
    const template = makeTemplate();
    const content = makeNewContent();
    const tg = new FakeTransactionGroup();
    const form = makeForm(template, fakeEditor([content]), tg);

    const ok = await form.SaveRecord(false);

    expect(ok).toBe(true);
    expect(template.saveCalls, 'the template itself still saves').toBe(1);
    expect(content.saveCalls, 'a save carrying the TemplateContent is issued').toBe(1);
    expect(content.savedUnder, 'inside a transaction group').toBe(tg);
    expect(template.savedUnder, 'the same one the template used').toBe(tg);
    expect(content.savedTemplateID).toBe(TEMPLATE_ID);
    expect(tg.submitCalls, 'and the group is submitted once').toBe(1);
  });

  it('clears the unsaved state on both the form and the editor after the save', async () => {
    const editor = fakeEditor([makeNewContent()]);
    const form = makeForm(makeTemplate(), editor, new FakeTransactionGroup());

    await form.SaveRecord(false);

    expect(editor.markContentsSaved).toHaveBeenCalledTimes(1);
    expect(form.hasUnsavedChanges).toBe(false);
  });

  it('refuses the whole save, with the content error painted, when a content row fails validation', async () => {
    const template = makeTemplate();
    const content = makeNewContent(null); // TypeID is required
    const tg = new FakeTransactionGroup();
    const form = makeForm(template, fakeEditor([content]), tg);

    const ok = await form.SaveRecord(false);

    expect(ok).toBe(false);
    expect(template.saveCalls, 'nothing is half-saved').toBe(0);
    expect(content.saveCalls).toBe(0);
    expect(tg.submitCalls).toBe(0);
    expect(form.formContext.showValidation).toBe(true);
    expect(form.formContext.validationErrors?.some(e => e.Source === 'TypeID')).toBe(true);
  });

  it('saves a template on its own when the editor has nothing pending', async () => {
    const template = makeTemplate();
    const tg = new FakeTransactionGroup();
    const form = makeForm(template, fakeEditor([]), tg);

    const ok = await form.SaveRecord(false);

    expect(ok).toBe(true);
    expect(template.saveCalls).toBe(1);
    expect(tg.submitCalls, 'no transaction is opened for a single record').toBe(0);
  });

  it('saves again on the same form instance without re-saving content the editor no longer reports', async () => {
    const template = makeTemplate();
    const content = makeNewContent();
    const pendingRows = [content];
    const tg = new FakeTransactionGroup();
    const form = makeForm(template, fakeEditor(pendingRows), tg);

    expect(await form.SaveRecord(false)).toBe(true);
    // A real editor reports nothing pending once its rows were saved and marked clean.
    pendingRows.length = 0;
    template.Set('Name', 'Welcome email v3');

    expect(await form.SaveRecord(false)).toBe(true);
    expect(template.saveCalls).toBe(2);
    expect(content.saveCalls, 'the content is not saved a second time').toBe(1);
    expect(tg.submitCalls, 'only the first save needed a transaction group').toBe(1);
  });

  it('retries cleanly after a validation failure: the content is saved exactly once, in one group', async () => {
    const template = makeTemplate();
    const content = makeNewContent(null); // TypeID missing, so the first attempt is refused
    const tg = new FakeTransactionGroup();
    const form = makeForm(template, fakeEditor([content]), tg);

    expect(await form.SaveRecord(false)).toBe(false);
    content.Set('TypeID', TYPE_ID);

    expect(await form.SaveRecord(false)).toBe(true);
    expect(template.saveCalls).toBe(1);
    expect(content.saveCalls, 'no duplicate pending record survives the failed attempt').toBe(1);
    expect(tg.submitCalls).toBe(1);
    expect(form.formContext.showValidation).toBe(false);
  });
});
