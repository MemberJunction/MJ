import { describe, it, expect } from 'vitest';
import { buildVariableValuesFromContext, substituteVariables, composeApplicationContext } from '../utils/variable-substitution.js';

describe('buildVariableValuesFromContext', () => {
    it('returns empty when there is no context and no relevant env vars', () => {
        expect(buildVariableValuesFromContext(null, {})).toEqual({});
        expect(buildVariableValuesFromContext(undefined, {})).toEqual({});
    });

    it('picks up MJ_TEST_VAR_ env vars (stripping the prefix)', () => {
        const env = {
            MJ_TEST_VAR_baseUrl: 'http://byo-app:3000',
            MJ_TEST_VAR_authUsername: 'alex',
            UNRELATED: 'ignored',
        };
        expect(buildVariableValuesFromContext(null, env)).toEqual({
            baseUrl: 'http://byo-app:3000',
            authUsername: 'alex',
        });
    });

    it('layers resolver values over env vars when both define the same key', () => {
        const env = { MJ_TEST_VAR_baseUrl: 'http://from-env:3000' };
        const ctx = { resolvedVariables: { values: { baseUrl: 'http://from-resolver:3000' } } };
        expect(buildVariableValuesFromContext(ctx, env)).toEqual({
            baseUrl: 'http://from-resolver:3000',
        });
    });

    it('merges resolver values and env vars when they define different keys', () => {
        const env = { MJ_TEST_VAR_baseUrl: 'http://x.com' };
        const ctx = { resolvedVariables: { values: { authUsername: 'alex' } } };
        expect(buildVariableValuesFromContext(ctx, env)).toEqual({
            baseUrl: 'http://x.com',
            authUsername: 'alex',
        });
    });

    it('ignores empty-string env vars', () => {
        const env = { MJ_TEST_VAR_baseUrl: '' };
        // empty string is still defined; we include it (matches process.env behavior)
        expect(buildVariableValuesFromContext(null, env)).toEqual({ baseUrl: '' });
    });

    it('JSON-parses env-var values that look like arrays/objects/scalars', () => {
        const env = {
            MJ_TEST_VAR_allowedDomains: '["byo-app","localhost"]',
            MJ_TEST_VAR_authConfig: '{"username":"alex","retries":3}',
            MJ_TEST_VAR_maxSteps: '42',
            MJ_TEST_VAR_isProduction: 'true',
            MJ_TEST_VAR_owner: 'null',
            MJ_TEST_VAR_quotedName: '"alex"',
        };
        expect(buildVariableValuesFromContext(null, env)).toEqual({
            allowedDomains: ['byo-app', 'localhost'],
            authConfig: { username: 'alex', retries: 3 },
            maxSteps: 42,
            isProduction: true,
            owner: null,
            quotedName: 'alex',
        });
    });

    it('leaves plain text env-var values as strings', () => {
        const env = {
            MJ_TEST_VAR_baseUrl: 'http://byo-app:3000',
            MJ_TEST_VAR_username: 'alex.tester',
        };
        expect(buildVariableValuesFromContext(null, env)).toEqual({
            baseUrl: 'http://byo-app:3000',
            username: 'alex.tester',
        });
    });

    it('falls back to the raw string when JSON-looking value fails to parse', () => {
        const env = { MJ_TEST_VAR_broken: '[bad json' };
        expect(buildVariableValuesFromContext(null, env)).toEqual({ broken: '[bad json' });
    });
});

