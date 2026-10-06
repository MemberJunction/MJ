/**
 * Unit tests for `MJComponentEntityServer`: the guard on a component that forms and panels draw.
 *
 * A form or panel draws the component its row points at, and a form's spec can load a component
 * by name, so a change to a component can change what other people's forms draw. Without the
 * grant a user may change or delete only a component of their own, on any column; a holder's
 * update is checked when it changes the specification, status, name, namespace or type. What is
 * pinned here is the wiring: which writes read what, that the changed columns come from the stored
 * row, and that an ordinary save, a `ReplayOnly` save and a delete are each refused before the
 * write. The rules themselves are tested as a matrix in `@memberjunction/core-entities`.
 *
 * The extended base is mocked to a settable stub, and `RunView` to a stand-in database holding
 * components and the form and panel rows that use them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformSQL } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

/** The caller shape the guard reads: `ID` for ownership, `Type` for the Owner exemption. */
interface StubCaller {
    ID: string;
    Type: string;
}

/** A stored component, as the stand-in database holds it. */
interface StoredComponent {
    ID: string;
    Name: string;
    Namespace: string | null;
    Specification: string;
    Status: string | null;
    Type: string | null;
}

/** A form or panel row that uses a component. */
interface StoredUse {
    Entity: 'MJ: Entity Form Contributions' | 'MJ: Entity Form Overrides';
    ID: string;
    ComponentID: string;
    Scope: string;
    UserID: string | null;
}

/** One view the guard ran, with the user it ran as. */
interface ViewCall {
    EntityName: string;
    ExtraFilter: string | PlatformSQL;
    Fields: string[];
    ContextUser: unknown;
}

/** The filter SQL Server runs: the `sqlserver` variant when there is one, else the default. */
function sqlServerFilter(filter: string | PlatformSQL): string {
    return typeof filter === 'string' ? filter : filter.sqlserver ?? filter.default;
}

const { db } = vi.hoisted(() => ({
    db: {
        components: [] as StoredComponent[],
        uses: [] as StoredUse[],
        /** `Create` record changes: which user created which component, and the row's Source. */
        created: [] as Array<{ ComponentID: string; UserID: string; Source: string }>,
        failing: new Set<string>(),
        throws: false,
        calls: [] as ViewCall[][],
    },
}));

