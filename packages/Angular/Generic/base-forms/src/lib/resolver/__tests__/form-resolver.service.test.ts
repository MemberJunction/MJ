import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';

/**
 * An admin retracts a broken shared form by setting it Inactive. So a set-aside form renders only
 * for the user who owns it; a shared one set aside is neither rendered nor kept as a stored choice.
 */

interface OverrideRow {
    ID: string; EntityID: string; ComponentID: string; Scope: 'User' | 'Role' | 'Global';
    UserID: string | null; RoleID: string | null; Priority: number; Status: 'Active' | 'Inactive' | 'Pending';
    Name: string; Description: string | null; __mj_CreatedAt: Date;
}

const hoisted = vi.hoisted(() => ({
    overrides: [] as OverrideRow[],
    stored: undefined as string | undefined,
    deleted: [] as string[],
}));

vi.mock('@memberjunction/core-entities', async () => ({
    // The scope rules are pure, so the real ones decide. Loads from core-entities' dist, so that
    // package must be built first.
    ...(await vi.importActual<Record<string, unknown>>('@memberjunction/core-entities/dist/custom/FormScope/FormScopeRules.js')),
    InteractiveFormsEngine: {
        Instance: {
            Config: async () => undefined,
            IsPermissionConstrained: false,
            get Overrides() { return hoisted.overrides; },
        },
    },
    UserInfoEngine: {
        Instance: {
            GetSetting: () => hoisted.stored,
            DeleteSetting: async (key: string) => { hoisted.deleted.push(key); return true; },
            SetSettingDebounced: () => undefined,
        },
    },
}));
vi.mock('../../base-form-component', () => ({ BaseFormComponent: class BaseFormComponent {} }));

import { FormResolverService } from '../form-resolver.service';

const ENTITY = { ID: 'ent-1', Name: 'MJ: Companies' } as unknown as EntityInfo;
const USER = { ID: 'user-me', UserRoles: [{ RoleID: 'role-sales' }] } as unknown as UserInfo;
const PROVIDER = {} as IMetadataProvider;

function form(over: Partial<OverrideRow> & { ID: string }): OverrideRow {
    return {
        EntityID: 'ent-1', ComponentID: `c-${over.ID}`, Scope: 'Global', UserID: null, RoleID: null,
        Priority: 0, Status: 'Active', Name: over.ID, Description: null, __mj_CreatedAt: new Date(0), ...over,
    };
}

async function resolvedID(entity: EntityInfo = ENTITY): Promise<string | null> {
    const resolution = await new FormResolverService().ResolveFormForEntity(entity, USER, PROVIDER);
    return resolution.kind === 'interactive' ? resolution.override.ID : null;
}

beforeEach(() => {
    hoisted.overrides = [];
    hoisted.stored = undefined;
    hoisted.deleted = [];
});

describe('FormResolverService — a stored choice of a set-aside form', () => {
    it('renders the user\'s own form they set aside', async () => {
        hoisted.overrides = [form({ ID: 'live' }), form({ ID: 'mine', Scope: 'User', UserID: 'user-me', Status: 'Inactive' })];
        hoisted.stored = 'mine';
        expect(await resolvedID()).toBe('mine');
        expect(hoisted.deleted).toEqual([]);
    });

    it('falls back to the default form when the choice is a shared form set aside, and drops the choice', async () => {
        hoisted.overrides = [form({ ID: 'live' }), form({ ID: 'retracted', Status: 'Inactive' })];
        hoisted.stored = 'retracted';
        expect(await resolvedID()).toBe('live');
        expect(hoisted.deleted).toEqual(['mj.formVariant.mj: companies']);
    });

    it('does not render a role form set aside, even when it is the only one', async () => {
        hoisted.overrides = [form({ ID: 'retracted', Scope: 'Role', RoleID: 'role-sales', Status: 'Inactive' })];
        hoisted.stored = 'retracted';
        expect(await resolvedID()).toBeNull();
    });
});

/**
 * A full custom form replaces the whole body. On an identity or permission entity, one published
 * to a role or to everyone would replace the Users form for other people, so only the user's own
 * forms apply there.
 */
