import { describe, it, expect } from 'vitest';
import {
    BuildColocatedQuery,
    BuildFilterFragment,
    DeriveContent,
    DistanceToScore,
    MetricOperator,
    MetricOpsClass,
    ParseVectorString,
    ResolveFusion,
    RRF_K,
    SafeTopK,
    VectorLiteral,
} from '../models/pgvectorColocatedSQL';

describe('pgvectorColocatedSQL (pure builders)', () => {
    describe('VectorLiteral / ParseVectorString', () => {
        it('formats a number array as a pgvector literal', () => {
            expect(VectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
        });
        it('round-trips through parse', () => {
            expect(ParseVectorString('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
        });
        it('returns [] for empty/null', () => {
            expect(ParseVectorString('')).toEqual([]);
            expect(ParseVectorString(null)).toEqual([]);
            expect(ParseVectorString('[]')).toEqual([]);
        });
    });

    describe('MetricOperator / MetricOpsClass', () => {
        it('maps known metrics', () => {
            expect(MetricOperator('cosine')).toBe('<=>');
            expect(MetricOperator('euclidean')).toBe('<->');
            expect(MetricOperator('dotproduct')).toBe('<#>');
            expect(MetricOpsClass('cosine')).toBe('vector_cosine_ops');
        });
        it('defaults unknown metrics to cosine', () => {
            expect(MetricOperator('bogus')).toBe('<=>');
            expect(MetricOpsClass('bogus')).toBe('vector_cosine_ops');
        });
    });

    describe('DistanceToScore', () => {
        it('cosine: 1 - distance', () => {
            expect(DistanceToScore(0.2, 'cosine')).toBeCloseTo(0.8);
        });
        it('euclidean: 1 / (1 + distance)', () => {
            expect(DistanceToScore(1, 'euclidean')).toBeCloseTo(0.5);
        });
        it('dotproduct: negated', () => {
            expect(DistanceToScore(-0.9, 'dotproduct')).toBeCloseTo(0.9);
        });
    });

    describe('DeriveContent', () => {
        it('joins human-readable values and skips system keys', () => {
            const content = DeriveContent({
                RecordID: 'abc', Entity: 'Members', TemplateID: 't1', EntityIcon: 'fa',
                Name: 'Ada Lovelace', Bio: 'First programmer',
            });
            expect(content).toContain('Ada Lovelace');
            expect(content).toContain('First programmer');
            expect(content).not.toContain('abc');
            expect(content).not.toContain('Members');
        });
        it('flattens array values and ignores nullish', () => {
            const content = DeriveContent({ Tags: ['ml', 'ai'], Missing: null });
            expect(content).toBe('ml ai');
        });
        it('returns empty string for undefined metadata', () => {
            expect(DeriveContent(undefined)).toBe('');
        });
    });

    describe('ResolveFusion', () => {
        const base = { qualifiedTable: 't', metric: 'cosine', topK: 5 };
        it('vector + keyword → rrf', () => {
            expect(ResolveFusion({ ...base, vector: [1], keyword: 'hi' })).toBe('rrf');
        });
        it('vector only → vector-only', () => {
            expect(ResolveFusion({ ...base, vector: [1] })).toBe('vector-only');
        });
        it('keyword only → keyword-only', () => {
            expect(ResolveFusion({ ...base, keyword: 'hi' })).toBe('keyword-only');
        });
        it('blank keyword does not trigger hybrid', () => {
            expect(ResolveFusion({ ...base, vector: [1], keyword: '   ' })).toBe('vector-only');
        });
        it('explicit fusion override wins', () => {
            expect(ResolveFusion({ ...base, vector: [1], keyword: 'hi', fusion: 'vector-only' })).toBe('vector-only');
        });
    });

    describe('BuildFilterFragment', () => {
        it('returns empty for no filter', () => {
            expect(BuildFilterFragment(undefined, 2)).toEqual({ clause: '', params: [] });
        });
        it('handles _pgvectorConditions eq', () => {
            const frag = BuildFilterFragment(
                { _pgvectorConditions: [{ Field: 'Entity', Operator: 'eq', Value: 'Members' }] },
                2
            );
            expect(frag.clause).toBe('metadata->>$2 = $3');
            expect(frag.params).toEqual(['Entity', 'Members']);
        });
        it('handles _pgvectorConditions in', () => {
            const frag = BuildFilterFragment(
                { _pgvectorConditions: [{ Field: 'Entity', Operator: 'in', Value: ['A', 'B'] }] },
                2
            );
            expect(frag.clause).toBe('metadata->>$4 IN ($2, $3)');
            expect(frag.params).toEqual(['A', 'B', 'Entity']);
        });
        it('handles generic $eq and $in', () => {
            expect(BuildFilterFragment({ Entity: { $eq: 'X' } }, 2).clause).toBe('metadata->>$2 = $3');
            const inFrag = BuildFilterFragment({ Entity: { $in: ['A', 'B'] } }, 2);
            expect(inFrag.clause).toBe('metadata->>$2 IN ($3, $4)');
            expect(inFrag.params).toEqual(['Entity', 'A', 'B']);
        });
        it('throws on an unsupported operator instead of silently dropping the condition', () => {
            expect(() => BuildFilterFragment({ _pgvectorConditions: [{ Field: 'Entity', Operator: 'gt', Value: 1 }] }, 2))
                .toThrow(/Unsupported filter operator/);
        });
    });

    describe('SafeTopK', () => {
        it('clamps to a positive integer', () => {
            expect(SafeTopK(0)).toBe(1);
            expect(SafeTopK(7.9)).toBe(7);
            expect(SafeTopK(Number.NaN)).toBe(1);
            expect(SafeTopK(-5)).toBe(1);
            expect(SafeTopK(99999, 100)).toBe(100);
        });
        it('is what BuildColocatedQuery interpolates into LIMIT', () => {
            const q = BuildColocatedQuery({ qualifiedTable: 't', metric: 'cosine', vector: [1], topK: 7 });
            expect(q.sql).toContain('LIMIT 7');
        });
    });

    describe('BuildColocatedQuery — vector-only', () => {
        it('orders by the metric operator and limits to topK', () => {
            const q = BuildColocatedQuery({ qualifiedTable: '"__mj"."vec"', metric: 'cosine', vector: [0.1, 0.2], topK: 7 });
            expect(q.sql).toContain('ORDER BY embedding <=> $1::vector');
            expect(q.sql).toContain('LIMIT 7');
            expect(q.sql).toContain('AS distance');
            expect(q.params[0]).toBe('[0.1,0.2]');
            expect(q.params).toHaveLength(1);
        });
        it('appends filter params after the vector at $2', () => {
            const q = BuildColocatedQuery({
                qualifiedTable: 't', metric: 'cosine', vector: [1], topK: 5,
                filter: { _pgvectorConditions: [{ Field: 'Entity', Operator: 'eq', Value: 'Members' }] },
            });
            expect(q.sql).toContain('WHERE metadata->>$2 = $3');
            expect(q.params).toEqual(['[1]', 'Entity', 'Members']);
        });
        it('includes embedding_text only when includeValues is set', () => {
            const withVals = BuildColocatedQuery({ qualifiedTable: 't', metric: 'cosine', vector: [1], topK: 5, includeValues: true });
            expect(withVals.sql).toContain('embedding::text AS embedding_text');
            const without = BuildColocatedQuery({ qualifiedTable: 't', metric: 'cosine', vector: [1], topK: 5 });
            expect(without.sql).not.toContain('embedding_text');
        });
    });

    describe('BuildColocatedQuery — keyword-only', () => {
        it('uses full-text websearch_to_tsquery', () => {
            const q = BuildColocatedQuery({ qualifiedTable: 't', metric: 'cosine', keyword: 'hello world', topK: 5 });
            expect(q.sql).toContain("websearch_to_tsquery('english', $1)");
            expect(q.sql).toContain('tsv @@ q');
            expect(q.sql).toContain('ORDER BY score DESC');
            expect(q.params[0]).toBe('hello world');
        });
    });

    describe('BuildColocatedQuery — hybrid (RRF)', () => {
        it('fuses vector and keyword lists with RRF', () => {
            const q = BuildColocatedQuery({ qualifiedTable: 't', metric: 'cosine', vector: [0.5], keyword: 'cats', topK: 10 });
            expect(q.sql).toContain('WITH vec AS');
            expect(q.sql).toContain('kw AS');
            expect(q.sql).toContain(`COALESCE(1.0/(${RRF_K} + vec.rnk), 0)`);
            expect(q.sql).toContain(`COALESCE(1.0/(${RRF_K} + kw.rnk), 0)`);
            expect(q.sql).toContain('ORDER BY score DESC');
            expect(q.sql).toContain('LIMIT 10');
            // $1 = vector, $2 = keyword
            expect(q.params[0]).toBe('[0.5]');
            expect(q.params[1]).toBe('cats');
        });
        it('duplicates filter params across both CTEs with distinct placeholders', () => {
            const q = BuildColocatedQuery({
                qualifiedTable: 't', metric: 'cosine', vector: [1], keyword: 'x', topK: 5,
                filter: { _pgvectorConditions: [{ Field: 'Entity', Operator: 'eq', Value: 'Members' }] },
            });
            // vec filter starts at $3, kw filter continues at $5
            expect(q.sql).toContain('metadata->>$3 = $4');
            expect(q.sql).toContain('metadata->>$5 = $6');
            expect(q.params).toEqual(['[1]', 'x', 'Entity', 'Members', 'Entity', 'Members']);
        });
    });
});
