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
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';

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
    /**
     * RedeemClaim now REQUIRES a provider, and reads entities plus executes the CAS through it.
     * GetEntityObject delegates to a real Metadata instance so the existing
     * `vi.spyOn(Metadata.prototype, 'GetEntityObject')` stubs in each test keep working.
     */
    let testProvider: IMetadataProvider;

    beforeEach(() => {
        // This suite's vitest config does not set restoreMocks, and several tests spy on the
        // SINGLETON engine's own methods (RedeemClaim, GetPendingClaimsForEmail). Without an
        // explicit restore, a leaked instance spy silently replaces the real implementation
        // for every later test in the file.
        vi.restoreAllMocks();
        mockDriver = new MockDriver();
        testProvider = {
            PlatformKey: 'sqlserver',
            ExecuteSQL: vi.fn().mockResolvedValue([{ ID: 'claim-123' }]),
            Entities: [],
            GetEntityObject: (entityName: string, user?: UserInfo) => new Metadata().GetEntityObject(entityName, user)
        } as unknown as IMetadataProvider;
        (Metadata as unknown as { Provider: unknown }).Provider = testProvider;
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

        const redeemResult = await engine.RedeemClaim('claim-123', createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }), testProvider);
        expect(redeemResult.Success).toBe(true);
        expect(mockDriver.onClaimCalled).toBe(true);
        expect(mockClaim.Status).toBe('Claimed');
    });

    it('should read the claim under the system user, not the redeeming user', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            NormalizedEmail: 'claimant@example.com'
        });

        const systemUser = createMockUser({ ID: 'system-user-000', Email: 'system@memberjunction.com' });
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);

        const getEntityObject = vi
            .spyOn(Metadata.prototype, 'GetEntityObject')
            .mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);
        // This suite's beforeEach does not restore mocks, so the prototype spy carries call
        // history from earlier tests. Clear it so the negative assertion below is about THIS
        // redemption rather than a structurally identical user from a previous one.
        getEntityObject.mockClear();

        const redeemingUser = createMockUser({ ID: 'user-456', Email: 'claimant@example.com' });
        const redeemResult = await engine.RedeemClaim('claim-123', redeemingUser, testProvider);

        expect(redeemResult.Success).toBe(true);
        // Row-level security applies to single-record loads, not just RunView. Loaded as the
        // redeeming user, a claim addressed to a different email — the exact case the bearer
        // token exists to serve — could never be loaded at all.
        expect(getEntityObject).toHaveBeenCalledWith('MJ: Identity Claims', systemUser);
        expect(getEntityObject).not.toHaveBeenCalledWith('MJ: Identity Claims', redeemingUser);
    });

    it('should fall back to the context user when the system user cache is unpopulated', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            NormalizedEmail: 'claimant@example.com'
        });

        // GetSystemUser() is typed UserInfo but returns undefined before the cache is refreshed.
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(undefined as unknown as UserInfo);

        const getEntityObject = vi
            .spyOn(Metadata.prototype, 'GetEntityObject')
            .mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const redeemingUser = createMockUser({ ID: 'user-456', Email: 'claimant@example.com' });
        const redeemResult = await engine.RedeemClaim('claim-123', redeemingUser, testProvider);

        expect(redeemResult.Success).toBe(true);
        expect(getEntityObject).toHaveBeenCalledWith('MJ: Identity Claims', redeemingUser);
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
            testProvider,
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
            createMockUser({ ID: 'user-456', Email: 'attacker@example.com' }),
            testProvider
        );
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('requires either a matching verified email');
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
            testProvider,
            'wrong-token'
        );
        expect(redeemResult.Success).toBe(false);
        expect(redeemResult.ErrorMessage).toContain('requires either a matching verified email');
        expect(mockDriver.onClaimCalled).toBe(false);
    });

    it('should reject redemption if claim status is not Pending', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            Status: 'Claimed'
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const redeemResult = await engine.RedeemClaim('claim-123', createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }), testProvider);
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

        const redeemResult = await engine.RedeemClaim('claim-123', createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }), testProvider);
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

        // The CAS executes through the provider PASSED to RedeemClaim, not the process global —
        // that is the point of the required-provider signature, so the mock goes here.
        (testProvider as unknown as { ExecuteSQL: unknown }).ExecuteSQL = mockExecuteSQL;

        const user = createMockUser({ ID: 'user-456', Email: 'claimant@example.com' });

        const [res1, res2] = await Promise.all([
            engine.RedeemClaim('claim-concurrent-1', user, testProvider),
            engine.RedeemClaim('claim-concurrent-1', user, testProvider)
        ]);

        const successCount = (res1.Success ? 1 : 0) + (res2.Success ? 1 : 0);
        expect(successCount).toBe(1);
        expect(mockExecuteSQL.mock.calls[0][0]).toContain("[Status] = 'Pending'");
        expect(mockDriver.onClaimCallCount).toBe(1);
    });

    it('should catch driver exceptions, un-consume the claim back to Pending, and return clean failure', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({
            ID: 'claim-err-1',
            NormalizedEmail: 'claimant@example.com'
        });

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        const mockExecuteSQL = vi.fn().mockImplementation((sql: string) => {
            if (sql.includes("[Status] = 'Claimed'") && sql.includes("[Status] = 'Pending'")) {
                // Initial CAS consume
                return Promise.resolve([{ ID: 'claim-err-1' }]);
            }
            if (sql.includes("[Status] = 'Pending'") && sql.includes("[Status] = 'Claimed'")) {
                // Revert un-consume
                return Promise.resolve([{ ID: 'claim-err-1' }]);
            }
            return Promise.resolve([{ ID: 'claim-err-1' }]);
        });

        // CAS + revert both execute through the provider passed to RedeemClaim.
        (testProvider as unknown as { ExecuteSQL: unknown }).ExecuteSQL = mockExecuteSQL;

        // Make driver throw
        mockDriver.OnClaim = vi.fn().mockRejectedValue(new Error('Transient downstream payment API timeout'));

        const user = createMockUser({ ID: 'user-456', Email: 'claimant@example.com' });
        const res = await engine.RedeemClaim('claim-err-1', user, testProvider);

        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toContain('downstream payment API timeout');
        // Verify revert SQL was executed
        const revertCall = mockExecuteSQL.mock.calls.find(c => c[0].includes("[Status] = 'Pending'") && c[0].includes("[Status] = 'Claimed'"));
        expect(revertCall).toBeDefined();
    });

    it('AutoClaimForUser redeems each pending claim through the full RedeemClaim gate', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const pending = [
            createMockClaim({ ID: 'claim-a', NormalizedEmail: 'claimant@example.com' }),
            createMockClaim({ ID: 'claim-b', NormalizedEmail: 'claimant@example.com' })
        ];

        vi.spyOn(engine, 'GetPendingClaimsForEmail').mockResolvedValue(
            pending as unknown as MJIdentityClaimEntity[]
        );
        const redeem = vi
            .spyOn(engine, 'RedeemClaim')
            .mockResolvedValue({ Success: true, Data: { Granted: true } });

        const user = createMockUser({ ID: 'user-456', Email: 'claimant@example.com' });
        const results = await engine.AutoClaimForUser(user, testProvider);

        expect(results).toHaveLength(2);
        // Each claim goes through RedeemClaim rather than being transitioned directly, so the
        // email/token gate, atomic CAS and driver error handling all still apply. The email
        // lookup that found them is a convenience, not the boundary. No token is ever presented
        // (auto-claim has none), and the transport's EmailVerified assertion is passed through.
        expect(redeem).toHaveBeenCalledWith('claim-a', user, testProvider, undefined, undefined);
        expect(redeem).toHaveBeenCalledWith('claim-b', user, testProvider, undefined, undefined);
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

    it('should NOT invoke driver OnRevoke when the revocation save fails', async () => {
        const engine = IdentityClaimEngineServer.Instance;
        const mockClaim = createMockClaim({ Status: 'Pending' });
        mockClaim.Save = vi.fn().mockResolvedValue(false);

        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

        await engine.RevokeClaim('claim-123');
        // The claim is still live in the database — running teardown against it would be wrong.
        expect(mockDriver.onRevokeCalled).toBe(false);
    });

    describe('IsActive enforcement', () => {
        it('CreateClaim refuses an inactive claim type', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByName').mockReturnValue(
                createMockClaimType({ IsActive: false })
            );

            await expect(engine.CreateClaim({
                ClaimTypeName: 'TestClaim',
                NormalizedEmail: 'claimant@example.com',
                SendEmail: false
            })).rejects.toThrow(/inactive/);
        });

        it('RedeemClaim refuses a claim whose type is inactive', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            const mockClaim = createMockClaim({ NormalizedEmail: 'claimant@example.com' });
            vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);
            vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByID').mockReturnValue(
                createMockClaimType({ IsActive: false })
            );

            const res = await engine.RedeemClaim('claim-123', createMockUser(), testProvider);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('inactive');
            expect(mockDriver.onClaimCalled).toBe(false);
        });
    });

    describe('email verification gate', () => {
        it('refuses email-match redemption when the IdP asserted the email is UNVERIFIED', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            const mockClaim = createMockClaim({ NormalizedEmail: 'claimant@example.com' });
            vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

            const res = await engine.RedeemClaim(
                'claim-123',
                createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }),
                testProvider,
                undefined,
                { EmailVerified: false }
            );
            expect(res.Success).toBe(false);
            expect(mockDriver.onClaimCalled).toBe(false);
        });

        it('still redeems via token when the email is unverified', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            const rawToken = 'verified-by-possession-token';
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('base64url');
            const mockClaim = createMockClaim({
                NormalizedEmail: 'claimant@example.com',
                MetadataJSON: JSON.stringify({ TokenHash: tokenHash })
            });
            vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

            const res = await engine.RedeemClaim(
                'claim-123',
                createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }),
                testProvider,
                rawToken,
                { EmailVerified: false }
            );
            expect(res.Success).toBe(true);
            expect(mockDriver.onClaimCalled).toBe(true);
        });

        it('allows email-match when verification state is unknown (backward compatible)', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            const mockClaim = createMockClaim({ NormalizedEmail: 'claimant@example.com' });
            vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);

            const res = await engine.RedeemClaim(
                'claim-123',
                createMockUser({ ID: 'user-456', Email: 'claimant@example.com' }),
                testProvider
            );
            expect(res.Success).toBe(true);
        });
    });

    describe('claim type Configuration gates', () => {
        it('RequireVerifiedEmail demands a positive IdP assertion for email-match', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            const mockClaim = createMockClaim({ NormalizedEmail: 'claimant@example.com' });
            vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);
            vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByID').mockReturnValue(
                createMockClaimType({ Configuration: JSON.stringify({ RequireVerifiedEmail: true }) } as Partial<MJIdentityClaimTypeEntity>)
            );

            // Unknown verification state → refused for this type
            const unknown = await engine.RedeemClaim('claim-123', createMockUser(), testProvider);
            expect(unknown.Success).toBe(false);

            // Positive assertion → allowed
            const verified = await engine.RedeemClaim('claim-123', createMockUser(), testProvider, undefined, { EmailVerified: true });
            expect(verified.Success).toBe(true);
        });

        it('RequireToken refuses email-match even with a verified email; token still works', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            const rawToken = 'required-token-abcdef';
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('base64url');
            const mockClaim = createMockClaim({
                NormalizedEmail: 'claimant@example.com',
                MetadataJSON: JSON.stringify({ TokenHash: tokenHash })
            });
            vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);
            vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByID').mockReturnValue(
                createMockClaimType({ Configuration: JSON.stringify({ RequireToken: true }) } as Partial<MJIdentityClaimTypeEntity>)
            );

            const emailOnly = await engine.RedeemClaim('claim-123', createMockUser(), testProvider, undefined, { EmailVerified: true });
            expect(emailOnly.Success).toBe(false);

            const withToken = await engine.RedeemClaim('claim-123', createMockUser(), testProvider, rawToken);
            expect(withToken.Success).toBe(true);
        });

        it('malformed Configuration JSON degrades to permissive defaults rather than bricking redemption', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            const mockClaim = createMockClaim({ NormalizedEmail: 'claimant@example.com' });
            vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(mockClaim as unknown as MJIdentityClaimEntity);
            vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByID').mockReturnValue(
                createMockClaimType({ Configuration: '{not valid json' } as Partial<MJIdentityClaimTypeEntity>)
            );

            const res = await engine.RedeemClaim('claim-123', createMockUser(), testProvider);
            expect(res.Success).toBe(true);
        });
    });

    describe('AutoClaimForUser type filtering', () => {
        it('skips types that opted out of auto-claim or that require a token', async () => {
            const engine = IdentityClaimEngineServer.Instance;
            const pending = [
                createMockClaim({ ID: 'claim-auto', ClaimTypeID: '11111111-1111-1111-1111-111111111111', NormalizedEmail: 'claimant@example.com' }),
                createMockClaim({ ID: 'claim-optout', ClaimTypeID: '33333333-3333-3333-3333-333333333333', NormalizedEmail: 'claimant@example.com' }),
                createMockClaim({ ID: 'claim-tokenreq', ClaimTypeID: '44444444-4444-4444-4444-444444444444', NormalizedEmail: 'claimant@example.com' })
            ];

            vi.spyOn(IdentityClaimEngine.Instance, 'GetClaimTypeByID').mockImplementation((id: string) => {
                if (id === '33333333-3333-3333-3333-333333333333') {
                    return createMockClaimType({ ID: id, Configuration: JSON.stringify({ AutoClaim: false }) } as Partial<MJIdentityClaimTypeEntity>);
                }
                if (id === '44444444-4444-4444-4444-444444444444') {
                    return createMockClaimType({ ID: id, Configuration: JSON.stringify({ RequireToken: true }) } as Partial<MJIdentityClaimTypeEntity>);
                }
                return createMockClaimType({ ID: id });
            });

            vi.spyOn(engine, 'GetPendingClaimsForEmail').mockResolvedValue(
                pending as unknown as MJIdentityClaimEntity[]
            );
            const redeem = vi
                .spyOn(engine, 'RedeemClaim')
                .mockResolvedValue({ Success: true });

            const user = createMockUser({ ID: 'user-456', Email: 'claimant@example.com' });
            const results = await engine.AutoClaimForUser(user, testProvider, { EmailVerified: true });

            expect(results).toHaveLength(1);
            expect(redeem).toHaveBeenCalledTimes(1);
            expect(redeem).toHaveBeenCalledWith('claim-auto', user, testProvider, undefined, { EmailVerified: true });
        });
    });
});
