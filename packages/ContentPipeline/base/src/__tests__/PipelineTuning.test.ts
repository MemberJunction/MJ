import { describe, expect, it } from 'vitest';
import { ConfidenceScale, ResolveConfidence } from '../ConfidenceScale.js';
import { DefaultPipelineTuning, ResolveTuning } from '../PipelineTuning.js';

describe('ResolveTuning', () => {
    it('falls back to the documented defaults when nothing is configured', () => {
        const t = ResolveTuning(undefined);
        expect(t.ProgressEveryItems).toBe(DefaultPipelineTuning.ProgressEveryItems);
        expect(t.MinimumPrintableRatio).toBe(DefaultPipelineTuning.MinimumPrintableRatio);
        expect(t.MaxBlockCharacters).toBeNull();
        expect(t.MaxArchiveDepth).toBe(DefaultPipelineTuning.MaxArchiveDepth);
        expect(t.MaxSyncRemovalShare).toBe(DefaultPipelineTuning.MaxSyncRemovalShare);
        expect(t.ClockSkewOverlapMs).toBe(DefaultPipelineTuning.ClockSkewOverlapMs);
    });

    it('takes a configured value', () => {
        const t = ResolveTuning({
            Tuning: {
                ProgressEveryItems: 5,
                MinimumPrintableRatio: 0.5,
                MaxArchiveDepth: 4,
                MaxSyncRemovalShare: 0.25,
                ClockSkewOverlapMs: 0,
            },
        });
        expect(t.ProgressEveryItems).toBe(5);
        expect(t.MinimumPrintableRatio).toBe(0.5);
        expect(t.MaxArchiveDepth).toBe(4);
        expect(t.MaxSyncRemovalShare).toBe(0.25);
        expect(t.ClockSkewOverlapMs).toBe(0);
    });

    it('reads Tuning nested under Options when a full Configuration object is passed', () => {
        const t = ResolveTuning({
            Options: {
                Tuning: {
                    MaxArchiveMembers: 100,
                    MaxArchiveBytes: 2048,
                    MaxArchiveDepth: 2,
                    ClockSkewOverlapMs: 15_000,
                },
            },
        });
        expect(t.MaxArchiveMembers).toBe(100);
        expect(t.MaxArchiveBytes).toBe(2048);
        expect(t.MaxArchiveDepth).toBe(2);
        expect(t.ClockSkewOverlapMs).toBe(15_000);
    });

    it('falls back rather than throwing on a nonsense value', () => {
        // A typo in configuration should not take a run down.
        const t = ResolveTuning({
            Tuning: {
                ProgressEveryItems: -1,
                MinimumPrintableRatio: 7,
                MaxArchiveDepth: 0,
                MaxSyncRemovalShare: 2,
                ClockSkewOverlapMs: -5,
            },
        });
        expect(t.ProgressEveryItems).toBe(25);
        expect(t.MinimumPrintableRatio).toBe(0.85);
        expect(t.MaxArchiveDepth).toBe(3);
        expect(t.MaxSyncRemovalShare).toBe(0.5);
        expect(t.ClockSkewOverlapMs).toBe(60_000);
    });

    it('falls back on a wrong type', () => {
        const t = ResolveTuning({ Tuning: { ProgressEveryItems: 'lots' } } as never);
        expect(t.ProgressEveryItems).toBe(25);
    });

    it('accepts the boundary ratios', () => {
        expect(ResolveTuning({ Tuning: { MinimumPrintableRatio: 0 } }).MinimumPrintableRatio).toBe(0);
        expect(ResolveTuning({ Tuning: { MinimumPrintableRatio: 1 } }).MinimumPrintableRatio).toBe(1);
    });

    it('ignores an unrelated configuration object', () => {
        expect(ResolveTuning({ Stages: ['Extract'] }).ProgressEveryItems).toBe(25);
    });
});

describe('ConfidenceScale', () => {
    it('orders file-type evidence by how much it deserves to be believed', () => {
        // The ordering is the only load-bearing part; the absolute numbers are arbitrary.
        expect(ConfidenceScale.FileTypeByteCorrection).toBeGreaterThan(ConfidenceScale.FileTypeDeclared);
        expect(ConfidenceScale.FileTypeDeclared).toBeGreaterThan(ConfidenceScale.FileTypeSignature);
        expect(ConfidenceScale.FileTypeSignature).toBeGreaterThan(ConfidenceScale.FileTypeExtension);
    });

    it('ranks a real extractor above the last-resort plain-text read', () => {
        expect(ConfidenceScale.ExtractorText).toBeGreaterThan(ConfidenceScale.FallbackText);
    });
});

describe('ResolveConfidence', () => {
    it('returns the defaults when nothing is configured', () => {
        expect(ResolveConfidence(undefined)).toEqual({ ...ConfidenceScale });
    });

    it('applies an override', () => {
        const c = ResolveConfidence({ Confidence: { ExtractorTitle: 9 } });
        expect(c.ExtractorTitle).toBe(9);
    });

    it('leaves every other entry at its default', () => {
        const c = ResolveConfidence({ Confidence: { ExtractorTitle: 9 } });
        expect(c.ExtractorText).toBe(ConfidenceScale.ExtractorText);
        expect(c.FileTypeDeclared).toBe(ConfidenceScale.FileTypeDeclared);
    });

    it('can invert a precedence rule, which is the point and the risk', () => {
        // A deployment whose extractors find better titles than its listing pages do.
        const c = ResolveConfidence({ Confidence: { ExtractorTitle: 1 } });
        expect(c.ExtractorTitle).toBeLessThan(ConfidenceScale.FileTypeExtension + 2);
    });

    it('applies later configurations over earlier ones (SourceType -> Source -> Run)', () => {
        const c = ResolveConfidence(
            { Confidence: { DiscoveredTitle: 7, ExtractorTitle: 5 } },
            { Confidence: { DiscoveredTitle: 8 } },
            { Confidence: { DiscoveredTitle: 9 } },
        );
        expect(c.DiscoveredTitle).toBe(9);
        expect(c.ExtractorTitle).toBe(5);
        expect(c.FallbackText).toBe(ConfidenceScale.FallbackText);
    });

    it('ignores a non-numeric override rather than reordering precedence on a typo', () => {
        const c = ResolveConfidence({ Confidence: { ExtractorText: 'high' } } as never);
        expect(c.ExtractorText).toBe(ConfidenceScale.ExtractorText);
    });

    it('ignores an unknown key', () => {
        const c = ResolveConfidence({ Confidence: { NotAThing: 5 } } as never);
        expect(c).toEqual({ ...ConfidenceScale });
    });

    it('ignores a non-finite override', () => {
        const c = ResolveConfidence({ Confidence: { ExtractorText: Number.POSITIVE_INFINITY } });
        expect(c.ExtractorText).toBe(ConfidenceScale.ExtractorText);
    });
});
