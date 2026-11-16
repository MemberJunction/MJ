import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunViewParams, UserInfo } from '@memberjunction/core';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { ArtifactStateService } from '../lib/services/artifact-state.service';
import { ArtifactPermissionService } from '../lib/services/artifact-permission.service';
import { CollectionPermissionService } from '../lib/services/collection-permission.service';

const USER = new UserInfo(undefined, { ID: 'user-1', Name: 'User One' });

describe('ArtifactStateService collection operations (RLS-safe, no subqueries)', () => {
  let service: ArtifactStateService;
  let permissionService: ArtifactPermissionService;
  let queries: RunViewParams[];
  let rows: Record<string, object[]>;

  beforeEach(() => {
    queries = [];
    rows = {};
    permissionService = new ArtifactPermissionService(new CollectionPermissionService());
    service = new ArtifactStateService(permissionService);
    service.Provider = CreateFakeProvider<object>({
      runViewResults: (params) => {
        queries.push(params);
        return rows[params.EntityName ?? ''] ?? [];
      },
    });
  });

  describe('LoadArtifactsForCollection', () => {
    it('resolves collection links and versions with separate reads and zero SELECT subqueries', async () => {
      rows['MJ: Collection Artifacts'] = [{ ArtifactVersionID: 'ver-1' }, { ArtifactVersionID: 'ver-2' }];
      rows['MJ: Artifact Versions'] = [{ ArtifactID: 'art-1' }, { ArtifactID: 'art-1' }, { ArtifactID: 'art-2' }];
      rows['MJ: Artifacts'] = [
        { ID: 'art-2', Name: 'Second' },
        { ID: 'art-1', Name: 'First' },
      ];

      const artifacts = await service.LoadArtifactsForCollection('col-1', USER);

      expect(artifacts.map((a) => a.ID)).toEqual(['art-2', 'art-1']);
      expect(queries.map((q) => q.EntityName)).toEqual([
        'MJ: Collection Artifacts',
        'MJ: Artifact Versions',
        'MJ: Artifacts',
      ]);
      expect(queries[0].ExtraFilter).toBe("CollectionID='col-1'");
      expect(queries[1].ExtraFilter).toBe("ID IN ('ver-1','ver-2')");
      expect(queries[2].ExtraFilter).toBe("ID IN ('art-1','art-2')");
      for (const q of queries) {
        expect(String(q.ExtraFilter ?? '')).not.toMatch(/\bSELECT\b|vwArtifactVersions|vwCollectionArtifacts/i);
      }
    });

    it('stops early when the collection has no artifact links', async () => {
      const artifacts = await service.LoadArtifactsForCollection('col-empty', USER);

      expect(artifacts).toEqual([]);
      expect(queries.map((q) => q.EntityName)).toEqual(['MJ: Collection Artifacts']);
    });
  });

  describe('RemoveFromCollection', () => {
    it('resolves artifact versions first and deletes matching collection links without a SELECT subquery', async () => {
      vi.spyOn(permissionService, 'checkPermission').mockResolvedValue(true);
      const deleteFirst = vi.fn(async () => true);
      const deleteSecond = vi.fn(async () => true);
      rows['MJ: Artifact Versions'] = [{ ID: 'ver-1' }, { ID: 'ver-2' }];
      rows['MJ: Collection Artifacts'] = [
        { ID: 'ca-1', Delete: deleteFirst },
        { ID: 'ca-2', Delete: deleteSecond },
      ];

      await service.RemoveFromCollection('art-1', 'col-1', USER);

      expect(deleteFirst).toHaveBeenCalledTimes(1);
      expect(deleteSecond).toHaveBeenCalledTimes(1);
      expect(queries.map((q) => q.EntityName)).toEqual([
        'MJ: Artifact Versions',
        'MJ: Collection Artifacts',
      ]);
      expect(queries[0].ExtraFilter).toBe("ArtifactID='art-1'");
      expect(queries[1].ExtraFilter).toBe("CollectionID='col-1' AND ArtifactVersionID IN ('ver-1','ver-2')");
      for (const q of queries) {
        expect(String(q.ExtraFilter ?? '')).not.toMatch(/\bSELECT\b|vwArtifactVersions/i);
      }
    });
  });
});
