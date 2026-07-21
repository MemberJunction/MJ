import { describe, it, expect } from 'vitest';
import { MongoFilterTranslator } from '../MongoFilterTranslator';

/**
 * ISO-8601 date-time literals must coerce to `Date` so range/equality predicates match Mongo's native
 * `Date`-typed fields (BSON never matches a string against a Date). Without this, an incremental-sync
 * watermark predicate `updatedAt >= '<iso>'` silently matches zero documents.
 */
describe('MongoFilterTranslator — ISO-8601 date coercion', () => {
    const gte = (filter: string): unknown => {
        const f = MongoFilterTranslator.Translate(filter) as Record<string, Record<string, unknown>>;
        return f.updatedAt.$gte;
    };

    it('coerces an ISO-8601 date-time in a >= comparison to a Date', () => {
        expect(gte("updatedAt >= '2026-03-01T00:00:00.000Z'")).toBeInstanceOf(Date);
    });

    it('coerces ISO-8601 with a numeric offset too', () => {
        expect(gte("updatedAt >= '2026-03-01T12:30:00+05:30'")).toBeInstanceOf(Date);
    });

    it('leaves a date-only string (no time component) untouched', () => {
        expect(gte("updatedAt >= '2026-03-01'")).toBe('2026-03-01');
    });

    it('leaves a non-temporal string untouched', () => {
        const f = MongoFilterTranslator.Translate("name = 'Acme'") as Record<string, Record<string, unknown>>;
        expect(f.name.$eq).toBe('Acme');
    });

    it('coerces ISO-8601 values inside IN lists', () => {
        const f = MongoFilterTranslator.Translate("updatedAt IN ('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')") as Record<string, Record<string, unknown[]>>;
        const vals = f.updatedAt.$in;
        expect(vals.every(v => v instanceof Date)).toBe(true);
    });
});
