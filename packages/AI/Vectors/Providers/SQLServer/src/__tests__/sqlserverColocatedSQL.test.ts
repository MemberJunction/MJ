import { describe, it, expect } from 'vitest';
import {
    BuildApproximateVectorQuery,
    BuildExactVectorQuery,
    BuildFilterCountQuery,
    BuildFilterFragment,
    DeriveContent,
    DistanceToScore,
    MetricDistanceFn,
    ParseVectorJson,
    SafeTopK,
    SqlServerIndexTarget,
    VectorJson,
    DEFAULT_ITERATIVE_FILTER_THRESHOLD,
    SQLSERVER_2025_MAJOR_VERSION,
} from '../models/sqlserverColocatedSQL';

const siblingTarget: SqlServerIndexTarget = {
    qualifiedTable: '[__mj].[vec_x]', vectorColumn: 'embedding', keyColumn: 'id',
    selectColumns: ['metadata'], filterMode: 'jsonMetadata',
};
const entityTarget: SqlServerIndexTarget = {
    qualifiedTable: '[Recommendation].[Content]', vectorColumn: 'Embedding', keyColumn: 'ID',
    selectColumns: ['Title', 'Source'], filterMode: 'column',
};

describe('sqlserverColocatedSQL (pure builders)', () => {
    it('VectorJson / ParseVectorJson round-trip', () => {
        expect(VectorJson([0.1, 0.2])).toBe('[0.1,0.2]');
        expect(ParseVectorJson('[0.1,0.2]')).toEqual([0.1, 0.2]);
        expect(ParseVectorJson(null)).toEqual([]);
        expect(ParseVectorJson('not json')).toEqual([]);
    });

    it('MetricDistanceFn maps metrics (dotproduct → dot)', () => {
        expect(MetricDistanceFn('cosine')).toBe('cosine');
        expect(MetricDistanceFn('dotproduct')).toBe('dot');
        expect(MetricDistanceFn('bogus')).toBe('cosine');
    });

    it('DistanceToScore mirrors pgvector semantics', () => {
        expect(DistanceToScore(0.2, 'cosine')).toBeCloseTo(0.8);
        expect(DistanceToScore(1, 'euclidean')).toBeCloseTo(0.5);
        expect(DistanceToScore(-0.9, 'dotproduct')).toBeCloseTo(0.9);
    });

    it('DeriveContent skips system keys and flattens arrays', () => {
        expect(DeriveContent({ RecordID: 'x', Name: 'Ada', Tags: ['a', 'b'] })).toBe('Ada a b');
    });

    it('SafeTopK clamps to a positive integer', () => {
        expect(SafeTopK(0)).toBe(1);
        expect(SafeTopK(7.9)).toBe(7);
        expect(SafeTopK(99999, 100)).toBe(100);
    });

    it('exposes constants', () => {
        expect(SQLSERVER_2025_MAJOR_VERSION).toBe(17);
        expect(DEFAULT_ITERATIVE_FILTER_THRESHOLD).toBe(50000);
    });

    describe('BuildFilterFragment', () => {
        it('jsonMetadata mode → JSON_VALUE on metadata column', () => {
            const frag = BuildFilterFragment({ Entity: { $eq: 'Members' } }, 1, 'jsonMetadata');
            expect(frag.clause).toBe("JSON_VALUE(c.metadata, '$.Entity') = @p1");
            expect(frag.params).toEqual(['Members']);
        });
        it('column mode → live entity column', () => {
            const frag = BuildFilterFragment({ Source: { $eq: 'arxiv' } }, 1, 'column');
            expect(frag.clause).toBe('c.[Source] = @p1');
            expect(frag.params).toEqual(['arxiv']);
        });
        it('handles _pgvectorConditions IN', () => {
            const frag = BuildFilterFragment(
                { _pgvectorConditions: [{ Field: 'ContentType', Operator: 'in', Value: ['A', 'B'] }] }, 1, 'column'
            );
            expect(frag.clause).toBe('c.[ContentType] IN (@p1, @p2)');
            expect(frag.params).toEqual(['A', 'B']);
        });
        it('throws on a column-mode identifier that is not allow-listed (injection guard)', () => {
            expect(() => BuildFilterFragment({ 'x]) OR 1=1 --': { $eq: '1' } }, 1, 'column')).toThrow(/Invalid SQL/);
        });
        it('throws on an unsupported operator instead of silently dropping the condition', () => {
            expect(() => BuildFilterFragment({ _pgvectorConditions: [{ Field: 'Source', Operator: 'gt', Value: 1 }] }, 1, 'column'))
                .toThrow(/Unsupported filter operator/);
        });
    });

    describe('BuildApproximateVectorQuery (DiskANN / VECTOR_SEARCH)', () => {
        it('uses the TVF + WITH APPROXIMATE + DECLARE @qv (NOT ORDER BY VECTOR_DISTANCE)', () => {
            const q = BuildApproximateVectorQuery({ target: siblingTarget, dimension: 1536, metric: 'cosine', vector: [0.1, 0.2], topK: 8 });
            expect(q.sql).toContain('DECLARE @qv VECTOR(1536) = CAST(@p0 AS VECTOR(1536))');
            expect(q.sql).toContain('SELECT TOP (8) WITH APPROXIMATE');
            expect(q.sql).toContain('FROM VECTOR_SEARCH(');
            expect(q.sql).toContain('SIMILAR_TO = @qv');
            expect(q.sql).toContain("METRIC = 'cosine'");
            expect(q.sql).toContain('ORDER BY vs.distance ASC');
            expect(q.sql).not.toMatch(/ORDER BY VECTOR_DISTANCE/);
            expect(q.params[0]).toBe('[0.1,0.2]');
        });
        it('entityColumn: projects entity columns and filters live columns', () => {
            const q = BuildApproximateVectorQuery({
                target: entityTarget, dimension: 1536, metric: 'cosine', vector: [1], topK: 5,
                filter: { Source: { $eq: 'arxiv' } },
            });
            expect(q.sql).toContain('c.[ID] AS id');
            expect(q.sql).toContain('c.[Title] AS [Title]');
            expect(q.sql).toContain('TABLE = [Recommendation].[Content] AS c');
            expect(q.sql).toContain('COLUMN = [Embedding]');
            expect(q.sql).toContain('WHERE c.[Source] = @p1');
            expect(q.params).toEqual(['[1]', 'arxiv']);
        });
    });

    describe('BuildExactVectorQuery (iterative filter / brute force)', () => {
        it('uses a VECTOR_DISTANCE CTE with the IS NOT NULL guard', () => {
            const q = BuildExactVectorQuery({
                target: entityTarget, dimension: 1536, metric: 'cosine', vector: [1], topK: 5,
                filter: { Source: { $eq: 'arxiv' } },
            });
            expect(q.sql).toContain('WITH FilteredCandidates AS');
            expect(q.sql).toContain("VECTOR_DISTANCE('cosine', @qv, c.[Embedding])");
            expect(q.sql).toContain('c.[Embedding] IS NOT NULL AND c.[Source] = @p1');
            expect(q.sql).not.toContain('WITH APPROXIMATE');
            expect(q.params).toEqual(['[1]', 'arxiv']);
        });
    });

    describe('BuildFilterCountQuery', () => {
        it('counts filter-matching rows without the IS NOT NULL predicate', () => {
            const q = BuildFilterCountQuery(entityTarget, { Source: { $eq: 'arxiv' } });
            expect(q.sql).toContain('SELECT COUNT(*) AS n');
            expect(q.sql).toContain('FROM [Recommendation].[Content] c WITH (NOLOCK)');
            expect(q.sql).toContain('WHERE c.[Source] = @p0');
            expect(q.sql).not.toContain('IS NOT NULL');
            expect(q.params).toEqual(['arxiv']);
        });
    });
});
