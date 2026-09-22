import { describe, it, expect, vi } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const { entity, provider, runViewResults, capturedFilters } = vi.hoisted(() => {
// Configuration is the PARSED object here, matching EntityRelationshipInfo.Configuration's
// getter — not the raw JSON string stored in the column.
const entity = {
    ID: 'ENT-PEOPLE',
    Name: 'MJ_BizApps_Common: People',
    Fields: [
        { Name: 'ID', Category: null, GeneratedFormSectionType: 'Details', IsVirtual: false },
        { Name: 'FirstName', Category: 'Personal Identity', GeneratedFormSectionType: 'Category', IsVirtual: false },
        { Name: 'Notes', Category: null, GeneratedFormSectionType: 'Details', IsVirtual: false },
        { Name: '__mj_CreatedAt', Category: null, GeneratedFormSectionType: 'Details', IsVirtual: false },
    ],
    RelatedEntities: [
        { RelatedEntity: 'MJ_BizApps_Orders: Order Headers', RelatedEntityID: 'ENT-ORD', RelatedEntityJoinField: 'BillToPersonID', DisplayInForm: true, Sequence: 1, Configuration: { UI: { inclusion: 'Primary' } } },
        { RelatedEntity: 'MJ_BizApps_Tasks: Task Comments', RelatedEntityID: 'ENT-TC', RelatedEntityJoinField: 'PersonID', DisplayInForm: true, Sequence: 2, Configuration: null },
        { RelatedEntity: 'Hidden', RelatedEntityID: 'ENT-H', RelatedEntityJoinField: 'X', DisplayInForm: false, Sequence: 3, Configuration: null },
    ],
    ChildEntities: [],
    ConfigurationObject: { UI: { Form: { Layout: 'left-nav' } } },
};

const provider = { EntityByName: (n: string) => (n === entity.Name ? entity : undefined) };

const runViewResults: Record<string, unknown[]> = {
    'MJ: Form Chrome Rules': [{ ID: 'r1' }],
    'MJ: Entity Form Contributions': [
        { ID: 'c1', ContributionKey: 'skip:ltv', Slot: 'before-fields', Title: 'LTV', Presentation: 'bare', Precedence: 0, Inclusion: null },
    ],
};
const capturedFilters: Record<string, string | undefined> = {};
return { entity, provider, runViewResults, capturedFilters };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return {
        ...actual,
        Metadata: { Provider: provider },
        LogError: vi.fn(),
        RunView: {
            FromMetadataProvider: () => ({
                RunView: async (p: { EntityName: string; ExtraFilter?: string }) => {
                    capturedFilters[p.EntityName] = p.ExtraFilter;
                    return { Success: true, Results: runViewResults[p.EntityName] ?? [] };
                },
            }),
        },
    };
});
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));

import { GetFormCompositionForEntityAction } from '../custom/interactive-forms/get-form-composition-for-entity.action';

type Internal = { InternalRunAction(p: RunActionParams): Promise<ActionResultSimple> };

async function run(over: Partial<{ entityName: string; user: unknown }> = {}): Promise<ActionResultSimple> {
    const params = {
        Params: [{ Name: 'EntityName', Value: over.entityName ?? entity.Name, Type: 'Input' }],
        ContextUser: 'user' in over ? over.user : { ID: 'U1', UserRoles: [{ RoleID: 'R1' }] },
        Provider: provider,
    } as unknown as RunActionParams;
    return (new GetFormCompositionForEntityAction() as unknown as Internal).InternalRunAction(params);
}

