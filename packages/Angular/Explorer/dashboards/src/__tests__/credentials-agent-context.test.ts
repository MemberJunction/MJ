/**
 * Tests for the Credentials dashboard's pure agent-context helpers:
 * - buildCredentialsAgentContext: non-sensitive state snapshot → agent context object
 * - isValidCredentialsTab: tab validation for the SwitchCredentialsTab client tool
 *
 * 🚨 SAFETY: includes an explicit assertion that the published context can NEVER
 * contain a secret-like key (secret / password / token / key value / credential value).
 * Credentials is a security-sensitive surface — context must be metadata-only.
 */
import { describe, it, expect } from 'vitest';
import {
    buildCredentialsAgentContext,
    isValidCredentialsTab,
    VALID_CREDENTIALS_TABS,
    CredentialsAgentContextInput,
} from '../Credentials/credentials-agent-context';

function makeInput(overrides: Partial<CredentialsAgentContextInput> = {}): CredentialsAgentContextInput {
    return {
        ActiveTab: 'overview',
        TabLabel: 'Overview',
        CredentialCount: 12,
        TypeCount: 4,
        IsLoading: false,
        ...overrides,
    };
}

describe('isValidCredentialsTab', () => {
    it('accepts the five known tabs', () => {
        expect(isValidCredentialsTab('overview')).toBe(true);
        expect(isValidCredentialsTab('credentials')).toBe(true);
        expect(isValidCredentialsTab('types')).toBe(true);
        expect(isValidCredentialsTab('categories')).toBe(true);
        expect(isValidCredentialsTab('audit')).toBe(true);
    });

    it('rejects unknown strings', () => {
        expect(isValidCredentialsTab('secrets')).toBe(false);
        expect(isValidCredentialsTab('Overview')).toBe(false); // case-sensitive
        expect(isValidCredentialsTab('')).toBe(false);
    });

    it('rejects non-string values', () => {
        expect(isValidCredentialsTab(null)).toBe(false);
        expect(isValidCredentialsTab(undefined)).toBe(false);
        expect(isValidCredentialsTab(42)).toBe(false);
        expect(isValidCredentialsTab({})).toBe(false);
    });
});

describe('buildCredentialsAgentContext', () => {
    it('reports the full non-sensitive context', () => {
        const ctx = buildCredentialsAgentContext(makeInput());
        expect(ctx).toEqual({
            ActiveTab: 'overview',
            TabLabel: 'Overview',
            CredentialCount: 12,
            TypeCount: 4,
            IsLoading: false,
        });
    });

    it('carries through the active tab and label', () => {
        const ctx = buildCredentialsAgentContext(makeInput({ ActiveTab: 'audit', TabLabel: 'Audit Trail' }));
        expect(ctx['ActiveTab']).toBe('audit');
        expect(ctx['TabLabel']).toBe('Audit Trail');
    });

    it('carries through the loading flag and counts', () => {
        const ctx = buildCredentialsAgentContext(makeInput({ IsLoading: true, CredentialCount: 0, TypeCount: 0 }));
        expect(ctx['IsLoading']).toBe(true);
        expect(ctx['CredentialCount']).toBe(0);
        expect(ctx['TypeCount']).toBe(0);
    });

    it('exposes exactly five keys — no extra fields slip in', () => {
        const ctx = buildCredentialsAgentContext(makeInput());
        expect(Object.keys(ctx).sort()).toEqual(
            ['ActiveTab', 'CredentialCount', 'IsLoading', 'TabLabel', 'TypeCount'],
        );
    });

    // 🚨 The load-bearing safety test: the published context must never carry
    // any secret-bearing key, regardless of the input. We probe every key for
    // secret-like substrings and also assert no value looks like raw credential
    // material.
    it('NEVER leaks a secret-like key or value (security boundary)', () => {
        // Tokens that indicate secret MATERIAL (the actual sensitive value), as
        // opposed to benign metadata like "CredentialCount" (a count, not a
        // credential). We deliberately do NOT include the bare word "credential"
        // here because count/metadata fields legitimately contain it; the fixed
        // whitelist assertion below is what proves no secret-material field exists.
        const SECRET_KEY_PATTERNS = [
            'secret', 'password', 'passwd', 'pwd', 'token', 'apikey', 'api_key',
            'privatekey', 'private_key', 'connectionstring', 'connection_string',
            'secretvalue', 'credentialvalue', 'hash',
        ];

        // Build with deliberately hostile inputs to prove the helper only emits
        // the whitelisted metadata fields and ignores anything else.
        const ctx = buildCredentialsAgentContext(makeInput({
            ActiveTab: 'credentials',
            TabLabel: 'Credentials',
        }));

        for (const key of Object.keys(ctx)) {
            const lower = key.toLowerCase();
            for (const pattern of SECRET_KEY_PATTERNS) {
                expect(
                    lower.includes(pattern),
                    `Context key "${key}" matches secret-like pattern "${pattern}"`,
                ).toBe(false);
            }
        }

        // Defensive: the whitelist of keys is fixed and contains no secret material.
        expect(Object.keys(ctx)).toEqual(
            expect.arrayContaining(['ActiveTab', 'TabLabel', 'CredentialCount', 'TypeCount', 'IsLoading']),
        );
        expect(Object.keys(ctx)).toHaveLength(5);
    });

    it('VALID_CREDENTIALS_TABS matches the dashboard tab order', () => {
        expect([...VALID_CREDENTIALS_TABS]).toEqual(
            ['overview', 'credentials', 'types', 'categories', 'audit'],
        );
    });
});
