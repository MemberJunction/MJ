import { describe, it, expect } from 'vitest';
import type {
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { SoftPKClassifier, SYNTHETIC_PK_FIELD_NAME } from '../SoftPKClassifier.js';

/**
 * The classifier reads only these getters off each IOF row. We build typed
 * stubs over exactly that subset, then narrow to the entity type via the
 * test-only cast idiom used across the integration test suite (BaseEntity
 * subclasses can't be `new`-ed without a provider, so structural stubs are
 * the convention — production code never does this).
 */
type FieldStub = Pick<MJIntegrationObjectFieldEntity, 'Name' | 'Type' | 'Length' | 'IsUniqueKey'>;
type ObjectStub = Pick<MJIntegrationObjectEntity, 'Name'>;

function makeField(name: string, opts: Partial<Omit<FieldStub, 'Name'>> = {}): MJIntegrationObjectFieldEntity {
    const stub: FieldStub = {
        Name: name,
        Type: opts.Type ?? 'nvarchar',
        Length: opts.Length ?? null,
        IsUniqueKey: opts.IsUniqueKey ?? false,
    };
    return stub as unknown as MJIntegrationObjectFieldEntity;
}

function makeObject(name: string): MJIntegrationObjectEntity {
    const stub: ObjectStub = { Name: name };
    return stub as unknown as MJIntegrationObjectEntity;
}

describe('SoftPKClassifier', () => {
    const classifier = new SoftPKClassifier();

    describe('single-column statistical uniqueness', () => {
        it('nominates the sole unique + non-null column', async () => {
            // "code" is unique+non-null; "category" repeats. No naming/convention match.
            const fields = [makeField('code'), makeField('category')];
            const sampleRows = [
                { code: 'A1', category: 'x' },
                { code: 'A2', category: 'x' },
                { code: 'A3', category: 'y' },
            ];
            const result = await classifier.Classify({
                object: makeObject('WidgetThings'),
                fields,
                sampleRows,
            });

            expect(result.Confident).toBe(true);
            expect(result.Strategy).toBe('statistical');
            expect(result.Nominee).toBe('code');
            expect(result.NomineeFields).toEqual(['code']);
            expect(result.Confidence).toBeGreaterThanOrEqual(0.7);
        });
    });

    describe('composite-key uniqueness', () => {
        it('finds a minimal 2-column unique set when no single column is unique', async () => {
            // Neither orgId nor year is unique alone, but (orgId, year) is.
            const fields = [makeField('orgId'), makeField('year'), makeField('label')];
            const sampleRows = [
                { orgId: 'O1', year: 2024, label: 'shared' },
                { orgId: 'O1', year: 2025, label: 'shared' },
                { orgId: 'O2', year: 2024, label: 'shared' },
                { orgId: 'O2', year: 2025, label: 'shared' },
            ];
            const result = await classifier.Classify({
                object: makeObject('Allocations'),
                fields,
                sampleRows,
            });

            expect(result.Confident).toBe(true);
            expect(result.Strategy).toBe('composite');
            expect(result.NomineeFields).toEqual(['orgId', 'year']);
            // Nominee mirrors the first member for single-name callers.
            expect(result.Nominee).toBe('orgId');
            expect(result.Confidence).toBeGreaterThanOrEqual(0.7);
        });

        it('prefers a 2-column set over a 3-column set (minimality)', async () => {
            // (a,b) is already unique; the scan must stop at size 2 and not return (a,b,c).
            const fields = [makeField('a'), makeField('b'), makeField('c')];
            const sampleRows = [
                { a: '1', b: 'x', c: 'p' },
                { a: '1', b: 'y', c: 'p' },
                { a: '2', b: 'x', c: 'q' },
            ];
            const result = await classifier.Classify({
                object: makeObject('Pairs'),
                fields,
                sampleRows,
            });

            expect(result.Strategy).toBe('composite');
            expect(result.NomineeFields).toEqual(['a', 'b']);
        });

        it('respects maxCompositeKeySize and falls back to synthetic when set too small', async () => {
            // Every 2-column pair collides; only the full (a,b,c) triple is unique.
            // Cap at 2 → composite tier can't reach the triple → synthetic.
            const fields = [makeField('a'), makeField('b'), makeField('c')];
            const sampleRows = [
                { a: '1', b: '1', c: '1' },
                { a: '1', b: '1', c: '2' }, // (a,b) collide with row 1
                { a: '1', b: '2', c: '1' }, // (a,c) collide with row 1
                { a: '2', b: '1', c: '1' }, // (b,c) collide with row 1
            ];
            const result = await classifier.Classify({
                object: makeObject('Triples'),
                fields,
                sampleRows,
                maxCompositeKeySize: 2,
                syntheticFallback: true, // opt in to still exercise the composite-too-small → synthetic path
            });

            expect(result.Strategy).toBe('synthetic');
            expect(result.Nominee).toBe(SYNTHETIC_PK_FIELD_NAME);
        });
    });

    describe('synthetic fallback', () => {
        const ambiguousFields = [makeField('color'), makeField('size')];
        const ambiguousRows = [
            { color: 'red', size: 'L' },
            { color: 'red', size: 'L' }, // exact dup → nothing is unique, even composite
        ];

        it('returns the honest none verdict by DEFAULT when nothing is unique (no fabrication)', async () => {
            const result = await classifier.Classify({
                object: makeObject('Tags'),
                fields: ambiguousFields,
                sampleRows: ambiguousRows,
            });

            // Default is now honest 'none' — synthetic is opt-in only, never fabricated.
            expect(result.Confident).toBe(false);
            expect(result.Strategy).toBe('none');
            expect(result.Nominee).toBeUndefined();
        });

        it('still nominates the synthetic key when syntheticFallback is explicitly opted in', async () => {
            const result = await classifier.Classify({
                object: makeObject('Tags'),
                fields: ambiguousFields,
                sampleRows: ambiguousRows,
                syntheticFallback: true,
            });

            expect(result.Confident).toBe(true);
            expect(result.Strategy).toBe('synthetic');
            expect(result.Nominee).toBe(SYNTHETIC_PK_FIELD_NAME);
            expect(result.NomineeFields).toEqual([SYNTHETIC_PK_FIELD_NAME]);
            expect(result.Confidence).toBeGreaterThanOrEqual(0.7);
        });

        it('returns honest none with no sample rows at all (default — no fabrication)', async () => {
            const result = await classifier.Classify({
                object: makeObject('Mystery'),
                fields: [makeField('foo'), makeField('bar')],
            });

            expect(result.Strategy).toBe('none');
            expect(result.Nominee).toBeUndefined();
        });
    });

    describe('cascade precedence is preserved (additive change must not steal earlier tiers)', () => {
        it('universal-convention still wins over everything', async () => {
            const fields = [makeField('id'), makeField('x'), makeField('y')];
            const result = await classifier.Classify({
                object: makeObject('Companies'),
                fields,
                universalConvention: 'id',
                sampleRows: [{ id: '1', x: 'a', y: 'b' }],
            });

            expect(result.Strategy).toBe('universal-convention');
            expect(result.Nominee).toBe('id');
        });

        it('naming heuristic still wins before statistical/composite', async () => {
            const fields = [makeField('CompanyId'), makeField('other')];
            const result = await classifier.Classify({
                object: makeObject('Companies'),
                fields,
                sampleRows: [{ CompanyId: '1', other: 'z' }],
            });

            expect(result.Strategy).toBe('naming-heuristic');
            expect(result.Nominee).toBe('CompanyId');
        });
    });
});
