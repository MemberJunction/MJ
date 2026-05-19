/**
 * Unit tests for forEach/while loop template variable resolution.
 *
 * Tests cover:
 * - resolveValueFromContext: single variable, property paths, context vars
 * - resolveInlineTemplateExpressions: multiple {{}} in a string
 * - resolveTemplates: recursive object param resolution
 * - Edge cases: unresolved expressions, mixed types, nested paths
 *
 * Since these methods are protected on BaseAgent, we test them via a
 * minimal subclass that exposes the methods publicly.
 *
 * @since 2.46.0
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Test Helpers - Standalone implementations mirroring BaseAgent methods
// These avoid needing to instantiate BaseAgent with all its dependencies
// ============================================================================

/**
 * Mirrors BaseAgent.getValueFromPath
 */
function getValueFromPath(obj: Record<string, unknown> | unknown, path: string): unknown {
    if (obj == null || !path) return undefined;

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current == null) return undefined;

        // Handle array indexing: items[0]
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
            const [, arrName, idxStr] = arrayMatch;
            const arr = (current as Record<string, unknown>)[arrName];
            if (!Array.isArray(arr)) return undefined;
            current = arr[parseInt(idxStr, 10)];
        } else {
            current = (current as Record<string, unknown>)[part];
        }
    }

    return current;
}

/**
 * Mirrors BaseAgent.resolveValueFromContext
 */
function resolveValueFromContext(
    value: string,
    context: Record<string, unknown>,
    itemVariable: string
): unknown {
    const trimmedValue = value.trim();
    if (trimmedValue.startsWith('{{') && trimmedValue.endsWith('}}')) {
        value = trimmedValue.substring(2, trimmedValue.length - 2).trim();
    } else if (trimmedValue.includes('{{')) {
        return resolveInlineTemplateExpressions(trimmedValue, context, itemVariable);
    }

    const ivToLower = itemVariable?.trim().toLowerCase();
    const valueLower = value?.toLowerCase();

    if (valueLower === ivToLower) {
        return context.item;
    }

    if (valueLower?.startsWith(`${ivToLower}.`)) {
        const path = value.substring(ivToLower.length + 1);
        return getValueFromPath(context.item as Record<string, unknown>, path);
    }

    for (const [varName, varValue] of Object.entries(context)) {
        if (value === varName) {
            return varValue;
        }
        if (value?.trim().toLowerCase().startsWith(`${varName}.`)) {
            const path = value.substring(varName.length + 1);
            return getValueFromPath(varValue as Record<string, unknown>, path);
        }
    }

    return value;
}

/**
 * Mirrors BaseAgent.resolveInlineTemplateExpressions
 */
function resolveInlineTemplateExpressions(
    template: string,
    context: Record<string, unknown>,
    itemVariable: string
): string {
    const expressionPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
    return template.replace(expressionPattern, (_match: string, expr: string) => {
        const resolved = resolveValueFromContext(expr.trim(), context, itemVariable);
        if (resolved === expr.trim()) {
            return _match;
        }
        return String(resolved ?? '');
    });
}

/**
 * Mirrors BaseAgent.resolveTemplates
 */
function resolveTemplates(
    obj: Record<string, unknown>,
    context: Record<string, unknown>,
    itemVariable: string
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            result[key] = resolveValueFromContext(value, context, itemVariable);
        } else if (Array.isArray(value)) {
            result[key] = value.map(v =>
                typeof v === 'string' ? resolveValueFromContext(v, context, itemVariable) : v
            );
        } else if (typeof value === 'object' && value !== null) {
            result[key] = resolveTemplates(value as Record<string, unknown>, context, itemVariable);
        } else {
            result[key] = value;
        }
    }

    return result;
}

// ============================================================================
// Tests
// ============================================================================

