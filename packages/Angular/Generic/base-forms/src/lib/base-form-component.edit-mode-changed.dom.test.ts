import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { capture } from '@memberjunction/ng-test-utils';
import { BaseEntity, BaseEntityResult, EntityInfo } from '@memberjunction/core';
import { BaseFormComponent } from './base-form-component';
import { FormStateService } from './form-state.service';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});

/**
 * `EditModeChanged` is the signal the Explorer shell uses to PROMOTE a records
 * preview tab (pin it) the moment the user starts editing — VS Code's
 * promote-on-modify. It must fire on StartEditMode (true) and EndEditMode
 * (false), including the EndEditMode that SaveRecord(true) performs, so the
 * shell can prove it never UNpins on save.
 *
 * FormStateService is stubbed: EndEditMode asks it to persist the form's
 * layout state, which needs a provider that only ngOnInit binds. Layout
 * persistence is not under test here — the emission is.
 */
@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;
}

class SavingEntity extends BaseEntity {
  public override async Save(): Promise<boolean> {
    const result = new BaseEntityResult();
    result.Type = 'update';
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    result.Success = true;
    this.RegisterResultHistoryEntry(result);
    return true;
  }
}

function makeRecord(): SavingEntity {
  const info = new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000003',
    Name: 'Test Widgets',
    Status: 'Active',
    BaseTable: 'TestWidget',
    BaseView: 'vwTestWidgets',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
    ],
  });
  const entity = new SavingEntity(info);
  entity.SetMany({ ID: '11111111-2222-3333-4444-555555555555', Name: 'Widget A' }, true, true);
  return entity;
}

function makeForm(): TestForm {
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.record = makeRecord();
  return form;
}

describe('BaseFormComponent.EditModeChanged', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
        { provide: FormStateService, useValue: { SetEditMode: () => undefined, setEditMode: () => undefined } },
      ],
    });
  });

  it('emits true when edit mode starts', () => {
    const form = makeForm();
    const emitted = capture(form.EditModeChanged);
    form.StartEditMode();
    expect(form.EditMode).toBe(true);
    expect(emitted).toEqual([true]);
  });

  it('emits false when edit mode ends', () => {
    const form = makeForm();
    form.StartEditMode();
    const emitted = capture(form.EditModeChanged);
    form.EndEditMode();
    expect(form.EditMode).toBe(false);
    expect(emitted).toEqual([false]);
  });

  it('a save that stops edit mode emits false (the shell must not treat this as "unpin")', async () => {
    const form = makeForm();
    form.StartEditMode();
    const emitted = capture(form.EditModeChanged);
    const ok = await form.SaveRecord(true);
    expect(ok).toBe(true);
    expect(emitted).toEqual([false]);
  });

  it('a save that keeps edit mode emits nothing', async () => {
    const form = makeForm();
    form.StartEditMode();
    const emitted = capture(form.EditModeChanged);
    await form.SaveRecord(false);
    expect(emitted).toEqual([]);
  });
});
