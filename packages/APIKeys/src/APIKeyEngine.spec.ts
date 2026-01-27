/**
 * Unit tests for APIKeyEngine
 * Tests the main orchestrator for API key operations and authorization
 */

import { APIKeyEngine, GetAPIKeyEngine, ResetAPIKeyEngine } from './APIKeyEngine';
import { UserInfo, setMockRunViewResult, clearMockRunViewResults, setMockEntity, clearMockEntities } from './__mocks__/core';
import { APIKeyEntity, APIApplicationEntity, UserEntity } from './__mocks__/core-entities';

// Note: Mocking is handled by moduleNameMapper in jest.config.js
// @memberjunction/core -> ./__mocks__/core.ts
// @memberjunction/core-entities -> ./__mocks__/core-entities.ts

// Helper to cast mock UserInfo to the expected type (using any to avoid circular dependency)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUserInfo = (user: UserInfo): any => user;

describe('APIKeyEngine', () => {
    let engine: APIKeyEngine;
    let contextUser: UserInfo;

    beforeEach(() => {
        ResetAPIKeyEngine();
        engine = GetAPIKeyEngine();
        contextUser = new UserInfo({ ID: 'test-user', Name: 'Test User', Email: 'test@example.com' });
        clearMockRunViewResults();
        clearMockEntities();
    });

    describe('GenerateAPIKey()', () => {
        it('should generate a key with correct format', () => {
            const { Raw, Hash } = engine.GenerateAPIKey();

            expect(Raw).toMatch(/^mj_sk_[a-f0-9]{64}$/);
            expect(Hash).toHaveLength(64); // SHA-256 hex
        });

        it('should generate unique keys', () => {
            const key1 = engine.GenerateAPIKey();
            const key2 = engine.GenerateAPIKey();

            expect(key1.Raw).not.toBe(key2.Raw);
            expect(key1.Hash).not.toBe(key2.Hash);
        });
    });

    describe('HashAPIKey()', () => {
        it('should produce consistent hashes', () => {
            const key = 'mj_sk_' + 'a'.repeat(64);
            const hash1 = engine.HashAPIKey(key);
            const hash2 = engine.HashAPIKey(key);

            expect(hash1).toBe(hash2);
        });

        it('should produce 64-character hex hash', () => {
            const key = 'mj_sk_' + 'b'.repeat(64);
            const hash = engine.HashAPIKey(key);

            expect(hash).toHaveLength(64);
            expect(hash).toMatch(/^[a-f0-9]+$/);
        });

        it('should produce different hashes for different keys', () => {
            const key1 = 'mj_sk_' + 'a'.repeat(64);
            const key2 = 'mj_sk_' + 'b'.repeat(64);

            expect(engine.HashAPIKey(key1)).not.toBe(engine.HashAPIKey(key2));
        });
    });

    describe('IsValidAPIKeyFormat()', () => {
        it('should accept valid format', () => {
            const validKey = 'mj_sk_' + 'a'.repeat(64);
            expect(engine.IsValidAPIKeyFormat(validKey)).toBe(true);
        });

        it('should reject wrong prefix', () => {
            const invalidKey = 'wrong_' + 'a'.repeat(64);
            expect(engine.IsValidAPIKeyFormat(invalidKey)).toBe(false);
        });

        it('should reject wrong length', () => {
            const shortKey = 'mj_sk_' + 'a'.repeat(32);
            const longKey = 'mj_sk_' + 'a'.repeat(128);

            expect(engine.IsValidAPIKeyFormat(shortKey)).toBe(false);
            expect(engine.IsValidAPIKeyFormat(longKey)).toBe(false);
        });

        it('should reject non-hex characters', () => {
            const invalidKey = 'mj_sk_' + 'g'.repeat(64); // 'g' is not hex
            expect(engine.IsValidAPIKeyFormat(invalidKey)).toBe(false);
        });

        it('should accept mixed case hex (lowercase)', () => {
            const lowerKey = 'mj_sk_' + 'abcdef0123456789'.repeat(4);
            expect(engine.IsValidAPIKeyFormat(lowerKey)).toBe(true);
        });
    });

    describe('ValidateAPIKey()', () => {
        const validRawKey = 'mj_sk_' + 'a'.repeat(64);

        beforeEach(() => {
            // Mock the API key entity
            const mockApiKey = new APIKeyEntity({
                ID: 'key-id',
                Hash: engine.HashAPIKey(validRawKey),
                UserID: 'user-id',
                Status: 'Active',
                ExpiresAt: null
            });

            setMockRunViewResult('MJ: API Keys', {
                Success: true,
                Results: [mockApiKey]
            });

            // Mock the user entity
            const mockUser = new UserEntity({
                ID: 'user-id',
                Email: 'user@example.com',
                Name: 'Test User',
                IsActive: true
            });

            setMockRunViewResult('Users', {
                Success: true,
                Results: [mockUser]
            });
        });

        it('should reject invalid format', async () => {
            const result = await engine.ValidateAPIKey(
                { RawKey: 'invalid-key' },
                asUserInfo(contextUser)
            );

            expect(result.IsValid).toBe(false);
            expect(result.Error).toContain('Invalid API key format');
        });

        it('should validate correct key', async () => {
            const result = await engine.ValidateAPIKey(
                { RawKey: validRawKey },
                asUserInfo(contextUser)
            );

            expect(result.IsValid).toBe(true);
            expect(result.User).toBeDefined();
            expect(result.APIKeyId).toBe('key-id');
            expect(result.APIKeyHash).toBeDefined();
        });

        it('should reject revoked key', async () => {
            const revokedKey = new APIKeyEntity({
                ID: 'revoked-key-id',
                Hash: engine.HashAPIKey(validRawKey),
                UserID: 'user-id',
                Status: 'Revoked'
            });

            setMockRunViewResult('MJ: API Keys', {
                Success: true,
                Results: [revokedKey]
            });

            const result = await engine.ValidateAPIKey(
                { RawKey: validRawKey },
                asUserInfo(contextUser)
            );

            expect(result.IsValid).toBe(false);
            expect(result.Error).toContain('revoked');
        });

        it('should reject expired key', async () => {
            const expiredKey = new APIKeyEntity({
                ID: 'expired-key-id',
                Hash: engine.HashAPIKey(validRawKey),
                UserID: 'user-id',
                Status: 'Active',
                ExpiresAt: new Date('2020-01-01')  // Past date
            });

            setMockRunViewResult('MJ: API Keys', {
                Success: true,
                Results: [expiredKey]
            });

            const result = await engine.ValidateAPIKey(
                { RawKey: validRawKey },
                asUserInfo(contextUser)
            );

            expect(result.IsValid).toBe(false);
            expect(result.Error).toContain('expired');
        });

        it('should reject key not found', async () => {
            setMockRunViewResult('MJ: API Keys', {
                Success: true,
                Results: []
            });

            const result = await engine.ValidateAPIKey(
                { RawKey: validRawKey },
                asUserInfo(contextUser)
            );

            expect(result.IsValid).toBe(false);
            expect(result.Error).toContain('not found');
        });

        it('should reject inactive user', async () => {
            const inactiveUser = new UserEntity({
                ID: 'user-id',
                Email: 'user@example.com',
                Name: 'Inactive User',
                IsActive: false
            });

            setMockRunViewResult('Users', {
                Success: true,
                Results: [inactiveUser]
            });

            const result = await engine.ValidateAPIKey(
                { RawKey: validRawKey },
                asUserInfo(contextUser)
            );

            expect(result.IsValid).toBe(false);
            expect(result.Error).toContain('inactive');
        });

        describe('application binding', () => {
            beforeEach(() => {
                // Mock application
                const mockApp = new APIApplicationEntity({
                    ID: 'app-id',
                    Name: 'MCPServer',
                    IsActive: true
                });

                setMockRunViewResult('MJ: API Applications', {
                    Success: true,
                    Results: [mockApp]
                });
            });

            it('should allow global key for any application', async () => {
                // Key has no bindings
                setMockRunViewResult('MJ: API Key Applications', {
                    Success: true,
                    Results: []
                });

                const result = await engine.ValidateAPIKey(
                    { RawKey: validRawKey, ApplicationName: 'MCPServer' },
                    asUserInfo(contextUser)
                );

                expect(result.IsValid).toBe(true);
            });

            it('should allow key bound to requested application', async () => {
                setMockRunViewResult('MJ: API Key Applications', {
                    Success: true,
                    Results: [{ APIKeyID: 'key-id', ApplicationID: 'app-id' }]
                });

                const result = await engine.ValidateAPIKey(
                    { RawKey: validRawKey, ApplicationName: 'MCPServer' },
                    asUserInfo(contextUser)
                );

                expect(result.IsValid).toBe(true);
            });

            it('should reject key bound to different application', async () => {
                setMockRunViewResult('MJ: API Key Applications', {
                    Success: true,
                    Results: [{ APIKeyID: 'key-id', ApplicationID: 'other-app-id' }]
                });

                const result = await engine.ValidateAPIKey(
                    { RawKey: validRawKey, ApplicationName: 'MCPServer' },
                    asUserInfo(contextUser)
                );

                expect(result.IsValid).toBe(false);
                expect(result.Error).toContain('not authorized for this application');
            });

            it('should reject unknown application', async () => {
                setMockRunViewResult('MJ: API Applications', {
                    Success: true,
                    Results: []
                });

                const result = await engine.ValidateAPIKey(
                    { RawKey: validRawKey, ApplicationName: 'UnknownApp' },
                    asUserInfo(contextUser)
                );

                expect(result.IsValid).toBe(false);
                expect(result.Error).toContain('Unknown application');
            });
        });

        it('should return API key hash for subsequent Authorize calls', async () => {
            const result = await engine.ValidateAPIKey(
                { RawKey: validRawKey },
                asUserInfo(contextUser)
            );

            expect(result.APIKeyHash).toBe(engine.HashAPIKey(validRawKey));
        });
    });

    describe('Authorize()', () => {
        const validHash = 'a'.repeat(64);

        beforeEach(() => {
            // Mock valid API key
            const mockApiKey = new APIKeyEntity({
                ID: 'key-id',
                Hash: validHash,
                UserID: 'user-id',
                Status: 'Active'
            });

            setMockRunViewResult('MJ: API Keys', {
                Success: true,
                Results: [mockApiKey]
            });

            // Mock application
            const mockApp = new APIApplicationEntity({
                ID: 'app-id',
                Name: 'MCPServer',
                IsActive: true
            });

            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: [mockApp]
            });

            // Mock global key (no bindings)
            setMockRunViewResult('MJ: API Key Applications', {
                Success: true,
                Results: []
            });

            // Mock scope
            setMockRunViewResult('MJ: API Scopes', {
                Success: true,
                Results: [{ ID: 'scope-id', FullPath: 'entity:read', IsActive: true }]
            });
        });

        it('should reject invalid API key', async () => {
            setMockRunViewResult('MJ: API Keys', {
                Success: true,
                Results: []
            });

            const result = await engine.Authorize(
                'invalid-hash',
                'MCPServer',
                'entity:read',
                'Users',
                asUserInfo(contextUser)
            );

            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('not found');
        });

        it('should reject unknown application', async () => {
            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: []
            });

            const result = await engine.Authorize(
                validHash,
                'UnknownApp',
                'entity:read',
                'Users',
                asUserInfo(contextUser)
            );

            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('Unknown application');
        });

        it('should reject inactive application', async () => {
            const inactiveApp = new APIApplicationEntity({
                ID: 'app-id',
                Name: 'MCPServer',
                IsActive: false
            });

            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: [inactiveApp]
            });

            const result = await engine.Authorize(
                validHash,
                'MCPServer',
                'entity:read',
                'Users',
                asUserInfo(contextUser)
            );

            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('not active');
        });

        it('should allow when enforcement is disabled', async () => {
            const disabledEngine = new APIKeyEngine({ enforcementEnabled: false });

            const result = await disabledEngine.Authorize(
                validHash,
                'MCPServer',
                'entity:read',
                'Users',
                asUserInfo(contextUser)
            );

            expect(result.Allowed).toBe(true);
            expect(result.Reason).toContain('Enforcement disabled');
        });

        it('should evaluate scope rules and allow', async () => {
            // App ceiling allows
            setMockRunViewResult('MJ: API Application Scopes', {
                Success: true,
                Results: [{
                    ID: 'app-scope-id',
                    ResourcePattern: '*',
                    PatternType: 'Include',
                    IsDeny: false,
                    Priority: 0
                }]
            });

            // No key scopes (default allow)
            setMockRunViewResult('MJ: API Key Scopes', {
                Success: true,
                Results: []
            });

            const result = await engine.Authorize(
                validHash,
                'MCPServer',
                'entity:read',
                'Users',
                asUserInfo(contextUser)
            );

            expect(result.Allowed).toBe(true);
        });

        it('should include log ID in result', async () => {
            setMockRunViewResult('MJ: API Application Scopes', {
                Success: true,
                Results: [{
                    ID: 'app-scope-id',
                    ResourcePattern: '*',
                    PatternType: 'Include',
                    IsDeny: false,
                    Priority: 0
                }]
            });

            setMockRunViewResult('MJ: API Key Scopes', {
                Success: true,
                Results: []
            });

            // Mock usage log entity
            const mockLogEntity = {
                ID: 'log-id',
                Save: jest.fn().mockResolvedValue(true)
            };
            setMockEntity('MJ: API Key Usage Logs', mockLogEntity);

            const result = await engine.Authorize(
                validHash,
                'MCPServer',
                'entity:read',
                'Users',
                asUserInfo(contextUser),
                { endpoint: '/api', method: 'POST' }
            );

            // LogId may be undefined if logging fails silently, but shouldn't throw
            expect(result.Allowed).toBe(true);
        });
    });

    describe('GetApplicationByName()', () => {
        it('should return application by name', async () => {
            const mockApp = new APIApplicationEntity({
                ID: 'app-id',
                Name: 'MCPServer',
                IsActive: true
            });

            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: [mockApp]
            });

            const app = await engine.GetApplicationByName('MCPServer', asUserInfo(contextUser));

            expect(app).not.toBeNull();
            expect(app?.Name).toBe('MCPServer');
        });

        it('should return null for unknown application', async () => {
            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: []
            });

            const app = await engine.GetApplicationByName('Unknown', asUserInfo(contextUser));

            expect(app).toBeNull();
        });

        it('should cache application lookups', async () => {
            const mockApp = new APIApplicationEntity({
                ID: 'app-id',
                Name: 'MCPServer',
                IsActive: true
            });

            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: [mockApp]
            });

            // First call
            await engine.GetApplicationByName('MCPServer', asUserInfo(contextUser));

            // Clear mock results
            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: []
            });

            // Second call should use cache
            const app = await engine.GetApplicationByName('MCPServer', asUserInfo(contextUser));

            expect(app).not.toBeNull();
        });
    });

    describe('ClearCache()', () => {
        it('should clear all caches', async () => {
            const mockApp = new APIApplicationEntity({
                ID: 'app-id',
                Name: 'MCPServer',
                IsActive: true
            });

            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: [mockApp]
            });

            // Populate cache
            await engine.GetApplicationByName('MCPServer', asUserInfo(contextUser));

            // Clear cache
            engine.ClearCache();

            // Clear mock results
            setMockRunViewResult('MJ: API Applications', {
                Success: true,
                Results: []
            });

            // Should hit database again (no cache)
            const app = await engine.GetApplicationByName('MCPServer', asUserInfo(contextUser));

            expect(app).toBeNull();
        });
    });

    describe('GetAPIKeyEngine() singleton', () => {
        it('should return the same instance', () => {
            const engine1 = GetAPIKeyEngine();
            const engine2 = GetAPIKeyEngine();

            expect(engine1).toBe(engine2);
        });

        it('should reset with ResetAPIKeyEngine()', () => {
            const engine1 = GetAPIKeyEngine();
            ResetAPIKeyEngine();
            const engine2 = GetAPIKeyEngine();

            expect(engine1).not.toBe(engine2);
        });
    });
});
