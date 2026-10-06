/**
 * Unit tests for `MJRoleEntityServer` — the role-elevation guard on `MJ: Roles` (issue #4282).
 *
 * Verified against a LIVE database: the `Developer` and `Integration` roles hold unfiltered
 * CanCreate/CanUpdate/CanDelete on `MJ: Roles`, all three `Allow*API` flags are true on the entity,
 * and the pre-fix reproduction on the real stack showed a caller whose `Type` is 'User' creating a
 * brand-new role with `Save()` returning true.
 *
 * The invariant under test is blunt — a non-Owner may not create, change or delete a role — because
 * every field on this entity is authority-bearing: `Name` is what user/role sync matches on,
 * `DirectoryID` maps an external directory group to the role, and `SQLName` decides which database
 * role CodeGen grants object rights to. The Owner-exemption cases are as load-bearing as the
 * refusals: `SyncRoles` / `SyncRolesAndUsers` run as the system Owner and must keep working.
 *
 * The generated base (`MJRoleEntity`) is mocked to a settable stub, matching the approach in
 * MJUserEntityServer.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Neutralize the class-factory registration decorator; leave everything else real.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

/** The caller shape the guard reads — only `Type` matters for this entity. */
interface StubCaller {
    ID: string;
    Type: string;
}

// Declared INSIDE the factory because `vi.mock` is hoisted above every top-level declaration here.
vi.mock('@memberjunction/core-entities', () => {
    /** Minimal stand-in for the generated MJRoleEntity. */
    class StubRoleEntity {
        public ID = '';
        public Name = '';
        public Description: string | null = null;
        public DirectoryID: string | null = null;
        public SQLName: string | null = null;
        public IsSaved = true;
        public ContextCurrentUser: StubCaller | null = null;
        public SuperDeleteCalled = false;
        public SuperSaveCalled = false;

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
         * Mirrors `BaseEntity.Save()`: an ordinary save routes through `Validate()` and fails when
         * it fails (baseEntity.ts:3730), while `ReplayOnly` force-passes validation WITHOUT calling
         * `Validate()` (baseEntity.ts:3725) yet still writes. Routing through `this.Validate()` is
         * what makes the ordinary-save test assert composition rather than delegation.
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
    return { MJRoleEntity: StubRoleEntity };
});

// `vi.mock` calls are hoisted above imports, so this static import already sees the stub.
import { MJRoleEntityServer } from '../custom/MJRoleEntityServer.server.js';

const OWNER: StubCaller = { ID: '11111111-1111-1111-1111-111111111111', Type: 'Owner' };
const ALICE: StubCaller = { ID: '22222222-2222-2222-2222-222222222222', Type: 'User' };

/** The stub base's tracking flags are not on the real entity's TYPE — one intersection cast serves every call site. */
interface StubHooks {
    SuperDeleteCalled: boolean;
    SuperSaveCalled: boolean;
}

function newRole(caller: StubCaller | null): MJRoleEntityServer & StubHooks {
    const e = new MJRoleEntityServer() as MJRoleEntityServer & StubHooks;
    e.IsSaved = false;
    e.Name = 'Escalation';
    e.ContextCurrentUser = caller;
    return e;
}

function existingRole(caller: StubCaller | null): MJRoleEntityServer & StubHooks {
    const e = new MJRoleEntityServer() as MJRoleEntityServer & StubHooks;
    e.IsSaved = true;
    e.ID = '99999999-9999-9999-9999-999999999999';
    e.Name = 'Developer';
    e.ContextCurrentUser = caller;
    return e;
}

function messages(result: { Errors: unknown[] }): string {
    return result.Errors.map((x) => (x as { Message: string }).Message).join(' | ');
}

describe('MJRoleEntityServer — role elevation guard (issue #4282)', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('creation: a non-Owner may not create a role', () => {
        it('REJECTS a non-Owner minting a new role — step one of "mint it, grant it, permission it"', () => {
            const result = newRole(ALICE).Validate();

            expect(result.Success).toBe(false);
            expect(messages(result)).toContain('create');
        });

        it('ALLOWS an Owner to create a role — SyncRoles runs as the system Owner', () => {
            expect(newRole(OWNER).Validate().Success).toBe(true);
        });
    });

    describe('update: a non-Owner may not change a role', () => {
        it('REJECTS a non-Owner renaming a role — Name is what user/role synchronization matches on', () => {
            const e = existingRole(ALICE);
            e.Name = 'System Administrators';

            const result = e.Validate();

            expect(result.Success).toBe(false);
            expect(messages(result)).toContain('change');
        });

        it('REJECTS a non-Owner repointing DirectoryID — that remaps an external directory group onto this role', () => {
            const e = existingRole(ALICE);
            e.DirectoryID = 'attacker-controlled-group';

            expect(e.Validate().Success).toBe(false);
        });

        it('REJECTS a non-Owner touching a role even with nothing changed — the refusal is of the operation, not a field', () => {
            // Refusing per-field would leave the authority-bearing list to be re-derived every time
            // a field is added to this entity; refusing the operation cannot go stale that way.
            expect(existingRole(ALICE).Validate().Success).toBe(false);
        });

        it('ALLOWS an Owner to change a role', () => {
            const e = existingRole(OWNER);
            e.Description = 'updated by an admin';

            expect(e.Validate().Success).toBe(true);
        });

        it('treats the Owner exemption case- and padding-insensitively (Type is an NCHAR column)', () => {
            expect(existingRole({ ID: OWNER.ID, Type: '  OWNER  ' }).Validate().Success).toBe(true);
        });
    });

    describe('deletion: a non-Owner may not delete a role', () => {
        it('REJECTS a non-Owner deleting a role — it removes the role from every user who holds it', async () => {
            const e = existingRole(ALICE);

            const ok = await e.Delete();

            expect(ok).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
        });

        it('ALLOWS an Owner to delete a role — DeleteRemovedRoles runs as the system Owner', async () => {
            const e = existingRole(OWNER);

            const ok = await e.Delete();

            expect(ok).toBe(true);
            expect(e.SuperDeleteCalled).toBe(true);
        });
    });

    describe('no caller', () => {
        it('is treated as exempt — CheckPermissions refuses a caller-less write before the guard matters', () => {
            expect(newRole(null).Validate().Success).toBe(true);
        });
    });

    describe('ReplayOnly must not switch the Validate-side refusal off', () => {
        it('REFUSES a ReplayOnly save by a non-Owner — the Validate() hook is not reached on that path', async () => {
            const e = newRole(ALICE);

            const ok = await e.Save({ ReplayOnly: true });

            expect(ok).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
        });

        it('ALLOWS an Owner a ReplayOnly save — replication and sync paths run as an Owner', async () => {
            const e = newRole(OWNER);

            const ok = await e.Save({ ReplayOnly: true });

            expect(ok).toBe(true);
            expect(e.SuperSaveCalled).toBe(true);
        });

        it('an ordinary Save() by a non-Owner is refused THROUGH Validate()', async () => {
            const e = newRole(ALICE);

            const ok = await e.Save();

            expect(ok).toBe(false);
            expect(e.SuperSaveCalled).toBe(true); // reached Save(); refused inside it, not before
        });
    });

    it('preserves base-class validation failures', () => {
        const e = newRole(OWNER);
        vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(e)), 'Validate').mockReturnValue({
            Success: false,
            Errors: [{ Message: 'base failure' }],
        });

        expect(e.Validate().Success).toBe(false);
    });
});
