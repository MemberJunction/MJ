/**
 * Tests for the Dashboards app helpers (`shared/dashboards-app.helpers.ts`): finding the app,
 * creating a named blank dashboard, the longest dashboard name, and wiring the install paths to
 * ApplicationManager and UserInfoEngine. The install decisions themselves are covered in
 * dashboards-app-install.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ApplicationManager } from '@memberjunction/ng-base-application';
import {
  AutoInstallDashboardsApp,
  CreateBlankDashboard,
  DASHBOARDS_APP_NAME,
  DASHBOARDS_LIBRARY_NAV_ITEM,
  DashboardNameMaxLength,
  DashboardsAppOpenOptions,
  EnsureDashboardsApp,
  FindDashboardsApp,
} from '../shared/dashboards-app.helpers';
import { DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS } from '../shared/dashboards-app-install';

const hoisted = vi.hoisted(() => {
  const settings = new Map<string, string>();
  const access = new Map<string, string>();
  return {
    settings,
    access,
    logError: vi.fn(),
    engine: {
      IsPermissionConstrained: false,
      GetSetting: (key: string): string | undefined => settings.get(key),
      SetSetting: vi.fn(async (key: string, value: string): Promise<boolean> => {
        settings.set(key, value);
        return true;
      }),
      CheckUserApplicationAccess: vi.fn((appId: string): string => access.get(appId) ?? 'not_installed'),
    },
  };
});

vi.mock('@memberjunction/core', () => ({ LogError: hoisted.logError }));
vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    get Instance() {
      return hoisted.engine;
    },
  },
}));
vi.mock('@memberjunction/ng-dashboard-viewer', () => ({
  CreateDefaultDashboardConfig: () => ({ layout: null, settings: { columns: 12 } }),
  DASHBOARD_NAME_MAX_LENGTH: 255,
}));

interface FakeApp {
  ID: string;
  Name: string;
}

const DASHBOARDS_APP: FakeApp = { ID: 'app-dashboards', Name: 'Dashboards' };
const DATA_EXPLORER_APP: FakeApp = { ID: 'app-data-explorer', Name: 'Data Explorer' };

/** The user's active apps and the system's Active apps; installing moves an app into the active list on reload. */
class FakeAppManager {
  public Active: FakeApp[] = [DATA_EXPLORER_APP];
  public System: FakeApp[] = [DATA_EXPLORER_APP, DASHBOARDS_APP];
  public InstallSucceeds = true;

  public WhenReady = vi.fn(async (): Promise<void> => undefined);
  public InstallAppForUser = vi.fn(async (appId: string): Promise<{ ApplicationID: string } | null> => {
    if (!this.InstallSucceeds) return null;
    hoisted.access.set(appId, 'installed_active');
    return { ApplicationID: appId };
  });
  public ReloadUserApplications = vi.fn(async (): Promise<void> => {
    this.Active = this.System.filter((a) => a === DATA_EXPLORER_APP || hoisted.access.get(a.ID) === 'installed_active');
  });

  public GetAllApps(): FakeApp[] {
    return this.Active;
  }

  public GetAllSystemApps(): FakeApp[] {
    return this.System;
  }

  public AsManager(): ApplicationManager {
    return this as unknown as ApplicationManager;
  }
}

interface FakeDashboard {
  Name: string;
  Description: string | null;
  UserID: string;
  UIConfigDetails: string;
  CategoryID: string | null;
  LatestResult: { CompleteMessage: string };
  Save: () => Promise<boolean>;
}

function makeProvider(save: () => Promise<boolean>) {
  const dashboard: FakeDashboard = {
    Name: '',
    Description: null,
    UserID: '',
    UIConfigDetails: '',
    CategoryID: null,
    LatestResult: { CompleteMessage: 'Name must be unique' },
    Save: save,
  };
  const currentUser = { ID: 'user-1' };
  const getEntityObject = vi.fn(async (): Promise<FakeDashboard> => dashboard);
  const provider = { CurrentUser: currentUser, GetEntityObject: getEntityObject } as unknown as IMetadataProvider;
  return { provider, dashboard, currentUser, getEntityObject };
}

