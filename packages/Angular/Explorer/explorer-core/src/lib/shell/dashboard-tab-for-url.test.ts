/**
 * Logic spec for the shell's dashboard URL helpers. FindDashboardTabForUrl picks the tab the shell
 * activates for a dashboard URL (/app/:app/dashboard/:id). The shell runs it after every
 * navigation, including the URL sync that follows opening a tab, so it has to pick the tab that was
 * just opened. Two applications can each hold a tab for the same dashboard (Home and the Dashboards
 * app). OpenDashboardForUrl opens the tab when Back/Forward reaches a dashboard URL whose tab is
 * closed.
 */
import { describe, expect, it, vi } from 'vitest';
import { FindDashboardTabForUrl, OpenDashboardForUrl, ParseAppDashboardUrl, type DashboardUrlTab } from './dashboard-tab-for-url';

const HOME_APP = 'A0000000-0000-4000-8000-00000000000A';
const DASHBOARDS_APP = 'A0000000-0000-4000-8000-00000000000D';
const REVENUE = 'D0000000-0000-4000-8000-0000000000AA';
const QUOTA = 'D0000000-0000-4000-8000-0000000000BB';

interface Tab extends DashboardUrlTab {
  id: string;
}

const dashboardTab = (id: string, applicationId: string, dashboardId: string): Tab => ({
  id,
  applicationId,
  resourceRecordId: dashboardId,
  configuration: { resourceType: 'Dashboards', dashboardId, recordId: dashboardId },
});

const HOME_REVENUE = dashboardTab('tab-home-revenue', HOME_APP, REVENUE);
const DASHBOARDS_REVENUE = dashboardTab('tab-dashboards-revenue', DASHBOARDS_APP, REVENUE);

describe('FindDashboardTabForUrl', () => {
  it("finds the tab of the URL's application when two applications have a tab for the dashboard", () => {
    const tabs = [HOME_REVENUE, DASHBOARDS_REVENUE];

    expect(FindDashboardTabForUrl(tabs, REVENUE, DASHBOARDS_APP)).toBe(DASHBOARDS_REVENUE);
    expect(FindDashboardTabForUrl(tabs, REVENUE, HOME_APP)).toBe(HOME_REVENUE);
  });

  it('matches the application and dashboard ids in any letter case', () => {
    const tabs = [HOME_REVENUE, DASHBOARDS_REVENUE];

    expect(FindDashboardTabForUrl(tabs, REVENUE.toLowerCase(), DASHBOARDS_APP.toLowerCase())).toBe(DASHBOARDS_REVENUE);
  });

  it("falls back to the first tab of the dashboard when the URL's application has no tab for it", () => {
    expect(FindDashboardTabForUrl([DASHBOARDS_REVENUE], REVENUE, HOME_APP)).toBe(DASHBOARDS_REVENUE);
  });

  it('falls back to the first tab of the dashboard when the URL names no loaded application', () => {
    expect(FindDashboardTabForUrl([HOME_REVENUE, DASHBOARDS_REVENUE], REVENUE)).toBe(HOME_REVENUE);
  });

  it('ignores tabs of other dashboards and tabs that are not dashboard tabs', () => {
    const quota = dashboardTab('tab-quota', DASHBOARDS_APP, QUOTA);
    const record: Tab = {
      id: 'tab-record',
      applicationId: DASHBOARDS_APP,
      resourceRecordId: REVENUE,
      configuration: { resourceType: 'Records', Entity: 'MJ: Dashboards', recordId: REVENUE },
    };

    expect(FindDashboardTabForUrl([quota, record], REVENUE, DASHBOARDS_APP)).toBeNull();
    expect(FindDashboardTabForUrl([quota, record, HOME_REVENUE], REVENUE, DASHBOARDS_APP)).toBe(HOME_REVENUE);
  });

  it('reads the dashboard id from the configuration, then from the tab record id', () => {
    const idOnTab: Tab = { id: 'tab-legacy', applicationId: HOME_APP, resourceRecordId: REVENUE, configuration: { resourceType: 'dashboards' } };

    expect(FindDashboardTabForUrl([idOnTab], REVENUE, HOME_APP)).toBe(idOnTab);
  });
});

describe('ParseAppDashboardUrl', () => {
  it('reads the application path and the dashboard ID of an app-scoped dashboard URL', () => {
    expect(ParseAppDashboardUrl(`/app/dashboards/dashboard/${REVENUE}`)).toEqual({ AppPath: 'dashboards', DashboardId: REVENUE });
    expect(ParseAppDashboardUrl(`/app/My%20Dashboards/dashboard/${REVENUE}`)).toEqual({ AppPath: 'My Dashboards', DashboardId: REVENUE });
  });

  it('returns null for other URLs', () => {
    expect(ParseAppDashboardUrl('/app/dashboards/Browse')).toBeNull();
    expect(ParseAppDashboardUrl(`/app/home/record/MJ%3A%20Dashboards/${REVENUE}`)).toBeNull();
    expect(ParseAppDashboardUrl(`/dashboard/${REVENUE}`)).toBeNull();
  });
});

describe('OpenDashboardForUrl', () => {
  /** The shell's application lookup (Dashboards app only) and a NavigationService.OpenDashboard double. */
  const opener = () => ({
    FindApp: vi.fn((appPath: string) => (appPath === 'dashboards' ? { ID: DASHBOARDS_APP } : undefined)),
    OpenDashboard: vi.fn((_dashboardId: string, _dashboardName: string, _options?: { applicationId?: string }) => 'tab-new'),
  });

  it("opens the dashboard in a tab of the URL's application, the application the ResourceResolver uses", () => {
    const shell = opener();

    expect(OpenDashboardForUrl(`/app/dashboards/dashboard/${REVENUE}`, shell)).toBe(true);

    expect(shell.FindApp).toHaveBeenCalledExactlyOnceWith('dashboards');
    expect(shell.OpenDashboard).toHaveBeenCalledExactlyOnceWith(REVENUE, 'Dashboard', { applicationId: DASHBOARDS_APP });
  });

  it('opens the dashboard in the default application when the URL names no loaded application', () => {
    const shell = opener();

    expect(OpenDashboardForUrl(`/app/retired-app/dashboard/${REVENUE}`, shell)).toBe(true);

    expect(shell.OpenDashboard).toHaveBeenCalledExactlyOnceWith(REVENUE, 'Dashboard', undefined);
  });

  it('opens nothing for a URL that is not an app-scoped dashboard URL', () => {
    const shell = opener();

    expect(OpenDashboardForUrl('/app/dashboards/Browse', shell)).toBe(false);

    expect(shell.OpenDashboard).not.toHaveBeenCalled();
  });
});
