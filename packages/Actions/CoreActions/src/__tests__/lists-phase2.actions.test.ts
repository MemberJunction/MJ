/**
 * Action-level tests for the Phase 2 sharing actions. Same mocking
 * strategy as `lists-phase1.actions.test.ts`: mock `@memberjunction/lists`
 * to prove the actions wire params to the right `ListSharing` method.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const shareMock = vi.fn();
const unshareMock = vi.fn();
const inviteMock = vi.fn();
const revokeMock = vi.fn();

vi.mock('@memberjunction/lists', () => ({
  ListSharing: class {
    Share = shareMock;
    Unshare = unshareMock;
    Invite = inviteMock;
    RevokeInvitation = revokeMock;
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

import { InviteToListAction } from '../custom/lists/invite-to-list.action';
import { RevokeListInvitationAction } from '../custom/lists/revoke-list-invitation.action';
import { ShareListAction } from '../custom/lists/share-list.action';
import { UnshareListAction } from '../custom/lists/unshare-list.action';

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

describe('Phase 2 list sharing actions', () => {
  beforeEach(() => {
    shareMock.mockReset();
    unshareMock.mockReset();
    inviteMock.mockReset();
    revokeMock.mockReset();
  });

  describe('ShareListAction', () => {
    it('forwards a user share', async () => {
      shareMock.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: 'ok', PermissionID: 'p1' });
      const action = new ShareListAction();
      const params = buildParams([
        ['ListID', 'list-1'],
        ['TargetKind', 'user'],
        ['TargetID', 'user-x'],
        ['PermissionLevel', 'Edit'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(true);
      expect(shareMock).toHaveBeenCalledWith({
        ListID: 'list-1',
        Target: { kind: 'user', userId: 'user-x' },
        PermissionLevel: 'Edit',
      });
      expect(getOutput(params, 'PermissionID')).toBe('p1');
    });

    it('forwards a role share', async () => {
      shareMock.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: 'ok' });
      const action = new ShareListAction();
      const params = buildParams([
        ['ListID', 'list-1'],
        ['TargetKind', 'role'],
        ['TargetID', 'role-x'],
        ['PermissionLevel', 'View'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (action as any).InternalRunAction(params);
      expect(shareMock).toHaveBeenCalledWith({
        ListID: 'list-1',
        Target: { kind: 'role', roleId: 'role-x' },
        PermissionLevel: 'View',
      });
    });

    it('defaults PermissionLevel to View', async () => {
      shareMock.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: 'ok' });
      const action = new ShareListAction();
      const params = buildParams([
        ['ListID', 'list-1'],
        ['TargetKind', 'user'],
        ['TargetID', 'user-x'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (action as any).InternalRunAction(params);
      expect(shareMock.mock.calls[0][0].PermissionLevel).toBe('View');
    });

    it('rejects an invalid TargetKind', async () => {
      const action = new ShareListAction();
      const params = buildParams([
        ['ListID', 'list-1'],
        ['TargetKind', 'group'],
        ['TargetID', 'group-x'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
      expect(shareMock).not.toHaveBeenCalled();
    });

    it('rejects an invalid PermissionLevel', async () => {
      const action = new ShareListAction();
      const params = buildParams([
        ['ListID', 'list-1'],
        ['TargetKind', 'user'],
        ['TargetID', 'user-x'],
        ['PermissionLevel', 'Bogus'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });
  });

  describe('UnshareListAction', () => {
    it('forwards permission ID to Unshare', async () => {
      unshareMock.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: 'ok' });
      const action = new UnshareListAction();
      const params = buildParams([['PermissionID', 'perm-1']]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (action as any).InternalRunAction(params);
      expect(unshareMock).toHaveBeenCalledWith('perm-1');
    });

    it('rejects when missing PermissionID', async () => {
      const action = new UnshareListAction();
      const params = buildParams([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });
  });

  describe('InviteToListAction', () => {
    it('forwards invitation params and surfaces output', async () => {
      const expiresAt = new Date(Date.now() + 86400000);
      inviteMock.mockResolvedValue({
        Success: true,
        ResultCode: 'SUCCESS',
        Message: 'ok',
        InvitationID: 'inv-1',
        Token: 'tok-x',
        ExpiresAt: expiresAt,
      });
      const action = new InviteToListAction();
      const params = buildParams([
        ['ListID', 'list-1'],
        ['Email', 'recipient@x'],
        ['Role', 'Editor'],
        ['TtlHours', '48'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.Success).toBe(true);
      expect(inviteMock).toHaveBeenCalledWith({
        ListID: 'list-1',
        Email: 'recipient@x',
        Role: 'Editor',
        TtlMs: 48 * 60 * 60 * 1000,
      });
      expect(getOutput(params, 'Token')).toBe('tok-x');
      expect(getOutput(params, 'InvitationID')).toBe('inv-1');
      expect(getOutput(params, 'ExpiresAt')).toBe(expiresAt.toISOString());
    });

    it('rejects invalid Role', async () => {
      const action = new InviteToListAction();
      const params = buildParams([
        ['ListID', 'list-1'],
        ['Email', 'r@x'],
        ['Role', 'Owner'],
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (action as any).InternalRunAction(params);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });
  });

  describe('RevokeListInvitationAction', () => {
    it('forwards InvitationID', async () => {
      revokeMock.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: 'ok' });
      const action = new RevokeListInvitationAction();
      const params = buildParams([['InvitationID', 'inv-1']]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (action as any).InternalRunAction(params);
      expect(revokeMock).toHaveBeenCalledWith('inv-1');
    });
  });
});
