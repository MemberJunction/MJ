/**
 * Unit tests for ScopeEvaluator
 * Tests two-level scope evaluation: Application Ceiling -> Key Scopes
 * Uses alias-based mock for APIKeysEngineBase cached metadata
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScopeEvaluator } from '../ScopeEvaluator';
import { UserInfo } from '../__mocks__/core';
import {
    APIScopeEntity,
    APIApplicationScopeEntity,
    APIKeyScopeEntity,
    APIKeyApplicationEntity,
} from '../__mocks__/core-entities';
import {
    setMockBaseScopes,
    setMockBaseApplicationScopes,
    setMockBaseKeyApplications,
    setMockBaseKeyScopes,
    clearMockBaseState,
} from '../__mocks__/api-keys-base';
import type { AuthorizationRequest } from '../interfaces';

describe('ScopeEvaluator', () => {
    let evaluator: ScopeEvaluator;
    let contextUser: UserInfo;

    const baseRequest: AuthorizationRequest = {
        APIKeyId: 'key-1',
        UserId: 'user-1',
        ApplicationId: 'app-1',
        ScopePath: 'entity:read',
        Resource: 'Users',
    };

    beforeEach(() => {
        clearMockBaseState();
        evaluator = new ScopeEvaluator('deny');
        contextUser = new UserInfo({ ID: 'test-user' });

        // Default: single active scope
        setMockBaseScopes([
            new APIScopeEntity({ ID: 'scope-1', FullPath: 'entity:read', IsActive: true }),
        ]);
    });

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    describe('constructor', () => {
        it('should default to allow when no argument given', () => {
            const allowEval = new ScopeEvaluator();
            expect(allowEval).toBeDefined();
        });

        it('should accept deny default', () => {
            const denyEval = new ScopeEvaluator('deny');
            expect(denyEval).toBeDefined();
        });
    });

    // =========================================================================
    // APPLICATION BINDING
    // =========================================================================

    describe('EvaluateAccess() - application binding', () => {
        it('should deny if key is bound to a different application', async () => {
            setMockBaseKeyApplications([
                new APIKeyApplicationEntity({ APIKeyID: 'key-1', ApplicationID: 'other-app' }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('not authorized for this application');
        });

        it('should proceed if key is bound to the requested application', async () => {
            setMockBaseKeyApplications([
                new APIKeyApplicationEntity({ APIKeyID: 'key-1', ApplicationID: 'app-1' }),
            ]);
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
        });

        it('should allow global keys (no application bindings)', async () => {
            setMockBaseKeyApplications([]);
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
        });
    });

    // =========================================================================
    // APPLICATION CEILING
    // =========================================================================

    describe('EvaluateAccess() - application ceiling', () => {
        beforeEach(() => {
            setMockBaseKeyApplications([]);
        });

        it('should deny if scope path is not found', async () => {
            setMockBaseScopes([]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
        });

        it('should deny if application has no scope rules for the requested scope', async () => {
            setMockBaseApplicationScopes([]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('Application does not allow');
        });

        it('should allow if app ceiling includes the exact resource', async () => {
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
            expect(result.MatchedAppRule).toBeDefined();
            expect(result.MatchedAppRule?.Pattern).toBe('Users');
        });

        it('should deny if app ceiling has a deny rule', async () => {
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: true, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('denies access');
        });

        it('should support wildcard patterns in app ceiling', async () => {
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: 'User*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
        });

        it('should deny if wildcard does not match resource', async () => {
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Admin*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
        });
    });

    // =========================================================================
    // KEY SCOPES
    // =========================================================================

    describe('EvaluateAccess() - key scopes', () => {
        beforeEach(() => {
            setMockBaseKeyApplications([]);
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
        });

        it('should deny with no key scope rules (default: deny)', async () => {
            setMockBaseKeyScopes([]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
        });

        it('should allow with no key scope rules (default: allow)', async () => {
            const allowEval = new ScopeEvaluator('allow');
            setMockBaseKeyScopes([]);

            const result = await allowEval.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
            expect(result.Reason).toContain('no scope restrictions');
        });

        it('should allow if key scope includes the resource', async () => {
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
            expect(result.MatchedKeyRule).toBeDefined();
        });

        it('should deny if key scope has deny rule', async () => {
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: true, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('Key denies access');
        });

        it('should support Exclude pattern type (grant when NOT matching)', async () => {
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: 'AdminData', PatternType: 'Exclude', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
        });

        it('should deny with Exclude pattern type when resource matches', async () => {
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Exclude', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
        });
    });

    // =========================================================================
    // PRIORITY ORDERING
    // =========================================================================

    describe('EvaluateAccess() - priority ordering', () => {
        beforeEach(() => {
            setMockBaseKeyApplications([]);
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
        });

        it('should respect priority (higher priority wins)', async () => {
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-deny', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: true, Priority: 0,
                }),
                new APIKeyScopeEntity({
                    ID: 'ks-allow', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 10,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
        });

        it('should prefer deny at same priority', async () => {
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-allow', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
                new APIKeyScopeEntity({
                    ID: 'ks-deny', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: true, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(false);
        });

        it('should prioritize app ceiling rules too', async () => {
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-deny', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: true, Priority: 0,
                }),
                new APIApplicationScopeEntity({
                    ID: 'as-allow', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: 'Users', PatternType: 'Include', IsDeny: false, Priority: 10,
                }),
            ]);
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.Allowed).toBe(true);
        });
    });

    // =========================================================================
    // EVALUATED RULES TRACKING
    // =========================================================================

    describe('EvaluateAccess() - evaluated rules', () => {
        it('should include evaluated rules in result', async () => {
            setMockBaseKeyApplications([]);
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-1',
                    ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const result = await evaluator.EvaluateAccess(baseRequest, contextUser as never);
            expect(result.EvaluatedRules.length).toBeGreaterThanOrEqual(2);

            const appRules = result.EvaluatedRules.filter(r => r.Level === 'application');
            const keyRules = result.EvaluatedRules.filter(r => r.Level === 'key');
            expect(appRules.length).toBeGreaterThanOrEqual(1);
            expect(keyRules.length).toBeGreaterThanOrEqual(1);
        });
    });

    // =========================================================================
    // MULTIPLE SCOPES
    // =========================================================================

    describe('EvaluateAccess() - agent scope', () => {
        it('should evaluate agent:execute scope', async () => {
            const agentScope = new APIScopeEntity({ ID: 'scope-agent', FullPath: 'agent:execute', IsActive: true });
            setMockBaseScopes([agentScope]);

            setMockBaseKeyApplications([]);
            setMockBaseApplicationScopes([
                new APIApplicationScopeEntity({
                    ID: 'as-1', ApplicationID: 'app-1', ScopeID: 'scope-agent',
                    ResourcePattern: 'Skip*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);
            setMockBaseKeyScopes([
                new APIKeyScopeEntity({
                    ID: 'ks-1', APIKeyID: 'key-1', ScopeID: 'scope-agent',
                    ResourcePattern: 'Skip*', PatternType: 'Include', IsDeny: false, Priority: 0,
                }),
            ]);

            const request: AuthorizationRequest = {
                ...baseRequest,
                ScopePath: 'agent:execute',
                Resource: 'SkipAnalysisAgent',
            };

            const result = await evaluator.EvaluateAccess(request, contextUser as never);
            expect(result.Allowed).toBe(true);
        });
    });

    // =========================================================================
    // UTILITY
    // =========================================================================

    describe('GetKeyApplications()', () => {
        it('should return key applications from Base', async () => {
            setMockBaseKeyApplications([
                new APIKeyApplicationEntity({ APIKeyID: 'key-1', ApplicationID: 'app-1' }),
                new APIKeyApplicationEntity({ APIKeyID: 'key-1', ApplicationID: 'app-2' }),
            ]);

            const apps = await evaluator.GetKeyApplications('key-1', contextUser as never);
            expect(apps).toHaveLength(2);
        });

        it('should return empty for global keys', async () => {
            setMockBaseKeyApplications([]);
            const apps = await evaluator.GetKeyApplications('key-1', contextUser as never);
            expect(apps).toHaveLength(0);
        });
    });

    describe('ClearCache()', () => {
        it('should not throw', () => {
            expect(() => evaluator.ClearCache()).not.toThrow();
        });
    });
});
