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

const mockProviderToUse = {
    GetEntityObject: vi.fn().mockImplementation(() => Promise.resolve(mockClaimEntityInstance))
};

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class MockBaseEngine {
        private static _inst: unknown;
        static getInstance<T>(): T {
            const ctor = this as unknown as { _inst?: T; new (): T };
            if (!ctor._inst) ctor._inst = new ctor();
            return ctor._inst;
        }
        async Load(): Promise<void> {}
        // The engine resolves entities through its own bound provider (data-access.md Rule #1)
        // rather than `new Metadata()`, so the double has to expose one — same shape the other
        // UserInfoEngine specs in this package use.
        get ProviderToUse() {
            return mockProviderToUse;
        }
        get RunViewProviderToUse() {
            return mockProviderToUse;
        }
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

    // The claim lifecycle (CreateClaim / RedeemClaim / AutoClaimForUser / RevokeClaim) is no
    // longer implemented here — it lives only on IdentityClaimEngineServer, which owns the token
    // hashing, timing-safe comparison, atomic CAS and email dispatch those operations require.
    // Their specs live in MJCoreEntitiesServer/src/__tests__/IdentityClaimEngineServer.test.ts.
});
