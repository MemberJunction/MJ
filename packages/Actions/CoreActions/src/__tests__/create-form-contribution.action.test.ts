import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

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
        lintViolations: [] as Array<{ severity: string; rule: string; message: string }>,
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
        async Save() { return target.saveOutcome; },
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
    EntityByName: (name: string) => entitiesByName[name.trim().toLowerCase()],
    GetEntityObject: async <T>(entityName: string): Promise<T> => makeEntity(entityName) as unknown as T,
};

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    class MockRunView {
        async RunView<T>(): Promise<{ Success: boolean; Results: T[] }> {
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

beforeEach(() => { hoisted.entities = []; hoisted.dupRows = []; hoisted.lintViolations = []; });

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

    it('surfaces blocking lint violations', async () => {
        hoisted.lintViolations = [{ severity: 'high', rule: 'no-window', message: 'window access' }];
        expect((await run(params())).ResultCode).toBe('LINT_FAILED');
    });

    it('requires EntityName, Name and Spec', async () => {
        expect((await run(params({ EntityName: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
        expect((await run(params({ Name: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
        expect((await run(params({ Spec: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
    });

    it('reports ENTITY_NOT_FOUND for an unregistered entity', async () => {
        expect((await run(params({ EntityName: 'Not An Entity' }))).ResultCode).toBe('ENTITY_NOT_FOUND');
    });
});
