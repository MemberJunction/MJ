import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Ownership gate on `MJ: Dashboards`.
 *
 * `MJDashboardEntityExtended` IS the permission gate for dashboards — there is no row-level
 * filter behind it — so `Validate()` deciding ownership from the wrong value is a straight
 * authorization bypass, not a robustness issue.
 *
 * The specific trap: `UserID` is a settable field on `UpdateMJDashboardInput`, and
 * `ResolverBase.UpdateRecord` loads the row and then applies the client's values BEFORE
 * `Save()` runs `Validate()`. So by the time the gate runs, `this.UserID` is whatever the
 * caller sent. An owner check written against it lets any user who can load a dashboard send
 * `UpdateMJDashboard(ID: <victim's>, UserID: <self>)`, satisfy the check with the value they
 * just supplied, and take the record. The check has to read the PERSISTED owner, which
 * `BaseEntity` keeps on the field as `OldValue`.
 *
 * These tests drive `Validate()` directly with the field state the resolver would have
 * produced, which is the state the bypass depends on.
 */

const mocks = vi.hoisted(() => ({
    getDashboardPermissions: vi.fn(),
    engineConfig: vi.fn(),
    superValidate: vi.fn(),
    superDelete: vi.fn(),
    logError: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', () => {
    class MockValidationResult {
        Success = true;
        Errors: Array<{ Source: string; Message: string; Value: unknown }> = [];
    }
    return {
        BaseEntity: class {},
        LogError: mocks.logError,
        ValidationResult: MockValidationResult,
    };
});

vi.mock('../generated/entity_subclasses', () => ({
    MJDashboardEntity: class {
        // The real generated constructor takes 1-2 arguments. Vitest's typecheck pass reports a
        // zero-arg `new` against it as an UNHANDLED SOURCE ERROR, which exits the process non-zero
        // while the summary still reads "all passed" — the worst possible diagnostic shape. The
        // mock therefore accepts (and ignores) the same optional arguments.
        constructor(_entityName?: string, _contextUser?: unknown) { /* shape-only mock */ }

        public ID = 'DASH-1';
        public UserID = '';
        public IsSaved = true;
        public ContextCurrentUser: { ID: string } | null = null;
        public ProviderToUse: unknown = { CurrentUser: null };
        // The ownership gate reads this: `OldValue` is only server-loaded when the entity tracks
        // record changes, and is client-supplied otherwise. `MJ: Dashboards` ships with it on.
        public EntityInfo: { TrackRecordChanges: boolean } = { TrackRecordChanges: true };
        private _oldValues: Record<string, unknown> = {};

        public Validate() {
            return mocks.superValidate();
        }
        public async Delete() {
            return mocks.superDelete();
        }
        public GetFieldByName(name: string) {
            if (!(name in this._oldValues)) return null;
            const old = this._oldValues[name];
            // `Dirty` as BaseEntity computes it: the pending value differs from the loaded one.
            // The transfer gate reads it when the persisted owner is untrustworthy, because a save
            // that never touches UserID is not a transfer and must not be refused.
            const current = (this as unknown as Record<string, unknown>)[name];
            return { OldValue: old, Dirty: current !== old };
        }
        /** Seeds the loaded-from-database value, as InnerLoad would. */
        public __setPersisted(name: string, value: unknown) {
            this._oldValues[name] = value;
        }
    },
}));

vi.mock('../engines/dashboards', () => ({
    DashboardEngine: {
        Instance: {
            GetDashboardPermissions: mocks.getDashboardPermissions,
            Config: mocks.engineConfig,
        },
    },
}));

const OWNER = 'AAAAAAAA-0000-4000-8000-000000000001';
const ATTACKER = 'BBBBBBBB-0000-4000-8000-000000000002';

const noPermissions = {
    DashboardID: 'DASH-1',
    CanRead: false, CanEdit: false, CanDelete: false, CanShare: false,
    IsOwner: false, PermissionSource: 'none' as const,
};
const editOnly = { ...noPermissions, CanRead: true, CanEdit: true };

type Harness = {
    entity: {
        ID: string;
        UserID: string;
        IsSaved: boolean;
        ContextCurrentUser: { ID: string } | null;
        EntityInfo: { TrackRecordChanges: boolean };
        Validate: () => { Success: boolean; Errors: Array<{ Source: string; Message: string }> };
        Delete: () => Promise<boolean>;
        __setPersisted: (name: string, value: unknown) => void;
    };
};

async function makeEntity(persistedOwner: string, currentUserID: string): Promise<Harness> {
    const { MJDashboardEntityExtended } = await import('../custom/MJDashboardEntityExtended');
    // Constructed through a zero-arg alias. `vi.mock` replaces the module at RUNTIME, but Vitest's
    // typecheck pass is static and still resolves the real generated constructor (1-2 required
    // args). A bare `new MJDashboardEntityExtended()` therefore fails typecheck as an UNHANDLED
    // SOURCE ERROR — which exits the process non-zero while the summary still reads "all passed".
    const Ctor = MJDashboardEntityExtended as unknown as new () => Harness['entity'];
    const entity = new Ctor();
    entity.__setPersisted('UserID', persistedOwner);
    entity.UserID = persistedOwner;
    entity.IsSaved = true;
    entity.ContextCurrentUser = { ID: currentUserID };
    return { entity };
}

describe('MJDashboardEntityExtended ownership gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superValidate.mockImplementation(() => ({ Success: true, Errors: [] }));
        mocks.superDelete.mockResolvedValue(true);
        mocks.engineConfig.mockResolvedValue(undefined);
        mocks.getDashboardPermissions.mockReturnValue(noPermissions);
    });

    it('refuses a non-owner who sets UserID to themselves in the same save', async () => {
        const { entity } = await makeEntity(OWNER, ATTACKER);
        // Exactly what SetMany(input) does with a client-supplied UserID.
        entity.UserID = ATTACKER;

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        // The engine MUST have been consulted — reading the pending UserID would have
        // short-circuited past it, which is the bypass.
        expect(mocks.getDashboardPermissions).toHaveBeenCalledWith('DASH-1', ATTACKER);
    });

    it('refuses an ownership transfer by a non-owner who legitimately has edit rights', async () => {
        mocks.getDashboardPermissions.mockReturnValue(editOnly);
        const { entity } = await makeEntity(OWNER, ATTACKER);
        entity.UserID = ATTACKER;

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors.some((e) => e.Source === 'UserID')).toBe(true);
    });

    it('allows a shared editor to save changes that do not touch ownership', async () => {
        mocks.getDashboardPermissions.mockReturnValue(editOnly);
        const { entity } = await makeEntity(OWNER, ATTACKER);

        expect(entity.Validate().Success).toBe(true);
    });

    it('allows the owner to save without consulting a possibly-cold engine cache', async () => {
        const { entity } = await makeEntity(OWNER, OWNER);

        expect(entity.Validate().Success).toBe(true);
        expect(mocks.getDashboardPermissions).not.toHaveBeenCalled();
    });

    it('allows the owner to transfer ownership to someone else', async () => {
        const { entity } = await makeEntity(OWNER, OWNER);
        entity.UserID = ATTACKER;

        expect(entity.Validate().Success).toBe(true);
    });

    it('lets the owner delete even when the engine cache is stale', async () => {
        // A dashboard created since the last Config() is absent from the backing array, so
        // GetDashboardPermissions answers "none" — which must not refuse its own owner.
        const { entity } = await makeEntity(OWNER, OWNER);

        expect(await entity.Delete()).toBe(true);
        expect(mocks.superDelete).toHaveBeenCalled();
    });

    describe('when change tracking is disabled, the persisted owner is untrustworthy', () => {
        // `ResolverBase.UpdateRecord` re-reads the record server-side only when the entity has
        // `TrackRecordChanges`. Without it the resolver hydrates from the client's `OldValues___`,
        // and first-set hydration writes `Value` AND `OldValue` — so `OldValue` becomes
        // attacker-supplied and both gates would be checking the caller's claim against itself.
        // `TrackRecordChanges` is an ordinary admin-editable field with nothing tying it to this
        // control, so the failure has to be loud rather than silent.
        it('withholds the owner shortcut but does NOT refuse an ordinary save', async () => {
            // Refusing outright would turn an auditing setting into a total outage — nobody, owner
            // included, could update any dashboard, with the error blaming a setting they never
            // touched. Withholding the shortcut and letting the engine decide is exactly the
            // behaviour that shipped before this gate existed, so it is strictly no weaker.
            mocks.getDashboardPermissions.mockReturnValue(editOnly);
            const { entity } = await makeEntity(OWNER, OWNER);
            entity.EntityInfo = { TrackRecordChanges: false };

            const result = entity.Validate();

            expect(result.Success).toBe(true);
            // The owner branch must NOT have been taken on trust — the engine had to answer.
            expect(mocks.getDashboardPermissions).toHaveBeenCalled();
        });

        it('still refuses the escalation: a non-owner cannot self-grant via OldValues___', async () => {
            // The attack the gate exists for. With tracking off the attacker controls OldValue too,
            // so the owner branch must be unreachable and the engine's answer must stand.
            mocks.getDashboardPermissions.mockReturnValue(noPermissions);
            const { entity } = await makeEntity(ATTACKER, ATTACKER);
            entity.EntityInfo = { TrackRecordChanges: false };

            const result = entity.Validate();

            expect(result.Success).toBe(false);
            expect(result.Errors.some((e) => e.Source === 'Permission')).toBe(true);
        });

        it('refuses an ownership TRANSFER, since the current owner cannot be established', async () => {
            mocks.getDashboardPermissions.mockReturnValue(editOnly);
            const { entity } = await makeEntity(OWNER, OWNER);
            entity.EntityInfo = { TrackRecordChanges: false };
            entity.UserID = ATTACKER;   // marks the field dirty

            const result = entity.Validate();

            expect(result.Success).toBe(false);
            expect(result.Errors.some((e) => e.Source === 'UserID' && /cannot be transferred/i.test(e.Message))).toBe(true);
        });

        it('does not let a delete take the owner shortcut, falling through to the engine', async () => {
            const { entity } = await makeEntity(OWNER, OWNER);
            entity.EntityInfo = { TrackRecordChanges: false };

            // Delete is async, so unlike Validate() it can consult the authoritative source.
            expect(await entity.Delete()).toBe(false);
            expect(mocks.superDelete).not.toHaveBeenCalled();
            expect(mocks.engineConfig).toHaveBeenCalled();
        });
    });

    it('reports a permission-load failure as false rather than throwing out of Delete', async () => {
        // `Delete()` is documented to signal logical failure by RETURNING false — callers check the
        // boolean, they do not wrap it in try/catch. Consulting the engine introduced the only call
        // here that can reject, so an unguarded await would have changed this method's contract for
        // every caller as a side effect, and only on the cold-cache path nobody exercises.
        const { entity } = await makeEntity(OWNER, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB');
        mocks.engineConfig.mockRejectedValueOnce(new Error('permission source unavailable'));

        await expect(entity.Delete()).resolves.toBe(false);
        expect(mocks.superDelete, 'a failure to load permissions must never fall through to a delete')
            .not.toHaveBeenCalled();
    });

    it('refuses a delete by a non-owner with no granted permission', async () => {
        const { entity } = await makeEntity(OWNER, ATTACKER);

        expect(await entity.Delete()).toBe(false);
        expect(mocks.superDelete).not.toHaveBeenCalled();
        // The non-owner path is the one that needs the engine, so it must load it.
        expect(mocks.engineConfig).toHaveBeenCalled();
    });
});
