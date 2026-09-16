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
    PreviewDispositions,
    DryRunInput,
    DryRunConfig,
    ResolveResult,
} from '../AI/components/autotagging/shared/classify.dryrun';

// ── Helpers ──

const cfg = (overrides: Partial<DryRunConfig> = {}): DryRunConfig => ({
    Mode: 'auto-grow',
    MatchThreshold: 0.85,
    SuggestThreshold: 0.8,
    ...overrides,
});

const input = (tag: string): DryRunInput[] => [{ tag, resolvedTagId: null, weight: 1 }];

/** Build a resolve fn that always returns a fixed result regardless of input. */
const fixedResolve = (r: ResolveResult) => (): ResolveResult => r;

const synonym: ResolveResult = { TagId: 't1', TagName: 'AI Agents', Score: 1.0, Tier: 'synonym' };
const exact: ResolveResult = { TagId: 't2', TagName: 'RAG', Score: 1.0, Tier: 'exact' };
const fuzzy = (score: number): ResolveResult => ({ TagId: 't3', TagName: 'Orchestration', Score: score, Tier: 'fuzzy' });
const none: ResolveResult = { TagId: null, TagName: null, Score: null, Tier: 'none' };

describe('previewDispositions', () => {
    describe('tier 1 — exact / synonym → auto-apply', () => {
        it('auto-applies a synonym match', () => {
            const rows = PreviewDispositions(input('agents'), cfg(), fixedResolve(synonym));
            expect(rows[0].Disposition).toBe('auto-apply');
            expect(rows[0].MatchedTag).toBe('AI Agents');
            expect(rows[0].Score).toBe(1.0);
            expect(rows[0].Reason).toBe('synonym match');
        });

        it('auto-applies an exact match', () => {
            const rows = PreviewDispositions(input('rag'), cfg(), fixedResolve(exact));
            expect(rows[0].Disposition).toBe('auto-apply');
            expect(rows[0].Reason).toBe('exact/synonym match');
        });

        it('auto-applies a fuzzy score at/above the match threshold', () => {
            // tier is fuzzy but score clears the match bar → still auto-apply
            const rows = PreviewDispositions(input('x'), cfg({ MatchThreshold: 0.85 }), fixedResolve(fuzzy(0.9)));
            expect(rows[0].Disposition).toBe('auto-apply');
        });

        it('boundary: score exactly == matchThreshold → auto-apply (≥)', () => {
            const rows = PreviewDispositions(input('x'), cfg({ MatchThreshold: 0.85 }), fixedResolve(fuzzy(0.85)));
            expect(rows[0].Disposition).toBe('auto-apply');
        });
    });

    describe('tier 2 — suggest band → route-to-inbox', () => {
        it('routes a fuzzy match between suggest and match thresholds to inbox', () => {
            const rows = PreviewDispositions(input('orch'), cfg({ MatchThreshold: 0.85, SuggestThreshold: 0.8 }), fixedResolve(fuzzy(0.82)));
            expect(rows[0].Disposition).toBe('route-to-inbox');
            expect(rows[0].Reason).toBe('below match threshold');
            expect(rows[0].MatchedTag).toBe('Orchestration');
        });

        it('boundary: score exactly == suggestThreshold → route-to-inbox (lower bound inclusive)', () => {
            const rows = PreviewDispositions(input('x'), cfg({ MatchThreshold: 0.85, SuggestThreshold: 0.8 }), fixedResolve(fuzzy(0.8)));
            expect(rows[0].Disposition).toBe('route-to-inbox');
        });

        it('boundary: score just below matchThreshold → route-to-inbox (upper bound exclusive)', () => {
            const rows = PreviewDispositions(input('x'), cfg({ MatchThreshold: 0.85, SuggestThreshold: 0.8 }), fixedResolve(fuzzy(0.849)));
            expect(rows[0].Disposition).toBe('route-to-inbox');
        });
    });

    describe('tier 3 — below suggest band / no match → mode-governed', () => {
        it('a fuzzy score BELOW the suggest band falls through to mode handling (auto-grow → create-new)', () => {
            const rows = PreviewDispositions(input('x'), cfg({ Mode: 'auto-grow', MatchThreshold: 0.85, SuggestThreshold: 0.8 }), fixedResolve(fuzzy(0.5)));
            expect(rows[0].Disposition).toBe('create-new');
        });

        describe('mode: constrained', () => {
            it('routes a novel (no-match) tag to inbox for review', () => {
                const rows = PreviewDispositions(input('chunking'), cfg({ Mode: 'constrained' }), fixedResolve(none));
                expect(rows[0].Disposition).toBe('route-to-inbox');
                expect(rows[0].Reason).toBe('constrained: novel tag → review');
                expect(rows[0].MatchedTag).toBeNull();
            });
        });

        describe('mode: auto-grow', () => {
            it('would create a new tag for a novel tag', () => {
                const rows = PreviewDispositions(input('chunking'), cfg({ Mode: 'auto-grow' }), fixedResolve(none));
                expect(rows[0].Disposition).toBe('create-new');
                expect(rows[0].Reason).toBe('auto-grow: would create tag');
            });
        });

        describe('mode: free-flow', () => {
            it('would create a new tag for a novel tag', () => {
                const rows = PreviewDispositions(input('chunking'), cfg({ Mode: 'free-flow' }), fixedResolve(none));
                expect(rows[0].Disposition).toBe('create-new');
                expect(rows[0].Reason).toBe('free-flow: would create tag');
            });
        });
    });

    describe('batch behavior', () => {
        it('preserves input order and resolves each row independently', () => {
            const rows = PreviewDispositions(
                [
                    { tag: 'agents', resolvedTagId: 't1', weight: 1 },
                    { tag: 'orch', resolvedTagId: null, weight: 0.7 },
                    { tag: 'chunking', resolvedTagId: null, weight: 0.4 },
                ],
                cfg({ Mode: 'auto-grow', MatchThreshold: 0.85, SuggestThreshold: 0.8 }),
                (tag: string): ResolveResult => {
                    if (tag === 'agents') return synonym;
                    if (tag === 'orch') return fuzzy(0.82);
                    return none;
                },
            );
            expect(rows.map(r => r.Disposition)).toEqual(['auto-apply', 'route-to-inbox', 'create-new']);
            expect(rows.map(r => r.Tag)).toEqual(['agents', 'orch', 'chunking']);
        });

        it('returns an empty array for no input', () => {
            expect(PreviewDispositions([], cfg(), fixedResolve(none))).toEqual([]);
        });
    });
});
