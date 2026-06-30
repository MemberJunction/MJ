/**
 * Tests for the API Keys dashboard's pure agent-context helpers:
 * - buildAPIKeysAgentContext: non-sensitive state snapshot → agent context object
 * - isValidAPIKeysTab / isValidAPIKeysFilter: tolerant tool-input validation
 *
 * 🚨 SAFETY: includes an explicit assertion that the published context can NEVER
 * contain a secret-bearing key (hash / prefix / token / secret / password / key
 * value). API Keys is a security-sensitive surface — context is metadata-only:
 * navigation state, aggregate counts, a health score, and bounded FRIENDLY
 * display names (key Labels, App names, Scope categories). A key Label is a
 * user-chosen friendly name, NOT the key value.
 */
import { describe, it, expect } from 'vitest';
import {
    buildAPIKeysAgentContext,
    isValidAPIKeysTab,
    isValidAPIKeysFilter,
    VALID_API_KEYS_TABS,
    VALID_API_KEYS_FILTERS,
    APIKeysAgentContextInput,
} from '../APIKeys/api-keys-agent-context';
import { AGENT_CONTEXT_NAME_LIST_CAP } from '../shared/agent-tool-validation';

function makeInput(overrides: Partial<APIKeysAgentContextInput> = {}): APIKeysAgentContextInput {
    return {
        MainTab: 'keys',
        CurrentView: 'overview',
        ListFilter: 'all',
        IsLoading: false,
        TotalKeys: 10,
        ActiveKeys: 7,
        RevokedKeys: 2,
        ExpiringSoonCount: 1,
        ExpiredKeys: 1,
        NeverUsedKeys: 3,
        ApplicationCount: 4,
        ScopeCount: 12,
        HealthScore: 82,
        KeyLabels: ['CI pipeline', 'Mobile app', 'Webhook relay'],
        TopUsedKeyLabels: ['CI pipeline'],
        ApplicationNames: ['Billing Service', 'Analytics'],
        ScopeCategoryNames: ['Data', 'Admin'],
        SelectedKeyId: null,
        SelectedKeyLabel: null,
        ...overrides,
    };
}

describe('isValidAPIKeysTab', () => {
    it('accepts the four known tabs', () => {
        for (const t of VALID_API_KEYS_TABS) {
            expect(isValidAPIKeysTab(t)).toBe(true);
        }
    });
    it('rejects unknown / non-string values', () => {
        expect(isValidAPIKeysTab('secrets')).toBe(false);
        expect(isValidAPIKeysTab('Keys')).toBe(false); // case-sensitive
        expect(isValidAPIKeysTab(null)).toBe(false);
        expect(isValidAPIKeysTab(42)).toBe(false);
    });
});

describe('isValidAPIKeysFilter', () => {
    it('accepts the six known filters', () => {
        for (const f of VALID_API_KEYS_FILTERS) {
            expect(isValidAPIKeysFilter(f)).toBe(true);
        }
    });
    it('rejects unknown values', () => {
        expect(isValidAPIKeysFilter('leaked')).toBe(false);
        expect(isValidAPIKeysFilter(undefined)).toBe(false);
    });
});

describe('buildAPIKeysAgentContext', () => {
    it('reports navigation, counts, and bounded names', () => {
        const ctx = buildAPIKeysAgentContext(makeInput());
        expect(ctx['MainTab']).toBe('keys');
        expect(ctx['ListFilter']).toBe('all');
        expect(ctx['TotalKeys']).toBe(10);
        expect(ctx['HealthScore']).toBe(82);
        expect(ctx['VisibleKeyLabels']).toEqual(['CI pipeline', 'Mobile app', 'Webhook relay']);
        expect(ctx['ApplicationNames']).toEqual(['Billing Service', 'Analytics']);
        expect(ctx['ScopeCategoryNames']).toEqual(['Data', 'Admin']);
    });

    it('carries selection by id + friendly label only', () => {
        const ctx = buildAPIKeysAgentContext(makeInput({ SelectedKeyId: 'abc-123', SelectedKeyLabel: 'CI pipeline' }));
        expect(ctx['SelectedKeyId']).toBe('abc-123');
        expect(ctx['SelectedKeyLabel']).toBe('CI pipeline');
    });

    it('bounds key-label and app-name lists with a truncation flag', () => {
        const many = Array.from({ length: AGENT_CONTEXT_NAME_LIST_CAP + 8 }, (_, i) => `key-${i}`);
        const ctx = buildAPIKeysAgentContext(makeInput({ KeyLabels: many }));
        expect((ctx['VisibleKeyLabels'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['VisibleKeyLabelsTruncated']).toBe(true);
    });

    it('does not flag truncation when within the cap', () => {
        const ctx = buildAPIKeysAgentContext(makeInput());
        expect(ctx['VisibleKeyLabelsTruncated']).toBe(false);
        expect(ctx['ApplicationNamesTruncated']).toBe(false);
    });

    // 🚨 The load-bearing safety test: the published context must never carry any
    // secret-bearing key, regardless of the input — even when an attacker stuffs
    // secret-looking strings into the Label fields, they are still published as
    // benign display strings under whitelisted, non-secret KEY names.
    it('NEVER leaks a secret-bearing key (security boundary)', () => {
        const SECRET_KEY_PATTERNS = [
            'secret', 'password', 'passwd', 'pwd', 'token', 'apikey', 'api_key',
            'privatekey', 'private_key', 'connectionstring', 'connection_string',
            'secretvalue', 'hash', 'prefix', 'cleartext', 'plaintext', 'bearer',
        ];

        const ctx = buildAPIKeysAgentContext(makeInput({
            KeyLabels: ['Hash injection attempt', 'token=abc'],
            SelectedKeyLabel: 'secret-looking-label',
        }));

        for (const key of Object.keys(ctx)) {
            const lower = key.toLowerCase();
            for (const pattern of SECRET_KEY_PATTERNS) {
                expect(
                    lower.includes(pattern),
                    `Context KEY "${key}" matches secret-like pattern "${pattern}"`,
                ).toBe(false);
            }
        }

        // The set of published keys is fixed + auditable: no field named for key
        // material exists. (Values CAN be friendly labels chosen by a user; the
        // boundary is that we never publish the Hash / KeyPrefix / cleartext key,
        // and there is no input field carrying those.)
        const inputKeys = Object.keys(makeInput());
        expect(inputKeys).not.toContain('Hash');
        expect(inputKeys).not.toContain('KeyPrefix');
        expect(inputKeys).not.toContain('SecretValue');
        expect(inputKeys).not.toContain('KeyValue');
    });
});
