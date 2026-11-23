/**
 * Tests for the Phase 5 list actions: MoveListMembersAction and
 * BulkUpdateListItemStatusAction. Same mocking strategy as the earlier
 * lists-phase{1,2}.actions.test.ts files.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runViewMock = vi.fn();
const getEntityObjectMock = vi.fn();
const computeDeltaMock = vi.fn();

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
    GetEntityObject(name: string) {
      return getEntityObjectMock(name);
    }
  }
  return { Metadata, RunView, LogError: () => {} };
});

vi.mock('@memberjunction/lists', () => ({
  ListOperations: class {
    ComputeDelta = computeDeltaMock;
  },
}));

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class {
    protected async InternalRunAction(_p: unknown): Promise<unknown> {
      return { Success: true, ResultCode: 'SUCCESS', Message: 'noop' };
    }
  },
}));
vi.mock('@memberjunction/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/global')>()),
  RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/core-entities', () => ({
  MJListDetailEntity: class {},
}));

import { BulkUpdateListItemStatusAction } from '../custom/lists/bulk-update-list-item-status.action';
import { MoveListMembersAction } from '../custom/lists/move-list-members.action';

const SOURCE_LIST_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const TARGET_LIST_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const LIST_ID = 'aaaaaaaa-0000-0000-0000-000000000003';

type ParamShape = { Name: string; Type: 'Input' | 'Output'; Value: unknown };

function buildParams(inputs: Array<[string, unknown]>) {
  return {
    Params: inputs.map<ParamShape>(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    ContextUser: { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] },
    Provider: undefined,
  };
}

function getOutput(params: { Params: ParamShape[] }, name: string): unknown {
  return params.Params.find((p) => p.Name === name && p.Type === 'Output')?.Value;
}

describe('Phase 5 list actions', () => {
  beforeEach(() => {
    runViewMock.mockReset();
    getEntityObjectMock.mockReset();
    computeDeltaMock.mockReset();
  });

  describe('MoveListMembersAction', () => {
    it('refuses move mode without ConfirmDrops', async () => {
      const action = new MoveListMembersAction();
      const params = buildParams([
        ['SourceListID', SOURCE_LIST_ID],
        ['TargetListID', TARGET_LIST_ID],
        ['RecordIDs', JSON.stringify(['a'])],
        ['Mode', 'move'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('DROP_NOT_CONFIRMED');
    });

    it('copies without removing when Mode=copy', async () => {
      // First RunView call: check existing membership in target → empty
      runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });
      getEntityObjectMock.mockResolvedValue({
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: { CompleteMessage: '' },
        ListID: '',
        RecordID: '',
        Sequence: 0,
      });
      const action = new MoveListMembersAction();
      const params = buildParams([
        ['SourceListID', SOURCE_LIST_ID],
        ['TargetListID', TARGET_LIST_ID],
        ['RecordIDs', JSON.stringify(['a', 'b'])],
        ['Mode', 'copy'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(true);
      expect(getOutput(params, 'Added')).toBe(2);
      expect(getOutput(params, 'Removed')).toBe(0);
    });

    it('returns MISSING_PARAMETER without SourceListID', async () => {
      const action = new MoveListMembersAction();
      const params = buildParams([
        ['TargetListID', TARGET_LIST_ID],
        ['RecordIDs', JSON.stringify(['a'])],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('rejects an unknown Mode', async () => {
      const action = new MoveListMembersAction();
      const params = buildParams([
        ['SourceListID', 's'],
        ['TargetListID', 't'],
        ['RecordIDs', JSON.stringify(['a'])],
        ['Mode', 'swap'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });

    it('rejects empty RecordIDs', async () => {
      const action = new MoveListMembersAction();
      const params = buildParams([
        ['SourceListID', 's'],
        ['TargetListID', 't'],
        ['RecordIDs', JSON.stringify([])],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });
  });

  describe('BulkUpdateListItemStatusAction', () => {
    it('updates all matching detail rows', async () => {
      const row1 = {
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: { CompleteMessage: '' },
        RecordID: 'a',
        Status: '',
      };
      const row2 = {
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: { CompleteMessage: '' },
        RecordID: 'b',
        Status: '',
      };
      runViewMock.mockResolvedValue({ Success: true, Results: [row1, row2] });
      const action = new BulkUpdateListItemStatusAction();
      const params = buildParams([
        ['ListID', LIST_ID],
        ['RecordIDs', JSON.stringify(['a', 'b'])],
        ['NewStatus', 'Complete'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(true);
      expect(row1.Status).toBe('Complete');
      expect(row2.Status).toBe('Complete');
      expect(getOutput(params, 'Updated')).toBe(2);
      expect(getOutput(params, 'Failed')).toBe(0);
    });

    it('rejects invalid NewStatus', async () => {
      const action = new BulkUpdateListItemStatusAction();
      const params = buildParams([
        ['ListID', LIST_ID],
        ['RecordIDs', JSON.stringify(['a'])],
        ['NewStatus', 'Banana'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });

    it('reports PARTIAL_SUCCESS when some saves fail', async () => {
      const rowOk = {
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: { CompleteMessage: '' },
        RecordID: 'a',
        Status: '',
      };
      const rowFail = {
        Save: vi.fn().mockResolvedValue(false),
        LatestResult: { CompleteMessage: 'constraint failure' },
        RecordID: 'b',
        Status: '',
      };
      runViewMock.mockResolvedValue({ Success: true, Results: [rowOk, rowFail] });
      const action = new BulkUpdateListItemStatusAction();
      const params = buildParams([
        ['ListID', LIST_ID],
        ['RecordIDs', JSON.stringify(['a', 'b'])],
        ['NewStatus', 'Active'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('PARTIAL_SUCCESS');
      expect(getOutput(params, 'Updated')).toBe(1);
      expect(getOutput(params, 'Failed')).toBe(1);
    });
  });

  describe('list ID filters', () => {
    const marker = "' OR '1'='1";
    const notAUuid = `11111111-2222-3333-4444-555555555555${marker}`;
    const goodId = '11111111-2222-3333-4444-555555555555';
    const filtersWithMarker = (): string[] =>
      runViewMock.mock.calls
        .map((c) => String((c[0] as { ExtraFilter?: string }).ExtraFilter ?? ''))
        .filter((f) => f.includes(marker));

    it('Bulk Update List Item Status refuses a ListID that is not a UUID before any filter is built', async () => {
      runViewMock.mockResolvedValue({ Success: true, Results: [] });
      const params = buildParams([
        ['ListID', notAUuid],
        ['RecordIDs', JSON.stringify(['a'])],
        ['NewStatus', 'Complete'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (new BulkUpdateListItemStatusAction() as any).InternalRunAction(params);
      expect(filtersWithMarker()).toEqual([]);
      expect(result.Success).toBe(false);
    });

    it('Bulk Update List Item Status does not return the data provider error text', async () => {
      runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'provider-detail-marker' });
      const params = buildParams([
        ['ListID', goodId],
        ['RecordIDs', JSON.stringify(['a'])],
        ['NewStatus', 'Complete'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (new BulkUpdateListItemStatusAction() as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.Message).not.toContain('provider-detail-marker');
    });

    it('Move List Members refuses a TargetListID that is not a UUID before any filter is built', async () => {
      runViewMock.mockResolvedValue({ Success: true, Results: [] });
      getEntityObjectMock.mockResolvedValue({ NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true), LatestResult: { CompleteMessage: '' } });
      const params = buildParams([
        ['SourceListID', goodId],
        ['TargetListID', notAUuid],
        ['RecordIDs', JSON.stringify(['a'])],
        ['Mode', 'copy'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (new MoveListMembersAction() as any).InternalRunAction(params);
      expect(filtersWithMarker()).toEqual([]);
      expect(result.Success).toBe(false);
    });

    it('Move List Members refuses a SourceListID that is not a UUID before any filter is built', async () => {
      runViewMock.mockResolvedValue({ Success: true, Results: [] });
      computeDeltaMock.mockResolvedValue({ ToAdd: [], ToRemove: [], Unchanged: [], Counts: { Add: 0, Remove: 0, Unchanged: 0 } });
      getEntityObjectMock.mockResolvedValue({ NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true), LatestResult: { CompleteMessage: '' } });
      const params = buildParams([
        ['SourceListID', notAUuid],
        ['TargetListID', goodId],
        ['RecordIDs', JSON.stringify(['a'])],
        ['Mode', 'move'],
        ['ConfirmDrops', true],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (new MoveListMembersAction() as any).InternalRunAction(params);
      expect(filtersWithMarker()).toEqual([]);
      expect(result.Success).toBe(false);
    });
  });
});
