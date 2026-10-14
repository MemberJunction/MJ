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
  deniedProperties: new Set<string>(['_userApplications']),
  IsPropertyPermissionConstrained(name: string): boolean {
    return this.deniedProperties.has(name);
  },
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

function appInfo(id: string, name: string, defaultForNewUser: boolean, sequence: number) {
  return { ID: id, Name: name, Description: '', Icon: '', Color: '', DefaultNavItems: '[]', ClassName: '', DefaultSequence: sequence, DefaultForNewUser: defaultForNewUser, Status: 'Active', NavigationStyle: 'App', TopNavLocation: null, HideNavBarIconWhenActive: false, Path: name.toLowerCase(), AutoUpdatePath: false };
}

function constrainedProvider() {
  return {
    CurrentUser: { ID: 'magic-user', Name: 'Magic Link Guest' },
    Applications: [
      appInfo('app-1', 'Voting', false, 1),
      appInfo('app-2', 'Home', true, 20),
      appInfo('app-3', 'Chat', true, 10),
      appInfo('app-4', 'Admin', true, 5),
    ],
  };
}

async function loadedManager(): Promise<ApplicationManager> {
  const manager = new ApplicationManager();
  manager.Provider = constrainedProvider() as unknown as ApplicationManager['Provider'];
  await (manager as unknown as LoadableManager).loadApplications();
  return manager;
}

function currentApps(manager: ApplicationManager): string[] {
  let names: string[] = [];
  manager.Applications.subscribe(apps => { names = apps.map(a => a.Name); }).unsubscribe();
  return names;
}

describe('ApplicationManager — permission-constrained (magic-link) session', () => {
  beforeEach(() => {
    engine.IsPermissionConstrained = true;
    engine.deniedProperties = new Set(['_userApplications']);
    engine.UserHasApplicationAccess.mockImplementation((id: string) => id !== 'app-4');
    (ApplicationManager as unknown as { _recoveryAttempted: boolean })._recoveryAttempted = false;
  });

  it('loads without throwing and skips the recovery path entirely', async () => {
    const manager = new ApplicationManager();
    manager.Provider = constrainedProvider() as unknown as ApplicationManager['Provider'];

    await expect((manager as unknown as LoadableManager).loadApplications()).resolves.toBeUndefined();
    expect(engine.Config, 'a forced refresh cannot grant read access — recovery must not run').not.toHaveBeenCalled();
    expect(manager.GetAllSystemApps().map(a => a.Name)).toEqual(['Voting', 'Home', 'Chat', 'Admin']);
  });

  it('still resolves WhenReady for waiters', async () => {
    const manager = new ApplicationManager();
    manager.Provider = constrainedProvider() as unknown as ApplicationManager['Provider'];
    await (manager as unknown as LoadableManager).loadApplications();
    await expect(manager.WhenReady()).resolves.toBeUndefined();
  });

  it('offers the default-for-new-user apps the user may access, in DefaultSequence order, without creating records', async () => {
    const manager = await loadedManager();
    expect(currentApps(manager)).toEqual(['Chat', 'Home']);
  });

  it('offers nothing when application roles are unreadable too (access cannot be judged)', async () => {
    engine.deniedProperties = new Set(['_userApplications', '_applicationRoles']);
    const manager = await loadedManager();
    expect(currentApps(manager)).toEqual([]);
  });

  it('adopts the app a locked session is scoped to, once, so the shell can activate it', async () => {
    engine.deniedProperties = new Set(['_userApplications', '_applicationRoles']);
    const manager = await loadedManager();
    expect(manager.AdoptSessionApplication('app-1')).toBe(true);
    expect(currentApps(manager)).toEqual(['Voting']);
    expect(manager.GetAppById('app-1')?.Name).toBe('Voting');
    expect(manager.AdoptSessionApplication('app-1'), 'already available').toBe(false);
    expect(manager.AdoptSessionApplication('no-such-app')).toBe(false);
  });
});
