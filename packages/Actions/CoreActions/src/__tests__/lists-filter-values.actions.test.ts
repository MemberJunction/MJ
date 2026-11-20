/**
 * List actions validate list IDs and escape record IDs and status values before they build a
 * RunView filter, and do not return data provider error text. RunView is mocked at the edge.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runViewMock = vi.fn();

vi.mock('@memberjunction/core', () => {
  class RunView {
    constructor(_p?: unknown) {}
    static FromMetadataProvider() {
      return new RunView();
    }
    RunView(params: unknown) {
      return runViewMock(params);
    }
  }
  class Metadata {
    static Provider = undefined;
    GetEntityObject() {
      return Promise.resolve({ NewRecord: () => {}, Save: () => Promise.resolve(true) });
    }
  }
  return { Metadata, RunView, LogError: () => {}, CompositeKey: class {}, EntityInfo: class {} };
});

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class {},
}));
vi.mock('@memberjunction/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/global')>()),
  RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/core-entities', () => ({
  MJListEntity: class {},
  MJListDetailEntity: class {},
}));

import { RemoveRecordsFromListAction } from '../custom/lists/remove-records-from-list.action';
import { UpdateListItemStatusAction } from '../custom/lists/update-list-item-status.action';
import { AddRecordsToListAction } from '../custom/lists/add-records-to-list.action';
import { GetListRecordsAction } from '../custom/lists/get-list-records.action';
import { GetRecordListMembershipAction } from '../custom/lists/get-record-list-membership.action';

type ParamShape = { Name: string; Type: 'Input' | 'Output'; Value: unknown };
interface Runnable {
  InternalRunAction(p: unknown): Promise<{ Success: boolean; Message?: string }>;
}

const LIST_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const MARKER = "' OR '1'='1";
const NOT_A_UUID = `${LIST_ID}${MARKER}`;
const QUOTED_RECORD = "rec'1";

function buildParams(inputs: Array<[string, unknown]>) {
  return {
    Params: inputs.map<ParamShape>(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    ContextUser: { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] },
    Provider: undefined,
  };
}

function run(action: object, inputs: Array<[string, unknown]>) {
  return (action as Runnable).InternalRunAction(buildParams(inputs));
}

function filters(): string[] {
  return runViewMock.mock.calls.map((c) => String((c[0] as { ExtraFilter?: string }).ExtraFilter ?? ''));
}

const okEmpty = { Success: true, Results: [] };

describe('list action filter values', () => {
  beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue(okEmpty);
  });

  describe('Remove Records from List', () => {
    it('refuses a ListID that is not a UUID before any filter is built', async () => {
      const result = await run(new RemoveRecordsFromListAction(), [['ListID', NOT_A_UUID], ['RemoveAll', true]]);
      expect(filters().filter((f) => f.includes(MARKER))).toEqual([]);
      expect(result.Success).toBe(false);
    });

    it('keeps a quote in a record ID and a status inside the string literal', async () => {
      await run(new RemoveRecordsFromListAction(), [['ListID', LIST_ID], ['RecordIDs', [QUOTED_RECORD]], ['FilterByStatus', "Act'ive"]]);
      expect(filters()[0]).toContain("RecordID IN ('rec''1')");
      expect(filters()[0]).toContain("Status = 'Act''ive'");
    });

    it('does not return the data provider error text', async () => {
      runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'provider-detail-marker' });
      const result = await run(new RemoveRecordsFromListAction(), [['ListID', LIST_ID], ['RemoveAll', true]]);
      expect(result.Message).not.toContain('provider-detail-marker');
    });
  });

  describe('Update List Item Status', () => {
    it('refuses a ListID that is not a UUID before any filter is built', async () => {
      const result = await run(new UpdateListItemStatusAction(), [['ListID', NOT_A_UUID], ['NewStatus', 'Active'], ['CurrentStatus', 'Pending']]);
      expect(filters().filter((f) => f.includes(MARKER))).toEqual([]);
      expect(result.Success).toBe(false);
    });

    it('keeps a quote in a record ID inside the string literal', async () => {
      await run(new UpdateListItemStatusAction(), [['ListID', LIST_ID], ['NewStatus', 'Active'], ['RecordIDs', [QUOTED_RECORD]]]);
      expect(filters()[0]).toContain("RecordID IN ('rec''1')");
    });

    it('does not return the data provider error text', async () => {
      runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'provider-detail-marker' });
      const result = await run(new UpdateListItemStatusAction(), [['ListID', LIST_ID], ['NewStatus', 'Active'], ['CurrentStatus', 'Pending']]);
      expect(result.Message).not.toContain('provider-detail-marker');
    });
  });

  describe('Add Records to List', () => {
    it('refuses a ListID that is not a UUID before any filter is built', async () => {
      const result = await run(new AddRecordsToListAction(), [['ListID', NOT_A_UUID], ['RecordIDs', ['r1']]]);
      expect(filters().filter((f) => f.includes(MARKER))).toEqual([]);
      expect(result.Success).toBe(false);
    });

    it('keeps a quote in a record ID inside the string literal', async () => {
      runViewMock.mockImplementation(async (p: { EntityName: string }) =>
        p.EntityName === 'MJ: Lists' ? { Success: true, Results: [{ ID: LIST_ID }] } : okEmpty);
      await run(new AddRecordsToListAction(), [['ListID', LIST_ID], ['RecordIDs', [QUOTED_RECORD]], ['SkipDuplicates', true]]);
      expect(filters().find((f) => f.includes('RecordID IN'))).toContain("RecordID IN ('rec''1')");
    });
  });

  describe('Get List Records', () => {
    it('refuses a ListID that is not a UUID before any filter is built', async () => {
      const result = await run(new GetListRecordsAction(), [['ListID', NOT_A_UUID]]);
      expect(filters().filter((f) => f.includes(MARKER))).toEqual([]);
      expect(result.Success).toBe(false);
    });

    it('keeps a quote in a status inside the string literal', async () => {
      runViewMock.mockImplementation(async (p: { EntityName: string }) =>
        p.EntityName === 'MJ: Lists' ? { Success: true, Results: [{ ID: LIST_ID }] } : okEmpty);
      await run(new GetListRecordsAction(), [['ListID', LIST_ID], ['FilterByStatus', "Act'ive"]]);
      expect(filters().find((f) => f.includes('Status ='))).toContain("Status = 'Act''ive'");
    });

    it('does not return the data provider error text', async () => {
      runViewMock.mockImplementation(async (p: { EntityName: string }) =>
        p.EntityName === 'MJ: Lists' ? { Success: true, Results: [{ ID: LIST_ID }] } : { Success: false, ErrorMessage: 'provider-detail-marker' });
      const result = await run(new GetListRecordsAction(), [['ListID', LIST_ID]]);
      expect(result.Message).not.toContain('provider-detail-marker');
    });
  });

  describe('Get Record List Membership', () => {
    it('keeps a quote in a record ID and an entity name inside the string literal', async () => {
      runViewMock.mockImplementation(async (p: { EntityName: string }) =>
        p.EntityName === 'MJ: Entities' ? { Success: true, Results: [{ ID: LIST_ID }] } : okEmpty);
      await run(new GetRecordListMembershipAction(), [['RecordID', QUOTED_RECORD], ['EntityName', "Bob's"]]);
      expect(filters()).toContain("Name = 'Bob''s'");
      expect(filters()).toContain("RecordID = 'rec''1'");
    });

    it('refuses an EntityID or UserID that is not a UUID before any filter is built', async () => {
      const r1 = await run(new GetRecordListMembershipAction(), [['RecordID', 'r1'], ['EntityID', NOT_A_UUID]]);
      const r2 = await run(new GetRecordListMembershipAction(), [['RecordID', 'r1'], ['EntityID', LIST_ID], ['UserID', NOT_A_UUID]]);
      expect(filters().filter((f) => f.includes(MARKER))).toEqual([]);
      expect(r1.Success).toBe(false);
      expect(r2.Success).toBe(false);
    });

    it('does not return the data provider error text', async () => {
      runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'provider-detail-marker' });
      const result = await run(new GetRecordListMembershipAction(), [['RecordID', 'r1'], ['EntityID', LIST_ID]]);
      expect(result.Message).not.toContain('provider-detail-marker');
    });
  });
});
