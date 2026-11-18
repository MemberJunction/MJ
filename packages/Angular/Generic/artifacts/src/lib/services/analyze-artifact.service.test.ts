import { describe, it, expect, vi, afterEach } from 'vitest';
import { DataSnapshot, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ArtifactMetadataEngine, MJArtifactTypeEntity } from '@memberjunction/core-entities';
import { AnalyzeArtifactService } from './analyze-artifact.service';

describe('AnalyzeArtifactService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws descriptive error if Data Snapshot artifact type cannot be found', async () => {
    const fakeEngine = Object.assign(Object.create(null) as ArtifactMetadataEngine, {
      Config: vi.fn().mockResolvedValue(undefined),
      FindArtifactType: vi.fn().mockReturnValue(undefined),
    });
    vi.spyOn(ArtifactMetadataEngine, 'Instance', 'get').mockReturnValue(fakeEngine);

    const svc = new AnalyzeArtifactService();
    const user = Object.assign(Object.create(null) as UserInfo, { ID: 'u-1' });
    const snap = new DataSnapshot();
    snap.title = 'Q4 Metrics';

    await expect(
      svc.CreateSnapshotArtifact({ snapshot: snap, currentUser: user, environmentId: 'env-1' }),
    ).rejects.toThrow(/Data Snapshot/);
  });

  it('creates Artifact + ArtifactVersion using configured provider', async () => {
    const fakeType = Object.assign(Object.create(null) as MJArtifactTypeEntity, { ID: 'type-snap' });
    const fakeEngine = Object.assign(Object.create(null) as ArtifactMetadataEngine, {
      Config: vi.fn().mockResolvedValue(undefined),
      FindArtifactType: vi.fn().mockReturnValue(fakeType),
    });
    vi.spyOn(ArtifactMetadataEngine, 'GetProviderInstance').mockReturnValue(fakeEngine);

    const savedRecords: Array<{ entity: string; payload: Record<string, string | number | boolean | object | null | undefined> }> = [];
    const mockProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      GetEntityObject: vi.fn(async (entityName: string) => {
        const rec: Record<string, string | number | boolean | object | null | undefined> = {
          ID: entityName === 'MJ: Artifacts' ? 'art-new-1' : 'ver-new-1',
        };
        rec['Save'] = async () => {
          savedRecords.push({ entity: entityName, payload: { ...rec } });
          return true;
        };
        return rec;
      }),
    });

    const svc = new AnalyzeArtifactService();
    svc.Provider = mockProvider;
    const user = Object.assign(Object.create(null) as UserInfo, { ID: 'u-1' });
    const snap = new DataSnapshot();
    snap.title = 'Sales Snapshot';

    const res = await svc.CreateSnapshotArtifact({
      snapshot: snap,
      currentUser: user,
      environmentId: 'env-1',
    });

    expect(res).toEqual({
      artifactId: 'art-new-1',
      artifactVersionId: 'ver-new-1',
      title: 'Sales Snapshot',
    });
    expect(savedRecords.map((r) => r.entity)).toEqual(['MJ: Artifacts', 'MJ: Artifact Versions']);
  });
});
