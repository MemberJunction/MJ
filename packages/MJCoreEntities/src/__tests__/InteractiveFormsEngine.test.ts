import { describe, it, expect, vi, beforeEach } from 'vitest';

let backing: Record<string, unknown[]> = {};
let loadedConfigs: Array<Record<string, unknown>> = [];

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
    };
});

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class MockBaseEngine {
        static getInstance<T>(): T {
            const ctor = this as unknown as { _testInstance?: T; new (): T };
            if (!ctor._testInstance) ctor._testInstance = new ctor();
            return ctor._testInstance;
        }
        async Load(configs: Array<Record<string, unknown>>): Promise<void> { loadedConfigs = configs; }
        GetConfigData<T>(prop: string): T[] { return (backing[prop] ?? []) as T[]; }
        ObserveProperty<T>(prop: string) { return { prop }; }
    },
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    UserInfo: class {},
    ProviderType: { Database: 'Database', Network: 'Network' },
}));

import { InteractiveFormsEngine } from '../engines/interactive-forms';

const USER = '11111111-1111-1111-1111-111111111111';
const ROLE = '22222222-2222-2222-2222-222222222222';
const ENTITY = '33333333-3333-3333-3333-333333333333';

function row(over: Record<string, unknown>) {
    return {
        ID: 'r', EntityID: ENTITY, Scope: 'Global', UserID: null, RoleID: null,
        Status: 'Active', Precedence: 0, SortKey: 0, ...over,
    };
}

describe('InteractiveFormsEngine.GetApplicableContributions', () => {
    beforeEach(() => { backing = {}; });

    it('returns Active rows whose scope matches, highest Precedence then SortKey first', () => {
        backing._contributions = [
            row({ ID: 'global', Precedence: 0, SortKey: 10 }),
            row({ ID: 'mine', Scope: 'User', UserID: USER, Precedence: 5 }),
            row({ ID: 'other-user', Scope: 'User', UserID: 'someone-else' }),
            row({ ID: 'role', Scope: 'Role', RoleID: ROLE, Precedence: 1 }),
            row({ ID: 'pending', Status: 'Pending', Precedence: 99 }),
            row({ ID: 'other-entity', EntityID: 'zzz', Precedence: 99 }),
        ];
        const ids = InteractiveFormsEngine.Instance
            .GetApplicableContributions(ENTITY, USER, [ROLE]).map(r => r.ID);
        expect(ids).toEqual(['mine', 'role', 'global']);
    });

    it('returns an empty array for a blank entity id', () => {
        backing._contributions = [row({ ID: 'global' })];
        expect(InteractiveFormsEngine.Instance.GetApplicableContributions('', USER, [])).toEqual([]);
    });

    it('compares ids case-insensitively', () => {
        backing._contributions = [row({ ID: 'g', EntityID: ENTITY.toUpperCase() })];
        expect(InteractiveFormsEngine.Instance.GetApplicableContributions(ENTITY.toLowerCase(), USER, [])).toHaveLength(1);
    });
});

/**
 * design.md §16 refuses a Global or Role contribution on an identity or authorization
 * surface. The action layer cannot enforce it — it already clamps every write to User
 * scope, so the check is unreachable there — and `mj sync` bypasses actions entirely.
 * The read path is the only place that sees every row however it was written.
 */
describe('InteractiveFormsEngine identity-entity clamp', () => {
    beforeEach(() => { backing = {}; });

    it('drops Global and Role rows on an identity entity', () => {
        backing._contributions = [
            row({ ID: 'global', Entity: 'MJ: Users' }),
            row({ ID: 'role', Scope: 'Role', RoleID: ROLE, Entity: 'MJ: Users' }),
            row({ ID: 'mine', Scope: 'User', UserID: USER, Entity: 'MJ: Users' }),
        ];
        const ids = InteractiveFormsEngine.Instance
            .GetApplicableContributions(ENTITY, USER, [ROLE]).map(r => r.ID);
        expect(ids).toEqual(['mine']);
    });

    it('leaves every scope alone on an ordinary entity', () => {
        backing._contributions = [
            row({ ID: 'global', Entity: 'MJ: Applications' }),
            row({ ID: 'mine', Scope: 'User', UserID: USER, Entity: 'MJ: Applications' }),
        ];
        expect(InteractiveFormsEngine.Instance
            .GetApplicableContributions(ENTITY, USER, [ROLE])).toHaveLength(2);
    });

    it('matches the restricted name regardless of casing or padding', () => {
        backing._contributions = [row({ ID: 'global', Entity: '  mj: user roles ' })];
        expect(InteractiveFormsEngine.Instance
            .GetApplicableContributions(ENTITY, USER, [ROLE])).toHaveLength(0);
    });
});

