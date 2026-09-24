/**
 * Unit tests for `MJUserEntityServer` — the privilege-elevation guard on `MJ: Users` (issue #4260).
 *
 * The guard exists because role grants cannot express it. Verified against a LIVE database (not
 * just the baseline seed): the `Developer` and `Integration` roles hold unfiltered
 * CanCreate/CanUpdate/CanDelete on `MJ: Users`, `AllowUpdateAPI`/`AllowDeleteAPI` are true on the
 * entity and `AllowUpdateAPI` is true on both `Type` and `Name`, `__mj.User.Name` has NO unique
 * index, and there is no per-role FIELD permission in MJ — only `RowLevelSecurityFilter`, which
 * cannot help here: scoping an update to the caller's own row still permits setting one's OWN
 * `Type` to 'Owner', which IS the escalation.
 *
 * The generated base (`MJUserEntity`) is mocked to a settable stub with per-field Dirty/OldValue
 * state, matching the approach in MJUserRoutineEntityServer.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Neutralize the class-factory registration decorator; keep UUIDsEqual real.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

interface StubField {
    Name: string;
    Dirty: boolean;
    OldValue: string | null;
}

// `vi.mock` factories are hoisted above every top-level declaration in this file (including
// `import`s and `class`/`const` statements below this point). A stub class declared as an outer
// `class` and referenced from inside this factory throws `ReferenceError: Cannot access
// 'StubUserEntity' before initialization` at import time — the factory runs before the outer
// class's own declaration does. Declaring the stub class INSIDE the factory (as
// MJUserRoutineEntityServer.test.ts does with `MockMJUserRoutineEntity`) avoids the forward
// reference entirely.
vi.mock('@memberjunction/core-entities', () => {
    /** Minimal stand-in for the generated MJUserEntity, with controllable field state. */
    class StubUserEntity {
        public ID = '';
        public Name = '';
        public Type: 'Owner' | 'User' = 'User';
        public IsSaved = true;
        public ContextCurrentUser: { ID: string; Type: string } | null = null;
        public SuperDeleteCalled = false;

        protected fields = new Map<string, StubField>();

        public GetFieldByName(name: string): StubField | undefined {
            return this.fields.get(name);
        }

        public SetFieldState(name: string, dirty: boolean, oldValue: string | null): void {
            this.fields.set(name, { Name: name, Dirty: dirty, OldValue: oldValue });
        }

        /**
         * BaseEntity exposes this as a protected getter; the guard reads it. NOTE: this stub
         * returns only `ContextCurrentUser`. The real getter (`baseEntity.ts:3967`) falls back
         * further — `ContextCurrentUser || ProviderToUse.CurrentUser || Metadata.Provider.CurrentUser`
         * — so production's per-provider / global-default caller resolution is NOT exercised by
         * these tests. Every test here sets `ContextCurrentUser` explicitly to sidestep that gap.
         */
        protected get ActiveUser(): { ID: string; Type: string } | null {
            return this.ContextCurrentUser;
        }

        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }

        public async Delete(): Promise<boolean> {
            this.SuperDeleteCalled = true;
            return true;
        }

        public SuperSaveCalled = false;
        /**
         * Mirrors the two behaviours of `BaseEntity.Save()` that matter here:
         *   1. an ordinary save calls `Validate()` and fails the save when it fails
         *      (baseEntity.ts:3730), and
         *   2. under `ReplayOnly` validation is force-passed WITHOUT calling `Validate()` at all
         *      (baseEntity.ts:3725), so the guard's Validate-based invariants are skipped.
         * Reaching this method means the write would have gone through.
         *
         * Routing through `this.Validate()` is deliberate rather than returning a bare `true`: it is
         * what makes the ordinary-save tests assert the real `Save()` -> `Validate()` COMPOSITION
         * instead of merely asserting that the override delegated to `super`. With a bare `true`,
         * those tests stayed green even with the `Validate()` override deleted.
         */
        public async Save(options?: { ReplayOnly?: boolean }): Promise<boolean> {
            this.SuperSaveCalled = true;
            if (options?.ReplayOnly) {
                return true;
            }
            return this.Validate().Success;
        }

        /** No-op stand-in: the guard's Delete() refusal path records a BaseEntityResult here. */
        public RegisterResultHistoryEntry(_result: unknown): void {
            // intentionally empty — these tests assert on the boolean return value, not LatestResult
        }
    }
    return { MJUserEntity: StubUserEntity };
});

