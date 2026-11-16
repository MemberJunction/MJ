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
      expect(q.IgnoreMaxRows).toBe(true);
    }
  });

  it('escapes single quotes in userId and returned artifact/collection IDs', async () => {
    const quotedUser = { ID: "user'1", Name: 'Quoted User' } as unknown as UserInfo;
    rows['MJ: Artifact Permissions'] = [{ ArtifactID: "art'direct", CanRead: true }];
    rows['MJ: Collection Permissions'] = [{ CollectionID: "col'1" }];
    rows['MJ: Collection Artifacts'] = [{ ArtifactVersionID: "ver'1" }];
    rows['MJ: Artifact Versions'] = [{ ArtifactID: "art'coll" }];

    const filter = await service.GetReadableArtifactsFilter(quotedUser.ID, quotedUser);

    expect(filter).toBe("(UserID='user''1' OR ID IN ('art''direct','art''coll'))");
    expect(queriesFor('MJ: Artifact Permissions')[0].ExtraFilter).toBe("UserID='user''1'");
    expect(queriesFor('MJ: Collection Artifacts')[0].ExtraFilter).toBe("CollectionID IN ('col''1')");
    expect(queriesFor('MJ: Artifact Versions')[0].ExtraFilter).toBe("ID IN ('ver''1')");
  });
});

describe('ArtifactPermissionService.CheckPermission and GetEffectiveUsers', () => {
  let service: ArtifactPermissionService;
  let collectionPermissions: CollectionPermissionService;
  let queries: RunViewParams[];
  let rows: Rows;

  beforeEach(() => {
    queries = [];
    rows = {};
    collectionPermissions = new CollectionPermissionService();
    service = new ArtifactPermissionService(collectionPermissions);
    service.Provider = CreateFakeProvider<object>({
      runViewResults: (params) => {
        queries.push(params);
        return rows[params.EntityName ?? ''] ?? [];
      },
    });
  });

  it('inherits collection edit permission in CheckPermission without issuing a SELECT subquery', async () => {
    rows['MJ: Artifacts'] = [{ ID: 'art-1', UserID: 'other-owner', __mj_CreatedAt: new Date() }];
    rows['MJ: Artifact Versions'] = [{ ID: 'ver-1' }, { ID: 'ver-2' }];
    rows['MJ: Collection Artifacts'] = [{ CollectionID: 'col-1', Collection: 'Shared Folder', ArtifactVersionID: 'ver-1' }];
    vi.spyOn(collectionPermissions, 'checkPermission').mockResolvedValue({
      id: 'cp-1',
      collectionId: 'col-1',
      userId: USER.ID,
      userName: USER.Name,
      canRead: true,
      canShare: false,
      canEdit: true,
      canDelete: false,
      sharedByUserId: null,
      sharedByUserName: null,
      sharedAt: new Date(),
    });

    const allowed = await service.CheckPermission('art-1', USER.ID, 'edit', USER);

    expect(allowed).toBe(true);
    for (const q of queries) {
      expect(String(q.ExtraFilter ?? '')).not.toMatch(/\bSELECT\b|vwArtifactVersions/i);
    }
    const collectionLinkQuery = queries.find((q) => q.EntityName === 'MJ: Collection Artifacts');
    expect(collectionLinkQuery?.ExtraFilter).toBe("ArtifactVersionID IN ('ver-1','ver-2')");
  });

  it('loads collection-inherited users in GetEffectiveUsers without issuing a SELECT subquery', async () => {
    const sharedAt = new Date('2026-11-01T00:00:00Z');
    rows['MJ: Artifacts'] = [{ ID: 'art-1', UserID: 'owner-1', User: 'Owner', __mj_CreatedAt: sharedAt }];
    rows['MJ: Artifact Versions'] = [{ ID: 'ver-1' }];
    rows['MJ: Collection Artifacts'] = [{ CollectionID: 'col-1', Collection: 'Team Docs', ArtifactVersionID: 'ver-1' }];
    vi.spyOn(collectionPermissions, 'loadPermissions').mockResolvedValue([
      {
        id: 'cp-2',
        collectionId: 'col-1',
        userId: 'user-1',
        userName: 'User One',
        canRead: true,
        canShare: false,
        canEdit: false,
        canDelete: false,
        sharedByUserId: 'owner-1',
        sharedByUserName: 'Owner',
        sharedAt,
      },
    ]);

    const users = await service.GetEffectiveUsers('art-1', USER);

    expect(users.map((u) => ({ userId: u.userId, source: u.source, collectionName: u.collectionName }))).toEqual([
      { userId: 'owner-1', source: 'owner', collectionName: undefined },
      { userId: 'user-1', source: 'collection', collectionName: 'Team Docs' },
    ]);
    for (const q of queries) {
      expect(String(q.ExtraFilter ?? '')).not.toMatch(/\bSELECT\b|vwArtifactVersions/i);
    }
  });
});

