/**
 * Unit tests for APIKeys/Engine interface and type definitions
 *
 * Verifies that all exported interfaces conform to expected shapes.
 */

import { describe, it, expect } from 'vitest';
import type {
    GeneratedAPIKey,
    CreateAPIKeyParams,
    CreateAPIKeyResult,
    APIKeyValidationOptions,
    APIKeyValidationResult,
    AuthorizationRequest,
    AuthorizationResult,
    ScopeRuleMatch,
    EvaluatedRule,
    ScopeRule,
    ApplicationScopeRule,
    KeyScopeRule,
    UsageLogEntry,
    APIKeyEngineConfig,
} from '../interfaces';

describe('GeneratedAPIKey interface', () => {
    it('should accept raw and hash values', () => {
        const key: GeneratedAPIKey = {
            Raw: 'mj_sk_abc123',
            Hash: 'sha256hashvalue',
        };
        expect(key.Raw).toBe('mj_sk_abc123');
        expect(key.Hash).toBe('sha256hashvalue');
    });
});

describe('CreateAPIKeyParams interface', () => {
    it('should accept minimal params', () => {
        const params: CreateAPIKeyParams = {
            UserId: 'user-1',
            Label: 'My Test Key',
        };
        expect(params.UserId).toBe('user-1');
        expect(params.Label).toBe('My Test Key');
        expect(params.Description).toBeUndefined();
        expect(params.ExpiresAt).toBeUndefined();
    });

    it('should accept full params', () => {
        const expiry = new Date('2026-12-31');
        const params: CreateAPIKeyParams = {
            UserId: 'user-1',
            Label: 'Production Key',
            Description: 'Used for CI/CD',
            ExpiresAt: expiry,
        };
        expect(params.Description).toBe('Used for CI/CD');
        expect(params.ExpiresAt).toBe(expiry);
    });
});

describe('CreateAPIKeyResult interface', () => {
    it('should represent success', () => {
        const result: CreateAPIKeyResult = {
            Success: true,
            RawKey: 'mj_sk_abc',
            APIKeyId: 'key-1',
        };
        expect(result.Success).toBe(true);
        expect(result.RawKey).toBeDefined();
    });

    it('should represent failure', () => {
        const result: CreateAPIKeyResult = {
            Success: false,
            Error: 'Duplicate label',
        };
        expect(result.Success).toBe(false);
        expect(result.Error).toBe('Duplicate label');
    });
});

describe('APIKeyValidationOptions interface', () => {
    it('should accept minimal options', () => {
        const options: APIKeyValidationOptions = {
            RawKey: 'mj_sk_abc',
        };
        expect(options.RawKey).toBe('mj_sk_abc');
    });

    it('should accept full options', () => {
        const options: APIKeyValidationOptions = {
            RawKey: 'mj_sk_abc',
            ApplicationId: 'app-1',
            ApplicationName: 'TestApp',
            Endpoint: '/api/v1/users',
            Method: 'GET',
            Operation: 'listUsers',
            StatusCode: 200,
            ResponseTimeMs: 150,
            IPAddress: '192.168.1.1',
            UserAgent: 'Mozilla/5.0',
        };
        expect(options.ApplicationId).toBe('app-1');
        expect(options.StatusCode).toBe(200);
    });
});

describe('APIKeyValidationResult interface', () => {
    it('should represent valid key', () => {
        const result: APIKeyValidationResult = {
            IsValid: true,
            APIKeyId: 'key-1',
            APIKeyHash: 'hash-value',
        };
        expect(result.IsValid).toBe(true);
    });

    it('should represent invalid key', () => {
        const result: APIKeyValidationResult = {
            IsValid: false,
            Error: 'Key expired',
        };
        expect(result.IsValid).toBe(false);
        expect(result.Error).toBe('Key expired');
    });
});

describe('AuthorizationRequest interface', () => {
    it('should accept all required fields', () => {
        const request: AuthorizationRequest = {
            APIKeyId: 'key-1',
            UserId: 'user-1',
            ApplicationId: 'app-1',
            ScopePath: 'view:run',
            Resource: 'Users',
        };
        expect(request.ScopePath).toBe('view:run');
        expect(request.Resource).toBe('Users');
    });

    it('should accept optional context', () => {
        const request: AuthorizationRequest = {
            APIKeyId: 'key-1',
            UserId: 'user-1',
            ApplicationId: 'app-1',
            ScopePath: 'agent:execute',
            Resource: 'SkipAgent',
            Context: { environment: 'production' },
        };
        expect(request.Context).toEqual({ environment: 'production' });
    });
});

