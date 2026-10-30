import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import type { SnapshotRowKey } from '@memberjunction/predictive-studio-core';
import { TrainingKeys } from '../training-keys';
import { InMemorySnapshotFileStore } from '../../snapshot/snapshot-file-store';
import { SnapshotIntegrityError } from '../../snapshot/snapshot-manifest';

type Canned = { readonly Success: boolean; readonly Results: ReadonlyArray<Record<string, string | null>>; readonly ErrorMessage: string };

/** A provider whose RunView answers each entity with one canned result (one deliberate test-double cast at the seam). */
function provider(byEntity: Record<string, Canned>): IMetadataProvider {
  return { RunView: async (p: RunViewParams) => byEntity[p.EntityName || ''] } as unknown as IMetadataProvider;
}
const user = { ID: 'u' } as UserInfo;
const ok = (rows: ReadonlyArray<Record<string, string | null>>): Canned => ({ Success: true, Results: rows, ErrorMessage: '' });

describe('TrainingKeys.LoadTrainingRowIds', () => {
  it('returns no training rows for a model whose training run has no snapshot, or no run', async () => {
    expect([...(await TrainingKeys.LoadTrainingRowIds('m-1', provider({ 'MJ: ML Training Runs': ok([{ TrainingSnapshotID: null }]) }), user))]).toEqual([]);
    expect([...(await TrainingKeys.LoadTrainingRowIds('m-1', provider({ 'MJ: ML Training Runs': ok([]) }), user))]).toEqual([]);
  });

  it('throws a failed read naming the model, and a snapshot row that is missing', async () => {
    const failedRun = provider({ 'MJ: ML Training Runs': { Success: false, Results: [], ErrorMessage: 'permission denied' } });
    await expect(TrainingKeys.LoadTrainingRowIds('m-1', failedRun, user)).rejects.toThrow('Loading the training run of model m-1 failed: permission denied');
    const failedSnapshot = provider({ 'MJ: ML Training Runs': ok([{ TrainingSnapshotID: 'S-1' }]), 'MJ: Training Snapshots': { Success: false, Results: [], ErrorMessage: 'timeout' } });
    await expect(TrainingKeys.LoadTrainingRowIds('m-1', failedSnapshot, user)).rejects.toThrow('Loading Training Snapshot S-1 of model m-1 failed: timeout');
    const missing = provider({ 'MJ: ML Training Runs': ok([{ TrainingSnapshotID: 'S-1' }]), 'MJ: Training Snapshots': ok([]) });
    await expect(TrainingKeys.LoadTrainingRowIds('m-1', missing, user)).rejects.toThrow('Training Snapshot S-1 of model m-1 was not found');
  });

  it("returns exactly the development row ids of the model's verified snapshot manifest, and refuses a manifest whose SHA-256 differs", async () => {
    const line = (rowId: string, role: SnapshotRowKey['role']): SnapshotRowKey => ({ rowId, entityKey: `E-${rowId}`, decisionDate: '2024-01-01', groupKey: `e-${rowId}`, period: null, role });
    const files = new InMemorySnapshotFileStore('p');
    const bytes = new TextEncoder().encode(`${[line('DEV-1', 'development'), line('HOLD-1', 'locked-holdout')].map((l) => JSON.stringify(l)).join('\n')}\n`);
    const f = await files.Put('k/manifest.jsonl', 'manifest', bytes);
    const withSha = (sha256: string): IMetadataProvider => provider({
      'MJ: ML Training Runs': ok([{ TrainingSnapshotID: 'S-1' }]),
      'MJ: Training Snapshots': ok([{ RowManifestFileID: f.FileID, RowManifestSha256: sha256 }]),
    });
    expect([...(await TrainingKeys.LoadTrainingRowIds('m-1', withSha(f.Sha256), user, files))]).toEqual(['DEV-1']);
    await expect(TrainingKeys.LoadTrainingRowIds('m-1', withSha('0'.repeat(64)), user, files)).rejects.toBeInstanceOf(SnapshotIntegrityError);
  });
});
