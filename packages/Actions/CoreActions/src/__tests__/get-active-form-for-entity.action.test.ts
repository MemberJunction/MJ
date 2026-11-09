import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        overrides: [] as Array<Record<string, unknown>>,
        components: [] as Array<Record<string, unknown>>,
        queried: [] as string[],
    },
}));

const provider = {
    EntityByName: (name: string) => {
        const n = name.trim().toLowerCase();
        if (n === 'mj_bizapps_common: people') return { ID: 'ENT-PEOPLE', Name: 'MJ_BizApps_Common: People' };
        if (n === 'mj: users') return { ID: 'ENT-USERS', Name: 'MJ: Users' };
        return undefined;
    },
};

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    class MockRunView {
        async RunView<T>(p: { EntityName: string }): Promise<{ Success: boolean; Results: T[] }> {
            hoisted.queried.push(p.EntityName);
            const rows = p.EntityName === 'MJ: Components' ? hoisted.components : hoisted.overrides;
            return { Success: true, Results: rows as unknown as T[] };
        }
        static FromMetadataProvider(): MockRunView { return new MockRunView(); }
    }
    return { ...actual, Metadata: { Provider: undefined }, RunView: MockRunView, LogError: vi.fn() };
});

import { GetActiveFormForEntityAction } from '../custom/interactive-forms/get-active-form-for-entity.action';

const user = { ID: 'USER-1', Name: 'Test User', UserRoles: [{ RoleID: 'ROLE-A' }] };

function override(over: Record<string, unknown>): Record<string, unknown> {
    return {
        ID: 'OV-1', EntityID: 'ENT-USERS', ComponentID: 'COMP-1', Name: 'Form', Description: null,
        Scope: 'User', UserID: 'USER-1', RoleID: null, Priority: 0, Status: 'Active', ...over,
    };
}

async function run(entityName: string): Promise<ActionResultSimple> {
    const params = {
        Params: [{ Name: 'EntityName', Value: entityName, Type: 'Input' }],
        ContextUser: user, Provider: provider,
    } as unknown as RunActionParams;
    return (new GetActiveFormForEntityAction() as unknown as {
        InternalRunAction(p: RunActionParams): Promise<ActionResultSimple>;
    }).InternalRunAction(params);
}

beforeEach(() => {
    hoisted.overrides = [];
    hoisted.components = [{ ID: 'COMP-1', Name: 'Form', Version: '1.0.0', VersionSequence: 1, Status: 'Published', Specification: '{}' }];
    hoisted.queried = [];
});

/**
 * A shared full custom form does not render on an identity or permission entity, so the action
 * must not report one as the form the user sees there, or the Form Builder agent would modify a
 * form nobody is shown.
 */
describe('GetActiveFormForEntityAction — restricted entities', () => {
    it('does not report a Global or Role form as active on MJ: Users', async () => {
        hoisted.overrides = [
            override({ ID: 'OV-GLOBAL', Scope: 'Global', UserID: null }),
            override({ ID: 'OV-ROLE', Scope: 'Role', UserID: null, RoleID: 'ROLE-A' }),
        ];
        const payload = JSON.parse((await run('MJ: Users')).Message ?? '{}');
        expect(payload.Active).toBeNull();
        expect(payload.Variants).toEqual([]);
        expect(hoisted.queried).not.toContain('MJ: Components');
    });

    it("still reports the user's own form on MJ: Users", async () => {
        hoisted.overrides = [
            override({ ID: 'OV-GLOBAL', Scope: 'Global', UserID: null, Priority: 9 }),
            override({ ID: 'OV-MINE', Scope: 'User' }),
        ];
        const payload = JSON.parse((await run('MJ: Users')).Message ?? '{}');
        expect(payload.Active?.OverrideID).toBe('OV-MINE');
        expect(payload.Variants.map((v: { OverrideID: string }) => v.OverrideID)).toEqual(['OV-MINE']);
    });

    it('reports a Global form on an ordinary entity', async () => {
        hoisted.overrides = [override({ ID: 'OV-GLOBAL', EntityID: 'ENT-PEOPLE', Scope: 'Global', UserID: null })];
        const payload = JSON.parse((await run('MJ_BizApps_Common: People')).Message ?? '{}');
        expect(payload.Active?.OverrideID).toBe('OV-GLOBAL');
    });
});