/**
 * The kill switch is the rollback path — "what do we turn off at 2am". Dropping the entity
 * from the load list is not enough on its own: a process that already loaded rows keeps
 * serving them from the engine's data map, so the switch appears to do nothing until a
 * restart. The read side has to honour it too.
 */
describe('InteractiveFormsEngine kill switch', () => {
    beforeEach(() => {
        backing = {};
        InteractiveFormsEngine.MetadataContributionsEnabled = true;
    });

    it('reports no contributions once disabled, even with rows already loaded', () => {
        backing._contributions = [row({ ID: 'loaded' })];
        expect(InteractiveFormsEngine.Instance.Contributions).toHaveLength(1);
        InteractiveFormsEngine.MetadataContributionsEnabled = false;
        expect(InteractiveFormsEngine.Instance.Contributions).toEqual([]);
    });

    it('makes nothing applicable to a form once disabled', () => {
        backing._contributions = [row({ ID: 'loaded', Entity: 'MJ: Applications' })];
        InteractiveFormsEngine.MetadataContributionsEnabled = false;
        expect(InteractiveFormsEngine.Instance.GetApplicableContributions(ENTITY, USER, [ROLE])).toEqual([]);
    });

    it('serves the rows again when re-enabled', () => {
        backing._contributions = [row({ ID: 'loaded' })];
        InteractiveFormsEngine.MetadataContributionsEnabled = false;
        InteractiveFormsEngine.MetadataContributionsEnabled = true;
        expect(InteractiveFormsEngine.Instance.Contributions).toHaveLength(1);
    });
});

/**
 * The browser has no process environment, so Instance Config is how an administrator reaches the
 * switch there. The Explorer shell applies it before any form opens.
 */
describe('InteractiveFormsEngine.ApplyInstanceConfiguration', () => {
    /** A stand-in for `InstanceConfigEngine`: answers from `values`, else the caller's default. */
    function instanceConfig(values: Record<string, boolean>) {
        return { GetBoolean: (key: string, defaultValue: boolean = true) => values[key] ?? defaultValue };
    }

    beforeEach(() => {
        backing = {};
        InteractiveFormsEngine.MetadataContributionsEnabled = true;
    });

    it('turns the switch off when Forms.MetadataContributions.Enabled is false', () => {
        backing._contributions = [row({ ID: 'loaded' })];
        InteractiveFormsEngine.ApplyInstanceConfiguration(instanceConfig({ 'Forms.MetadataContributions.Enabled': false }));
        expect(InteractiveFormsEngine.MetadataContributionsEnabled).toBe(false);
        expect(InteractiveFormsEngine.Instance.Contributions).toEqual([]);
    });

    it('leaves the switch on when the key is missing', () => {
        InteractiveFormsEngine.ApplyInstanceConfiguration(instanceConfig({}));
        expect(InteractiveFormsEngine.MetadataContributionsEnabled).toBe(true);
    });

    it('does not turn back on a switch that is already off', () => {
        InteractiveFormsEngine.MetadataContributionsEnabled = false;
        InteractiveFormsEngine.ApplyInstanceConfiguration(instanceConfig({ 'Forms.MetadataContributions.Enabled': true }));
        expect(InteractiveFormsEngine.MetadataContributionsEnabled).toBe(false);
    });
});