describe('GetFormCompositionForEntityAction', () => {
    it('derives sections from field categories, related grids with L1 inclusion, and metadata contributions', async () => {
        const result = await run();

        expect(result.Success).toBe(true);
        const payload = JSON.parse(result.Message ?? '{}');
        expect(payload.Entity).toBe(entity.Name);
        expect(payload.Layout).toBe('left-nav');
        expect(payload.Sections.map((s: { Key: string }) => s.Key)).toEqual(['details', 'personalIdentity', 'systemMetadata']);
        expect(payload.Related).toEqual([
            { Entity: 'MJ_BizApps_Orders: Order Headers', JoinField: 'BillToPersonID', SectionKey: 'mJBizAppsOrdersOrderHeaders', Inclusion: 'Primary', Source: 'baked' },
            { Entity: 'MJ_BizApps_Tasks: Task Comments', JoinField: 'PersonID', SectionKey: 'mJBizAppsTasksTaskComments', Inclusion: 'Auto', Source: 'baked' },
        ]);
        expect(payload.Contributions).toEqual([
            { Key: 'skip:ltv', Slot: 'before-fields', Source: 'metadata', Title: 'LTV', Presentation: 'bare', Hidden: false, Precedence: 0 },
        ]);
        expect(payload.ChromeRuleCount).toBe(1);
        expect(payload.Note).toMatch(/compiled/i);
    });

    it('declares the slots CodeGen emits, and not top-area, which no generated form has', async () => {
        const payload = JSON.parse((await run()).Message ?? '{}');
        expect(payload.SlotsPresent).toEqual(['before-fields', 'after-fields', 'after-related', 'after-everything']);
        expect(payload.SlotsPresent).not.toContain('top-area');
        expect(payload.FullCustomForm).toBe(false);
    });

    it('warns in the note that a hand-written custom form can differ', async () => {
        expect(JSON.parse((await run()).Message ?? '{}').Note).toMatch(/hand-written custom form can differ/i);
    });

    it('scopes contributions to the caller — own rows, their roles, and Global', async () => {
        await run();
        const filter = capturedFilters['MJ: Entity Form Contributions'] ?? '';
        expect(filter).toContain("EntityID='ENT-PEOPLE'");
        expect(filter).toContain("Scope='User' AND UserID='U1'");
        expect(filter).toContain("RoleID IN ('R1')");
        expect(filter).toContain("Scope='Global'");
        expect(filter).toContain("Status='Active'");
    });

    it('rejects a missing EntityName', async () => {
        const result = await run({ entityName: '' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('rejects an unregistered entity', async () => {
        const result = await run({ entityName: 'Nope: Not Here' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('ENTITY_NOT_FOUND');
    });

    it('rejects a call with no ContextUser, since contributions are user-scoped', async () => {
        const result = await run({ user: undefined });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('NO_USER');
    });
});

/**
 * A full custom entity form owns the whole body. Reporting its sections, slots or
 * contributions would hand an agent authoritative-looking targets for a form nobody
 * sees — it would design a panel, apply it cleanly, and nothing would appear.
 */
describe('GetFormCompositionForEntityAction — full custom form override', () => {
    it('reports no sections, slots or contributions, and says why', async () => {
        runViewResults['MJ: Entity Form Overrides'] = [{ ID: 'o1' }];
        try {
            const payload = JSON.parse((await run()).Message ?? '{}');
            expect(payload.FullCustomForm).toBe(true);
            expect(payload.Sections).toEqual([]);
            expect(payload.SlotsPresent).toEqual([]);
            expect(payload.Contributions).toEqual([]);
            expect(payload.Note).toMatch(/full custom entity form/i);
        } finally {
            delete runViewResults['MJ: Entity Form Overrides'];
        }
    });

    it('reports no related grids either, since the fill-in is off for such a form', async () => {
        runViewResults['MJ: Entity Form Overrides'] = [{ ID: 'o1' }];
        try {
            expect(JSON.parse((await run()).Message ?? '{}').Related).toEqual([]);
        } finally {
            delete runViewResults['MJ: Entity Form Overrides'];
        }
    });

    it('keeps the normal derivation when no override is active', async () => {
        const payload = JSON.parse((await run()).Message ?? '{}');
        expect(payload.FullCustomForm).toBe(false);
        expect(payload.Contributions).toHaveLength(1);
    });
});