/** Answers a view the way the database would for the filters the guard writes. */
function answer(entityName: string, filter: string): Array<Record<string, unknown>> {
    if (entityName === 'MJ: Record Changes') {
        const userID = /UserID='([^']*)'/.exec(filter)?.[1];
        const recordIDs = [...filter.matchAll(/'ID\|([^']*)'/g)].map((m) => m[1]);
        const internalOnly = filter.includes("Source='Internal'");
        return db.created
            .filter((c) => c.UserID === userID && recordIDs.includes(c.ComponentID))
            .filter((c) => !internalOnly || c.Source === 'Internal')
            .map((c) => ({ RecordID: `ID|${c.ComponentID.toUpperCase()}` }));
    }
    if (entityName === 'MJ: Components') {
        const byID = /^ID='([^']*)'$/.exec(filter);
        if (byID) return db.components.filter((c) => c.ID === byID[1]).map((c) => ({ ...c }));
        const byName = /^LOWER\(LTRIM\(RTRIM\(Name\)\)\)=LOWER\(N?'((?:[^']|'')*)'\)(?: AND ID<>'([^']*)')?$/.exec(filter);
        if (byName) {
            const name = byName[1].replace(/''/g, "'").trim().toLowerCase();
            return db.components
                .filter((c) => c.Name.trim().toLowerCase() === name && c.ID !== byName[2])
                .map((c) => ({ ID: c.ID }));
        }
        throw new Error(`unexpected component filter: ${filter}`);
    }
    const ids = [...filter.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    return db.uses
        .filter((u) => u.Entity === entityName && ids.includes(u.ComponentID))
        .map(({ ID, ComponentID, Scope, UserID }) => ({ ID, ComponentID, Scope, UserID }));
}

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        public async RunViews(
            params: Array<{ EntityName: string; ExtraFilter: string | PlatformSQL; Fields: string[] }>,
            contextUser?: unknown,
        ): Promise<Array<{ Success: boolean; Results: Array<Record<string, unknown>>; ErrorMessage?: string }>> {
            if (db.throws) throw new Error('connection lost');
            db.calls.push(params.map((p) => ({ EntityName: p.EntityName, ExtraFilter: p.ExtraFilter, Fields: p.Fields, ContextUser: contextUser })));
            return params.map((p) => db.failing.has(p.EntityName)
                ? { Success: false, Results: [], ErrorMessage: `cannot read ${p.EntityName}` }
                : { Success: true, Results: answer(p.EntityName, sqlServerFilter(p.ExtraFilter)) });
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
        public Name = 'PersonLtvStrip';
        public Namespace: string | null = null;
        public Specification = '{"v":1}';
        public Status: string | null = 'Published';
        public Type: string | null = 'Widget';
        public Description: string | null = null;
        public Version = '1.0.0';
        public VersionSequence = 1;
        public IsSaved = true;
        public ContextCurrentUser: StubCaller | null = null;
        public SuperSaveCalled = false;
        public SuperDeleteCalled = false;
        public EmbeddingsGenerated = false;
        public Recorded: { Success: boolean; Type: string; Message: string } | null = null;
        /** No authorization metadata: only an `Owner`-type caller holds the grant. */
        public ProviderToUse = { Authorizations: [], EntityByName: () => ({ ID: 'ENT-COMPONENTS' }) };

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

/** The stub's members, which are not on the real entity's type. */
interface StubHooks {
    ID: string;
    Name: string;
    Namespace: string | null;
    Specification: string;
    Status: string | null;
    Type: string | null;
    Description: string | null;
    Version: string;
    VersionSequence: number;
    IsSaved: boolean;
    ContextCurrentUser: StubCaller | null;
    SuperSaveCalled: boolean;
    SuperDeleteCalled: boolean;
    EmbeddingsGenerated: boolean;
    Recorded: { Success: boolean; Type: string; Message: string } | null;
    Save(options?: { ReplayOnly?: boolean }): Promise<boolean>;
    Delete(): Promise<boolean>;
}

/** COMP-1 as stored. */
function storeComponent(over: Partial<StoredComponent> = {}): void {
    db.components.push({
        ID: 'COMP-1', Name: 'PersonLtvStrip', Namespace: null, Specification: '{"v":1}',
        Status: 'Published', Type: 'Widget', ...over,
    });
}

/** A row that uses a component. */
function use(componentID: string, scope: string, userID: string | null, entity: StoredUse['Entity'] = CONTRIBUTIONS): void {
    db.uses.push({ Entity: entity, ID: `ROW-${db.uses.length + 1}`, ComponentID: componentID, Scope: scope, UserID: userID });
}

/** The component as loaded, for a caller, matching the stored COMP-1 until a test changes it. */
function make(caller: StubCaller | null, over: Partial<StubHooks> = {}): StubHooks {
    const e = new MJComponentEntityServer() as unknown as StubHooks;
    e.ContextCurrentUser = caller;
    Object.assign(e, over);
    return e;
}

/** Records that this user created the component, through the platform unless a Source is given. */
function createdBy(componentID: string, user: StubCaller, source = 'Internal'): void {
    db.created.push({ ComponentID: componentID, UserID: user.ID, Source: source });
}

beforeEach(() => {
    db.components = [];
    db.uses = [];
    db.created = [];
    db.failing = new Set();
    db.throws = false;
    db.calls = [];
});

describe('MJComponentEntityServer — form component guard', () => {
    describe('an update without the grant', () => {
        it('is allowed when every row that uses the component is the caller\'s own', async () => {
            storeComponent();
            use('COMP-1', 'User', ALICE.ID);
            use('COMP-1', 'User', ALICE.ID, OVERRIDES);
            const e = make(ALICE, { Specification: '{"v":2}' });
            expect(await e.Save()).toBe(true);
            expect(e.SuperSaveCalled).toBe(true);
            expect(e.EmbeddingsGenerated).toBe(true);
        });

        it('is refused for a component no row uses and someone else created, before the write', async () => {
            storeComponent();
            createdBy('COMP-1', BOB);
            const e = make(ALICE, { Specification: '{"v":2}' });
            expect(await e.Save()).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
            expect(e.EmbeddingsGenerated).toBe(false);
            expect(e.Recorded).toMatchObject({ Success: false, Type: 'update' });
            expect(e.Recorded?.Message).toMatch(/No form or panel uses this one, you did not create it/);
        });

        it('is refused for a component no row uses and no Create record change names the caller', async () => {
            storeComponent();
            expect(await make(ALICE, { Specification: '{"v":2}' }).Save()).toBe(false);
        });

        it('is allowed for a component no row uses that the caller created', async () => {
            storeComponent();
            createdBy('COMP-1', ALICE);
            expect(await make(ALICE, { Specification: '{"v":2}' }).Save()).toBe(true);
        });

        it('ignores a Create record change that is not Internal when reading the creator', async () => {
            storeComponent();
            createdBy('COMP-1', ALICE, 'External');
            expect(await make(ALICE, { Specification: '{"v":2}' }).Save()).toBe(false);
        });

        it('is refused for a component a Role or Global row uses', async () => {
            storeComponent();
            use('COMP-1', 'User', ALICE.ID);
            use('COMP-1', 'Global', null, OVERRIDES);
            const e = make(ALICE, { Status: 'Deprecated' });
            expect(await e.Save()).toBe(false);
            expect(e.Recorded?.Message).toMatch(/Manage Form Defaults/);
        });

        /** Changes to columns the holder rule does not guard. */
        const UNGUARDED_CHANGES: Array<Partial<StubHooks>> = [
            { Description: 'new words' }, { VersionSequence: 2147483647 }, { Version: '9.9.9' },
        ];

        it("is refused for a change to any column of another user's component, before the write", async () => {
            storeComponent();
            use('COMP-1', 'User', BOB.ID);
            for (const change of UNGUARDED_CHANGES) {
                const e = make(ALICE, change);
                expect(await e.Save()).toBe(false);
                expect(e.SuperSaveCalled).toBe(false);
                expect(e.Recorded?.Message).toMatch(/only a component of your own/);
            }
            db.uses = [];
            createdBy('COMP-1', BOB);
            for (const change of UNGUARDED_CHANGES) {
                const e = make(ALICE, change);
                expect(await e.Save()).toBe(false);
                expect(e.Recorded?.Message).toMatch(/No form or panel uses this one, you did not create it/);
            }
        });

        it('is allowed for a change to any column of the caller\'s own component', async () => {
            storeComponent();
            use('COMP-1', 'User', ALICE.ID);
            for (const change of UNGUARDED_CHANGES) {
                expect(await make(ALICE, change).Save()).toBe(true);
            }
            db.uses = [];
            createdBy('COMP-1', ALICE);
            for (const change of UNGUARDED_CHANGES) {
                expect(await make(ALICE, change).Save()).toBe(true);
            }
        });
    });

    describe('an update with the grant', () => {
        it('is allowed for a component a Role or Global row uses, or no row uses', async () => {
            storeComponent();
            use('COMP-1', 'Role', null);
            expect(await make(OWNER, { Specification: '{"v":2}' }).Save()).toBe(true);
            db.uses = [];
            expect(await make(OWNER, { Specification: '{"v":3}' }).Save()).toBe(true);
        });

        it("is refused for a component another user's personal row uses", async () => {
            storeComponent();
            use('COMP-1', 'User', BOB.ID, OVERRIDES);
            const e = make(OWNER, { Type: 'Form' });
            expect(await e.Save()).toBe(false);
            expect(e.Recorded?.Message).toMatch(/belongs to someone else/);
        });

        it('is allowed for a change to the description, and to the specification, of a component a Role row uses', async () => {
            storeComponent();
            use('COMP-1', 'Role', null);
            expect(await make(OWNER, { Description: 'new words' }).Save()).toBe(true);
            expect(await make(OWNER, { Specification: '{"v":2}' }).Save()).toBe(true);
        });

        it("checks only the guarded columns, so a description change to a component another user's personal row uses is allowed", async () => {
            storeComponent();
            use('COMP-1', 'User', BOB.ID);
            expect(await make(OWNER, { Description: 'new words' }).Save()).toBe(true);
            expect(await make(OWNER, { VersionSequence: 2 }).Save()).toBe(true);
            expect(await make(OWNER, { Specification: '{"v":2}' }).Save()).toBe(false);
        });
    });

    describe('reading what the update changes', () => {
        it('compares with the stored row, so a value the client claims was loaded does not hide a change', async () => {
            storeComponent({ Specification: '{"stored":true}' });
            const e = make(ALICE, { Specification: '{"v":1}' });
            expect(await e.Save()).toBe(false);
        });

        it('reads the rows that use the component and the stored row in one batch, as the caller', async () => {
            storeComponent();
            use('COMP-1', 'User', ALICE.ID);
            const e = make(ALICE, { ID: "COMP-'1" });
            db.components[0].ID = "COMP-'1";
            db.uses[0].ComponentID = "COMP-'1";
            await e.Save();
            expect(db.calls).toHaveLength(1);
            const batch = db.calls[0];
            expect(batch.map((c) => c.EntityName)).toEqual([CONTRIBUTIONS, OVERRIDES, 'MJ: Components', 'MJ: Components', 'MJ: Record Changes']);
            expect(batch[0]).toMatchObject({ ExtraFilter: "ComponentID='COMP-''1'", ContextUser: ALICE });
            expect(batch[2].Fields).toEqual(['Specification', 'Status', 'Name', 'Type', 'Namespace']);
            expect(batch[3].ExtraFilter).toEqual({
                default: "LOWER(LTRIM(RTRIM(Name)))=LOWER('PersonLtvStrip') AND ID<>'COMP-''1'",
                sqlserver: "LOWER(LTRIM(RTRIM(Name)))=LOWER(N'PersonLtvStrip') AND ID<>'COMP-''1'",
            });
            expect(batch[4].ExtraFilter).toBe(
                `EntityID='ENT-COMPONENTS' AND Source='Internal' AND Type='Create' AND UserID='${ALICE.ID}' AND RecordID IN ('ID|COMP-''1')`);
        });

        it('is refused when a read fails or throws', async () => {
            storeComponent();
            use('COMP-1', 'User', ALICE.ID);
            db.failing.add(OVERRIDES);
            const failed = make(OWNER, { Specification: '{"v":2}' });
            expect(await failed.Save()).toBe(false);
            expect(failed.Recorded?.Message).toMatch(/could not be read/);
            db.failing.clear();
            db.throws = true;
            expect(await make(OWNER, { Specification: '{"v":2}' }).Save()).toBe(false);
        });

        it('is refused when the stored row cannot be found', async () => {
            const e = make(OWNER, { Specification: '{"v":2}' });
            expect(await e.Save()).toBe(false);
            expect(e.Recorded?.Message).toMatch(/not found/);
        });

        it('allows a save with no caller, a trusted server context, without reading anything', async () => {
            expect(await make(null, { Specification: '{"v":2}' }).Save()).toBe(true);
            expect(db.calls).toEqual([]);
        });
    });

    describe('a name another component has', () => {
        it('refuses a create without the grant when the other component is not the caller\'s own', async () => {
            db.components.push({ ID: 'OTHER', Name: 'personltvstrip', Namespace: 'acme', Specification: '{}', Status: null, Type: null });
            const e = make(ALICE, { IsSaved: false, ID: 'NEW' });
            expect(await e.Save()).toBe(false);
            expect(e.Recorded).toMatchObject({ Type: 'create' });
            expect(e.Recorded?.Message).toMatch(/already has this name/);
        });

        it('allows a create without the grant when the only same-named component is the caller\'s own', async () => {
            db.components.push({ ID: 'MINE', Name: 'PersonLtvStrip', Namespace: null, Specification: '{}', Status: null, Type: null });
            use('MINE', 'User', ALICE.ID);
            expect(await make(ALICE, { IsSaved: false, ID: 'NEW' }).Save()).toBe(true);
        });

        it('allows a create without the grant when the same-named component is one no row uses that the caller created', async () => {
            db.components.push({ ID: 'LEFTOVER', Name: 'PersonLtvStrip', Namespace: null, Specification: '{}', Status: null, Type: null });
            createdBy('LEFTOVER', ALICE);
            expect(await make(ALICE, { IsSaved: false, ID: 'NEW' }).Save()).toBe(true);
            db.created = [];
            createdBy('LEFTOVER', BOB);
            expect(await make(ALICE, { IsSaved: false, ID: 'NEW' }).Save()).toBe(false);
        });

        it('finds a stored name with padding or other casing, as the server lookup compares names', async () => {
            db.components.push({ ID: 'PADDED', Name: ' Foo', Namespace: null, Specification: '{}', Status: null, Type: null });
            const e = make(ALICE, { IsSaved: false, ID: 'NEW', Name: 'foo' });
            expect(await e.Save()).toBe(false);
            expect(e.Recorded?.Message).toMatch(/already has this name/);
            expect(db.calls[0][0].ExtraFilter).toEqual({
                default: "LOWER(LTRIM(RTRIM(Name)))=LOWER('foo')",
                sqlserver: "LOWER(LTRIM(RTRIM(Name)))=LOWER(N'foo')",
            });
        });

        it('names a non-Latin-1 component with a Unicode literal on SQL Server', async () => {
            const e = make(ALICE, { IsSaved: false, ID: 'NEW', Name: 'Łódź Panel' });
            expect(await e.Save()).toBe(true);
            expect(sqlServerFilter(db.calls[0][0].ExtraFilter)).toBe("LOWER(LTRIM(RTRIM(Name)))=LOWER(N'Łódź Panel')");
            db.components.push({ ID: 'BOBS', Name: 'łódź panel', Namespace: null, Specification: '{}', Status: null, Type: null });
            use('BOBS', 'User', BOB.ID);
            expect(await make(ALICE, { IsSaved: false, ID: 'NEW', Name: 'Łódź Panel' }).Save()).toBe(false);
        });

        it('refuses a create without the grant when the name check throws', async () => {
            db.components.push({ ID: 'OTHER', Name: 'PersonLtvStrip', Namespace: null, Specification: '{}', Status: null, Type: null });
            db.throws = true;
            const e = make(ALICE, { IsSaved: false, ID: 'NEW' });
            expect(await e.Save()).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
            expect(e.Recorded?.Message).toMatch(/could not be read.*connection lost/);
        });

        it('allows a create with no same-named component', async () => {
            expect(await make(ALICE, { IsSaved: false, ID: 'NEW', Name: 'Unique' }).Save()).toBe(true);
        });

        it('allows a holder to create a same-named component, without reading anything', async () => {
            db.components.push({ ID: 'OTHER', Name: 'PersonLtvStrip', Namespace: null, Specification: '{}', Status: null, Type: null });
            expect(await make(OWNER, { IsSaved: false, ID: 'NEW' }).Save()).toBe(true);
            expect(db.calls).toEqual([]);
        });

        it('refuses a rename onto a name another user\'s component has, and allows it with the grant', async () => {
            storeComponent();
            use('COMP-1', 'User', ALICE.ID);
            db.components.push({ ID: 'BOBS', Name: 'Shared', Namespace: null, Specification: '{}', Status: null, Type: null });
            use('BOBS', 'User', BOB.ID);
            const renamed = make(ALICE, { Name: 'Shared' });
            expect(await renamed.Save()).toBe(false);
            expect(renamed.Recorded?.Message).toMatch(/already has this name/);
            db.uses = db.uses.filter((u) => u.ComponentID !== 'COMP-1');
            use('COMP-1', 'Global', null);
            expect(await make(OWNER, { Name: 'Shared' }).Save()).toBe(true);
        });

        it('does not check the name when an update leaves name and namespace alone', async () => {
            storeComponent();
            use('COMP-1', 'User', ALICE.ID);
            db.components.push({ ID: 'OTHER', Name: 'PersonLtvStrip', Namespace: null, Specification: '{}', Status: null, Type: null });
            expect(await make(ALICE, { Specification: '{"v":2}' }).Save()).toBe(true);
        });
    });

    describe('Save({ ReplayOnly })', () => {
        it('is checked against the stored row like an ordinary save', async () => {
            storeComponent();
            use('COMP-1', 'Role', null);
            const e = make(ALICE, { Specification: '{"v":2}' });
            expect(await e.Save({ ReplayOnly: true })).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
            expect(await make(OWNER, { Specification: '{"v":2}' }).Save({ ReplayOnly: true })).toBe(true);
        });
    });

    describe('Delete()', () => {
        it('lets a user delete a component only their own rows use', async () => {
            use('COMP-1', 'User', ALICE.ID);
            const e = make(ALICE);
            expect(await e.Delete()).toBe(true);
            expect(e.SuperDeleteCalled).toBe(true);
        });

        it('refuses a user without the grant deleting a component no row uses that they did not create, before the delete', async () => {
            const e = make(ALICE);
            expect(await e.Delete()).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
            expect(e.Recorded).toMatchObject({ Success: false, Type: 'delete' });
            createdBy('COMP-1', ALICE);
            expect(await make(ALICE).Delete()).toBe(true);
        });

        it('refuses when the component entity is missing from the metadata, so the creator cannot be read', async () => {
            const e = make(ALICE);
            (e as unknown as { ProviderToUse: { EntityByName: () => undefined } }).ProviderToUse.EntityByName = () => undefined;
            expect(await e.Delete()).toBe(false);
            expect(e.Recorded?.Message).toMatch(/could not be read/);
        });

        it('lets a holder delete a component a shared row or no row uses, but not one another user\'s row uses', async () => {
            use('COMP-1', 'Global', null);
            expect(await make(OWNER).Delete()).toBe(true);
            db.uses = [];
            expect(await make(OWNER).Delete()).toBe(true);
            use('COMP-1', 'User', BOB.ID);
            expect(await make(OWNER).Delete()).toBe(false);
        });

        it('refuses the delete when a read fails', async () => {
            db.failing.add(CONTRIBUTIONS);
            const e = make(OWNER);
            expect(await e.Delete()).toBe(false);
            expect(e.SuperDeleteCalled).toBe(false);
        });
    });
});
