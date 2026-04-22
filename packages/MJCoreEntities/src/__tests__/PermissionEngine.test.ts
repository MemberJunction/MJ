import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks — must be defined before importing the module under test
// ============================================================================

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: {
            Instance: {
                GetGlobalObjectStore: () => ({}),
                ClassFactory: {
                    CreateInstance: vi.fn(() => null),
                },
            },
        },
    };
});

vi.mock('@memberjunction/core', () => {
    const basePermissionProvider = class {};
    return {
        BaseEngine: class MockBaseEngine {
            static getInstance<T>(): T {
                const ctor = this as unknown as { _testInstance?: T; new (): T };
                if (!ctor._testInstance) {
                    ctor._testInstance = new ctor();
                }
                return ctor._testInstance;
            }
            async Load(): Promise<void> {
                // no-op in tests
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        Metadata: class {},
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        PermissionProviderBase: basePermissionProvider,
        RegisterForStartup: () => () => {},
        UserInfo: class {},
    };
});

vi.mock('../generated/entity_subclasses', () => ({
    MJPermissionDomainEntity: class {},
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import { PermissionEngine } from '../engines/PermissionEngine';
import type { PermissionProviderBase } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProvider(overrides: {
    DomainName: string;
    CheckPermission?: ReturnType<typeof vi.fn>;
    GetUserResources?: ReturnType<typeof vi.fn>;
    GetResourcePermissions?: ReturnType<typeof vi.fn>;
    GetEffectivePermissions?: ReturnType<typeof vi.fn>;
}): PermissionProviderBase {
    return {
        DomainName: overrides.DomainName,
        Description: `Mock provider for ${overrides.DomainName}`,
        SupportedGranteeTypes: ['User'],
        SupportedActions: ['Read'],
        SupportsDeny: false,
        CheckPermission:
            overrides.CheckPermission ??
            vi.fn(async () => ({ Allowed: true, DomainName: overrides.DomainName, Reason: 'mock allow' })),
        GetUserResources: overrides.GetUserResources ?? vi.fn(async () => []),
        GetResourcePermissions: overrides.GetResourcePermissions ?? vi.fn(async () => []),
        GetEffectivePermissions: overrides.GetEffectivePermissions ?? vi.fn(async () => []),
    } as unknown as PermissionProviderBase;
}

const MOCK_USER = { ID: 'U1', Name: 'Test User', UserRoles: [] } as unknown as Parameters<
    PermissionProviderBase['CheckPermission']
>[0];

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

describe('PermissionEngine', () => {
    let engine: PermissionEngine;

    beforeEach(() => {
        engine = PermissionEngine.Instance;
        engine._SetProvidersForTesting(new Map());
    });

    describe('CheckPermission', () => {
        it('returns Allowed=false with "Unknown permission domain" reason when the domain is not registered', async () => {
            const result = await engine.CheckPermission(MOCK_USER, 'Missing Domain', 'SomeType', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('Unknown permission domain');
            expect(result.DomainName).toBe('Missing Domain');
        });

        it('routes to the registered provider when the domain exists', async () => {
            const mockProvider = makeMockProvider({
                DomainName: 'Entity Permissions',
                CheckPermission: vi.fn(async () => ({
                    Allowed: true,
                    DomainName: 'Entity Permissions',
                    Reason: 'Role grants Read',
                })),
            });
            const providers = new Map<string, PermissionProviderBase>();
            providers.set('Entity Permissions', mockProvider);
            engine._SetProvidersForTesting(providers);

            const result = await engine.CheckPermission(MOCK_USER, 'Entity Permissions', 'Users', null, 'Read');

            expect(result.Allowed).toBe(true);
            expect(result.DomainName).toBe('Entity Permissions');
            expect(mockProvider.CheckPermission).toHaveBeenCalledWith(MOCK_USER, 'Users', null, 'Read');
        });

        it('propagates a denial returned by the provider', async () => {
            const mockProvider = makeMockProvider({
                DomainName: 'Dashboard Permissions',
                CheckPermission: vi.fn(async () => ({
                    Allowed: false,
                    DomainName: 'Dashboard Permissions',
                    Reason: 'User has no Share permission',
                })),
            });
            const providers = new Map<string, PermissionProviderBase>([['Dashboard Permissions', mockProvider]]);
            engine._SetProvidersForTesting(providers);

            const result = await engine.CheckPermission(MOCK_USER, 'Dashboard Permissions', 'Dashboards', 'D1', 'Share');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('no Share permission');
        });
    });

    describe('GetAllUserPermissions', () => {
        it('aggregates permissions across every registered provider', async () => {
            const entityRows = [
                {
                    DomainName: 'Entity Permissions',
                    ResourceType: 'Users',
                    ResourceID: null,
                    GranteeType: 'User' as const,
                    GranteeID: 'U1',
                    Actions: ['Read' as const],
                    Effect: 'Allow' as const,
                },
            ];
            const dashboardRows = [
                {
                    DomainName: 'Dashboard Permissions',
                    ResourceType: 'Dashboards',
                    ResourceID: 'D1',
                    GranteeType: 'User' as const,
                    GranteeID: 'U1',
                    Actions: ['Read' as const, 'Update' as const],
                    Effect: 'Allow' as const,
                },
            ];
            const entityProvider = makeMockProvider({
                DomainName: 'Entity Permissions',
                GetUserResources: vi.fn(async () => entityRows),
            });
            const dashboardProvider = makeMockProvider({
                DomainName: 'Dashboard Permissions',
                GetUserResources: vi.fn(async () => dashboardRows),
            });
            engine._SetProvidersForTesting(
                new Map<string, PermissionProviderBase>([
                    ['Entity Permissions', entityProvider],
                    ['Dashboard Permissions', dashboardProvider],
                ])
            );

            const all = await engine.GetAllUserPermissions(MOCK_USER);

            expect(all).toHaveLength(2);
            expect(all.map((r) => r.DomainName).sort()).toEqual(['Dashboard Permissions', 'Entity Permissions']);
            expect(entityProvider.GetUserResources).toHaveBeenCalledWith(MOCK_USER);
            expect(dashboardProvider.GetUserResources).toHaveBeenCalledWith(MOCK_USER);
        });

        it('tolerates provider failures without aborting the aggregation', async () => {
            const goodProvider = makeMockProvider({
                DomainName: 'Entity Permissions',
                GetUserResources: vi.fn(async () => [
                    {
                        DomainName: 'Entity Permissions',
                        ResourceType: 'Users',
                        ResourceID: null,
                        GranteeType: 'User' as const,
                        GranteeID: 'U1',
                        Actions: ['Read' as const],
                        Effect: 'Allow' as const,
                    },
                ]),
            });
            const badProvider = makeMockProvider({
                DomainName: 'Broken Domain',
                GetUserResources: vi.fn(async () => {
                    throw new Error('simulated provider failure');
                }),
            });
            engine._SetProvidersForTesting(
                new Map<string, PermissionProviderBase>([
                    ['Entity Permissions', goodProvider],
                    ['Broken Domain', badProvider],
                ])
            );

            const all = await engine.GetAllUserPermissions(MOCK_USER);

            // good provider's result comes through; bad provider swallowed
            expect(all).toHaveLength(1);
            expect(all[0].DomainName).toBe('Entity Permissions');
        });

        it('returns an empty array when no providers are registered', async () => {
            const all = await engine.GetAllUserPermissions(MOCK_USER);
            expect(all).toEqual([]);
        });
    });

    describe('GetResourcePermissions', () => {
        it('returns rows from the matching provider', async () => {
            const rows = [
                {
                    DomainName: 'Dashboard Permissions',
                    ResourceType: 'Dashboards',
                    ResourceID: 'D1',
                    GranteeType: 'User' as const,
                    GranteeID: 'U1',
                    Actions: ['Read' as const, 'Share' as const],
                    Effect: 'Allow' as const,
                },
            ];
            const provider = makeMockProvider({
                DomainName: 'Dashboard Permissions',
                GetResourcePermissions: vi.fn(async () => rows),
            });
            engine._SetProvidersForTesting(new Map([['Dashboard Permissions', provider]]));

            const result = await engine.GetResourcePermissions('Dashboard Permissions', 'Dashboards', 'D1');
            expect(result).toEqual(rows);
            expect(provider.GetResourcePermissions).toHaveBeenCalledWith('Dashboards', 'D1');
        });

        it('returns an empty array when the domain is unknown', async () => {
            const result = await engine.GetResourcePermissions('Nonexistent Domain', 'Foo', 'Bar');
            expect(result).toEqual([]);
        });
    });

    describe('GetProvider', () => {
        it('returns the registered provider by domain name', () => {
            const provider = makeMockProvider({ DomainName: 'Entity Permissions' });
            engine._SetProvidersForTesting(new Map([['Entity Permissions', provider]]));

            expect(engine.GetProvider('Entity Permissions')).toBe(provider);
        });

        it('returns undefined for an unregistered domain', () => {
            engine._SetProvidersForTesting(new Map());
            expect(engine.GetProvider('Missing')).toBeUndefined();
        });
    });
});
