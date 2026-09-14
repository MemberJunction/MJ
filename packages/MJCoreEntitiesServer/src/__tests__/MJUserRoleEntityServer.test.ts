/**
 * Unit tests for `MJUserRoleEntityServer` — the role-elevation guard on `MJ: User Roles`
 * (issue #4282).
 *
 * The guard exists because role grants cannot express it. Verified against a LIVE database (not
 * just the baseline seed): the `Developer` and `Integration` roles hold unfiltered
 * CanCreate/CanUpdate/CanDelete on `MJ: User Roles`, all three `Allow*API` flags are true on the
 * entity, and the pre-fix reproduction on the real stack showed a caller whose `Type` is 'User',
 * holding only `Developer` and `UI`, inserting a row that granted itself `Integration` —
 * `Validate()` returned Success=true and `Save()` returned true.
 *
 * The invariant under test is the SUBSET rule: a non-Owner may only grant, move or revoke a role
 * they hold themselves. The "ALLOWS" cases below are as load-bearing as the "REJECTS" ones — the
 * rule was chosen over a stricter one precisely to keep delegated administration working, so a
 * guard that also refused those would have over-reached.
 *
 * The generated base (`MJUserRoleEntity`) is mocked to a settable stub with per-field
 * Dirty/OldValue state, matching the approach in MJUserEntityServer.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Neutralize the class-factory registration decorator; keep UUIDsEqual real — case-insensitive
// UUID comparison is part of what these tests pin.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

// `MJUserRoleEntityServer` carries a SECOND, unrelated guard (system-user field access), whose
// imports pull in the real provider package and, through it, the AI engine — which reads exports
// off `@memberjunction/core-entities` that the stub below deliberately does not define. Stubbing the
// provider keeps that chain out of this file AND holds the second guard inert: `GetSystemUser()`
// returns null, so both of its entry points short-circuit and only the role-elevation rule under
// test here decides anything. The system-user guard has its own coverage in
// `fieldSecurity.systemUserGuard.test.ts`.
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        get Instance() {
            return { GetSystemUser: () => null };
        },
    },
    FindSystemUserFieldAccessViolations: () => [],
}));

interface StubField {
    Name: string;
    Dirty: boolean;
    OldValue: string | null;
}

/** The caller shape the guard reads: `Type` for the Owner exemption, `UserRoles` for the subset test. */
interface StubCaller {
    ID: string;
    Type: string;
    UserRoles?: { RoleID: string }[];
}

// `vi.mock` factories are hoisted above every top-level declaration in this file, so the stub class
// is declared INSIDE the factory rather than referenced from outside it — see the equivalent note
// in MJUserEntityServer.test.ts for the ReferenceError this avoids.
vi.mock('@memberjunction/core-entities', () => {
    /** Minimal stand-in for the generated MJUserRoleEntity, with controllable field state. */
    class StubUserRoleEntity {
        public ID = '';
        public UserID = '';
        public RoleID = '';
        public IsSaved = true;
        public ContextCurrentUser: StubCaller | null = null;
        public SuperDeleteCalled = false;
        public SuperSaveCalled = false;

        protected fields = new Map<string, StubField>();

        public GetFieldByName(name: string): StubField | undefined {
            return this.fields.get(name);
        }

        public SetFieldState(name: string, dirty: boolean, oldValue: string | null): void {
            this.fields.set(name, { Name: name, Dirty: dirty, OldValue: oldValue });
        }

        /** BaseEntity exposes this as a protected getter; the guard reads it. */
        protected get ActiveUser(): StubCaller | null {
            return this.ContextCurrentUser;
        }

        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }

        public async Delete(): Promise<boolean> {
            this.SuperDeleteCalled = true;
            return true;
        }

        /**
         * Mirrors the two behaviours of `BaseEntity.Save()` that matter here: an ordinary save
         * routes through `Validate()` and fails when it fails (baseEntity.ts:3730), while
         * `ReplayOnly` force-passes validation WITHOUT calling `Validate()` at all
         * (baseEntity.ts:3725) yet still writes. Routing through `this.Validate()` rather than
         * returning a bare `true` is what makes the ordinary-save tests assert the real
         * Save() → Validate() COMPOSITION instead of mere delegation to `super`.
         */
        public async Save(options?: { ReplayOnly?: boolean }): Promise<boolean> {
            this.SuperSaveCalled = true;
            if (options?.ReplayOnly) {
                return true;
            }
            return this.Validate().Success;
        }

        /** No-op stand-in: the guard's refusal paths record a BaseEntityResult here. */
        public RegisterResultHistoryEntry(_result: unknown): void {
            // intentionally empty — these tests assert on the boolean return value, not LatestResult
        }
    }
    return { MJUserRoleEntity: StubUserRoleEntity };
});

