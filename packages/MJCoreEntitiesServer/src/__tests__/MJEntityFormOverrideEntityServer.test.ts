/**
 * Unit tests for `MJEntityFormOverrideEntityServer` and its twin `MJEntityFormContributionEntityServer`:
 * the server-side scope guard on full custom forms and on panels.
 *
 * Both subclasses feed the same guard (`FormScopeGuard.ts`) from the same three entry points, so
 * the same cases run against each. What is pinned here is the wiring: `Validate()` adds the scope
 * problem, an ordinary `Save()` reaches it through `Validate()`, a `ReplayOnly` save (which skips
 * `Validate()`) is checked before the write, and `Delete()` (which never calls `Validate()`) is
 * checked against the row as it was loaded. The rule itself is tested as a matrix in
 * `@memberjunction/core-entities`.
 *
 * `Save()` also checks the component a row points at when the row is created or its
 * `ComponentID` changes: the other rows that use that component are read (here from a stand-in
 * `RunView`) and checked with `FormRowComponentRefusal`.
 *
 * The generated bases are mocked to a settable stub with per-field OldValue state, matching the
 * approach in MJUserRoleEntityServer.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

/** The caller shape the guard reads: `ID` for ownership, `Type` for the Owner exemption. */
interface StubCaller {
    ID: string;
    Type: string;
}

/** A form or panel row that uses a component, as the stand-in `RunView` serves it. */
interface StoredUse {
    ID: string;
    ComponentID: string;
    Scope: string;
    UserID: string | null;
}

const { views } = vi.hoisted(() => ({
    views: { uses: [] as StoredUse[], failing: false, calls: 0 },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        public async RunViews(
            params: Array<{ EntityName: string; ExtraFilter: string }>,
        ): Promise<Array<{ Success: boolean; Results: StoredUse[]; ErrorMessage?: string }>> {
            views.calls++;
            return params.map((p) => {
                if (views.failing) return { Success: false, Results: [], ErrorMessage: 'cannot read' };
                const componentID = /ComponentID='([^']*)'/.exec(p.ExtraFilter)?.[1];
                // Both entities share the stand-in rows; the contributions view serves them all.
                const rows = p.EntityName === 'MJ: Entity Form Contributions'
                    ? views.uses.filter((u) => u.ComponentID === componentID)
                    : [];
                return { Success: true, Results: rows };
            });
        }
    }
    return { ...actual, RunView: StubRunView, LogError: vi.fn() };
});

// `vi.mock` factories are hoisted above every top-level declaration, so the stub class is
// declared inside the factory. The real rule and grant check stay in place.
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();

    /** Minimal stand-in for the generated form override / contribution entity. */
    class StubScopedFormEntity {
        public ID = 'ROW-SELF';
        public ComponentID = 'COMP-1';
        public Scope = 'User';
        public UserID: string | null = null;
        public IsSaved = true;
        public ContextCurrentUser: StubCaller | null = null;
        public SuperDeleteCalled = false;
        public SuperSaveCalled = false;
        /** No authorization metadata: only an `Owner`-type caller holds the grant. */
        public ProviderToUse = { Authorizations: [] };

        protected oldValues = new Map<string, unknown>();

        public GetFieldByName(name: string): { OldValue: unknown } {
            return { OldValue: this.oldValues.has(name) ? this.oldValues.get(name) : (this as Record<string, unknown>)[name] };
        }

        public SetOldValue(name: string, value: unknown): void {
            this.oldValues.set(name, value);
        }

        /** BaseEntity exposes this as a protected getter; the guard reads it. */
        protected get ActiveUser(): StubCaller | null {
            return this.ContextCurrentUser;
        }

        public get RunViewProviderToUse(): unknown {
            return this.ProviderToUse;
        }

        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }

        public async Delete(): Promise<boolean> {
            this.SuperDeleteCalled = true;
            return true;
        }

        /** An ordinary save routes through `Validate()`; `ReplayOnly` writes without it. */
        public async Save(options?: { ReplayOnly?: boolean }): Promise<boolean> {
            this.SuperSaveCalled = true;
            if (options?.ReplayOnly) return true;
            return this.Validate().Success;
        }

        public RegisterResultHistoryEntry(_result: unknown): void {
            // intentionally empty — these tests assert on return values
        }
    }
    return {
        ...actual,
        MJEntityFormOverrideEntity: StubScopedFormEntity,
        MJEntityFormContributionEntity: StubScopedFormEntity,
    };
});

