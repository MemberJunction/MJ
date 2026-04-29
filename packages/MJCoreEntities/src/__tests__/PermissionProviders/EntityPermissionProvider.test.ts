import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
            !!a && !!b && a.toLowerCase() === b.toLowerCase(),
        MJGlobal: {
            Instance: {
                GetGlobalObjectStore: () => ({}),
                ClassFactory: { CreateInstance: vi.fn(() => null) },
            },
        },
    };
});

// In-memory substitute for `Metadata` — the provider instantiates `new Metadata()`
// and reads `.Entities`, `.EntityByName`, and `.Roles`. We inject a controllable store.
const metadataState = {
    Entities: [] as Array<{
        Name: string;
        Permissions: Array<{
            ID: string;
            RoleID: string;
            Type?: string;
            CanRead: boolean;
            CanCreate: boolean;
            CanUpdate: boolean;
            CanDelete: boolean;
        }>;
        GetUserPermisions: (user: { UserRoles?: Array<{ RoleID: string }> }) => {
            CanRead: boolean;
            CanCreate: boolean;
            CanUpdate: boolean;
            CanDelete: boolean;
        };
    }>,
    Roles: [] as Array<{ ID: string; Name: string }>,
};

vi.mock('@memberjunction/core', async () => {
    const { buildPermissionProviderBase } = await import('./_mockPermissionProviderBase');
    class MockRunView { async RunView() { return { Success: true, Results: [] }; } }
    return {
        PermissionProviderBase: buildPermissionProviderBase(MockRunView as any),
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: class {},
        RunView: MockRunView,
        BaseEngine: class {},
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        Metadata: class {
            get Entities() { return metadataState.Entities; }
            get Roles() { return metadataState.Roles; }
            EntityByName(name: string) { return metadataState.Entities.find((e) => e.Name === name); }
        },
    };
});

// ---------------------------------------------------------------------------

import { EntityPermissionProvider } from '../../custom/PermissionProviders/EntityPermissionProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_A = { ID: 'AAA', Name: 'User A', UserRoles: [{ RoleID: 'ROLE-UI' }] } as unknown as UserInfo;

function resetMetadata() {
    metadataState.Entities = [];
    metadataState.Roles = [];
}

/**
 * Install a single entity with a programmable `GetUserPermisions` + the underlying
 * `Permissions` rows so both user-facing and resource-facing paths have data.
 */
function installEntity(
    name: string,
    opts: {
        userHas: Partial<{ CanRead: boolean; CanCreate: boolean; CanUpdate: boolean; CanDelete: boolean }>;
        rows?: Array<{
            ID: string; RoleID: string; Type?: string;
            CanRead?: boolean; CanCreate?: boolean; CanUpdate?: boolean; CanDelete?: boolean;
        }>;
    }
) {
    metadataState.Entities.push({
        Name: name,
        Permissions: (opts.rows ?? []).map((r) => ({
            ID: r.ID, RoleID: r.RoleID, Type: r.Type,
            CanRead: !!r.CanRead, CanCreate: !!r.CanCreate, CanUpdate: !!r.CanUpdate, CanDelete: !!r.CanDelete,
        })),
        GetUserPermisions: () => ({
            CanRead: !!opts.userHas.CanRead,
            CanCreate: !!opts.userHas.CanCreate,
            CanUpdate: !!opts.userHas.CanUpdate,
            CanDelete: !!opts.userHas.CanDelete,
        }),
    });
}

