import { describe, expect, it } from 'vitest';
import {
    BuildGenerationProvenanceSummary,
    DescribeGeneratedAssets,
} from '../generated-asset-disclosure.js';
import { VideoGenerationSpec } from '../video-generation-spec.js';

describe('generated-asset-disclosure (D20)', () => {
    it('returns empty items and SummaryLine: null when zero generated assets exist', () => {
        const spec: Partial<VideoGenerationSpec> = {};
        const result = DescribeGeneratedAssets(spec);
        expect(result).toEqual({
            Items: [],
            ClipCount: 0,
            ImageCount: 0,
            TotalVideoSeconds: 0,
            TotalCost: 0,
            SummaryLine: null,
        });
        expect(BuildGenerationProvenanceSummary(spec)).toBeUndefined();
    });

    it('ignores uploaded and brand assets even when mixed with generated assets', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Assets: {
                Approved: [
                    {
                        Key: 'logo-1',
                        Kind: 'Logo',
                        FileID: 'file-1',
                        Provenance: 'Brand',
                    },
                    {
                        Key: 'photo-upload',
                        Kind: 'Image',
                        FileID: 'file-2',
                        Provenance: 'Uploaded',
                    },
                ],
                Pending: [],
            },
        };
        const result = DescribeGeneratedAssets(spec);
        expect(result.Items).toHaveLength(0);
        expect(result.SummaryLine).toBeNull();
        expect(BuildGenerationProvenanceSummary(spec)).toBeUndefined();
    });

    it('formats clips-only SummaryLine for singular and plural clip counts', () => {
        const singleClipSpec: Partial<VideoGenerationSpec> = {
            Assets: {
                Approved: [
                    {
                        Key: 'clip-1',
                        Kind: 'Video',
                        FileID: 'f-1',
                        Provenance: 'Generated',
                        Generation: {
                            ModelID: 'm-veo',
                            PromptRunID: 'pr-1',
                            Prompt: 'Aerial campus view at sunrise',
                            ReferenceKeys: [],
                            DurationSeconds: 4.2,
                            Cost: 0.4,
                            C2PA: true,
                        },
                    },
                ],
                Pending: [],
            },
        };
        const singleSummary = DescribeGeneratedAssets(singleClipSpec);
        expect(singleSummary.ClipCount).toBe(1);
        expect(singleSummary.ImageCount).toBe(0);
        expect(singleSummary.SummaryLine).toBe('Contains AI-generated footage: 1 clip, 4 s');

        const twoClipsSpec: Partial<VideoGenerationSpec> = {
            Assets: {
                Approved: [
                    ...singleClipSpec.Assets!.Approved,
                    {
                        Key: 'clip-2',
                        Kind: 'Video',
                        FileID: 'f-2',
                        Provenance: 'Generated',
                        Generation: {
                            ModelID: 'm-veo',
                            PromptRunID: 'pr-2',
                            Prompt: 'Library hallway',
                            ReferenceKeys: ['ref-1'],
                            DurationSeconds: 3.8,
                            Cost: 0.4,
                            C2PA: false,
                        },
                    },
                ],
                Pending: [],
            },
        };
        const twoSummary = DescribeGeneratedAssets(twoClipsSpec);
        expect(twoSummary.ClipCount).toBe(2);
        expect(twoSummary.ImageCount).toBe(0);
        expect(twoSummary.TotalVideoSeconds).toBeCloseTo(8.0);
        expect(twoSummary.SummaryLine).toBe('Contains AI-generated footage: 2 clips, 8 s');
    });

    it('formats images-only SummaryLine', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Assets: {
                Approved: [
                    {
                        Key: 'img-1',
                        Kind: 'Image',
                        FileID: 'f-1',
                        Provenance: 'Generated',
                        Generation: {
                            ModelID: 'm-img',
                            PromptRunID: 'pr-1',
                            Prompt: 'Abstract background',
                            ReferenceKeys: [],
                            Cost: 0.04,
                            C2PA: true,
                        },
                    },
                    {
                        Key: 'img-2',
                        Kind: 'Image',
                        FileID: 'f-2',
                        Provenance: 'Generated',
                        Generation: {
                            ModelID: 'm-img',
                            PromptRunID: 'pr-2',
                            Prompt: 'Geometric texture',
                            ReferenceKeys: [],
                            Cost: 0.04,
                            C2PA: true,
                        },
                    },
                    {
                        Key: 'img-3',
                        Kind: 'Image',
                        FileID: 'f-3',
                        Provenance: 'Generated',
                        Generation: {
                            ModelID: 'm-img',
                            PromptRunID: 'pr-3',
                            Prompt: 'Warm gradient',
                            ReferenceKeys: [],
                            Cost: 0.04,
                            C2PA: false,
                        },
                    },
                ],
                Pending: [],
            },
        };
        const summary = DescribeGeneratedAssets(spec);
        expect(summary.ClipCount).toBe(0);
        expect(summary.ImageCount).toBe(3);
        expect(summary.SummaryLine).toBe('Contains AI-generated images: 3');
    });

    it('formats combined clips + images SummaryLine and joins beat placements in beat order', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Beats: [
                {
                    Key: 'hook',
                    Role: 'Hook',
                    DurationSeconds: 5,
                    StartSeconds: 0,
                    EndSeconds: 5,
                    CompositionKey: 'HeroStat',
                    Props: {},
                    AssetRefs: ['clip-1', 'logo-brand'],
                    DataRefs: [],
                },
                {
                    Key: 'context',
                    Role: 'Context',
                    DurationSeconds: 7,
                    StartSeconds: 5,
                    EndSeconds: 12,
                    CompositionKey: 'SplitHighlight',
                    Props: {},
                    AssetRefs: ['img-1', 'clip-1'],
                    DataRefs: [],
                },
                {
                    Key: 'close',
                    Role: 'CTA',
                    DurationSeconds: 4,
                    StartSeconds: 12,
                    EndSeconds: 16,
                    CompositionKey: 'ClosingCard',
                    Props: {},
                    AssetRefs: ['clip-2'],
                    DataRefs: [],
                },
            ],
            Assets: {
                Approved: [
                    {
                        Key: 'clip-1',
                        Kind: 'Video',
                        FileID: 'f-c1',
                        Provenance: 'Generated',
                        Generation: {
                            ModelID: 'model-video-1',
                            PromptRunID: 'pr-c1',
                            Prompt: 'B-roll of conference hall',
                            Seed: 42,
                            ReferenceKeys: ['ref-style'],
                            DurationSeconds: 4,
                            Cost: 0.5,
                            C2PA: true,
                        },
                    },
                    {
                        Key: 'clip-2',
                        Kind: 'Video',
                        FileID: 'f-c2',
                        Provenance: 'Generated',
                        Generation: {
                            ModelID: 'model-video-1',
                            PromptRunID: 'pr-c2',
                            Prompt: 'B-roll of stage lights',
                            ReferenceKeys: [],
                            DurationSeconds: 4,
                            Cost: 0.5,
                            C2PA: false,
                        },
                    },
                    {
                        Key: 'img-1',
                        Kind: 'Image',
                        FileID: 'f-i1',
                        Provenance: 'Generated',
                        Generation: {
                            ModelID: 'model-image-1',
                            PromptRunID: 'pr-i1',
                            Prompt: 'Minimalist backdrop',
                            ReferenceKeys: [],
                            Cost: 0.05,
                            C2PA: true,
                        },
                    },
                ],
                Pending: [],
            },
        };

        const summary = DescribeGeneratedAssets(spec);
        expect(summary.ClipCount).toBe(2);
        expect(summary.ImageCount).toBe(1);
        expect(summary.TotalVideoSeconds).toBe(8);
        expect(summary.TotalCost).toBeCloseTo(1.05);
        expect(summary.SummaryLine).toBe(
            'Contains AI-generated footage (2 clips, 8 s) and 1 image',
        );

        expect(summary.Items[0].Beats).toEqual([
            { Key: 'hook', StartSeconds: 0, EndSeconds: 5 },
            { Key: 'context', StartSeconds: 5, EndSeconds: 12 },
        ]);
        expect(summary.Items[0].Seed).toBe(42);
        expect(summary.Items[0].ReferenceKeys).toEqual(['ref-style']);
        expect(summary.Items[1].Beats).toEqual([
            { Key: 'close', StartSeconds: 12, EndSeconds: 16 },
        ]);
        expect(summary.Items[2].Beats).toEqual([
            { Key: 'context', StartSeconds: 5, EndSeconds: 12 },
        ]);

        const provenance = BuildGenerationProvenanceSummary(spec);
        expect(provenance).toEqual({
            Assets: [
                {
                    AssetKey: 'clip-1',
                    Kind: 'Video',
                    ModelID: 'model-video-1',
                    PromptRunID: 'pr-c1',
                    DurationSeconds: 4,
                    Cost: 0.5,
                    C2PA: true,
                },
                {
                    AssetKey: 'clip-2',
                    Kind: 'Video',
                    ModelID: 'model-video-1',
                    PromptRunID: 'pr-c2',
                    DurationSeconds: 4,
                    Cost: 0.5,
                    C2PA: false,
                },
                {
                    AssetKey: 'img-1',
                    Kind: 'Image',
                    ModelID: 'model-image-1',
                    PromptRunID: 'pr-i1',
                    Cost: 0.05,
                    C2PA: true,
                },
            ],
            TotalVideoSeconds: 8,
            TotalCost: 1.05,
        });
    });

    it('defaults missing Cost and DurationSeconds to 0 in totals', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Assets: {
                Approved: [
                    {
                        Key: 'clip-no-meta',
                        Kind: 'Video',
                        FileID: 'f-1',
                        Provenance: 'Generated',
                    },
                ],
                Pending: [],
            },
        };
        const summary = DescribeGeneratedAssets(spec);
        expect(summary.ClipCount).toBe(1);
        expect(summary.TotalVideoSeconds).toBe(0);
        expect(summary.TotalCost).toBe(0);
        expect(summary.SummaryLine).toBe('Contains AI-generated footage: 1 clip, 0 s');
    });
});