// `vi.mock` calls are hoisted above imports, so this static import already sees the stub. Test
// files are excluded from this package's `tsc` build and vitest transforms with esbuild, so the
// stub's extra members are a runtime-only concern, not a compile error.
import { MJUserRoleEntityServer } from '../custom/MJUserRoleEntityServer.server.js';

const ROLE_DEVELOPER = 'deafccec-6a37-ef11-86d4-000d3a4e707e';
const ROLE_INTEGRATION = 'dfafccec-6a37-ef11-86d4-000d3a4e707e';
const ROLE_UI = 'e0afccec-6a37-ef11-86d4-000d3a4e707e';

const OWNER: StubCaller = {
    ID: '11111111-1111-1111-1111-111111111111',
    Type: 'Owner',
    UserRoles: [{ RoleID: ROLE_INTEGRATION }],
};
/** The reproduction's caller shape: a non-Owner holding Developer + UI, but NOT Integration. */
const ALICE: StubCaller = {
    ID: '22222222-2222-2222-2222-222222222222',
    Type: 'User',
    UserRoles: [{ RoleID: ROLE_DEVELOPER }, { RoleID: ROLE_UI }],
};
const BOB: StubCaller = { ID: '33333333-3333-3333-3333-333333333333', Type: 'User', UserRoles: [] };

/** The stub base's tracking flags are not on the real entity's TYPE — one intersection cast serves every call site. */
interface StubHooks {
    SuperDeleteCalled: boolean;
    SuperSaveCalled: boolean;
}

/** A brand-new (unsaved) assignment of `roleId` to `userId`, being saved by `caller`. */
function newAssignment(userId: string, roleId: string, caller: StubCaller | null): MJUserRoleEntityServer & StubHooks {
    const e = new MJUserRoleEntityServer() as MJUserRoleEntityServer & StubHooks;
    e.IsSaved = false;
    e.UserID = userId;
    e.RoleID = roleId;
    e.ContextCurrentUser = caller;
    return e;
}

/**
 * An EXISTING assignment that currently grants `priorRoleId`, with `roleId` as the post-edit value.
 * Pass them equal for an update that leaves RoleID alone.
 */
function existingAssignment(
    userId: string,
    priorRoleId: string | null,
    roleId: string,
    caller: StubCaller | null
): MJUserRoleEntityServer & StubHooks {
    const e = new MJUserRoleEntityServer() as MJUserRoleEntityServer & StubHooks;
    e.IsSaved = true;
    e.ID = '99999999-9999-9999-9999-999999999999';
    e.UserID = userId;
    e.RoleID = roleId;
    e.SetFieldState('RoleID', priorRoleId !== roleId, priorRoleId);
    e.ContextCurrentUser = caller;
    return e;
}

function messages(result: { Errors: unknown[] }): string {
    return result.Errors.map((x) => (x as { Message: string }).Message).join(' | ');
}

function sources(result: { Errors: unknown[] }): string[] {
    return result.Errors.map((x) => (x as { Source: string }).Source);
}

