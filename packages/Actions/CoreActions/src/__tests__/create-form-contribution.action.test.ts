import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import {
    ComponentNameCollisionRefusal, FormRowComponentRefusal, UserCanManageFormDefaults, type FormComponentReference,
} from '@memberjunction/core-entities';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

/**
 * Hoisted so the `vi.mock` factories below can reach it. A factory runs while the
 * module under test is being imported, which is before any top-level `const` in this
 * file has initialized — reaching a plain const from one is a TDZ error.
 */
const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        entities: [] as Array<{ entityName: string; fields: Record<string, unknown>; saveOutcome: boolean; ID: string }>,
        dupRows: [] as Array<{ ID: string; Status: string }>,
        dupQueryFails: false,
        lintViolations: [] as Array<{ severity: string; rule: string; message: string }>,
        /** Entity names whose new rows fail to save. */
        failingSaves: new Set<string>(),
        /** While a transaction is open, saves are pending and reach `committed` only on Commit. */
        tx: { supported: false, open: false, pending: [] as string[], committed: [] as string[], rolledBack: 0 },
        /** Stands in for the server's component and row guards: a refusal for a new row, or null. */
        saveGuard: null as ((entityName: string, fields: Record<string, unknown>, id: string) => string | null) | null,
    },
}));

type MockEntity = {
    entityName: string;
    fields: Record<string, unknown>;
    saveOutcome: boolean;
    ID: string;
    NewRecord(): void;
    Save(): Promise<boolean>;
    LatestResult: { CompleteMessage: string };
};

function makeEntity(entityName: string): MockEntity {
    const target: MockEntity = {
        entityName,
        fields: {},
        saveOutcome: true,
        ID: `${entityName}-id`,
        NewRecord() { /* no-op */ },
        async Save() {
            if (!target.saveOutcome || hoisted.failingSaves.has(entityName)) return false;
            const refusal = hoisted.saveGuard?.(entityName, target.fields, target.ID) ?? null;
            if (refusal) {
                target.LatestResult = { CompleteMessage: refusal };
                return false;
            }
            if (hoisted.tx.open) hoisted.tx.pending.push(entityName);
            else hoisted.tx.committed.push(entityName);
            return true;
        },
        LatestResult: { CompleteMessage: 'mock' },
    };
    hoisted.entities.push(target);
    return new Proxy(target, {
        set(t, prop, value) {
            if (typeof prop === 'string' && !(prop in t)) { t.fields[prop] = value; return true; }
            (t as unknown as Record<string | symbol, unknown>)[prop] = value;
            return true;
        },
        get(t, prop) {
            if (typeof prop === 'string' && prop in t.fields) return t.fields[prop];
            return (t as unknown as Record<string | symbol, unknown>)[prop];
        },
    });
}

const entitiesByName: Record<string, { ID: string; Name: string }> = {
    'mj_bizapps_common: people': { ID: 'ENT-PEOPLE', Name: 'MJ_BizApps_Common: People' },
    'mj_bizapps_orders: event order lines': { ID: 'ENT-TICKETS', Name: 'MJ_BizApps_Orders: Event Order Lines' },
    'mj: users': { ID: 'ENT-USERS', Name: 'MJ: Users' },
};

const provider = {
    get SupportsEntityTransactions() { return hoisted.tx.supported; },
    async BeginEntityTransaction() {
        hoisted.tx.open = true;
        return {
            IsNested: false,
            async Commit() { hoisted.tx.committed.push(...hoisted.tx.pending); hoisted.tx.pending = []; hoisted.tx.open = false; },
            async Rollback() { hoisted.tx.pending = []; hoisted.tx.open = false; hoisted.tx.rolledBack++; },
        };
    },
    EntityByName: (name: string) => entitiesByName[name.trim().toLowerCase()],
    GetEntityObject: async <T>(entityName: string): Promise<T> => makeEntity(entityName) as unknown as T,
};

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    class MockRunView {
        async RunView<T>(): Promise<{ Success: boolean; Results: T[]; ErrorMessage?: string }> {
            if (hoisted.dupQueryFails) return { Success: false, Results: [], ErrorMessage: 'boom' };
            return { Success: true, Results: hoisted.dupRows as unknown as T[] };
        }
        static FromMetadataProvider(): MockRunView { return new MockRunView(); }
    }
    return { ...actual, Metadata: { Provider: undefined }, RunView: MockRunView, LogError: vi.fn() };
});

