/**
 * A delete whose row an earlier delete in the same push already removed (a cascade) is skipped
 * with a warning, not a push failure (#4935). Existence is read through the push transaction, not
 * the preload cache, which still holds the row until commit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';

const fakeHost = { TransactionDepth: 1 };
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    public static get Provider(): typeof fakeHost {
      return fakeHost;
    }
    public EntityByName(): null {
      return null;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';

const MODEL_ID = '29E25958-922D-4148-A9DB-01770ED9F3B0';
const entityInfo = { Name: 'MJ: AI Prompt Models', PrimaryKeys: [{ Name: 'ID' }] } as unknown as EntityInfo;

function deleteMarker(): FlattenedRecord {
  return {
    id: 'model',
    entityName: 'MJ: AI Prompt Models',
    record: { primaryKey: { ID: MODEL_ID }, fields: {}, deleteRecord: { delete: true } },
    dependencies: new Set(),
    depth: 0,
    path: 'prompts/.prompts.json',
    originalIndex: 0,
    graphId: 'model',
  };
}

function rowEntity(deleteBehavior: 'false' | 'throw'): BaseEntity {
  return {
    EntityInfo: entityInfo,
    Get: (field: string) => (field === 'ID' ? MODEL_ID : undefined),
    LatestResult: { CompleteMessage: `record with primary key ID=${MODEL_ID} not found`, Errors: [] },
    Delete: async () => {
      if (deleteBehavior === 'throw') {
        throw new Error('Transaction failed to commit');
      }
      return false;
    },
  } as unknown as BaseEntity;
}

describe('push delete of a row an earlier delete removed', () => {
  let syncEngine: SyncEngine;
  let service: PushService;
  let warnings: string[];

  beforeEach(() => {
    syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfo);
    service = new PushService(syncEngine, {} as UserInfo);
    warnings = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  const run = (marker: FlattenedRecord) =>
    service['processDeleteRecord'](marker, '', {}, { onWarn: (message: string) => warnings.push(message), onError: () => undefined });

  it('reads the row through the push transaction, not the cache, and skips it when it is gone', async () => {
    const cached = vi.spyOn(syncEngine, 'LoadEntity').mockResolvedValue(rowEntity('false'));
    const fromDatabase = vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValue(null);
    const marker = deleteMarker();

    const result = await run(marker);

    expect(result.status).toBe('skipped');
    expect(fromDatabase).toHaveBeenCalledWith('MJ: AI Prompt Models', { ID: MODEL_ID }, fakeHost);
    expect(cached).not.toHaveBeenCalled();
    expect(warnings).toEqual([`Record not found for deletion: MJ: AI Prompt Models with primaryKey {ID=${MODEL_ID}}`]);
    expect(marker.record.deleteRecord?.notFound).toBe(true);
  });

  it('skips with a warning when the delete fails because the row is already gone', async () => {
    vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValueOnce(rowEntity('false')).mockResolvedValueOnce(null);

    const result = await run(deleteMarker());

    expect(result.status).toBe('skipped');
    expect(warnings[0]).toContain('Record was already gone when it was deleted');
  });

  it('skips when the delete throws and the row is gone', async () => {
    vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValueOnce(rowEntity('throw')).mockResolvedValueOnce(null);

    expect((await run(deleteMarker())).status).toBe('skipped');
  });

  it('still fails when the delete fails and the row is still there', async () => {
    const row = rowEntity('throw');
    vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValue(row);

    await expect(run(deleteMarker())).rejects.toThrow('Transaction failed to commit');
  });
});
