import { describe, it, expect, vi } from 'vitest';
import {
    BusinessConceptProjector,
    DEFAULT_BUSINESS_ANCHORS,
    DEFAULT_POSITIVE_ANCHORS,
    DEFAULT_NEGATIVE_ANCHORS,
} from '../discovery/BusinessConceptProjector.js';
import type { EmbeddingProvider } from '../discovery/EmbeddingProvider.js';

/** Helper: build a Float32Array from a number array. */
function f32(...values: number[]): Float32Array {
    return Float32Array.from(values);
}

/** Helper: unit-normalize a small vector for test fixture sanity. */
function unit(vec: number[]): Float32Array {
    let n = 0;
    for (const x of vec) n += x * x;
    n = Math.sqrt(n) || 1;
    return Float32Array.from(vec.map((x) => x / n));
}

describe('BusinessConceptProjector', () => {
    describe('default anchors', () => {
        it('includes anchors for all PR #2193 motivating organic key examples', () => {
            const joined = DEFAULT_BUSINESS_ANCHORS.join(' | ').toLowerCase();
            // Spot-check that the canonical examples from PR #2193 are represented
            expect(joined).toContain('email');
            expect(joined).toContain('phone');
            expect(joined).toContain('tax');
            expect(joined).toContain('domain');
            expect(joined).toContain('customer');
            expect(joined).toContain('product');
            expect(joined).toContain('order');
        });

        it('includes negative anchors for non-business concepts so they project distinctly', () => {
            const joined = DEFAULT_BUSINESS_ANCHORS.join(' | ').toLowerCase();
            expect(joined).toContain('audit');
            expect(joined).toContain('replication');
        });
    });

    describe('build via EmbeddingProvider', () => {
        it('embeds every anchor text on construction', async () => {
            const embedFn = vi.fn(async (texts: string[]) => {
                return texts.map((_, i) => f32(i, 0, 0));
            });
            const provider: EmbeddingProvider = {
                embed: embedFn,
                provider: 'mock',
                model: 'mock',
            };
            const projector = await BusinessConceptProjector.build(provider, {
                anchors: ['email', 'phone', 'name'],
            });
            expect(embedFn).toHaveBeenCalledOnce();
            expect(embedFn.mock.calls[0][0]).toEqual(['email', 'phone', 'name']);
            expect(projector.numAnchors).toBe(3);
        });

        it('appends additionalAnchors after the defaults', async () => {
            const provider: EmbeddingProvider = {
                embed: vi.fn(async (texts: string[]) => texts.map(() => f32(1, 0))),
                provider: 'mock',
                model: 'mock',
            };
            const projector = await BusinessConceptProjector.build(provider, {
                additionalAnchors: ['domain-specific-thing'],
            });
            expect(projector.numAnchors).toBe(DEFAULT_BUSINESS_ANCHORS.length + 1);
            expect(projector.anchorTexts[projector.numAnchors - 1]).toBe('domain-specific-thing');
        });

        it('throws when zero anchors are provided', async () => {
            const provider: EmbeddingProvider = {
                embed: vi.fn(async () => []),
                provider: 'mock',
                model: 'mock',
            };
            await expect(
                BusinessConceptProjector.build(provider, { anchors: [] }),
            ).rejects.toThrow(/at least one anchor/);
        });
    });

    describe('project — cosine similarity into concept space', () => {
        it('produces strong signal on the aligned axis and weak signal on misaligned axes', () => {
            // Anchor 0 = "email"; anchor 1 = "phone"; anchor 2 = "audit"
            const anchors = ['email anchor', 'phone anchor', 'audit anchor'];
            const anchorVecs = [unit([1, 0, 0]), unit([0, 1, 0]), unit([0, 0, 1])];
            const projector = BusinessConceptProjector.withAnchorVectors(anchors, anchorVecs);

            // Input perfectly aligned with email anchor
            const emailLike = unit([1, 0, 0]);
            const projected = projector.project(emailLike);
            expect(projected[0]).toBeCloseTo(1, 5); // strong on email
            expect(projected[1]).toBeCloseTo(0, 5); // weak on phone
            expect(projected[2]).toBeCloseTo(0, 5); // weak on audit
        });

        it('separates business and non-business inputs along distinct axes', () => {
            const anchors = ['business id', 'audit timestamp'];
            const businessAxis = unit([1, 0]);
            const auditAxis = unit([0, 1]);
            const projector = BusinessConceptProjector.withAnchorVectors(anchors, [
                businessAxis,
                auditAxis,
            ]);

            const businessCol = projector.project(unit([1, 0])); // aligned with business
            const auditCol = projector.project(unit([0, 1])); // aligned with audit

            // Business column has high score on axis 0, low on axis 1
            expect(businessCol[0]).toBeGreaterThan(0.9);
            expect(businessCol[1]).toBeLessThan(0.1);

            // Audit column reversed
            expect(auditCol[0]).toBeLessThan(0.1);
            expect(auditCol[1]).toBeGreaterThan(0.9);
        });

        it('unit-normalizes input internally before projecting', () => {
            const anchors = ['anchor'];
            const projector = BusinessConceptProjector.withAnchorVectors(anchors, [unit([1, 0])]);
            const small = projector.project(f32(0.1, 0));
            const large = projector.project(f32(100, 0));
            // Both inputs point in the same direction; projection should be ~1 for both
            expect(small[0]).toBeCloseTo(1, 5);
            expect(large[0]).toBeCloseTo(1, 5);
        });

        it('handles arbitrary input dimensionality matching anchor dimensionality', () => {
            const projector = BusinessConceptProjector.withAnchorVectors(['a'], [
                unit([1, 0, 0, 0, 0]),
            ]);
            const result = projector.project(unit([1, 0, 0, 0, 0]));
            expect(result.length).toBe(1);
            expect(result[0]).toBeCloseTo(1, 5);
        });
    });

    describe('projectAll batched', () => {
        it('preserves input order and applies the same projection to every input', () => {
            const projector = BusinessConceptProjector.withAnchorVectors(
                ['a', 'b'],
                [unit([1, 0]), unit([0, 1])],
            );
            const inputs = [unit([1, 0]), unit([0, 1]), unit([1, 1])];
            const projected = projector.projectAll(inputs);
            expect(projected.length).toBe(3);
            expect(projected[0][0]).toBeCloseTo(1, 5);
            expect(projected[1][1]).toBeCloseTo(1, 5);
            // Third input is 45° between both anchors → projects ~0.707 onto each
            expect(projected[2][0]).toBeCloseTo(Math.SQRT1_2, 5);
            expect(projected[2][1]).toBeCloseTo(Math.SQRT1_2, 5);
        });
    });

    describe('withAnchorVectors validation', () => {
        it('throws when anchor text count and vector count differ', () => {
            expect(() =>
                BusinessConceptProjector.withAnchorVectors(['a', 'b'], [unit([1, 0])]),
            ).toThrow(/mismatch/);
        });
    });

    describe('positive/negative anchor split', () => {
        it('DEFAULT_BUSINESS_ANCHORS is the concat of positive then negative', () => {
            expect(DEFAULT_BUSINESS_ANCHORS.length).toBe(
                DEFAULT_POSITIVE_ANCHORS.length + DEFAULT_NEGATIVE_ANCHORS.length,
            );
            for (let i = 0; i < DEFAULT_POSITIVE_ANCHORS.length; i++) {
                expect(DEFAULT_BUSINESS_ANCHORS[i]).toBe(DEFAULT_POSITIVE_ANCHORS[i]);
            }
            for (let i = 0; i < DEFAULT_NEGATIVE_ANCHORS.length; i++) {
                expect(
                    DEFAULT_BUSINESS_ANCHORS[DEFAULT_POSITIVE_ANCHORS.length + i],
                ).toBe(DEFAULT_NEGATIVE_ANCHORS[i]);
            }
        });

        it('reports correct positive/negative counts when built from defaults', async () => {
            const embedFn = vi.fn(async (texts: string[]) => texts.map((_, i) => f32(i, 0)));
            const provider: EmbeddingProvider = {
                embed: embedFn,
                provider: 'mock',
                model: 'mock',
            };
            const projector = await BusinessConceptProjector.build(provider);
            expect(projector.positiveAnchorCount).toBe(DEFAULT_POSITIVE_ANCHORS.length);
            expect(projector.negativeAnchorCount).toBe(DEFAULT_NEGATIVE_ANCHORS.length);
        });

        it('respects explicit negativeAnchorCount option', async () => {
            const provider: EmbeddingProvider = {
                embed: vi.fn(async (texts: string[]) => texts.map(() => f32(1, 0))),
                provider: 'mock',
                model: 'mock',
            };
            const projector = await BusinessConceptProjector.build(provider, {
                anchors: ['a', 'b', 'c', 'd'],
                negativeAnchorCount: 2,
            });
            expect(projector.positiveAnchorCount).toBe(2);
            expect(projector.negativeAnchorCount).toBe(2);
        });

        it('defaults to 0 negative when custom anchors supplied without negativeAnchorCount', async () => {
            const provider: EmbeddingProvider = {
                embed: vi.fn(async (texts: string[]) => texts.map(() => f32(1, 0))),
                provider: 'mock',
                model: 'mock',
            };
            const projector = await BusinessConceptProjector.build(provider, {
                anchors: ['my-custom'],
            });
            expect(projector.positiveAnchorCount).toBe(1);
            expect(projector.negativeAnchorCount).toBe(0);
        });
    });

    describe('scoreColumn — gate scoring on a single embedding', () => {
        it('separates business-aligned from anti-aligned inputs', () => {
            // 2 positive + 1 negative anchor along orthogonal axes
            const projector = BusinessConceptProjector.withAnchorVectors(
                ['pos1', 'pos2', 'neg1'],
                [unit([1, 0, 0]), unit([0, 1, 0]), unit([0, 0, 1])],
                /*negativeAnchorCount*/ 1,
            );

            const business = projector.scoreColumn(unit([1, 0, 0])); // pure pos1
            expect(business.businessScore).toBeGreaterThan(0.99);
            expect(business.antiScore).toBeLessThan(0.01);
            expect(business.netBusinessScore).toBeGreaterThan(0.99);
            expect(business.dominantAnchorIndex).toBe(0);
            expect(business.dominantAnchorKind).toBe('positive');

            const audit = projector.scoreColumn(unit([0, 0, 1])); // pure neg1
            expect(audit.businessScore).toBeLessThan(0.01);
            expect(audit.antiScore).toBeGreaterThan(0.99);
            expect(audit.netBusinessScore).toBeLessThan(-0.99);
            expect(audit.dominantAnchorIndex).toBe(2);
            expect(audit.dominantAnchorKind).toBe('negative');
        });

        it('reports per-axis breakdown of length numAnchors', () => {
            const projector = BusinessConceptProjector.withAnchorVectors(
                ['a', 'b', 'c'],
                [unit([1, 0, 0]), unit([0, 1, 0]), unit([0, 0, 1])],
                1,
            );
            const score = projector.scoreColumn(unit([1, 1, 0]));
            expect(score.axisScores.length).toBe(3);
            expect(score.axisScores[0]).toBeCloseTo(Math.SQRT1_2, 4);
            expect(score.axisScores[1]).toBeCloseTo(Math.SQRT1_2, 4);
            expect(score.axisScores[2]).toBeCloseTo(0, 4);
        });
    });

    describe('scoreCluster — gate scoring on member centroid', () => {
        it('averages members to compute centroid, then scores via anchors', () => {
            const projector = BusinessConceptProjector.withAnchorVectors(
                ['business', 'audit'],
                [unit([1, 0]), unit([0, 1])],
                1,
            );
            // Members both lean strongly toward business axis
            const score = projector.scoreCluster([unit([1, 0]), unit([1, 0]), unit([1, 0])]);
            expect(score.businessScore).toBeGreaterThan(0.99);
            expect(score.antiScore).toBeLessThan(0.01);
            expect(score.dominantAnchorKind).toBe('positive');
        });

        it('correctly classifies audit-aligned clusters as anti-dominant', () => {
            const projector = BusinessConceptProjector.withAnchorVectors(
                ['business', 'audit'],
                [unit([1, 0]), unit([0, 1])],
                1,
            );
            const score = projector.scoreCluster([unit([0, 1]), unit([0, 1]), unit([0, 1])]);
            expect(score.dominantAnchorKind).toBe('negative');
            expect(score.netBusinessScore).toBeLessThan(-0.99);
        });

        it('mixed-direction members average to a center weakly aligned with both', () => {
            const projector = BusinessConceptProjector.withAnchorVectors(
                ['business', 'audit'],
                [unit([1, 0]), unit([0, 1])],
                1,
            );
            const score = projector.scoreCluster([unit([1, 0]), unit([0, 1])]);
            // Centroid = (0.5, 0.5) unit-normalized → scores equal on both axes
            expect(score.businessScore).toBeCloseTo(score.antiScore, 3);
            expect(Math.abs(score.netBusinessScore)).toBeLessThan(0.05);
        });

        it('throws when given an empty member list', () => {
            const projector = BusinessConceptProjector.withAnchorVectors(
                ['a'],
                [unit([1, 0])],
                0,
            );
            expect(() => projector.scoreCluster([])).toThrow(/at least one/);
        });

        it('handles single-member cluster (degenerate centroid = the member itself)', () => {
            const projector = BusinessConceptProjector.withAnchorVectors(
                ['business', 'audit'],
                [unit([1, 0]), unit([0, 1])],
                1,
            );
            const score = projector.scoreCluster([unit([1, 0])]);
            expect(score.businessScore).toBeGreaterThan(0.99);
        });
    });
});
