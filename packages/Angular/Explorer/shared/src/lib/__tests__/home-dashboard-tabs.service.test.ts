import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Metadata } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { DashboardEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/** An in-memory preference row. Save and Delete update the fake engine's list in place. */
class FakePreference {
  UserID: string | null = null;
  Scope = 'Global';
  ApplicationID: string | null = null;
  DashboardID = '';
  DisplayOrder = 0;
  /** When set, Save fails and reports this message. */
  FailWith: string | null = null;
  LatestResult: { CompleteMessage: string } | null = null;
  Save = vi.fn(async (): Promise<boolean> => {
    if (this.FailWith) {
      this.LatestResult = { CompleteMessage: this.FailWith };
      return false;
    }
    if (!mocks.engine.DashboardUserPreferences.includes(this)) mocks.engine.DashboardUserPreferences.push(this);
    return true;
  });
  Delete = vi.fn(async (): Promise<boolean> => {
    mocks.engine.DashboardUserPreferences = mocks.engine.DashboardUserPreferences.filter(p => p !== this);
    return true;
  });
  Revert = vi.fn();
}

const mocks = vi.hoisted(() => ({
  engine: {
    IsPermissionConstrained: false,
    DashboardUserPreferences: [] as FakePreference[],
    Dashboards: [] as Array<{ ID: string; Type: string }>,
    CanUserReadDashboard: vi.fn<(dashboardId: string, userId: string) => boolean>(),
    Config: vi.fn(),
  },
  getProviderInstance: vi.fn(),
  /** Settings live in a map; SetSetting writes to it, as the real engine updates its cache. */
  userInfo: {
    IsPermissionConstrained: false,
    Settings: new Map<string, string>(),
    GetSetting: vi.fn<(settingKey: string) => string | undefined>(),
    SetSetting: vi.fn<(settingKey: string, value: string, contextUser?: UserInfo) => Promise<boolean>>(),
  },
  getUserInfoProviderInstance: vi.fn(),
}));

vi.mock('@angular/core', () => ({ Injectable: () => (target: Function) => target }));
vi.mock('@memberjunction/core-entities', () => ({
  DashboardEngine: { Instance: mocks.engine, GetProviderInstance: mocks.getProviderInstance },
  UserInfoEngine: { Instance: mocks.userInfo, GetProviderInstance: mocks.getUserInfoProviderInstance },
}));

import { HOME_TABS_CUSTOMIZED_SETTING_KEY, HomeDashboardTabsService } from '../home-dashboard-tabs.service';

const user = { ID: 'u1' } as UserInfo;

const preference = (o: Partial<FakePreference>): FakePreference => Object.assign(new FakePreference(), o);
const systemDefault = (dashboardId: string, displayOrder: number) =>
  preference({ UserID: null, DashboardID: dashboardId, DisplayOrder: displayOrder });
const own = (dashboardId: string, displayOrder: number) =>
  preference({ UserID: 'u1', DashboardID: dashboardId, DisplayOrder: displayOrder });

function createProvider() {
  const created: FakePreference[] = [];
  const getEntityObject = vi.fn(async (entityName: string) => {
    const row = new FakePreference();
    created.push(row);
    return row;
  });
  const provider = { CurrentUser: user, GetEntityObject: getEntityObject } as unknown as IMetadataProvider;
  return { provider, getEntityObject, created };
}

/** The user's own rows in the fake engine, as DashboardID:DisplayOrder, in DisplayOrder. */
function ownRows(): string[] {
  return mocks.engine.DashboardUserPreferences
    .filter(p => UUIDsEqual(p.UserID, 'u1'))
    .sort((a, b) => a.DisplayOrder - b.DisplayOrder)
    .map(p => `${p.DashboardID}:${p.DisplayOrder}`);
}

describe('HomeDashboardTabsService', () => {
  const { engine, getProviderInstance, userInfo, getUserInfoProviderInstance } = mocks;
  let provider: IMetadataProvider;
  let getEntityObject: ReturnType<typeof createProvider>['getEntityObject'];
  let created: FakePreference[];
  let service: HomeDashboardTabsService;
  let changes: number;

  beforeEach(() => {
    engine.IsPermissionConstrained = false;
    engine.DashboardUserPreferences = [];
    engine.Dashboards = [];
    engine.CanUserReadDashboard.mockReset();
    engine.CanUserReadDashboard.mockReturnValue(true);
    engine.Config.mockReset();
    getProviderInstance.mockReset();
    getProviderInstance.mockReturnValue(engine);
    userInfo.IsPermissionConstrained = false;
    userInfo.Settings.clear();
    userInfo.GetSetting.mockReset();
    userInfo.GetSetting.mockImplementation(settingKey => userInfo.Settings.get(settingKey));
    userInfo.SetSetting.mockReset();
    userInfo.SetSetting.mockImplementation(async (settingKey, value) => {
      userInfo.Settings.set(settingKey, value);
      return true;
    });
    getUserInfoProviderInstance.mockReset();
    getUserInfoProviderInstance.mockReturnValue(userInfo);
    ({ provider, getEntityObject, created } = createProvider());
    service = new HomeDashboardTabsService();
    service.Provider = provider;
    changes = 0;
    service.Changed$.subscribe(() => changes++);
  });

  const isMarkedCustomized = (): boolean => userInfo.Settings.get(HOME_TABS_CUSTOMIZED_SETTING_KEY) === 'true';

  describe('Tabs', () => {
    it('lists readable Config dashboards from the user\'s rows, in order', () => {
      engine.DashboardUserPreferences = [own('b', 2), own('a', 1), own('code', 3), own('secret', 4), systemDefault('sys', 1)];
      engine.Dashboards = [
        { ID: 'a', Type: 'Config' },
        { ID: 'b', Type: 'Config' },
        { ID: 'code', Type: 'Code' },
        { ID: 'secret', Type: 'Config' },
      ];
      engine.CanUserReadDashboard.mockImplementation(dashboardId => !UUIDsEqual(dashboardId, 'secret'));

      expect(service.Tabs().map(d => d.ID)).toEqual(['a', 'b']);
      expect(engine.CanUserReadDashboard).toHaveBeenCalledWith('a', 'u1');
      expect(service.HasTab('B')).toBe(true);
      expect(service.HasTab('code')).toBe(false);
    });

    it('returns no tabs when the engine is permission-constrained', () => {
      engine.DashboardUserPreferences = [own('a', 1)];
      engine.Dashboards = [{ ID: 'a', Type: 'Config' }];
      engine.IsPermissionConstrained = true;
      expect(service.Tabs()).toEqual([]);
    });
  });

  describe('Add and Remove', () => {
    it('copies the system defaults before adding, marks the user, then reloads and emits Changed$', async () => {
      engine.DashboardUserPreferences = [systemDefault('sys2', 2), systemDefault('sys1', 1)];

      await service.Add('new');

      expect(ownRows()).toEqual(['sys1:1', 'sys2:2', 'new:3']);
      expect(getEntityObject).toHaveBeenCalledWith('MJ: Dashboard User Preferences', user);
      for (const row of created) {
        expect(row).toMatchObject({ UserID: 'u1', Scope: 'Global', ApplicationID: null });
      }
      expect(userInfo.SetSetting).toHaveBeenCalledWith(HOME_TABS_CUSTOMIZED_SETTING_KEY, 'true', user);
      expect(engine.Config).toHaveBeenCalledWith(true, user, provider);
      expect(changes).toBe(1);
    });

    it('deletes the user\'s row, renumbers the rest, and marks a user who had no marker', async () => {
      const [a, b, c] = [own('a', 1), own('b', 2), own('c', 3)];
      engine.DashboardUserPreferences = [a, b, c, systemDefault('sys', 1)];

      await service.Remove('b');

      expect(b.Delete).toHaveBeenCalled();
      expect(c.Save).toHaveBeenCalled();
      expect(ownRows()).toEqual(['a:1', 'c:2']);
      expect(getEntityObject).not.toHaveBeenCalled();
      expect(isMarkedCustomized()).toBe(true);
      expect(changes).toBe(1);
    });

    it('writes nothing and does not reload when the change is already in effect', async () => {
      engine.DashboardUserPreferences = [own('a', 1)];

      await service.Add('a');
      await service.Remove('missing');

      expect(getEntityObject).not.toHaveBeenCalled();
      expect(userInfo.SetSetting).not.toHaveBeenCalled();
      expect(engine.Config).not.toHaveBeenCalled();
      expect(changes).toBe(0);
    });

    it('applies quick successive changes one at a time', async () => {
      engine.DashboardUserPreferences = [systemDefault('sys1', 1), systemDefault('sys2', 2)];

      await Promise.all([service.Add('x'), service.Add('y')]);

      expect(ownRows()).toEqual(['sys1:1', 'sys2:2', 'x:3', 'y:4']);
      expect(created).toHaveLength(4);
      expect(userInfo.SetSetting).toHaveBeenCalledTimes(1);
    });
  });

  describe('customized marker', () => {
    it('removes the only default: no tabs, the marker is set, and no rows are written', async () => {
      engine.DashboardUserPreferences = [systemDefault('sys', 1)];
      engine.Dashboards = [{ ID: 'sys', Type: 'Config' }];
      expect(service.Tabs().map(d => d.ID)).toEqual(['sys']);

      await service.Remove('sys');

      expect(service.Tabs()).toEqual([]);
      expect(isMarkedCustomized()).toBe(true);
      expect(getEntityObject).not.toHaveBeenCalled();
      expect(changes).toBe(1);
    });

    it('keeps an emptied list empty: removing both defaults does not bring them back', async () => {
      engine.DashboardUserPreferences = [systemDefault('s1', 1), systemDefault('s2', 2)];
      engine.Dashboards = [{ ID: 's1', Type: 'Config' }, { ID: 's2', Type: 'Config' }];

      await service.Remove('s1');
      await service.Remove('s2');

      expect(ownRows()).toEqual([]);
      expect(service.Tabs()).toEqual([]);
      expect(userInfo.SetSetting).toHaveBeenCalledTimes(1);
    });

    it('shows no defaults to a customized user who has no rows', () => {
      userInfo.Settings.set(HOME_TABS_CUSTOMIZED_SETTING_KEY, 'true');
      engine.DashboardUserPreferences = [systemDefault('sys', 1)];
      engine.Dashboards = [{ ID: 'sys', Type: 'Config' }];

      expect(service.Tabs()).toEqual([]);
    });

    it('sets the marker only after the row writes succeed', async () => {
      engine.DashboardUserPreferences = [systemDefault('sys', 1)];
      getEntityObject.mockImplementation(async () => preference({ FailWith: 'Save failed' }));

      await expect(service.Add('x')).rejects.toThrow('Save failed');

      expect(userInfo.SetSetting).not.toHaveBeenCalled();
    });

    it('rejects when the marker cannot be saved, and still reloads', async () => {
      engine.DashboardUserPreferences = [systemDefault('sys', 1)];
      userInfo.SetSetting.mockResolvedValue(false);

      await expect(service.Remove('sys')).rejects.toThrow('Could not save the Home tabs setting');

      expect(engine.Config).toHaveBeenCalledTimes(1);
      expect(changes).toBe(1);
    });

    it('treats a permission-constrained settings engine as not customized', () => {
      userInfo.IsPermissionConstrained = true;
      userInfo.GetSetting.mockImplementation(() => { throw new Error('PermissionConstrainedError'); });
      engine.DashboardUserPreferences = [systemDefault('sys', 1)];
      engine.Dashboards = [{ ID: 'sys', Type: 'Config' }];

      expect(service.Tabs().map(d => d.ID)).toEqual(['sys']);
    });
  });

  describe('MarkCustomized', () => {
    it('saves the marker once and emits Changed$ when it is new', async () => {
      await service.MarkCustomized();
      await service.MarkCustomized();

      expect(userInfo.SetSetting).toHaveBeenCalledTimes(1);
      expect(userInfo.SetSetting).toHaveBeenCalledWith(HOME_TABS_CUSTOMIZED_SETTING_KEY, 'true', user);
      expect(changes).toBe(1);
    });

    it('rejects when the marker cannot be saved', async () => {
      userInfo.SetSetting.mockResolvedValue(false);

      await expect(service.MarkCustomized()).rejects.toThrow('Could not save the Home tabs setting');
      expect(changes).toBe(0);
    });
  });

  describe('failures', () => {
    it('rejects with the save error and still reloads', async () => {
      getEntityObject.mockImplementation(async () => preference({ FailWith: 'Validation failed: DashboardID' }));

      await expect(service.Add('x')).rejects.toThrow('Validation failed: DashboardID');
      expect(engine.Config).toHaveBeenCalledTimes(1);
      expect(changes).toBe(1);
    });

    it('reverts a row whose reorder fails', async () => {
      const [a, b] = [own('a', 1), own('b', 5)];
      b.FailWith = 'Save blocked';
      engine.DashboardUserPreferences = [a, b];

      await expect(service.Remove('a')).rejects.toThrow('Save blocked');
      expect(b.Revert).toHaveBeenCalled();
    });

    it('keeps accepting changes after a failure', async () => {
      getEntityObject.mockImplementationOnce(async () => preference({ FailWith: 'Network error' }));

      await expect(service.Add('x')).rejects.toThrow('Network error');
      await service.Add('y');

      expect(ownRows()).toEqual(['y:1']);
    });
  });

  describe('provider', () => {
    it('reads both engines for the provider it was given', () => {
      service.Tabs();
      expect(getProviderInstance).toHaveBeenCalledWith(provider, DashboardEngine);
      expect(getUserInfoProviderInstance).toHaveBeenCalledWith(provider, UserInfoEngine);
    });

    it('uses the global provider and engine instances when no provider is set', () => {
      vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(provider);
      engine.DashboardUserPreferences = [own('a', 1)];
      engine.Dashboards = [{ ID: 'a', Type: 'Config' }];

      expect(new HomeDashboardTabsService().Tabs().map(d => d.ID)).toEqual(['a']);
      expect(getProviderInstance).not.toHaveBeenCalled();
      expect(getUserInfoProviderInstance).not.toHaveBeenCalled();
    });
  });
});
