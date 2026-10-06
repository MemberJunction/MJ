import { describe, expect, it } from 'vitest';
import { ConfidenceScale, ResolveConfidence } from '../ConfidenceScale.js';
import { DefaultPipelineTuning, ResolveTuning } from '../PipelineTuning.js';

describe('ResolveTuning', () => {
    it('falls back to the documented defaults when nothing is configured', () => {
        const t = ResolveTuning(undefined);
        expect(t.ProgressEveryItems).toBe(DefaultPipelineTuning.ProgressEveryItems);
        expect(t.MinimumPrintableRatio).toBe(DefaultPipelineTuning.MinimumPrintableRatio);
        expect(t.MaxBlockCharacters).toBeNull();
    });

    it('takes a configured value', () => {
        const t = ResolveTuning({ Tuning: { ProgressEveryItems: 5, MinimumPrintableRatio: 0.5 } });
        expect(t.ProgressEveryItems).toBe(5);
        expect(t.MinimumPrintableRatio).toBe(0.5);
    });

    it('falls back rather than throwing on a nonsense value', () => {
        // A typo in configuration should not take a run down.
        const t = ResolveTuning({ Tuning: { ProgressEveryItems: -1, MinimumPrintableRatio: 7 } });
        expect(t.ProgressEveryItems).toBe(25);
        expect(t.MinimumPrintableRatio).toBe(0.85);
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
        expect(ConfidenceScale.ReaderText).toBeGreaterThan(ConfidenceScale.FallbackText);
    });
});

describe('ResolveConfidence', () => {
    it('returns the defaults when nothing is configured', () => {
        expect(ResolveConfidence(undefined)).toEqual({ ...ConfidenceScale });
    });

    it('applies an override', () => {
        const c = ResolveConfidence({ Confidence: { ReaderTitle: 9 } });
        expect(c.ReaderTitle).toBe(9);
    });

    it('leaves every other entry at its default', () => {
        const c = ResolveConfidence({ Confidence: { ReaderTitle: 9 } });
        expect(c.ReaderText).toBe(ConfidenceScale.ReaderText);
        expect(c.FileTypeDeclared).toBe(ConfidenceScale.FileTypeDeclared);
    });

    it('can invert a precedence rule, which is the point and the risk', () => {
        // A deployment whose extractors find better titles than its listing pages do.
        const c = ResolveConfidence({ Confidence: { ReaderTitle: 1 } });
        expect(c.ReaderTitle).toBeLessThan(ConfidenceScale.FileTypeExtension + 2);
    });

    it('ignores a non-numeric override rather than reordering precedence on a typo', () => {
        const c = ResolveConfidence({ Confidence: { ReaderText: 'high' } } as never);
        expect(c.ReaderText).toBe(ConfidenceScale.ReaderText);
    });

    it('ignores an unknown key', () => {
        const c = ResolveConfidence({ Confidence: { NotAThing: 5 } } as never);
        expect(c).toEqual({ ...ConfidenceScale });
    });

    it('ignores a non-finite override', () => {
        const c = ResolveConfidence({ Confidence: { ReaderText: Number.POSITIVE_INFINITY } });
        expect(c.ReaderText).toBe(ConfidenceScale.ReaderText);
    });
});
