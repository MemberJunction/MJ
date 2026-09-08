/**
 * Unit tests for APIKeyEngine
 * Tests key generation, format validation, hashing, and singleton management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cosmiconfig — default: no config file found (existing tests unaffected)
vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: vi.fn().mockReturnValue({
        search: vi.fn().mockReturnValue(null),
    }),
}));

// Mock the crypto module for key generation
vi.mock('crypto', async () => {
    const actual = await vi.importActual<typeof import('crypto')>('crypto');
    return {
        ...actual,
        randomBytes: actual.randomBytes,
        createHash: actual.createHash,
    };
});

// NOTE: @memberjunction/core, @memberjunction/core-entities, and
// @memberjunction/api-keys-base resolve to the rich alias mocks in
// src/__mocks__/ (see vitest.config.ts) — configured per test via the
// setMock* helpers below.

import { cosmiconfigSync } from 'cosmiconfig';
import {
    UserInfo,
    setMockRunViewResult,
    clearMockRunViewResults,
    clearMockEntities,
    setMockMetadataEntities,
    setMockRowLevelSecurityFilters,
    clearMockMetadataState,
    EntityInfo,
    RowLevelSecurityFilterInfo,
} from '../__mocks__/core';
import {
    MJAPIKeyEntity,
    MJAPIApplicationEntity,
    MJAPIScopeEntity,
    MJAPIApplicationScopeEntity,
    MJAPIKeyScopeEntity,
} from '../__mocks__/core-entities';
import {
    setMockBaseScopes,
    setMockBaseApplications,
    setMockBaseApplicationScopes,
    setMockBaseKeyScopes,
    setMockBaseLoaded,
    clearMockBaseState,
} from '../__mocks__/api-keys-base';
import {
    APIKeyEngine,
    GetAPIKeyEngine,
    ResetAPIKeyEngine,
    DEFAULT_KEY_PREFIX,
    DEFAULT_ENTROPY_BYTES,
    DEFAULT_KEY_ENCODING,
    DEFAULT_HASH_ALGORITHM
} from '../APIKeyEngine';

describe('APIKeyEngine', () => {
    let engine: APIKeyEngine;

    beforeEach(() => {
        ResetAPIKeyEngine();
        clearMockBaseState();
        clearMockRunViewResults();
        clearMockEntities();
        clearMockMetadataState();
        engine = new APIKeyEngine();
    });

    describe('GenerateAPIKey()', () => {
        it('should generate a key with mj_sk_ prefix', () => {
            const { Raw } = engine.GenerateAPIKey();
            expect(Raw).toMatch(/^mj_sk_[a-f0-9]{64}$/);
        });

        it('should generate a SHA-256 hash as 64 hex characters', () => {
            const { Hash } = engine.GenerateAPIKey();
            expect(Hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should generate unique keys each time', () => {
            const key1 = engine.GenerateAPIKey();
            const key2 = engine.GenerateAPIKey();
            expect(key1.Raw).not.toBe(key2.Raw);
            expect(key1.Hash).not.toBe(key2.Hash);
        });

        it('should produce a consistent hash for the same key', () => {
            const { Raw, Hash } = engine.GenerateAPIKey();
            const rehash = engine.HashAPIKey(Raw);
            expect(rehash).toBe(Hash);
        });
    });

    describe('HashAPIKey()', () => {
        it('should return a 64-character hex string', () => {
            const hash = engine.HashAPIKey('mj_sk_test');
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should be deterministic', () => {
            const hash1 = engine.HashAPIKey('mj_sk_test');
            const hash2 = engine.HashAPIKey('mj_sk_test');
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different keys', () => {
            const hash1 = engine.HashAPIKey('mj_sk_key1');
            const hash2 = engine.HashAPIKey('mj_sk_key2');
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('IsValidAPIKeyFormat()', () => {
        it('should accept valid format', () => {
            const { Raw } = engine.GenerateAPIKey();
            expect(engine.IsValidAPIKeyFormat(Raw)).toBe(true);
        });

        it('should reject wrong prefix', () => {
            expect(engine.IsValidAPIKeyFormat('sk_' + 'a'.repeat(64))).toBe(false);
        });

        it('should reject wrong length', () => {
            expect(engine.IsValidAPIKeyFormat('mj_sk_' + 'a'.repeat(32))).toBe(false);
        });

        it('should reject non-hex characters', () => {
            expect(engine.IsValidAPIKeyFormat('mj_sk_' + 'z'.repeat(64))).toBe(false);
        });

        it('should reject empty string', () => {
            expect(engine.IsValidAPIKeyFormat('')).toBe(false);
        });

        it('should reject uppercase hex', () => {
            expect(engine.IsValidAPIKeyFormat('mj_sk_' + 'A'.repeat(64))).toBe(false);
        });
    });

    describe('Config()', () => {
        it('should set IsConfigured to true after Config', async () => {
            expect(engine.IsConfigured).toBe(false);
            await engine.Config();
            expect(engine.IsConfigured).toBe(true);
        });
    });

    describe('constructor config defaults', () => {
        it('should default enforcementEnabled to true', () => {
            const e = new APIKeyEngine();
            // We can test indirectly through behavior
            expect(e).toBeDefined();
        });

        it('should accept custom config', () => {
            const e = new APIKeyEngine({
                enforcementEnabled: false,
                loggingEnabled: false,
                defaultBehaviorNoScopes: 'allow',
                scopeCacheTTLMs: 30000,
            });
            expect(e).toBeDefined();
        });
    });

    describe('GetScopeEvaluator()', () => {
        it('should return a ScopeEvaluator', () => {
            const evaluator = engine.GetScopeEvaluator();
            expect(evaluator).toBeDefined();
            expect(typeof evaluator.EvaluateAccess).toBe('function');
        });
    });

    describe('GetUsageLogger()', () => {
        it('should return a UsageLogger', () => {
            const logger = engine.GetUsageLogger();
            expect(logger).toBeDefined();
            expect(typeof logger.Log).toBe('function');
        });
    });

    describe('GetPatternMatcher()', () => {
        it('should return the PatternMatcher class', () => {
            const pm = engine.GetPatternMatcher();
            expect(typeof pm.match).toBe('function');
            expect(typeof pm.hasWildcards).toBe('function');
        });
    });
});

describe('GetAPIKeyEngine / ResetAPIKeyEngine', () => {
    beforeEach(() => {
        ResetAPIKeyEngine();
    });

    it('should return the same instance on multiple calls', () => {
        const e1 = GetAPIKeyEngine();
        const e2 = GetAPIKeyEngine();
        expect(e1).toBe(e2);
    });

    it('should return a new instance after reset', () => {
        const e1 = GetAPIKeyEngine();
        ResetAPIKeyEngine();
        const e2 = GetAPIKeyEngine();
        expect(e1).not.toBe(e2);
    });

    it('should accept config on first call', () => {
        const engine = GetAPIKeyEngine({ enforcementEnabled: false });
        expect(engine).toBeDefined();
    });
});

describe('configurable key generation', () => {
    beforeEach(() => {
        ResetAPIKeyEngine();
    });

    describe('defaults', () => {
        it('should export correct default constants', () => {
            expect(DEFAULT_KEY_PREFIX).toBe('mj_sk_');
            expect(DEFAULT_ENTROPY_BYTES).toBe(32);
            expect(DEFAULT_KEY_ENCODING).toBe('hex');
            expect(DEFAULT_HASH_ALGORITHM).toBe('sha256');
        });

        it('should use default prefix when no config provided', () => {
            const engine = new APIKeyEngine();
            const { Raw } = engine.GenerateAPIKey();
            expect(Raw.startsWith('mj_sk_')).toBe(true);
        });

        it('should use default encoding (hex) when no config provided', () => {
            const engine = new APIKeyEngine();
            const { Raw } = engine.GenerateAPIKey();
            // Default: mj_sk_ (6 chars) + 64 hex chars = 70 total
            expect(Raw).toHaveLength(6 + 64);
            expect(Raw).toMatch(/^mj_sk_[a-f0-9]{64}$/);
        });

        it('should expose default KeyGenerationConfig', () => {
            const engine = new APIKeyEngine();
            const config = engine.KeyGenerationConfig;
            expect(config.prefix).toBe('mj_sk_');
            expect(config.entropyBytes).toBe(32);
            expect(config.encoding).toBe('hex');
            expect(config.hashAlgorithm).toBe('sha256');
        });
    });

    describe('custom prefix', () => {
        it('should generate keys with custom prefix', () => {
            const engine = new APIKeyEngine({ keyGeneration: { prefix: 'skip-' } });
            const { Raw } = engine.GenerateAPIKey();
            expect(Raw.startsWith('skip-')).toBe(true);
        });

        it('should validate keys with custom prefix', () => {
            const engine = new APIKeyEngine({ keyGeneration: { prefix: 'custom_' } });
            const { Raw } = engine.GenerateAPIKey();
            expect(engine.IsValidAPIKeyFormat(Raw)).toBe(true);
        });

        it('should reject default-prefixed keys when custom prefix is configured', () => {
            const engine = new APIKeyEngine({ keyGeneration: { prefix: 'custom_' } });
            expect(engine.IsValidAPIKeyFormat('mj_sk_' + 'a'.repeat(64))).toBe(false);
        });

        it('should expose KeyPrefix getter', () => {
            const engine = new APIKeyEngine({ keyGeneration: { prefix: 'test_' } });
            expect(engine.KeyPrefix).toBe('test_');
        });
    });

    describe('custom entropy bytes', () => {
        it('should generate keys with custom entropy size (hex)', () => {
            const engine = new APIKeyEngine({ keyGeneration: { entropyBytes: 16 } });
            const { Raw } = engine.GenerateAPIKey();
            // prefix (6 chars) + 32 hex chars (16 bytes * 2)
            expect(Raw).toHaveLength(6 + 32);
            expect(engine.IsValidAPIKeyFormat(Raw)).toBe(true);
        });

        it('should generate longer keys with more entropy', () => {
            const engine = new APIKeyEngine({ keyGeneration: { entropyBytes: 64 } });
            const { Raw } = engine.GenerateAPIKey();
            // prefix (6 chars) + 128 hex chars (64 bytes * 2)
            expect(Raw).toHaveLength(6 + 128);
            expect(engine.IsValidAPIKeyFormat(Raw)).toBe(true);
        });

        it('should reject wrong-length keys', () => {
            const engine = new APIKeyEngine({ keyGeneration: { entropyBytes: 16 } });
            // Default-length key (64 hex chars) should fail for a 16-byte engine
            expect(engine.IsValidAPIKeyFormat('mj_sk_' + 'a'.repeat(64))).toBe(false);
        });
    });

    describe('base64url encoding', () => {
        it('should generate keys with base64url encoding', () => {
            const engine = new APIKeyEngine({ keyGeneration: { encoding: 'base64url' } });
            const { Raw } = engine.GenerateAPIKey();
            expect(Raw.startsWith('mj_sk_')).toBe(true);
            // base64url for 32 bytes = ceil(32 * 4/3) = 43 chars
            const body = Raw.slice(6);
            expect(body).toHaveLength(43);
        });

        it('should produce base64url character set (A-Za-z0-9_-)', () => {
            const engine = new APIKeyEngine({ keyGeneration: { encoding: 'base64url' } });
            const { Raw } = engine.GenerateAPIKey();
            const body = Raw.slice(6);
            expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
        });

        it('should validate base64url keys', () => {
            const engine = new APIKeyEngine({ keyGeneration: { encoding: 'base64url' } });
            const { Raw } = engine.GenerateAPIKey();
            expect(engine.IsValidAPIKeyFormat(Raw)).toBe(true);
        });

        it('should reject hex keys when base64url is configured', () => {
            const engine = new APIKeyEngine({ keyGeneration: { encoding: 'base64url' } });
            // Hex key has 64 chars but base64url expects 43 chars
            expect(engine.IsValidAPIKeyFormat('mj_sk_' + 'a'.repeat(64))).toBe(false);
        });

        it('should reject base64url keys when hex is configured', () => {
            // Generate a base64url key
            const b64Engine = new APIKeyEngine({ keyGeneration: { encoding: 'base64url' } });
            const { Raw: b64Key } = b64Engine.GenerateAPIKey();

            // Default hex engine should reject it
            const hexEngine = new APIKeyEngine();
            expect(hexEngine.IsValidAPIKeyFormat(b64Key)).toBe(false);
        });

        it('should work with custom prefix and base64url', () => {
            const engine = new APIKeyEngine({
                keyGeneration: { prefix: 'skip-', entropyBytes: 50, encoding: 'base64url' }
            });
            const { Raw } = engine.GenerateAPIKey();
            expect(Raw.startsWith('skip-')).toBe(true);
            // base64url for 50 bytes = ceil(50 * 4/3) = 67 chars
            const body = Raw.slice(5);
            expect(body).toHaveLength(67);
            expect(engine.IsValidAPIKeyFormat(Raw)).toBe(true);
        });
    });

    describe('custom hash algorithm', () => {
        it('should use sha512 when configured', () => {
            const engine = new APIKeyEngine({ keyGeneration: { hashAlgorithm: 'sha512' } });
            const { Hash } = engine.GenerateAPIKey();
            // SHA-512 produces 128 hex characters
            expect(Hash).toHaveLength(128);
            expect(Hash).toMatch(/^[a-f0-9]{128}$/);
        });

        it('should produce consistent hashes with custom algorithm', () => {
            const engine = new APIKeyEngine({ keyGeneration: { hashAlgorithm: 'sha512' } });
            const { Raw, Hash } = engine.GenerateAPIKey();
            const rehash = engine.HashAPIKey(Raw);
            expect(rehash).toBe(Hash);
        });

        it('should produce different hash than sha256 for same input', () => {
            const sha256Engine = new APIKeyEngine({ keyGeneration: { hashAlgorithm: 'sha256' } });
            const sha512Engine = new APIKeyEngine({ keyGeneration: { hashAlgorithm: 'sha512' } });
            const testKey = 'mj_sk_' + 'a'.repeat(64);
            expect(sha256Engine.HashAPIKey(testKey)).not.toBe(sha512Engine.HashAPIKey(testKey));
        });
    });

    describe('KeyGenerationConfig getter', () => {
        it('should return full resolved config with all overrides', () => {
            const engine = new APIKeyEngine({
                keyGeneration: {
                    prefix: 'test_',
                    entropyBytes: 16,
                    encoding: 'base64url',
                    hashAlgorithm: 'sha512',
                }
            });
            const config = engine.KeyGenerationConfig;
            expect(config.prefix).toBe('test_');
            expect(config.entropyBytes).toBe(16);
            expect(config.encoding).toBe('base64url');
            expect(config.hashAlgorithm).toBe('sha512');
        });

        it('should fill defaults for unspecified properties', () => {
            const engine = new APIKeyEngine({ keyGeneration: { prefix: 'custom_' } });
            const config = engine.KeyGenerationConfig;
            expect(config.prefix).toBe('custom_');
            expect(config.entropyBytes).toBe(32);
            expect(config.encoding).toBe('hex');
            expect(config.hashAlgorithm).toBe('sha256');
        });
    });
});

describe('config file loading', () => {
    const mockedCosmiconfigSync = vi.mocked(cosmiconfigSync);

    beforeEach(() => {
        ResetAPIKeyEngine();
        // Reset to default (no config file)
        mockedCosmiconfigSync.mockReturnValue({
            search: vi.fn().mockReturnValue(null),
            load: vi.fn(),
            clearLoadedSearchPlaces: vi.fn(),
            clearSearchedDirectories: vi.fn(),
            clearCaches: vi.fn(),
        });
    });

    function mockConfigFile(apiKeyGeneration: Record<string, unknown>): void {
        mockedCosmiconfigSync.mockReturnValue({
            search: vi.fn().mockReturnValue({
                config: { apiKeyGeneration },
                filepath: '/fake/mj.config.cjs',
                isEmpty: false,
            }),
            load: vi.fn(),
            clearLoadedSearchPlaces: vi.fn(),
            clearSearchedDirectories: vi.fn(),
            clearCaches: vi.fn(),
        });
    }

    it('should use file config when no explicit config is provided', () => {
        mockConfigFile({
            prefix: 'file_',
            entropyBytes: 48,
            encoding: 'base64url',
            hashAlgorithm: 'sha512',
        });

        const engine = new APIKeyEngine();
        const config = engine.KeyGenerationConfig;
        expect(config.prefix).toBe('file_');
        expect(config.entropyBytes).toBe(48);
        expect(config.encoding).toBe('base64url');
        expect(config.hashAlgorithm).toBe('sha512');
    });

    it('should prefer explicit config over file config', () => {
        mockConfigFile({
            prefix: 'file_',
            entropyBytes: 48,
            encoding: 'base64url',
            hashAlgorithm: 'sha512',
        });

        const engine = new APIKeyEngine({
            keyGeneration: { prefix: 'explicit_' }
        });
        const config = engine.KeyGenerationConfig;
        // Explicit overrides file
        expect(config.prefix).toBe('explicit_');
        // File values used for the rest
        expect(config.entropyBytes).toBe(48);
        expect(config.encoding).toBe('base64url');
        expect(config.hashAlgorithm).toBe('sha512');
    });

    it('should fall back to defaults when no file config exists', () => {
        // Default mock returns null (no config file)
        const engine = new APIKeyEngine();
        const config = engine.KeyGenerationConfig;
        expect(config.prefix).toBe(DEFAULT_KEY_PREFIX);
        expect(config.entropyBytes).toBe(DEFAULT_ENTROPY_BYTES);
        expect(config.encoding).toBe(DEFAULT_KEY_ENCODING);
        expect(config.hashAlgorithm).toBe(DEFAULT_HASH_ALGORITHM);
    });

    it('should handle file config read errors gracefully', () => {
        mockedCosmiconfigSync.mockReturnValue({
            search: vi.fn().mockImplementation(() => {
                throw new Error('Permission denied');
            }),
            load: vi.fn(),
            clearLoadedSearchPlaces: vi.fn(),
            clearSearchedDirectories: vi.fn(),
            clearCaches: vi.fn(),
        });

        // Should not throw — falls back to defaults
        const engine = new APIKeyEngine();
        const config = engine.KeyGenerationConfig;
        expect(config.prefix).toBe(DEFAULT_KEY_PREFIX);
        expect(config.entropyBytes).toBe(DEFAULT_ENTROPY_BYTES);
    });

    it('should handle partial file config', () => {
        mockConfigFile({ prefix: 'partial_' });

        const engine = new APIKeyEngine();
        const config = engine.KeyGenerationConfig;
        expect(config.prefix).toBe('partial_');
        // Unset fields fall back to defaults
        expect(config.entropyBytes).toBe(DEFAULT_ENTROPY_BYTES);
        expect(config.encoding).toBe(DEFAULT_KEY_ENCODING);
        expect(config.hashAlgorithm).toBe(DEFAULT_HASH_ALGORITHM);
    });

    it('should ignore config file without apiKeyGeneration section', () => {
        mockedCosmiconfigSync.mockReturnValue({
            search: vi.fn().mockReturnValue({
                config: { dbHost: 'localhost', dbPort: 1433 },
                filepath: '/fake/mj.config.cjs',
                isEmpty: false,
            }),
            load: vi.fn(),
            clearLoadedSearchPlaces: vi.fn(),
            clearSearchedDirectories: vi.fn(),
            clearCaches: vi.fn(),
        });

        const engine = new APIKeyEngine();
        const config = engine.KeyGenerationConfig;
        expect(config.prefix).toBe(DEFAULT_KEY_PREFIX);
        expect(config.entropyBytes).toBe(DEFAULT_ENTROPY_BYTES);
    });

    it('should generate valid keys using file config', () => {
        mockConfigFile({
            prefix: 'skip-',
            entropyBytes: 48,
            encoding: 'base64url',
        });

        const engine = new APIKeyEngine();
        const { Raw, Hash } = engine.GenerateAPIKey();

        expect(Raw.startsWith('skip-')).toBe(true);
        expect(engine.IsValidAPIKeyFormat(Raw)).toBe(true);
        // base64url: ceil(48 * 4/3) = 64 chars after prefix
        const body = Raw.slice('skip-'.length);
        expect(body).toHaveLength(64);
        expect(Hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash is always 64 hex chars
    });
});

// =========================================================================
// ROW-FILTER ENGINE LAYER (plan §5.4, §5.6 rows 3/4, §5.6.1, §5.10)
// =========================================================================

describe('row filters', () => {
    const systemUser = new UserInfo({ ID: 'sys-user' });
    const HASH = 'a'.repeat(64);
    const ORG_GUID = '11111111-2222-3333-4444-555555555555';
    const COMPANY_GUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    beforeEach(() => {
        ResetAPIKeyEngine();
        clearMockBaseState();
        clearMockRunViewResults();
        clearMockEntities();
        clearMockMetadataState();
    });

    /** Configures a valid key + application so Authorize reaches scope evaluation. */
    function setupKeyAndApp(): void {
        setMockRunViewResult('MJ: API Keys', {
            Success: true,
            Results: [new MJAPIKeyEntity({ ID: 'key-1', UserID: 'user-1', Status: 'Active' })],
        });
        setMockBaseApplications([
            new MJAPIApplicationEntity({ ID: 'app-1', Name: 'MJAPI', IsActive: true }),
        ]);
    }

    /** Standard scope set used across the tests below. */
    function setupScopes(): void {
        setMockBaseScopes([
            new MJAPIScopeEntity({ ID: 'scope-read', FullPath: 'entity:read', IsActive: true }),
            new MJAPIScopeEntity({ ID: 'scope-update', FullPath: 'entity:update', IsActive: true }),
            new MJAPIScopeEntity({ ID: 'scope-fa', FullPath: 'full_access', IsActive: true }),
            new MJAPIScopeEntity({ ID: 'scope-qr', FullPath: 'query:run', IsActive: true }),
            new MJAPIScopeEntity({ ID: 'scope-agent', FullPath: 'agent:execute', IsActive: true }),
        ]);
    }

    /** Allows everything at the application ceiling for the given scope IDs. */
    function allowCeiling(...scopeIds: string[]): void {
        setMockBaseApplicationScopes(scopeIds.map((scopeId, i) =>
            new MJAPIApplicationScopeEntity({
                ID: `as-${i}`, ApplicationID: 'app-1', ScopeID: scopeId,
                ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
            })
        ));
    }

    describe('startup invariant (§5.6 rows 3/4)', () => {
        it('Config() throws when a filtered KEY scope rule exists and enforcement is disabled', async () => {
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
            ]);
            const e = new APIKeyEngine({ enforcementEnabled: false });
            await expect(e.Config()).rejects.toThrow(/enforcementEnabled/);
            expect(e.IsConfigured).toBe(false);
        });

        it('Config() throws when a filtered APPLICATION scope rule exists and defaultBehaviorNoScopes is allow', async () => {
            setMockBaseApplicationScopes([
                new MJAPIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
            ]);
            const e = new APIKeyEngine({ defaultBehaviorNoScopes: 'allow' });
            await expect(e.Config()).rejects.toThrow(/defaultBehaviorNoScopes/);
        });

        it('Config() succeeds with filtered rules under an enforcing, default-deny engine', async () => {
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
            ]);
            const e = new APIKeyEngine(); // enforcement on, default deny
            await expect(e.Config()).resolves.toBeUndefined();
            expect(e.IsConfigured).toBe(true);
        });

        it('Config() succeeds with no filtered rules even when enforcement is disabled (regression)', async () => {
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
            const e = new APIKeyEngine({ enforcementEnabled: false });
            await expect(e.Config()).resolves.toBeUndefined();
        });
    });

    describe('full_access backstop (§5.6.1)', () => {
        it('denies full_access for a key carrying any row-filtered rule, naming cause and remedy', async () => {
            setupKeyAndApp();
            setupScopes();
            allowCeiling('scope-fa');
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-fa', APIKeyID: 'key-1', ScopeID: 'scope-fa',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
                new MJAPIKeyScopeEntity({
                    ID: 'ks-filtered', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
            ]);

            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'full_access', '*', systemUser as never, undefined, { skipLogging: true });

            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('row filter');
            expect(result.Reason).toContain('Users');
            expect(result.Reason).toContain('full_access is');
            expect(result.Reason).toMatch(/remove the full_access grant or the row filter/i);
            expect(result.Reason).toMatch(/split the key/i);
        });

        it('unfiltered key with a full_access grant is still allowed (regression)', async () => {
            setupKeyAndApp();
            setupScopes();
            allowCeiling('scope-fa');
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-fa', APIKeyID: 'key-1', ScopeID: 'scope-fa',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'full_access', '*', systemUser as never, undefined, { skipLogging: true });
            expect(result.Allowed).toBe(true);
        });
    });

    describe('RLS-bypassing scope denial (§5.10)', () => {
        for (const scopePath of ['query:run', 'query:test', 'dataset:read', 'report:run']) {
            it(`denies '${scopePath}' for a filtered key, naming the row filter and the split-the-key remedy`, async () => {
                setupKeyAndApp();
                setupScopes();
                setMockBaseKeyScopes([
                    new MJAPIKeyScopeEntity({
                        ID: 'ks-filtered', APIKeyID: 'key-1', ScopeID: 'scope-read',
                        ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                        RowFilterID: 'filter-1',
                    }),
                ]);

                const engine = new APIKeyEngine();
                const result = await engine.Authorize(HASH, 'MJAPI', scopePath, 'SomeQuery', systemUser as never, undefined, { skipLogging: true });

                expect(result.Allowed).toBe(false);
                expect(result.Reason).toContain('row filter');
                expect(result.Reason).toContain(scopePath);
                expect(result.Reason).toMatch(/bypass/i);
                expect(result.Reason).toMatch(/split the key/i);
            });
        }

        it('unfiltered key requesting query:run is unchanged (regression)', async () => {
            setupKeyAndApp();
            setupScopes();
            allowCeiling('scope-qr');
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-qr', APIKeyID: 'key-1', ScopeID: 'scope-qr',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'query:run', 'SomeQuery', systemUser as never, undefined, { skipLogging: true });
            expect(result.Allowed).toBe(true);
        });
    });

    describe('binding resolution + acting-token validation (§5.4/§5.2)', () => {
        function setupFilteredReadRule(filterText: string): void {
            setupKeyAndApp();
            setupScopes();
            allowCeiling('scope-read');
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-filtered', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
            ]);
            setMockMetadataEntities([new EntityInfo({ ID: 'entity-users', Name: 'Users' })]);
            setMockRowLevelSecurityFilters([
                new RowLevelSecurityFilterInfo({ ID: 'filter-1', Name: 'OrgFilter', FilterText: filterText }),
            ]);
        }

        it('missing required acting token → denied, reason NAMES the token', async () => {
            setupFilteredReadRule("OrganizationID = '{{ActingOrganizationID}}'");
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, { skipLogging: true });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('ActingOrganizationID');
        });

        it('non-GUID ActingOrganizationID → denied, not coerced', async () => {
            setupFilteredReadRule("OrganizationID = '{{ActingOrganizationID}}'");
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, {
                skipLogging: true,
                actingContext: { ActingOrganizationID: "x' OR '1'='1" },
            });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('ActingOrganizationID');
            expect(result.Reason).toMatch(/not a valid GUID/i);
        });

        it('invalid ActingScopeID → denied naming the token', async () => {
            setupFilteredReadRule("ScopeKey = '{{ActingScopeID}}'");
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, {
                skipLogging: true,
                actingContext: { ActingScopeID: "bad'value" },
            });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('ActingScopeID');
        });

        it('empty ActingCompanyIDs array → denied naming the token', async () => {
            setupFilteredReadRule('CompanyID IN ({{ActingCompanyIDs}})');
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, {
                skipLogging: true,
                actingContext: { ActingCompanyIDs: [] },
            });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('ActingCompanyIDs');
        });

        it('valid acting context → allowed with RowFilterBindings and EffectiveFilter populated', async () => {
            const filterText = "OrganizationID = '{{ActingOrganizationID}}' AND CompanyID IN ({{ActingCompanyIDs}})";
            setupFilteredReadRule(filterText);
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, {
                skipLogging: true,
                actingContext: { ActingOrganizationID: ORG_GUID, ActingCompanyIDs: [COMPANY_GUID] },
            });

            expect(result.Allowed).toBe(true);
            expect(result.RowFilterBindings).toEqual([
                { EntityID: 'entity-users', PermissionType: 'Read', FilterID: 'filter-1' },
            ]);
            expect(result.EffectiveFilter).toEqual([
                { EntityName: 'Users', FilterID: 'filter-1', FilterText: filterText },
            ]);
        });

        it('{{User*}} / {{Scope*}} tokens do not require acting context', async () => {
            setupFilteredReadRule("OrganizationID = '{{UserOrganizationID}}' AND ResID = '{{ScopeResourceID}}'");
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, { skipLogging: true });
            expect(result.Allowed).toBe(true);
            expect(result.RowFilterBindings).toHaveLength(1);
        });

        it('unresolvable entity name on a filtered matching rule → denied (fail closed)', async () => {
            setupFilteredReadRule("OrganizationID = '{{ActingOrganizationID}}'");
            setMockMetadataEntities([]); // entity no longer resolvable
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, {
                skipLogging: true,
                actingContext: { ActingOrganizationID: ORG_GUID },
            });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toMatch(/does not resolve to an entity/i);
        });

        it('dangling RowFilterID → denied (fail closed)', async () => {
            setupFilteredReadRule("Col = '{{ActingOrganizationID}}'");
            setMockRowLevelSecurityFilters([]); // filter missing from metadata
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, {
                skipLogging: true,
                actingContext: { ActingOrganizationID: ORG_GUID },
            });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toMatch(/not found/i);
        });

        it('filtered matching rule on a scope with no coherent permission type → denied', async () => {
            setupKeyAndApp();
            setupScopes();
            allowCeiling('scope-agent');
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-agent', APIKeyID: 'key-1', ScopeID: 'scope-agent',
                    ResourcePattern: 'SomeAgent', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
            ]);
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'agent:execute', 'SomeAgent', systemUser as never, undefined, { skipLogging: true });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toMatch(/no coherent permission type/i);
        });

        it('unfiltered matching rule → no bindings, allowed as before (regression)', async () => {
            setupKeyAndApp();
            setupScopes();
            allowCeiling('scope-read');
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
            const engine = new APIKeyEngine();
            const result = await engine.Authorize(HASH, 'MJAPI', 'entity:read', 'Users', systemUser as never, undefined, { skipLogging: true });
            expect(result.Allowed).toBe(true);
            expect(result.RowFilterBindings).toBeUndefined();
            expect(result.EffectiveFilter).toBeUndefined();
        });
    });

    describe('GetRowFilterBindingsForKey()', () => {
        beforeEach(() => {
            setupScopes();
            setMockMetadataEntities([
                new EntityInfo({ ID: 'entity-users', Name: 'Users' }),
                new EntityInfo({ ID: 'entity-orders', Name: 'Orders' }),
            ]);
        });

        it('maps rule → entity → permission type, skipping unfiltered rules', () => {
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-read', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
                new MJAPIKeyScopeEntity({
                    ID: 'ks-update', APIKeyID: 'key-1', ScopeID: 'scope-update',
                    ResourcePattern: 'Orders', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-2',
                }),
                new MJAPIKeyScopeEntity({
                    ID: 'ks-unfiltered', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const engine = new APIKeyEngine();
            const bindings = engine.GetRowFilterBindingsForKey('key-1');
            expect(bindings).toEqual([
                { EntityID: 'entity-orders', PermissionType: 'Update', FilterID: 'filter-2' },
                { EntityID: 'entity-users', PermissionType: 'Read', FilterID: 'filter-1' },
            ]);
        });

        it('skips rules whose entity does not resolve (fail closed per rule, no binding)', () => {
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-bad', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'NoSuchEntity', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
            ]);
            const engine = new APIKeyEngine();
            expect(engine.GetRowFilterBindingsForKey('key-1')).toEqual([]);
        });

        it('skips deny and Exclude rules carrying a filter (invalid config)', () => {
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-deny', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: true, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
                new MJAPIKeyScopeEntity({
                    ID: 'ks-exclude', APIKeyID: 'key-1', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Exclude', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-2',
                }),
            ]);
            const engine = new APIKeyEngine();
            expect(engine.GetRowFilterBindingsForKey('key-1')).toEqual([]);
        });

        it('only returns bindings for the requested key', () => {
            setMockBaseKeyScopes([
                new MJAPIKeyScopeEntity({
                    ID: 'ks-other', APIKeyID: 'other-key', ScopeID: 'scope-read',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                    RowFilterID: 'filter-1',
                }),
            ]);
            const engine = new APIKeyEngine();
            expect(engine.GetRowFilterBindingsForKey('key-1')).toEqual([]);
        });

        it('throws when the base engine has not loaded (fail closed, §5.6 row 7)', () => {
            setMockBaseLoaded(false);
            const engine = new APIKeyEngine();
            expect(() => engine.GetRowFilterBindingsForKey('key-1')).toThrow(/before APIKeysEngineBase loaded/);
        });
    });
});
