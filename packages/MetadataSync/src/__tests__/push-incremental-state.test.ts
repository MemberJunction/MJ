/**
 * Incremental push state with --dir pointing at an entity folder: the state is the sync root's,
 * its keys are relative to the sync root, and pruning stays inside the pushed folders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { UserInfo } from '@memberjunction/core';
import type { SyncEngine } from '../lib/sync-engine';
import type { SyncState } from '../lib/sync-state-manager';

/** A provider with only the transaction calls a push makes. */
class FakeProvider {
  TransactionDepth = 0;
  readonly PlatformKey = 'sqlserver';
  async BeginTransaction(): Promise<void> {
    this.TransactionDepth++;
  }
  async CommitTransaction(): Promise<void> {
    this.TransactionDepth--;
  }
  async RollbackTransaction(): Promise<void> {
    this.TransactionDepth--;
  }
  IsMetadataDatasetMember(): boolean {
    return false;
  }
  async RefreshWithinTransaction(): Promise<boolean> {
    return true;
  }
  async Refresh(): Promise<boolean> {
    return true;
  }
}

const host = new FakeProvider();

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    static get Provider(): FakeProvider {
      return host;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

vi.mock('../lib/provider-utils', async () => {
  const actual = await vi.importActual<typeof import('../lib/provider-utils')>('../lib/provider-utils');
  return { ...actual, getDataProvider: () => host };
});

vi.mock('../lib/sync-metadata-engine', () => ({
  SyncMetadataEngine: class {
    initializeEngine(): void {}
    getCachedFile(): undefined {
      return undefined;
    }
    cacheFile(): void {}
    invalidateCachedFile(): void {}
    setEntityDirs(): void {}
    async Config(): Promise<void> {}
    drainWarnings(): string[] {
      return [];
    }
    getDelegationSummary(): never[] {
      return [];
    }
  },
}));

vi.mock('../lib/entity-subclass-guard', () => ({ DescribeMissingEntitySubclass: () => undefined, describeMissingEntitySubclass: () => undefined }));

import { PushService } from '../services/PushService';
import { SyncStateManager } from '../lib/sync-state-manager';

function makeSyncEngine(): SyncEngine {
  const stub = { setMetadataEngine: () => undefined, getProvider: () => host, calculateChecksum: () => 'C1' };
  return stub as unknown as SyncEngine;
}

/** The state the push leaves in memory. */
function stateOf(manager: SyncStateManager): SyncState {
  return (manager as unknown as { state: SyncState }).state;
}

describe('incremental push with --dir pointing at an entity folder', () => {
  let root: string;
  let state: SyncStateManager;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-state-'));
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', directoryOrder: ['a', 'b'] });
    for (const name of ['a', 'b']) {
      await fs.ensureDir(path.join(root, name));
      await fs.writeJson(path.join(root, name, '.mj-sync.json'), { entity: `Entity ${name}` });
    }
    await fs.writeJson(path.join(root, 'a', 'x.json'), []);
    state = new SyncStateManager(root);
    vi.spyOn(state, 'save').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  async function pushFolderA(): Promise<void> {
    const service = new PushService(makeSyncEngine(), {} as UserInfo, state);
    await service.Push({ dir: path.join(root, 'a'), incremental: true }, {});
  }

  it('writes checksum and timestamp keys relative to the sync root', async () => {
    await pushFolderA();

    expect(stateOf(state).fileChecksums).toEqual({ [path.join('a', 'x.json')]: 'C1' });
    expect(Object.keys(stateOf(state).pushTimestamps)).toEqual(['a']);
  });

  it('keeps the root state keys of other folders, and prunes only inside the pushed folder', async () => {
    state.setFileChecksum(path.join('b', 'y.json'), 'B0');
    state.setFileChecksum(path.join('a', 'gone.json'), 'G0');

    await pushFolderA();

    expect(stateOf(state).fileChecksums).toEqual({
      [path.join('a', 'x.json')]: 'C1',
      [path.join('b', 'y.json')]: 'B0',
    });
  });

  it('prunes, on a root push, a key whose whole folder no longer exists', async () => {
    state.setFileChecksum(path.join('gone-folder', 'z.json'), 'Z0');
    state.setFileChecksum(path.join('b', 'y.json'), 'B0');

    const service = new PushService(makeSyncEngine(), {} as UserInfo, state);
    await service.Push({ dir: root, incremental: true }, {});

    expect(stateOf(state).fileChecksums).toEqual({ [path.join('a', 'x.json')]: 'C1' });
  });
});
