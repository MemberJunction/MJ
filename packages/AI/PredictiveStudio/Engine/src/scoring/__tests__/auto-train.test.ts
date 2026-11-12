import { describe, expect, it } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';

import { PipelineAutoTrainer } from '../auto-train';
import { InMemoryArtifactLoader } from '../artifact-loader';
import { ArtifactRegistry } from '../../registry/artifact-registry';
import { InMemoryArtifactStore } from '../../training/artifact-store';
import { SnapshotHash } from '../../snapshot/snapshot-hash';

const PIPE = '8A1C44F3-938C-4E65-B6DE-D621BC4C3001';
const USER = { ID: 'B7E0A2C4-0000-4000-8000-0000000000C1' } as UserInfo;

type ReuseRow = Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256' | 'Lineage'>;

/** The auto-trainer with its reuse lookup exposed. */
class ReuseProbe extends PipelineAutoTrainer {
  public Reusable(provider: IMetadataProvider): Promise<string | null> {
    return this.findReusableModel(PIPE, USER, provider);
  }
}

/** A provider whose only use is the reuse lookup: it answers with `rows` (newest first) and records the fields asked for. */
function reuseProvider(rows: ReuseRow[], fieldsAsked: string[][]): IMetadataProvider {
  const slice = {
    async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
      fieldsAsked.push(params.Fields ?? []);
      return { Success: true, Results: rows as unknown as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
    },
  };
  return slice as unknown as IMetadataProvider;
}

describe('PipelineAutoTrainer.findReusableModel loads through the artifact registry', () => {
  const bytes = new TextEncoder().encode('published model bytes');
  const sha = SnapshotHash.Sha256Hex(bytes);
  const tabular = JSON.stringify({ shippedMember: 'xgb', shippedDriver: 'xgboost' });

  it('does not reuse a published model whose artifact does not verify', async () => {
    const loader = new InMemoryArtifactLoader();
    // 'lost' has no object; 'swapped' holds the bytes of another model; 'pre-change' has no registered hash.
    loader.Set('file-swapped', new TextEncoder().encode('another model'));
    loader.Set('file-pre-change', bytes);
    const rows: ReuseRow[] = [
      { ID: 'lost', ArtifactFileID: 'file-lost', ArtifactSha256: sha, Lineage: tabular },
      { ID: 'swapped', ArtifactFileID: 'file-swapped', ArtifactSha256: sha, Lineage: tabular },
      { ID: 'pre-change', ArtifactFileID: 'file-pre-change', ArtifactSha256: null, Lineage: tabular },
    ];
    const fieldsAsked: string[][] = [];
    const probe = new ReuseProbe({ registry: new ArtifactRegistry(new InMemoryArtifactStore(), loader) });
    expect(await probe.Reusable(reuseProvider(rows, fieldsAsked))).toBeNull();
    expect(fieldsAsked).toEqual([['ID', 'ArtifactFileID', 'ArtifactSha256', 'Lineage']]);
  });

  it('reuses the newest published model whose artifact verifies', async () => {
    const loader = new InMemoryArtifactLoader();
    loader.Set('file-good', bytes);
    const rows: ReuseRow[] = [
      { ID: 'lost', ArtifactFileID: 'file-lost', ArtifactSha256: sha, Lineage: tabular },
      { ID: 'good', ArtifactFileID: 'file-good', ArtifactSha256: sha, Lineage: tabular },
    ];
    const probe = new ReuseProbe({ registry: new ArtifactRegistry(new InMemoryArtifactStore(), loader) });
    expect(await probe.Reusable(reuseProvider(rows, []))).toBe('good');
  });
});
