/**
 * Tests for FormResolverService.
 *
 * The resolver picks the form to render for an (entity, user) tuple. It reads
 * applicable `EntityFormOverride` rows from the in-memory `InteractiveFormsEngine`
 * cache (NOT a per-call RunView), filters by entity + scope, sorts by
 * scope/priority/recency, honors the user's saved variant choice (persisted via
 * `UserInfoEngine`), and falls back to `ClassFactory` when no override applies.
 *
 * These tests drive the engine's `Overrides` array and assert each resolution
 * branch + the variant-selection rules.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ----- Module mocks -------------------------------------------------------

// The resolver reads overrides from InteractiveFormsEngine.Instance.Overrides
// and persists the user's variant choice via UserInfoEngine — both in
// @memberjunction/core-entities.
const settingsBacking: Record<string, string> = {};
let overridesBacking: any[] = [];
vi.mock('@memberjunction/core-entities', () => ({
    UserInfoEngine: {
        Instance: {
            GetSetting: (key: string) => settingsBacking[key],
            SetSettingDebounced: (key: string, value: string) => { settingsBacking[key] = value; },
            DeleteSetting: async (key: string) => { delete settingsBacking[key]; return true; },
        },
    },
    InteractiveFormsEngine: {
        Instance: {
            Config: vi.fn(async () => { /* no-op: cache assumed loaded */ }),
            get Overrides() { return overridesBacking; },
        },
    },
}));

vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
    Type: class {},
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
}));

// ClassFactory mock — controls what the fallback branch returns.
let classFactoryReg: { SubClass: any } | null = null;
vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: { GetRegistration: vi.fn(() => classFactoryReg) },
        },
    },
    UUIDsEqual: (a: string, b: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase(),
}));

// Avoid dragging in the full Angular form-component chain at import time.
vi.mock('../base-form-component', () => ({
    BaseFormComponent: class FakeBaseFormComponent {},
}));

// ----- Test setup ---------------------------------------------------------

import type { FormResolverService } from '../resolver/form-resolver.service';

const entity = { ID: 'entity-1', Name: 'Customer' } as any;
const user = (overrides: Partial<{ ID: string; UserRoles: Array<{ RoleID: string }> }>) =>
    ({ ID: 'user-1', UserRoles: [], ...overrides } as any);
const provider = {} as any;

let createdSeq = 0;
const overrideRow = (overrides: Partial<{
    ID: string; EntityID: string; ComponentID: string;
    Scope: 'User' | 'Role' | 'Global';
    UserID: string | null; RoleID: string | null;
    Priority: number; Status: 'Active' | 'Inactive' | 'Pending';
    Name: string; __mj_CreatedAt: Date;
}>) => ({
    ID: 'row-1', EntityID: 'entity-1', ComponentID: 'comp-1',
    Scope: 'Global' as const, UserID: null, RoleID: null,
    Priority: 0, Status: 'Active' as const, Name: 'Variant',
    Description: null, __mj_CreatedAt: new Date(2024, 0, ++createdSeq),
    ...overrides,
});

let service: FormResolverService;

beforeEach(async () => {
    overridesBacking = [];
    classFactoryReg = null;
    createdSeq = 0;
    for (const k of Object.keys(settingsBacking)) delete settingsBacking[k];
    vi.clearAllMocks();
    const mod = await import('../resolver/form-resolver.service');
    service = new mod.FormResolverService();
});

// ----- Tests --------------------------------------------------------------

describe('FormResolverService.ResolveFormForEntity', () => {

    it('returns kind=interactive when an active override matches', async () => {
        overridesBacking = [overrideRow({})];
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.kind).toBe('interactive');
        if (result.kind === 'interactive') {
            expect(result.override.ComponentID).toBe('comp-1');
        }
    });

    it('ignores overrides for other entities', async () => {
        overridesBacking = [overrideRow({ EntityID: 'other-entity' })];
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.kind).toBe('none');
    });

    it('returns the full variant list (any status) alongside the resolved override', async () => {
        overridesBacking = [
            overrideRow({ ID: 'v-active', Status: 'Active', Scope: 'User', UserID: 'user-1' }),
            overrideRow({ ID: 'v-pending', Status: 'Pending', Scope: 'User', UserID: 'user-1' }),
            overrideRow({ ID: 'v-inactive', Status: 'Inactive', Scope: 'Global' }),
        ];
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.variants?.length).toBe(3);
        expect(result.variants?.map(v => v.ID).sort()).toEqual(['v-active', 'v-inactive', 'v-pending']);
    });

    it('orders User > Role > Global, then Priority DESC — first becomes the active pick', async () => {
        overridesBacking = [
            overrideRow({ ID: 'g', Scope: 'Global', Priority: 99 }),
            overrideRow({ ID: 'r', Scope: 'Role', RoleID: 'r1', Priority: 0 }),
            overrideRow({ ID: 'u', Scope: 'User', UserID: 'user-1', Priority: 0 }),
        ];
        const result = await service.ResolveFormForEntity(entity, user({ UserRoles: [{ RoleID: 'r1' }] }), provider);
        expect(result.kind).toBe('interactive');
        if (result.kind === 'interactive') {
            expect(result.override.ID).toBe('u'); // User scope wins despite Global's high priority
        }
        // Variant order reflects the tier sort
        expect(result.variants?.map(v => v.ID)).toEqual(['u', 'r', 'g']);
    });

    it('includes Role-scoped overrides only for roles the user has', async () => {
        overridesBacking = [
            overrideRow({ ID: 'r1', Scope: 'Role', RoleID: 'role-a', Status: 'Active' }),
            overrideRow({ ID: 'r2', Scope: 'Role', RoleID: 'role-b', Status: 'Active' }),
        ];
        const result = await service.ResolveFormForEntity(entity, user({ UserRoles: [{ RoleID: 'role-b' }] }), provider);
        expect(result.variants?.map(v => v.ID)).toEqual(['r2']);
    });

    it('excludes User-scoped overrides belonging to a different user', async () => {
        overridesBacking = [overrideRow({ Scope: 'User', UserID: 'someone-else' })];
        const result = await service.ResolveFormForEntity(entity, user({ ID: 'user-1' }), provider);
        expect(result.kind).toBe('none');
    });
});

