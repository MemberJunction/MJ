import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChangeDetectorRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { MJCollectionEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';
import { CollectionsFullViewComponent } from '../lib/components/collection/collections-full-view.component';
import { CollectionFormModalComponent } from '../lib/components/collection/collection-form-modal.component';
import { ArtifactPermissionService } from '../lib/services/artifact-permission.service';
import { ArtifactStateService } from '../lib/services/artifact-state.service';
import { CollectionPermissionService } from '../lib/services/collection-permission.service';
import { CollectionStateService } from '../lib/services/collection-state.service';
import { DialogService } from '../lib/services/dialog.service';
import { ToastService } from '../lib/services/toast.service';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';

const TEST_USER = {
  ID: '11111111-1111-4111-8111-111111111111',
  Name: 'Amith Nagarajan',
  Email: 'amith@example.com',
} as UserInfo;

function createMockCollection(overrides: Partial<MJCollectionEntity> = {}): MJCollectionEntity {
  return {
    ID: 'col-1',
    Name: 'Quarterly Reports',
    Description: 'Finance deliverables',
    ParentID: 'parent-root-1',
    OwnerID: TEST_USER.ID,
    EnvironmentID: 'env-1',
    Save: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as Partial<MJCollectionEntity> as MJCollectionEntity;
}

describe('CollectionsFullViewComponent (real production implementation)', () => {
  let component: CollectionsFullViewComponent;
  let permissionService: CollectionPermissionService;
  let savedRecords: MJCollectionEntity[];

  beforeEach(() => {
    savedRecords = [];
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);

    const cdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn(),
    } as Partial<ChangeDetectorRef> as ChangeDetectorRef;

    const dialogService = {} as DialogService;
    permissionService = new CollectionPermissionService();
    const artifactPermissionService = new ArtifactPermissionService(permissionService);
    const artifactState = new ArtifactStateService(artifactPermissionService);
    const collectionState = new CollectionStateService();
    const artifactIconService = new ArtifactIconService();

    component = new CollectionsFullViewComponent(
      dialogService,
      artifactState,
      collectionState,
      permissionService,
      artifactIconService,
      cdr,
    );
    component.CurrentUser = TEST_USER;
    component.EnvironmentId = 'env-1';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists view mode and sort preferences through UserInfoEngine instead of localStorage', () => {
    const setSpy = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced');

    component.ViewMode = 'grid';
    component.ToggleViewMode();
    expect(component.ViewMode).toBe('list');
    expect(setSpy).toHaveBeenCalledWith('collections-view-mode', 'list');

    component.SetViewMode('grid');
    expect(component.ViewMode).toBe('grid');
    expect(setSpy).toHaveBeenCalledWith('collections-view-mode', 'grid');

    component.SetSortBy('date');
    expect(component.SortBy).toBe('date');
    expect(component.SortOrder).toBe('asc');
    expect(setSpy).toHaveBeenCalledWith('collections-sort-by', 'date');
    expect(setSpy).toHaveBeenCalledWith('collections-sort-order', 'asc');

    component.SetSortBy('date');
    expect(component.SortOrder).toBe('desc');
    expect(setSpy).toHaveBeenCalledWith('collections-sort-order', 'desc');
  });

  it('restores view mode and sort preferences from UserInfoEngine during loadData()', async () => {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation((key: string) => {
      if (key === 'collections-view-mode') return 'list';
      if (key === 'collections-sort-by') return 'type';
      if (key === 'collections-sort-order') return 'desc';
      return undefined;
    });

    const fakeProvider = CreateFakeProvider({
      runViewResults: () => [],
    });
    vi.spyOn(permissionService, 'checkPermission').mockResolvedValue(null);
    component.Provider = fakeProvider;

    await component.loadData();

    expect(component.ViewMode).toBe('list');
    expect(component.SortBy).toBe('type');
    expect(component.SortOrder).toBe('desc');
  });

  it('computes real collection item counts (child collections + collection artifacts) and formats item text', async () => {
    expect(component.GetItemCountText(undefined)).toBe('No items');
    expect(component.GetItemCountText(0)).toBe('Empty');
    expect(component.GetItemCountText(1)).toBe('1 item');
    expect(component.GetItemCountText(4)).toBe('4 items');

    const rootCol = createMockCollection({ ID: 'col-1', Name: 'Alpha', ParentID: null });
    const emptyCol = createMockCollection({ ID: 'col-2', Name: 'Beta', ParentID: null });

    const fakeProvider = CreateFakeProvider<object>({
      runViewResults: (params: RunViewParams): object[] => {
        if (params.EntityName === 'MJ: Collections') {
          if (typeof params.ExtraFilter === 'string' && params.ExtraFilter.includes('ParentID IN')) {
            return [
              { ID: 'child-1', ParentID: 'col-1' },
              { ID: 'child-2', ParentID: 'col-1' },
            ];
          }
          return [rootCol, emptyCol];
        }
        if (params.EntityName === 'MJ: Collection Artifacts') {
          if (typeof params.ExtraFilter === 'string' && params.ExtraFilter.includes('CollectionID IN')) {
            return [
              { ID: 'ca-1', CollectionID: 'col-1' },
              { ID: 'ca-2', CollectionID: 'col-1' },
              { ID: 'ca-3', CollectionID: 'col-1' },
            ];
          }
          return [];
        }
        return [];
      },
    });
    vi.spyOn(permissionService, 'checkPermission').mockResolvedValue(null);
    component.Provider = fakeProvider;

    await component.loadData();

    const byId = new Map(component.UnifiedItems.map((item) => [item.id, item]));
    expect(byId.get('col-1')?.itemCount).toBe(5); // 2 child collections + 3 artifacts
    expect(byId.get('col-2')?.itemCount).toBe(0);
    expect(component.GetItemCountText(byId.get('col-1')?.itemCount)).toBe('5 items');
    expect(component.GetItemCountText(byId.get('col-2')?.itemCount)).toBe('Empty');
  });

  it('clears editingCollection for create vs sets editingCollection for edit, and template clears parentCollection when editing', async () => {
    const templateSource = readFileSync(
      resolve(__dirname, '../lib/components/collection/collections-full-view.component.ts'),
      'utf8',
    );
    expect(templateSource).toContain(
      '[parentCollection]="editingCollection ? undefined : (currentCollection || undefined)"',
    );

    const existing = createMockCollection({ ID: 'col-edit-1', ParentID: 'parent-9' });
    vi.spyOn(permissionService, 'checkPermission').mockResolvedValue({
      id: 'perm-col-edit-1',
      collectionId: existing.ID,
      userId: TEST_USER.ID,
      userName: TEST_USER.Name,
      canRead: true,
      canEdit: true,
      canDelete: true,
      canShare: true,
      sharedByUserId: TEST_USER.ID,
      sharedByUserName: TEST_USER.Name,
      sharedAt: new Date(),
    });

    await component.EditCollection(existing);
    expect(component.editingCollection).toBe(existing);
    expect(component.IsFormModalOpen).toBe(true);

    // Real CollectionFormModalComponent preserves existing ParentID when ParentCollection is undefined
    const toastService = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    } as Partial<ToastService> as ToastService;
    const modal = new CollectionFormModalComponent(toastService, permissionService);
    modal.CurrentUser = TEST_USER;
    modal.EnvironmentId = 'env-1';
    modal.Collection = existing;
    modal.ParentCollection = undefined;
    modal.FormData = { name: 'Renamed Collection', description: 'Updated' };
    modal.Provider = {
      GetEntityObject: vi.fn(async <T>() => existing as T),
    } as Partial<IMetadataProvider> as IMetadataProvider;

    await modal.OnSave();
    expect(existing.ParentID).toBe('parent-9');
    expect(existing.Name).toBe('Renamed Collection');
    expect(existing.Save).toHaveBeenCalledTimes(1);

    // Create mode clears editingCollection so ParentCollection flows from CurrentCollection
    component.CurrentCollection = existing;
    await component.CreateCollection();
    expect(component.editingCollection).toBeUndefined();

    const newChild = createMockCollection({ ID: 'col-new', ParentID: null, Save: vi.fn(async () => {
      savedRecords.push(newChild);
      return true;
    }) });
    const createModal = new CollectionFormModalComponent(toastService, permissionService);
    createModal.CurrentUser = TEST_USER;
    createModal.EnvironmentId = 'env-1';
    createModal.Collection = undefined;
    createModal.ParentCollection = existing;
    createModal.FormData = { name: 'Child Folder', description: '' };
    createModal.Provider = {
      GetEntityObject: vi.fn(async <T>() => newChild as T),
    } as Partial<IMetadataProvider> as IMetadataProvider;
    vi.spyOn(permissionService, 'copyParentPermissions').mockResolvedValue(undefined);

    await createModal.OnSave();
    expect(newChild.ParentID).toBe('col-edit-1');
    expect(savedRecords).toHaveLength(1);
  });
});
