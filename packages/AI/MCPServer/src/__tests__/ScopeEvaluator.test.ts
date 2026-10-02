/**
 * Unit tests for MCP Server ScopeEvaluator
 */

import { describe, it, expect } from 'vitest';
import {
    ScopeEvaluator,
    CreateScopeEvaluator,
    CheckScope,
    CheckAnyScope,
    CheckAllScopes,
} from '../auth/ScopeEvaluator';

describe('ScopeEvaluator', () => {
    describe('constructor', () => {
        it('should create an evaluator with given scopes', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'entity:write']);
            expect(evaluator.count).toBe(2);
        });

        it('should create an empty evaluator', () => {
            const evaluator = new ScopeEvaluator([]);
            expect(evaluator.isEmpty()).toBe(true);
            expect(evaluator.count).toBe(0);
        });

        it('should deduplicate scopes', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'entity:read']);
            expect(evaluator.count).toBe(1);
        });
    });

    describe('HasFullAccess', () => {
        it('should return true when full_access is granted', () => {
            const evaluator = new ScopeEvaluator(['full_access']);
            expect(evaluator.HasFullAccess).toBe(true);
        });

        it('should return true when full_access is among other scopes', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'full_access']);
            expect(evaluator.HasFullAccess).toBe(true);
        });

        it('should return false when full_access is not granted', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'entity:write']);
            expect(evaluator.HasFullAccess).toBe(false);
        });

        it('should return false for empty scopes', () => {
            const evaluator = new ScopeEvaluator([]);
            expect(evaluator.HasFullAccess).toBe(false);
        });
    });

    describe('hasScope()', () => {
        it('should return true for granted scope', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'entity:write']);
            expect(evaluator.hasScope('entity:read')).toBe(true);
        });

        it('should return false for missing scope', () => {
            const evaluator = new ScopeEvaluator(['entity:read']);
            expect(evaluator.hasScope('entity:write')).toBe(false);
        });

        it('should be exact match (no wildcard)', () => {
            const evaluator = new ScopeEvaluator(['entity:read']);
            expect(evaluator.hasScope('entity:*')).toBe(false);
        });

        it('should return true for any scope when full_access is granted', () => {
            const evaluator = new ScopeEvaluator(['full_access']);
            expect(evaluator.hasScope('entity:read')).toBe(true);
            expect(evaluator.hasScope('entity:write')).toBe(true);
            expect(evaluator.hasScope('action:execute')).toBe(true);
            expect(evaluator.hasScope('some:arbitrary:scope')).toBe(true);
        });
    });

    describe('hasAnyScope()', () => {
        it('should return true if at least one scope matches', () => {
            const evaluator = new ScopeEvaluator(['entity:read']);
            expect(evaluator.hasAnyScope(['entity:read', 'entity:write'])).toBe(true);
        });

        it('should return false if no scopes match', () => {
            const evaluator = new ScopeEvaluator(['entity:read']);
            expect(evaluator.hasAnyScope(['action:execute', 'agent:run'])).toBe(false);
        });

        it('should return false for empty input', () => {
            const evaluator = new ScopeEvaluator(['entity:read']);
            expect(evaluator.hasAnyScope([])).toBe(false);
        });

        it('should return true for any check when full_access is granted', () => {
            const evaluator = new ScopeEvaluator(['full_access']);
            expect(evaluator.hasAnyScope(['action:execute', 'agent:run'])).toBe(true);
        });
    });

    describe('hasAllScopes()', () => {
        it('should return true when all scopes match', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'entity:write', 'action:execute']);
            expect(evaluator.hasAllScopes(['entity:read', 'entity:write'])).toBe(true);
        });

        it('should return false when not all scopes match', () => {
            const evaluator = new ScopeEvaluator(['entity:read']);
            expect(evaluator.hasAllScopes(['entity:read', 'entity:write'])).toBe(false);
        });

        it('should return true for empty input', () => {
            const evaluator = new ScopeEvaluator(['entity:read']);
            expect(evaluator.hasAllScopes([])).toBe(true);
        });

        it('should return true for any check when full_access is granted', () => {
            const evaluator = new ScopeEvaluator(['full_access']);
            expect(evaluator.hasAllScopes(['entity:read', 'entity:write', 'action:execute'])).toBe(true);
        });
    });

    describe('getScopes()', () => {
        it('should return all granted scopes', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'entity:write']);
            const scopes = evaluator.getScopes();
            expect(scopes).toContain('entity:read');
            expect(scopes).toContain('entity:write');
            expect(scopes).toHaveLength(2);
        });

        it('should return empty array when no scopes', () => {
            const evaluator = new ScopeEvaluator([]);
            expect(evaluator.getScopes()).toEqual([]);
        });
    });

    describe('getScopesMatching()', () => {
        it('should match prefix pattern', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'entity:write', 'action:execute']);
            const matched = evaluator.getScopesMatching('entity:*');
            expect(matched).toContain('entity:read');
            expect(matched).toContain('entity:write');
            expect(matched).not.toContain('action:execute');
        });

        it('should match suffix pattern', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'action:read', 'agent:run']);
            const matched = evaluator.getScopesMatching('*:read');
            expect(matched).toContain('entity:read');
            expect(matched).toContain('action:read');
            expect(matched).not.toContain('agent:run');
        });

        it('should match all with *', () => {
            const evaluator = new ScopeEvaluator(['a', 'b', 'c']);
            expect(evaluator.getScopesMatching('*')).toHaveLength(3);
        });

        it('should match exact', () => {
            const evaluator = new ScopeEvaluator(['entity:read', 'entity:write']);
            expect(evaluator.getScopesMatching('entity:read')).toEqual(['entity:read']);
        });

        it('should return empty for no matches', () => {
            const evaluator = new ScopeEvaluator(['entity:read']);
            expect(evaluator.getScopesMatching('action:*')).toEqual([]);
        });
    });

    describe('isEmpty()', () => {
        it('should return true for empty evaluator', () => {
            expect(new ScopeEvaluator([]).isEmpty()).toBe(true);
        });

        it('should return false for non-empty evaluator', () => {
            expect(new ScopeEvaluator(['a']).isEmpty()).toBe(false);
        });
    });

    describe('count getter', () => {
        it('should return the number of scopes', () => {
            expect(new ScopeEvaluator([]).count).toBe(0);
            expect(new ScopeEvaluator(['a']).count).toBe(1);
            expect(new ScopeEvaluator(['a', 'b', 'c']).count).toBe(3);
        });
    });
});

