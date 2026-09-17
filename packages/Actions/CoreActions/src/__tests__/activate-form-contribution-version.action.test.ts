import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

type Row = Record<string, unknown> & { ID: string; saved: boolean };

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        /** Every contribution and component row this test file can load, by ID. */
        rows: new Map<string, Row>(),
        priorRows: [] as Array<{ ID: string; ComponentID: string }>,
        runViewSucceeds: true,
        filters: [] as string[],
    },
}));

function row(seed: Record<string, unknown>): Row {
    const target: Row = {
        saved: false, ID: seed.ID as string, ...seed,
        LatestResult: { CompleteMessage: 'mock' },
        async Load(id: string) {
            const found = hoisted.rows.get(id);
            if (!found) return false;
            Object.assign(target, found, { Load: target.Load, Save: target.Save });
            return true;
        },
        async Save() { target.saved = true; hoisted.rows.set(target.ID, target); return true; },
        NewRecord() { /* no-op */ },
    };
    return target;
}

const provider = {
    EntityByName: () => undefined,
    GetEntityObject: async <T>(): Promise<T> => row({ ID: 'unset' }) as unknown as T,
};

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    class MockRunView {
        async RunView<T>(p: { ExtraFilter?: string }): Promise<{ Success: boolean; Results: T[]; ErrorMessage?: string }> {
            hoisted.filters.push(p.ExtraFilter ?? '');
            if (!hoisted.runViewSucceeds) return { Success: false, Results: [], ErrorMessage: 'boom' };
            return { Success: true, Results: hoisted.priorRows as unknown as T[] };
        }
        static FromMetadataProvider(): MockRunView { return new MockRunView(); }
    }
    return { ...actual, Metadata: { Provider: undefined }, RunView: MockRunView, LogError: vi.fn() };
});

import { ActivateFormContributionVersionAction } from '../custom/interactive-forms/activate-form-contribution-version.action';

const user = { ID: 'USER-1', Name: 'Test User', UserRoles: [] };

function params(over: Record<string, unknown> = {}): RunActionParams {
    const values: Record<string, unknown> = { ContributionID: 'ROW-2', ...over };
    return {
        Params: Object.entries(values).filter(([, v]) => v !== undefined)
            .map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        ContextUser: user, Provider: provider,
    } as unknown as RunActionParams;
}

async function run(p: RunActionParams): Promise<ActionResultSimple> {
    return (new ActivateFormContributionVersionAction() as unknown as {
        InternalRunAction(p: RunActionParams): Promise<ActionResultSimple>;
    }).InternalRunAction(p);
}

function seedTarget(over: Record<string, unknown> = {}): void {
    hoisted.rows.set('ROW-2', row({
        ID: 'ROW-2', EntityID: 'ENT-PEOPLE', ComponentID: 'COMP-2', ContributionKey: 'skip:person-ltv',
        Scope: 'User', UserID: 'USER-1', RoleID: null, Status: 'Pending', ...over,
    }));
    hoisted.rows.set('COMP-2', row({ ID: 'COMP-2', Status: 'Draft' }));
}

beforeEach(() => {
    hoisted.rows = new Map();
    hoisted.priorRows = [];
    hoisted.runViewSucceeds = true;
    hoisted.filters = [];
    seedTarget();
});

describe('ActivateFormContributionVersionAction', () => {
    it('promotes a Pending contribution and its component', async () => {
        const result = await run(params());
        expect(result.Success).toBe(true);
        expect(hoisted.rows.get('ROW-2')!.Status).toBe('Active');
        expect(hoisted.rows.get('COMP-2')!.Status).toBe('Published');
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({
            ContributionID: 'ROW-2', ComponentID: 'COMP-2', PreviousActiveContributionID: null, DemotedCount: 0,
        });
    });

    it('demotes the prior Active sibling sharing the key', async () => {
        hoisted.rows.set('ROW-1', row({ ID: 'ROW-1', ComponentID: 'COMP-1', Status: 'Active' }));
        hoisted.rows.set('COMP-1', row({ ID: 'COMP-1', Status: 'Published' }));
        hoisted.priorRows = [{ ID: 'ROW-1', ComponentID: 'COMP-1' }];
        const result = await run(params());
        expect(hoisted.rows.get('ROW-1')!.Status).toBe('Inactive');
        expect(hoisted.rows.get('COMP-1')!.Status).toBe('Deprecated');
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({
            PreviousActiveContributionID: 'ROW-1', DemotedCount: 1,
        });
    });

    it('scopes the sibling search to the owning user and excludes the target', async () => {
        await run(params());
        expect(hoisted.filters[0]).toContain("Scope='User' AND UserID='USER-1'");
        expect(hoisted.filters[0]).toContain("ID <> 'ROW-2'");
        expect(hoisted.filters[0]).toContain("Status='Active'");
    });

    it('skips the sibling search for a keyless contribution', async () => {
        seedTarget({ ContributionKey: null });
        const result = await run(params());
        expect(result.Success).toBe(true);
        expect(hoisted.filters).toHaveLength(0);
    });

    it('is a no-op on an already Active contribution', async () => {
        seedTarget({ Status: 'Active' });
        const result = await run(params());
        expect(result.Success).toBe(true);
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({ noop: true });
    });

    it('refuses an Inactive contribution', async () => {
        seedTarget({ Status: 'Inactive' });
        expect((await run(params())).ResultCode).toBe('NOT_PENDING');
    });

    it("refuses another user's row", async () => {
        seedTarget({ UserID: 'SOMEONE-ELSE' });
        expect((await run(params())).ResultCode).toBe('FORBIDDEN');
    });

    it('refuses a stored key that is not a legal key', async () => {
        seedTarget({ ContributionKey: "skip:'; DROP--" });
        expect((await run(params())).ResultCode).toBe('INVALID_CONTRIBUTION_KEY');
        expect(hoisted.rows.get('ROW-2')!.Status).toBe('Pending');
    });

    it('surfaces a failed sibling lookup instead of activating', async () => {
        hoisted.runViewSucceeds = false;
        expect((await run(params())).ResultCode).toBe('QUERY_FAILED');
        expect(hoisted.rows.get('ROW-2')!.Status).toBe('Pending');
    });

    it('reports CONTRIBUTION_NOT_FOUND for an unknown ID', async () => {
        expect((await run(params({ ContributionID: 'NOPE' }))).ResultCode).toBe('CONTRIBUTION_NOT_FOUND');
    });

    it('requires ContributionID', async () => {
        expect((await run(params({ ContributionID: undefined }))).ResultCode).toBe('MISSING_PARAMETER');
    });
});
