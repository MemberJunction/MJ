import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('@memberjunction/core-entities', () => ({
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

async function resolvedID(): Promise<string | null> {
    const resolution = await new FormResolverService().ResolveFormForEntity(ENTITY, USER, PROVIDER);
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
