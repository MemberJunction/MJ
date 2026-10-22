import { describe, expect, it, beforeAll, vi } from 'vitest';

// The lists are React screens pulling expo-router and RN hooks; this file is about the
// registration, not about rendering them, so they are stubbed to keep the import graph small.
vi.mock('@/explorer/ExplorerLists', () => ({
    EntityList: function EntityList() { return null; },
    QueryList: function QueryList() { return null; },
    DashboardList: function DashboardList() { return null; },
}));

const { ResolveMobileResource } = await import('../host/BaseMobileResource');
const { LoadDataExplorerMobileResources } = await import('../host/data-explorer-resources');

/**
 * @fileoverview Data Explorer's nav items resolve to this app's own surfaces.
 *
 * ## The bug this pins
 *
 * The app had a native Data Explorer reachable from Home for a long time while opening the *same
 * application* from Apps said "opens on desktop" — nothing had claimed the driver classes the
 * application's metadata names. The capability was there; only the registration was missing, and
 * nothing failed loudly enough to notice.
 *
 * The driver strings below are not this app's to choose. They come from
 * `MJ: Applications.DefaultNavItems`, and the Angular shell resolves the same strings against
 * `BaseResourceComponent`. A test that asserted whatever the code happened to register would pin
 * nothing; these are the values in the metadata.
 */

beforeAll(() => {
    // Registration is a module side effect, exactly as it is at app start; the loader exists so a
    // bundler cannot drop the module.
    LoadDataExplorerMobileResources();
});

/** The driver classes `Data Explorer` declares, in nav order. */
const DATA_EXPLORER_DRIVERS = ['DataExplorerResource', 'QueryBrowserResource', 'DashboardBrowserResource'];

describe('Data Explorer mobile resources', () => {
    it('resolves every nav item the application declares', () => {
        for (const driver of DATA_EXPLORER_DRIVERS) {
            const resource = ResolveMobileResource(driver);
            expect(resource, `${driver} should resolve to a mobile surface`).not.toBeNull();
        }
    });

    it('gives each one a component to render', () => {
        for (const driver of DATA_EXPLORER_DRIVERS) {
            expect(typeof ResolveMobileResource(driver)?.Component).toBe('function');
        }
    });

    it('titles each surface for the nav item it serves', () => {
        expect(ResolveMobileResource('DataExplorerResource')?.Title).toBe('Data');
        expect(ResolveMobileResource('QueryBrowserResource')?.Title).toBe('Queries');
        expect(ResolveMobileResource('DashboardBrowserResource')?.Title).toBe('Dashboards');
    });

    it('returns a distinct surface per driver, not one list three times', () => {
        const components = DATA_EXPLORER_DRIVERS.map((d) => ResolveMobileResource(d)?.Component);
        expect(new Set(components).size).toBe(DATA_EXPLORER_DRIVERS.length);
    });

    it('still resolves nothing for a driver no build ships', () => {
        // The fallback has to keep working: an application this build does not host must reach the
        // honest "opens on desktop" card rather than a blank screen.
        expect(ResolveMobileResource('SomeDriverNobodyRegistered')).toBeNull();
        expect(ResolveMobileResource(undefined)).toBeNull();
    });
});
