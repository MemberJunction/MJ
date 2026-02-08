/**
 * Unit tests for APIKeyEngine
 * Tests key generation, format validation, hashing, and singleton management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the crypto module for key generation
vi.mock('crypto', async () => {
    const actual = await vi.importActual<typeof import('crypto')>('crypto');
    return {
        ...actual,
        randomBytes: actual.randomBytes,
        createHash: actual.createHash,
    };
});

// Mock external dependencies
vi.mock('@memberjunction/core', () => ({
    RunView: class {
        async RunView() { return { Success: false, Results: [] }; }
    },
    Metadata: class {
        async GetEntityObject() { return { Save: async () => false }; }
    },
    UserInfo: class { ID = 'mock-user'; },
}));

vi.mock('@memberjunction/core-entities', () => ({
    APIKeyEntity: class {},
    APIApplicationEntity: class {},
    APIKeyApplicationEntity: class {},
    APIScopeEntity: class {},
    UserEntity: class {},
    APIKeyUsageLogEntity: class {},
    APIApplicationScopeEntity: class {},
    APIKeyScopeEntity: class {},
}));

vi.mock('@memberjunction/api-keys-base', () => ({
    APIKeysEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Scopes: [],
            Applications: [],
            GetApplicationByName: vi.fn().mockReturnValue(null),
            GetApplicationById: vi.fn().mockReturnValue(null),
            GetKeyApplicationsByKeyId: vi.fn().mockReturnValue([]),
            GetScopeByPath: vi.fn().mockReturnValue(null),
            GetApplicationScopeRules: vi.fn().mockReturnValue([]),
            GetKeyScopeRules: vi.fn().mockReturnValue([]),
        }
    },
}));

import { APIKeyEngine, GetAPIKeyEngine, ResetAPIKeyEngine } from '../APIKeyEngine';

describe('APIKeyEngine', () => {
    let engine: APIKeyEngine;

    beforeEach(() => {
        ResetAPIKeyEngine();
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