// `vi.mock` calls are hoisted above imports, so a plain static import here already sees the stub.
// The stub's extra members (SetFieldState, settable IsSaved) are not on the real MJUserEntity's
// type, so this import is deliberately untyped-through-the-stub — the same shape
// MJUserRoutineEntityServer.test.ts uses. Test files are excluded from this package's `tsc` build
// (see tsconfig.json's `exclude`) and vitest transforms with esbuild, so this is a runtime-only
// concern, not a compile error.
import { MJUserEntityServer } from '../custom/MJUserEntityServer.server.js';

const OWNER = { ID: '11111111-1111-1111-1111-111111111111', Type: 'Owner' };
const ALICE = { ID: '22222222-2222-2222-2222-222222222222', Type: 'User' };
const BOB = { ID: '33333333-3333-3333-3333-333333333333', Type: 'User' };

/**
 * The stub base's `SuperDeleteCalled` tracking flag (declared on `StubUserEntity` above, inside
 * the `vi.mock` factory) is not part of the real `MJUserEntity`/`MJUserEntityServer` TYPE — the
 * mock swaps the runtime value, not what `tsc` sees. A single non-`unknown` intersection cast
 * (mirroring `MockHooks` in MJUserRoutineEntityServer.test.ts) gives call sites a typed member
 * with no per-call-site cast, instead of `as unknown as {...}`, which this repo forbids.
 */
interface StubDeleteHooks {
    SuperDeleteCalled: boolean;
    SuperSaveCalled: boolean;
}

/** Builds a guard instance representing an EXISTING row `rowId`, saved by `caller`. */
function existingRow(rowId: string, caller: { ID: string; Type: string } | null): MJUserEntityServer & StubDeleteHooks {
    const e = new MJUserEntityServer() as MJUserEntityServer & StubDeleteHooks;
    e.IsSaved = true;
    e.ID = rowId;
    e.SetFieldState('ID', false, rowId);
    e.SetFieldState('Type', false, 'User');
    e.ContextCurrentUser = caller;
    return e;
}

function messages(result: { Errors: unknown[] }): string {
    return result.Errors.map((x) => (x as { Message: string }).Message).join(' | ');
}

