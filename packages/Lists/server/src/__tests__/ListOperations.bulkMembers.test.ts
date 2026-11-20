/**
 * Tests for the server-side bulk member operations of `ListOperations`: add, remove, duplicate,
 * copy/move and status updates. `@memberjunction/core` is mocked with an in-memory store of
 * lists and list details so each test can check the rows written and the lookups made.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface StoredList {
  ID: string;
  Name: string;
  Description: string | null;
  EntityID: string;
  CategoryID: string | null;
  UserID: string;
}

interface StoredDetail {
  ID: string;
  ListID: string;
  RecordID: string;
  Sequence: number;
  Status: string;
}

const store = vi.hoisted(() => ({
  lists: new Map<string, StoredList>(),
  details: [] as StoredDetail[],
  lookupFilters: [] as string[],
  failInsertFor: new Set<string>(),
  nextId: 1,
}));

const STATUS_VALUES = ['Active', 'Complete', 'Disabled', 'Error', 'Other', 'Pending', 'Rejected'];

vi.mock('@memberjunction/core', () => {
  /** Reads `ListID='x'` and the optional `RecordID IN (...)` out of a filter. */
  function parseFilter(filter: string): { listId: string; recordIds: string[] | null } {
    const listId = /ListID\s*=\s*'([^']*)'/.exec(filter)?.[1] ?? '';
    const inMatch = /RecordID IN \((.*)\)/.exec(filter);
    const recordIds = inMatch ? inMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '').replace(/''/g, "'")) : null;
    return { listId, recordIds };
  }

  function detailObject(row: StoredDetail) {
    return {
      get ID() { return row.ID; },
      get ListID() { return row.ListID; },
      get RecordID() { return row.RecordID; },
      get Sequence() { return row.Sequence; },
      Status: row.Status,
      LatestResult: { CompleteMessage: '' },
      async Save() {
        row.Status = this.Status;
        return true;
      },
      async Delete() {
        store.details = store.details.filter((d) => d !== row);
        return true;
      },
    };
  }

  function newDetail() {
    return {
      ID: '',
      ListID: '',
      RecordID: '',
      Sequence: 0,
      Status: 'Pending',
      LatestResult: { CompleteMessage: 'insert failed' },
      NewRecord() {},
      async Save() {
        if (store.failInsertFor.has(this.RecordID)) return false;
        this.ID = `d${store.nextId++}`;
        store.details.push({ ID: this.ID, ListID: this.ListID, RecordID: this.RecordID, Sequence: this.Sequence, Status: this.Status });
        return true;
      },
    };
  }

  function listObject() {
    return {
      ID: '',
      Name: '',
      Description: null as string | null,
      EntityID: '',
      CategoryID: null as string | null,
      UserID: '',
      LatestResult: { CompleteMessage: '' },
      NewRecord() {},
      async Load(id: string) {
        const found = store.lists.get(id);
        if (!found) return false;
        Object.assign(this, found);
        return true;
      },
      async Save() {
        if (!this.ID) this.ID = `list-new-${store.nextId++}`;
        store.lists.set(this.ID, {
          ID: this.ID, Name: this.Name, Description: this.Description, EntityID: this.EntityID,
          CategoryID: this.CategoryID, UserID: this.UserID,
        });
        return true;
      },
    };
  }

  class RunView {
    static FromMetadataProvider() {
      return new RunView();
    }
    async RunView(params: { EntityName: string; ExtraFilter: string; ResultType: string; OrderBy?: string }) {
      store.lookupFilters.push(params.ExtraFilter);
      const { listId, recordIds } = parseFilter(params.ExtraFilter);
      let rows = store.details.filter((d) => d.ListID === listId && (!recordIds || recordIds.includes(d.RecordID)));
      if (params.OrderBy) rows = [...rows].sort((a, b) => a.Sequence - b.Sequence);
      const results = params.ResultType === 'entity_object' ? rows.map(detailObject) : rows.map((r) => ({ ...r }));
      return { Success: true, Results: results, RowCount: results.length };
    }
  }

  class Metadata {
    static get Provider() {
      return undefined;
    }
    EntityByName(name: string) {
      if (name !== 'MJ: List Details') return undefined;
      return { Name: name, Fields: [{ Name: 'Status', EntityFieldValues: STATUS_VALUES.map((Value) => ({ Value })) }] };
    }
    EntityByID() {
      return undefined;
    }
    async GetEntityObject(entityName: string) {
      if (entityName === 'MJ: Lists') return listObject();
      if (entityName === 'MJ: List Details') return newDetail();
      throw new Error(`unexpected entity ${entityName}`);
    }
  }

  return { CompositeKey: class {}, RunView, Metadata, LogError: () => {}, LogStatus: () => {} };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJListDetailEntity: class {},
  MJListEntity: class {},
}));

import { ListOperations } from '../ListOperations';

const CTX_USER = { ID: 'user-1', Name: 'Test', Email: 't@x', UserRoles: [] };

