import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo, RunViewResult, RunViewParams } from '@memberjunction/core';

import { MetadataEntityFactory } from '../../training/seams';
import {
  resolveActiveFileStorageProviderId,
  buildArtifactStore,
  MJFilesArtifactStore,
} from '../../training/artifact-store';

/**
 * Tests for the artifact-store wiring in `operations/delegation` / `training/artifact-store`:
 * the active-provider lookup that stamps every artifact's `MJ: Files` row, and that
 * `buildArtifactStore` always produces an FK-valid `MJFilesArtifactStore`. NO live DB
 * / sidecar — the provider lookup runs through a spy provider whose `RunView` returns
 * canned rows.
 */

/** A minimal spy `IMetadataProvider` exposing only the `RunView` the lookup uses. */
function makeSpyProvider(rows: Array<{ ID: string }>): {
  provider: IMetadataProvider;
  calls: RunViewParams[];
} {
  const calls: RunViewParams[] = [];
  const spy = {
    CurrentUser: { Email: 'spy@example.com' } as UserInfo,
    async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
      calls.push(params);
      return {
        Success: true,
        Results: rows as unknown as T[],
        RowCount: rows.length,
        TotalRowCount: rows.length,
        ExecutionTime: 0,
        ErrorMessage: '',
      } as RunViewResult<T>;
    },
  };
  return { provider: spy as unknown as IMetadataProvider, calls };
}

describe('resolveActiveFileStorageProviderId', () => {
  it('returns the first active provider id when one exists', async () => {
    const { provider, calls } = makeSpyProvider([{ ID: 'PROVIDER-1' }]);
    const id = await resolveActiveFileStorageProviderId({ Email: 'u@x' } as UserInfo, provider);

    expect(id).toBe('PROVIDER-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].EntityName).toBe('MJ: File Storage Providers');
    expect(calls[0].ExtraFilter).toContain('IsActive = 1');
  });

  it('returns null when no active provider exists', async () => {
    const { provider } = makeSpyProvider([]);
    const id = await resolveActiveFileStorageProviderId({ Email: 'u@x' } as UserInfo, provider);
    expect(id).toBeNull();
  });
});

describe('buildArtifactStore', () => {
  it('builds an MJFilesArtifactStore (real File row + local bytes) when a provider id is present', () => {
    const store = buildArtifactStore('PROVIDER-1', new MetadataEntityFactory());
    expect(store).toBeInstanceOf(MJFilesArtifactStore);
  });

  it('still builds an MJFilesArtifactStore when no provider id is present (save will fail loudly without one)', () => {
    const store = buildArtifactStore(null, new MetadataEntityFactory());
    expect(store).toBeInstanceOf(MJFilesArtifactStore);
  });
});
