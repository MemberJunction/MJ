import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BaseEntityEvent, UserInfo } from '@memberjunction/core';

const engine = vi.hoisted(() => ({
  EntityDocuments: [] as Array<{ EntityID: string; Status: string }>,
  Config: vi.fn(async () => undefined),
}));
const removeRecordVectors = vi.hoisted(() => vi.fn(async () => 2));
const syncerConfig = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@memberjunction/core', () => ({
  BaseEntity: { BaseEventCode: 'BaseEntityEvent' },
  LogError: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => ({
  KnowledgeHubMetadataEngine: { Instance: engine },
}));
vi.mock('@memberjunction/global', () => ({
  MJEventType: { ComponentEvent: 'ComponentEvent' },
  MJGlobal: { Instance: { GetEventListener: vi.fn() } },
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase(),
}));
vi.mock('../models/entityVectorSync', () => ({
  EntityVectorSyncer: class {
    Config = syncerConfig;
    RemoveRecordVectors = removeRecordVectors;
  },
}));

import { EntityVectorDeleteListener } from '../models/entityVectorDeleteListener';

const USER = { ID: 'system' } as UserInfo;

function deleteEvent(entityName: string, entityID: string, recordID: string, type: BaseEntityEvent['type'] = 'delete'): BaseEntityEvent {
  return {
    type,
    baseEntity: {
      EntityInfo: { Name: entityName, ID: entityID },
      PrimaryKey: { ToCompactURLSegment: () => recordID },
    },
  } as unknown as BaseEntityEvent;
}

describe('EntityVectorDeleteListener.CleanupRequestFor', () => {
  it('turns a local delete into a request carrying the stored RecordID form', () => {
    expect(EntityVectorDeleteListener.CleanupRequestFor(deleteEvent('Members', 'E1', 'r1')))
      .toEqual({ EntityID: 'E1', EntityName: 'Members', RecordID: 'r1' });
  });

  it('ignores the Entity Record Documents entity itself, saves, and remote invalidations', () => {
    expect(EntityVectorDeleteListener.CleanupRequestFor(deleteEvent('MJ: Entity Record Documents', 'X', 'r1'))).toBeNull();
    expect(EntityVectorDeleteListener.CleanupRequestFor(deleteEvent('Members', 'E1', 'r1', 'save'))).toBeNull();
    expect(EntityVectorDeleteListener.CleanupRequestFor(deleteEvent('Members', 'E1', 'r1', 'remote-invalidate'))).toBeNull();
  });
});

describe('EntityVectorDeleteListener.Cleanup', () => {
  beforeEach(() => {
    engine.EntityDocuments = [];
    removeRecordVectors.mockClear();
    syncerConfig.mockClear();
  });

  it('does nothing for an entity with no active entity document', async () => {
    engine.EntityDocuments = [{ EntityID: 'E1', Status: 'Inactive' }, { EntityID: 'E2', Status: 'Active' }];
    const removed = await EntityVectorDeleteListener.Cleanup({ EntityID: 'E1', EntityName: 'Members', RecordID: 'r1' }, () => USER);
    expect(removed).toBe(0);
    expect(removeRecordVectors).not.toHaveBeenCalled();
  });

  it('removes the record\'s vectors and Entity Record Documents when the entity has a document', async () => {
    engine.EntityDocuments = [{ EntityID: 'e1', Status: 'Active' }];
    const removed = await EntityVectorDeleteListener.Cleanup({ EntityID: 'E1', EntityName: 'Members', RecordID: 'r1' }, () => USER);
    expect(removed).toBe(2);
    expect(removeRecordVectors).toHaveBeenCalledWith('E1', ['r1'], USER);
  });

  it('never throws: a failing cleanup is logged and reports zero', async () => {
    engine.EntityDocuments = [{ EntityID: 'E1', Status: 'Active' }];
    removeRecordVectors.mockRejectedValueOnce(new Error('vector store down'));
    await expect(EntityVectorDeleteListener.Cleanup({ EntityID: 'E1', EntityName: 'Members', RecordID: 'r1' }, () => USER)).resolves.toBe(0);
  });

  it('skips the cleanup when there is no user to run it as', async () => {
    engine.EntityDocuments = [{ EntityID: 'E1', Status: 'Active' }];
    await expect(EntityVectorDeleteListener.Cleanup({ EntityID: 'E1', EntityName: 'Members', RecordID: 'r1' }, () => undefined)).resolves.toBe(0);
    expect(removeRecordVectors).not.toHaveBeenCalled();
  });
});