function addList(id: string, entityId = 'entity-contacts', extra: Partial<StoredList> = {}): void {
  store.lists.set(id, {
    ID: id, Name: `List ${id}`, Description: null, EntityID: entityId, CategoryID: null, UserID: 'owner', ...extra,
  });
}

function addMembers(listId: string, recordIds: string[], status = 'Active'): void {
  recordIds.forEach((recordId, i) => {
    store.details.push({ ID: `seed-${listId}-${recordId}`, ListID: listId, RecordID: recordId, Sequence: i + 1, Status: status });
  });
}

function membersOf(listId: string): string[] {
  return store.details.filter((d) => d.ListID === listId).map((d) => d.RecordID).sort();
}

function idRange(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `rec-${i}`);
}

/** The number of quoted IDs inside the `RecordID IN (...)` of a filter. */
function inListSize(filter: string): number {
  const match = /RecordID IN \((.*)\)/.exec(filter);
  return match ? match[1].split(',').length : 0;
}

function ops(): ListOperations {
  return new ListOperations(CTX_USER as never);
}

describe('ListOperations bulk member operations', () => {
  beforeEach(() => {
    store.lists.clear();
    store.details = [];
    store.lookupFilters = [];
    store.failInsertFor.clear();
    store.nextId = 1;
  });

  describe('AddRecordsToList', () => {
    it('inserts only the records the list does not hold yet, once each', async () => {
      addList('L1');
      addMembers('L1', ['a', 'b']);

      const result = await ops().AddRecordsToList('L1', ['a', 'c', 'd', 'c']);

      expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS', TargetListId: 'L1' });
      expect(result.Counts).toMatchObject({ Added: 2, Removed: 0, Failed: 0 });
      expect(membersOf('L1')).toEqual(['a', 'b', 'c', 'd']);
    });

it('saves the given Status and the input position as Sequence', async () => {
      addList('L1');
      addMembers('L1', ['b']);

      const result = await ops().AddRecordsToList('L1', ['a', 'b', 'c'], { Status: 'Active', SequenceFromOrder: true });

      expect(result.Counts).toMatchObject({ Added: 2, Failed: 0 });
      const added = store.details.filter((d) => d.ListID === 'L1' && d.RecordID !== 'b');
      expect(added.map((d) => [d.RecordID, d.Sequence, d.Status]).sort()).toEqual([['a', 0, 'Active'], ['c', 2, 'Active']]);
    });

    it('refuses a Status that is not in the field value list and adds nothing', async () => {
      addList('L1');

      const result = await ops().AddRecordsToList('L1', ['a'], { Status: 'Nope' as never });

      expect(result.Success).toBe(false);
      expect(membersOf('L1')).toEqual([]);
    });

    it('returns TARGET_NOT_FOUND for a missing list', async () => {
      const result = await ops().AddRecordsToList('missing', ['a']);
      expect(result).toMatchObject({ Success: false, ResultCode: 'TARGET_NOT_FOUND' });
      expect(store.details).toHaveLength(0);
    });

    it('looks up existing members in chunks of at most 500 IDs', async () => {
      addList('L1');
      const ids = idRange(1200);

      const result = await ops().AddRecordsToList('L1', ids);

      const lookups = store.lookupFilters.filter((f) => f.includes('RecordID IN'));
      expect(lookups).toHaveLength(3);
      expect(Math.max(...lookups.map(inListSize))).toBeLessThanOrEqual(500);
      expect(result.Counts?.Added).toBe(1200);
    });

    it('escapes quotes in record IDs', async () => {
      addList('L1');
      addMembers('L1', ["o'brien"]);

      const result = await ops().AddRecordsToList('L1', ["o'brien"]);

      expect(store.lookupFilters.some((f) => f.includes("'o''brien'"))).toBe(true);
      expect(result.Counts?.Added).toBe(0);
    });
  });

  describe('RemoveRecordsFromList', () => {
    it('deletes the matching rows of that list only, looking them up in chunks', async () => {
      addList('L1');
      addList('L2');
      const ids = idRange(1200);
      addMembers('L1', ids);
      addMembers('L2', ['rec-0']);

      const result = await ops().RemoveRecordsFromList('L1', ids.slice(0, 1100));

      expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS', TargetListId: 'L1' });
      expect(result.Counts).toMatchObject({ Added: 0, Removed: 1100, Failed: 0 });
      expect(membersOf('L1')).toHaveLength(100);
      expect(membersOf('L2')).toEqual(['rec-0']);
      const lookups = store.lookupFilters.filter((f) => f.includes('RecordID IN'));
      expect(lookups).toHaveLength(3);
      expect(Math.max(...lookups.map(inListSize))).toBeLessThanOrEqual(500);
    });
  });

  describe('DuplicateList', () => {
    it('creates a plain copy owned by the caller with every member and its Sequence', async () => {
      addList('L1', 'entity-contacts', { Name: 'Donors', Description: 'Big ones', CategoryID: 'cat-1' });
      store.details.push(
        { ID: 's1', ListID: 'L1', RecordID: 'a', Sequence: 5, Status: 'Active' },
        { ID: 's2', ListID: 'L1', RecordID: 'b', Sequence: 2, Status: 'Active' },
      );

      const result = await ops().DuplicateList('L1');

      expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS' });
      expect(result.CreatedListId).toBeTruthy();
      expect(result.TargetListId).toBe(result.CreatedListId);
      expect(result.Counts?.Added).toBe(2);
      const copy = store.lists.get(result.CreatedListId!);
      expect(copy).toMatchObject({
        Name: 'Donors (Copy)', Description: 'Big ones', EntityID: 'entity-contacts', CategoryID: 'cat-1', UserID: 'user-1',
      });
      const copied = store.details.filter((d) => d.ListID === result.CreatedListId);
      expect(copied.map((d) => [d.RecordID, d.Sequence]).sort()).toEqual([['a', 5], ['b', 2]]);
    });

    it('uses the given name', async () => {
      addList('L1');
      const result = await ops().DuplicateList('L1', { ListName: 'Renamed' });
      expect(store.lists.get(result.CreatedListId!)?.Name).toBe('Renamed');
    });

    it('returns TARGET_NOT_FOUND for a missing list', async () => {
      const result = await ops().DuplicateList('missing');
      expect(result).toMatchObject({ Success: false, ResultCode: 'TARGET_NOT_FOUND' });
      expect(store.lists.size).toBe(0);
    });
  });

  describe('CopyRecordsToList', () => {
    it('adds the records the target lacks and leaves the source when RemoveFromSource is false', async () => {
      addList('SRC');
      addList('DST');
      addMembers('SRC', ['a', 'b']);
      addMembers('DST', ['a']);

      const result = await ops().CopyRecordsToList('SRC', 'DST', ['a', 'b'], { RemoveFromSource: false });

      expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS', TargetListId: 'DST' });
      expect(result.Counts).toMatchObject({ Added: 1, Removed: 0, Failed: 0 });
      expect(membersOf('DST')).toEqual(['a', 'b']);
      expect(membersOf('SRC')).toEqual(['a', 'b']);
    });

    it('moves the records when RemoveFromSource is true', async () => {
      addList('SRC');
      addList('DST');
      addMembers('SRC', ['a', 'b', 'c']);

      const result = await ops().CopyRecordsToList('SRC', 'DST', ['a', 'b'], { RemoveFromSource: true });

      expect(result.Counts).toMatchObject({ Added: 2, Removed: 2, Failed: 0 });
      expect(membersOf('DST')).toEqual(['a', 'b']);
      expect(membersOf('SRC')).toEqual(['c']);
    });

    it('removes nothing from the source when an add fails', async () => {
      addList('SRC');
      addList('DST');
      addMembers('SRC', ['a', 'b']);
      store.failInsertFor.add('b');

      const result = await ops().CopyRecordsToList('SRC', 'DST', ['a', 'b'], { RemoveFromSource: true });

      expect(result).toMatchObject({ Success: false, ResultCode: 'PARTIAL_SUCCESS' });
      expect(result.Counts).toMatchObject({ Added: 1, Removed: 0, Failed: 1 });
      expect(membersOf('SRC')).toEqual(['a', 'b']);
    });

    it('refuses lists of different entities', async () => {
      addList('SRC', 'entity-contacts');
      addList('DST', 'entity-accounts');
      addMembers('SRC', ['a']);

      const result = await ops().CopyRecordsToList('SRC', 'DST', ['a'], { RemoveFromSource: false });

      expect(result).toMatchObject({ Success: false, ResultCode: 'UNEXPECTED_ERROR' });
      expect(membersOf('DST')).toEqual([]);
    });

    it('returns TARGET_NOT_FOUND when the target list is missing', async () => {
      addList('SRC');
      const result = await ops().CopyRecordsToList('SRC', 'missing', ['a'], { RemoveFromSource: false });
      expect(result).toMatchObject({ Success: false, ResultCode: 'TARGET_NOT_FOUND' });
    });
  });

  describe('SetRecordStatus', () => {
    it('sets Status on the given members and reports them in Counts.Updated', async () => {
      addList('L1');
      addMembers('L1', ['a', 'b', 'c']);

      const result = await ops().SetRecordStatus('L1', ['a', 'b'], 'Complete');

      expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS', TargetListId: 'L1' });
      expect(result.Counts).toMatchObject({ Added: 0, Removed: 0, Failed: 0, Updated: 2 });
      const statuses = Object.fromEntries(store.details.map((d) => [d.RecordID, d.Status]));
      expect(statuses).toEqual({ a: 'Complete', b: 'Complete', c: 'Active' });
    });

    it('refuses a status that is not in the field value list', async () => {
      addList('L1');
      addMembers('L1', ['a']);

      const result = await ops().SetRecordStatus('L1', ['a'], 'Bogus' as never);

      expect(result).toMatchObject({ Success: false, ResultCode: 'UNEXPECTED_ERROR' });
      expect(result.Message).toMatch(/Bogus/);
      expect(store.details[0].Status).toBe('Active');
    });
  });
});
