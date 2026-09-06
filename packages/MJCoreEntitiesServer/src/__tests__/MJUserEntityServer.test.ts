/**
 * Unit tests for `MJUserEntityServer` — the privilege-elevation guard on `MJ: Users` (issue #4260).
 *
 * The guard exists because role grants cannot express it. On the baseline seed the `Developer`
 * and `Integration` roles hold unfiltered CanUpdate on `MJ: Users`, `AllowUpdateAPI` is true on
 * the entity and on both the `Type` and `Name` fields, and there is no per-role FIELD permission
 * in MJ — only `RowLevelSecurityFilter`, which cannot help here: scoping the update to the
 * caller's own row still permits setting one's OWN `Type` to 'Owner', which IS the escalation.
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
// `import`s and `class`/`const` statements below this point). The brief's original draft declared
// `StubUserEntity` as an outer `class` and referenced it from inside this factory, which throws
// `ReferenceError: Cannot access 'StubUserEntity' before initialization` at import time — the
// factory runs before the outer class's own declaration does. Declaring the stub class INSIDE the
// factory (as MJUserRoutineEntityServer.test.ts does with `MockMJUserRoutineEntity`) avoids the
// forward reference entirely.
vi.mock('@memberjunction/core-entities', () => {
    /** Minimal stand-in for the generated MJUserEntity, with controllable field state. */
    class StubUserEntity {
        public ID = '';
        public Name = '';
        public Type: 'Owner' | 'User' = 'User';
        public IsSaved = true;
        public ContextCurrentUser: { ID: string; Type: string } | null = null;

        protected fields = new Map<string, StubField>();

        public GetFieldByName(name: string): StubField | undefined {
            return this.fields.get(name);
        }

        public SetFieldState(name: string, dirty: boolean, oldValue: string | null): void {
            this.fields.set(name, { Name: name, Dirty: dirty, OldValue: oldValue });
        }

        /** BaseEntity exposes this as a protected getter; the guard reads it. */
        protected get ActiveUser(): { ID: string; Type: string } | null {
            return this.ContextCurrentUser;
        }

        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
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

/** Builds a guard instance representing an EXISTING row `rowId`, saved by `caller`. */
function existingRow(rowId: string, caller: { ID: string; Type: string } | null) {
    const e = new MJUserEntityServer();
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

    describe('invariant 1: a non-Owner may not change Type', () => {
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

    describe('invariant 2: a non-Owner may only modify their own row', () => {
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

        it('ALLOWS a new record (no pre-save row to protect)', () => {
            const e = new MJUserEntityServer();
            e.IsSaved = false;
            e.ID = '';
            e.Type = 'User';
            e.SetFieldState('Type', true, null);   // dirty on create, but not to 'Owner'
            e.ContextCurrentUser = ALICE;

            expect(e.Validate().Success).toBe(true);
        });

        it('REJECTS a non-Owner creating a new Owner', () => {
            const e = new MJUserEntityServer();
            e.IsSaved = false;
            e.Type = 'Owner';
            e.SetFieldState('Type', true, null);
            e.ContextCurrentUser = ALICE;

            expect(e.Validate().Success).toBe(false);
        });
    });

    describe('invariant 3: a non-Owner may not change Name (the context-user ladder rung)', () => {
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

        it('ALLOWS a new record to have its Name set (auto-provisioning sets Name = email)', () => {
            const e = new MJUserEntityServer();
            e.IsSaved = false;
            e.Name = 'new@example.com';
            e.SetFieldState('Name', true, null);
            e.SetFieldState('Type', false, null);
            e.ContextCurrentUser = ALICE;

            expect(e.Validate().Success).toBe(true);
        });
    });

    describe('no caller', () => {
        it('does not throw when there is no context user', () => {
            const e = existingRow(ALICE.ID, null);
            e.Type = 'Owner';
            e.SetFieldState('Type', true, 'User');

            expect(() => e.Validate()).not.toThrow();
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