import { MJEntityFormOverrideEntityServer } from '../custom/MJEntityFormOverrideEntityServer.server.js';
import { MJEntityFormContributionEntityServer } from '../custom/MJEntityFormContributionEntityServer.server.js';

const ALICE: StubCaller = { ID: '22222222-2222-2222-2222-222222222222', Type: 'User' };
const BOB: StubCaller = { ID: '33333333-3333-3333-3333-333333333333', Type: 'User' };
/** Holds the grant through the Owner exemption. */
const OWNER: StubCaller = { ID: '11111111-1111-1111-1111-111111111111', Type: 'Owner' };

/** The stub's extra members, which are not on the real entity's type. */
interface StubHooks {
    ComponentID: string;
    Scope: string;
    UserID: string | null;
    IsSaved: boolean;
    ContextCurrentUser: StubCaller | null;
    SuperDeleteCalled: boolean;
    SuperSaveCalled: boolean;
    SetOldValue(name: string, value: unknown): void;
    Validate(): { Success: boolean; Errors: Array<{ Source: string; Message: string }> };
    Save(options?: { ReplayOnly?: boolean }): Promise<boolean>;
    Delete(): Promise<boolean>;
}

type GuardedClass = new () => object;

describe.each<[string, GuardedClass]>([
    ['MJEntityFormOverrideEntityServer', MJEntityFormOverrideEntityServer as unknown as GuardedClass],
    ['MJEntityFormContributionEntityServer', MJEntityFormContributionEntityServer as unknown as GuardedClass],
])('%s — form scope guard', (_name, Guarded) => {
    beforeEach(() => {
        vi.clearAllMocks();
        views.uses = [];
        views.failing = false;
        views.calls = 0;
    });

    function make(init: { IsSaved: boolean; Scope: string; UserID: string | null; Caller: StubCaller | null }): StubHooks {
        const e = new Guarded() as unknown as StubHooks;
        e.IsSaved = init.IsSaved;
        e.Scope = init.Scope;
        e.UserID = init.UserID;
        e.ContextCurrentUser = init.Caller;
        return e;
    }

    describe('Validate()', () => {
        it('allows an owner to edit their own personal item', () => {
            expect(make({ IsSaved: true, Scope: 'User', UserID: ALICE.ID, Caller: ALICE }).Validate().Success).toBe(true);
        });

        it('refuses a non-holder publishing to everyone', () => {
            const result = make({ IsSaved: false, Scope: 'Global', UserID: null, Caller: ALICE }).Validate();
            expect(result.Success).toBe(false);
            expect(result.Errors[0]).toMatchObject({ Source: 'Scope' });
            expect(result.Errors[0].Message).toMatch(/Manage Form Defaults/);
        });

        it('allows a holder publishing to everyone', () => {
            expect(make({ IsSaved: false, Scope: 'Global', UserID: null, Caller: OWNER }).Validate().Success).toBe(true);
        });

        it('refuses a non-holder demoting a Global item to their own, reading the prior scope as loaded', () => {
            const e = make({ IsSaved: true, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            e.SetOldValue('Scope', 'Global');
            e.SetOldValue('UserID', null);
            expect(e.Validate().Success).toBe(false);
        });

        it('refuses a Scope that is not exactly User, Role or Global, from a holder and with no caller', () => {
            for (const caller of [OWNER, null]) {
                const result = make({ IsSaved: false, Scope: 'Global ', UserID: null, Caller: caller }).Validate();
                expect(result.Success).toBe(false);
                expect(result.Errors[0].Message).toMatch(/exactly/);
            }
            expect(make({ IsSaved: false, Scope: 'global', UserID: null, Caller: OWNER }).Validate().Success).toBe(false);
        });

        it('preserves base-class validation failures', () => {
            const e = make({ IsSaved: true, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(e)), 'Validate').mockReturnValueOnce({
                Success: false, Errors: [{ Source: 'Name', Message: 'base failure' }],
            });
            expect(e.Validate().Success).toBe(false);
        });
    });

    describe('Save()', () => {
        it('refuses an ordinary save through Validate()', async () => {
            const e = make({ IsSaved: false, Scope: 'Global', UserID: null, Caller: ALICE });
            expect(await e.Save()).toBe(false);
            expect(e.SuperSaveCalled).toBe(true);
        });

        it('refuses a ReplayOnly save by a non-holder before the write', async () => {
            const e = make({ IsSaved: false, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            expect(await e.Save({ ReplayOnly: true })).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
        });

        it('refuses a ReplayOnly save by a holder on someone else\'s personal item', async () => {
            const e = make({ IsSaved: true, Scope: 'User', UserID: BOB.ID, Caller: OWNER });
            expect(await e.Save({ ReplayOnly: true })).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
        });

        it('refuses a ReplayOnly save of a Scope that is not exactly one of the three, before the write', async () => {
            const e = make({ IsSaved: false, Scope: 'global', UserID: null, Caller: OWNER });
            expect(await e.Save({ ReplayOnly: true })).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
        });

        it('allows a ReplayOnly save by a holder on a shared item', async () => {
            const e = make({ IsSaved: true, Scope: 'Role', UserID: null, Caller: OWNER });
            expect(await e.Save({ ReplayOnly: true })).toBe(true);
            expect(e.SuperSaveCalled).toBe(true);
        });
    });

    describe('Save() — the component the row points at', () => {
        /** A row that uses COMP-1. */
        function used(scope: string, userID: string | null): void {
            views.uses.push({ ID: `USE-${views.uses.length + 1}`, ComponentID: 'COMP-1', Scope: scope, UserID: userID });
        }

        it("refuses a new row aimed at a component another user's personal row uses, a holder included", async () => {
            used('User', BOB.ID);
            for (const caller of [ALICE, OWNER]) {
                const e = make({ IsSaved: false, Scope: 'User', UserID: caller.ID, Caller: caller });
                expect(await e.Save()).toBe(false);
                expect(e.SuperSaveCalled).toBe(false);
            }
        });

        it('refuses a new personal row aimed at a component a shared row uses, without the grant', async () => {
            used('Global', null);
            const e = make({ IsSaved: false, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            expect(await e.Save()).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
        });

        it('allows a holder to aim a row at a component a shared row uses', async () => {
            used('Role', null);
            expect(await make({ IsSaved: false, Scope: 'Global', UserID: null, Caller: OWNER }).Save()).toBe(true);
        });

        it('lets the caller aim a new row at a component only their own rows use, or no row uses', async () => {
            used('User', ALICE.ID);
            expect(await make({ IsSaved: false, Scope: 'User', UserID: ALICE.ID, Caller: ALICE }).Save()).toBe(true);
            views.uses = [];
            expect(await make({ IsSaved: false, Scope: 'User', UserID: ALICE.ID, Caller: ALICE }).Save()).toBe(true);
        });

        it('does not read anything when an update leaves ComponentID alone', async () => {
            used('User', BOB.ID);
            const e = make({ IsSaved: true, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            expect(await e.Save()).toBe(true);
            expect(views.calls).toBe(0);
        });

        it('checks an update that changes ComponentID, compared with the value as loaded', async () => {
            used('User', BOB.ID);
            const e = make({ IsSaved: true, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            e.SetOldValue('ComponentID', 'COMP-OLD');
            expect(await e.Save()).toBe(false);
            expect(views.calls).toBe(1);
        });

        it('refuses the save when the rows cannot be read', async () => {
            views.failing = true;
            const e = make({ IsSaved: false, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            expect(await e.Save()).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
        });

        it('does not check a save with no caller', async () => {
            used('User', BOB.ID);
            expect(await make({ IsSaved: false, Scope: 'User', UserID: BOB.ID, Caller: null }).Save()).toBe(true);
            expect(views.calls).toBe(0);
        });
    });

    describe('Delete()', () => {
        it('allows an owner to delete their own personal item', async () => {
            const e = make({ IsSaved: true, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            expect(await e.Delete()).toBe(true);
            expect(e.SuperDeleteCalled).toBe(true);
        });

        it('refuses a holder deleting someone else\'s personal item', async () => {
            const e = make({ IsSaved: true, Scope: 'User', UserID: BOB.ID, Caller: OWNER });
            expect(await e.Delete()).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
        });

        it('checks the item as loaded, so editing a Global item into your own first does not help', async () => {
            const e = make({ IsSaved: true, Scope: 'User', UserID: ALICE.ID, Caller: ALICE });
            e.SetOldValue('Scope', 'Global');
            e.SetOldValue('UserID', null);
            expect(await e.Delete()).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
        });
    });
});
