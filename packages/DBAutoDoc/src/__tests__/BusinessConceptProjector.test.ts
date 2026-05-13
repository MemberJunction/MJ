import { describe, it, expect, vi } from 'vitest';
import {
    BusinessConceptProjector,
    DEFAULT_BUSINESS_ANCHORS,
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
});
