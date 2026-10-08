/**
 * Checks the nav items of the Dashboards application metadata (`metadata/applications/`), which the
 * pages in this package depend on: the Library is the default page and uses the
 * DashboardBrowserResource driver, and Data Explorer has no Dashboards page.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DASHBOARDS_LIBRARY_NAV_ITEM } from '../shared/dashboards-app.helpers';

// The helpers import the Angular dashboard viewer, which this node test does not need.
vi.mock('@memberjunction/ng-dashboard-viewer', () => ({ CreateDefaultDashboardConfig: () => ({ layout: null }) }));

/** The repository root, six levels above src/__tests__. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

interface NavItemJson {
  Label: string;
  DriverClass?: string;
  isDefault?: boolean;
}

interface ApplicationJson {
  fields: { Name: string; DefaultNavItems: NavItemJson[] };
}

const application = (file: string): ApplicationJson =>
  JSON.parse(readFileSync(resolve(repoRoot, 'metadata/applications', file), 'utf8')) as ApplicationJson;

describe('Dashboards application metadata', () => {
  it('has the Library, its default page, and Categories', () => {
    const items = application('.dashboards-application.json').fields.DefaultNavItems;
    expect(items.map(i => [i.Label, i.DriverClass, i.isDefault === true])).toEqual([
      ['Library', 'DashboardBrowserResource', true],
      ['Categories', 'DashboardsCategoriesResource', false],
    ]);
  });

  it('names the Library nav item as the app helpers do', () => {
    expect(application('.dashboards-application.json').fields.DefaultNavItems.map(i => i.Label)).toContain(DASHBOARDS_LIBRARY_NAV_ITEM);
  });

  it('leaves no Dashboards page in Data Explorer', () => {
    expect(application('.data-explorer-application.json').fields.DefaultNavItems.map(i => i.DriverClass)).not.toContain('DashboardBrowserResource');
  });
});
