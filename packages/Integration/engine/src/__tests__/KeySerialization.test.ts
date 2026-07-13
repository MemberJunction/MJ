import { describe, it, expect } from 'vitest';
import { serializeKeyValue } from '../KeySerialization.js';

/**
 * Controlled reproduction of the object-valued-PK identity bug (PropFuel `checkin_questions`).
 *
 * The integration write path coerces a value bound for a string column via `JSON.stringify`
 * (IntegrationEngine.coerceIncomingValue), so an object-valued PK is STORED as JSON text. The
 * read/match/load paths used `String(value)` instead, which renders an object as the literal
 * `"[object Object]"` — never matching the stored JSON. That asymmetry made the engine (1) fail to
 * find existing rows → duplicate-key inserts, and (2) miss the content-hash skip → rewrite every
 * unchanged record on each re-sync. `serializeKeyValue` is the shared serializer both sides now use.
 */
describe('serializeKeyValue', () => {
    // This is the exact coercion the write path applies (coerceIncomingValue: objects → JSON.stringify).
    // The read-side key MUST equal this, byte-for-byte, or matching/loading/hash-skip all break.
    const writeSideStored = (v: unknown) =>
        v != null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(v ?? '');

    it('serializes an object-valued PK to its JSON text, NOT "[object Object]"', () => {
        const objectPK = { id: 158077958, checkin_id: 153650723, created_at: '2026-04-30 02:00:33' };
        const key = serializeKeyValue(objectPK);
        expect(key).not.toBe('[object Object]');
        expect(key).toBe(JSON.stringify(objectPK));
    });

    it('produces a key byte-identical to the value the write path stores (object PK)', () => {
        const objectPK = { id: 158077958, checkin_id: 153650723, rating: null, created_at: '2026-04-30 02:00:33' };
        // The load/match key and the stored column value must be the same string for the lookup to hit.
        expect(serializeKeyValue(objectPK)).toBe(writeSideStored(objectPK));
    });

    it('distinct object PKs serialize to distinct keys (no collision into "[object Object]")', () => {
        const a = serializeKeyValue({ id: 1 });
        const b = serializeKeyValue({ id: 2 });
        expect(a).not.toBe(b);
    });

    it('passes scalar keys through String() unchanged', () => {
        expect(serializeKeyValue('abc-123')).toBe('abc-123');
        expect(serializeKeyValue(42)).toBe('42');
        expect(serializeKeyValue(true)).toBe('true');
    });

    it('treats null/undefined as the empty key (the "no value" sentinel callers null-check on)', () => {
        expect(serializeKeyValue(null)).toBe('');
        expect(serializeKeyValue(undefined)).toBe('');
    });

    it('does not double-encode a Date (left to String, like the write coercion)', () => {
        const d = new Date('2026-04-30T02:00:33.000Z');
        expect(serializeKeyValue(d)).toBe(String(d));
    });
});
