import { describe, it, expect } from 'vitest';
import {
    DescribeSystemApiKeyRejection,
    GetSystemApiKeyRejection,
    IsSystemApiKeyMatch,
    IsUsableSystemApiKey,
    MIN_SYSTEM_API_KEY_LENGTH,
    SystemApiKeysMatch,
} from '../systemKeyAuth.js';

const STRONG_KEY = 'k9$Tq2!vLx7#Pz4@Wn8&';

describe('GetSystemApiKeyRejection', () => {
    it('reports a missing key for undefined, null, empty and whitespace', () => {
        expect(GetSystemApiKeyRejection(undefined)).toBe('missing');
        expect(GetSystemApiKeyRejection(null)).toBe('missing');
        expect(GetSystemApiKeyRejection('')).toBe('missing');
        expect(GetSystemApiKeyRejection('   ')).toBe('missing');
    });

    it('rejects the placeholder that shipped in mj.config.cjs, in any case and with padding', () => {
        expect(GetSystemApiKeyRejection('MY_API_KEY_FOR_MCP_SERVER')).toBe('placeholder');
        expect(GetSystemApiKeyRejection('my_api_key_for_mcp_server')).toBe('placeholder');
        expect(GetSystemApiKeyRejection('  MY_API_KEY_FOR_MCP_SERVER  ')).toBe('placeholder');
    });

    it('rejects a key shorter than the minimum length', () => {
        expect(GetSystemApiKeyRejection('a'.repeat(MIN_SYSTEM_API_KEY_LENGTH - 1))).toBe('too-short');
    });

    it('accepts a key of exactly the minimum length', () => {
        expect(GetSystemApiKeyRejection('a'.repeat(MIN_SYSTEM_API_KEY_LENGTH))).toBeNull();
        expect(IsUsableSystemApiKey(STRONG_KEY)).toBe(true);
    });
});

describe('SystemApiKeysMatch', () => {
    it('matches identical keys', () => {
        expect(SystemApiKeysMatch(STRONG_KEY, STRONG_KEY)).toBe(true);
    });

    it('does not match a key that differs in one character', () => {
        expect(SystemApiKeysMatch(`${STRONG_KEY.slice(0, -1)}X`, STRONG_KEY)).toBe(false);
    });

    it('does not match a prefix or an extension of the configured key, and does not throw on length mismatch', () => {
        expect(SystemApiKeysMatch(STRONG_KEY.slice(0, 10), STRONG_KEY)).toBe(false);
        expect(SystemApiKeysMatch(`${STRONG_KEY}extra`, STRONG_KEY)).toBe(false);
        expect(SystemApiKeysMatch('', STRONG_KEY)).toBe(false);
    });

    it('does not treat trailing NUL bytes as padding', () => {
        expect(SystemApiKeysMatch(`${STRONG_KEY}\0`, STRONG_KEY)).toBe(false);
    });

    it('compares multi-byte keys by bytes', () => {
        const key = 'ключ-доступа-🔑-secret';
        expect(SystemApiKeysMatch(key, key)).toBe(true);
        expect(SystemApiKeysMatch('ключ-доступа-🔒-secret', key)).toBe(false);
    });
});

describe('IsSystemApiKeyMatch', () => {
    it('authenticates the configured strong key', () => {
        expect(IsSystemApiKeyMatch(STRONG_KEY, STRONG_KEY)).toBe(true);
    });

    it('never authenticates the published placeholder, even when presented exactly', () => {
        expect(IsSystemApiKeyMatch('MY_API_KEY_FOR_MCP_SERVER', 'MY_API_KEY_FOR_MCP_SERVER')).toBe(false);
    });

    it('never authenticates a short configured key, even when presented exactly', () => {
        expect(IsSystemApiKeyMatch('short-key', 'short-key')).toBe(false);
    });

    it('never authenticates when no key is configured', () => {
        expect(IsSystemApiKeyMatch('', undefined)).toBe(false);
        expect(IsSystemApiKeyMatch('', '')).toBe(false);
        expect(IsSystemApiKeyMatch(STRONG_KEY, null)).toBe(false);
    });

    it('ignores padding around the configured key but not around the presented one', () => {
        expect(IsSystemApiKeyMatch(STRONG_KEY, `  ${STRONG_KEY}  `)).toBe(true);
        expect(IsSystemApiKeyMatch(` ${STRONG_KEY}`, STRONG_KEY)).toBe(false);
    });
});

describe('DescribeSystemApiKeyRejection', () => {
    it('explains each rejection without echoing a key', () => {
        expect(DescribeSystemApiKeyRejection('placeholder')).toContain('placeholder');
        expect(DescribeSystemApiKeyRejection('too-short')).toContain(String(MIN_SYSTEM_API_KEY_LENGTH));
        expect(DescribeSystemApiKeyRejection('missing')).toContain('no system API key');
    });
});
