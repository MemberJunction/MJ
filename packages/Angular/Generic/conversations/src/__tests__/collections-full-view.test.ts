// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { RunViewParams, UserInfo } from '@memberjunction/core';
import { MJCollectionEntity } from '@memberjunction/core-entities';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { CollectionsFullViewComponent } from '../lib/components/collection/collections-full-view.component';
import { CollectionViewComponent } from '../lib/components/collection/collection-view.component';
import { ArtifactPermissionService } from '../lib/services/artifact-permission.service';
import { ArtifactStateService } from '../lib/services/artifact-state.service';
import { CollectionPermissionService } from '../lib/services/collection-permission.service';
import { CollectionStateService } from '../lib/services/collection-state.service';
import { DialogService } from '../lib/services/dialog.service';

/**
 * Tests for collections-full-view logic — extracted from the component
 * to verify bug fixes without Angular DI.
 *
 * Bug 1: Renaming a collection set ParentID to itself (self-referencing)
 * Bug 2: All collections showed "Empty" because itemCount was hardcoded to 0
 */

// ============================================================
// Bug 1: parentCollection binding when editing vs creating
// ============================================================

interface MockCollection {
  ID: string;
  Name: string;
  ParentID: string | null;
}

/**
 * Reproduces the template binding logic:
 *   [parentCollection]="editingCollection ? undefined : (currentCollection || undefined)"
 */
function resolveParentCollection(
  editingCollection: MockCollection | undefined,
  currentCollection: MockCollection | null
): MockCollection | undefined {
  return editingCollection ? undefined : (currentCollection || undefined);
}

describe('Bug 1: parentCollection binding logic', () => {
  const rootCollection: MockCollection = {
    ID: 'root-1',
    Name: 'Root Collection',
    ParentID: null
  };

  const childCollection: MockCollection = {
    ID: 'child-1',
    Name: 'Child Collection',
    ParentID: 'root-1'
  };

  describe('when creating a new collection', () => {
    it('should pass currentCollection as parentCollection at root level', () => {
      // At root level, currentCollection is null
      const parent = resolveParentCollection(undefined, null);
      expect(parent).toBeUndefined();
    });

    it('should pass currentCollection as parentCollection when inside a collection', () => {
      // Inside rootCollection, creating a new sub-collection
      const parent = resolveParentCollection(undefined, rootCollection);
      expect(parent).toBe(rootCollection);
    });
  });

  describe('when editing an existing collection', () => {
    it('should NOT pass parentCollection when editing the current collection', () => {
      // Inside rootCollection, editing rootCollection itself
      // Before fix: parentCollection = rootCollection (the collection being edited!)
      // After fix: parentCollection = undefined
      const parent = resolveParentCollection(rootCollection, rootCollection);
      expect(parent).toBeUndefined();
    });

    it('should NOT pass parentCollection when editing a child collection from the list', () => {
      // Inside rootCollection, editing childCollection from the grid
      const parent = resolveParentCollection(childCollection, rootCollection);
      expect(parent).toBeUndefined();
    });

    it('should NOT pass parentCollection when editing at root level', () => {
      // At root level, editing rootCollection
      const parent = resolveParentCollection(rootCollection, null);
      expect(parent).toBeUndefined();
    });
  });
});

/**
 * Reproduces the form-modal save logic for ParentID:
 *
 *   if (!this.collection) {
 *     // creating new — set ParentID from parentCollection
 *   } else if (this.parentCollection) {
 *     collection.ParentID = this.parentCollection.ID;
 *   }
 */
function simulateSave(
  existingCollection: MockCollection | undefined,
  parentCollection: MockCollection | undefined
): { parentIdOverwritten: boolean; newParentId: string | null } {
  if (!existingCollection) {
    // Creating new collection — parentCollection sets ParentID (expected)
    return {
      parentIdOverwritten: !!parentCollection,
      newParentId: parentCollection?.ID ?? null
    };
  } else if (parentCollection) {
    // Editing existing — parentCollection would overwrite ParentID
    return {
      parentIdOverwritten: true,
      newParentId: parentCollection.ID
    };
  }
  // Editing existing, no parentCollection — ParentID unchanged
  return {
    parentIdOverwritten: false,
    newParentId: existingCollection.ParentID
  };
}

