/**
 * `RollbackCandidates.Find` (M7-7): the one candidate rule the lifecycle gate's and the registry check's rollbacks share —
 * the newest `Archived` model with a `Delivery`, a `publish` or `adopt` record for its training run, and an artifact
 * that verifies now — over the `GateTestStore` fake and an in-memory artifact loader.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import type { ArtifactBytesRead, IArtifactLoader } from '../../scoring/types';
import type { RegistryContext } from '../registry-context';
import { RollbackCandidates } from '../rollback-candidates';

const PIPELINE = 'A7000000-0000-4000-8000-000000000001';

/** Artifact bytes by file ID; a file not set is `absent`. */
class MemoryLoader implements IArtifactLoader {
  public readonly Files = new Map<string, Uint8Array>();
  public async load(fileId: string): Promise<ArtifactBytesRead> {
    const bytes = this.Files.get(fileId);
    return bytes ? { Kind: 'read', Bytes: bytes } : { Kind: 'absent', FileID: fileId };
  }
}

let store: GateTestStore;
let loader: MemoryLoader;
let ctx: RegistryContext;

/** An Archived model of the pipeline at version `n`: artifact stored unless `Bytes` is false, run published unless `Purpose` is null, a Delivery unless `Delivery` is false. */
function Archived(n: number, o: { readonly Bytes?: boolean; readonly Purpose?: 'publish' | 'adopt' | 'rollback' | null; readonly Delivery?: boolean } = {}): string {
  const id = `A7000000-0000-4000-8000-0000000001${n.toString().padStart(2, '0')}`;
  const runId = `A7000000-0000-4000-8000-0000000002${n.toString().padStart(2, '0')}`;
  const fileId = `A7000000-0000-4000-8000-0000000003${n.toString().padStart(2, '0')}`;
  const bytes = new TextEncoder().encode(`artifact ${n}`);
  if (o.Bytes !== false) loader.Files.set(fileId, bytes);
  store.Insert('MJ: ML Models', {
    ID: id, PipelineID: PIPELINE, Version: n, Status: 'Archived', TrainingRunID: runId, Delivery: o.Delivery === false ? null : '{}',
    ArtifactFileID: fileId, ArtifactSha256: SnapshotHash.Sha256Hex(bytes), ArtifactStatus: 'verified',
  });
  const purpose = o.Purpose === undefined ? 'publish' : o.Purpose;
  if (purpose !== null) store.Insert('MJ: ML Model Publish Records', { ID: `${runId}-record`, ModelID: id, TrainingRunID: runId, Kind: 'publish', Purpose: purpose });
  return id;
}

beforeEach(() => {
  store = new GateTestStore();
  loader = new MemoryLoader();
  ctx = { ContextUser: GateWorld.User, Provider: store.Provider() };
});

describe('RollbackCandidates.Find', () => {
  it('is the newest Archived model published through the gate whose artifact verifies', async () => {
    Archived(1);
    const newest = Archived(2);
    expect(await RollbackCandidates.Find(PIPELINE, loader, ctx)).toBe(newest);
  });

  it('passes over a model whose bytes are gone, whatever its stored ArtifactStatus says', async () => {
    const older = Archived(1);
    Archived(2, { Bytes: false });
    expect(await RollbackCandidates.Find(PIPELINE, loader, ctx)).toBe(older);
  });

  it('passes over a model never published through the gate, and one with no Delivery', async () => {
    const adopted = Archived(1, { Purpose: 'adopt' });
    Archived(2, { Purpose: null });
    Archived(3, { Delivery: false });
    expect(await RollbackCandidates.Find(PIPELINE, loader, ctx)).toBe(adopted);
  });

  it('is null when the pipeline has no candidate', async () => {
    Archived(1, { Bytes: false });
    expect(await RollbackCandidates.Find(PIPELINE, loader, ctx)).toBeNull();
  });
});
