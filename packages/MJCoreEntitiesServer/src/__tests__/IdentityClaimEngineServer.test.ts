import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import { IdentityClaimEngineServer } from '../engines/IdentityClaimEngineServer';
import { IdentityClaimEngine, BaseIdentityClaimDriver, ClaimContext, ClaimRedeemContext, ClaimResult } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

class MockDriver extends BaseIdentityClaimDriver {
    public onCreateCalled = false;
    public onClaimCalled = false;
    public onRevokeCalled = false;
    public onExpireCalled = false;
    public shouldFail = false;

    public async OnCreate(context: ClaimContext): Promise<void> {
        this.onCreateCalled = true;
    }

    public async OnClaim(context: ClaimRedeemContext): Promise<ClaimResult> {
        this.onClaimCalled = true;
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

describe('IdentityClaimEngineServer', () => {
    let mockDriver: MockDriver;

    beforeEach(() => {
        mockDriver = new MockDriver();
        vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByName').mockImplementation((name: string) => {
            if (name === 'TestClaim') {
                return {
                    ID: '11111111-1111-1111-1111-111111111111',
                    Name: 'TestClaim',
                    DriverClass: 'MockDriver',
                    DefaultExpirationDays: 30,
                    IsActive: true
                } as any;
            }
            return undefined;
        });

        vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByID').mockImplementation((id: string) => {
            if (id === '11111111-1111-1111-1111-111111111111') {
                return {
                    ID: '11111111-1111-1111-1111-111111111111',
                    Name: 'TestClaim',
                    DriverClass: 'MockDriver',
                    DefaultExpirationDays: 30,
                    IsActive: true
                } as any;
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
        
        let savedValues: Record<string, unknown> = {};
        const mockClaim = {
            NewRecord: vi.fn(),
            Set: vi.fn((k, v) => { savedValues[k] = v; }),
            Get: vi.fn((k) => savedValues[k]),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            NormalizedEmail: 'claimant@example.com',
            ExpiresAt: new Date(Date.now() + 86400000)
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

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
        
        const mockClaim = {
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            EntityID: null,
            NormalizedEmail: 'claimant@example.com',
            ExpiresAt: new Date(Date.now() + 86400000)
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);
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
        
        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() + 86400000),
            NormalizedEmail: 'claimant@example.com',
            MagicLinkInviteID: null,
            MetadataJSON: null
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        const redeemResult = await engine.RedeemClaim('claim-123', { ID: 'user-456', Email: 'claimant@example.com' } as any);
        expect(redeemResult.Success).toBe(true);
        expect(mockDriver.onClaimCalled).toBe(true);
        expect(mockClaim.Status).toBe('Claimed');
    });

    it('should redeem a claim when a valid bearer token is presented, even if user email differs', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const rawToken = 'super-secret-token-1234567890abcdef';
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('base64url');

        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() + 86400000),
            NormalizedEmail: 'claimant@example.com',
            MagicLinkInviteID: null,
            MetadataJSON: JSON.stringify({ TokenHash: tokenHash })
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        const redeemResult = await engine.RedeemClaim(
            'claim-123',
            { ID: 'user-456', Email: 'different@example.com' } as any,
            rawToken
        );
        expect(redeemResult.Success).toBe(true);
        expect(mockDriver.onClaimCalled).toBe(true);
        expect(mockClaim.Status).toBe('Claimed');
    });

    it('should reject redemption when user email does not match AND no valid token is provided', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() + 86400000),
            NormalizedEmail: 'claimant@example.com',
            MagicLinkInviteID: null,
            MetadataJSON: null
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        const redeemResult = await engine.RedeemClaim(
            'claim-123',
            { ID: 'user-456', Email: 'attacker@example.com' } as any
        );
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('Authenticated user email does not match');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should reject redemption when an invalid token is presented', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const rawToken = 'correct-token';
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('base64url');

        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() + 86400000),
            NormalizedEmail: 'claimant@example.com',
            MagicLinkInviteID: null,
            MetadataJSON: JSON.stringify({ TokenHash: tokenHash })
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        const redeemResult = await engine.RedeemClaim(
            'claim-123',
            { ID: 'user-456', Email: 'attacker@example.com' } as any,
            'wrong-token'
        );
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('Authenticated user email does not match');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should reject redemption if claim status is not Pending', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Claimed',
            ExpiresAt: new Date(Date.now() + 86400000),
            NormalizedEmail: 'claimant@example.com'
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        const redeemResult = await engine.RedeemClaim('claim-123', { ID: 'user-456', Email: 'claimant@example.com' } as any);
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('Claim is no longer pending');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should reject and mark expired claims', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() - 86400000), // in the past
            NormalizedEmail: 'claimant@example.com'
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        const redeemResult = await engine.RedeemClaim('claim-123', { ID: 'user-456', Email: 'claimant@example.com' } as any);
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('Claim has expired');
        expect(mockClaim.Status).toBe('Expired');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should revert status to Pending if driver OnClaim fails', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        mockDriver.shouldFail = true;

        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() + 86400000),
            NormalizedEmail: 'claimant@example.com',
            ClaimedAt: null as Date | null,
            ClaimedByUserID: null as string | null
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        const redeemResult = await engine.RedeemClaim('claim-123', { ID: 'user-456', Email: 'claimant@example.com' } as any);
        expect(redeemResult.Success).toBe(false);
        expect(mockClaim.Status).toBe('Pending');
        expect(mockClaim.ClaimedAt).toBeNull();
        expect(mockClaim.ClaimedByUserID).toBeNull();
    });

    it('should revoke a claim and invoke driver OnRevoke', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending'
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        await engine.RevokeClaim('claim-123');
        expect(mockClaim.Status).toBe('Revoked');
        expect(mockDriver.onRevokeCalled).toBe(true);
    });
});
