import { UUIDsEqual } from '@memberjunction/global';
import type { WorkspaceTab } from '@memberjunction/ng-base-application';
import type { DashboardNavigationOptions } from '@memberjunction/ng-shared';

/** The fields of a workspace tab that tell which dashboard it shows and which application it belongs to. */
export type DashboardUrlTab = Pick<WorkspaceTab, 'applicationId'> & Partial<Pick<WorkspaceTab, 'resourceRecordId' | 'configuration'>>;

/**
 * The tab a dashboard URL points to. Each application can hold its own tab for a dashboard, so the
 * tab in the URL's application wins. Without one, the first tab that shows the dashboard is used.
 * @param appId The application the URL names, when it names a loaded one.
 */
export function FindDashboardTabForUrl<T extends DashboardUrlTab>(tabs: readonly T[], dashboardId: string, appId?: string): T | null {
  const dashboardTabs = tabs.filter((tab) => showsDashboard(tab, dashboardId));
  const appTab = appId ? dashboardTabs.find((tab) => UUIDsEqual(tab.applicationId, appId)) : undefined;
  return appTab ?? dashboardTabs[0] ?? null;
}

/** True when the tab is a dashboard tab for the dashboard. */
function showsDashboard(tab: DashboardUrlTab, dashboardId: string): boolean {
  const tabConfig = tab.configuration || {};
  const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
  const tabDashboardId = (tabConfig['dashboardId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;
  return resourceType === 'dashboards' && !!tabDashboardId && UUIDsEqual(tabDashboardId, dashboardId);
}

/** The parts of an app-scoped dashboard URL path: `/app/:appPath/dashboard/:dashboardId`. */
export interface AppDashboardUrl {
  /** The application path segment, decoded. */
  AppPath: string;
  /** The dashboard ID segment. */
  DashboardId: string;
}

/** Reads an app-scoped dashboard URL path. Returns null for any other path. */
export function ParseAppDashboardUrl(urlPath: string): AppDashboardUrl | null {
  const match = urlPath.match(/^\/app\/([^/]+)\/dashboard\/(.+)$/);
  return match ? { AppPath: decodeURIComponent(match[1]), DashboardId: match[2] } : null;
}

/** What OpenDashboardForUrl uses from the shell: its application lookup and NavigationService.OpenDashboard. */
export interface DashboardUrlOpener {
  /** The loaded application an application path names, if any. */
  FindApp(appPath: string): { ID: string } | null | undefined;
  OpenDashboard(dashboardId: string, dashboardName: string, options?: DashboardNavigationOptions): string;
}

/**
 * Opens the dashboard an app-scoped dashboard URL names, in a tab of the URL's application. The
 * ResourceResolver opens the same URL in that application too, so both reach one tab. When the URL
 * names no loaded application, the tab goes to the default application. Returns false, and opens
 * nothing, for any other URL path.
 */
export function OpenDashboardForUrl(urlPath: string, opener: DashboardUrlOpener): boolean {
  const url = ParseAppDashboardUrl(urlPath);
  if (!url) {
    return false;
  }
  const app = opener.FindApp(url.AppPath);
  opener.OpenDashboard(url.DashboardId, 'Dashboard', app ? { applicationId: app.ID } : undefined);
  return true;
}
