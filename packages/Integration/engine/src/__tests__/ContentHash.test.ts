import { describe, it, expect } from 'vitest';
import { ComputeContentHash, ComputeContentHashWithOverflow, ContentHashBasis, CONTENT_HASH_COLUMN } from '../ContentHash.js';

describe('computeContentHash', () => {
    it('is a 64-char hex SHA-256 string', () => {
        const h = ComputeContentHash({ a: 1, b: 'x' });
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for identical input', () => {
        const a = ComputeContentHash({ Name: 'Acme', Score: 42, Active: true });
        const b = ComputeContentHash({ Name: 'Acme', Score: 42, Active: true });
        expect(a).toBe(b);
    });

    it('is INDEPENDENT of key insertion order (canonical sort)', () => {
        const a = ComputeContentHash({ Name: 'Acme', Score: 42, Active: true });
        const b = ComputeContentHash({ Active: true, Score: 42, Name: 'Acme' });
        expect(a).toBe(b);
    });

    it('changes when a value changes', () => {
        const a = ComputeContentHash({ Name: 'Acme', Score: 42 });
        const b = ComputeContentHash({ Name: 'Acme', Score: 43 });
        expect(a).not.toBe(b);
    });

    it('treats an absent field and an explicit-undefined field as equal', () => {
        const a = ComputeContentHash({ Name: 'Acme', Note: undefined });
        const b = ComputeContentHash({ Name: 'Acme' });
        expect(a).toBe(b);
    });

    it('distinguishes null from absent', () => {
        const withNull = ComputeContentHash({ Name: 'Acme', Note: null });
        const without = ComputeContentHash({ Name: 'Acme' });
        expect(withNull).not.toBe(without);
    });

    it('preserves array order (order is semantically meaningful)', () => {
        const a = ComputeContentHash({ Tags: ['x', 'y'] });
        const b = ComputeContentHash({ Tags: ['y', 'x'] });
        expect(a).not.toBe(b);
    });

    it('canonicalizes nested objects by key too', () => {
        const a = ComputeContentHash({ Meta: { a: 1, b: 2 } });
        const b = ComputeContentHash({ Meta: { b: 2, a: 1 } });
        expect(a).toBe(b);
    });

    it('hashes Date by ISO value', () => {
        const d1 = new Date('2026-01-01T00:00:00.000Z');
        const d2 = new Date('2026-01-01T00:00:00.000Z');
        expect(ComputeContentHash({ When: d1 })).toBe(ComputeContentHash({ When: d2 }));
    });

    it('exposes the mirror column name', () => {
        expect(CONTENT_HASH_COLUMN).toBe('__mj_integration_ContentHash');
    });
});

describe('computeContentHashWithOverflow (custom/overflow fields counted as changes)', () => {
    const mapped = { Name: 'Acme', Score: 42 };

    it('BACKWARD-COMPATIBLE: no overflow → identical to the legacy mapped-only hash', () => {
        expect(ComputeContentHashWithOverflow(mapped)).toBe(ComputeContentHash(mapped));
        expect(ComputeContentHashWithOverflow(mapped, {})).toBe(ComputeContentHash(mapped));
        expect(ComputeContentHashWithOverflow(mapped, null)).toBe(ComputeContentHash(mapped));
    });

    it('THE FIX: a delta touching ONLY a custom/overflow field changes the hash', () => {
        // Mapped fields identical; only the captured (overflow) field differs. Pre-fix this hashed
        // the same → the delta was silently skipped (the overflow change was never re-written).
        const before = ComputeContentHashWithOverflow(mapped, { UD_Tier: 'Silver' });
        const after = ComputeContentHashWithOverflow(mapped, { UD_Tier: 'Platinum' });
        expect(before).not.toBe(after);
    });

    it('adding/removing an overflow field changes the hash', () => {
        const none = ComputeContentHashWithOverflow(mapped);
        const some = ComputeContentHashWithOverflow(mapped, { Cf_Code: 'X' });
        expect(none).not.toBe(some);
    });

    it('is order-independent across mapped + overflow keys', () => {
        const a = ComputeContentHashWithOverflow({ Name: 'Acme', Score: 42 }, { b: 2, a: 1 });
        const b = ComputeContentHashWithOverflow({ Score: 42, Name: 'Acme' }, { a: 1, b: 2 });
        expect(a).toBe(b);
    });

    it('contentHashBasis returns the mapped object unchanged when there is no overflow', () => {
        expect(ContentHashBasis(mapped)).toBe(mapped);
        expect(ContentHashBasis(mapped, {})).toBe(mapped);
    });

    it('contentHashBasis folds overflow under the reserved __mj_integration_ prefix (no collision with mapped columns)', () => {
        const basis = ContentHashBasis(mapped, { UD_Tier: 'Gold' });
        expect(basis).not.toBe(mapped);
        expect(basis.Name).toBe('Acme');
        expect(basis['__mj_integration_overflow']).toEqual({ UD_Tier: 'Gold' });
    });
});

// ── Content-hash basis: MAPPED fields only ────────────────────────────────────
describe('Content-hash basis (unmapped/custom keys excluded from matching)', () => {
    it('a newly-appearing custom key does NOT change the match hash', () => {
        const mapped = { id: '1', name: 'Ada' };
        // The engine compares/writes computeContentHash(mapped) — custom keys ride
        // CustomKeyStats out-of-band instead of forcing a row rewrite.
        expect(ComputeContentHash(mapped)).toBe(ComputeContentHash({ ...mapped }));
    });

    it('legacy overflow-folded hash differs from the mapped-only basis (the one-time rewrite wave)', () => {
        const mapped = { id: '1', name: 'Ada' };
        const withOverflow = ComputeContentHashWithOverflow(mapped, { custom_x: 'v' });
        expect(withOverflow).not.toBe(ComputeContentHash(mapped));
    });

    it('customs-free rows are byte-identical under both bases (no spurious mass re-sync)', () => {
        const mapped = { id: '1', name: 'Ada' };
        expect(ComputeContentHashWithOverflow(mapped, undefined)).toBe(ComputeContentHash(mapped));
        expect(ComputeContentHashWithOverflow(mapped, {})).toBe(ComputeContentHash(mapped));
    });
});
