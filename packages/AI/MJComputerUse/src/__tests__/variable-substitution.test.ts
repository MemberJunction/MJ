import { describe, it, expect } from 'vitest';
import { BuildVariableValuesFromContext, SubstituteVariables, ComposeApplicationContext, FindUnresolvedPlaceholders, FindUnresolvedAuthPlaceholders } from '../utils/variable-substitution.js';

describe('buildVariableValuesFromContext', () => {
    it('returns empty when there is no context and no relevant env vars', () => {
        expect(BuildVariableValuesFromContext(null, {})).toEqual({});
        expect(BuildVariableValuesFromContext(undefined, {})).toEqual({});
    });

    it('picks up MJ_TEST_VAR_ env vars (stripping the prefix)', () => {
        const env = {
            MJ_TEST_VAR_baseUrl: 'http://byo-app:3000',
            MJ_TEST_VAR_authUsername: 'alex',
            UNRELATED: 'ignored',
        };
        expect(BuildVariableValuesFromContext(null, env)).toEqual({
            baseUrl: 'http://byo-app:3000',
            authUsername: 'alex',
        });
    });

    it('layers resolver values over env vars when both define the same key', () => {
        const env = { MJ_TEST_VAR_baseUrl: 'http://from-env:3000' };
        const ctx = { resolvedVariables: { values: { baseUrl: 'http://from-resolver:3000' } } };
        expect(BuildVariableValuesFromContext(ctx, env)).toEqual({
            baseUrl: 'http://from-resolver:3000',
        });
    });

    it('merges resolver values and env vars when they define different keys', () => {
        const env = { MJ_TEST_VAR_baseUrl: 'http://x.com' };
        const ctx = { resolvedVariables: { values: { authUsername: 'alex' } } };
        expect(BuildVariableValuesFromContext(ctx, env)).toEqual({
            baseUrl: 'http://x.com',
            authUsername: 'alex',
        });
    });

    it('ignores empty-string env vars', () => {
        const env = { MJ_TEST_VAR_baseUrl: '' };
        // An empty value is a variable nobody set, not a variable set to "".
        // docker-compose declares every one as `"${MJ_TEST_VAR_x:-}"`, so the key is
        // always present in the container; including it substituted "" into the
        // auth bindings and the suite logged in with blank credentials.
        expect(BuildVariableValuesFromContext(null, env)).toEqual({});
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
        expect(BuildVariableValuesFromContext(null, env)).toEqual({
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
        expect(BuildVariableValuesFromContext(null, env)).toEqual({
            baseUrl: 'http://byo-app:3000',
            username: 'alex.tester',
        });
    });

    it('falls back to the raw string when JSON-looking value fails to parse', () => {
        const env = { MJ_TEST_VAR_broken: '[bad json' };
        expect(BuildVariableValuesFromContext(null, env)).toEqual({ broken: '[bad json' });
    });
});

describe('substituteVariables', () => {
    it('returns the input unchanged when values map is empty', () => {
        const input = { startUrl: '{{baseUrl}}' };
        expect(SubstituteVariables(input, {})).toBe(input);
    });

    it('replaces a whole-string placeholder with the raw value, preserving non-string types', () => {
        const out = SubstituteVariables(
            { allowedDomains: '{{allowedDomains}}' },
            { allowedDomains: ['localhost', '*.auth0.com'] }
        );
        expect(out).toEqual({ allowedDomains: ['localhost', '*.auth0.com'] });
    });

    it('replaces an embedded placeholder and coerces non-string values to string', () => {
        const out = SubstituteVariables(
            { msg: 'count is {{n}}' },
            { n: 42 }
        );
        expect(out).toEqual({ msg: 'count is 42' });
    });

    it('leaves unknown keys in place verbatim', () => {
        const out = SubstituteVariables(
            { startUrl: '{{baseUrl}}', other: '{{unknown}}' },
            { baseUrl: 'http://x.com' }
        );
        expect(out).toEqual({ startUrl: 'http://x.com', other: '{{unknown}}' });
    });

    it('recurses into nested objects and arrays', () => {
        const out = SubstituteVariables(
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
        const out = SubstituteVariables(input, { baseUrl: 'http://x.com' });
        expect(input).toEqual({ startUrl: '{{baseUrl}}' });
        expect(out).not.toBe(input);
    });

    it('handles whitespace inside placeholder braces', () => {
        const out = SubstituteVariables(
            { url: '{{ baseUrl }}', mixed: 'a {{  baseUrl  }} b' },
            { baseUrl: 'http://x.com' }
        );
        expect(out).toEqual({ url: 'http://x.com', mixed: 'a http://x.com b' });
    });

    it('accepts hyphens and dots in placeholder keys', () => {
        const out = SubstituteVariables(
            { a: '{{my-key}}', b: '{{namespace.value}}' },
            { 'my-key': 'one', 'namespace.value': 'two' }
        );
        expect(out).toEqual({ a: 'one', b: 'two' });
    });

    it('passes null and undefined values through untouched', () => {
        const out = SubstituteVariables(
            { a: null, b: undefined, c: '{{x}}' } as Record<string, unknown>,
            { x: 'set' }
        );
        expect(out).toEqual({ a: null, b: undefined, c: 'set' });
    });
});

describe('composeApplicationContext', () => {
    it('returns undefined when both layers are empty', () => {
        expect(ComposeApplicationContext(undefined, undefined, {})).toBeUndefined();
        expect(ComposeApplicationContext('', '', {})).toBeUndefined();
        expect(ComposeApplicationContext('   ', '\n\t', {})).toBeUndefined();
    });

    it('returns just the suite-level context when no per-test override', () => {
        const out = ComposeApplicationContext('## App\nMy app description', undefined, {});
        expect(out).toBe('## App\nMy app description');
    });

    it('returns just the per-test notes (with heading) when no suite-level context', () => {
        const out = ComposeApplicationContext(undefined, 'Special case: x is null', {});
        expect(out).toBe('## Test-specific Notes\n\nSpecial case: x is null');
    });

    it('concatenates suite then per-test under heading', () => {
        const out = ComposeApplicationContext('Suite stuff', 'Test stuff', {});
        expect(out).toBe('Suite stuff\n\n## Test-specific Notes\n\nTest stuff');
    });

    it('applies variable substitution to both layers', () => {
        const out = ComposeApplicationContext(
            'baseUrl is {{baseUrl}}',
            'environment is {{env}}',
            { baseUrl: 'http://x.com', env: 'staging' }
        );
        expect(out).toBe(
            'baseUrl is http://x.com\n\n## Test-specific Notes\n\nenvironment is staging'
        );
    });

    it('leaves placeholders untouched when values map is empty', () => {
        const out = ComposeApplicationContext('{{x}}', '{{y}}', {});
        expect(out).toBe('{{x}}\n\n## Test-specific Notes\n\n{{y}}');
    });

    it('treats whitespace-only layers as empty', () => {
        expect(ComposeApplicationContext('   \n  ', 'real content', {})).toBe(
            '## Test-specific Notes\n\nreal content'
        );
        expect(ComposeApplicationContext('real content', '\t\n', {})).toBe('real content');
    });
});

describe('findUnresolvedPlaceholders', () => {
    it('returns [] for a fully-resolved string', () => {
        expect(FindUnresolvedPlaceholders('http://localhost:4200/app')).toEqual([]);
    });

    it('returns [] for undefined/empty', () => {
        expect(FindUnresolvedPlaceholders(undefined)).toEqual([]);
        expect(FindUnresolvedPlaceholders('')).toEqual([]);
    });

    it('finds a single unresolved placeholder', () => {
        expect(FindUnresolvedPlaceholders('{{baseUrl}}/dashboard')).toEqual(['baseUrl']);
    });

    it('finds multiple distinct placeholders and de-dupes', () => {
        const out = FindUnresolvedPlaceholders('{{scheme}}://{{host}}/{{host}}');
        expect(out.sort()).toEqual(['host', 'scheme']);
    });

    it('matches the substitution grammar (whitespace, dots, hyphens)', () => {
        expect(FindUnresolvedPlaceholders('{{ base.url-v2 }}')).toEqual(['base.url-v2']);
    });

    it('agrees with substituteVariables: a provided key leaves nothing unresolved', () => {
        const resolved = SubstituteVariables({ u: '{{baseUrl}}/x' }, { baseUrl: 'http://h' });
        expect(FindUnresolvedPlaceholders((resolved as { u: string }).u)).toEqual([]);
    });
});

describe('empty MJ_TEST_VAR_* values (regression: blank Auth0 credentials)', () => {
    it('treats an empty env var as UNSET, so a blank value never substitutes', () => {
        // docker-compose declares MJ_TEST_VAR_authUsername: "${MJ_TEST_VAR_authUsername:-}",
        // so inside the container the key always exists — as "" when the host never set it.
        // Keeping it turned every login into a blank-credential submit against Auth0.
        const values = BuildVariableValuesFromContext(null, {
            MJ_TEST_VAR_authUsername: '',
            MJ_TEST_VAR_authPassword: '',
            MJ_TEST_VAR_baseUrl: 'http://localhost:4200',
        } as NodeJS.ProcessEnv);

        expect(values).not.toHaveProperty('authUsername');
        expect(values).not.toHaveProperty('authPassword');
        expect(values.baseUrl).toBe('http://localhost:4200');
    });

    it('keeps a whitespace-only value out too', () => {
        const values = BuildVariableValuesFromContext(null, {
            MJ_TEST_VAR_authPassword: '   ',
        } as NodeJS.ProcessEnv);
        expect(values).not.toHaveProperty('authPassword');
    });

    it('still keeps legitimately falsy non-empty values', () => {
        const values = BuildVariableValuesFromContext(null, {
            MJ_TEST_VAR_retries: '0',
            MJ_TEST_VAR_headless: 'false',
        } as NodeJS.ProcessEnv);
        expect(values.retries).toBe(0);
        expect(values.headless).toBe(false);
    });

    it('a resolver value still wins over an absent env var', () => {
        const values = BuildVariableValuesFromContext(
            { resolvedVariables: { values: { authUsername: 'alex@example.com' } } },
            { MJ_TEST_VAR_authUsername: '' } as NodeJS.ProcessEnv
        );
        expect(values.authUsername).toBe('alex@example.com');
    });
});

describe('findUnresolvedAuthPlaceholders', () => {
    const auth = (method: Record<string, unknown>) => ({ bindings: [{ domains: ['localhost'], method }] });

    it('finds an unresolved password, which would otherwise fail at the IdP looking like bad credentials', () => {
        const found = FindUnresolvedAuthPlaceholders(auth({
            Type: 'Basic', Strategy: 'FormLogin',
            Username: '{{authUsername}}', Password: '{{authPassword}}',
        }));
        expect(found).toEqual([
            'auth.bindings[0].Username:{{authUsername}}',
            'auth.bindings[0].Password:{{authPassword}}',
        ]);
    });

    it('is quiet when every placeholder resolved', () => {
        expect(FindUnresolvedAuthPlaceholders(auth({
            Username: 'alex@example.com', Password: 'hunter2',
        }))).toEqual([]);
    });

    it('labels the binding index so a multi-domain test says which one', () => {
        const found = FindUnresolvedAuthPlaceholders({
            bindings: [
                { domains: ['a'], method: { Username: 'set' } },
                { domains: ['b'], method: { Password: '{{otherPassword}}' } },
            ],
        });
        expect(found).toEqual(['auth.bindings[1].Password:{{otherPassword}}']);
    });

    it('tolerates a missing/!array auth block rather than throwing mid-run', () => {
        expect(FindUnresolvedAuthPlaceholders(undefined)).toEqual([]);
        expect(FindUnresolvedAuthPlaceholders({})).toEqual([]);
        expect(FindUnresolvedAuthPlaceholders({ bindings: 'nope' })).toEqual([]);
        expect(FindUnresolvedAuthPlaceholders({ bindings: [{ domains: ['a'] }] })).toEqual([]);
    });

    it('ignores non-string method fields', () => {
        expect(FindUnresolvedAuthPlaceholders(auth({ Timeout: 5000, Nested: { x: '{{y}}' } }))).toEqual([]);
    });
});
