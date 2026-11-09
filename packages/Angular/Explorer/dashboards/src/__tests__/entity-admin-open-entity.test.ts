import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInInjectionContext, Injector, ChangeDetectorRef } from '@angular/core';
import { NavigationService } from '@memberjunction/ng-shared';
import type { CompositeKey } from '@memberjunction/core';
import { EntityAdminDashboardComponent } from '../EntityAdmin/entity-admin-dashboard.component';

describe('EntityAdminDashboardComponent - Open from the ERD details panel', () => {
  let component: EntityAdminDashboardComponent;
  let openEntityRecord: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openEntityRecord = vi.fn();
    const mockInjector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } },
        { provide: NavigationService, useValue: { OpenEntityRecord: openEntityRecord } },
      ],
    });

    runInInjectionContext(mockInjector, () => {
      component = new EntityAdminDashboardComponent();
    });
    // No metadata provider in a unit test: an unresolved entity falls back to an `ID` key.
    (component as unknown as { metadata: { EntityByName: () => undefined } }).metadata = { EntityByName: () => undefined };
  });

  it('opens the requested record through NavigationService', () => {
    const entityId = 'A1B2C3D4-0000-4000-8000-000000000001';

    component.OnOpenRecord({ EntityName: 'MJ: Entities', RecordID: entityId });

    expect(openEntityRecord).toHaveBeenCalledTimes(1);
    const [entityName, key] = openEntityRecord.mock.calls[0] as [string, CompositeKey];
    expect(entityName).toBe('MJ: Entities');
    expect(key.GetValueByFieldName('ID')).toBe(entityId);
  });

  it('does not also emit OpenEntityRecord, so a subscribing host cannot open the record twice', () => {
    const emitted: unknown[] = [];
    component.OpenEntityRecord.subscribe((e: unknown) => emitted.push(e));

    component.OnOpenRecord({ EntityName: 'MJ: Entities', RecordID: 'A1B2C3D4-0000-4000-8000-000000000002' });

    expect(emitted).toEqual([]);
  });
});
