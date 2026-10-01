import { describe, it, expect, vi } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const { entity, usersEntity, provider, runViewResults, capturedFilters, failing } = vi.hoisted(() => {
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

/** An identity entity: its form takes only the user's own forms and panels. */
const usersEntity = { ...entity, ID: 'ENT-USERS', Name: 'MJ: Users', RelatedEntities: [], ConfigurationObject: {} };

const provider = {
    EntityByName: (n: string) => (n === entity.Name ? entity : n === usersEntity.Name ? usersEntity : undefined),
};

const runViewResults: Record<string, unknown[]> = {
    'MJ: Form Chrome Rules': [{ ID: 'r1' }],
    'MJ: Entity Form Contributions': [
        { ID: 'c1', ContributionKey: 'skip:ltv', Slot: 'before-fields', Title: 'LTV', Presentation: 'bare', Precedence: 0, Inclusion: null, SortKey: 7 },
    ],
};
const capturedFilters: Record<string, string | undefined> = {};
/** Entity names whose query fails. */
const failing = new Set<string>();
return { entity, usersEntity, provider, runViewResults, capturedFilters, failing };
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
                    if (failing.has(p.EntityName)) return { Success: false, Results: [], ErrorMessage: `${p.EntityName} is unavailable` };
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
            { Key: 'skip:ltv', Slot: 'before-fields', Source: 'metadata', Title: 'LTV', Presentation: 'bare', Hidden: false, Precedence: 0, SortKey: 7, FieldNames: [], SectionKeys: [], ReplacesPlace: false },
        ]);
        expect(payload.ChromeRuleCount).toBe(1);
        expect(payload.Note).toMatch(/compiled/i);
    });

    it('reports the blocks a row stands in for, from the list or the single key', async () => {
        const rows = runViewResults['MJ: Entity Form Contributions'];
        const saved = [...rows];
        rows.push(
            { ID: 'c2', ContributionKey: 'many', Slot: 'before-fields', Title: 'Many', Presentation: 'panel', Precedence: 0, Inclusion: null, SortKey: 0, ReplacesSectionKeys: '["details","personalIdentity"]' },
            { ID: 'c3', ContributionKey: 'one', Slot: 'before-fields', Title: 'One', Presentation: 'panel', Precedence: 0, Inclusion: null, SortKey: 0, ReplacesSectionKey: 'systemMetadata' },
        );
        try {
            const payload = JSON.parse((await run()).Message ?? '{}');
            const byKey = new Map((payload.Contributions as Array<{ Key: string; SectionKeys: string[] }>).map((c) => [c.Key, c.SectionKeys]));
            expect(byKey.get('many')).toEqual(['details', 'personalIdentity']);
            expect(byKey.get('one')).toEqual(['systemMetadata']);
        } finally {
            rows.splice(0, rows.length, ...saved);
        }
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
        runViewResults['MJ: Entity Form Overrides'] = [{ ID: 'o1', Status: 'Active' }];
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
        runViewResults['MJ: Entity Form Overrides'] = [{ ID: 'o1', Status: 'Active' }];
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

/**
 * One Active override does not mean the caller sees that form. They can pick any of the
 * forms on offer, the generated one included, and that pick is a per-user setting. Reading
 * only the override rows answered for a form the user may have switched away from — and
 * refused a panel on the very form they were looking at.
 */
describe('GetFormCompositionForEntityAction — which form the caller actually sees', () => {
    /** Run with an Active override present and a stored form choice for the caller. */
    async function runWithPreference(value: string | null) {
        runViewResults['MJ: Entity Form Overrides'] = [
            { ID: 'o1', Status: 'Active', Scope: 'Global' },
            { ID: 'o2', Status: 'Inactive', Scope: 'User' },
            { ID: 'o3', Status: 'Inactive', Scope: 'Role' },
        ];
        runViewResults['MJ: User Settings'] = value === null ? [] : [{ Setting: 'mj.formVariant.mj_bizapps_common: people', Value: value }];
        try {
            return JSON.parse((await run()).Message ?? '{}');
        } finally {
            delete runViewResults['MJ: Entity Form Overrides'];
            delete runViewResults['MJ: User Settings'];
        }
    }

    it('reports the generated form when the user explicitly picked it', async () => {
        const payload = await runWithPreference('__codegen-default__');
        expect(payload.FullCustomForm).toBe(false);
        expect(payload.SlotsPresent).toEqual(['before-fields', 'after-fields', 'after-related', 'after-everything']);
        expect(payload.Sections.length).toBeGreaterThan(0);
    });

    it('reports a full custom form when the user picked one', async () => {
        expect((await runWithPreference('o1')).FullCustomForm).toBe(true);
    });

    it('honours a pick of the user\'s own form set aside by a later apply', async () => {
        // Status Inactive, but the user chose it, and the resolver renders what they chose.
        expect((await runWithPreference('o2')).FullCustomForm).toBe(true);
    });

    it('drops a pick of a shared form set aside, as the resolver does, and falls back to the first Active form', async () => {
        runViewResults['MJ: Entity Form Overrides'] = [{ ID: 'o3', Status: 'Inactive', Scope: 'Role' }];
        runViewResults['MJ: User Settings'] = [{ Setting: 'mj.formVariant.mj_bizapps_common: people', Value: 'o3' }];
        try {
            expect(JSON.parse((await run()).Message ?? '{}').FullCustomForm).toBe(false);
        } finally {
            delete runViewResults['MJ: Entity Form Overrides'];
            delete runViewResults['MJ: User Settings'];
        }
    });

    it('falls back to the first Active form when the pick names one that has gone', async () => {
        expect((await runWithPreference('deleted-override')).FullCustomForm).toBe(true);
    });

    it('falls back to the first Active form when there is no pick at all', async () => {
        expect((await runWithPreference(null)).FullCustomForm).toBe(true);
    });

    it('asks only for this user\'s settings for this entity: the form choice and the hidden panels', async () => {
        await runWithPreference('__codegen-default__');
        expect(capturedFilters['MJ: User Settings'])
            .toBe("UserID='U1' AND Setting IN ('mj.formVariant.mj_bizapps_common: people','mj.formPanels.hidden.mj_bizapps_common: people')");
    });

    it('leaves a form with no override alone, whatever the setting says', async () => {
        runViewResults['MJ: User Settings'] = [{ Setting: 'mj.formVariant.mj_bizapps_common: people', Value: '__codegen-default__' }];
        try {
            expect(JSON.parse((await run()).Message ?? '{}').FullCustomForm).toBe(false);
        } finally {
            delete runViewResults['MJ: User Settings'];
        }
    });
});

/** One Active contribution row as the action reads it. */
function contributionRow(over: Record<string, unknown>) {
    return {
        ID: 'row', ContributionKey: 'skip:ltv', Slot: 'before-fields', Title: 'LTV', Presentation: 'panel',
        Precedence: 0, Inclusion: null, SortKey: 0, Scope: 'Global', ...over,
    };
}

/** Runs with these contribution rows and settings, then puts the defaults back. */
async function runWith(
    rows: unknown[],
    settings: Array<{ Setting: string; Value: string }> = [],
    over: Parameters<typeof run>[0] = {},
) {
    const saved = runViewResults['MJ: Entity Form Contributions'];
    runViewResults['MJ: Entity Form Contributions'] = rows;
    runViewResults['MJ: User Settings'] = settings;
    try {
        return await run(over);
    } finally {
        runViewResults['MJ: Entity Form Contributions'] = saved;
        delete runViewResults['MJ: User Settings'];
    }
}

const HIDE_PEOPLE = 'mj.formPanels.hidden.mj_bizapps_common: people';

/**
 * The answer is the form the user sees: the panels they hid are marked hidden, a key held by two
 * rows shows only the one that draws, and an identity form shows only their own panels.
 */
describe('GetFormCompositionForEntityAction — the panels the user sees', () => {
    it('marks a panel the user hid as hidden', async () => {
        const result = await runWith([contributionRow({ ID: 'g', ContributionKey: 'skip:ltv' })],
            [{ Setting: HIDE_PEOPLE, Value: '["skip:ltv"]' }]);
        expect(JSON.parse(result.Message ?? '{}').Contributions).toEqual([
            expect.objectContaining({ Key: 'skip:ltv', Hidden: true }),
        ]);
    });

    it('never hides the user\'s own panel, which they turn off instead', async () => {
        const result = await runWith([contributionRow({ ID: 'mine', Scope: 'User' })],
            [{ Setting: HIDE_PEOPLE, Value: '["skip:ltv"]' }]);
        expect(JSON.parse(result.Message ?? '{}').Contributions).toEqual([
            expect.objectContaining({ Key: 'skip:ltv', Hidden: false }),
        ]);
    });

    it('hides a keyless grid claim by its related key', async () => {
        const result = await runWith(
            [contributionRow({ ID: 'g', ContributionKey: null, RelatedEntity: 'MJ_BizApps_Orders: Order Headers', RelatedJoinField: 'BillToPersonID', RelatedEntityID: 'ENT-ORD' })],
            [{ Setting: HIDE_PEOPLE, Value: '["related:MJ_BizApps_Orders: Order Headers:BillToPersonID"]' }]);
        expect(JSON.parse(result.Message ?? '{}').Contributions).toEqual([
            expect.objectContaining({ Key: 'related:MJ_BizApps_Orders: Order Headers:BillToPersonID', Hidden: true, ReplacesPlace: true }),
        ]);
    });

    it('shows one panel per key: the higher precedence wins', async () => {
        const result = await runWith([
            contributionRow({ ID: 'role', Scope: 'Role', Precedence: 2, Title: 'Role LTV' }),
            contributionRow({ ID: 'mine', Scope: 'User', Precedence: 1, Title: 'My LTV' }),
        ]);
        const contributions = JSON.parse(result.Message ?? '{}').Contributions;
        expect(contributions).toHaveLength(1);
        expect(contributions[0]).toMatchObject({ Title: 'Role LTV', Precedence: 2 });
    });

    it('breaks a precedence tie by the narrower audience', async () => {
        const result = await runWith([
            contributionRow({ ID: 'global', Scope: 'Global', Title: 'Everyone' }),
            contributionRow({ ID: 'mine', Scope: 'User', Title: 'Mine' }),
            contributionRow({ ID: 'role', Scope: 'Role', Title: 'Role' }),
        ]);
        expect(JSON.parse(result.Message ?? '{}').Contributions.map((c: { Title: string }) => c.Title)).toEqual(['Mine']);
    });

    it('shows the panel that takes over a key the user hid on another row', async () => {
        const result = await runWith([
            contributionRow({ ID: 'global', Scope: 'Global', Precedence: 5, Title: 'Everyone' }),
            contributionRow({ ID: 'mine', Scope: 'User', Precedence: 0, Title: 'Mine' }),
        ], [{ Setting: HIDE_PEOPLE, Value: '["skip:ltv"]' }]);
        expect(JSON.parse(result.Message ?? '{}').Contributions).toEqual([
            expect.objectContaining({ Title: 'Mine', Hidden: false }),
        ]);
    });

    it('keeps panels with different keys apart', async () => {
        const result = await runWith([
            contributionRow({ ID: 'a', ContributionKey: 'a' }),
            contributionRow({ ID: 'b', ContributionKey: 'b' }),
        ]);
        expect(JSON.parse(result.Message ?? '{}').Contributions.map((c: { Key: string }) => c.Key)).toEqual(['a', 'b']);
    });

    it('shows only the user\'s own panels on an identity entity', async () => {
        const result = await runWith([
            contributionRow({ ID: 'global', ContributionKey: 'shared' }),
            contributionRow({ ID: 'role', Scope: 'Role', ContributionKey: 'team' }),
            contributionRow({ ID: 'mine', Scope: 'User', ContributionKey: 'mine' }),
        ], [], { entityName: usersEntity.Name });
        expect(JSON.parse(result.Message ?? '{}').Contributions.map((c: { Key: string }) => c.Key)).toEqual(['mine']);
    });

    it('ignores a shared full custom form on an identity entity', async () => {
        runViewResults['MJ: Entity Form Overrides'] = [{ ID: 'o1', Status: 'Active', Scope: 'Global' }];
        try {
            const payload = JSON.parse((await run({ entityName: usersEntity.Name })).Message ?? '{}');
            expect(payload.FullCustomForm).toBe(false);
        } finally {
            delete runViewResults['MJ: Entity Form Overrides'];
        }
    });
});

/**
 * A failed query returns QUERY_FAILED rather than an answer built from a partial read: an empty
 * override list would say no full custom form renders, and an agent would design a panel for a
 * form the user does not see.
 */
describe('GetFormCompositionForEntityAction — a failed query', () => {
    it.each(['MJ: Form Chrome Rules', 'MJ: Entity Form Contributions', 'MJ: Entity Form Overrides', 'MJ: User Settings'])(
        'returns QUERY_FAILED when the %s lookup fails',
        async (entityName) => {
            failing.add(entityName);
            try {
                const result = await run();
                expect(result.Success).toBe(false);
                expect(result.ResultCode).toBe('QUERY_FAILED');
                expect(result.Message).toContain(`${entityName} is unavailable`);
            } finally {
                failing.delete(entityName);
            }
        },
    );
});
