/**
 * Action-level smoke tests for the Phase 1 list actions. The actions are
 * thin parameter-mapping wrappers around `ListOperations`; we mock the
 * core so we can prove the right method is called with the right args
 * without spinning up a database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @memberjunction/lists BEFORE importing the action classes so the
// constructor binding picks up our test double.
const materializeMock = vi.fn();
const refreshMock = vi.fn();
const addViewMock = vi.fn();
const composeSetOpMock = vi.fn();
const applyDeltaMock = vi.fn();

vi.mock('@memberjunction/lists', () => ({
  ListOperations: class {
    MaterializeFromView = materializeMock;
    RefreshFromSource = refreshMock;
    AddViewResultsToList = addViewMock;
    ComputeSetOp = composeSetOpMock;
    ApplyDelta = applyDeltaMock;
  },
}));

// The action base class triggers @RegisterClass on import — keep that
// path as quiet as possible.
vi.mock('@memberjunction/actions', () => ({
  BaseAction: class {
    protected async InternalRunAction(_params: unknown): Promise<unknown> {
      return { Success: true, ResultCode: 'SUCCESS', Message: 'noop' };
    }
  },
}));
vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

import { AddViewResultsToListAction } from '../custom/lists/add-view-results-to-list.action';
import { ComposeListsAction } from '../custom/lists/compose-lists.action';
import { MaterializeListFromViewAction } from '../custom/lists/materialize-list-from-view.action';
import { RefreshListFromSourceAction } from '../custom/lists/refresh-list-from-source.action';

type ParamShape = { Name: string; Type: 'Input' | 'Output'; Value: unknown };

function buildParams(inputs: Array<[string, unknown]>) {
  const params: ParamShape[] = inputs.map(([Name, Value]) => ({ Name, Type: 'Input', Value }));
  return {
    Params: params,
    ContextUser: { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] },
    Provider: undefined,
  };
}

function getOutput(params: { Params: ParamShape[] }, name: string): unknown {
  return params.Params.find((p) => p.Name === name && p.Type === 'Output')?.Value;
}

describe('Phase 1 list actions', () => {
  beforeEach(() => {
    materializeMock.mockReset();
    refreshMock.mockReset();
    addViewMock.mockReset();
    composeSetOpMock.mockReset();
    applyDeltaMock.mockReset();
  });

  describe('MaterializeListFromViewAction', () => {
    it('maps params and delegates to MaterializeFromView', async () => {
      materializeMock.mockResolvedValue({
        Success: true,
        ResultCode: 'SUCCESS',
        Message: 'ok',
        CreatedListId: 'new-list',
        Counts: { Added: 5, Removed: 0, Failed: 0 },
      });
      const action = new MaterializeListFromViewAction();
      const params = buildParams([
        ['ViewID', 'view-1'],
        ['ListName', 'New List'],
        ['Description', 'desc'],
        ['CategoryID', 'cat-1'],
        ['RememberLineage', true],
        ['UseSnapshot', false],
        ['RefreshMode', 'Additive'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(true);
      expect(materializeMock).toHaveBeenCalledWith('view-1', expect.objectContaining({
        ListName: 'New List',
        Description: 'desc',
        CategoryId: 'cat-1',
        RememberLineage: true,
        UseSnapshot: false,
        RefreshMode: 'Additive',
      }));
      expect(getOutput(params, 'CreatedListID')).toBe('new-list');
      expect(getOutput(params, 'Added')).toBe(5);
    });

    it('rejects when required params are missing', async () => {
      const action = new MaterializeListFromViewAction();
      const params = buildParams([['ListName', 'X']]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('MISSING_PARAMETER');
      expect(materializeMock).not.toHaveBeenCalled();
    });

    it('rejects invalid RefreshMode', async () => {
      const action = new MaterializeListFromViewAction();
      const params = buildParams([
        ['ViewID', 'view-1'],
        ['ListName', 'N'],
        ['RefreshMode', 'Bogus'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });
  });

  describe('AddViewResultsToListAction', () => {
    it('passes both IDs through to the core', async () => {
      addViewMock.mockResolvedValue({
        Success: true,
        ResultCode: 'SUCCESS',
        Message: 'ok',
        Counts: { Added: 3, Removed: 0, Failed: 0 },
      });
      const action = new AddViewResultsToListAction();
      const params = buildParams([
        ['ViewID', 'v1'],
        ['ListID', 'l1'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(true);
      expect(addViewMock).toHaveBeenCalledWith('v1', 'l1');
      expect(getOutput(params, 'Added')).toBe(3);
    });
  });

  describe('RefreshListFromSourceAction', () => {
    it('defaults ConfirmDrops to false', async () => {
      refreshMock.mockResolvedValue({
        Success: false,
        ResultCode: 'DROP_NOT_CONFIRMED',
        Message: 'Would remove records',
      });
      const action = new RefreshListFromSourceAction();
      const params = buildParams([
        ['ListID', 'l1'],
        ['Mode', 'Sync'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (action as any).InternalRunAction(params);
      expect(refreshMock).toHaveBeenCalledWith('l1', 'Sync', { ConfirmDrops: false });
    });

    it('passes through an explicit ConfirmDrops=true', async () => {
      refreshMock.mockResolvedValue({
        Success: true,
        ResultCode: 'SUCCESS',
        Message: 'ok',
        Counts: { Added: 0, Removed: 5, Failed: 0 },
      });
      const action = new RefreshListFromSourceAction();
      const params = buildParams([
        ['ListID', 'l1'],
        ['Mode', 'Sync'],
        ['ConfirmDrops', true],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (action as any).InternalRunAction(params);
      expect(refreshMock).toHaveBeenCalledWith('l1', 'Sync', { ConfirmDrops: true });
    });
  });

  describe('ComposeListsAction', () => {
    it('parses Inputs JSON and previews without committing when no Target', async () => {
      composeSetOpMock.mockResolvedValue({
        Counts: { Add: 4, Remove: 0, Unchanged: 1, SourceTotal: 5, TargetTotal: 1 },
        Warnings: [{ Code: 'EMPTY_TARGET', Message: 'target empty' }],
        DeltaToken: 'tok',
      });
      const action = new ComposeListsAction();
      const params = buildParams([
        ['Op', 'union'],
        ['Inputs', JSON.stringify([
          { kind: 'view', viewId: 'v1' },
          { kind: 'list', listId: 'l1' },
        ])],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(true);
      expect(result.Message).toMatch(/no changes applied/);
      expect(composeSetOpMock).toHaveBeenCalledWith(
        'union',
        [
          { kind: 'view', viewId: 'v1' },
          { kind: 'list', listId: 'l1' },
        ],
        undefined,
      );
      expect(applyDeltaMock).not.toHaveBeenCalled();
      expect(getOutput(params, 'DeltaToken')).toBe('tok');
    });

    it('commits when Target is supplied', async () => {
      composeSetOpMock.mockResolvedValue({
        Counts: { Add: 2, Remove: 0, Unchanged: 0, SourceTotal: 2, TargetTotal: 0 },
        Warnings: [],
        DeltaToken: 'tok',
      });
      applyDeltaMock.mockResolvedValue({
        Success: true,
        ResultCode: 'SUCCESS',
        Message: 'ok',
        Counts: { Added: 2, Removed: 0, Failed: 0 },
      });
      const action = new ComposeListsAction();
      const params = buildParams([
        ['Op', 'intersection'],
        ['Inputs', JSON.stringify([
          { kind: 'view', viewId: 'v1' },
          { kind: 'list', listId: 'l1' },
        ])],
        ['Target', JSON.stringify({ kind: 'list', listId: 'target' })],
        ['ConfirmDrops', true],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(true);
      expect(applyDeltaMock).toHaveBeenCalledWith(
        expect.objectContaining({ DeltaToken: 'tok' }),
        { ConfirmDrops: true, DeltaToken: 'tok' },
      );
    });

    it('rejects on fewer than 2 inputs', async () => {
      const action = new ComposeListsAction();
      const params = buildParams([
        ['Op', 'union'],
        ['Inputs', JSON.stringify([{ kind: 'list', listId: 'l1' }])],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });

    it('rejects unknown Op', async () => {
      const action = new ComposeListsAction();
      const params = buildParams([
        ['Op', 'subtract'],
        ['Inputs', JSON.stringify([
          { kind: 'view', viewId: 'v1' },
          { kind: 'view', viewId: 'v2' },
        ])],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });
  });
});
