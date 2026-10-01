/**
 * Unit tests for `MJComponentEntityServer`: the guard on the component behind a full custom form
 * or panel.
 *
 * A form or panel draws the component its row points at, so changing the component's
 * specification, status, name or type, or deleting it, changes every form and panel that uses
 * it. What is pinned here is the wiring: which writes look up the rows that use the component,
 * how they are looked up, and that an ordinary save, a `ReplayOnly` save and a delete are each
 * refused before the write. The rule itself is tested as a matrix in `@memberjunction/core-entities`.
 *
 * The extended base is mocked to a settable stub with per-field Dirty and OldValue state, and
 * `RunView` to a stand-in that serves the rows that use the component.
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

/** A row that uses the component, as the stand-in `RunView` serves it. */
interface ReferenceRow {
    Scope: string;
    UserID: string | null;
}

/** One query the guard ran, with the user it ran as. */
interface ViewCall {
    EntityName: string;
    ExtraFilter: string;
    Fields: string[];
    ResultType: string;
    ContextUser: unknown;
}

const { views } = vi.hoisted(() => ({
    views: {
        rows: new Map<string, ReferenceRow[]>(),
        failing: new Set<string>(),
        throws: false,
        calls: [] as ViewCall[],
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        public async RunViews(
            params: Array<{ EntityName: string; ExtraFilter: string; Fields: string[]; ResultType: string }>,
            contextUser?: unknown,
        ): Promise<Array<{ Success: boolean; Results: ReferenceRow[]; ErrorMessage?: string }>> {
            if (views.throws) throw new Error('connection lost');
            return params.map((p) => {
                views.calls.push({ ...p, ContextUser: contextUser });
                return views.failing.has(p.EntityName)
                    ? { Success: false, Results: [], ErrorMessage: `cannot read ${p.EntityName}` }
                    : { Success: true, Results: views.rows.get(p.EntityName) ?? [] };
            });
        }
    }
    return { ...actual, RunView: StubRunView, LogError: vi.fn() };
});

vi.mock('../custom/util.js', () => ({ EmbedTextLocalHelper: vi.fn() }));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();

    /** Minimal stand-in for `MJComponentEntityExtended`. */
    class StubComponentEntity {
        public ID = 'COMP-1';
        public IsSaved = true;
        public ContextCurrentUser: StubCaller | null = null;
        public SuperSaveCalled = false;
        public SuperDeleteCalled = false;
        public EmbeddingsGenerated = false;
        public Recorded: { Success: boolean; Type: string; Message: string } | null = null;
        /** No authorization metadata: only an `Owner`-type caller holds the grant. */
        public ProviderToUse = { Authorizations: [] };

        protected dirty = new Set<string>();
        protected oldValues = new Map<string, unknown>();

        public GetFieldByName(name: string): { Dirty: boolean; OldValue: unknown } {
            return {
                Dirty: this.dirty.has(name),
                OldValue: this.oldValues.has(name) ? this.oldValues.get(name) : (this as Record<string, unknown>)[name],
            };
        }

        public MarkDirty(...names: string[]): void {
            for (const name of names) this.dirty.add(name);
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

        public async GenerateEmbeddingsByFieldName(): Promise<boolean> {
            this.EmbeddingsGenerated = true;
            return true;
        }

        public async Save(): Promise<boolean> {
            this.SuperSaveCalled = true;
            return true;
        }

        public async Delete(): Promise<boolean> {
            this.SuperDeleteCalled = true;
            return true;
        }

        public RegisterResultHistoryEntry(result: { Success: boolean; Type: string; Message: string }): void {
            this.Recorded = result;
        }
    }
    return { ...actual, MJComponentEntityExtended: StubComponentEntity };
});

import { MJComponentEntityServer } from '../custom/MJComponentEntityServer.server.js';

const CONTRIBUTIONS = 'MJ: Entity Form Contributions';
const OVERRIDES = 'MJ: Entity Form Overrides';