describe('dashboards-app.helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.settings.clear();
    hoisted.access.clear();
    hoisted.engine.IsPermissionConstrained = false;
  });

  it('names the app Dashboards', () => {
    expect(DASHBOARDS_APP_NAME).toBe('Dashboards');
  });

  it('names the Library nav item Library', () => {
    expect(DASHBOARDS_LIBRARY_NAV_ITEM).toBe('Library');
  });

  describe('FindDashboardsApp', () => {
    it('returns the Dashboards app from the user active apps', () => {
      const appManager = new FakeAppManager();
      appManager.Active = [DATA_EXPLORER_APP, DASHBOARDS_APP];
      expect(FindDashboardsApp(appManager.AsManager())).toBe(DASHBOARDS_APP);
    });

    it('returns undefined when the user does not have the app', () => {
      expect(FindDashboardsApp(new FakeAppManager().AsManager())).toBeUndefined();
    });
  });

  describe('DashboardsAppOpenOptions', () => {
    it('opens the dashboard in a tab of the Dashboards app, without forcing a new tab', () => {
      const appManager = new FakeAppManager();
      appManager.Active = [DATA_EXPLORER_APP, DASHBOARDS_APP];
      expect(DashboardsAppOpenOptions(appManager.AsManager())).toEqual({ applicationId: DASHBOARDS_APP.ID });
    });

    it('adds the edit-mode request for a new dashboard', () => {
      const appManager = new FakeAppManager();
      appManager.Active = [DASHBOARDS_APP];
      expect(DashboardsAppOpenOptions(appManager.AsManager(), true)).toEqual({ applicationId: DASHBOARDS_APP.ID, openInEditMode: true });
    });

    it('names no application when the user does not have the Dashboards app, so the default application is used', () => {
      const appManager = new FakeAppManager();
      expect(DashboardsAppOpenOptions(appManager.AsManager())).toEqual({});
      expect(DashboardsAppOpenOptions(appManager.AsManager(), true)).toEqual({ openInEditMode: true });
    });

    it('forces a separate tab only when asked (a Shift, Ctrl or Cmd click in the browser)', () => {
      const appManager = new FakeAppManager();
      appManager.Active = [DASHBOARDS_APP];
      expect(DashboardsAppOpenOptions(appManager.AsManager(), false, true)).toEqual({ applicationId: DASHBOARDS_APP.ID, forceNewTab: true });
      expect(DashboardsAppOpenOptions(appManager.AsManager(), true, true)).toEqual({ applicationId: DASHBOARDS_APP.ID, openInEditMode: true, forceNewTab: true });
      expect(DashboardsAppOpenOptions(new FakeAppManager().AsManager(), false, true)).toEqual({ forceNewTab: true });
    });
  });

  describe('CreateBlankDashboard', () => {
    it('saves an empty Config dashboard with the trimmed name, owned by the current user', async () => {
      const { provider, dashboard, currentUser, getEntityObject } = makeProvider(async () => true);
      await expect(CreateBlankDashboard(provider, '  Q3 Pipeline ')).resolves.toBe(dashboard);
      expect(getEntityObject).toHaveBeenCalledWith('MJ: Dashboards', currentUser);
      expect(dashboard.Name).toBe('Q3 Pipeline');
      expect(dashboard.Description).toBe('');
      expect(dashboard.UserID).toBe('user-1');
      expect(JSON.parse(dashboard.UIConfigDetails)).toEqual({ layout: null, settings: { columns: 12 } });
      expect(dashboard.CategoryID).toBeNull();
    });

    it('files the dashboard in the given category', async () => {
      const { provider, dashboard } = makeProvider(async () => true);
      await CreateBlankDashboard(provider, 'Q3 Pipeline', 'cat-1');
      expect(dashboard.CategoryID).toBe('cat-1');
    });

    it('creates nothing for a blank name', async () => {
      const { provider, getEntityObject } = makeProvider(async () => true);
      await expect(CreateBlankDashboard(provider, '   ')).resolves.toBeNull();
      expect(getEntityObject).not.toHaveBeenCalled();
      expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('name'));
    });

    it('returns null and logs the complete message when the save fails', async () => {
      const { provider } = makeProvider(async () => false);
      await expect(CreateBlankDashboard(provider, 'Q3 Pipeline')).resolves.toBeNull();
      expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('Name must be unique'));
    });

    it('returns null when the save throws', async () => {
      const { provider } = makeProvider(async () => {
        throw new Error('network down');
      });
      await expect(CreateBlankDashboard(provider, 'Q3 Pipeline')).resolves.toBeNull();
      expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('network down'));
    });
  });

  describe('DashboardNameMaxLength', () => {
    const providerWithNameLength = (maxLength?: number) =>
      ({ EntityByName: (name: string) => (name === 'MJ: Dashboards'
          ? { FieldByName: (field: string) => (field === 'Name' && maxLength !== undefined ? { MaxLength: maxLength } : undefined) }
          : undefined) }) as unknown as IMetadataProvider;

    it('reads the MaxLength of MJ: Dashboards.Name', () => {
      expect(DashboardNameMaxLength(providerWithNameLength(255))).toBe(255);
      expect(DashboardNameMaxLength(providerWithNameLength(100))).toBe(100);
    });

    it('falls back to 255 when the metadata gives no length', () => {
      expect(DashboardNameMaxLength(providerWithNameLength(0))).toBe(255);
      expect(DashboardNameMaxLength(providerWithNameLength())).toBe(255);
      expect(DashboardNameMaxLength({ EntityByName: () => undefined } as unknown as IMetadataProvider)).toBe(255);
    });
  });

  describe('AutoInstallDashboardsApp', () => {
    it('installs the Dashboards app, refreshes the app list, and records the marker', async () => {
      const appManager = new FakeAppManager();
      await expect(AutoInstallDashboardsApp(appManager.AsManager())).resolves.toBe(true);
      expect(appManager.WhenReady).toHaveBeenCalled();
      expect(hoisted.engine.CheckUserApplicationAccess).toHaveBeenCalledWith('app-dashboards');
      expect(appManager.InstallAppForUser).toHaveBeenCalledWith('app-dashboards');
      expect(appManager.ReloadUserApplications).toHaveBeenCalled();
      expect(hoisted.engine.SetSetting).toHaveBeenCalledWith('Dashboards.AppAutoInstalled', 'true');
      expect(FindDashboardsApp(appManager.AsManager())).toBe(DASHBOARDS_APP);
    });

    it('does not install again once the marker is recorded', async () => {
      hoisted.settings.set('Dashboards.AppAutoInstalled', 'true');
      const appManager = new FakeAppManager();
      await expect(AutoInstallDashboardsApp(appManager.AsManager())).resolves.toBe(false);
      expect(appManager.InstallAppForUser).not.toHaveBeenCalled();
    });

    it('does nothing when the user data is permission-constrained', async () => {
      hoisted.engine.IsPermissionConstrained = true;
      const appManager = new FakeAppManager();
      await expect(AutoInstallDashboardsApp(appManager.AsManager())).resolves.toBe(false);
      expect(appManager.InstallAppForUser).not.toHaveBeenCalled();
    });

    it('resolves false and logs when the install throws', async () => {
      const appManager = new FakeAppManager();
      appManager.InstallAppForUser.mockRejectedValueOnce(new Error('network down'));
      await expect(AutoInstallDashboardsApp(appManager.AsManager())).resolves.toBe(false);
      expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('network down'));
      expect(hoisted.engine.SetSetting).not.toHaveBeenCalled();
    });
  });

  describe('EnsureDashboardsApp', () => {
    it('returns the app after installing it, so the caller can switch to it', async () => {
      const appManager = new FakeAppManager();
      await expect(EnsureDashboardsApp(appManager.AsManager())).resolves.toBe(DASHBOARDS_APP);
      expect(appManager.InstallAppForUser).toHaveBeenCalledWith('app-dashboards');
    });

    it('returns the app without installing when the user has it', async () => {
      hoisted.access.set('app-dashboards', 'installed_active');
      const appManager = new FakeAppManager();
      appManager.Active = [DATA_EXPLORER_APP, DASHBOARDS_APP];
      await expect(EnsureDashboardsApp(appManager.AsManager())).resolves.toBe(DASHBOARDS_APP);
      expect(appManager.InstallAppForUser).not.toHaveBeenCalled();
      expect(hoisted.engine.SetSetting).not.toHaveBeenCalled();
    });

    it('refreshes a stale app list when the user has the app but the list does not show it yet', async () => {
      hoisted.access.set('app-dashboards', 'installed_active');
      const appManager = new FakeAppManager();
      await expect(EnsureDashboardsApp(appManager.AsManager())).resolves.toBe(DASHBOARDS_APP);
      expect(appManager.ReloadUserApplications).toHaveBeenCalledTimes(1);
      expect(appManager.InstallAppForUser).not.toHaveBeenCalled();
    });

    it('returns undefined when no Dashboards app exists', async () => {
      const appManager = new FakeAppManager();
      appManager.System = [DATA_EXPLORER_APP];
      await expect(EnsureDashboardsApp(appManager.AsManager())).resolves.toBeUndefined();
      expect(appManager.InstallAppForUser).not.toHaveBeenCalled();
    });

    it('returns undefined when the install fails', async () => {
      const appManager = new FakeAppManager();
      appManager.InstallSucceeds = false;
      await expect(EnsureDashboardsApp(appManager.AsManager())).resolves.toBeUndefined();
    });
  });

  describe('install requests the server does not answer', () => {
    /** A request the server never answers. */
    const unanswered = (): Promise<{ ApplicationID: string } | null> => new Promise(() => undefined);

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('lets EnsureDashboardsApp queued behind a stuck automatic install finish after the step limit', async () => {
      const appManager = new FakeAppManager();
      // The automatic install's request never gets an answer; the click's request does.
      appManager.InstallAppForUser.mockImplementationOnce(unanswered);
      const auto = AutoInstallDashboardsApp(appManager.AsManager());
      const ensure = EnsureDashboardsApp(appManager.AsManager());
      let ensureSettled = false;
      void ensure.then(() => (ensureSettled = true));

      await vi.advanceTimersByTimeAsync(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS - 1);
      expect(ensureSettled).toBe(false);
      expect(appManager.InstallAppForUser).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(ensureSettled).toBe(true);
      await expect(auto).resolves.toBe(false);
      await expect(ensure).resolves.toBe(DASHBOARDS_APP);
      expect(appManager.InstallAppForUser).toHaveBeenCalledTimes(2);
      expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('did not finish'));
    });

    it('returns undefined from EnsureDashboardsApp when its own install does not finish in time', async () => {
      const appManager = new FakeAppManager();
      appManager.InstallAppForUser.mockImplementation(unanswered);
      let settled = false;
      const ensure = EnsureDashboardsApp(appManager.AsManager());
      void ensure.then(() => (settled = true));

      await vi.advanceTimersByTimeAsync(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS);

      expect(settled).toBe(true);
      await expect(ensure).resolves.toBeUndefined();
      expect(hoisted.engine.SetSetting).not.toHaveBeenCalled();
    });
  });
});