describe('Bug 1: form-modal save logic for ParentID', () => {
  const collection: MockCollection = {
    ID: 'col-1',
    Name: 'My Collection',
    ParentID: 'parent-1'
  };

  it('should not overwrite ParentID when editing with no parentCollection (the fix)', () => {
    // After fix: parentCollection is undefined when editing
    const result = simulateSave(collection, undefined);
    expect(result.parentIdOverwritten).toBe(false);
    expect(result.newParentId).toBe('parent-1'); // Preserved
  });

  it('would overwrite ParentID if parentCollection were passed during edit (the bug)', () => {
    // Before fix: parentCollection = the collection itself
    const result = simulateSave(collection, collection);
    expect(result.parentIdOverwritten).toBe(true);
    expect(result.newParentId).toBe('col-1'); // Self-referencing — the bug!
  });

  it('should set ParentID when creating a new child collection', () => {
    const parent: MockCollection = { ID: 'parent-1', Name: 'Parent', ParentID: null };
    const result = simulateSave(undefined, parent);
    expect(result.parentIdOverwritten).toBe(true);
    expect(result.newParentId).toBe('parent-1');
  });

  it('should leave ParentID null when creating a new root collection', () => {
    const result = simulateSave(undefined, undefined);
    expect(result.parentIdOverwritten).toBe(false);
    expect(result.newParentId).toBeNull();
  });
});

// ============================================================
// Bug 2: Item counts always showing "Empty"
// ============================================================

/**
 * Reproduces the getItemCountText display logic
 */
function getItemCountText(itemCount?: number): string {
  if (itemCount !== undefined) {
    if (itemCount === 0) return 'Empty';
    if (itemCount === 1) return '1 item';
    return `${itemCount} items`;
  }
  return '';
}

/**
 * Reproduces the item count calculation from loadItemCounts:
 * counts child collections + collection artifacts per parent collection
 */
function buildItemCountMap(
  childCollections: Array<{ ParentID: string }>,
  collectionArtifacts: Array<{ CollectionID: string }>
): Map<string, number> {
  const map = new Map<string, number>();

  for (const child of childCollections) {
    map.set(child.ParentID, (map.get(child.ParentID) || 0) + 1);
  }

  for (const ca of collectionArtifacts) {
    map.set(ca.CollectionID, (map.get(ca.CollectionID) || 0) + 1);
  }

  return map;
}

describe('Bug 2: item count display', () => {
  describe('getItemCountText', () => {
    it('should return "Empty" for count 0', () => {
      expect(getItemCountText(0)).toBe('Empty');
    });

    it('should return "1 item" for count 1', () => {
      expect(getItemCountText(1)).toBe('1 item');
    });

    it('should return "N items" for count > 1', () => {
      expect(getItemCountText(5)).toBe('5 items');
    });

    it('should return empty string for undefined', () => {
      expect(getItemCountText(undefined)).toBe('');
    });
  });

  describe('buildItemCountMap', () => {
    it('should count child collections per parent', () => {
      const children = [
        { ParentID: 'col-1' },
        { ParentID: 'col-1' },
        { ParentID: 'col-2' }
      ];
      const map = buildItemCountMap(children, []);

      expect(map.get('col-1')).toBe(2);
      expect(map.get('col-2')).toBe(1);
    });

    it('should count artifacts per collection', () => {
      const artifacts = [
        { CollectionID: 'col-1' },
        { CollectionID: 'col-1' },
        { CollectionID: 'col-1' }
      ];
      const map = buildItemCountMap([], artifacts);

      expect(map.get('col-1')).toBe(3);
    });

    it('should sum child collections and artifacts together', () => {
      const children = [
        { ParentID: 'col-1' },
        { ParentID: 'col-1' }
      ];
      const artifacts = [
        { CollectionID: 'col-1' },
        { CollectionID: 'col-1' },
        { CollectionID: 'col-1' }
      ];
      const map = buildItemCountMap(children, artifacts);

      // 2 children + 3 artifacts = 5 items
      expect(map.get('col-1')).toBe(5);
    });

    it('should return 0 (via map miss) for collections with no items', () => {
      const map = buildItemCountMap([], []);
      expect(map.get('col-1') || 0).toBe(0);
    });

    it('should handle multiple collections independently', () => {
      const children = [
        { ParentID: 'col-1' },
        { ParentID: 'col-2' },
        { ParentID: 'col-2' }
      ];
      const artifacts = [
        { CollectionID: 'col-1' },
        { CollectionID: 'col-3' }
      ];
      const map = buildItemCountMap(children, artifacts);

      expect(map.get('col-1')).toBe(2); // 1 child + 1 artifact
      expect(map.get('col-2')).toBe(2); // 2 children
      expect(map.get('col-3')).toBe(1); // 1 artifact
    });
  });

  describe('end-to-end: count map feeds display text', () => {
    it('should show correct text from calculated counts', () => {
      const children = [{ ParentID: 'col-1' }];
      const artifacts = [
        { CollectionID: 'col-1' },
        { CollectionID: 'col-2' }
      ];
      const map = buildItemCountMap(children, artifacts);

      expect(getItemCountText(map.get('col-1') || 0)).toBe('2 items');
      expect(getItemCountText(map.get('col-2') || 0)).toBe('1 item');
      expect(getItemCountText(map.get('col-3') || 0)).toBe('Empty');
    });
  });
});

