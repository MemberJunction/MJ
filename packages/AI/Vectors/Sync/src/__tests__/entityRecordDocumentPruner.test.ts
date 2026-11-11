import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  Metadata: { Provider: null },
  EntityPermissionType: { Read: 'Read', Create: 'Create', Update: 'Update', Delete: 'Delete' },
}));

import type { EntityInfo } from '@memberjunction/core';
import {
  OrphanPruneDenial,
  PlanRecordDocumentPrune,
  RecordDocumentDeleteDenial,
  RemoveRecordDocuments,
  SplitDuplicateRecordDocuments,
  type PrunableRecordDocument,
} from '../models/entityRecordDocumentPruner';

const USER = { ID: 'u1' } as UserInfo;

function row(ID: string, RecordID: string, VectorID: string | null, updated = '2026-01-01T00:00:00Z'): PrunableRecordDocument {
  return { ID, RecordID, VectorID, __mj_UpdatedAt: new Date(updated) };
}

/** The `MJ: Entity Record Documents` entity as the permission check reads it. */
function erdEntity(canDelete: boolean, deleteRowFilter = ''): unknown {
  return {
    Name: 'MJ: Entity Record Documents',
    GetUserPermisions: () => ({ CanDelete: canDelete }),
    GetEffectiveRowFilterWhereClause: vi.fn(() => deleteRowFilter),
  };
}

/**
 * A metadata provider whose Entity Record Documents load and delete from an in-memory set. The
 * user may delete them unless `canDelete` is false or `deleteRowFilter` is set.
 */
function fakeProvider(existing: string[], failDelete: string[] = [], canDelete = true, deleteRowFilter = ''): { md: IMetadataProvider; deleted: string[] } {
  const rows = new Set(existing);
  const deleted: string[] = [];
  const md = {
    Entities: [erdEntity(canDelete, deleteRowFilter)],
    GetEntityObject: async () => {
      let id = '';
      return {
        get ID() { return id; },
        LatestResult: { CompleteMessage: 'refused' },
        Load: async (key: string) => { id = key; return rows.has(key); },
        Delete: async () => {
          if (failDelete.includes(id)) return false;
          rows.delete(id);
          deleted.push(id);
          return true;
        },
      };
    },
  } as unknown as IMetadataProvider;
  return { md, deleted };
}

function fakeVectorDB(readOnly = false, success = true): { db: VectorDBBase; calls: VectorRecord[][] } {
  const calls: VectorRecord[][] = [];
  const db = {
    IsReadOnly: readOnly,
    DeleteRecords: vi.fn(async (records: VectorRecord[]) => {
      calls.push(records);
      return { success, message: success ? '' : 'store refused', data: null };
    }),
  } as unknown as VectorDBBase;
  return { db, calls };
}

describe('SplitDuplicateRecordDocuments', () => {
  it('keeps the newest row per RecordID and returns the rest as duplicates', () => {
    const { Keep, Duplicates } = SplitDuplicateRecordDocuments([
      row('a1', 'r1', 'v1', '2026-01-01T00:00:00Z'),
      row('a2', 'r1', 'v1', '2026-03-01T00:00:00Z'),
      row('a3', 'r1', 'v9', '2026-02-01T00:00:00Z'),
      row('b1', 'r2', 'v2'),
    ]);
    expect(Keep.get('r1')?.ID).toBe('a2');
    expect(Keep.get('r2')?.ID).toBe('b1');
    expect(Duplicates.map(d => d.ID).sort()).toEqual(['a1', 'a3']);
  });
});

describe('PlanRecordDocumentPrune', () => {
  it('removes rows for records the run did not see, and keeps the rest', () => {
    const plan = PlanRecordDocumentPrune(
      [row('a', 'r1', 'v1'), row('b', 'r2', 'v2'), row('c', 'gone', 'v3')],
      new Set(['r1', 'r2'])
    );
    expect(plan.Remove.map(r => r.ID)).toEqual(['c']);
    expect([...plan.KeepVectorIDs].sort()).toEqual(['v1', 'v2']);
  });

  it('also removes duplicate rows for a seen record, keeping the newest', () => {
    const plan = PlanRecordDocumentPrune(
      [row('old', 'r1', 'v1', '2026-01-01T00:00:00Z'), row('new', 'r1', 'v1', '2026-02-01T00:00:00Z')],
      new Set(['r1'])
    );
    expect(plan.Remove.map(r => r.ID)).toEqual(['old']);
    // the kept row uses v1, so removing the duplicate must not remove the vector
    expect(plan.KeepVectorIDs.has('v1')).toBe(true);
  });

  it('removes nothing when every stored record was seen once', () => {
    const plan = PlanRecordDocumentPrune([row('a', 'r1', 'v1')], new Set(['r1']));
    expect(plan.Remove).toEqual([]);
  });
});