const ALICE: StubCaller = { ID: '22222222-2222-2222-2222-222222222222', Type: 'User' };
const BOB: StubCaller = { ID: '33333333-3333-3333-3333-333333333333', Type: 'User' };
/** Holds the grant through the Owner exemption. */
const OWNER: StubCaller = { ID: '11111111-1111-1111-1111-111111111111', Type: 'Owner' };

const aliceRow: ReferenceRow = { Scope: 'User', UserID: ALICE.ID };
const bobRow: ReferenceRow = { Scope: 'User', UserID: BOB.ID };
const roleRow: ReferenceRow = { Scope: 'Role', UserID: null };
const globalRow: ReferenceRow = { Scope: 'Global', UserID: null };

/** The stub's extra members, which are not on the real entity's type. */
interface StubHooks {
    ID: string;
    IsSaved: boolean;
    ContextCurrentUser: StubCaller | null;
    SuperSaveCalled: boolean;
    SuperDeleteCalled: boolean;
    EmbeddingsGenerated: boolean;
    Recorded: { Success: boolean; Type: string; Message: string } | null;
    MarkDirty(...names: string[]): void;
    SetOldValue(name: string, value: unknown): void;
    Save(options?: { ReplayOnly?: boolean }): Promise<boolean>;
    Delete(): Promise<boolean>;
}

function make(init: { IsSaved?: boolean; Caller: StubCaller | null; Dirty?: string[] }): StubHooks {
    const e = new MJComponentEntityServer() as unknown as StubHooks;
    e.IsSaved = init.IsSaved ?? true;
    e.ContextCurrentUser = init.Caller;
    e.MarkDirty(...(init.Dirty ?? []));
    return e;
}

/** The rows that use the component, served by entity. */
function usedBy(contributions: ReferenceRow[], overrides: ReferenceRow[] = []): void {
    views.rows.set(CONTRIBUTIONS, contributions);
    views.rows.set(OVERRIDES, overrides);
}

beforeEach(() => {
    views.rows = new Map();
    views.failing = new Set();
    views.throws = false;
    views.calls = [];
});

