import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

type LoadedEntity = Record<string, unknown> & { entityName: string; saved: boolean; ID: string };
type CreatedEntity = { entityName: string; fields: Record<string, unknown>; ID: string };

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        created: [] as CreatedEntity[],
        /** First GetEntityObject per entity name returns the pre-loaded row; later ones are new. */
        loaded: new Map<string, LoadedEntity>(),
        served: new Set<string>(),
    },
}));

function loadedEntity(entityName: string, seed: Record<string, unknown>): LoadedEntity {
    const target: LoadedEntity = {
        entityName, saved: false, ID: seed.ID as string, ...seed,
        LatestResult: { CompleteMessage: 'mock' },
        async Load() { return true; },
        async Save() { target.saved = true; return true; },
        NewRecord() { /* no-op */ },
    };
    return target;
}

function newEntity(entityName: string) {
    const target: CreatedEntity & Record<string, unknown> = {
        entityName, fields: {}, ID: `${entityName}-new-${hoisted.created.length}`,
        LatestResult: { CompleteMessage: 'mock' },
        NewRecord() { /* no-op */ },
        async Save() { return true; },
    };
    hoisted.created.push(target);
    return new Proxy(target, {
        set(t, prop, value) {
            if (typeof prop === 'string' && !(prop in t)) { t.fields[prop] = value; return true; }
            (t as Record<string | symbol, unknown>)[prop] = value;
            return true;
        },
        get(t, prop) {
            if (typeof prop === 'string' && prop in t.fields) return t.fields[prop];
            return (t as Record<string | symbol, unknown>)[prop];
        },
    });
}

const provider = {
    EntityByName: (name: string) => ({
        'mj_bizapps_common: people': { ID: 'ENT-PEOPLE', Name: 'MJ_BizApps_Common: People' },
        'mj_bizapps_orders: event order lines': { ID: 'ENT-TICKETS', Name: 'MJ_BizApps_Orders: Event Order Lines' },
    }[name.trim().toLowerCase()]),
    GetEntityObject: async <T>(entityName: string): Promise<T> => {
        const preloaded = hoisted.loaded.get(entityName);
        if (preloaded && !hoisted.served.has(entityName)) {
            hoisted.served.add(entityName);
            return preloaded as unknown as T;
        }
        return newEntity(entityName) as unknown as T;
    },
};

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    class MockRunView {
        async RunView<T>(): Promise<{ Success: boolean; Results: T[] }> { return { Success: true, Results: [] }; }
        static FromMetadataProvider(): MockRunView { return new MockRunView(); }
    }
    return { ...actual, Metadata: { Provider: undefined }, RunView: MockRunView, LogError: vi.fn() };
});

vi.mock('@memberjunction/react-linter', () => ({
    ComponentLinter: { lintComponent: async () => ({ violations: [] }) },
}));

import { ModifyFormContributionAction } from '../custom/interactive-forms/modify-form-contribution.action';

const user = { ID: 'USER-1', Name: 'Test User', UserRoles: [] };

const spec = {
    name: 'PersonLtvStrip', title: 'Lifetime value v2', location: 'embedded', componentRole: 'form-panel',
    code: 'function PersonLtvStrip(props) { return null; }',
    formContribution: { slot: 'before-fields', presentation: 'bare', title: 'LTV v2', contributionKey: 'skip:person-ltv' },
};

function params(over: Record<string, unknown> = {}): RunActionParams {
    const values: Record<string, unknown> = { ContributionID: 'ROW-1', Spec: spec, ...over };
    return {
        Params: Object.entries(values).filter(([, v]) => v !== undefined)
            .map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        ContextUser: user, Provider: provider,
    } as unknown as RunActionParams;
}

async function run(p: RunActionParams): Promise<ActionResultSimple> {
    return (new ModifyFormContributionAction() as unknown as {
        InternalRunAction(p: RunActionParams): Promise<ActionResultSimple>;
    }).InternalRunAction(p);
}

let loadedRow: LoadedEntity;
let loadedComponent: LoadedEntity;