describe('AuthorizationResult interface', () => {
    it('should represent allowed result', () => {
        const result: AuthorizationResult = {
            Allowed: true,
            Reason: 'Key allows access',
            EvaluatedRules: [],
        };
        expect(result.Allowed).toBe(true);
    });

    it('should represent denied result with matched rules', () => {
        const match: ScopeRuleMatch = {
            Id: 'rule-1',
            ScopeId: 'scope-1',
            ScopePath: 'view:run',
            Pattern: 'AuditLogs*',
            PatternType: 'Exclude',
            IsDeny: true,
            Priority: 100,
        };
        const result: AuthorizationResult = {
            Allowed: false,
            Reason: 'Application denies access via rule rule-1',
            MatchedAppRule: match,
            EvaluatedRules: [],
        };
        expect(result.Allowed).toBe(false);
        expect(result.MatchedAppRule?.IsDeny).toBe(true);
    });
});

describe('ScopeRule interface', () => {
    it('should accept an application scope rule', () => {
        const rule: ApplicationScopeRule = {
            ID: 'rule-1',
            ScopeID: 'scope-1',
            FullPath: 'view:run',
            ResourcePattern: '*',
            PatternType: 'Include',
            IsDeny: false,
            Priority: 10,
            ApplicationID: 'app-1',
        };
        expect(rule.ApplicationID).toBe('app-1');
    });

    it('should accept a key scope rule', () => {
        const rule: KeyScopeRule = {
            ID: 'rule-2',
            ScopeID: 'scope-1',
            FullPath: 'agent:execute',
            ResourcePattern: 'Skip*',
            PatternType: 'Include',
            IsDeny: false,
            Priority: 5,
            APIKeyID: 'key-1',
        };
        expect(rule.APIKeyID).toBe('key-1');
    });
});

describe('EvaluatedRule interface', () => {
    it('should represent a matched allow rule', () => {
        const evalRule: EvaluatedRule = {
            Level: 'application',
            Rule: {
                Id: 'rule-1',
                ScopeId: 'scope-1',
                ScopePath: 'view:run',
                Pattern: '*',
                PatternType: 'Include',
                IsDeny: false,
                Priority: 10,
            },
            Matched: true,
            PatternMatched: '*',
            Result: 'Allowed',
        };
        expect(evalRule.Level).toBe('application');
        expect(evalRule.Result).toBe('Allowed');
    });

    it('should represent a non-matching rule', () => {
        const evalRule: EvaluatedRule = {
            Level: 'key',
            Rule: {
                Id: 'rule-2',
                ScopeId: 'scope-2',
                ScopePath: 'view:run',
                Pattern: 'AuditLogs*',
                PatternType: 'Include',
                IsDeny: false,
                Priority: 5,
            },
            Matched: false,
            PatternMatched: null,
            Result: 'NoMatch',
        };
        expect(evalRule.Result).toBe('NoMatch');
    });
});

describe('UsageLogEntry interface', () => {
    it('should accept full log entry', () => {
        const entry: UsageLogEntry = {
            APIKeyId: 'key-1',
            ApplicationId: 'app-1',
            Endpoint: '/api/v1/users',
            Operation: 'listUsers',
            Method: 'GET',
            StatusCode: 200,
            ResponseTimeMs: 150,
            IPAddress: '192.168.1.1',
            UserAgent: 'curl/7.68',
            RequestedResource: 'Users',
            ScopesEvaluated: [],
            AuthorizationResult: 'Allowed',
            DeniedReason: null,
        };
        expect(entry.AuthorizationResult).toBe('Allowed');
        expect(entry.DeniedReason).toBeNull();
    });

    it('should accept denied entry', () => {
        const entry: UsageLogEntry = {
            APIKeyId: 'key-1',
            ApplicationId: null,
            Endpoint: '/api/v1/audit',
            Operation: null,
            Method: 'POST',
            StatusCode: 403,
            ResponseTimeMs: null,
            IPAddress: null,
            UserAgent: null,
            RequestedResource: 'AuditLogs',
            ScopesEvaluated: [],
            AuthorizationResult: 'Denied',
            DeniedReason: 'Scope not granted',
        };
        expect(entry.AuthorizationResult).toBe('Denied');
    });
});

describe('APIKeyEngineConfig interface', () => {
    it('should accept empty config', () => {
        const config: APIKeyEngineConfig = {};
        expect(config.enforcementEnabled).toBeUndefined();
    });

    it('should accept full config', () => {
        const config: APIKeyEngineConfig = {
            enforcementEnabled: true,
            loggingEnabled: true,
            defaultBehaviorNoScopes: 'allow',
            scopeCacheTTLMs: 120000,
        };
        expect(config.enforcementEnabled).toBe(true);
        expect(config.defaultBehaviorNoScopes).toBe('allow');
    });

    it('should accept deny as default behavior', () => {
        const config: APIKeyEngineConfig = {
            defaultBehaviorNoScopes: 'deny',
        };
        expect(config.defaultBehaviorNoScopes).toBe('deny');
    });
});