describe('RemoveRecordDocuments', () => {
  it('deletes stored vectors by VectorID, then the rows', async () => {
    const { md, deleted } = fakeProvider(['a', 'b', 'c']);
    const { db, calls } = fakeVectorDB();
    const result = await RemoveRecordDocuments(
      [row('a', 'r1', 'v1'), row('b', 'r2', null), row('c', 'r3', 'v3')],
      { VectorDB: db, IndexName: 'idx', ProviderConfig: { namespace: 'ns' } },
      USER,
      md
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].map(r => r.id)).toEqual(['v1', 'v3']); // the row with no VectorID makes no vector call
    expect(vi.mocked(db.DeleteRecords).mock.calls[0][1]).toBe('idx');
    expect(vi.mocked(db.DeleteRecords).mock.calls[0][2]).toEqual({ namespace: 'ns' });
    expect(deleted.sort()).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ RemovedRows: 3, RemovedVectors: 2, Failed: 0 });
  });

  it('batches vector deletes 100 at a time', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `e${i}`);
    const { md } = fakeProvider(ids);
    const { db, calls } = fakeVectorDB();
    await RemoveRecordDocuments(ids.map(id => row(id, id, `v-${id}`)), { VectorDB: db }, USER, md);
    expect(calls.map(c => c.length)).toEqual([100, 100, 50]);
  });

  it('a read-only driver gets no vector call: only the rows are deleted', async () => {
    const { md, deleted } = fakeProvider(['a']);
    const { db, calls } = fakeVectorDB(true);
    const result = await RemoveRecordDocuments([row('a', 'r1', 'v1')], { VectorDB: db }, USER, md);
    expect(calls).toHaveLength(0);
    expect(deleted).toEqual(['a']);
    expect(result.RemovedVectors).toBe(0);
  });

  it('does not delete a vector a kept row still uses', async () => {
    const { md } = fakeProvider(['dup']);
    const { db, calls } = fakeVectorDB();
    await RemoveRecordDocuments([row('dup', 'r1', 'shared')], { VectorDB: db }, USER, md, new Set(['shared']));
    expect(calls).toHaveLength(0);
  });

  it('counts failures instead of throwing', async () => {
    const { md } = fakeProvider(['a', 'b'], ['b']);
    const { db } = fakeVectorDB(false, false);
    const result = await RemoveRecordDocuments([row('a', 'r1', 'v1'), row('b', 'r2', 'v2')], { VectorDB: db }, USER, md);
    expect(result.RemovedRows).toBe(1);
    expect(result.Failed).toBe(2); // the vector batch and row b
  });

  it('treats a row that is already gone as removed', async () => {
    const { md } = fakeProvider([]);
    const result = await RemoveRecordDocuments([row('a', 'r1', null)], { VectorDB: null }, USER, md);
    expect(result).toEqual({ RemovedRows: 1, RemovedVectors: 0, Failed: 0 });
  });
});

describe('prune permission checks', () => {
  function providerWith(canDelete: boolean | null, deleteRowFilter = ''): IMetadataProvider {
    const entities = canDelete == null ? [] : [erdEntity(canDelete, deleteRowFilter)];
    return { Entities: entities } as unknown as IMetadataProvider;
  }
  function sourceEntity(rowFilter: string): EntityInfo {
    return { Name: 'Members', GetEffectiveRowFilterWhereClause: vi.fn(() => rowFilter) } as unknown as EntityInfo;
  }

  it('allows removal when the user can delete Entity Record Documents', () => {
    expect(RecordDocumentDeleteDenial(USER, providerWith(true))).toBeNull();
  });

  it('refuses removal when the user cannot delete Entity Record Documents, or the entity is missing', () => {
    expect(RecordDocumentDeleteDenial(USER, providerWith(false))).toMatch(/cannot delete/);
    expect(RecordDocumentDeleteDenial(USER, providerWith(null))).toMatch(/not found/);
  });

  it('refuses removal when deletes of Entity Record Documents are row-filtered for the user', () => {
    const md = providerWith(true, "(CreatedByUserID='u1')");
    expect(RecordDocumentDeleteDenial(USER, md)).toMatch(/row-filtered/);
    const erd = (md.Entities as unknown as Array<{ GetEffectiveRowFilterWhereClause: ReturnType<typeof vi.fn> }>)[0];
    expect(erd.GetEffectiveRowFilterWhereClause).toHaveBeenCalledWith(USER, 'Delete', '');
  });

  it('RemoveRecordDocuments removes no row and no vector for a user the check refuses', async () => {
    for (const [canDelete, filter] of [[false, ''], [true, "(CreatedByUserID='u1')"]] as const) {
      const { md, deleted } = fakeProvider(['a', 'b'], [], canDelete, filter);
      const { db, calls } = fakeVectorDB();
      const result = await RemoveRecordDocuments([row('a', 'r1', 'v1'), row('b', 'r2', 'v2')], { VectorDB: db }, USER, md);
      expect(result).toEqual({ RemovedRows: 0, RemovedVectors: 0, Failed: 2 });
      expect(deleted).toEqual([]);
      expect(calls).toEqual([]);
    }
  });

  it('allows the orphan prune only when reads of the source entity are unfiltered', () => {
    const unfiltered = sourceEntity('');
    expect(OrphanPruneDenial(unfiltered, USER, providerWith(true))).toBeNull();
    expect(unfiltered.GetEffectiveRowFilterWhereClause).toHaveBeenCalledWith(USER, 'Read', '');
    expect(OrphanPruneDenial(sourceEntity("(OwnerID='u1')"), USER, providerWith(true))).toMatch(/row-filtered/);
  });

  it('refuses the orphan prune without Delete permission, even with unfiltered reads', () => {
    expect(OrphanPruneDenial(sourceEntity(''), USER, providerWith(false))).toMatch(/cannot delete/);
  });
});
