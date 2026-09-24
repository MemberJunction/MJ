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
    /** `MJ: User Applications` rows as `UserInfoEngine` hands them back — already ordered. */
    userAppRows: [] as Array<{ ApplicationID: string; Sequence: number | null; IsActive: boolean }>,
    /** `ApplicationInfo` rows as they arrive in the metadata payload. */
    applications: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/core', () => {
    class Metadata {
        CurrentUser = { ID: 'user-1' };
        get Applications() {
            return state.applications;
        }
    }
    return { Metadata };
});

vi.mock('@memberjunction/core-entities', () => ({
    UserInfoEngine: {
        Instance: {
            Config: async () => undefined,
            get UserApplications() {
                return state.userAppRows;
            },
        },
    },
}));

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
        Status: 'Active',
        ...over,
    };
}

beforeEach(() => {
    state.userAppRows = [];
    state.applications = [app()];
});

describe('ParseNavItems', () => {
    it('parses the nav shape MJ Explorer already uses', () => {
        const items = ParseNavItems(
            JSON.stringify([
                { Label: 'Data', Icon: 'fa-solid fa-table', ResourceType: 'Custom', DriverClass: 'DataExplorerResource', isDefault: true },
            ]),
        );
        expect(items).toEqual([
            {
                Label: 'Data',
                Icon: 'fa-solid fa-table',
                ResourceType: 'Custom',
                DriverClass: 'DataExplorerResource',
                RecordID: undefined,
                Status: undefined,
                isDefault: true,
            },
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
        expect(items).toEqual([
            {
                Label: 'Untitled',
                Icon: 'x',
                ResourceType: undefined,
                DriverClass: undefined,
                RecordID: undefined,
                Status: undefined,
                isDefault: false,
            },
        ]);
    });

    it('keeps RecordID — the record a non-Custom item opens', () => {
        // Dropping it is what forces every generic nav item to fall back to "opens on desktop":
        // the shell would know the item is a dashboard but not WHICH dashboard.
        const items = ParseNavItems(
            JSON.stringify([{ Label: 'Sales', ResourceType: 'Dashboards', RecordID: 'dash-9' }]),
        );
        expect(items[0]).toMatchObject({ ResourceType: 'Dashboards', RecordID: 'dash-9' });
    });

    it('hides items an administrator has deactivated, treating absent Status as active', () => {
        const items = ParseNavItems(
            JSON.stringify([
                { Label: 'Live' },
                { Label: 'Active', Status: 'Active' },
                { Label: 'Retired', Status: 'Disabled' },
            ]),
        );
        expect(items.map((i) => i.Label)).toEqual(['Live', 'Active']);
    });

    it('treats a non-boolean isDefault as not default', () => {
        const items = ParseNavItems(JSON.stringify([{ Label: 'A', isDefault: 'yes' }]));
        expect(items[0].isDefault).toBe(false);
    });
});

describe('DefaultNavItem', () => {
    const base = { ID: 'a', Name: 'A', Description: null, Icon: null, Color: null, Sequence: 0, DefaultSequence: 0 };

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

/** A `MJ: User Applications` row, active unless a test says otherwise. */
function userApp(applicationId: string, sequence: number, over: Partial<{ IsActive: boolean }> = {}) {
    return { ApplicationID: applicationId, Sequence: sequence, IsActive: true, ...over };
}

describe('LoadUserApplications', () => {
    it("scopes to the user's own applications when they have them", async () => {
        state.applications = [app({ ID: 'app-1', Name: 'Mine' }), app({ ID: 'app-2', Name: 'Theirs' })];
        state.userAppRows = [userApp('app-2', 5)];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Theirs']);
    });

    it('matches application ids case-insensitively — UUID casing differs by platform', async () => {
        state.applications = [app({ ID: 'AAAA-BBBB', Name: 'Mine' })];
        state.userAppRows = [userApp('aaaa-bbbb', 1)];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Mine']);
    });

    it('falls back to default-for-new-user apps when the user has no rows', async () => {
        state.applications = [app({ ID: 'a', Name: 'Shown' }), app({ ID: 'b', Name: 'Hidden', DefaultForNewUser: false })];
        state.userAppRows = [];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Shown']);
    });

    it('preserves the order UserInfoEngine already sorted the rows into', async () => {
        // The engine applies MJ's canonical `compareUserApplications` (user sequence → the
        // application's DefaultSequence → name). Re-sorting here would be a second, divergent
        // implementation of an ordering the web app has already decided.
        state.applications = [
            app({ ID: 'a', Name: 'Beta' }),
            app({ ID: 'b', Name: 'Alpha' }),
            app({ ID: 'c', Name: 'Gamma' }),
        ];
        state.userAppRows = [userApp('c', 1), userApp('a', 2), userApp('b', 2)];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('hides applications an administrator retired', async () => {
        // A deployment ships at least one Deprecated application, so this is not hypothetical.
        state.applications = [app({ ID: 'a', Name: 'Live' }), app({ ID: 'b', Name: 'Retired', Status: 'Deprecated' })];
        state.userAppRows = [userApp('a', 1), userApp('b', 2)];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Live']);
    });

    it('hides an application the user has deactivated for themselves', async () => {
        // The engine filters its cache by user but NOT by IsActive, so that predicate is ours.
        state.applications = [app({ ID: 'a', Name: 'On' }), app({ ID: 'b', Name: 'Off' })];
        state.userAppRows = [userApp('a', 1), userApp('b', 2, { IsActive: false })];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['On']);
    });

    it('skips a user row whose application is no longer in metadata', async () => {
        state.applications = [app({ ID: 'a', Name: 'Still here' })];
        state.userAppRows = [userApp('a', 1), userApp('deleted-app', 2)];
        expect((await LoadUserApplications()).map((a) => a.Name)).toEqual(['Still here']);
    });

    it('issues no queries at all — both halves are already cached', async () => {
        // `Metadata.Applications` rides in the metadata payload and `UserInfoEngine` caches the
        // user rows. Re-querying was two round trips per navigation, one an unbounded
        // entity_object hydration of every application in the deployment.
        state.userAppRows = [userApp('app-1', 1)];
        await expect(LoadUserApplications()).resolves.toBeDefined();
    });

    it('parses each application\'s nav items', async () => {
        state.applications = [
            app({ DefaultNavItems: JSON.stringify([{ Label: 'Data', isDefault: true }]) }),
        ];
        const [loaded] = await LoadUserApplications();
        expect(loaded.NavItems).toEqual([
            {
                Label: 'Data',
                Icon: undefined,
                ResourceType: undefined,
                DriverClass: undefined,
                RecordID: undefined,
                Status: undefined,
                isDefault: true,
            },
        ]);
    });
});