beforeEach(() => {
    hoisted.created = [];
    hoisted.served = new Set();
    loadedRow = loadedEntity('MJ: Entity Form Contributions', {
        ID: 'ROW-1', EntityID: 'ENT-PEOPLE', ComponentID: 'COMP-1', Name: 'LTV strip', Description: null, Notes: null,
        Slot: 'before-fields', SortKey: 0, ContributionKey: 'skip:person-ltv', RelatedEntityID: null, RelatedJoinField: null,
        ReplacesSectionKey: null, Inclusion: null, ChromeGroup: null, Presentation: 'bare', Title: 'LTV', Icon: null,
        Scope: 'User', UserID: 'USER-1', RoleID: null, Precedence: 0, Status: 'Pending', Configuration: null,
    });
    loadedComponent = loadedEntity('MJ: Components', {
        ID: 'COMP-1', Name: 'PersonLtvStrip', Title: 'LTV', Description: null,
        Version: '1.0.0', VersionSequence: 1, Status: 'Draft', Specification: '{}',
    });
    hoisted.loaded = new Map([
        ['MJ: Entity Form Contributions', loadedRow],
        ['MJ: Components', loadedComponent],
    ]);
});

const createdComponent = () => hoisted.created.find(c => c.entityName === 'MJ: Components')!;
const createdRow = () => hoisted.created.find(c => c.entityName === 'MJ: Entity Form Contributions')!;

