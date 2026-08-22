import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdentityClaimEngineServer } from '../engines/IdentityClaimEngineServer';
import { IdentityClaimEngine, BaseIdentityClaimDriver, ClaimContext, ClaimRedeemContext, ClaimResult } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

class MockDriver extends BaseIdentityClaimDriver {
    public onCreateCalled = false;
    public onClaimCalled = false;
    public onRevokeCalled = false;
    public onExpireCalled = false;

    public async OnCreate(context: ClaimContext): Promise<void> {
        this.onCreateCalled = true;
    }

    public async OnClaim(context: ClaimRedeemContext): Promise<ClaimResult> {
        this.onClaimCalled = true;
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

    it('should redeem a claim and invoke driver OnClaim', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        
        const mockClaim = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            ID: 'claim-123',
            ClaimTypeID: '11111111-1111-1111-1111-111111111111',
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() + 86400000),
            NormalizedEmail: 'claimant@example.com',
            MagicLinkInviteID: null
        };

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as any);

        const redeemResult = await engine.RedeemClaim('claim-123', { ID: 'user-456' } as any);
        expect(redeemResult.Success).toBe(true);
        expect(mockDriver.onClaimCalled).toBe(true);
        expect(mockClaim.Status).toBe('Claimed');
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