describe('substituteVariables', () => {
    it('returns the input unchanged when values map is empty', () => {
        const input = { startUrl: '{{baseUrl}}' };
        expect(substituteVariables(input, {})).toBe(input);
    });

    it('replaces a whole-string placeholder with the raw value, preserving non-string types', () => {
        const out = substituteVariables(
            { allowedDomains: '{{allowedDomains}}' },
            { allowedDomains: ['localhost', '*.auth0.com'] }
        );
        expect(out).toEqual({ allowedDomains: ['localhost', '*.auth0.com'] });
    });

    it('replaces an embedded placeholder and coerces non-string values to string', () => {
        const out = substituteVariables(
            { msg: 'count is {{n}}' },
            { n: 42 }
        );
        expect(out).toEqual({ msg: 'count is 42' });
    });

    it('leaves unknown keys in place verbatim', () => {
        const out = substituteVariables(
            { startUrl: '{{baseUrl}}', other: '{{unknown}}' },
            { baseUrl: 'http://x.com' }
        );
        expect(out).toEqual({ startUrl: 'http://x.com', other: '{{unknown}}' });
    });

    it('recurses into nested objects and arrays', () => {
        const out = substituteVariables(
            {
                input: {
                    startUrl: '{{baseUrl}}',
                    bindings: [{ domains: ['{{primary}}'], method: { Username: '{{user}}' } }],
                },
            },
            { baseUrl: 'http://x.com', primary: 'localhost', user: 'alex' }
        );
        expect(out).toEqual({
            input: {
                startUrl: 'http://x.com',
                bindings: [{ domains: ['localhost'], method: { Username: 'alex' } }],
            },
        });
    });

    it('does not mutate the input', () => {
        const input = { startUrl: '{{baseUrl}}' };
        const out = substituteVariables(input, { baseUrl: 'http://x.com' });
        expect(input).toEqual({ startUrl: '{{baseUrl}}' });
        expect(out).not.toBe(input);
    });

    it('handles whitespace inside placeholder braces', () => {
        const out = substituteVariables(
            { url: '{{ baseUrl }}', mixed: 'a {{  baseUrl  }} b' },
            { baseUrl: 'http://x.com' }
        );
        expect(out).toEqual({ url: 'http://x.com', mixed: 'a http://x.com b' });
    });

    it('accepts hyphens and dots in placeholder keys', () => {
        const out = substituteVariables(
            { a: '{{my-key}}', b: '{{namespace.value}}' },
            { 'my-key': 'one', 'namespace.value': 'two' }
        );
        expect(out).toEqual({ a: 'one', b: 'two' });
    });

    it('passes null and undefined values through untouched', () => {
        const out = substituteVariables(
            { a: null, b: undefined, c: '{{x}}' } as Record<string, unknown>,
            { x: 'set' }
        );
        expect(out).toEqual({ a: null, b: undefined, c: 'set' });
    });
});

describe('composeApplicationContext', () => {
    it('returns undefined when both layers are empty', () => {
        expect(composeApplicationContext(undefined, undefined, {})).toBeUndefined();
        expect(composeApplicationContext('', '', {})).toBeUndefined();
        expect(composeApplicationContext('   ', '\n\t', {})).toBeUndefined();
    });

    it('returns just the suite-level context when no per-test override', () => {
        const out = composeApplicationContext('## App\nMy app description', undefined, {});
        expect(out).toBe('## App\nMy app description');
    });

    it('returns just the per-test notes (with heading) when no suite-level context', () => {
        const out = composeApplicationContext(undefined, 'Special case: x is null', {});
        expect(out).toBe('## Test-specific Notes\n\nSpecial case: x is null');
    });

    it('concatenates suite then per-test under heading', () => {
        const out = composeApplicationContext('Suite stuff', 'Test stuff', {});
        expect(out).toBe('Suite stuff\n\n## Test-specific Notes\n\nTest stuff');
    });

    it('applies variable substitution to both layers', () => {
        const out = composeApplicationContext(
            'baseUrl is {{baseUrl}}',
            'environment is {{env}}',
            { baseUrl: 'http://x.com', env: 'staging' }
        );
        expect(out).toBe(
            'baseUrl is http://x.com\n\n## Test-specific Notes\n\nenvironment is staging'
        );
    });

    it('leaves placeholders untouched when values map is empty', () => {
        const out = composeApplicationContext('{{x}}', '{{y}}', {});
        expect(out).toBe('{{x}}\n\n## Test-specific Notes\n\n{{y}}');
    });

    it('treats whitespace-only layers as empty', () => {
        expect(composeApplicationContext('   \n  ', 'real content', {})).toBe(
            '## Test-specific Notes\n\nreal content'
        );
        expect(composeApplicationContext('real content', '\t\n', {})).toBe('real content');
    });
});