describe('ModifyFormContributionAction', () => {
    it('overwrites a Pending source in place by default', async () => {
        const result = await run(params());
        expect(result.Success).toBe(true);
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({
            Mode: 'in-place', ContributionID: 'ROW-1', ComponentID: 'COMP-1', Version: '1.0.0',
        });
        expect(loadedComponent.saved).toBe(true);
        expect(JSON.parse(loadedComponent.Specification as string).formContribution.title).toBe('LTV v2');
        expect(loadedRow.Title).toBe('LTV v2');
        expect(hoisted.created).toHaveLength(0);
    });

    it('appends supplied notes to the existing notes', async () => {
        loadedRow.Notes = 'first pass';
        await run(params({ Notes: 'second pass' }));
        expect(loadedRow.Notes).toBe('first pass\nsecond pass');
    });

    it('creates a new Pending version when the source is Active', async () => {
        loadedRow.Status = 'Active';
        loadedComponent.Status = 'Published';
        const result = await run(params());
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({ Mode: 'new-version', Version: '1.1.0' });
        expect(createdComponent().fields).toMatchObject({
            Type: 'Widget', Version: '1.1.0', VersionSequence: 2, Status: 'Draft',
        });
        expect(createdRow().fields).toMatchObject({
            Status: 'Pending', Scope: 'User', UserID: 'USER-1', ContributionKey: 'skip:person-ltv', Precedence: 0,
        });
        // The live Active row must be left alone until the new version is activated.
        expect(loadedRow.saved).toBe(false);
    });

    it('supersedes a Pending source when an explicit bump is requested', async () => {
        const result = await run(params({ VersionBumpKind: 'major' }));
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({ Mode: 'new-version', Version: '2.0.0' });
        expect(loadedRow.Status).toBe('Inactive');
        expect(loadedComponent.Status).toBe('Deprecated');
    });

    it('branches a new patch version from an Inactive source', async () => {
        loadedRow.Status = 'Inactive';
        const result = await run(params());
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({ Mode: 'new-version', Version: '1.0.1' });
    });

    it('rejects in-place on an Active source', async () => {
        loadedRow.Status = 'Active';
        expect((await run(params({ VersionBumpKind: 'in-place' }))).ResultCode).toBe('INVALID_BUMP_FOR_STATUS');
    });

    it("refuses to mutate another user's row", async () => {
        loadedRow.UserID = 'SOMEONE-ELSE';
        expect((await run(params())).ResultCode).toBe('FORBIDDEN');
    });

    it('rejects an unrecognized VersionBumpKind', async () => {
        expect((await run(params({ VersionBumpKind: 'sideways' }))).ResultCode).toBe('INVALID_PARAMETER');
    });

    it('resolves a related-entity claim and derives its key on the new row', async () => {
        loadedRow.Status = 'Active';
        const formContribution = {
            slot: 'after-fields', presentation: 'panel', title: 'Tickets',
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: '[PersonID]',
        };
        await run(params({ Spec: { ...spec, formContribution } }));
        expect(createdRow().fields).toMatchObject({
            RelatedEntityID: 'ENT-TICKETS',
            ContributionKey: 'related:MJ_BizApps_Orders: Event Order Lines:PersonID',
        });
    });

    it('rejects a malformed contribution key before persisting', async () => {
        const formContribution = { ...spec.formContribution, contributionKey: "skip:'; DROP--" };
        const result = await run(params({ Spec: { ...spec, formContribution } }));
        expect(result.ResultCode).toBe('INVALID_CONTRIBUTION_KEY');
        expect(hoisted.created).toHaveLength(0);
    });

    it('reports CONTRIBUTION_NOT_FOUND when the row does not load', async () => {
        loadedRow.Load = async () => false;
        expect((await run(params())).ResultCode).toBe('CONTRIBUTION_NOT_FOUND');
    });

    it('requires ContributionID and Spec', async () => {
        expect((await run(params({ ContributionID: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
        expect((await run(params({ Spec: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
    });

    // Create keys a panel that names no key and claims nothing as panel:<component name>.
    // Modify must give the row the same key, or Activate cannot find the Active row to demote
    // and the panel renders twice.
    describe('a panel with no key and no claim', () => {
        function keyless(name: string) {
            return {
                ...spec, name, code: `function ${name}(props) { return null; }`,
                formContribution: { slot: 'before-fields', presentation: 'bare', title: 'LTV v2' },
            };
        }

        it('writes panel:<name> on the row modified in place', async () => {
            loadedRow.ContributionKey = null;
            const result = await run(params({ Spec: keyless('PersonLtvStrip') }));
            expect(result.Success).toBe(true);
            expect(loadedRow.ContributionKey).toBe('panel:PersonLtvStrip');
        });

        it('writes panel:<name> on the new-version row', async () => {
            Object.assign(loadedRow, { ContributionKey: null, Status: 'Active' });
            const result = await run(params({ Spec: keyless('PersonLtvStrip') }));
            expect(result.Success).toBe(true);
            expect(createdRow().fields.ContributionKey).toBe('panel:PersonLtvStrip');
        });

        // A contribution's identity does not change when its component is renamed.
        it('keeps the row\'s panel key when the component is renamed, in place', async () => {
            loadedRow.ContributionKey = 'panel:PersonLtvStrip';
            const result = await run(params({ Spec: keyless('LifetimeValueStrip') }));
            expect(result.Success).toBe(true);
            expect(loadedRow.ContributionKey).toBe('panel:PersonLtvStrip');
        });

        it('keeps the row\'s panel key when the component is renamed, on the new-version row', async () => {
            Object.assign(loadedRow, { ContributionKey: 'panel:PersonLtvStrip', Status: 'Active' });
            const result = await run(params({ Spec: keyless('LifetimeValueStrip') }));
            expect(result.Success).toBe(true);
            expect(createdRow().fields.ContributionKey).toBe('panel:PersonLtvStrip');
        });

        it('derives panel:<name> when the row\'s key was not a panel key', async () => {
            Object.assign(loadedRow, { ContributionKey: 'related:MJ_BizApps_Orders: Event Order Lines:PersonID', RelatedEntityID: 'ENT-TICKETS' });
            await run(params({ Spec: keyless('LifetimeValueStrip') }));
            expect(loadedRow).toMatchObject({ ContributionKey: 'panel:LifetimeValueStrip', RelatedEntityID: null });
        });
    });

    it('clears a related claim on the row when the new spec claims fields instead', async () => {
        Object.assign(loadedRow, { RelatedEntityID: 'ENT-TICKETS', RelatedJoinField: 'PersonID' });
        const formContribution = { ...spec.formContribution, presentation: 'panel', replacesFieldNames: ['Email'] };
        await run(params({ Spec: { ...spec, formContribution } }));
        expect(loadedRow).toMatchObject({ RelatedEntityID: null, RelatedJoinField: null, ReplacesFieldNames: '["Email"]' });
    });

    describe('precedence of the new-version row', () => {
        function asOwner(p: RunActionParams): RunActionParams {
            p.ContextUser = { ...user, Type: 'Owner' } as unknown as RunActionParams['ContextUser'];
            return p;
        }

        it('ranks a personal copy of a Global row above the row it copies', async () => {
            Object.assign(loadedRow, { Scope: 'Global', UserID: null, Status: 'Active', Precedence: 4 });
            const result = await run(asOwner(params()));
            expect(result.Success).toBe(true);
            expect(createdRow().fields).toMatchObject({ Scope: 'User', UserID: 'USER-1', Precedence: 5 });
        });

        it('keeps the precedence of the personal row it versions', async () => {
            Object.assign(loadedRow, { Status: 'Active', Precedence: 3 });
            await run(params());
            expect(createdRow().fields.Precedence).toBe(3);
        });
    });
});
