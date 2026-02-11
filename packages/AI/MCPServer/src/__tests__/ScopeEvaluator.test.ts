/**
 * Unit tests for MCP Server ScopeEvaluator
 */

import { describe, it, expect } from 'vitest';
import {
    ScopeEvaluator,
    createScopeEvaluator,
    checkScope,
    checkAnyScope,
    checkAllScopes,
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
        const evaluator = createScopeEvaluator({ scopes: ['entity:read'] });
        expect(evaluator.hasScope('entity:read')).toBe(true);
    });

    it('should create empty evaluator from claims without scopes', () => {
        const evaluator = createScopeEvaluator({});
        expect(evaluator.isEmpty()).toBe(true);
    });

    it('should create empty evaluator from claims with undefined scopes', () => {
        const evaluator = createScopeEvaluator({ scopes: undefined });
        expect(evaluator.isEmpty()).toBe(true);
    });
});

describe('checkScope()', () => {
    it('should return true when scope is present', () => {
        expect(checkScope({ scopes: ['entity:read'] }, 'entity:read')).toBe(true);
    });

    it('should return false when scope is missing', () => {
        expect(checkScope({ scopes: ['entity:read'] }, 'entity:write')).toBe(false);
    });

    it('should return false when scopes is undefined', () => {
        expect(checkScope({}, 'entity:read')).toBe(false);
    });
});

describe('checkAnyScope()', () => {
    it('should return true when any scope matches', () => {
        expect(checkAnyScope({ scopes: ['entity:read'] }, ['entity:read', 'entity:write'])).toBe(true);
    });

    it('should return false when no scope matches', () => {
        expect(checkAnyScope({ scopes: ['entity:read'] }, ['action:execute'])).toBe(false);
    });

    it('should return false when scopes is undefined', () => {
        expect(checkAnyScope({}, ['entity:read'])).toBe(false);
    });
});

describe('checkAllScopes()', () => {
    it('should return true when all scopes present', () => {
        expect(checkAllScopes({ scopes: ['a', 'b'] }, ['a', 'b'])).toBe(true);
    });

    it('should return false when not all present', () => {
        expect(checkAllScopes({ scopes: ['a'] }, ['a', 'b'])).toBe(false);
    });

    it('should return false when scopes is undefined', () => {
        expect(checkAllScopes({}, ['a'])).toBe(false);
    });
});