describe('createScopeEvaluator()', () => {
    it('should create evaluator from claims with scopes', () => {
        const evaluator = CreateScopeEvaluator({ scopes: ['entity:read'] });
        expect(evaluator.hasScope('entity:read')).toBe(true);
    });

    it('should create empty evaluator from claims without scopes', () => {
        const evaluator = CreateScopeEvaluator({});
        expect(evaluator.isEmpty()).toBe(true);
    });

    it('should create empty evaluator from claims with undefined scopes', () => {
        const evaluator = CreateScopeEvaluator({ scopes: undefined });
        expect(evaluator.isEmpty()).toBe(true);
    });
});

describe('checkScope()', () => {
    it('should return true when scope is present', () => {
        expect(CheckScope({ scopes: ['entity:read'] }, 'entity:read')).toBe(true);
    });

    it('should return false when scope is missing', () => {
        expect(CheckScope({ scopes: ['entity:read'] }, 'entity:write')).toBe(false);
    });

    it('should return false when scopes is undefined', () => {
        expect(CheckScope({}, 'entity:read')).toBe(false);
    });

    it('should return true for any scope when full_access is present', () => {
        expect(CheckScope({ scopes: ['full_access'] }, 'entity:read')).toBe(true);
        expect(CheckScope({ scopes: ['full_access'] }, 'action:execute')).toBe(true);
    });
});

describe('checkAnyScope()', () => {
    it('should return true when any scope matches', () => {
        expect(CheckAnyScope({ scopes: ['entity:read'] }, ['entity:read', 'entity:write'])).toBe(true);
    });

    it('should return false when no scope matches', () => {
        expect(CheckAnyScope({ scopes: ['entity:read'] }, ['action:execute'])).toBe(false);
    });

    it('should return false when scopes is undefined', () => {
        expect(CheckAnyScope({}, ['entity:read'])).toBe(false);
    });

    it('should return true for any check when full_access is present', () => {
        expect(CheckAnyScope({ scopes: ['full_access'] }, ['action:execute', 'agent:run'])).toBe(true);
    });
});

describe('checkAllScopes()', () => {
    it('should return true when all scopes present', () => {
        expect(CheckAllScopes({ scopes: ['a', 'b'] }, ['a', 'b'])).toBe(true);
    });

    it('should return false when not all present', () => {
        expect(CheckAllScopes({ scopes: ['a'] }, ['a', 'b'])).toBe(false);
    });

    it('should return false when scopes is undefined', () => {
        expect(CheckAllScopes({}, ['a'])).toBe(false);
    });

    it('should return true for any check when full_access is present', () => {
        expect(CheckAllScopes({ scopes: ['full_access'] }, ['a', 'b', 'c'])).toBe(true);
    });
});
