import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { capture } from '@memberjunction/ng-test-utils';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { BaseFormComponent } from './base-form-component';
import { FormStateService } from './form-state.service';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});

@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;
}

class RefreshingEntity extends BaseEntity {
  public override async Refresh(): Promise<boolean> {
    return true;
  }
}

function makeForm(): TestForm {
  const info = new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000004',
    Name: 'Test Widgets',
    Status: 'Active',
    BaseTable: 'TestWidget',
    BaseView: 'vwTestWidgets',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
    ],
  });
  const record = new RefreshingEntity(info);
  record.SetMany({ ID: '11111111-2222-3333-4444-555555555555', Name: 'Widget A' }, true, true);
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.record = record;
  return form;
}

describe('BaseFormComponent.RefreshRecord', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
        { provide: FormStateService, useValue: { SetEditMode: () => undefined, setEditMode: () => undefined } },
      ],
    });
  });

  it('reloads without the success notification when ShowSuccessNotification is false', async () => {
    const form = makeForm();
    const notifications = capture(form.Notification);
    const refreshed = capture(form.RecordRefreshed);

    const ok = await form.RefreshRecord({ ShowSuccessNotification: false });

    expect(ok).toBe(true);
    expect(refreshed.length).toBe(1);
    expect(notifications).toEqual([]);
  });
});
