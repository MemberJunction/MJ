/**
 * External magic-link sessions hold only 'Magic Link Baseline' plus a granted role, so
 * UserInfoEngine is permission-constrained for them BY DESIGN and its collection getters throw
 * PermissionConstrainedError. ApplicationManager's zero-apps "recovery" read
 * `UserInfoEngine.Instance.UserApplications` for its log line, which threw, and because
 * loadApplications() is fired from an event callback without an await, the rethrow surfaced
 * as an uncaught rejection on every boot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
}));

class FakePermissionConstrainedError extends Error {
  constructor() {
    super('UserInfoEngine data is not available — user lacks read permission on: MJ: User Applications');
    this.name = 'PermissionConstrainedError';
  }
}

const engine = {
  IsPermissionConstrained: true,
  AllPropertiesLoadedSuccessfully: true,
  get UserApplications(): never {
    throw new FakePermissionConstrainedError();
  },
  Config: vi.fn().mockResolvedValue(undefined),
  DataChange$: { subscribe: vi.fn() },
  UserHasApplicationAccess: vi.fn().mockReturnValue(true),
};

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  ApplicationInfo: class {},
  StartupManager: { Instance: { Startup: vi.fn() } },
}));

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: { get Instance() { return engine; } },
  MJUserApplicationEntity: class {},
  MJWorkspaceEntity: class {},
}));

import { ApplicationManager } from '../application-manager';

type LoadableManager = { loadApplications(): Promise<void> };

function constrainedProvider() {
  return {
    CurrentUser: { ID: 'magic-user', Name: 'Magic Link Guest' },
    Applications: [
      { ID: 'app-1', Name: 'Voting', Description: '', Icon: '', Color: '', DefaultNavItems: '[]', ClassName: '', DefaultSequence: 1, Status: 'Active', NavigationStyle: 'App', TopNavLocation: null, HideNavBarIconWhenActive: false, Path: 'voting', AutoUpdatePath: false },
    ],
  };
}

describe('ApplicationManager — permission-constrained (magic-link) session', () => {
  beforeEach(() => {
    engine.IsPermissionConstrained = true;
    (ApplicationManager as unknown as { _recoveryAttempted: boolean })._recoveryAttempted = false;
  });

  it('loads without throwing and skips the recovery path entirely', async () => {
    const manager = new ApplicationManager();
    manager.Provider = constrainedProvider() as unknown as ApplicationManager['Provider'];

    await expect((manager as unknown as LoadableManager).loadApplications()).resolves.toBeUndefined();
    expect(engine.Config, 'a forced refresh cannot grant read access — recovery must not run').not.toHaveBeenCalled();
    expect(manager.GetAllSystemApps().map(a => a.Name)).toEqual(['Voting']);
  });

  it('still resolves WhenReady for waiters', async () => {
    const manager = new ApplicationManager();
    manager.Provider = constrainedProvider() as unknown as ApplicationManager['Provider'];
    await (manager as unknown as LoadableManager).loadApplications();
    await expect(manager.WhenReady()).resolves.toBeUndefined();
  });
});
