import { describe, it, expect } from 'vitest';
import { CompileMetadataFilter, MetadataFilterPredicate } from '../models/MetadataFilterEvaluator';

/**
 * The in-memory metadata filter. It carries a search scope's tenant / permission push-down for the
 * in-process vector driver, so two properties matter as much as the matching itself: every operator
 * behaves as the remote drivers' (Pinecone / MongoDB) do, and anything it cannot express is reported
 * as unsupported rather than silently ignored.
 */

/** Compiles a filter that must be valid. */
function compile(filter: object): MetadataFilterPredicate {
    const result = CompileMetadataFilter(filter);
    if (result.Status !== 'ok') throw new Error(`expected a valid filter, got ${JSON.stringify(result)}`);
    return result.Predicate;
}

/** Evaluates `filter` against a record. */
function passes(filter: object, record: Record<string, unknown>): boolean {
    return compile(filter)(field => record[field]);
}

/** The reason a filter is unsupported, or a failure if it is not. */
function unsupportedReason(filter: unknown): string {
    const result = CompileMetadataFilter(filter as object);
    if (result.Status !== 'unsupported') throw new Error(`expected unsupported, got ${result.Status}`);
    return result.Reason;
}

describe('CompileMetadataFilter', () => {
    describe('no filter', () => {
        it.each([[null], [undefined], [{}]])('treats %j as nothing to apply', filter => {
            expect(CompileMetadataFilter(filter as object).Status).toBe('none');
        });
    });

    describe('equality', () => {
        it('matches a bare value and $eq the same way', () => {
            expect(passes({ Status: 'Active' }, { Status: 'Active' })).toBe(true);
            expect(passes({ Status: { $eq: 'Active' } }, { Status: 'Active' })).toBe(true);
            expect(passes({ Status: 'Active' }, { Status: 'Archived' })).toBe(false);
        });

        it('is strict about type and case for ordinary strings', () => {
            expect(passes({ Count: 1 }, { Count: '1' })).toBe(false);
            expect(passes({ Name: 'members' }, { Name: 'Members' })).toBe(false);
        });

        it('compares UUIDs case-insensitively (SQL Server upper case vs PostgreSQL lower case)', () => {
            const upper = '8F2C1D3E-4B5A-4C6D-9E7F-0A1B2C3D4E5F';
            expect(passes({ OrganizationID: upper.toLowerCase() }, { OrganizationID: upper })).toBe(true);
            expect(passes({ OrganizationID: { $in: [upper.toLowerCase()] } }, { OrganizationID: upper })).toBe(true);
        });

        it('compares a Date column with an ISO string or epoch number by instant', () => {
            const at = new Date('2026-01-02T03:04:05.000Z');
            expect(passes({ UpdatedAt: '2026-01-02T03:04:05.000Z' }, { UpdatedAt: at })).toBe(true);
            expect(passes({ UpdatedAt: at.getTime() }, { UpdatedAt: at })).toBe(true);
            expect(passes({ UpdatedAt: 'not a date' }, { UpdatedAt: at })).toBe(false);
        });

        it('matches null only against null', () => {
            expect(passes({ ParentID: null }, { ParentID: null })).toBe(true);
            expect(passes({ ParentID: null }, { ParentID: 'x' })).toBe(false);
        });

        it('$ne matches a different value and an absent field (MongoDB semantics)', () => {
            expect(passes({ Status: { $ne: 'Archived' } }, { Status: 'Active' })).toBe(true);
            expect(passes({ Status: { $ne: 'Archived' } }, {})).toBe(true);
            expect(passes({ Status: { $ne: 'Active' } }, { Status: 'Active' })).toBe(false);
        });
    });

    describe('membership', () => {
        it('$in matches any listed value; $nin matches none', () => {
            expect(passes({ Entity: { $in: ['Members', 'Accounts'] } }, { Entity: 'Accounts' })).toBe(true);
            expect(passes({ Entity: { $in: ['Members'] } }, { Entity: 'Accounts' })).toBe(false);
            expect(passes({ Entity: { $nin: ['Members'] } }, { Entity: 'Accounts' })).toBe(true);
            expect(passes({ Entity: { $nin: ['Accounts'] } }, { Entity: 'Accounts' })).toBe(false);
        });

        it('treats an array-valued field as matching when any element matches', () => {
            const record = { Tags: ['finance', 'q3'] };
            expect(passes({ Tags: 'q3' }, record)).toBe(true);
            expect(passes({ Tags: { $in: ['legal', 'finance'] } }, record)).toBe(true);
            expect(passes({ Tags: { $nin: ['finance'] } }, record)).toBe(false);
            expect(passes({ Tags: { $ne: 'legal' } }, record)).toBe(true);
        });

        it('an empty $in matches nothing and an empty $nin matches everything', () => {
            expect(passes({ Entity: { $in: [] } }, { Entity: 'Members' })).toBe(false);
            expect(passes({ Entity: { $nin: [] } }, { Entity: 'Members' })).toBe(true);
        });
    });

    describe('ordering', () => {
        it.each([
            ['$gt', 5, false], ['$gte', 5, true], ['$lt', 5, false], ['$lte', 5, true],
            ['$gt', 4, true], ['$lt', 6, true],
        ] as const)('Score %s %d against 5 → %s', (op, operand, expected) => {
            expect(passes({ Score: { [op]: operand } }, { Score: 5 })).toBe(expected);
        });

        it('orders strings lexicographically and dates by instant', () => {
            expect(passes({ Name: { $gte: 'M' } }, { Name: 'Members' })).toBe(true);
            expect(passes({ At: { $lt: '2026-01-01T00:00:00Z' } }, { At: new Date('2025-12-31T23:59:59Z') })).toBe(true);
        });

        it('never matches a value of another type or an absent field', () => {
            expect(passes({ Score: { $gt: 1 } }, { Score: '5' })).toBe(false);
            expect(passes({ Score: { $gt: 1 } }, {})).toBe(false);
        });

        it('combines several operators on one field as a range', () => {
            const range = { Score: { $gte: 2, $lt: 4 } };
            expect([1, 2, 3, 4].map(score => passes(range, { Score: score }))).toEqual([false, true, true, false]);
        });
    });

    describe('$exists', () => {
        it('distinguishes present from absent or null', () => {
            expect(passes({ Note: { $exists: true } }, { Note: 'x' })).toBe(true);
            expect(passes({ Note: { $exists: true } }, { Note: null })).toBe(false);
            expect(passes({ Note: { $exists: false } }, {})).toBe(true);
        });
    });

    describe('logical operators', () => {
        it('requires every condition of an object and of $and', () => {
            const filter = { $and: [{ Entity: 'Members' }, { Status: 'Active' }], Region: 'EU' };
            expect(passes(filter, { Entity: 'Members', Status: 'Active', Region: 'EU' })).toBe(true);
            expect(passes(filter, { Entity: 'Members', Status: 'Active', Region: 'US' })).toBe(false);
        });

        it('requires any branch of $or', () => {
            const filter = { $or: [{ Entity: 'Members' }, { Entity: 'Accounts' }] };
            expect(passes(filter, { Entity: 'Accounts' })).toBe(true);
            expect(passes(filter, { Entity: 'Events' })).toBe(false);
        });

        it('nests (the shape VectorSearchProvider builds when merging a scope filter)', () => {
            const filter = { $and: [{ Entity: { $in: ['Members'] } }, { $or: [{ OrganizationID: 'a' }, { IsPublic: true }] }] };
            expect(passes(filter, { Entity: 'Members', OrganizationID: 'b', IsPublic: true })).toBe(true);
            expect(passes(filter, { Entity: 'Members', OrganizationID: 'b', IsPublic: false })).toBe(false);
        });
    });

    describe('fails closed on anything it cannot apply', () => {
        it.each([
            [{ Name: { $regex: '^A' } }, 'unsupported operator "$regex" on "Name"'],
            [{ $nor: [{ A: 1 }] }, 'unsupported logical operator "$nor"'],
            [{ $and: { A: 1 } }, '"$and" needs a non-empty array of filters'],
            [{ $or: [] }, '"$or" needs a non-empty array of filters'],
            [{ $and: ['A'] }, '"$and[0]" must be an object, got string'],
            [{ Entity: { $in: 'Members' } }, '"Entity.$in" needs an array, got string'],
            [{ Entity: { $in: [{ nested: true }] } }, '"Entity.$in[0]" must be a string, number, boolean or null, got an object'],
            [{ Score: { $gt: true } }, '"Score.$gt" needs a number, date or string'],
            [{ Note: { $exists: 'yes' } }, '"Note.$exists" needs true or false'],
            [{ Tags: ['a', 'b'] }, '"Tags" must be a string, number, boolean or null, got an array'],
            [{ Entity: {} }, '"Entity" has an empty condition object'],
        ])('%j → %s', (filter, reason) => {
            expect(unsupportedReason(filter)).toBe(reason);
        });

        it('rejects a filter that is not an object', () => {
            expect(unsupportedReason('Entity = Members')).toBe('a metadata filter must be an object, got string');
            expect(unsupportedReason([{ A: 1 }])).toBe('a metadata filter must be an object, got an array');
        });

        it('validates nested branches up front, before any record is evaluated', () => {
            expect(unsupportedReason({ $or: [{ A: 1 }, { B: { $where: 'x' } }] })).toBe('unsupported operator "$where" on "B"');
        });
    });

    it('accepts a Date as a filter value', () => {
        const at = new Date('2026-03-01T00:00:00Z');
        expect(passes({ At: { $gte: at } }, { At: new Date('2026-03-02T00:00:00Z') })).toBe(true);
    });
});
