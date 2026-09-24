import { describe, it, expect, beforeEach } from 'vitest';
import { ReadVisitorKey, WriteVisitorKey, ClearVisitorKey } from '../session/visitor-key-cookie.js';

/** Clears all cookies between tests so each starts from a clean jar. */
function clearAllCookies(): void {
    for (const part of document.cookie.split(';')) {
        const name = part.split('=')[0]?.trim();
        if (name) {
            document.cookie = `${name}=; Max-Age=0; Path=/`;
        }
    }
}

describe('visitor-key-cookie (RV1 durable anchor)', () => {
    beforeEach(() => clearAllCookies());

    it('round-trips a written key', () => {
        WriteVisitorKey('pk_test_1', 'vk_abc123');
        expect(ReadVisitorKey('pk_test_1')).toBe('vk_abc123');
    });

    it('returns undefined when no cookie is set', () => {
        expect(ReadVisitorKey('pk_never_set')).toBeUndefined();
    });

    it('scopes the cookie per widget key (no cross-widget leakage)', () => {
        WriteVisitorKey('pk_a', 'vk_for_a');
        expect(ReadVisitorKey('pk_b')).toBeUndefined();
        expect(ReadVisitorKey('pk_a')).toBe('vk_for_a');
    });

    it('clears the key (RV5 forget me)', () => {
        WriteVisitorKey('pk_test_1', 'vk_abc123');
        ClearVisitorKey('pk_test_1');
        expect(ReadVisitorKey('pk_test_1')).toBeUndefined();
    });

    it('does not write an empty key', () => {
        WriteVisitorKey('pk_test_1', '');
        expect(ReadVisitorKey('pk_test_1')).toBeUndefined();
    });
});
