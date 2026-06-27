import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const runViewQueue: Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }> = [];
const runViewCalls: Array<{ EntityName: string; ExtraFilter?: string }> = [];

vi.mock('@memberjunction/core', async () => {
    const { buildPermissionProviderBase } = await import('./_mockPermissionProviderBase');
    class MockRunView {
        async RunView(args: { EntityName: string; ExtraFilter?: string }) {
            runViewCalls.push({ EntityName: args.EntityName, ExtraFilter: args.ExtraFilter });
            return runViewQueue.shift() ?? { Success: true, Results: [], ErrorMessage: '' };
        }
    }
    return {
        PermissionProviderBase: buildPermissionProviderBase(MockRunView as any),
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: class {},
        Metadata: class {
            EntityByName(name: string) {
                return { ID: `ENT-${name}`, Name: name };
            }
            Roles = [{ ID: 'ROLE-1', Name: 'Admin' }];
        },
        BaseEngine: class {},
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        RunView: MockRunView,
    };
});

import { AccessControlRuleProvider } from '../../custom/PermissionProviders/AccessControlRuleProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_A = { ID: 'AAA', Name: 'User A', UserRoles: [{ RoleID: 'ROLE-1' }] } as unknown as UserInfo;
const USER_B = { ID: 'BBB', Name: 'User B', UserRoles: [] } as unknown as UserInfo;

beforeEach(() => {
    runViewQueue.length = 0;
    runViewCalls.length = 0;
});

describe('AccessControlRuleProvider', () => {
    let provider: AccessControlRuleProvider;
    beforeEach(() => { provider = new AccessControlRuleProvider(); });

    describe('CheckPermission', () => {
        it('denies when no resourceId', async () => {
            const result = await provider.CheckPermission(USER_A, 'Accounts', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('require a specific record ID');
        });

        it('grants when an active rule for the user has the action', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'R1', EntityID: 'ENT-Accounts', RecordID: 'rec1', GranteeType: 'User',
                      GranteeID: 'AAA', CanRead: true, CanCreate: false, CanUpdate: false,
                      CanDelete: false, CanShare: false, ExpiresAt: null },
                ],
            });
            const result = await provider.CheckPermission(USER_A, 'Accounts', 'rec1', 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('grants via Role grantee when user has matching role', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'R1', EntityID: 'ENT-Accounts', RecordID: 'rec1', GranteeType: 'Role',
                      GranteeID: 'ROLE-1', CanRead: true, CanCreate: false, CanUpdate: false,
                      CanDelete: false, CanShare: false, ExpiresAt: null },
                ],
            });
            const result = await provider.CheckPermission(USER_A, 'Accounts', 'rec1', 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('denies when only Role grantees exist and user lacks the role', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'R1', EntityID: 'ENT-Accounts', RecordID: 'rec1', GranteeType: 'Role',
                      GranteeID: 'ROLE-1', CanRead: true, CanCreate: false, CanUpdate: false,
                      CanDelete: false, CanShare: false, ExpiresAt: null },
                ],
            });
            const result = await provider.CheckPermission(USER_B, 'Accounts', 'rec1', 'Read');
            expect(result.Allowed).toBe(false);
        });
    });

    describe('GetPermissionsSharedWithUser', () => {
        it('filters to GranteeType=User AND GrantedByUserID != grantee AND not expired', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'R1', EntityID: 'ENT-Accounts', Entity: 'Accounts', RecordID: 'rec1',
                      GranteeType: 'User', GranteeID: 'BBB', GrantedByUserID: 'AAA',
                      CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false, CanShare: false,
                      ExpiresAt: null },
                ],
            });
            const result = await provider.GetPermissionsSharedWithUser(USER_B);
            expect(result).toHaveLength(1);
            expect(result[0].SourceRecordID).toBe('R1');
            expect(result[0].ResourceType).toBe('Accounts');
            expect(runViewCalls[0].ExtraFilter).toContain("GranteeType='User'");
            expect(runViewCalls[0].ExtraFilter).toContain("GranteeID='BBB'");
            expect(runViewCalls[0].ExtraFilter).toContain("GrantedByUserID <> 'BBB'");
            expect(runViewCalls[0].ExtraFilter).toContain('ExpiresAt IS NULL OR ExpiresAt > ');
        });
    });

    describe('GetPermissionsGrantedByUser', () => {
        it('returns rules where grantor matches and unexpired, with Role grantee resolved', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'R1', EntityID: 'ENT-Accounts', Entity: 'Accounts', RecordID: 'rec1',
                      GranteeType: 'User', GranteeID: 'BBB', GrantedByUserID: 'AAA',
                      CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false, CanShare: false,
                      ExpiresAt: null },
                    { ID: 'R2', EntityID: 'ENT-Accounts', Entity: 'Accounts', RecordID: 'rec2',
                      GranteeType: 'Role', GranteeID: 'ROLE-1', GrantedByUserID: 'AAA',
                      CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false, CanShare: false,
                      ExpiresAt: null },
                ],
            });
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toHaveLength(2);
            expect(runViewCalls[0].ExtraFilter).toContain("GrantedByUserID='AAA'");
            const roleRow = result.find((r) => r.GranteeType === 'Role');
            expect(roleRow?.GranteeName).toBe('Admin');
        });

        it('returns empty on RunView failure', async () => {
            runViewQueue.push({ Success: false, Results: [], ErrorMessage: 'fail' });
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });
    });
});
