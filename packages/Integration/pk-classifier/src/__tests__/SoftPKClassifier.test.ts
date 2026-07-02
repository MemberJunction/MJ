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
type FieldStub = Pick<MJIntegrationObjectFieldEntity, 'Name' | 'Type' | 'Length' | 'IsUniqueKey' | 'AllowsNull'>;
type ObjectStub = Pick<MJIntegrationObjectEntity, 'Name'>;

function makeField(name: string, opts: Partial<Omit<FieldStub, 'Name'>> = {}): MJIntegrationObjectFieldEntity {
    const stub: FieldStub = {
        Name: name,
        Type: opts.Type ?? 'nvarchar',
        Length: opts.Length ?? null,
        IsUniqueKey: opts.IsUniqueKey ?? false,
        AllowsNull: opts.AllowsNull ?? undefined as unknown as boolean,
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
            // Adequate sample (>= MIN_STATISTICAL_SAMPLE) so the significance gate trusts the tier.
            const fields = [makeField('code'), makeField('category')];
            const sampleRows = Array.from({ length: 10 }, (_, i) => ({ code: `A${i}`, category: i % 2 ? 'x' : 'y' }));
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
            // Neither orgId nor year is unique alone, but (orgId, year) is. Adequate sample:
            // 5 orgs × 2 years = 10 unique pairs, each org repeats, each year repeats 5×.
            const fields = [makeField('orgId'), makeField('year'), makeField('label')];
            const sampleRows = Array.from({ length: 10 }, (_, i) => ({
                orgId: `O${Math.floor(i / 2)}`, year: 2024 + (i % 2), label: 'shared',
            }));
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
            // Adequate sample: 5 values of a × 2 of b = 10 unique (a,b) pairs; a & b each repeat.
            const fields = [makeField('a'), makeField('b'), makeField('c')];
            const sampleRows = Array.from({ length: 10 }, (_, i) => ({
                a: String(Math.floor(i / 2)), b: i % 2 ? 'x' : 'y', c: 'p',
            }));
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

        it('nominates the synthetic content-hash key by DEFAULT when no natural PK is found', async () => {
            const result = await classifier.Classify({
                object: makeObject('Tags'),
                fields: ambiguousFields,
                sampleRows: ambiguousRows,
            });

            // Default is now the synthetic content-hash identity — the honest, syncable outcome for a
            // genuinely-keyless object (StagePKClassify creates the field; ToExternalRecord stamps the hash).
            expect(result.Confident).toBe(true);
            expect(result.Strategy).toBe('synthetic');
            expect(result.Nominee).toBe(SYNTHETIC_PK_FIELD_NAME);
            expect(result.NomineeFields).toEqual([SYNTHETIC_PK_FIELD_NAME]);
            expect(result.Confidence).toBeGreaterThanOrEqual(0.7);
        });

        it('returns the honest none verdict only when syntheticFallback is explicitly disabled', async () => {
            const result = await classifier.Classify({
                object: makeObject('Tags'),
                fields: ambiguousFields,
                sampleRows: ambiguousRows,
                syntheticFallback: false,
            });

            expect(result.Confident).toBe(false);
            expect(result.Strategy).toBe('none');
            expect(result.Nominee).toBeUndefined();
        });

        it('defaults to synthetic with no sample rows at all', async () => {
            const result = await classifier.Classify({
                object: makeObject('Mystery'),
                fields: [makeField('foo'), makeField('bar')],
            });

            expect(result.Strategy).toBe('synthetic');
            expect(result.Nominee).toBe(SYNTHETIC_PK_FIELD_NAME);
        });

        it('significance gate: a thin sample (< MIN_STATISTICAL_SAMPLE) does NOT nominate a coincidental key → synthetic', async () => {
            // 2 rows where (contactId, isDelivered) is coincidentally unique — the exact SentEmailRecipient
            // false-positive. The gate must reject it and fall through to synthetic, not emit a bogus composite.
            const fields = [makeField('contactId'), makeField('isDelivered'), makeField('email')];
            const sampleRows = [
                { contactId: 1, isDelivered: true, email: 'a@x.com' },
                { contactId: 1, isDelivered: false, email: 'a@x.com' },
            ];
            const result = await classifier.Classify({ object: makeObject('SentEmailRecipient'), fields, sampleRows });
            expect(result.Strategy).toBe('synthetic');
        });

        it('nullable-awareness: a source-declared-nullable field is never a PK member', async () => {
            // eventRegId is unique+non-null across THIS adequate sample but declared AllowsNull → excluded.
            // The only other unique column is the natural "code", so it wins; eventRegId must not be nominated.
            const fields = [makeField('eventRegId', { AllowsNull: true }), makeField('code')];
            const sampleRows = Array.from({ length: 10 }, (_, i) => ({ eventRegId: i, code: `C${i}` }));
            const result = await classifier.Classify({ object: makeObject('Registrations'), fields, sampleRows });
            expect(result.Nominee).not.toBe('eventRegId');
            expect(result.Nominee).toBe('code');
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
