import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the application-host layer — the metadata reading and nav parsing that decide
 * which applications appear and which screen a nav item opens.
 *
 * The ClassFactory resolution itself is deliberately NOT unit-tested here: its whole value is that
 * it runs inside the real Hermes bundle, and a mocked registry would prove only that the mock
 * works. That path is covered by the `05-app-host` Maestro flow, which mounts a registered surface
 * on a device.
 */
const state = vi.hoisted(() => ({
    userAppRows: [] as Array<{ ApplicationID: string; Sequence: number | null }>,
    userAppSuccess: true,
    applications: [] as Array<Record<string, unknown>>,
    appsSuccess: true,
}));

vi.mock('@memberjunction/core', () => {
    class Metadata {
        CurrentUser = { ID: 'user-1' };
    }
    class RunView {
        async RunViews(): Promise<Array<{ Success: boolean; Results: unknown[] }>> {
            return [
                { Success: state.userAppSuccess, Results: state.userAppRows },
                { Success: state.appsSuccess, Results: state.applications },
            ];
        }
    }
    return { Metadata, RunView };
});

import { LoadUserApplications, ParseNavItems, DefaultNavItem } from '@/host/applications';

/** Builds an application row with sensible defaults, overridable per test. */
function app(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        ID: 'app-1',
        Name: 'Data Explorer',
        Description: 'Browse data',
        Icon: 'fa-solid fa-table',
        Color: '#264FAF',
        DefaultSequence: 100,
        DefaultForNewUser: true,
        DefaultNavItems: null,
        ...over,
    };
}

beforeEach(() => {
    state.userAppRows = [];
    state.userAppSuccess = true;
    state.applications = [app()];
    state.appsSuccess = true;
});

describe('ParseNavItems', () => {
    it('parses the nav shape MJ Explorer already uses', () => {
        const items = ParseNavItems(
            JSON.stringify([
                { Label: 'Data', Icon: 'fa-solid fa-table', ResourceType: 'Custom', DriverClass: 'DataExplorerResource', isDefault: true },
            ]),
        );
        expect(items).toEqual([
            { Label: 'Data', Icon: 'fa-solid fa-table', ResourceType: 'Custom', DriverClass: 'DataExplorerResource', isDefault: true },
        ]);
    });

    it('returns nothing for absent metadata rather than throwing', () => {
        expect(ParseNavItems(null)).toEqual([]);
        expect(ParseNavItems(undefined)).toEqual([]);
        expect(ParseNavItems('')).toEqual([]);
    });

    it('survives malformed JSON — one app loses its nav, the launcher survives', () => {
        expect(ParseNavItems('{not json')).toEqual([]);
    });

    it('ignores a non-array payload', () => {
        expect(ParseNavItems('{"Label":"Data"}')).toEqual([]);
    });

    it('drops non-object entries and labels an unlabelled item', () => {
        const items = ParseNavItems(JSON.stringify([null, 'nope', { Icon: 'x' }]));
        expect(items).toEqual([{ Label: 'Untitled', Icon: 'x', ResourceType: undefined, DriverClass: undefined, isDefault: false }]);
    });

    it('treats a non-boolean isDefault as not default', () => {
        const items = ParseNavItems(JSON.stringify([{ Label: 'A', isDefault: 'yes' }]));
        expect(items[0].isDefault).toBe(false);
    });
});

describe('DefaultNavItem', () => {
    const base = { ID: 'a', Name: 'A', Description: null, Icon: null, Color: null, Sequence: 0 };

    it('prefers the item flagged default', () => {
        const chosen = DefaultNavItem({
            ...base,
            NavItems: [{ Label: 'First' }, { Label: 'Second', isDefault: true }],
        });
        expect(chosen?.Label).toBe('Second');
    });

    it('falls back to the first item — an under-authored nav beats an empty screen', () => {
        const chosen = DefaultNavItem({ ...base, NavItems: [{ Label: 'Only' }] });
        expect(chosen?.Label).toBe('Only');
    });

    it('returns null when an application declares no navigation', () => {
        expect(DefaultNavItem({ ...base, NavItems: [] })).toBeNull();
    });
});

describe('LoadUserApplications', () => {
    it('scopes to the user\'s own applications when they have them', async () => {
        state.applications = [app({ ID: 'app-1', Name: 'Mine' }), app({ ID: 'app-2', Name: 'Theirs' })];
        state.userAppRows = [{ ApplicationID: 'app-2', Sequence: 5 }];
        const apps = await LoadUserApplications();
        expect(apps.map((a) => a.Name)).toEqual(['Theirs']);
    });

    it('matches application ids case-insensitively — UUID casing differs by platform', async () => {
        state.applications = [app({ ID: 'AAAA-BBBB', Name: 'Mine' })];
        state.userAppRows = [{ ApplicationID: 'aaaa-bbbb', Sequence: 1 }];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Mine']);
    });

    it('falls back to default-for-new-user apps when the user has no rows', async () => {
        state.applications = [app({ ID: 'a', Name: 'Shown' }), app({ ID: 'b', Name: 'Hidden', DefaultForNewUser: false })];
        state.userAppRows = [];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Shown']);
    });

    it('orders by the user\'s sequence, then by name', async () => {
        state.applications = [
            app({ ID: 'a', Name: 'Beta' }),
            app({ ID: 'b', Name: 'Alpha' }),
            app({ ID: 'c', Name: 'Gamma' }),
        ];
        state.userAppRows = [
            { ApplicationID: 'c', Sequence: 1 },
            { ApplicationID: 'a', Sequence: 2 },
            { ApplicationID: 'b', Sequence: 2 },
        ];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Gamma', 'Alpha', 'Beta']);
    });

    it('returns nothing when the applications query fails', async () => {
        state.appsSuccess = false;
        expect(await LoadUserApplications()).toEqual([]);
    });

    it('still lists applications when only the user-application query fails', async () => {
        state.userAppSuccess = false;
        expect((await LoadUserApplications()).length).toBe(1);
    });

    it('parses each application\'s nav items', async () => {
        state.applications = [
            app({ DefaultNavItems: JSON.stringify([{ Label: 'Data', isDefault: true }]) }),
        ];
        const [loaded] = await LoadUserApplications();
        expect(loaded.NavItems).toEqual([
            { Label: 'Data', Icon: undefined, ResourceType: undefined, DriverClass: undefined, isDefault: true },
        ]);
    });
});
