import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        contributions: [] as Array<Record<string, unknown>>,
        components: [] as Array<{ ID: string; Name: string; Version: string }>,
        filters: [] as string[],
        contributionsSucceed: true,
    },
}));

const provider = {
    EntityByName: (name: string) => (name.trim().toLowerCase() === 'mj_bizapps_common: people'
        ? { ID: 'ENT-PEOPLE', Name: 'MJ_BizApps_Common: People' } : undefined),
    GetEntityObject: async <T>(): Promise<T> => ({}) as T,
};

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    class MockRunView {
        async RunView<T>(p: { EntityName: string; ExtraFilter?: string }): Promise<{ Success: boolean; Results: T[]; ErrorMessage?: string }> {
            hoisted.filters.push(p.ExtraFilter ?? '');
            if (p.EntityName === 'MJ: Components') {
                return { Success: true, Results: hoisted.components as unknown as T[] };
            }
            if (!hoisted.contributionsSucceed) return { Success: false, Results: [], ErrorMessage: 'boom' };
            return { Success: true, Results: hoisted.contributions as unknown as T[] };
        }
        static FromMetadataProvider(): MockRunView { return new MockRunView(); }
    }
    return { ...actual, Metadata: { Provider: undefined }, RunView: MockRunView, LogError: vi.fn() };
});

import { GetFormContributionsForEntityAction } from '../custom/interactive-forms/get-form-contributions-for-entity.action';

const user = { ID: 'USER-1', Name: 'Test User', UserRoles: [{ RoleID: 'ROLE-A' }, { RoleID: 'ROLE-B' }] };

function contribution(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: 'ROW-1', ComponentID: 'COMP-1', Name: 'LTV strip', Scope: 'User', Status: 'Active',
        Precedence: 0, SortKey: 0, Slot: 'before-fields', ContributionKey: 'skip:person-ltv',
        RelatedEntity: null, RelatedJoinField: null, ReplacesSectionKey: null, Inclusion: null,
        Presentation: 'bare', Title: 'Lifetime value', ...over,
    };
}

function params(over: Record<string, unknown> = {}): RunActionParams {
    const values: Record<string, unknown> = { EntityName: 'MJ_BizApps_Common: People', ...over };
    return {
        Params: Object.entries(values).filter(([, v]) => v !== undefined)
            .map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        ContextUser: user, Provider: provider,
    } as unknown as RunActionParams;
}

async function run(p: RunActionParams): Promise<ActionResultSimple> {
    return (new GetFormContributionsForEntityAction() as unknown as {
        InternalRunAction(p: RunActionParams): Promise<ActionResultSimple>;
    }).InternalRunAction(p);
}

beforeEach(() => {
    hoisted.contributions = [];
    hoisted.components = [];
    hoisted.filters = [];
    hoisted.contributionsSucceed = true;
});

describe('GetFormContributionsForEntityAction', () => {
    it('flattens rows and joins the component name and version', async () => {
        hoisted.contributions = [contribution()];
        hoisted.components = [{ ID: 'comp-1', Name: 'PersonLtvStrip', Version: '1.2.0' }];
        const result = await run(params());
        expect(result.Success).toBe(true);
        const payload = JSON.parse(result.Message ?? '{}');
        expect(payload.EntityName).toBe('MJ_BizApps_Common: People');
        expect(payload.Contributions[0]).toMatchObject({
            ContributionID: 'ROW-1', ComponentName: 'PersonLtvStrip', ComponentVersion: '1.2.0',
            Slot: 'before-fields', Presentation: 'bare', ContributionKey: 'skip:person-ltv',
        });
    });

    it('sorts Active before Pending before Inactive, then by Precedence', async () => {
        hoisted.contributions = [
            contribution({ ID: 'inactive', Status: 'Inactive', Precedence: 9 }),
            contribution({ ID: 'pending', Status: 'Pending', Precedence: 9 }),
            contribution({ ID: 'active-low', Status: 'Active', Precedence: 1 }),
            contribution({ ID: 'active-high', Status: 'Active', Precedence: 5 }),
        ];
        const payload = JSON.parse((await run(params())).Message ?? '{}');
        expect(payload.Contributions.map((c: { ContributionID: string }) => c.ContributionID))
            .toEqual(['active-high', 'active-low', 'pending', 'inactive']);
    });

    it("scopes the query to the caller's own rows, their roles, and Global", async () => {
        await run(params());
        expect(hoisted.filters[0]).toContain("Scope='User' AND UserID='USER-1'");
        expect(hoisted.filters[0]).toContain("Scope='Role' AND RoleID IN ('ROLE-A','ROLE-B')");
        expect(hoisted.filters[0]).toContain("Scope='Global'");
    });

    it('excludes every Role row when the caller holds no roles', async () => {
        const noRoles = { ...params(), ContextUser: { ID: 'USER-1', UserRoles: [] } } as unknown as RunActionParams;
        await run(noRoles);
        expect(hoisted.filters[0]).toContain('(1=0)');
    });

    it('reports a null component label when the component row is gone', async () => {
        hoisted.contributions = [contribution()];
        const payload = JSON.parse((await run(params())).Message ?? '{}');
        expect(payload.Contributions[0]).toMatchObject({ ComponentName: null, ComponentVersion: null });
    });

    it('skips the component query entirely when there are no rows', async () => {
        const payload = JSON.parse((await run(params())).Message ?? '{}');
        expect(payload.Contributions).toEqual([]);
        expect(hoisted.filters).toHaveLength(1);
    });

    it('surfaces a failed lookup', async () => {
        hoisted.contributionsSucceed = false;
        expect((await run(params())).ResultCode).toBe('QUERY_FAILED');
    });

    it('reports ENTITY_NOT_FOUND and MISSING_PARAMETER', async () => {
        expect((await run(params({ EntityName: 'Nope' }))).ResultCode).toBe('ENTITY_NOT_FOUND');
        expect((await run(params({ EntityName: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
    });
});
