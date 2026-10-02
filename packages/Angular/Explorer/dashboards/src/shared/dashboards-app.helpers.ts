import { LogError } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import type { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import type { DashboardNavigationOptions } from '@memberjunction/ng-shared';
import { CreateDefaultDashboardConfig } from '@memberjunction/ng-dashboard-viewer';
import {
  DASHBOARDS_APP_AUTO_INSTALL_SETTING_KEY,
  DashboardsAppInstallOperations,
  DashboardsAppInstallState,
  RunDashboardsAppAutoInstall,
  RunDashboardsAppExplicitInstall,
} from './dashboards-app-install';

export const DASHBOARDS_APP_NAME = 'Dashboards';

/** Label of the Dashboards app's Browse nav item. */
export const DASHBOARDS_BROWSE_NAV_ITEM = 'Browse';

/** The Dashboards application, if the user has it enabled. */
export function FindDashboardsApp(appManager: ApplicationManager): BaseApplication | undefined {
  return appManager.GetAllApps().find((a) => a.Name === DASHBOARDS_APP_NAME);
}

/**
 * The NavigationService.OpenDashboard options for a dashboard opened from a page of the Dashboards
 * app: a tab of the Dashboards app. Like any open, the dashboard replaces the current preview tab,
 * so Back returns to the page, and a Shift-click opens a separate tab. When the user does not have
 * the app, no application is named and the tab opens in NavigationService's default application.
 * `openInEditMode` asks the tab to enter edit mode (a new dashboard, or a card's Edit action).
 * `openInNewTab` forces a separate tab, for a click the dashboard browser reports as one
 * (`DashboardOpenEvent.OpenInNewTab`: Shift, Ctrl or Cmd).
 */
export function DashboardsAppOpenOptions(appManager: ApplicationManager, openInEditMode = false, openInNewTab = false): DashboardNavigationOptions {
  const app = FindDashboardsApp(appManager);
  return {
    ...(app ? { applicationId: app.ID } : {}),
    ...(openInEditMode ? { openInEditMode: true } : {}),
    ...(openInNewTab ? { forceNewTab: true } : {}),
  };
}

/** Creates and saves an empty Config dashboard owned by the current user. Returns null on failure. */
export async function CreateBlankDashboard(md: IMetadataProvider, categoryId?: string | null): Promise<MJDashboardEntity | null> {
  try {
    const dashboard = await md.GetEntityObject<MJDashboardEntity>('MJ: Dashboards', md.CurrentUser);
    dashboard.Name = 'New Dashboard';
    dashboard.Description = '';
    dashboard.UserID = md.CurrentUser.ID;
    dashboard.UIConfigDetails = JSON.stringify(CreateDefaultDashboardConfig());
    if (categoryId) {
      dashboard.CategoryID = categoryId;
    }
    if (await dashboard.Save()) {
      return dashboard;
    }
    LogError(`CreateBlankDashboard: ${dashboard.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return null;
  } catch (error) {
    LogError(`CreateBlankDashboard: ${errorMessage(error)}`);
    return null;
  }
}

/**
 * Automatic install path, for Home load. Installs the Dashboards app for a user who has no
 * UserApplication row for it, at most once per user (tracked by a UserInfoEngine setting), so a
 * user who removes the app keeps it removed. Never rejects.
 * @returns true when this call installed the app.
 */
export async function AutoInstallDashboardsApp(appManager: ApplicationManager): Promise<boolean> {
  try {
    await appManager.WhenReady();
    return await RunDashboardsAppAutoInstall(buildInstallOperations(appManager));
  } catch (error) {
    LogError(`AutoInstallDashboardsApp: ${errorMessage(error)}`);
    return false;
  }
}

/**
 * Explicit install path, for a user click that goes to the Dashboards app (Open Dashboards,
 * See all, Browse all). Installs the app when it is missing or removed. Never rejects.
 * @returns the app to pass to `NavigationService.SwitchToApp`, or undefined when no Active
 * Dashboards app exists, the user is not authorized for it, or the install failed or did not
 * finish within DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS.
 */
export async function EnsureDashboardsApp(appManager: ApplicationManager): Promise<BaseApplication | undefined> {
  try {
    await appManager.WhenReady();
    if (!(await RunDashboardsAppExplicitInstall(buildInstallOperations(appManager)))) {
      return undefined;
    }
    const app = FindDashboardsApp(appManager);
    if (app) {
      return app;
    }
    await appManager.ReloadUserApplications();
    return FindDashboardsApp(appManager);
  } catch (error) {
    LogError(`EnsureDashboardsApp: ${errorMessage(error)}`);
    return undefined;
  }
}

/** Install operations over ApplicationManager and UserInfoEngine.Instance, the engine ApplicationManager reads and installs through. */
function buildInstallOperations(appManager: ApplicationManager): DashboardsAppInstallOperations {
  const engine = UserInfoEngine.Instance;
  return {
    ReadState: () => readInstallState(appManager, engine),
    Install: () => installForUser(appManager),
    RecordAutoInstall: () => engine.SetSetting(DASHBOARDS_APP_AUTO_INSTALL_SETTING_KEY, 'true'),
  };
}

function readInstallState(appManager: ApplicationManager, engine: UserInfoEngine): DashboardsAppInstallState | null {
  if (engine.IsPermissionConstrained) {
    return null;
  }
  const app = findSystemDashboardsApp(appManager);
  return {
    AppExists: app != null,
    Access: app ? engine.CheckUserApplicationAccess(app.ID) : 'not_installed',
    AutoInstallRecorded: engine.GetSetting(DASHBOARDS_APP_AUTO_INSTALL_SETTING_KEY) === 'true',
  };
}

/** Installs or re-enables the app, then rebuilds the user's app list so navigation can find it. */
async function installForUser(appManager: ApplicationManager): Promise<boolean> {
  const app = findSystemDashboardsApp(appManager);
  if (!app || !(await appManager.InstallAppForUser(app.ID))) {
    return false;
  }
  await appManager.ReloadUserApplications();
  return true;
}

/** The Dashboards app among all Active applications, whether or not the user has it. */
function findSystemDashboardsApp(appManager: ApplicationManager): BaseApplication | undefined {
  return appManager.GetAllSystemApps().find((a) => a.Name === DASHBOARDS_APP_NAME);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