describe('EntityPermissionProvider', () => {
    let provider: EntityPermissionProvider;
    beforeEach(() => {
        resetMetadata();
        provider = new EntityPermissionProvider();
    });

    describe('CheckPermission', () => {
        it('returns Allowed=false when the entity is unknown', async () => {
            const result = await provider.CheckPermission(USER_A, 'NonExistent', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('not found');
        });

        it('returns Allowed=true when the user has the action on the entity', async () => {
            installEntity('Users', { userHas: { CanRead: true } });
            const result = await provider.CheckPermission(USER_A, 'Users', null, 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('returns Allowed=false when the user does not have the action', async () => {
            installEntity('Users', { userHas: { CanRead: true } });
            const result = await provider.CheckPermission(USER_A, 'Users', null, 'Delete');
            expect(result.Allowed).toBe(false);
        });

        it('rejects unsupported actions (Share) cleanly', async () => {
            installEntity('Users', { userHas: { CanRead: true, CanUpdate: true } });
            // Share is not in SupportedActions for this provider, but CheckPermission
            // must still return a well-formed result rather than throw.
            const result = await provider.CheckPermission(USER_A, 'Users', null, 'Share');
            expect(result.Allowed).toBe(false);
        });
    });

    describe('GetEffectivePermissions', () => {
        it('returns an empty array when the user has no actions', async () => {
            installEntity('Users', { userHas: {} });
            const result = await provider.GetEffectivePermissions(USER_A, 'Users', '');
            expect(result).toEqual([]);
        });

        it('returns a single NormalizedPermission with all actions the user holds', async () => {
            installEntity('Users', { userHas: { CanRead: true, CanUpdate: true } });
            const result = await provider.GetEffectivePermissions(USER_A, 'Users', '');
            expect(result).toHaveLength(1);
            expect(result[0].Actions).toEqual(['Read', 'Update']);
            expect(result[0].Effect).toBe('Allow');
            expect(result[0].GranteeID).toBe('AAA');
        });
    });

    describe('GetUserResources', () => {
        it('returns only entities the user has at least one action on', async () => {
            installEntity('Users', { userHas: { CanRead: true } });
            installEntity('Entities', { userHas: {} });
            installEntity('AI Agents', { userHas: { CanRead: true, CanDelete: true } });
            const result = await provider.GetUserResources(USER_A);
            expect(result.map((r) => r.ResourceType).sort()).toEqual(['AI Agents', 'Users']);
        });

        it('filters to a single resource type when requested', async () => {
            installEntity('Users', { userHas: { CanRead: true } });
            installEntity('AI Agents', { userHas: { CanRead: true } });
            const result = await provider.GetUserResources(USER_A, 'AI Agents');
            expect(result).toHaveLength(1);
            expect(result[0].ResourceType).toBe('AI Agents');
        });
    });

    describe('GetResourcePermissions — Deny support', () => {
        it('emits Effect=Deny for rows whose Type is "Deny" (case-insensitive)', async () => {
            metadataState.Roles = [
                { ID: 'ROLE-UI', Name: 'UI' },
                { ID: 'ROLE-DEV', Name: 'Developer' },
            ];
            installEntity('Users', {
                userHas: {},
                rows: [
                    { ID: 'EP1', RoleID: 'ROLE-UI', Type: 'Allow', CanRead: true, CanUpdate: true },
                    { ID: 'EP2', RoleID: 'ROLE-DEV', Type: 'Deny', CanRead: true, CanDelete: true },
                    { ID: 'EP3', RoleID: 'ROLE-UI', Type: 'deny', CanDelete: true }, // lowercase
                ],
            });

            const result = await provider.GetResourcePermissions('Users', '');
            const allow = result.filter((r) => r.Effect === 'Allow');
            const deny = result.filter((r) => r.Effect === 'Deny');

            expect(allow).toHaveLength(1);
            expect(allow[0].SourceRecordID).toBe('EP1');
            expect(allow[0].Actions.sort()).toEqual(['Read', 'Update']);
            expect(allow[0].GranteeName).toBe('UI');

            expect(deny).toHaveLength(2);
            expect(deny.map((r) => r.SourceRecordID).sort()).toEqual(['EP2', 'EP3']);
        });

        it('defaults Effect to Allow when Type is missing', async () => {
            metadataState.Roles = [{ ID: 'ROLE-UI', Name: 'UI' }];
            installEntity('Users', {
                userHas: {},
                rows: [{ ID: 'EP1', RoleID: 'ROLE-UI', CanRead: true }],
            });
            const result = await provider.GetResourcePermissions('Users', '');
            expect(result).toHaveLength(1);
            expect(result[0].Effect).toBe('Allow');
        });

        it('omits rows with no canonical action flags set', async () => {
            metadataState.Roles = [{ ID: 'ROLE-UI', Name: 'UI' }];
            installEntity('Users', {
                userHas: {},
                rows: [{ ID: 'EP1', RoleID: 'ROLE-UI', Type: 'Allow' }], // all booleans false
            });
            const result = await provider.GetResourcePermissions('Users', '');
            expect(result).toEqual([]);
        });

        it('declares SupportsDeny=true on the provider', () => {
            expect(provider.SupportsDeny).toBe(true);
        });
    });
});
