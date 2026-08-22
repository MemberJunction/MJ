/**
 * Unit tests for IdentityClaimEngine and BaseIdentityClaimDriver
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const mockSave = vi.fn().mockResolvedValue(true);
const mockLoad = vi.fn().mockResolvedValue(true);

class MockIdentityClaimEntity {
    ID = 'claim-123';
    ClaimTypeID = 'type-1';
    NormalizedEmail = 'test@example.com';
    EntityID: string | null = null;
    RecordID: string | null = null;
    PayloadJSON: string | null = null;
    Status = 'Pending';
    ExpiresAt = new Date(Date.now() + 86400000);
    ClaimedAt: Date | null = null;
    ClaimedByUserID: string | null = null;
    MagicLinkInviteID: string | null = null;
    MetadataJSON: string | null = null;
    LatestResult = { Success: true, Message: '' };

    NewRecord = vi.fn();
    Save = mockSave;
    Load = mockLoad;
}

const mockDriverOnCreate = vi.fn().mockResolvedValue(undefined);
const mockDriverOnClaim = vi.fn().mockResolvedValue({ Success: true });
const mockDriverOnRevoke = vi.fn().mockResolvedValue(undefined);
const mockDriverOnExpire = vi.fn().mockResolvedValue(undefined);

class MockDriver {
    OnCreate = mockDriverOnCreate;
    OnClaim = mockDriverOnClaim;
    OnRevoke = mockDriverOnRevoke;
    OnExpire = mockDriverOnExpire;
}

const mockClassFactoryCreateInstance = vi.fn().mockReturnValue(new MockDriver());

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: (baseClass: unknown, key: string) => mockClassFactoryCreateInstance(baseClass, key)
            }
        }
    },
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase()
}));

const mockClaimEntityInstance = new MockIdentityClaimEntity();

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class MockBaseEngine {
        private static _inst: unknown;
        static getInstance<T>(): T {
            const ctor = this as unknown as { _inst?: T; new (): T };
            if (!ctor._inst) ctor._inst = new ctor();
            return ctor._inst;
        }
        async Load(): Promise<void> {}
    },
    RegisterForStartup: () => (target: unknown) => target,
    Metadata: class {
        GetEntityObject = vi.fn().mockResolvedValue(mockClaimEntityInstance);
    },
    RunView: class {
        RunView = vi.fn().mockResolvedValue({
            Success: true,
            Results: [mockClaimEntityInstance]
        });
    }
}));

vi.mock('../generated/entity_subclasses', () => ({
    MJIdentityClaimTypeEntity: class {},
    MJIdentityClaimEntity: MockIdentityClaimEntity
}));

import { IdentityClaimEngine, BaseIdentityClaimDriver } from '../engines/IdentityClaimEngine';

interface ClaimTypeRow {
    ID: string;
    Name: string;
    DriverClass: string;
    DefaultExpirationDays: number;
    IsActive: boolean;
}

function setClaimTypes(types: ClaimTypeRow[]): void {
    const inst = IdentityClaimEngine.Instance as unknown as {
        _claimTypes: ClaimTypeRow[];
        _byName: unknown;
        _byId: unknown;
    };
    inst._claimTypes = types;
    inst._byName = null;
    inst._byId = null;
}

const sampleType: ClaimTypeRow = {
    ID: 'type-1',
    Name: 'EntitlementGrant',
    DriverClass: 'EntitlementGrantClaimDriver',
    DefaultExpirationDays: 14,
    IsActive: true
};

describe('IdentityClaimEngine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClaimEntityInstance.Status = 'Pending';
        mockClaimEntityInstance.ExpiresAt = new Date(Date.now() + 86400000);
        mockClaimEntityInstance.ClaimedAt = null;
        mockClaimEntityInstance.ClaimedByUserID = null;
        mockSave.mockResolvedValue(true);
        mockLoad.mockResolvedValue(true);
        setClaimTypes([sampleType]);
    });

    describe('NormalizeEmail', () => {
        it('lowercases and trims email addresses', () => {
            expect(IdentityClaimEngine.Instance.NormalizeEmail('  User@Domain.COM  ')).toBe('user@domain.com');
            expect(IdentityClaimEngine.Instance.NormalizeEmail('')).toBe('');
        });
    });

    describe('GetClaimTypeByName and GetClaimTypeByID', () => {
        it('finds claim type by name case-insensitively', () => {
            const ct = IdentityClaimEngine.Instance.GetClaimTypeByName('entitlementgrant');
            expect(ct?.Name).toBe('EntitlementGrant');
            expect(ct?.DriverClass).toBe('EntitlementGrantClaimDriver');
        });

        it('finds claim type by ID case-insensitively', () => {
            const ct = IdentityClaimEngine.Instance.GetClaimTypeByID('TYPE-1');
            expect(ct?.Name).toBe('EntitlementGrant');
        });

        it('returns undefined for non-existent types', () => {
            expect(IdentityClaimEngine.Instance.GetClaimTypeByName('NonExistent')).toBeUndefined();
            expect(IdentityClaimEngine.Instance.GetClaimTypeByID('non-existent')).toBeUndefined();
        });
    });

    describe('CreateClaim', () => {
        it('creates a new claim with normalized email and default expiration days', async () => {
            const claim = await IdentityClaimEngine.Instance.CreateClaim({
                ClaimTypeName: 'EntitlementGrant',
                NormalizedEmail: '  Jane.Doe@Example.com ',
                EntityID: 'ent-1',
                RecordID: 'rec-100',
                Payload: { courseId: 'c1' }
            });

            expect(claim).toBeDefined();
            expect(claim.NormalizedEmail).toBe('jane.doe@example.com');
            expect(claim.ClaimTypeID).toBe('type-1');
            expect(claim.Status).toBe('Pending');
            expect(mockSave).toHaveBeenCalled();
            expect(mockDriverOnCreate).toHaveBeenCalled();
        });

        it('throws if email is missing', async () => {
            await expect(IdentityClaimEngine.Instance.CreateClaim({
                ClaimTypeName: 'EntitlementGrant',
                NormalizedEmail: ''
            })).rejects.toThrow('NormalizedEmail is required');
        });

        it('throws if claim type is not found', async () => {
            await expect(IdentityClaimEngine.Instance.CreateClaim({
                ClaimTypeName: 'UnknownType',
                NormalizedEmail: 'test@example.com'
            })).rejects.toThrow('IdentityClaimType not found');
        });
    });

    describe('RedeemClaim', () => {
        const mockUser = { ID: 'user-42', Email: 'jane.doe@example.com' } as unknown as UserInfo;

        it('successfully redeems pending claim and transitions status to Claimed', async () => {
            mockDriverOnClaim.mockResolvedValueOnce({ Success: true, Data: { enrolled: true } });

            const result = await IdentityClaimEngine.Instance.RedeemClaim('claim-123', mockUser, 'token-abc');

            expect(result.Success).toBe(true);
            expect(mockDriverOnClaim).toHaveBeenCalledWith(expect.objectContaining({
                User: mockUser,
                RedemptionToken: 'token-abc'
            }));
            expect(mockClaimEntityInstance.Status).toBe('Claimed');
            expect(mockClaimEntityInstance.ClaimedByUserID).toBe('user-42');
            expect(mockClaimEntityInstance.ClaimedAt).toBeInstanceOf(Date);
            expect(mockSave).toHaveBeenCalled();
        });

        it('fails if claim is already claimed', async () => {
            mockClaimEntityInstance.Status = 'Claimed';

            const result = await IdentityClaimEngine.Instance.RedeemClaim('claim-123', mockUser);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('not in Pending status');
        });

        it('marks claim expired if past expiration date and invokes OnExpire', async () => {
            mockClaimEntityInstance.ExpiresAt = new Date(Date.now() - 10000);

            const result = await IdentityClaimEngine.Instance.RedeemClaim('claim-123', mockUser);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('expired');
            expect(mockClaimEntityInstance.Status).toBe('Expired');
            expect(mockDriverOnExpire).toHaveBeenCalled();
        });
    });

    describe('AutoClaimForUser', () => {
        const mockUser = { ID: 'user-42', Email: 'jane.doe@example.com' } as unknown as UserInfo;

        it('finds pending claims matching user email and redeems them automatically', async () => {
            mockDriverOnClaim.mockResolvedValueOnce({ Success: true });

            const results = await IdentityClaimEngine.Instance.AutoClaimForUser(mockUser);

            expect(results).toHaveLength(1);
            expect(results[0].Success).toBe(true);
            expect(mockClaimEntityInstance.Status).toBe('Claimed');
        });
    });

    describe('RevokeClaim', () => {
        it('marks claim revoked and invokes driver OnRevoke hook', async () => {
            await IdentityClaimEngine.Instance.RevokeClaim('claim-123', undefined, 'Admin canceled');

            expect(mockClaimEntityInstance.Status).toBe('Revoked');
            expect(mockSave).toHaveBeenCalled();
            expect(mockDriverOnRevoke).toHaveBeenCalled();
        });

        it('throws if attempting to revoke an already claimed item', async () => {
            mockClaimEntityInstance.Status = 'Claimed';

            await expect(IdentityClaimEngine.Instance.RevokeClaim('claim-123')).rejects.toThrow('Cannot revoke an already claimed');
        });
    });
});