describe('resolveValueFromContext', () => {
    // ─── Scalar item variable ───────────────────────────────────────

    describe('scalar item variable', () => {
        const context = {
            item: 'Tokyo',
            index: 0,
            payload: { cities: ['Tokyo', 'London'] },
            data: {}
        };
        const itemVariable = 'city';

        it('should resolve bare variable name to item value', () => {
            expect(resolveValueFromContext('city', context, itemVariable)).toBe('Tokyo');
        });

        it('should resolve {{wrapped}} variable to item value', () => {
            expect(resolveValueFromContext('{{city}}', context, itemVariable)).toBe('Tokyo');
        });

        it('should resolve {{ spaced }} variable to item value', () => {
            expect(resolveValueFromContext('{{ city }}', context, itemVariable)).toBe('Tokyo');
        });

        it('should be case-insensitive for variable name', () => {
            expect(resolveValueFromContext('City', context, itemVariable)).toBe('Tokyo');
            expect(resolveValueFromContext('CITY', context, itemVariable)).toBe('Tokyo');
        });
    });

    // ─── Object item with property path ─────────────────────────────

    describe('object item with property path', () => {
        const context = {
            item: { city: 'Tokyo', country: 'Japan', population: 14000000 },
            index: 0,
            payload: {},
            data: {}
        };
        const itemVariable = 'cityInfo';

        it('should resolve property path', () => {
            expect(resolveValueFromContext('cityInfo.city', context, itemVariable)).toBe('Tokyo');
        });

        it('should resolve {{wrapped}} property path', () => {
            expect(resolveValueFromContext('{{cityInfo.country}}', context, itemVariable)).toBe('Japan');
        });

        it('should resolve numeric property', () => {
            expect(resolveValueFromContext('cityInfo.population', context, itemVariable)).toBe(14000000);
        });

        it('should resolve exact match to full object', () => {
            const result = resolveValueFromContext('cityInfo', context, itemVariable);
            expect(result).toEqual({ city: 'Tokyo', country: 'Japan', population: 14000000 });
        });

        it('should return undefined for non-existent path', () => {
            expect(resolveValueFromContext('cityInfo.zipCode', context, itemVariable)).toBeUndefined();
        });
    });

    // ─── Nested object property paths ───────────────────────────────

    describe('nested object paths', () => {
        const context = {
            item: { address: { street: '123 Main St', zip: '10001' } },
            index: 0,
            payload: {},
            data: {}
        };

        it('should resolve deeply nested paths', () => {
            expect(resolveValueFromContext('loc.address.street', context, 'loc')).toBe('123 Main St');
        });
    });

    // ─── Context variable references ────────────────────────────────

    describe('context variable references', () => {
        const context = {
            item: 'ignored',
            index: 3,
            payload: { results: [1, 2, 3] },
            data: { apiKey: 'abc123' }
        };

        it('should resolve index', () => {
            expect(resolveValueFromContext('index', context, 'item')).toBe(3);
        });

        it('should resolve payload path', () => {
            expect(resolveValueFromContext('payload.results', context, 'item')).toEqual([1, 2, 3]);
        });

        it('should resolve data path', () => {
            expect(resolveValueFromContext('data.apiKey', context, 'item')).toBe('abc123');
        });
    });

    // ─── Literal passthrough ────────────────────────────────────────

    describe('literal passthrough', () => {
        const context = { item: 'test', index: 0, payload: {}, data: {} };

        it('should return literal string when no match', () => {
            expect(resolveValueFromContext('hello world', context, 'x')).toBe('hello world');
        });

        it('should return number-like string as-is', () => {
            expect(resolveValueFromContext('42', context, 'x')).toBe('42');
        });
    });
});

// ============================================================================
// Inline Template Interpolation (the new feature)
// ============================================================================