vi.mock('@memberjunction/react-linter', () => ({
    ComponentLinter: { lintComponent: async () => ({ violations: hoisted.lintViolations }) },
}));

import { CreateFormContributionAction } from '../custom/interactive-forms/create-form-contribution.action';

const user = { ID: 'USER-1', Name: 'Test User', UserRoles: [] };

const panelSpec = {
    name: 'PersonLtvStrip',
    title: 'Lifetime value',
    location: 'embedded',
    componentRole: 'form-panel',
    code: 'function PersonLtvStrip(props) { return null; }',
    formContribution: {
        slot: 'before-fields',
        presentation: 'bare',
        title: 'Lifetime value',
        contributionKey: 'skip:person-ltv',
        configuration: { metric: 'ltv' },
    },
};

function params(over: Record<string, unknown> = {}): RunActionParams {
    const values: Record<string, unknown> = {
        EntityName: 'MJ_BizApps_Common: People', Name: 'LTV strip', Spec: panelSpec, ...over,
    };
    return {
        Params: Object.entries(values)
            .filter(([, v]) => v !== undefined)
            .map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        ContextUser: user,
        Provider: provider,
    } as unknown as RunActionParams;
}

async function run(p: RunActionParams): Promise<ActionResultSimple> {
    const action = new CreateFormContributionAction();
    return (action as unknown as { InternalRunAction(p: RunActionParams): Promise<ActionResultSimple> }).InternalRunAction(p);
}

const componentRow = () => hoisted.entities.find(e => e.entityName === 'MJ: Components')!;
const contributionRow = () => hoisted.entities.find(e => e.entityName === 'MJ: Entity Form Contributions')!;

beforeEach(() => {
    hoisted.entities = []; hoisted.dupRows = []; hoisted.dupQueryFails = false; hoisted.lintViolations = [];
    hoisted.failingSaves = new Set();
    hoisted.tx = { supported: false, open: false, pending: [], committed: [], rolledBack: 0 };
    hoisted.saveGuard = null;
});

