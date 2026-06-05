/**
 * Unit tests for the pure Classify dry-run disposition helper.
 *
 * The helper replays the deterministic, post-resolution routing portion of the
 * server's tiered autotagger so operators can preview the effect of taxonomy
 * mode + thresholds before a real run. These tests pin every disposition branch
 * and the threshold boundaries (≥ match, in the suggest band, < suggest) across
 * all three taxonomy modes.
 */
import { describe, it, expect } from 'vitest';
import {
    previewDispositions,
    DryRunInput,
    DryRunConfig,
    ResolveResult,
} from '../AI/components/autotagging/shared/classify.dryrun';

// ── Helpers ──

const cfg = (overrides: Partial<DryRunConfig> = {}): DryRunConfig => ({
    mode: 'auto-grow',
    matchThreshold: 0.85,
    suggestThreshold: 0.8,
    ...overrides,
});

const input = (tag: string): DryRunInput[] => [{ tag, resolvedTagId: null, weight: 1 }];

/** Build a resolve fn that always returns a fixed result regardless of input. */
const fixedResolve = (r: ResolveResult) => (): ResolveResult => r;

const synonym: ResolveResult = { tagId: 't1', tagName: 'AI Agents', score: 1.0, tier: 'synonym' };
const exact: ResolveResult = { tagId: 't2', tagName: 'RAG', score: 1.0, tier: 'exact' };
const fuzzy = (score: number): ResolveResult => ({ tagId: 't3', tagName: 'Orchestration', score, tier: 'fuzzy' });
const none: ResolveResult = { tagId: null, tagName: null, score: null, tier: 'none' };

describe('previewDispositions', () => {
    describe('tier 1 — exact / synonym → auto-apply', () => {
        it('auto-applies a synonym match', () => {
            const rows = previewDispositions(input('agents'), cfg(), fixedResolve(synonym));
            expect(rows[0].disposition).toBe('auto-apply');
            expect(rows[0].matchedTag).toBe('AI Agents');
            expect(rows[0].score).toBe(1.0);
            expect(rows[0].reason).toBe('synonym match');
        });

        it('auto-applies an exact match', () => {
            const rows = previewDispositions(input('rag'), cfg(), fixedResolve(exact));
            expect(rows[0].disposition).toBe('auto-apply');
            expect(rows[0].reason).toBe('exact/synonym match');
        });

        it('auto-applies a fuzzy score at/above the match threshold', () => {
            // tier is fuzzy but score clears the match bar → still auto-apply
            const rows = previewDispositions(input('x'), cfg({ matchThreshold: 0.85 }), fixedResolve(fuzzy(0.9)));
            expect(rows[0].disposition).toBe('auto-apply');
        });

        it('boundary: score exactly == matchThreshold → auto-apply (≥)', () => {
            const rows = previewDispositions(input('x'), cfg({ matchThreshold: 0.85 }), fixedResolve(fuzzy(0.85)));
            expect(rows[0].disposition).toBe('auto-apply');
        });
    });

    describe('tier 2 — suggest band → route-to-inbox', () => {
        it('routes a fuzzy match between suggest and match thresholds to inbox', () => {
            const rows = previewDispositions(input('orch'), cfg({ matchThreshold: 0.85, suggestThreshold: 0.8 }), fixedResolve(fuzzy(0.82)));
            expect(rows[0].disposition).toBe('route-to-inbox');
            expect(rows[0].reason).toBe('below match threshold');
            expect(rows[0].matchedTag).toBe('Orchestration');
        });

        it('boundary: score exactly == suggestThreshold → route-to-inbox (lower bound inclusive)', () => {
            const rows = previewDispositions(input('x'), cfg({ matchThreshold: 0.85, suggestThreshold: 0.8 }), fixedResolve(fuzzy(0.8)));
            expect(rows[0].disposition).toBe('route-to-inbox');
        });

        it('boundary: score just below matchThreshold → route-to-inbox (upper bound exclusive)', () => {
            const rows = previewDispositions(input('x'), cfg({ matchThreshold: 0.85, suggestThreshold: 0.8 }), fixedResolve(fuzzy(0.849)));
            expect(rows[0].disposition).toBe('route-to-inbox');
        });
    });

    describe('tier 3 — below suggest band / no match → mode-governed', () => {
        it('a fuzzy score BELOW the suggest band falls through to mode handling (auto-grow → create-new)', () => {
            const rows = previewDispositions(input('x'), cfg({ mode: 'auto-grow', matchThreshold: 0.85, suggestThreshold: 0.8 }), fixedResolve(fuzzy(0.5)));
            expect(rows[0].disposition).toBe('create-new');
        });

        describe('mode: constrained', () => {
            it('routes a novel (no-match) tag to inbox for review', () => {
                const rows = previewDispositions(input('chunking'), cfg({ mode: 'constrained' }), fixedResolve(none));
                expect(rows[0].disposition).toBe('route-to-inbox');
                expect(rows[0].reason).toBe('constrained: novel tag → review');
                expect(rows[0].matchedTag).toBeNull();
            });
        });

        describe('mode: auto-grow', () => {
            it('would create a new tag for a novel tag', () => {
                const rows = previewDispositions(input('chunking'), cfg({ mode: 'auto-grow' }), fixedResolve(none));
                expect(rows[0].disposition).toBe('create-new');
                expect(rows[0].reason).toBe('auto-grow: would create tag');
            });
        });

        describe('mode: free-flow', () => {
            it('would create a new tag for a novel tag', () => {
                const rows = previewDispositions(input('chunking'), cfg({ mode: 'free-flow' }), fixedResolve(none));
                expect(rows[0].disposition).toBe('create-new');
                expect(rows[0].reason).toBe('free-flow: would create tag');
            });
        });
    });

    describe('batch behavior', () => {
        it('preserves input order and resolves each row independently', () => {
            const rows = previewDispositions(
                [
                    { tag: 'agents', resolvedTagId: 't1', weight: 1 },
                    { tag: 'orch', resolvedTagId: null, weight: 0.7 },
                    { tag: 'chunking', resolvedTagId: null, weight: 0.4 },
                ],
                cfg({ mode: 'auto-grow', matchThreshold: 0.85, suggestThreshold: 0.8 }),
                (tag: string): ResolveResult => {
                    if (tag === 'agents') return synonym;
                    if (tag === 'orch') return fuzzy(0.82);
                    return none;
                },
            );
            expect(rows.map(r => r.disposition)).toEqual(['auto-apply', 'route-to-inbox', 'create-new']);
            expect(rows.map(r => r.tag)).toEqual(['agents', 'orch', 'chunking']);
        });

        it('returns an empty array for no input', () => {
            expect(previewDispositions([], cfg(), fixedResolve(none))).toEqual([]);
        });
    });
});
