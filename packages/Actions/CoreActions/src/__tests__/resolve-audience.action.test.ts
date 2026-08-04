/**
 * Tests for ResolveAudienceAction. Mocks @memberjunction/lists so the
 * action's param parsing + delegation is the only thing under test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveMock = vi.fn();

vi.mock('@memberjunction/lists', () => ({
  AudienceResolver: class {
    Resolve = resolveMock;
  },
}));

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class {
    protected async InternalRunAction(_p: unknown): Promise<unknown> {
      return { Success: true, ResultCode: 'SUCCESS', Message: 'noop' };
    }
  },
}));
vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

import { ResolveAudienceAction } from '../custom/lists/resolve-audience.action';

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

describe('ResolveAudienceAction', () => {
  beforeEach(() => {
    resolveMock.mockReset();
  });

  it('resolves a list source and surfaces counts as output params', async () => {
    resolveMock.mockResolvedValue({
      EntityName: 'Contacts',
      RecordIds: ['a', 'b', 'c'],
    });
    const action = new ResolveAudienceAction();
    const params = buildParams([
      ['Source', JSON.stringify({ kind: 'list', listId: 'l1' })],
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (action as any).InternalRunAction(params);
    expect(result.Success).toBe(true);
    expect(resolveMock).toHaveBeenCalledWith({ kind: 'list', listId: 'l1' });
    expect(getOutput(params, 'EntityName')).toBe('Contacts');
    expect(getOutput(params, 'RecordCount')).toBe(3);
    expect(getOutput(params, 'RecordIDs')).toEqual(['a', 'b', 'c']);
  });

  it('resolves a view source', async () => {
    resolveMock.mockResolvedValue({ EntityName: 'Contacts', RecordIds: ['x'] });
    const action = new ResolveAudienceAction();
    const params = buildParams([
      ['Source', JSON.stringify({ kind: 'view', viewId: 'v1' })],
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (action as any).InternalRunAction(params);
    expect(resolveMock).toHaveBeenCalledWith({ kind: 'view', viewId: 'v1' });
  });

  it('returns MISSING_PARAMETER when no Source provided', async () => {
    const action = new ResolveAudienceAction();
    const params = buildParams([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (action as any).InternalRunAction(params);
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAMETER');
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('returns INVALID_PARAMETER when Source is not valid JSON', async () => {
    const action = new ResolveAudienceAction();
    const params = buildParams([['Source', 'this is not json {{{']]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (action as any).InternalRunAction(params);
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_PARAMETER');
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('returns UNEXPECTED_ERROR when the resolver throws', async () => {
    resolveMock.mockRejectedValue(new Error('boom'));
    const action = new ResolveAudienceAction();
    const params = buildParams([
      ['Source', JSON.stringify({ kind: 'list', listId: 'l1' })],
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (action as any).InternalRunAction(params);
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('UNEXPECTED_ERROR');
    expect(result.Message).toMatch(/boom/);
  });
});