describe('MJUserEntityServer — privilege elevation guard (issue #4260)', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('creation: a non-Owner may not create a MJ: Users row at all', () => {
        it('REJECTS a non-Owner creating a new user — even one that never touches Type=Owner', () => {
            // Fix-round-1 (Important #1): Name has no unique index and non-Owner roles hold
            // CanCreate, so refusing only Type='Owner' on create leaves a non-Owner free to repeat
            // `Create` with Name set to the configured principal string until a row sorts below
            // the real system user by ID — the same escalation invariant 4 blocks on UPDATE,
            // reached through INSERT instead. Creation must be refused outright.
            const e = new MJUserEntityServer();
            e.IsSaved = false;
            e.Type = 'User';
            e.Name = 'System'; // the configured principal string, chosen by the attacker
            e.SetFieldState('Type', true, null);
            e.SetFieldState('Name', true, null);
            e.ContextCurrentUser = ALICE;

            const result = e.Validate();

            expect(result.Success).toBe(false);
        });

        it('REJECTS a non-Owner creating a new Owner (the original escalation vector)', () => {
            const e = new MJUserEntityServer();
            e.IsSaved = false;
            e.Type = 'Owner';
            e.SetFieldState('Type', true, null);
            e.ContextCurrentUser = ALICE;

            expect(e.Validate().Success).toBe(false);
        });

        it('ALLOWS an Owner to create a new user — auto-provisioning and admin user-creation both run as an Owner', () => {
            const e = new MJUserEntityServer();
            e.IsSaved = false;
            e.Name = 'new@example.com';
            e.Type = 'User';
            e.SetFieldState('Name', true, null);
            e.SetFieldState('Type', true, null);
            e.ContextCurrentUser = OWNER;

            expect(e.Validate().Success).toBe(true);
        });
    });

    describe('invariant: a non-Owner may not change Type on an existing row', () => {
        it('REJECTS a non-Owner promoting their OWN row to Owner — the core escalation', () => {
            const e = existingRow(ALICE.ID, ALICE);
            e.Type = 'Owner';
            e.SetFieldState('Type', true, 'User');

            const result = e.Validate();

            expect(result.Success).toBe(false);
            expect(messages(result)).toContain('Type');
        });

        it('REJECTS a non-Owner demoting an Owner', () => {
            const e = existingRow(ALICE.ID, ALICE);
            e.Type = 'User';
            e.SetFieldState('Type', true, 'Owner');

            expect(e.Validate().Success).toBe(false);
        });

        it('ALLOWS a non-Owner saving their own row when Type is untouched', () => {
            const e = existingRow(ALICE.ID, ALICE);
            e.Name = 'alice@example.com';
            e.SetFieldState('Type', false, 'User');

            expect(e.Validate().Success).toBe(true);
        });

        it('ALLOWS an Owner promoting another user — admin must keep working', () => {
            const e = existingRow(BOB.ID, OWNER);
            e.Type = 'Owner';
            e.SetFieldState('Type', true, 'User');

            expect(e.Validate().Success).toBe(true);
        });

        it('treats the Owner check case- and padding-insensitively (Type is an NCHAR column)', () => {
            const e = existingRow(BOB.ID, { ID: OWNER.ID, Type: '  OWNER  ' });
            e.Type = 'Owner';
            e.SetFieldState('Type', true, 'User');

            expect(e.Validate().Success).toBe(true);
        });
    });

    describe('invariant: a non-Owner may only modify their own row', () => {
        it("REJECTS a non-Owner editing another user's row", () => {
            const e = existingRow(BOB.ID, ALICE);
            e.Name = 'hijacked@example.com';

            const result = e.Validate();

            expect(result.Success).toBe(false);
            expect(messages(result)).toContain('own');
        });

        it('compares against the PRE-SAVE ID, so overwriting ID cannot bypass the check', () => {
            // Row belongs to Bob; Alice rewrites the in-memory ID to her own and saves.
            const e = existingRow(BOB.ID, ALICE);
            e.ID = ALICE.ID;                       // attacker-controlled post-image
            e.SetFieldState('ID', true, BOB.ID);   // pre-image is still Bob

            expect(e.Validate().Success).toBe(false);
        });

        it('REJECTS (fails CLOSED) when the pre-save ID cannot be established at all', () => {
            // Fix-round-1 (Minor #5): the guard must not fail open when it cannot determine the
            // pre-save identity. `OldValue: null` simulates a row whose pre-save value is unknown.
            const e = existingRow(BOB.ID, ALICE);
            e.SetFieldState('ID', false, null);
            e.Name = 'edited@example.com';

            const result = e.Validate();

            expect(result.Success).toBe(false);
        });
    });

    describe('invariant: a non-Owner may not change Name on an existing row (the context-user ladder rung)', () => {
        it("REJECTS a non-Owner renaming themselves to the configured principal's name", () => {
            // resolvePrincipalFrom matches contextUserForNewUserCreation against User.Name FIRST,
            // breaking ties by lowest ID. Renaming yourself to 'System' is how you become the
            // principal the server provisions as.
            const e = existingRow(ALICE.ID, ALICE);
            e.Name = 'System';
            e.SetFieldState('Name', true, 'alice@example.com');

            const result = e.Validate();

            expect(result.Success).toBe(false);
            expect(messages(result)).toContain('Name');
        });

        it('ALLOWS a non-Owner saving their own row when Name is untouched', () => {
            const e = existingRow(ALICE.ID, ALICE);
            e.SetFieldState('Name', false, 'alice@example.com');

            expect(e.Validate().Success).toBe(true);
        });

        it('ALLOWS an Owner renaming a user — admin user management must keep working', () => {
            const e = existingRow(BOB.ID, OWNER);
            e.Name = 'renamed@example.com';
            e.SetFieldState('Name', true, 'bob@example.com');

            expect(e.Validate().Success).toBe(true);
        });
    });

    describe('deletion: a non-Owner may not delete a MJ: Users row at all', () => {
        it('REJECTS a non-Owner deleting their OWN row — MJ deactivates via IsActive, it does not delete', async () => {
            const e = existingRow(ALICE.ID, ALICE);

            const ok = await e.Delete();

            expect(ok).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
        });

        it('REJECTS a non-Owner deleting an OWNER row — an unguarded delete would let a non-Owner remove the very accounts this guard depends on', async () => {
            const e = existingRow(OWNER.ID, ALICE);

            expect(await e.Delete()).toBe(false);
        });

        it('ALLOWS an Owner to delete a user row', async () => {
            const e = existingRow(BOB.ID, OWNER);

            const ok = await e.Delete();

            expect(ok).toBe(true);
            expect(e.SuperDeleteCalled).toBe(true);
        });
    });

    describe('no caller', () => {
        it('is treated as exempt (Owner-equivalent) — but CheckPermissions rejects a caller-less save before Validate() ever runs in production', () => {
            // BaseEntity.CheckPermissions throws when ActiveUser is falsy (baseEntity.ts:4003-4005),
            // and Save() calls CheckPermissions (baseEntity.ts:3702) BEFORE it calls Validate()
            // (baseEntity.ts:3730). So a caller-less save never reaches this guard at all in
            // production — treating "no caller" as exempt here is a deliberate default for the
            // callers that DO legitimately invoke Validate() directly with no context user (this
            // test, or a system/CLI path running under a bound provider default), not a hole this
            // guard is meant to police.
            const e = existingRow(ALICE.ID, null);
            e.Type = 'Owner';
            e.SetFieldState('Type', true, 'User');

            expect(e.Validate().Success).toBe(true);
        });
    });

    describe('ReplayOnly: the Save-side invariants must not be switchable off (gauntlet D1)', () => {
        // BaseEntity.Save() force-passes validation under ReplayOnly WITHOUT calling Validate()
        // (baseEntity.ts:3725), and ReplayOnly does NOT suppress the write
        // (databaseProviderBase.ts:1436-1443). Invariants 1-4 live in Validate(), so a ReplayOnly
        // save skipped all of them while invariant 5 (Delete) stayed enforced by its override.
        // The guard's own docstring claims the invariants hold on EVERY write path; these pin that.
        it('REFUSES a ReplayOnly save by a non-Owner — the Validate() hook is not reached on that path', async () => {
            const row = existingRow(ALICE.ID, ALICE);
            const ok = await row.Save({ ReplayOnly: true });
            expect(ok).toBe(false);
            expect(row.SuperSaveCalled).toBe(false);
        });

        it('ALLOWS an Owner a ReplayOnly save — replication/admin paths run as an Owner and must keep working', async () => {
            const row = existingRow(ALICE.ID, OWNER);
            const ok = await row.Save({ ReplayOnly: true });
            expect(ok).toBe(true);
            expect(row.SuperSaveCalled).toBe(true);
        });

        it('leaves an ordinary (non-ReplayOnly) non-Owner save to the normal Validate() path', async () => {
            const row = existingRow(ALICE.ID, ALICE);
            const ok = await row.Save();
            expect(ok).toBe(true);
            expect(row.SuperSaveCalled).toBe(true);
        });

        // Composition, not delegation: every other test in this file calls Validate() directly, so
        // without this one nothing pins that an ordinary Save() actually ROUTES to the guard. It
        // fails if the Validate() override is removed, which the delegation-only assertions do not.
        it('an ordinary Save() by a non-Owner with a dirty Type is refused THROUGH Validate()', async () => {
            const row = existingRow(ALICE.ID, ALICE);
            row.SetFieldState('Type', true, 'User');
            row.Type = 'Owner';
            const ok = await row.Save();
            expect(ok).toBe(false);
            expect(row.SuperSaveCalled).toBe(true); // reached Save(); refused inside it, not before
        });
    });

    it('preserves base-class validation failures', () => {
        const e = existingRow(ALICE.ID, ALICE);
        vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(e)), 'Validate').mockReturnValue({
            Success: false,
            Errors: [{ Message: 'base failure' }],
        });

        expect(e.Validate().Success).toBe(false);
    });
});
