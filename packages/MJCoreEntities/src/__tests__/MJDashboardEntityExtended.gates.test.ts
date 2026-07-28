import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DashboardUserPermissions } from '../engines/dashboards';

/**
 * `MJDashboardEntityExtended.Validate()` / `.Delete()` are the ONLY server-side enforcement of the
 * dashboard sharing model — the GraphQL `UpdateMJDashboard` / `DeleteMJDashboard` resolvers reach
 * these gates through `BaseEntity`, and nothing else re-checks.
 *
 * That makes the unconfigured-engine case load-bearing. MJServer never configures `DashboardEngine`
 * explicitly; it is pre-warmed only by `StartupManager` `'full'` via `@RegisterForStartup`. Both
 * `MJ_STARTUP_MODE=task` and a failed boot load bypass that — and `BaseEngine.Load` leaves
 * `_loaded = false` WITHOUT throwing when a config fails (a transient `RunView` error at boot). So
 * "engine not loaded" is reachable inside a live MJAPI, not just in the CLI. A gate that treats it
 * as permission-to-proceed is fail-OPEN: every authenticated user could edit or delete any dashboard.
 *
 * These gates therefore ensure the engine is loaded and then honour the real answer. "I could not
 * evaluate" must deny, exactly as it did before the `'unevaluated'` source existed.
 */

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

const logStatus = vi.fn();
const logError = vi.fn();

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class {},
    LogError: (...args: unknown[]) => logError(...args),
    LogStatus: (...args: unknown[]) => logStatus(...args),
    ValidationResult: class {},
}));

/** Spy on the base-class writes so we can assert the gate acted BEFORE they ran. */
const superDelete = vi.fn(async () => true);
const superSave = vi.fn(async () => true);

vi.mock('../generated/entity_subclasses', () => ({
    MJDashboardEntity: class {
        public ID = 'dash-1111-2222-3333-444444444444';
        public IsSaved = true;
        public ContextCurrentUser: { ID: string } | null = null;
        public ProviderToUse: { CurrentUser?: { ID: string } } = {};
        public Delete(): Promise<boolean> {
            return superDelete();
        }
        public Save(): Promise<boolean> {
            return superSave();
        }
        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }
        public NewRecord(): boolean {
            return true;
        }
        public Set(): void {
            /* no-op */
        }
    },
}));

/**
 * Mirrors the real engine: an unloaded cache answers 'unevaluated' with every grant false, and
 * only a LOADED cache can report ownership. So a gate that never loads can never see a grant —
 * which is what makes "did the gate load the engine?" observable through behaviour alone.
 */
const engineState = {
    Loaded: false,
    /** What the loaded cache says about SOME_USER for this dashboard. */
    loadedPermissions: {
        DashboardID: 'dash-1111-2222-3333-444444444444',
        CanRead: false,
        CanEdit: false,
        CanDelete: false,
        CanShare: false,
        IsOwner: false,
        PermissionSource: 'none',
    } as DashboardUserPermissions,
    /** When true, EnsureLoaded rejects — the transient-boot-failure case. */
    loadFails: false,
    /** Mirrors BaseEngine.IsPermissionConstrained: loaded, but with every array emptied. */
    permissionConstrained: false,
};

const UNEVALUATED: DashboardUserPermissions = {
    DashboardID: 'dash-1111-2222-3333-444444444444',
    CanRead: false,
    CanEdit: false,
    CanDelete: false,
    CanShare: false,
    IsOwner: false,
    PermissionSource: 'unevaluated',
};

const ensureLoaded = vi.fn(async () => {
    if (engineState.loadFails) {
        throw new Error('RunView failed during DashboardEngine config load');
    }
    engineState.Loaded = true;
});

vi.mock('../engines/dashboards', () => ({
    DashboardEngine: {
        get Instance() {
            return {
                get Loaded() {
                    return engineState.Loaded;
                },
                EnsureLoaded: ensureLoaded,
                get IsPermissionConstrained() { return engineState.permissionConstrained; },
                GetDashboardPermissions: () =>
                    engineState.Loaded ? engineState.loadedPermissions : UNEVALUATED,
            };
        },
    },
}));

const { MJDashboardEntityExtended } = await import('../custom/MJDashboardEntityExtended');

const SOME_USER = { ID: 'user-aaaa-bbbb-cccc-dddddddddddd' };

function newDashboard(): InstanceType<typeof MJDashboardEntityExtended> {
    const d = new MJDashboardEntityExtended();
    d.ContextCurrentUser = SOME_USER as never;
    return d;
}

describe('MJDashboardEntityExtended — permission gates when the engine cannot be consulted', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        engineState.Loaded = false;
        engineState.loadFails = false;
        engineState.permissionConstrained = false;
        engineState.loadedPermissions = {
            DashboardID: 'dash-1111-2222-3333-444444444444',
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            IsOwner: false,
            PermissionSource: 'none',
        };
    });

    it('Delete() denies rather than proceeding when the sharing model could not be evaluated', async () => {
        engineState.loadFails = true;

        const deleted = await newDashboard().Delete();

        // Fail CLOSED. An unanswerable permission question is not a yes.
        expect(deleted).toBe(false);
        expect(superDelete).not.toHaveBeenCalled();
    });

    it('Save() loads the sharing model BEFORE the base class validates', async () => {
        // Validate() is synchronous and cannot await, so the load has to happen in Save(). If it
        // did not, the gate would read an unloaded cache and deny every write in any process that
        // does not pre-warm engines — which is what broke `mj sync push`.
        const order: string[] = [];
        ensureLoaded.mockImplementationOnce(async () => { order.push('load'); engineState.Loaded = true; });
        superSave.mockImplementationOnce(async () => { order.push('save'); return true; });

        const saved = await newDashboard().Save();

        expect(order).toEqual(['load', 'save']);
        expect(saved).toBe(true);
    });

    it('Save() still saves a NEW record without loading — the gate only applies to existing rows', async () => {
        const d = newDashboard();
        d.IsSaved = false;

        await d.Save();

        expect(ensureLoaded).not.toHaveBeenCalled();
        expect(superSave).toHaveBeenCalled();
    });

    it('names a permission-constrained cache as the cause instead of blaming the user', async () => {
        // BaseEngine's permission handling is all-or-nothing: a user lacking read on ANY config
        // gets every array emptied, `_loaded` set true, and no retry. Since the engine is a
        // process-global singleton, that seats an empty cache for everyone — and every dashboard
        // then reports 'none', which is indistinguishable from a real denial without this.
        engineState.permissionConstrained = true;
        engineState.loadedPermissions = { ...engineState.loadedPermissions, PermissionSource: 'none' };

        const deleted = await newDashboard().Delete();

        expect(deleted).toBe(false);   // still fails closed — this changes the message, not the grant
        const logged = logError.mock.calls.flat().join(' ');
        expect(logged).toMatch(/could not be evaluated/i);
        expect(logged).toMatch(/without read access/i);
    });

    it('Delete() loads the sharing model first, so a genuine owner is permitted', async () => {
        // This is the `mj sync push` case: the System user OWNS the dashboards in metadata/, so
        // once the engine is actually loaded the delete succeeds on real ownership — no exemption.
        engineState.loadedPermissions = {
            ...engineState.loadedPermissions,
            CanDelete: true,
            IsOwner: true,
            PermissionSource: 'owner',
        };

        const deleted = await newDashboard().Delete();

        expect(ensureLoaded).toHaveBeenCalled();
        expect(deleted).toBe(true);
        expect(superDelete).toHaveBeenCalled();
    });
});
