import { describe, it, expect, beforeEach } from 'vitest';
import { readVisitorKey, writeVisitorKey, clearVisitorKey } from '../session/visitor-key-cookie.js';

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
        writeVisitorKey('pk_test_1', 'vk_abc123');
        expect(readVisitorKey('pk_test_1')).toBe('vk_abc123');
    });

    it('returns undefined when no cookie is set', () => {
        expect(readVisitorKey('pk_never_set')).toBeUndefined();
    });

    it('scopes the cookie per widget key (no cross-widget leakage)', () => {
        writeVisitorKey('pk_a', 'vk_for_a');
        expect(readVisitorKey('pk_b')).toBeUndefined();
        expect(readVisitorKey('pk_a')).toBe('vk_for_a');
    });

    it('clears the key (RV5 forget me)', () => {
        writeVisitorKey('pk_test_1', 'vk_abc123');
        clearVisitorKey('pk_test_1');
        expect(readVisitorKey('pk_test_1')).toBeUndefined();
    });

    it('does not write an empty key', () => {
        writeVisitorKey('pk_test_1', '');
        expect(readVisitorKey('pk_test_1')).toBeUndefined();
    });
});
