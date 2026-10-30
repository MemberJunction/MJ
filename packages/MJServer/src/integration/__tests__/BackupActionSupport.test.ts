import { describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { AppContext } from '../../types.js';
import { FindRegisteredAction, GetActionLaunchPrincipal, ToInputActionParams, ValidateBackupSource } from '../BackupActionSupport.js';

function Context(user: Partial<UserInfo> | undefined): AppContext {
  const partial: Partial<AppContext> = { userPayload: user ? ({ userRecord: user } as AppContext['userPayload']) : undefined };
  return partial as AppContext;
}

describe('GetActionLaunchPrincipal', () => {
  it('returns the authenticated user', () => {
    const user = { ID: 'u-1', Email: 'a@b.c' };
    expect(GetActionLaunchPrincipal(Context(user), 'Op')).toBe(user);
  });

  it('refuses an unauthenticated request', () => {
    expect(() => GetActionLaunchPrincipal(Context(undefined), 'Op')).toThrow('User is not authenticated');
  });

  it('refuses a scope-limited session, naming the operation', () => {
    expect(() => GetActionLaunchPrincipal(Context({ ID: 'u-1', IsMagicLinkAnonymous: true }), 'IntegrationStartBootstrap'))
      .toThrow('IntegrationStartBootstrap is not permitted for scope-limited sessions');
  });
});

describe('FindRegisteredAction', () => {
  it('looks the action up through the engine name index', () => {
    const action = { ID: 'a-1', Name: 'Restore' } as MJActionEntityExtended;
    const engine = { GetActionByName: vi.fn(() => action) };
    expect(FindRegisteredAction(engine, ' restore ')).toBe(action);
    expect(engine.GetActionByName).toHaveBeenCalledWith(' restore ');
  });

  it('throws naming an action that is not registered', () => {
    expect(() => FindRegisteredAction({ GetActionByName: () => undefined }, 'Missing'))
      .toThrow("Action 'Missing' is not registered. Push the integration action metadata first.");
  });
});

describe('ToInputActionParams', () => {
  it('keeps present values as string Input params and drops undefined, null and blank', () => {
    const params = ToInputActionParams({ A: 'x', B: 3, C: true, D: false, E: undefined, F: null, G: '' });
    expect(params.map(p => [p.Name, p.Type, p.Value])).toEqual([
      ['A', 'Input', 'x'],
      ['B', 'Input', '3'],
      ['C', 'Input', 'true'],
      ['D', 'Input', 'false'],
    ]);
  });
});

describe('ValidateBackupSource', () => {
  it('requires BackupUrls', () => {
    expect(ValidateBackupSource({ BackupUrls: '  ' })).toBe("'BackupUrls' is required.");
  });

  it('requires a SAS token or storage credential for an Azure Blob URL', () => {
    expect(ValidateBackupSource({ BackupUrls: 'D:/a.bak, https://x/b.bak' })).toBe("An Azure Blob backup needs either 'SasToken' or 'StorageCredentialID'.");
    expect(ValidateBackupSource({ BackupUrls: 'https://x/b.bak', SasToken: 'sv=1' })).toBeUndefined();
    expect(ValidateBackupSource({ BackupUrls: 'https://x/b.bak', StorageCredentialID: 'c-1' })).toBeUndefined();
  });

  it('accepts a local path with no credential', () => {
    expect(ValidateBackupSource({ BackupUrls: 'D:/backups/a.bak' })).toBeUndefined();
  });
});
