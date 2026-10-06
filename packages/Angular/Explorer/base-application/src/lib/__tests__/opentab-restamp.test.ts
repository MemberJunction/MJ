/**
 * FOCUSING AN EXISTING TAB RESTAMPS IT, because focusing IS accessing.
 *
 * `OpenTab` and `OpenTabForced` both have an existing-tab branch that set `activeTabId` and left
 * `lastAccessedAt` at whatever the tab last carried — while the new-tab branch beside them and
 * `SetActiveTab` both stamp. So reopening an already-open record made that tab active while looking
 * older than every other tab.
 *
 * Three things read the field, and all three were wrong for such a tab:
 *   · `records-hub-pill` picks the most recently accessed record tab;
 *   · `tab-container` falls back to the most recently accessed nav tab;
 *   · the shell's url-sync guard compares it against the current navigation (MJ#4989) — a stale stamp
 *     there means a url sync in flight still switches away from the tab the user just focused, which
 *     is the defect that guard exists to prevent.
 *
 * Raised as a question in review of MJ#4989: does the downstream failure happen on reopens too? It
 * does, because the stamp the guard reads was never taken.
 *
 * The mocks mirror `base-application.test.ts`, which is the only way this class loads outside Angular.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
    Component: () => (target: Function) => target,
    Directive: () => (target: Function) => target,
    Input: () => () => {},
    Output: () => () => {},
    EventEmitter: class { emit() {} },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        CurrentUser = { ID: 'user-123', Name: 'Test User' };
        Applications = [];
    },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    ApplicationInfo: class {},
    StartupManager: { Instance: { Startup: vi.fn() } },
}));

vi.mock('@memberjunction/core-entities', () => ({
    UserInfoEngine: {
        Instance: {
            Workspaces: [],
            UserApplications: [],
            CreateDefaultApplications: vi.fn().mockResolvedValue([]),
            DataChange$: { subscribe: vi.fn() },
            GetSetting: vi.fn(),
            SetSetting: vi.fn(),
        },
    },
}));

type Manager = InstanceType<typeof import('../workspace-state-manager').WorkspaceStateManager>;

const RECORD = {
    ApplicationId: 'app-1',
    Title: 'A record',
    ResourceRecordId: 'rec-1',
    Configuration: { resourceType: 'Records', Entity: 'MJ: Users' },
};

/** The stamp on a tab, as a number. 0 when the tab or the stamp is absent. */
function stampOf(manager: Manager, tabId: string): number {
    const tab = manager.GetConfiguration()?.tabs.find((t) => t.id === tabId);
    return tab?.lastAccessedAt ? Date.parse(tab.lastAccessedAt) : 0;
}

/**
 * Rewinds a tab's stamp, so "did the reopen restamp it" is answerable without sleeping.
 *
 * Two opens in the same millisecond produce the same ISO string, so comparing the stamp before and
 * after a reopen proves nothing on a fast machine. Backdating makes the question unambiguous.
 */
function backdate(manager: Manager, tabId: string, msAgo: number): void {
    const config = manager.GetConfiguration()!;
    manager.UpdateConfiguration({
        ...config,
        tabs: config.tabs.map((t) =>
            t.id === tabId ? { ...t, lastAccessedAt: new Date(Date.now() - msAgo).toISOString() } : t
        ),
    });
}

describe('reopening a record that is already open', () => {
    let manager: Manager;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('../workspace-state-manager');
        manager = new mod.WorkspaceStateManager();
        const { CreateDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
        manager.UpdateConfiguration(CreateDefaultWorkspaceConfiguration());
    });

    it('restamps the tab it focuses', () => {
        const tabId = manager.OpenTab(RECORD, '#ff0000');
        backdate(manager, tabId, 60_000);
        const before = stampOf(manager, tabId);

        const again = manager.OpenTab(RECORD, '#ff0000');

        expect(again, 'the same tab is reused').toBe(tabId);
        expect(stampOf(manager, tabId), 'and it is stamped as accessed now').toBeGreaterThan(before);
    });

    it('leaves it active, as it already did', () => {
        const tabId = manager.OpenTab(RECORD, '#ff0000');
        manager.OpenTab({ ...RECORD, ResourceRecordId: 'rec-2', Title: 'Another' }, '#ff0000');
        backdate(manager, tabId, 60_000);

        manager.OpenTab(RECORD, '#ff0000');

        expect(manager.GetConfiguration()!.activeTabId).toBe(tabId);
    });

    /**
     * The restamp must not disturb the tabs it is not focusing.
     *
     * THROUGH `OpenTabForced`, because `OpenTab` cannot set this up: it ignores `IsPinned` and always
     * opens a TEMP tab, so a second plain open REPLACES the first rather than opening beside it. Two
     * `OpenTab` calls therefore leave ONE tab, and this test's first draft was comparing a tab with
     * itself — measured, not guessed: the config held one tab, `rec-2`, `isPinned: false`.
     * `OpenTabForced` is the pinning path, and it carries the same restamp.
     */
    it('does not touch any other tab\'s stamp', () => {
        const first = manager.OpenTabForced(RECORD, '#ff0000');
        const second = manager.OpenTabForced(
            { ...RECORD, ResourceRecordId: 'rec-2', Title: 'Another' },
            '#ff0000'
        );
        backdate(manager, second, 60_000);
        const untouched = stampOf(manager, second);

        manager.OpenTabForced(RECORD, '#ff0000');

        expect(first, 'the two tabs must be distinct for this to mean anything').not.toBe(second);
        expect(stampOf(manager, first), 'the focused tab moves').toBeGreaterThan(untouched);
        expect(stampOf(manager, second), 'the other does not').toBe(untouched);
    });

    it('still refreshes the title and configuration it always refreshed', () => {
        const tabId = manager.OpenTab(RECORD, '#ff0000');
        manager.OpenTab({ ...RECORD, Title: 'Renamed' }, '#ff0000');

        const tab = manager.GetConfiguration()!.tabs.find((t) => t.id === tabId);
        expect(tab!.title).toBe('Renamed');
    });
});

describe('OpenTabForced focusing a tab that already exists', () => {
    let manager: Manager;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('../workspace-state-manager');
        manager = new mod.WorkspaceStateManager();
        const { CreateDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
        manager.UpdateConfiguration(CreateDefaultWorkspaceConfiguration());
    });

    /** The same omission lived in both methods, so it is pinned in both. */
    it('restamps the tab it focuses', () => {
        const tabId = manager.OpenTabForced(RECORD, '#ff0000');
        backdate(manager, tabId, 60_000);
        const before = stampOf(manager, tabId);

        const again = manager.OpenTabForced(RECORD, '#ff0000');

        expect(again).toBe(tabId);
        expect(stampOf(manager, tabId)).toBeGreaterThan(before);
    });
});
