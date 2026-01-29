/**
 * Unit tests for ScopeEvaluator
 * Tests two-level scope evaluation: Application Ceiling -> Key Scopes
 */

import { ScopeEvaluator } from './ScopeEvaluator';
import { UserInfo, setMockRunViewResult, clearMockRunViewResults } from './__mocks__/core';
import { AuthorizationRequest } from './interfaces';

// Note: Mocking is handled by moduleNameMapper in jest.config.js
// @memberjunction/core -> ./__mocks__/core.ts
// @memberjunction/core-entities -> ./__mocks__/core-entities.ts

// Helper to cast mock UserInfo to the expected type (using any to avoid circular dependency)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUserInfo = (user: UserInfo): any => user;

describe('ScopeEvaluator', () => {
    let evaluator: ScopeEvaluator;
    let contextUser: UserInfo;

    beforeEach(() => {
        evaluator = new ScopeEvaluator(60000, 'allow');
        contextUser = new UserInfo({ ID: 'test-user', Name: 'Test User' });
        clearMockRunViewResults();
    });

    afterEach(() => {
        evaluator.ClearCache();
    });

    describe('constructor', () => {
        it('should accept cache TTL parameter', () => {
            const evaluator = new ScopeEvaluator(30000);
            expect(evaluator).toBeDefined();
        });

        it('should accept defaultBehaviorNoScopes parameter', () => {
            const allowEvaluator = new ScopeEvaluator(60000, 'allow');
            const denyEvaluator = new ScopeEvaluator(60000, 'deny');
            expect(allowEvaluator).toBeDefined();
            expect(denyEvaluator).toBeDefined();
        });
    });

    describe('EvaluateAccess()', () => {
        const baseRequest: AuthorizationRequest = {
            APIKeyId: 'test-key-id',
            UserId: 'test-user-id',
            ApplicationId: 'test-app-id',
            ScopePath: 'entity:read',
            Resource: 'Users'
        };

        describe('application binding check', () => {
            it('should deny if key is bound to different application', async () => {
                // Key is bound to a different app
                setMockRunViewResult('MJ: API Key Applications', {
                    Success: true,
                    Results: [{ APIKeyID: 'test-key-id', ApplicationID: 'other-app-id' }]
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(false);
                expect(result.Reason).toContain('not authorized for this application');
            });

            it('should allow if key is bound to requested application', async () => {
                // Key is bound to the requested app
                setMockRunViewResult('MJ: API Key Applications', {
                    Success: true,
                    Results: [{ APIKeyID: 'test-key-id', ApplicationID: 'test-app-id' }]
                });

                // Mock scope to pass app ceiling
                setMockRunViewResult('MJ: API Scopes', {
                    Success: true,
                    Results: [{ ID: 'scope-id', FullPath: 'entity:read', IsActive: true }]
                });

                // Mock app ceiling - allow entity:read for Users
                setMockRunViewResult('MJ: API Application Scopes', {
                    Success: true,
                    Results: [{
                        ID: 'app-scope-id',
                        ApplicationID: 'test-app-id',
                        ScopeID: 'scope-id',
                        ResourcePattern: '*',
                        PatternType: 'Include',
                        IsDeny: false,
                        Priority: 0
                    }]
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(true);
            });

            it('should allow global keys (no application bindings)', async () => {
                // Key has no bindings (global)
                setMockRunViewResult('MJ: API Key Applications', {
                    Success: true,
                    Results: []
                });

                // Mock scope
                setMockRunViewResult('MJ: API Scopes', {
                    Success: true,
                    Results: [{ ID: 'scope-id', FullPath: 'entity:read', IsActive: true }]
                });

                // Mock app ceiling
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

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(true);
            });
        });

        describe('application ceiling evaluation', () => {
            beforeEach(() => {
                // Global key
                setMockRunViewResult('MJ: API Key Applications', { Success: true, Results: [] });
            });

            it('should deny if application has no scope rules for requested scope', async () => {
                // Scope exists
                setMockRunViewResult('MJ: API Scopes', {
                    Success: true,
                    Results: [{ ID: 'scope-id', FullPath: 'entity:read', IsActive: true }]
                });

                // No app scope rules
                setMockRunViewResult('MJ: API Application Scopes', {
                    Success: true,
                    Results: []
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(false);
                expect(result.Reason).toContain('Application does not allow');
            });

            it('should allow if application ceiling includes the resource', async () => {
                setMockRunViewResult('MJ: API Scopes', {
                    Success: true,
                    Results: [{ ID: 'scope-id', FullPath: 'entity:read', IsActive: true }]
                });

                setMockRunViewResult('MJ: API Application Scopes', {
                    Success: true,
                    Results: [{
                        ID: 'app-scope-id',
                        ResourcePattern: 'Users',
                        PatternType: 'Include',
                        IsDeny: false,
                        Priority: 0
                    }]
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(true);
                expect(result.MatchedAppRule).toBeDefined();
                expect(result.MatchedAppRule?.Pattern).toBe('Users');
            });

            it('should deny if application has deny rule', async () => {
                setMockRunViewResult('MJ: API Scopes', {
                    Success: true,
                    Results: [{ ID: 'scope-id', FullPath: 'entity:read', IsActive: true }]
                });

                setMockRunViewResult('MJ: API Application Scopes', {
                    Success: true,
                    Results: [{
                        ID: 'app-scope-id',
                        ResourcePattern: '*',
                        PatternType: 'Include',
                        IsDeny: true,
                        Priority: 0
                    }]
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(false);
                expect(result.Reason).toContain('denies access');
            });
        });

        describe('key scope evaluation', () => {
            beforeEach(() => {
                // Global key
                setMockRunViewResult('MJ: API Key Applications', { Success: true, Results: [] });

                // Scope exists
                setMockRunViewResult('MJ: API Scopes', {
                    Success: true,
                    Results: [{ ID: 'scope-id', FullPath: 'entity:read', IsActive: true }]
                });

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
            });

            it('should allow if key has no scope rules (default: allow)', async () => {
                setMockRunViewResult('MJ: API Key Scopes', {
                    Success: true,
                    Results: []
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(true);
                expect(result.Reason).toContain('no scope restrictions');
            });

            it('should deny if key has no scope rules and default is deny', async () => {
                const denyEvaluator = new ScopeEvaluator(60000, 'deny');

                setMockRunViewResult('MJ: API Key Scopes', {
                    Success: true,
                    Results: []
                });

                const result = await denyEvaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(false);
            });

            it('should allow if key scope includes the resource', async () => {
                setMockRunViewResult('MJ: API Key Scopes', {
                    Success: true,
                    Results: [{
                        ID: 'key-scope-id',
                        APIKeyID: 'test-key-id',
                        ScopeID: 'scope-id',
                        ResourcePattern: 'Users',
                        PatternType: 'Include',
                        IsDeny: false,
                        Priority: 0
                    }]
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(true);
                expect(result.MatchedKeyRule).toBeDefined();
            });

            it('should deny if key scope has deny rule', async () => {
                setMockRunViewResult('MJ: API Key Scopes', {
                    Success: true,
                    Results: [{
                        ID: 'key-scope-id',
                        ResourcePattern: 'Users',
                        PatternType: 'Include',
                        IsDeny: true,
                        Priority: 0
                    }]
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(false);
                expect(result.Reason).toContain('Key denies access');
            });
        });

        describe('pattern matching', () => {
            beforeEach(() => {
                setMockRunViewResult('MJ: API Key Applications', { Success: true, Results: [] });
                setMockRunViewResult('MJ: API Scopes', {
                    Success: true,
                    Results: [{ ID: 'scope-id', FullPath: 'agent:execute', IsActive: true }]
                });
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
            });

            it('should match wildcard patterns', async () => {
                setMockRunViewResult('MJ: API Key Scopes', {
                    Success: true,
                    Results: [{
                        ID: 'key-scope-id',
                        ResourcePattern: 'Skip*',
                        PatternType: 'Include',
                        IsDeny: false,
                        Priority: 0
                    }]
                });

                const request: AuthorizationRequest = {
                    ...baseRequest,
                    ScopePath: 'agent:execute',
                    Resource: 'SkipAnalysisAgent'
                };

                const result = await evaluator.EvaluateAccess(request, asUserInfo(contextUser));

                expect(result.Allowed).toBe(true);
            });

            it('should not match non-matching wildcards', async () => {
                const denyEvaluator = new ScopeEvaluator(60000, 'deny');

                setMockRunViewResult('MJ: API Key Scopes', {
                    Success: true,
                    Results: [{
                        ID: 'key-scope-id',
                        ResourcePattern: 'Skip*',
                        PatternType: 'Include',
                        IsDeny: false,
                        Priority: 0
                    }]
                });

                const request: AuthorizationRequest = {
                    ...baseRequest,
                    ScopePath: 'agent:execute',
                    Resource: 'DataAnalysisAgent'
                };

                const result = await denyEvaluator.EvaluateAccess(request, asUserInfo(contextUser));

                expect(result.Allowed).toBe(false);
            });
        });

        describe('priority ordering', () => {
            beforeEach(() => {
                setMockRunViewResult('MJ: API Key Applications', { Success: true, Results: [] });
                setMockRunViewResult('MJ: API Scopes', {
                    Success: true,
                    Results: [{ ID: 'scope-id', FullPath: 'entity:read', IsActive: true }]
                });
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
            });

            it('should respect priority (higher priority wins)', async () => {
                setMockRunViewResult('MJ: API Key Scopes', {
                    Success: true,
                    Results: [
                        {
                            ID: 'key-scope-1',
                            ResourcePattern: 'Users',
                            PatternType: 'Include',
                            IsDeny: true,
                            Priority: 0  // Lower priority
                        },
                        {
                            ID: 'key-scope-2',
                            ResourcePattern: 'Users',
                            PatternType: 'Include',
                            IsDeny: false,
                            Priority: 10  // Higher priority - should win
                        }
                    ]
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(true);
            });

            it('should prefer deny rules at same priority', async () => {
                setMockRunViewResult('MJ: API Key Scopes', {
                    Success: true,
                    Results: [
                        {
                            ID: 'key-scope-1',
                            ResourcePattern: 'Users',
                            PatternType: 'Include',
                            IsDeny: false,
                            Priority: 0
                        },
                        {
                            ID: 'key-scope-2',
                            ResourcePattern: 'Users',
                            PatternType: 'Include',
                            IsDeny: true,
                            Priority: 0  // Same priority, deny should win
                        }
                    ]
                });

                const result = await evaluator.EvaluateAccess(baseRequest, asUserInfo(contextUser));

                expect(result.Allowed).toBe(false);
            });
        });
    });

    describe('GetKeyApplications()', () => {
        it('should return key applications', async () => {
            setMockRunViewResult('MJ: API Key Applications', {
                Success: true,
                Results: [
                    { APIKeyID: 'key-1', ApplicationID: 'app-1' },
                    { APIKeyID: 'key-1', ApplicationID: 'app-2' }
                ]
            });

            const apps = await evaluator.GetKeyApplications('key-1', asUserInfo(contextUser));

            expect(apps).toHaveLength(2);
        });

        it('should return empty array for global keys', async () => {
            setMockRunViewResult('MJ: API Key Applications', {
                Success: true,
                Results: []
            });

            const apps = await evaluator.GetKeyApplications('global-key', asUserInfo(contextUser));

            expect(apps).toHaveLength(0);
        });
    });

    describe('ClearCache()', () => {
        it('should clear all caches', () => {
            // This test just verifies the method doesn't throw
            expect(() => evaluator.ClearCache()).not.toThrow();
        });
    });
});
