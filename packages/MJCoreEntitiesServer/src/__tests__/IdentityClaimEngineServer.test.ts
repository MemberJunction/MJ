import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import { IdentityClaimEngineServer } from '../engines/IdentityClaimEngineServer.js';
import {
    IdentityClaimEngine,
    BaseIdentityClaimDriver,
    ClaimContext,
    ClaimRedeemContext,
    ClaimResult,
    type MJIdentityClaimEntity,
    type MJIdentityClaimTypeEntity
} from '@memberjunction/core-entities';
import { Metadata, type UserInfo } from '@memberjunction/core';

class MockDriver extends BaseIdentityClaimDriver {
    public onCreateCalled = false;
    public onClaimCalled = false;
    public onClaimCallCount = 0;
    public onRevokeCalled = false;
    public onExpireCalled = false;
    public shouldFail = false;

    public async OnCreate(context: ClaimContext): Promise<void> {
        this.onCreateCalled = true;
    }

    public async OnClaim(context: ClaimRedeemContext): Promise<ClaimResult> {
        this.onClaimCalled = true;
        this.onClaimCallCount++;
        if (this.shouldFail) {
            return { Success: false, ErrorMessage: 'Driver execution failed' };
        }
        return { Success: true, Data: { Granted: true } };
    }

    public async OnRevoke(context: ClaimContext): Promise<void> {
        this.onRevokeCalled = true;
    }

    public async OnExpire(context: ClaimContext): Promise<void> {
        this.onExpireCalled = true;
    }
}

interface MockClaimRecord {
    ID: string;
    ClaimTypeID: string;
    Status: MJIdentityClaimEntity['Status'];
    ExpiresAt: Date | null;
    NormalizedEmail: string;
    MagicLinkInviteID: string | null;
    MetadataJSON: string | null;
    EntityID: string | null;
    RecordID: string | null;
    ClaimedAt: Date | null;
    ClaimedByUserID: string | null;
    NewRecord: () => void;
    Load: (id: string) => Promise<boolean>;
    Save: () => Promise<boolean>;
    Set: (key: string, value: unknown) => void;
    Get: (key: string) => unknown;
}

function createMockClaim(initial: Partial<MockClaimRecord> = {}): MockClaimRecord {
    const data: Record<string, unknown> = {
        ID: 'claim-123',
        ClaimTypeID: '11111111-1111-1111-1111-111111111111',
        Status: 'Pending',
        ExpiresAt: new Date(Date.now() + 86400000),
        NormalizedEmail: 'claimant@example.com',
        MagicLinkInviteID: null,
        MetadataJSON: null,
        EntityID: null,
        RecordID: null,
        ClaimedAt: null,
        ClaimedByUserID: null,
        ...initial
    };

    const record: MockClaimRecord = {
        get ID() { return String(data['ID'] ?? ''); },
        set ID(v: string) { data['ID'] = v; },
        get ClaimTypeID() { return String(data['ClaimTypeID'] ?? ''); },
        set ClaimTypeID(v: string) { data['ClaimTypeID'] = v; },
        get Status() { return data['Status'] as MJIdentityClaimEntity['Status']; },
        set Status(v: MJIdentityClaimEntity['Status']) { data['Status'] = v; },
        get ExpiresAt() { return data['ExpiresAt'] as Date | null; },
        set ExpiresAt(v: Date | null) { data['ExpiresAt'] = v; },
        get NormalizedEmail() { return String(data['NormalizedEmail'] ?? ''); },
        set NormalizedEmail(v: string) { data['NormalizedEmail'] = v; },
        get MagicLinkInviteID() { return data['MagicLinkInviteID'] as string | null; },
        set MagicLinkInviteID(v: string | null) { data['MagicLinkInviteID'] = v; },
        get MetadataJSON() { return data['MetadataJSON'] as string | null; },
        set MetadataJSON(v: string | null) { data['MetadataJSON'] = v; },
        get EntityID() { return data['EntityID'] as string | null; },
        set EntityID(v: string | null) { data['EntityID'] = v; },
        get RecordID() { return data['RecordID'] as string | null; },
        set RecordID(v: string | null) { data['RecordID'] = v; },
        get ClaimedAt() { return data['ClaimedAt'] as Date | null; },
        set ClaimedAt(v: Date | null) { data['ClaimedAt'] = v; },
        get ClaimedByUserID() { return data['ClaimedByUserID'] as string | null; },
        set ClaimedByUserID(v: string | null) { data['ClaimedByUserID'] = v; },
        NewRecord: vi.fn(),
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        Set: vi.fn((k: string, v: unknown) => { data[k] = v; }),
        Get: vi.fn((k: string) => data[k])
    };

    return record;
}