describe('FormResolverService — an identity entity', () => {
    const USERS = { ID: 'ent-1', Name: 'MJ: Users' } as unknown as EntityInfo;

    it('does not render or offer a Global or Role form on MJ: Users', async () => {
        hoisted.overrides = [form({ ID: 'global' }), form({ ID: 'role', Scope: 'Role', RoleID: 'role-sales' })];
        expect(await resolvedID(USERS)).toBeNull();
        expect(await new FormResolverService().ListVariantsForEntity(USERS, USER, PROVIDER)).toEqual([]);
    });

    it('renders the user\'s own form there', async () => {
        hoisted.overrides = [form({ ID: 'global' }), form({ ID: 'mine', Scope: 'User', UserID: 'user-me' })];
        expect(await resolvedID(USERS)).toBe('mine');
    });

    it('drops a stored choice that names a shared form there', async () => {
        hoisted.overrides = [form({ ID: 'global' })];
        hoisted.stored = 'global';
        expect(await resolvedID(USERS)).toBeNull();
        expect(hoisted.deleted).toEqual(['mj.formVariant.mj: users']);
    });
});

/**
 * An IS-A child entity with no form of its own opens with its nearest parent's class form: the
 * child record carries every parent field and shares the key. A parent's EntityFormOverride rows
 * are scoped to the parent and do not apply to the child.
 */
describe('FormResolverService — an IS-A child with no form of its own', () => {
    class OrganizationsForm {}
    class SpecialOrganizationsForm {}
    class AccountsForm {}

    const ORGS = { ID: 'ent-org', Name: 'Test: Organizations', ParentChain: [] } as unknown as EntityInfo;
    const ACCOUNTS = { ID: 'ent-acct', Name: 'Test: Accounts', ParentChain: [ORGS] } as unknown as EntityInfo;
    const MEMBER_ACCOUNTS = { ID: 'ent-macct', Name: 'Test: Member Accounts', ParentChain: [ACCOUNTS, ORGS] } as unknown as EntityInfo;
    const VENDORS = { ID: 'ent-vend', Name: 'Test: Vendors', ParentChain: [] } as unknown as EntityInfo;
    const VENDOR_KINDS = { ID: 'ent-vk', Name: 'Test: Vendor Kinds', ParentChain: [VENDORS] } as unknown as EntityInfo;

    beforeAll(async () => {
        const { MJGlobal } = await import('@memberjunction/global');
        const { BaseFormComponent } = await import('../../base-form-component');
        MJGlobal.Instance.ClassFactory.Register(BaseFormComponent, OrganizationsForm, 'Test: Organizations');
        MJGlobal.Instance.ClassFactory.Register(BaseFormComponent, SpecialOrganizationsForm, 'Test: Organizations', 10);
        MJGlobal.Instance.ClassFactory.Register(BaseFormComponent, AccountsForm, 'Test: Accounts');
    });

    async function resolve(entity: EntityInfo) {
        return new FormResolverService().ResolveFormForEntity(entity, USER, PROVIDER);
    }

    it('uses the parent class form, and the parent standard form, when the child has none', async () => {
        const orgChild = { ID: 'ent-c', Name: 'Test: Org Children', ParentChain: [ORGS] } as unknown as EntityInfo;
        const resolution = await resolve(orgChild);
        expect(resolution.kind).toBe('class');
        expect(resolution.kind === 'class' ? resolution.subClass : null).toBe(SpecialOrganizationsForm);
        expect(resolution.standard).toBe(OrganizationsForm);
    });

    it('keeps the child form when the child has its own registration', async () => {
        const resolution = await resolve(ACCOUNTS);
        expect(resolution.kind === 'class' ? resolution.subClass : null).toBe(AccountsForm);
        expect(resolution.standard).toBe(AccountsForm);
    });

    it('uses the nearest ancestor with a form', async () => {
        const resolution = await resolve(MEMBER_ACCOUNTS);
        expect(resolution.kind === 'class' ? resolution.subClass : null).toBe(AccountsForm);
    });

    it('resolves to none when no ancestor has a form', async () => {
        const resolution = await resolve(VENDOR_KINDS);
        expect(resolution.kind).toBe('none');
        expect(resolution.standard).toBeNull();
    });

    it('does not apply a parent override to the child', async () => {
        hoisted.overrides = [form({ ID: 'org-override', EntityID: 'ent-org' })];
        const childOfOrgs = { ID: 'ent-c2', Name: 'Test: Org Children 2', ParentChain: [ORGS] } as unknown as EntityInfo;
        const resolution = await resolve(childOfOrgs);
        expect(resolution.kind).toBe('class');
    });
});