/**
 * A browser cache holds one user's view, so other users' personal rows — with their Notes and
 * Configuration — are not loaded into it. A server cache is shared by every user of the process,
 * so it holds every row and each reader filters what it serves.
 */
describe('InteractiveFormsEngine contribution load', () => {
    beforeEach(() => {
        loadedConfigs = [];
        InteractiveFormsEngine.MetadataContributionsEnabled = true;
    });

    const contributionConfig = () => loadedConfigs.find(c => c.EntityName === 'MJ: Entity Form Contributions');

    it('loads shared rows and only the signed-in user\'s personal rows in the browser', async () => {
        const browser = { ProviderType: 'Network', CurrentUser: { ID: USER } };
        await InteractiveFormsEngine.Instance.Config(true, undefined, browser as never);
        expect(contributionConfig()?.Filter).toBe(`Scope <> 'User' OR UserID = '${USER}'`);
    });

    it('filters by the user the caller passes when there is one', async () => {
        const browser = { ProviderType: 'Network', CurrentUser: { ID: 'someone-else' } };
        await InteractiveFormsEngine.Instance.Config(true, { ID: USER } as never, browser as never);
        expect(contributionConfig()?.Filter).toContain(USER);
    });

    it('loads every row on a server', async () => {
        const server = { ProviderType: 'Database', CurrentUser: { ID: USER } };
        await InteractiveFormsEngine.Instance.Config(true, { ID: USER } as never, server as never);
        expect(contributionConfig()).toBeDefined();
        expect(contributionConfig()?.Filter).toBeUndefined();
    });
});
/**
 * The identity and permission surfaces take only the user's own forms and panels. A full custom
 * form published to a role or to everyone would replace the whole body of the Users form for
 * other people, so overrides follow the same rule as contributions.
 */
describe('InteractiveFormsEngine.GetActiveOverrideForEntity on a restricted entity', () => {
    beforeEach(() => { backing = {}; });

    function override(over: Record<string, unknown>) {
        return { ID: 'o', EntityID: ENTITY, Scope: 'Global', UserID: null, RoleID: null, Status: 'Active', Priority: 0, ...over };
    }

    it('ignores a Global or Role full custom form on MJ: Users', () => {
        backing._overrides = [
            override({ ID: 'global', Entity: 'MJ: Users' }),
            override({ ID: 'role', Scope: 'Role', RoleID: ROLE, Entity: 'MJ: Users' }),
        ];
        expect(InteractiveFormsEngine.Instance.GetActiveOverrideForEntity(ENTITY, USER, [ROLE])).toBeNull();
    });

    it('still returns the user\'s own form there', () => {
        backing._overrides = [
            override({ ID: 'global', Entity: 'MJ: Users' }),
            override({ ID: 'mine', Scope: 'User', UserID: USER, Entity: 'MJ: Users' }),
        ];
        expect(InteractiveFormsEngine.Instance.GetActiveOverrideForEntity(ENTITY, USER, [ROLE])?.ID).toBe('mine');
    });

    it('returns a Global form on an ordinary entity', () => {
        backing._overrides = [override({ ID: 'global', Entity: 'MJ: Applications' })];
        expect(InteractiveFormsEngine.Instance.GetActiveOverrideForEntity(ENTITY, USER, [ROLE])?.ID).toBe('global');
    });

    it('covers the permission and form-metadata entities too', () => {
        for (const name of ['MJ: API Keys', 'MJ: Entity Permissions', 'MJ: Row Level Security Filters', 'MJ: Entity Field Permissions', 'MJ: Entity Form Overrides', 'MJ: Entity Form Contributions']) {
            backing._overrides = [override({ ID: 'global', Entity: name })];
            backing._contributions = [row({ ID: 'global', Entity: name })];
            expect(InteractiveFormsEngine.Instance.GetActiveOverrideForEntity(ENTITY, USER, [ROLE])).toBeNull();
            expect(InteractiveFormsEngine.Instance.GetApplicableContributions(ENTITY, USER, [ROLE])).toEqual([]);
        }
    });
});