describe('resolveInlineTemplateExpressions', () => {
    const context = {
        item: { city: 'Tokyo', country: 'Japan', rank: 1 },
        index: 0,
        payload: { query: 'companies' },
        data: {}
    };
    const itemVariable = 'cityInfo';

    it('should resolve multiple embedded variables', () => {
        const result = resolveInlineTemplateExpressions(
            'largest company in {{cityInfo.city}} {{cityInfo.country}}',
            context, itemVariable
        );
        expect(result).toBe('largest company in Tokyo Japan');
    });

    it('should resolve single embedded variable with surrounding text', () => {
        const result = resolveInlineTemplateExpressions(
            'weather forecast for {{cityInfo.city}}',
            context, itemVariable
        );
        expect(result).toBe('weather forecast for Tokyo');
    });

    it('should handle spaces inside braces', () => {
        const result = resolveInlineTemplateExpressions(
            'info about {{ cityInfo.city }} in {{ cityInfo.country }}',
            context, itemVariable
        );
        expect(result).toBe('info about Tokyo in Japan');
    });

    it('should stringify numeric values', () => {
        const result = resolveInlineTemplateExpressions(
            'rank #{{cityInfo.rank}} city',
            context, itemVariable
        );
        expect(result).toBe('rank #1 city');
    });

    it('should resolve context variables (not just item)', () => {
        const result = resolveInlineTemplateExpressions(
            'item {{index}}: {{cityInfo.city}} for {{payload.query}}',
            context, itemVariable
        );
        expect(result).toBe('item 0: Tokyo for companies');
    });

    it('should preserve unresolved expressions', () => {
        const result = resolveInlineTemplateExpressions(
            'looking for {{cityInfo.city}} in {{unknown.field}}',
            context, itemVariable
        );
        expect(result).toBe('looking for Tokyo in {{unknown.field}}');
    });

    it('should handle string with no template expressions', () => {
        const result = resolveInlineTemplateExpressions(
            'plain text with no variables',
            context, itemVariable
        );
        expect(result).toBe('plain text with no variables');
    });

    it('should handle adjacent expressions', () => {
        const result = resolveInlineTemplateExpressions(
            '{{cityInfo.city}}{{cityInfo.country}}',
            context, itemVariable
        );
        expect(result).toBe('TokyoJapan');
    });
});

// ============================================================================
// resolveTemplates (recursive object resolution)
// ============================================================================

describe('resolveTemplates', () => {
    const context = {
        item: { city: 'London', country: 'UK' },
        index: 2,
        payload: {},
        data: {}
    };
    const itemVariable = 'loc';

    it('should resolve string params', () => {
        const result = resolveTemplates(
            { SearchTerms: '{{loc.city}}', Limit: '10' },
            context, itemVariable
        );
        expect(result.SearchTerms).toBe('London');
        expect(result.Limit).toBe('10');
    });

    it('should resolve inline template params', () => {
        const result = resolveTemplates(
            { SearchTerms: 'largest company in {{loc.city}} {{loc.country}}' },
            context, itemVariable
        );
        expect(result.SearchTerms).toBe('largest company in London UK');
    });

    it('should resolve nested object params', () => {
        const result = resolveTemplates(
            { filters: { location: '{{loc.city}}', country: '{{loc.country}}' } },
            context, itemVariable
        );
        expect(result.filters).toEqual({ location: 'London', country: 'UK' });
    });

    it('should resolve array params', () => {
        const result = resolveTemplates(
            { tags: ['{{loc.city}}', 'static', '{{loc.country}}'] },
            context, itemVariable
        );
        expect(result.tags).toEqual(['London', 'static', 'UK']);
    });

    it('should pass through non-string values', () => {
        const result = resolveTemplates(
            { count: 5 as unknown, flag: true as unknown, label: '{{loc.city}}' },
            context, itemVariable
        );
        expect(result.count).toBe(5);
        expect(result.flag).toBe(true);
        expect(result.label).toBe('London');
    });

    it('should handle the exact failing case from the bug report', () => {
        const weatherContext = {
            item: { city: 'Tokyo', country: 'Japan' },
            index: 0,
            payload: { weatherData: [{ city: 'Tokyo', country: 'Japan' }] },
            data: {}
        };
        const result = resolveTemplates(
            { SearchTerms: 'largest publicly traded company in {{cityInfo.city}} {{cityInfo.country}}' },
            weatherContext, 'cityInfo'
        );
        expect(result.SearchTerms).toBe('largest publicly traded company in Tokyo Japan');
    });
});