describe('FormResolverService.ListVariantsForEntity', () => {
    it('returns the full applicable list (any status)', async () => {
        overridesBacking = [
            overrideRow({ ID: 'v1', Status: 'Active' }),
            overrideRow({ ID: 'v2', Status: 'Pending' }),
        ];
        const variants = await service.ListVariantsForEntity(entity, user({}), provider);
        expect(variants.length).toBe(2);
    });
});

describe('FormResolverService session-local variant selection', () => {

    it('honours a saved variant ID over the default Active pick', async () => {
        overridesBacking = [
            overrideRow({ ID: 'v-default-active', Status: 'Active', Scope: 'Global', Priority: 0 }),
            overrideRow({ ID: 'v-user-selected', Status: 'Active', Scope: 'User', UserID: 'user-1', Priority: 0 }),
        ];
        service.SetSelectedVariant(entity.Name, 'v-user-selected');
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.kind).toBe('interactive');
        if (result.kind === 'interactive') {
            expect(result.override.ID).toBe('v-user-selected');
        }
    });

    it('clears a saved variant ID that no longer matches an Active row', async () => {
        overridesBacking = [overrideRow({ ID: 'v-active', Status: 'Active' })];
        service.SetSelectedVariant(entity.Name, 'v-stale');
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.kind).toBe('interactive');
        if (result.kind === 'interactive') {
            expect(result.override.ID).toBe('v-active');
        }
        expect(service.GetSelectedVariant(entity.Name)).toBeNull();
    });

    it('ClearSelectedVariant wipes the stored choice', () => {
        service.SetSelectedVariant(entity.Name, 'v1');
        expect(service.GetSelectedVariant(entity.Name)).toBe('v1');
        service.ClearSelectedVariant(entity.Name);
        expect(service.GetSelectedVariant(entity.Name)).toBeNull();
    });

    it('SetExplicitDefault forces fall-through even when Active overrides exist', async () => {
        const SENTINEL = '__codegen-default__'; // matches EXPLICIT_DEFAULT_SENTINEL
        service.SetExplicitDefault(entity.Name);
        expect(service.GetSelectedVariant(entity.Name)).toBe(SENTINEL);
        overridesBacking = [overrideRow({ ID: 'v-active', Scope: 'Global', Status: 'Active' })];
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.kind).not.toBe('interactive');
    });

    it('is case-insensitive on the entity name', () => {
        service.SetSelectedVariant('Customer', 'v1');
        expect(service.GetSelectedVariant('customer')).toBe('v1');
        expect(service.GetSelectedVariant('CUSTOMER')).toBe('v1');
    });
});

describe('FormResolverService.ResolveFormForEntity — fallback behaviour', () => {

    it('falls back to ClassFactory when no override matches', async () => {
        overridesBacking = [];
        classFactoryReg = { SubClass: class FakeForm {} };
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.kind).toBe('class');
        if (result.kind === 'class') {
            expect(result.subClass).toBe(classFactoryReg.SubClass);
        }
    });

    it('returns kind=none when neither override nor ClassFactory has a form', async () => {
        overridesBacking = [];
        classFactoryReg = null;
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.kind).toBe('none');
    });

    it('only Active overrides are auto-picked; Pending/Inactive fall through to class', async () => {
        overridesBacking = [
            overrideRow({ ID: 'p', Status: 'Pending', Scope: 'Global' }),
            overrideRow({ ID: 'i', Status: 'Inactive', Scope: 'Global' }),
        ];
        classFactoryReg = { SubClass: class FakeForm {} };
        const result = await service.ResolveFormForEntity(entity, user({}), provider);
        expect(result.kind).toBe('class');
        // ...but they still appear in the variant list for the picker
        expect(result.variants?.length).toBe(2);
    });
});
