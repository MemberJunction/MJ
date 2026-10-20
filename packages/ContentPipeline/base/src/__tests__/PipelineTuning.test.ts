import { describe, expect, it } from 'vitest';
import { ConfidenceScale } from '../ConfidenceScale.js';
import { DefaultPipelineTuning, ResolveTuning } from '../PipelineTuning.js';

describe('ResolveTuning', () => {
    it('falls back to the documented defaults when nothing is configured', () => {
        const t = ResolveTuning(undefined);
        expect(t.ProgressEveryItems).toBe(DefaultPipelineTuning.ProgressEveryItems);
        expect(t.MinimumPrintableRatio).toBe(DefaultPipelineTuning.MinimumPrintableRatio);
        expect(t.MaxBlockCharacters).toBeNull();
        expect(t.MaxArchiveDepth).toBe(DefaultPipelineTuning.MaxArchiveDepth);
        expect(t.MaxSyncRemovalShare).toBe(DefaultPipelineTuning.MaxSyncRemovalShare);
    });

    it('takes a configured value', () => {
        const t = ResolveTuning({
            Tuning: {
                ProgressEveryItems: 5,
                MinimumPrintableRatio: 0.5,
                MaxArchiveDepth: 4,
                MaxSyncRemovalShare: 0.25,
            },
        });
        expect(t.ProgressEveryItems).toBe(5);
        expect(t.MinimumPrintableRatio).toBe(0.5);
        expect(t.MaxArchiveDepth).toBe(4);
        expect(t.MaxSyncRemovalShare).toBe(0.25);
    });

    it('reads Tuning nested under Options when a full Configuration object is passed', () => {
        const t = ResolveTuning({
            Options: {
                Tuning: {
                    MaxArchiveMembers: 100,
                    MaxArchiveBytes: 2048,
                    MaxArchiveDepth: 2,
                },
            },
        });
        expect(t.MaxArchiveMembers).toBe(100);
        expect(t.MaxArchiveBytes).toBe(2048);
        expect(t.MaxArchiveDepth).toBe(2);
    });

    it('falls back rather than throwing on a nonsense value', () => {
        // A typo in configuration should not take a run down.
        const t = ResolveTuning({
            Tuning: {
                ProgressEveryItems: -1,
                MinimumPrintableRatio: 7,
                MaxArchiveDepth: 0,
                MaxSyncRemovalShare: 2,
            },
        });
        expect(t.ProgressEveryItems).toBe(25);
        expect(t.MinimumPrintableRatio).toBe(0.85);
        expect(t.MaxArchiveDepth).toBe(3);
        expect(t.MaxSyncRemovalShare).toBe(0.5);
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