function createMockUser(initial: Partial<UserInfo> = {}): UserInfo {
    return {
        ID: 'user-456',
        Email: 'claimant@example.com',
        Name: 'Claimant User',
        IsActive: true,
        ...initial
    } as unknown as UserInfo;
}

function createMockClaimType(initial: Partial<MJIdentityClaimTypeEntity> = {}): MJIdentityClaimTypeEntity {
    return {
        ID: '11111111-1111-1111-1111-111111111111',
        Name: 'TestClaim',
        DriverClass: 'MockDriver',
        DefaultExpirationDays: 30,
        IsActive: true,
        ...initial
    } as unknown as MJIdentityClaimTypeEntity;
}

describe('IdentityClaimEngineServer', () => {
    let mockDriver: MockDriver;

    beforeEach(() => {
        mockDriver = new MockDriver();
        (Metadata as unknown as { Provider: unknown }).Provider = {
            PlatformKey: 'sqlserver',
            ExecuteSQL: vi.fn().mockResolvedValue([{ ID: 'claim-123' }])
        };
        vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByName').mockImplementation((name: string) => {
            if (name === 'TestClaim') {
                return createMockClaimType({
                    ID: '11111111-1111-1111-1111-111111111111',
                    Name: 'TestClaim',
                    DriverClass: 'MockDriver',
                    DefaultExpirationDays: 30,
                    IsActive: true
                });
            }
            return undefined;
        });

        vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByID').mockImplementation((id: string) => {
            if (id === '11111111-1111-1111-1111-111111111111') {
                return createMockClaimType({
                    ID: '11111111-1111-1111-1111-111111111111',
                    Name: 'TestClaim',
                    DriverClass: 'MockDriver',
                    DefaultExpirationDays: 30,
                    IsActive: true
                });
            }
            return undefined;
        });

        vi.spyOn(IdentityClaimEngine.Instance, 'GetDriverInstance').mockReturnValue(mockDriver);
    });

    it('should normalize email addresses properly', () => {
        const engine = IdentityClaimEngineServer.Instance;
        expect(engine.NormalizeEmail('  User@Example.COM ')).toBe('user@example.com');
        expect(engine.NormalizeEmail('')).toBe('');
    });

    it('should create a claim and invoke driver OnCreate', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim();

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const result = await engine.CreateClaim({
            ClaimTypeName: 'TestClaim',
            NormalizedEmail: ' Claimant@Example.COM ',
            SendEmail: false
        });

        expect(result).toBeDefined();
        expect(mockClaim.Save).toHaveBeenCalled();
        expect(mockDriver.onCreateCalled).toBe(true);
    });

    it('should resolve EntityName to GUID when creating a claim', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim();

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);
        Object.defineProperty(Metadata.prototype, 'Entities', {
            get: () => [{ ID: '22222222-2222-2222-2222-222222222222', Name: 'MJ: Orders' }],
            configurable: true
        });

        const result = await engine.CreateClaim({
            ClaimTypeName: 'TestClaim',
            NormalizedEmail: 'claimant@example.com',
            EntityID: 'MJ: Orders',
            SendEmail: false
        });

        expect(result).toBeDefined();
        expect(mockClaim.EntityID).toBe('22222222-2222-2222-2222-222222222222');
    });

    it('should throw early error when an invalid entity name is supplied', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        Object.defineProperty(Metadata.prototype, 'Entities', {
            get: () => [{ ID: '22222222-2222-2222-2222-222222222222', Name: 'MJ: Orders' }],
            configurable: true
        });

        await expect(engine.CreateClaim({
            ClaimTypeName: 'TestClaim',
            NormalizedEmail: 'claimant@example.com',
            EntityID: 'NonExistentEntity',
            SendEmail: false
        })).rejects.toThrow(/Invalid or unrecognized Entity name\/ID/);
    });

    it('should redeem a claim when user email matches NormalizedEmail', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            NormalizedEmail: 'claimant@example.com'
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const redeemResult = await engine.RedeemClaim('claim-123', createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }));
        expect(redeemResult.Success).toBe(true);
        expect(mockDriver.onClaimCalled).toBe(true);
        expect(mockClaim.Status).toBe('Claimed');
    });

    it('should redeem a claim when a valid bearer token is presented, even if user email differs', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const rawToken = 'super-secret-token-1234567890abcdef';
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('base64url');

        const mockClaim = createMockClaim({
            NormalizedEmail: 'claimant@example.com',
            MetadataJSON: JSON.stringify({ TokenHash: tokenHash })
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const redeemResult = await engine.RedeemClaim(
            'claim-123',
            createMockUser({ ID: 'user-456', Email: 'different@example.com' }),
            rawToken
        );
        expect(redeemResult.Success).toBe(true);
        expect(mockDriver.onClaimCalled).toBe(true);
        expect(mockClaim.Status).toBe('Claimed');
    });

    it('should reject redemption when user email does not match AND no valid token is provided', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            NormalizedEmail: 'claimant@example.com'
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const redeemResult = await engine.RedeemClaim(
            'claim-123',
            createMockUser({ ID: 'user-456', Email: 'attacker@example.com' })
        );
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('Authenticated user email does not match');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should reject redemption when an invalid token is presented', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const rawToken = 'correct-token';
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('base64url');

        const mockClaim = createMockClaim({
            NormalizedEmail: 'claimant@example.com',
            MetadataJSON: JSON.stringify({ TokenHash: tokenHash })
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const redeemResult = await engine.RedeemClaim(
            'claim-123',
            createMockUser({ ID: 'user-456', Email: 'attacker@example.com' }),
            'wrong-token'
        );
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('Authenticated user email does not match');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should reject redemption if claim status is not Pending', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            Status: 'Claimed'
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const redeemResult = await engine.RedeemClaim('claim-123', createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }));
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('Claim is no longer pending');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should reject and mark expired claims', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() - 86400000)
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const redeemResult = await engine.RedeemClaim('claim-123', createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }));
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('Claim has expired');
        expect(mockClaim.Status).toBe('Expired');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should reject second concurrent redemption when ExecuteSQL returns 0 rows', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            ID: 'claim-concurrent-1',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() + 86400000),
            NormalizedEmail: 'claimant@example.com'
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);
        
        let callCount = 0;
        const mockExecuteSQL = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve([{ ID: 'claim-concurrent-1' }]);
            }
            return Promise.resolve([]);
        });

        (Metadata as unknown as { Provider: unknown }).Provider = {
            PlatformKey: 'sqlserver',
            ExecuteSQL: mockExecuteSQL
        };

        const user = createMockUser({ ID: 'user-456', Email: 'claimant@example.com' });

        const [res1, res2] = await Promise.all([
            engine.RedeemClaim('claim-concurrent-1', user),
            engine.RedeemClaim('claim-concurrent-1', user)
        ]);

        const successCount = (res1.Success ? 1 : 0) + (res2.Success ? 1 : 0);
        expect(successCount).toBe(1);
        expect(mockExecuteSQL.mock.calls[0][0]).toContain("[Status] = 'Pending'");
        expect(mockDriver.onClaimCallCount).toBe(1);
    });

    it('should revoke a claim and invoke driver OnRevoke', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            Status: 'Pending'
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        await engine.RevokeClaim('claim-123');
        expect(mockClaim.Status).toBe('Revoked');
        expect(mockDriver.onRevokeCalled).toBe(true);
    });
});