describe('CreateFormContributionAction', () => {
    it('inserts a Widget component and a Pending User-scope contribution row from the spec block', async () => {
        const result = await run(params());
        expect(result.Success).toBe(true);
        expect(componentRow().fields).toMatchObject({
            Type: 'Widget', Status: 'Draft', Version: '1.0.0', Name: 'PersonLtvStrip',
        });
        expect(contributionRow().fields).toMatchObject({
            EntityID: 'ENT-PEOPLE', ComponentID: componentRow().ID, Name: 'LTV strip',
            Slot: 'before-fields', Presentation: 'bare', ContributionKey: 'skip:person-ltv',
            Scope: 'User', UserID: 'USER-1', RoleID: null, Precedence: 0, Status: 'Pending',
            Configuration: JSON.stringify({ metric: 'ltv' }), Title: 'Lifetime value',
        });
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({
            ContributionID: contributionRow().ID, ComponentID: componentRow().ID, Version: '1.0.0',
        });
    });

    it('resolves a related-entity claim to RelatedEntityID', async () => {
        const spec = { ...panelSpec, formContribution: {
            ...panelSpec.formContribution,
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: 'PersonID',
        } };
        await run(params({ Spec: spec }));
        expect(contributionRow().fields).toMatchObject({ RelatedEntityID: 'ENT-TICKETS', RelatedJoinField: 'PersonID' });
    });

    it('derives and persists a contribution key for a keyless related claim', async () => {
        const formContribution = { ...panelSpec.formContribution, relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: 'PersonID' } as Record<string, unknown>;
        delete formContribution.contributionKey;
        await run(params({ Spec: { ...panelSpec, formContribution } }));
        expect(contributionRow().fields.ContributionKey)
            .toBe('related:MJ_BizApps_Orders: Event Order Lines:PersonID');
    });

    // The renderer strips one wrapping bracket pair before deriving its key. A write path
    // that persisted the brackets would produce a key that never collapses against the
    // compiled registration claiming the same grid.
    it('strips wrapping brackets from the join field when deriving the key', async () => {
        const formContribution = { ...panelSpec.formContribution, relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: '[PersonID]' } as Record<string, unknown>;
        delete formContribution.contributionKey;
        await run(params({ Spec: { ...panelSpec, formContribution } }));
        expect(contributionRow().fields.ContributionKey)
            .toBe('related:MJ_BizApps_Orders: Event Order Lines:PersonID');
    });

    // A panel that claims nothing and names no key used to store ContributionKey NULL.
    // The duplicate check filters on that column, so it matched nothing and the same
    // panel could be applied over and over; the rail also keys its items by it, so the
    // panel got no rail item and its ChromeGroup was never read.
    it('derives a contribution key from the component name when nothing else supplies one', async () => {
        const formContribution = { ...panelSpec.formContribution } as Record<string, unknown>;
        delete formContribution.contributionKey;
        await run(params({ Spec: { ...panelSpec, formContribution } }));
        expect(contributionRow().fields.ContributionKey).toBe('panel:PersonLtvStrip');
    });

    it('blocks a second apply of the same keyless panel', async () => {
        const formContribution = { ...panelSpec.formContribution } as Record<string, unknown>;
        delete formContribution.contributionKey;
        hoisted.dupRows = [{ ID: 'ROW-1', Status: 'Active' }];
        const result = await run(params({ Spec: { ...panelSpec, formContribution } }));
        expect(result.ResultCode).toBe('ALREADY_EXISTS');
        expect(hoisted.entities).toHaveLength(0);
    });

    it('rejects an unknown related entity', async () => {
        const spec = { ...panelSpec, formContribution: { ...panelSpec.formContribution, relatedEntity: 'Nope' } };
        expect((await run(params({ Spec: spec }))).ResultCode).toBe('RELATED_ENTITY_NOT_FOUND');
    });

    it('honors an explicit Precedence', async () => {
        await run(params({ Precedence: '7' }));
        expect(contributionRow().fields.Precedence).toBe(7);
    });

    it('refuses a spec that is not a form panel', async () => {
        const result = await run(params({ Spec: { ...panelSpec, componentRole: 'form' } }));
        expect(result.ResultCode).toBe('LINT_FAILED');
        expect(hoisted.entities).toHaveLength(0);
    });

    it('rejects a contribution key outside the permitted character set', async () => {
        const spec = { ...panelSpec, formContribution: { ...panelSpec.formContribution, contributionKey: "skip:'; DROP--" } };
        const result = await run(params({ Spec: spec }));
        expect(result.ResultCode).toBe('INVALID_CONTRIBUTION_KEY');
        expect(hoisted.entities).toHaveLength(0);
    });

    it('returns ALREADY_EXISTS when an Active or Pending row shares the key', async () => {
        hoisted.dupRows = [{ ID: 'ROW-1', Status: 'Pending' }];
        expect((await run(params())).ResultCode).toBe('ALREADY_EXISTS');
    });

    it('returns QUERY_FAILED when the duplicate check cannot run, and writes nothing', async () => {
        hoisted.dupQueryFails = true;
        const result = await run(params());
        expect(result.ResultCode).toBe('QUERY_FAILED');
        expect(hoisted.entities).toHaveLength(0);
    });

    it('stores no rail metadata on a bare panel', async () => {
        const formContribution = { ...panelSpec.formContribution, inclusion: 'Primary', chromeGroup: 'details' };
        await run(params({ Spec: { ...panelSpec, formContribution } }));
        expect(contributionRow().fields).toMatchObject({ Presentation: 'bare', Inclusion: null, ChromeGroup: null });
    });

    it('surfaces blocking lint violations', async () => {
        hoisted.lintViolations = [{ severity: 'high', rule: 'no-window', message: 'window access' }];
        expect((await run(params())).ResultCode).toBe('LINT_FAILED');
    });

    it('requires EntityName, Name and Spec', async () => {
        expect((await run(params({ EntityName: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
        expect((await run(params({ Name: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
        expect((await run(params({ Spec: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
    });

    it('returns INVALID_CLAIM for a spec that makes two claims, and writes nothing', async () => {
        const formContribution = {
            ...panelSpec.formContribution, presentation: 'panel',
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', inSectionKey: 'contact',
        };
        const result = await run(params({ Spec: { ...panelSpec, formContribution } }));
        expect(result.ResultCode).toBe('INVALID_CLAIM');
        expect(result.Message).toContain('relatedEntity');
        expect(result.Message).toContain('inSectionKey');
        expect(hoisted.entities).toHaveLength(0);
    });

    /** The component and the row are written together or not at all. */
    it('rolls back the component when the contribution row is refused', async () => {
        hoisted.tx.supported = true;
        hoisted.failingSaves.add('MJ: Entity Form Contributions');
        const result = await run(params());
        expect(result.ResultCode).toBe('PERSIST_FAILED');
        expect(hoisted.tx.rolledBack).toBe(1);
        expect(hoisted.tx.committed).toEqual([]);
    });

    it('commits the component and the row together', async () => {
        hoisted.tx.supported = true;
        expect((await run(params())).Success).toBe(true);
        expect(hoisted.tx.committed).toEqual(['MJ: Components', 'MJ: Entity Form Contributions']);
    });

    it('reports ENTITY_NOT_FOUND for an unregistered entity', async () => {
        expect((await run(params({ EntityName: 'Not An Entity' }))).ResultCode).toBe('ENTITY_NOT_FOUND');
    });
});

/**
 * A UI user without Manage Form Defaults authors their own panel: the action creates a component,
 * then their own row pointing at it. The stand-in saves apply the server's rules: a new component
 * may not take a name another user's component has (`ComponentNameCollisionRefusal`), and a row may
 * point only at a component of the caller's own (`FormRowComponentRefusal`). A component no row uses
 * is the caller's when they created it; on the server that is the component's `Create` record
 * change, written in the same batch as the insert, so the row save that follows inside the same
 * transaction reads it. Here a component counts as created by the caller once its save succeeds,
 * even while the transaction is still open.
 */
describe('CreateFormContributionAction — a UI user without the Manage Form Defaults grant', () => {
    /** Components already stored, by name, with the rows that use them. */
    let existing: Array<{ Name: string; References: FormComponentReference[] }>;
    /** Rows already stored that point at a component, by component ID. */
    let uses: Array<FormComponentReference & { ComponentID: string }>;
    /** Components whose `Create` record change names the caller. */
    let createdByCaller: Set<string>;
    /** Whether a new component's `Create` record change can be read back by the row save. */
    let recordChangeVisible: boolean;

    const holdsGrant = () => UserCanManageFormDefaults(user as unknown as UserInfo, provider as never);

    beforeEach(() => {
        existing = [];
        uses = [];
        createdByCaller = new Set();
        recordChangeVisible = true;
        hoisted.saveGuard = (entityName, fields, id) => {
            if (entityName !== 'MJ: Components') {
                return FormRowComponentRefusal({
                    RowID: null,
                    References: uses.filter((u) => u.ComponentID === fields.ComponentID && u.ID !== id),
                    CreatedByCaller: createdByCaller.has(String(fields.ComponentID)),
                    CallerID: user.ID,
                    CallerHoldsGrant: holdsGrant(),
                });
            }
            const refusal = ComponentNameCollisionRefusal({
                NamesComponent: true,
                Collisions: existing
                    .filter((c) => c.Name.toLowerCase() === String(fields.Name).toLowerCase())
                    .map((c) => ({ References: c.References, CreatedByCaller: false })),
                CallerID: user.ID,
                CallerHoldsGrant: holdsGrant(),
            });
            if (!refusal && recordChangeVisible) createdByCaller.add(id);
            return refusal;
        };
    });

    it('holds no grant', () => {
        expect(holdsGrant()).toBe(false);
    });

    it('creates the component and their own row pointing at it, in one transaction', async () => {
        hoisted.tx.supported = true;
        const result = await run(params());
        expect(result.Success).toBe(true);
        expect(contributionRow().fields).toMatchObject({ ComponentID: componentRow().ID, Scope: 'User', UserID: 'USER-1' });
        expect(hoisted.tx.committed).toEqual(['MJ: Components', 'MJ: Entity Form Contributions']);
    });

    it('rolls the component back when the row cannot confirm the caller created it', async () => {
        hoisted.tx.supported = true;
        recordChangeVisible = false;
        const result = await run(params());
        expect(result.ResultCode).toBe('PERSIST_FAILED');
        expect(result.Message).toMatch(/you did not create it/);
        expect(hoisted.tx.rolledBack).toBe(1);
        expect(hoisted.tx.committed).toEqual([]);
    });

    it('is refused, writing nothing, when another user\'s component already has the name', async () => {
        hoisted.tx.supported = true;
        existing = [{ Name: 'PersonLtvStrip', References: [{ Scope: 'User', UserID: 'SOMEONE-ELSE' }] }];
        const result = await run(params());
        expect(result.ResultCode).toBe('PERSIST_FAILED');
        expect(result.Message).toMatch(/already has this name/);
        expect(hoisted.tx.committed).toEqual([]);
    });
});
