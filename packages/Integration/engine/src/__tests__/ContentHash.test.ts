import { describe, it, expect } from 'vitest';
import { computeContentHash, CONTENT_HASH_COLUMN } from '../ContentHash.js';

describe('computeContentHash', () => {
    it('is a 64-char hex SHA-256 string', () => {
        const h = computeContentHash({ a: 1, b: 'x' });
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for identical input', () => {
        const a = computeContentHash({ Name: 'Acme', Score: 42, Active: true });
        const b = computeContentHash({ Name: 'Acme', Score: 42, Active: true });
        expect(a).toBe(b);
    });

    it('is INDEPENDENT of key insertion order (canonical sort)', () => {
        const a = computeContentHash({ Name: 'Acme', Score: 42, Active: true });
        const b = computeContentHash({ Active: true, Score: 42, Name: 'Acme' });
        expect(a).toBe(b);
    });

    it('changes when a value changes', () => {
        const a = computeContentHash({ Name: 'Acme', Score: 42 });
        const b = computeContentHash({ Name: 'Acme', Score: 43 });
        expect(a).not.toBe(b);
    });

    it('treats an absent field and an explicit-undefined field as equal', () => {
        const a = computeContentHash({ Name: 'Acme', Note: undefined });
        const b = computeContentHash({ Name: 'Acme' });
        expect(a).toBe(b);
    });

    it('distinguishes null from absent', () => {
        const withNull = computeContentHash({ Name: 'Acme', Note: null });
        const without = computeContentHash({ Name: 'Acme' });
        expect(withNull).not.toBe(without);
    });

    it('preserves array order (order is semantically meaningful)', () => {
        const a = computeContentHash({ Tags: ['x', 'y'] });
        const b = computeContentHash({ Tags: ['y', 'x'] });
        expect(a).not.toBe(b);
    });

    it('canonicalizes nested objects by key too', () => {
        const a = computeContentHash({ Meta: { a: 1, b: 2 } });
        const b = computeContentHash({ Meta: { b: 2, a: 1 } });
        expect(a).toBe(b);
    });

    it('hashes Date by ISO value', () => {
        const d1 = new Date('2026-01-01T00:00:00.000Z');
        const d2 = new Date('2026-01-01T00:00:00.000Z');
        expect(computeContentHash({ When: d1 })).toBe(computeContentHash({ When: d2 }));
    });

    it('exposes the mirror column name', () => {
        expect(CONTENT_HASH_COLUMN).toBe('__mj_integration_ContentHash');
    });
});
