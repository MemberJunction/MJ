/**
 * Tests for FormResolverService.
 *
 * The service builds a SQL filter + ORDER BY against `EntityFormOverride`,
 * runs it via RunView, and falls back to ClassFactory when no override matches.
 * These tests capture the RunView call args (to validate filter shape) and
 * stub responses to verify each resolution branch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ----- Module mocks -------------------------------------------------------

vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
}));

// RunView mock — we capture every call's params so tests can assert on them.
const runViewCalls: Array<{ params: any; user: any }> = [];
let runViewResponse: { Success: boolean; Results?: any[]; ErrorMessage?: string } = { Success: true, Results: [] };

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    RunView: class {
        static FromMetadataProvider(_provider: any) {
            return new (class {
                async RunView(params: any, user: any) {
                    runViewCalls.push({ params, user });
                    return runViewResponse;
                }
            })();
        }
    },
}));

// ClassFactory mock — controls what the fallback branch returns.
let classFactoryReg: { SubClass: any } | null = null;
vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                GetRegistration: vi.fn(() => classFactoryReg),
            },
        },
    },
}));

vi.mock('@memberjunction/ng-base-forms', () => ({
    BaseFormComponent: class FakeBaseFormComponent {},
}));

// ----- Test setup ---------------------------------------------------------

import type { FormResolverService } from '../services/form-resolver.service';

const entity = { ID: 'entity-1', Name: 'Customer' } as any;
const user = (overrides: Partial<{ ID: string; UserRoles: Array<{ RoleID: string }> }>) =>
    ({ ID: 'user-1', UserRoles: [], ...overrides } as any);
const provider = {} as any;

const overrideRow = (overrides: Partial<{
    ID: string; EntityID: string; ComponentID: string;
    Scope: 'User' | 'Role' | 'Global';
    UserID: string | null; RoleID: string | null;
    Priority: number; Status: 'Active' | 'Inactive' | 'Pending';
}>) => ({
    ID: 'row-1', EntityID: 'entity-1', ComponentID: 'comp-1',
    Scope: 'Global' as const, UserID: null, RoleID: null,
    Priority: 0, Status: 'Active' as const, ...overrides,
});

let service: FormResolverService;

beforeEach(async () => {
    runViewCalls.length = 0;
    runViewResponse = { Success: true, Results: [] };
    classFactoryReg = null;
    vi.clearAllMocks();
    const mod = await import('../services/form-resolver.service');
    service = new mod.FormResolverService();
});

// ----- Tests --------------------------------------------------------------

describe('FormResolverService.ResolveFormForEntity', () => {

    it('returns kind=interactive when an override matches', async () => {
        runViewResponse = { Success: true, Results: [overrideRow({})] };

        const result = await service.ResolveFormForEntity(entity, user({}), provider);

        expect(result.kind).toBe('interactive');
        if (result.kind === 'interactive') {
            expect(result.override.ComponentID).toBe('comp-1');
        }
    });

    it('passes only "MJ: Entity Form Overrides" to RunView', async () => {
        await service.ResolveFormForEntity(entity, user({}), provider);
        expect(runViewCalls[0].params.EntityName).toBe('MJ: Entity Form Overrides');
    });

    it('filters by the entity ID and Status=Active', async () => {
        await service.ResolveFormForEntity(entity, user({}), provider);
        const filter = runViewCalls[0].params.ExtraFilter;
        expect(filter).toContain(`EntityID='entity-1'`);
        expect(filter).toContain(`Status='Active'`);
    });

    it('orders by User > Role > Global scope, then Priority DESC, then CreatedAt DESC', async () => {
        await service.ResolveFormForEntity(entity, user({}), provider);
        const orderBy = runViewCalls[0].params.OrderBy;
        expect(orderBy).toContain(`WHEN 'User' THEN 1`);
        expect(orderBy).toContain(`WHEN 'Role' THEN 2`);
        expect(orderBy).toContain('Priority DESC');
        expect(orderBy).toContain('__mj_CreatedAt DESC');
    });

    it('includes UserID match in the filter', async () => {
        await service.ResolveFormForEntity(entity, user({ ID: 'me' }), provider);
        const filter = runViewCalls[0].params.ExtraFilter;
        expect(filter).toContain(`Scope='User' AND UserID='me'`);
    });

    it('includes role-membership clause for each role the user has', async () => {
        const u = user({ UserRoles: [{ RoleID: 'r1' }, { RoleID: 'r2' }] });
        await service.ResolveFormForEntity(entity, u, provider);
        const filter = runViewCalls[0].params.ExtraFilter;
        expect(filter).toContain(`Scope='Role' AND RoleID IN ('r1','r2')`);
    });

    it('emits an always-false role clause when the user has no roles', async () => {
        await service.ResolveFormForEntity(entity, user({ UserRoles: [] }), provider);
        const filter = runViewCalls[0].params.ExtraFilter;
        // No roles = the user can never match a Role-scoped row. We encode that
        // as (1=0) rather than producing `IN ()` which is invalid SQL.
        expect(filter).toContain('(1=0)');
        expect(filter).not.toContain('IN ()');
    });

    it('caps the query at MaxRows=1 since only the top match is used', async () => {
        await service.ResolveFormForEntity(entity, user({}), provider);
        expect(runViewCalls[0].params.MaxRows).toBe(1);
    });

    it('uses ResultType=simple to skip BaseEntity hydration on the hot path', async () => {
        await service.ResolveFormForEntity(entity, user({}), provider);
        expect(runViewCalls[0].params.ResultType).toBe('simple');
    });

    it('falls back to ClassFactory when no override matches', async () => {
        runViewResponse = { Success: true, Results: [] };
        classFactoryReg = { SubClass: class FakeForm {} };

        const result = await service.ResolveFormForEntity(entity, user({}), provider);

        expect(result.kind).toBe('class');
        if (result.kind === 'class') {
            expect(result.subClass).toBe(classFactoryReg.SubClass);
        }
    });

    it('returns kind=none when neither override nor ClassFactory has a form', async () => {
        runViewResponse = { Success: true, Results: [] };
        classFactoryReg = null;

        const result = await service.ResolveFormForEntity(entity, user({}), provider);

        expect(result.kind).toBe('none');
    });

    it('falls through when the RunView fails (treats lookup failure as "no override")', async () => {
        runViewResponse = { Success: false, ErrorMessage: 'db down' };
        classFactoryReg = { SubClass: class FakeForm {} };

        const result = await service.ResolveFormForEntity(entity, user({}), provider);

        // Lookup failure should NOT block the user from seeing the class-based form
        // — better to show *something* than to fail closed on every entity load.
        expect(result.kind).toBe('class');
    });
});
