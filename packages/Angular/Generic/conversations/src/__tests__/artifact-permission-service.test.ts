import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { ArtifactPermissionService } from '../lib/services/artifact-permission.service';
import { CollectionPermissionService } from '../lib/services/collection-permission.service';

/**
 * GetReadableArtifactsFilter is the set form of CheckPermission(..., 'read'): owner, else an
 * explicit grant decides, else read access to a collection that holds a version of the artifact.
 */

type Rows = Record<string, object[]>;

/** The batch-read surface the fake provider exposes to RunView.FromMetadataProvider. */
type BatchRunner = { RunViews(params: RunViewParams[]): Promise<RunViewResult[]> };

const USER = { ID: 'user-1', Name: 'User One' } as unknown as UserInfo;

/** Extracts the quoted IDs from the filter's `ID IN (...)` list. */
function readableIds(filter: string): Set<string> {
  const match = filter.match(/ID IN \(([^)]*)\)/);
  if (!match) return new Set();
  return new Set(match[1].split(',').map((id) => id.trim().replace(/'/g, '')));
}

describe('ArtifactPermissionService.GetReadableArtifactsFilter', () => {
  let service: ArtifactPermissionService;
  let queries: RunViewParams[];
  let rows: Rows;

  beforeEach(() => {
    queries = [];
    rows = {};
    service = new ArtifactPermissionService(new CollectionPermissionService());
    service.Provider = CreateFakeProvider<object>({
      runViewResults: (params) => {
        queries.push(params);
        return rows[params.EntityName ?? ''] ?? [];
      },
    });
  });

  const queriesFor = (entityName: string): RunViewParams[] => queries.filter((q) => q.EntityName === entityName);

  it('matches only owned artifacts when the user has no grants', async () => {
    const filter = await service.GetReadableArtifactsFilter(USER.ID, USER);

    expect(filter).toBe("(UserID='user-1')");
    expect(queriesFor('MJ: Collection Artifacts')).toHaveLength(0);
    expect(queriesFor('MJ: Artifact Versions')).toHaveLength(0);
  });

  it('adds artifacts shared directly with read access', async () => {
    rows['MJ: Artifact Permissions'] = [
      { ArtifactID: 'a-read', CanRead: true },
      { ArtifactID: 'a-no-read', CanRead: false },
    ];

    const filter = await service.GetReadableArtifactsFilter(USER.ID, USER);

    expect(filter.startsWith("(UserID='user-1' OR ID IN (")).toBe(true);
    expect(readableIds(filter)).toEqual(new Set(['a-read']));
  });

  it('adds artifacts that have a version in a collection the user can read', async () => {
    rows['MJ: Collection Permissions'] = [{ CollectionID: 'col-1' }, { CollectionID: 'col-2' }];
    rows['MJ: Collection Artifacts'] = [{ ArtifactVersionID: 'v-1' }, { ArtifactVersionID: 'v-2' }];
    rows['MJ: Artifact Versions'] = [{ ArtifactID: 'a-coll' }, { ArtifactID: 'a-coll' }, { ArtifactID: 'a-other' }];

    const filter = await service.GetReadableArtifactsFilter(USER.ID, USER);

    expect(readableIds(filter)).toEqual(new Set(['a-coll', 'a-other']));
    expect(queriesFor('MJ: Collection Artifacts')[0].ExtraFilter).toBe("CollectionID IN ('col-1','col-2')");
    expect(queriesFor('MJ: Artifact Versions')[0].ExtraFilter).toBe("ID IN ('v-1','v-2')");
  });

  it('lets an explicit grant without read access override collection access', async () => {
    rows['MJ: Artifact Permissions'] = [{ ArtifactID: 'a-blocked', CanRead: false }];
    rows['MJ: Collection Permissions'] = [{ CollectionID: 'col-1' }];
    rows['MJ: Collection Artifacts'] = [{ ArtifactVersionID: 'v-1' }];
    rows['MJ: Artifact Versions'] = [{ ArtifactID: 'a-blocked' }, { ArtifactID: 'a-open' }];

    const filter = await service.GetReadableArtifactsFilter(USER.ID, USER);

    expect(readableIds(filter)).toEqual(new Set(['a-open']));
  });

  it("reads only this user's grants, and only collection grants that include read", async () => {
    await service.GetReadableArtifactsFilter(USER.ID, USER);

    expect(queriesFor('MJ: Artifact Permissions')[0].ExtraFilter).toBe("UserID='user-1'");
    expect(queriesFor('MJ: Collection Permissions')[0].ExtraFilter).toBe("UserID='user-1' AND CanRead=1");
  });

  it('falls back to owned artifacts when the explicit grants cannot be read', async () => {
    // A failed grant read hides grants that withhold read, so collection access must not apply.
    rows['MJ: Collection Permissions'] = [{ CollectionID: 'col-1' }];
    rows['MJ: Collection Artifacts'] = [{ ArtifactVersionID: 'v-1' }];
    rows['MJ: Artifact Versions'] = [{ ArtifactID: 'a-coll' }];
    const fake = CreateFakeProvider<object>({ runViewResults: (params) => rows[params.EntityName ?? ''] ?? [] });
    const batch = fake as unknown as BatchRunner;
    const runViews = batch.RunViews;
    batch.RunViews = async (params) =>
      (await runViews(params)).map((result, i) =>
        params[i].EntityName === 'MJ: Artifact Permissions'
          ? { ...result, Success: false, ErrorMessage: 'grant read failed' }
          : result
      );
    service.Provider = fake;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const filter = await service.GetReadableArtifactsFilter(USER.ID, USER);

    expect(filter).toBe("(UserID='user-1')");
  });

  it('keeps every filter on its own entity, with no cross-entity subquery', async () => {
    // A subquery names another entity's columns, which the PostgreSQL provider cannot quote.
    rows['MJ: Artifact Permissions'] = [{ ArtifactID: 'a-read', CanRead: true }];
    rows['MJ: Collection Permissions'] = [{ CollectionID: 'col-1' }];
    rows['MJ: Collection Artifacts'] = [{ ArtifactVersionID: 'v-1' }];
    rows['MJ: Artifact Versions'] = [{ ArtifactID: 'a-coll' }];

    await service.GetReadableArtifactsFilter(USER.ID, USER);

    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.ExtraFilter ?? '').not.toMatch(/SELECT/i);
    }
  });
});