describe('MJUserRoleEntityServer — role elevation guard (issue #4282)', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('invariant 1 — creation: a non-Owner may only assign a role they hold', () => {
        it('REJECTS a non-Owner granting THEMSELVES a role they do not hold — the #4282 escalation', () => {
            const e = newAssignment(ALICE.ID, ROLE_INTEGRATION, ALICE);

            const result = e.Validate();

            expect(result.Success).toBe(false);
            expect(sources(result)).toContain('RoleID');
            expect(messages(result)).toContain('hold');
        });

        it('REJECTS a non-Owner granting ANOTHER user a role the caller does not hold', () => {
            // The rule is a ceiling on what the caller can hand out, not merely a self-grant check.
            expect(newAssignment(BOB.ID, ROLE_INTEGRATION, ALICE).Validate().Success).toBe(false);
        });

        it('ALLOWS a non-Owner granting another user a role the caller DOES hold — delegated administration', () => {
            // Deliberate scope decision (#4282): the subset rule was chosen over "and no role that
            // confers write on MJ: Roles/MJ: User Roles" precisely so peer onboarding keeps working.
            // Granting a peer a role you already hold cannot lift anyone above the caller's ceiling.
            expect(newAssignment(BOB.ID, ROLE_DEVELOPER, ALICE).Validate().Success).toBe(true);
        });

        it('ALLOWS a non-Owner re-granting themselves a role they already hold', () => {
            expect(newAssignment(ALICE.ID, ROLE_UI, ALICE).Validate().Success).toBe(true);
        });

        it('ALLOWS an Owner granting any role to anyone — admin role management must keep working', () => {
            expect(newAssignment(BOB.ID, ROLE_DEVELOPER, OWNER).Validate().Success).toBe(true);
        });

        it('REJECTS a caller who holds NO roles — an empty list grants nothing, no special case needed', () => {
            expect(newAssignment(BOB.ID, ROLE_UI, BOB).Validate().Success).toBe(false);
        });

        it('REJECTS (fails CLOSED) when the caller\'s roles were never populated at all', () => {
            // If UserRoles is undefined the subset test cannot succeed, so the guard refuses rather
            // than falling open — the same direction MJUserEntityServer takes when it cannot
            // establish a pre-save identity.
            const callerWithNoRoleData: StubCaller = { ID: ALICE.ID, Type: 'User' };
            expect(newAssignment(ALICE.ID, ROLE_DEVELOPER, callerWithNoRoleData).Validate().Success).toBe(false);
        });

        it('REJECTS an assignment with no RoleID at all rather than treating it as harmless', () => {
            expect(newAssignment(ALICE.ID, '', ALICE).Validate().Success).toBe(false);
        });

        it('matches the caller\'s roles case-insensitively — role IDs reach the guard in two casings', () => {
            // The cached UserInfo.UserRoles and the field the client sent do not agree on case;
            // a `===` comparison here would refuse every legitimate grant. (UUID_COMPARISON_GUIDE)
            expect(newAssignment(ALICE.ID, ROLE_DEVELOPER.toUpperCase(), ALICE).Validate().Success).toBe(true);
        });

        it('treats the Owner exemption case- and padding-insensitively (Type is an NCHAR column)', () => {
            const paddedOwner: StubCaller = { ID: OWNER.ID, Type: '  OWNER  ', UserRoles: [] };
            expect(newAssignment(BOB.ID, ROLE_INTEGRATION, paddedOwner).Validate().Success).toBe(true);
        });
    });

    describe('invariant 2 — update: both the new and the pre-save role must be held', () => {
        it('REJECTS a non-Owner repointing an assignment at a role they do not hold', () => {
            const e = existingAssignment(ALICE.ID, ROLE_DEVELOPER, ROLE_INTEGRATION, ALICE);

            expect(e.Validate().Success).toBe(false);
        });

        it('REJECTS a non-Owner editing an assignment that currently grants a role they do NOT hold', () => {
            // Stripping an Owner of Integration by repointing their row at a role the caller does
            // hold. Without the pre-save half, this passes the forward check and the revocation
            // succeeds.
            const e = existingAssignment(OWNER.ID, ROLE_INTEGRATION, ROLE_UI, ALICE);

            const result = e.Validate();

            expect(result.Success).toBe(false);
            expect(messages(result)).toContain('revoke');
        });

        it('ALLOWS a non-Owner moving a held-role assignment to another user — UserID is deliberately not frozen', () => {
            const e = existingAssignment(BOB.ID, ROLE_DEVELOPER, ROLE_DEVELOPER, ALICE);

            expect(e.Validate().Success).toBe(true);
        });

        it('ALLOWS a non-Owner swapping between two roles they both hold', () => {
            const e = existingAssignment(ALICE.ID, ROLE_DEVELOPER, ROLE_UI, ALICE);

            expect(e.Validate().Success).toBe(true);
        });

        it('REJECTS (fails CLOSED) when the pre-save RoleID cannot be established at all', () => {
            const e = existingAssignment(ALICE.ID, null, ROLE_DEVELOPER, ALICE);

            const result = e.Validate();

            expect(result.Success).toBe(false);
            expect(messages(result)).toContain('previously granted');
        });

        it('ALLOWS an Owner repointing any assignment at any role', () => {
            const e = existingAssignment(ALICE.ID, ROLE_INTEGRATION, ROLE_DEVELOPER, OWNER);

            expect(e.Validate().Success).toBe(true);
        });

        it('does not apply the pre-save check to a CREATE, where there is no prior grant', () => {
            // A new row has no pre-save RoleID; running the fail-closed branch on it would refuse
            // every legitimate creation.
            expect(newAssignment(ALICE.ID, ROLE_DEVELOPER, ALICE).Validate().Success).toBe(true);
        });
    });

    describe('invariant 3 — deletion: a non-Owner may only revoke a role they hold', () => {
        it('REJECTS a non-Owner revoking a role they do not hold', async () => {
            const e = existingAssignment(OWNER.ID, ROLE_INTEGRATION, ROLE_INTEGRATION, ALICE);

            const ok = await e.Delete();

            expect(ok).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
        });

        it('ALLOWS a non-Owner revoking a role they DO hold — revocation shares the granting ceiling', async () => {
            const e = existingAssignment(BOB.ID, ROLE_DEVELOPER, ROLE_DEVELOPER, ALICE);

            const ok = await e.Delete();

            expect(ok).toBe(true);
            expect(e.SuperDeleteCalled).toBe(true);
        });

        it('ALLOWS an Owner to delete any assignment', async () => {
            const e = existingAssignment(ALICE.ID, ROLE_INTEGRATION, ROLE_INTEGRATION, OWNER);

            expect(await e.Delete()).toBe(true);
        });
    });

    describe('no caller', () => {
        it('is treated as exempt — CheckPermissions refuses a caller-less write before the guard matters', () => {
            // BaseEntity.CheckPermissions throws on a falsy ActiveUser and runs BEFORE Validate()
            // inside Save(), so a caller-less save never reaches the guard in production. In
            // Delete() the ordering is reversed and this default is load-bearing: it lets the call
            // through to super.Delete(), where CheckPermissions is what actually refuses it.
            expect(newAssignment(ALICE.ID, ROLE_INTEGRATION, null).Validate().Success).toBe(true);
        });
    });

    describe('invariant 4 — ReplayOnly must not switch the Save-side invariants off', () => {
        it('REFUSES a ReplayOnly save by a non-Owner — the Validate() hook is not reached on that path', async () => {
            const e = newAssignment(ALICE.ID, ROLE_INTEGRATION, ALICE);

            const ok = await e.Save({ ReplayOnly: true });

            expect(ok).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
        });

        it('REFUSES a ReplayOnly save by a non-Owner even for a role they DO hold — the refusal is of the mechanism', async () => {
            const e = newAssignment(ALICE.ID, ROLE_DEVELOPER, ALICE);

            expect(await e.Save({ ReplayOnly: true })).toBe(false);
        });

        it('ALLOWS an Owner a ReplayOnly save — replication and sync paths run as an Owner', async () => {
            const e = newAssignment(BOB.ID, ROLE_DEVELOPER, OWNER);

            const ok = await e.Save({ ReplayOnly: true });

            expect(ok).toBe(true);
            expect(e.SuperSaveCalled).toBe(true);
        });

        it('an ordinary Save() by a non-Owner assigning an unheld role is refused THROUGH Validate()', async () => {
            // Composition, not delegation: every other test calls Validate() directly, so without
            // this one nothing pins that an ordinary Save() actually routes to the guard.
            const e = newAssignment(ALICE.ID, ROLE_INTEGRATION, ALICE);

            const ok = await e.Save();

            expect(ok).toBe(false);
            expect(e.SuperSaveCalled).toBe(true); // reached Save(); refused inside it, not before
        });

        it('leaves an ordinary non-Owner save of a HELD role to succeed', async () => {
            const e = newAssignment(BOB.ID, ROLE_UI, ALICE);

            expect(await e.Save()).toBe(true);
        });
    });

    it('preserves base-class validation failures', () => {
        const e = newAssignment(ALICE.ID, ROLE_DEVELOPER, ALICE);
        vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(e)), 'Validate').mockReturnValue({
            Success: false,
            Errors: [{ Message: 'base failure' }],
        });

        expect(e.Validate().Success).toBe(false);
    });
});