describe('MJComponentEntityServer — form component guard', () => {
    describe('Save()', () => {
        it('lets a user change the specification of a component only their own panel uses', async () => {
            usedBy([aliceRow]);
            const e = make({ Caller: ALICE, Dirty: ['Specification'] });
            expect(await e.Save()).toBe(true);
            expect(e.SuperSaveCalled).toBe(true);
            expect(e.EmbeddingsGenerated).toBe(true);
        });

        it('refuses a non-holder changing a component a Role or Global row uses, before the write', async () => {
            for (const [contributions, overrides] of [[[roleRow], []], [[], [globalRow]]] as const) {
                usedBy([...contributions], [...overrides]);
                const e = make({ Caller: ALICE, Dirty: ['Status'] });
                expect(await e.Save()).toBe(false);
                expect(e.SuperSaveCalled).toBe(false);
                expect(e.EmbeddingsGenerated).toBe(false);
                expect(e.Recorded).toMatchObject({ Success: false, Type: 'update' });
                expect(e.Recorded?.Message).toMatch(/Manage Form Defaults/);
            }
        });

        it('lets a holder change a component a Role or Global row uses', async () => {
            usedBy([roleRow], [globalRow]);
            expect(await make({ Caller: OWNER, Dirty: ['Name'] }).Save()).toBe(true);
        });

        it("refuses a holder changing a component another user's personal row uses", async () => {
            usedBy([], [bobRow]);
            const e = make({ Caller: OWNER, Dirty: ['Type'] });
            expect(await e.Save()).toBe(false);
            expect(e.Recorded?.Message).toMatch(/belongs to someone else/);
        });

        it('lets any user change a component no form or panel uses', async () => {
            usedBy([]);
            expect(await make({ Caller: ALICE, Dirty: ['Specification'] }).Save()).toBe(true);
        });

        it('does not look up the rows for a change to a column a form or panel does not draw', async () => {
            usedBy([globalRow]);
            const e = make({ Caller: ALICE, Dirty: ['Description', 'Title'] });
            expect(await e.Save()).toBe(true);
            expect(views.calls).toEqual([]);
        });

        it('never checks a create', async () => {
            usedBy([globalRow]);
            const e = make({ IsSaved: false, Caller: ALICE, Dirty: ['Specification', 'Status', 'Name', 'Type'] });
            expect(await e.Save()).toBe(true);
            expect(views.calls).toEqual([]);
        });

        it('allows a save with no caller, a trusted server context, without looking up the rows', async () => {
            usedBy([bobRow, globalRow]);
            expect(await make({ Caller: null, Dirty: ['Specification'] }).Save()).toBe(true);
            expect(views.calls).toEqual([]);
        });

        it('looks up both kinds of row by the stored component ID, escaped, as the caller', async () => {
            usedBy([aliceRow]);
            const e = make({ Caller: ALICE, Dirty: ['Specification'] });
            e.ID = "COMP-'1";
            e.SetOldValue('ID', "COMP-'1");
            await e.Save();
            expect(views.calls.map((c) => c.EntityName).sort()).toEqual([CONTRIBUTIONS, OVERRIDES]);
            for (const call of views.calls) {
                expect(call).toMatchObject({ ExtraFilter: "ComponentID='COMP-''1'", ResultType: 'simple', ContextUser: ALICE });
                expect(call.Fields).toEqual(expect.arrayContaining(['Scope', 'UserID']));
            }
        });

        it('refuses the change when a lookup fails', async () => {
            usedBy([aliceRow]);
            views.failing.add(OVERRIDES);
            const e = make({ Caller: OWNER, Dirty: ['Specification'] });
            expect(await e.Save()).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
            expect(e.Recorded?.Message).toMatch(/could not be read/);
        });

        it('refuses the change when a lookup throws', async () => {
            views.throws = true;
            const e = make({ Caller: OWNER, Dirty: ['Specification'] });
            expect(await e.Save()).toBe(false);
            expect(e.Recorded?.Message).toMatch(/could not be read/);
        });
    });

    describe('Save({ ReplayOnly })', () => {
        it('checks a replayed save as a change to every guarded column, since it skips validation', async () => {
            usedBy([roleRow]);
            const e = make({ Caller: ALICE });
            expect(await e.Save({ ReplayOnly: true })).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
        });

        it('lets a replayed save through for a caller the rule allows', async () => {
            usedBy([roleRow]);
            expect(await make({ Caller: OWNER }).Save({ ReplayOnly: true })).toBe(true);
            usedBy([aliceRow]);
            expect(await make({ Caller: ALICE }).Save({ ReplayOnly: true })).toBe(true);
        });

        it("refuses a holder's replayed save of a component another user's personal row uses", async () => {
            usedBy([bobRow]);
            expect(await make({ Caller: OWNER }).Save({ ReplayOnly: true })).toBe(false);
        });
    });

    describe('Delete()', () => {
        it('lets a user delete a component only their own panel uses', async () => {
            usedBy([aliceRow]);
            const e = make({ Caller: ALICE });
            expect(await e.Delete()).toBe(true);
            expect(e.SuperDeleteCalled).toBe(true);
        });

        it('refuses a non-holder deleting a component a shared row uses, before the delete', async () => {
            usedBy([], [roleRow]);
            const e = make({ Caller: ALICE });
            expect(await e.Delete()).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
            expect(e.Recorded).toMatchObject({ Success: false, Type: 'delete' });
        });

        it("refuses a holder deleting a component another user's personal row uses", async () => {
            usedBy([bobRow]);
            expect(await make({ Caller: OWNER }).Delete()).toBe(false);
        });

        it('lets any user delete a component no form or panel uses', async () => {
            usedBy([]);
            expect(await make({ Caller: ALICE }).Delete()).toBe(true);
        });

        it('refuses the delete when a lookup fails', async () => {
            views.failing.add(CONTRIBUTIONS);
            const e = make({ Caller: ALICE });
            expect(await e.Delete()).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
        });
    });
});