class NoopChangeDetectorRef extends ChangeDetectorRef {
  markForCheck(): void {}
  detach(): void {}
  detectChanges(): void {}
  checkNoChanges(): void {}
  reattach(): void {}
}

describe('Collections components RLS-safe entity reads (no base-view subqueries)', () => {
  const user = new UserInfo(undefined, { ID: 'user-1', Name: 'User One' });
  let queries: RunViewParams[];
  let rows: Record<string, object[]>;

  beforeEach(() => {
    queries = [];
    rows = {};
  });

  it('CollectionsFullViewComponent.LoadAllCollections resolves Collection Permissions before Collections without SELECT subqueries', async () => {
    rows['MJ: Collection Permissions'] = [{ CollectionID: 'col-shared-1' }, { CollectionID: 'COL-SHARED-1' }];
    rows['MJ: Collections'] = [
      { ID: 'col-shared-1', Name: 'Shared Folder', ParentID: null },
      { ID: 'col-owned-1', Name: 'My Folder', ParentID: null }
    ];

    const permissionService = new CollectionPermissionService();
    const artifactState = new ArtifactStateService(new ArtifactPermissionService(permissionService));
    const dialogService: DialogService = Object.create(DialogService.prototype);
    const iconService: ArtifactIconService = Object.create(ArtifactIconService.prototype);
    const component = new CollectionsFullViewComponent(
      dialogService,
      artifactState,
      new CollectionStateService(),
      permissionService,
      iconService,
      new NoopChangeDetectorRef()
    );
    component.Provider = CreateFakeProvider<object>({
      runViewResults: (params) => {
        queries.push(params);
        return rows[params.EntityName ?? ''] ?? [];
      }
    });
    component.CurrentUser = user;
    component.EnvironmentId = 'env-1';

    await component.LoadAllCollections(true);

    expect(component.AllCollections.map(c => c.ID)).toEqual(['col-shared-1', 'col-owned-1']);
    expect(queries.map(q => q.EntityName)).toEqual(['MJ: Collection Permissions', 'MJ: Collections']);
    expect(queries[0].ExtraFilter).toBe("UserID='user-1'");
    expect(queries[0].BypassCache).toBe(true);
    expect(queries[1].ExtraFilter).toBe(
      "EnvironmentID='env-1' AND (OwnerID IS NULL OR OwnerID='user-1' OR ID IN ('col-shared-1'))"
    );
    for (const q of queries) {
      expect(String(q.ExtraFilter ?? '')).not.toMatch(/\bSELECT\b|vwCollectionPermissions/i);
    }
  });

  it('CollectionViewComponent loads collection links before versions without SELECT subqueries', async () => {
    rows['MJ: Collection Artifacts'] = [{ ArtifactVersionID: 'ver-1' }, { ArtifactVersionID: 'VER-1' }];
    rows['MJ: Artifact Versions'] = [{ ID: 'ver-1', ArtifactID: 'ART-1', VersionNumber: 1 }];
    rows['MJ: Artifacts'] = [{ ID: 'art-1', Name: 'Member Guide' }];

    const confirmService: MJConfirmService = Object.create(MJConfirmService.prototype);
    const component = new CollectionViewComponent(new NoopChangeDetectorRef(), confirmService);
    component.Provider = CreateFakeProvider<object>({
      runViewResults: (params) => {
        queries.push(params);
        return rows[params.EntityName ?? ''] ?? [];
      }
    });
    const collection: MJCollectionEntity = Object.create(MJCollectionEntity.prototype, {
      ID: { value: 'col-1', enumerable: true },
      Name: { value: 'Member Collection', enumerable: true }
    });
    component.Collection = collection;
    component.CurrentUser = user;
    component.EnvironmentId = 'env-1';

    component.OnSortChange();
    await vi.waitFor(() => {
      expect(component.ArtifactVersions).toHaveLength(1);
    });

    expect(component.ArtifactVersions[0].artifact.Name).toBe('Member Guide');
    expect(queries.map(q => q.EntityName)).toEqual([
      'MJ: Collection Artifacts',
      'MJ: Artifact Versions',
      'MJ: Artifacts'
    ]);
    expect(queries[0].ExtraFilter).toBe("CollectionID='col-1'");
    expect(queries[1].ExtraFilter).toBe("ID IN ('ver-1')");
    expect(queries[2].ExtraFilter).toBe("ID='ART-1'");
    for (const q of queries) {
      expect(String(q.ExtraFilter ?? '')).not.toMatch(/\bSELECT\b|vwCollectionArtifacts/i);
    }
  });
});

