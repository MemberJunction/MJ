import { describe, expect, it, vi } from 'vitest';
import type {
    KeyframeResult,
    ReferenceAnalysis,
    VideoAsset,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    BuildReferenceBlocks,
    MAX_INLINE_REFERENCE_VIDEO_BYTES,
    MAX_REFERENCES,
    PickReferences,
} from '../review/reference-media.js';

function makeAsset(overrides: Partial<VideoAsset> & { Key: string }): VideoAsset {
    return {
        Kind: 'Image',
        FileID: '11111111-1111-4111-8111-111111111111',
        Source: 'User upload',
        Provenance: 'Supplied',
        Usage: 'Reference',
        MustUse: false,
        ...overrides,
    };
}

function makeExistingReference(sourceKey: string): ReferenceAnalysis {
    return {
        SourceKey: sourceKey,
        PaletteLearned: 'Dark slate + cyan',
        TypographyLearned: 'Bold geometric sans',
        CompositionLearned: 'Asymmetric left headline',
        PacingLearned: '3s per beat',
        MotionLearned: 'Spring easing',
        DoNotCopy: ['Competitor logo'],
    };
}

describe('PickReferences', () => {
    it('selects approved Image, Screenshot, and Video assets with FileID or ArtifactVersionID that are not Generated or already analyzed', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Assets: {
                Approved: [
                    makeAsset({ Key: 'ref:image-1', Kind: 'Image', Provenance: 'Supplied' }),
                    makeAsset({
                        Key: 'ref:screenshot-1',
                        Kind: 'Screenshot',
                        FileID: undefined,
                        ArtifactVersionID: '22222222-2222-4222-8222-222222222222',
                        Provenance: 'Captured',
                    }),
                    makeAsset({ Key: 'ref:video-1', Kind: 'Video', Provenance: 'BrandKit' }),
                    // Filtered out: Generated provenance
                    makeAsset({ Key: 'gen:image', Kind: 'Image', Provenance: 'Generated' }),
                    // Filtered out: non-reference kinds
                    makeAsset({ Key: 'brand:logo', Kind: 'Logo', Provenance: 'BrandKit' }),
                    makeAsset({ Key: 'brand:font', Kind: 'Font', Provenance: 'BrandKit' }),
                    makeAsset({ Key: 'brand:music', Kind: 'Music', Provenance: 'BrandKit' }),
                    // Filtered out: missing both FileID and ArtifactVersionID
                    makeAsset({
                        Key: 'ref:no-storage',
                        Kind: 'Image',
                        FileID: undefined,
                        ArtifactVersionID: undefined,
                    }),
                    // Filtered out: already in Style.References
                    makeAsset({ Key: 'ref:already-analyzed', Kind: 'Image' }),
                ],
                Required: [],
                NeverInvent: [],
            },
            Style: {
                Palette: [],
                Typography: [],
                Composition: 'Centered',
                Pacing: { AvgSecondsBetweenChanges: 3, HoldRules: 'Hold 1s' },
                MotionRules: [],
                Keep: [],
                Avoid: [],
                References: [makeExistingReference('ref:already-analyzed')],
            },
        };

        const picked = PickReferences(spec);
        expect(picked.map((a) => a.Key)).toEqual([
            'ref:image-1',
            'ref:screenshot-1',
            'ref:video-1',
        ]);
    });

    it('preserves Assets.Approved order and caps results at MAX_REFERENCES (6)', () => {
        const approved: VideoAsset[] = Array.from({ length: 9 }, (_, i) =>
            makeAsset({
                Key: `ref:${i + 1}`,
                Kind: i % 2 === 0 ? 'Image' : 'Video',
            }),
        );
        const picked = PickReferences({
            Assets: { Approved: approved, Required: [], NeverInvent: [] },
        });

        expect(picked).toHaveLength(MAX_REFERENCES);
        expect(picked.map((a) => a.Key)).toEqual([
            'ref:1',
            'ref:2',
            'ref:3',
            'ref:4',
            'ref:5',
            'ref:6',
        ]);
    });
});

describe('BuildReferenceBlocks', () => {
    it('builds a single image_url block with referenceKind "Image" using the stored file ContentType (e.g. image/jpeg on a Conversation attachment) without calling extractKeyframes', async () => {
        const extractKeyframes = vi.fn();
        const bytes = Buffer.from('fake-jpeg-bytes');
        const asset = makeAsset({
            Key: 'attachment:att-1',
            Kind: 'Image',
            Source: 'Conversation attachment att-1',
        });

        const result = await BuildReferenceBlocks(
            asset,
            bytes,
            true,
            extractKeyframes,
            'image/jpeg',
        );

        expect(extractKeyframes).not.toHaveBeenCalled();
        expect(result.referenceKind).toBe('Image');
        expect(result.blocks).toEqual([
            {
                type: 'image_url',
                content: `data:image/jpeg;base64,${bytes.toString('base64')}`,
                mimeType: 'image/jpeg',
            },
        ]);
    });

    it('builds a single video_url block with referenceKind "Video (native)" when videoCapable is true and size <= 20 MiB', async () => {
        const extractKeyframes = vi.fn();
        const bytes = Buffer.from('small-mp4-video');
        const asset = makeAsset({
            Key: 'attachment:att-2',
            Kind: 'Video',
            Source: 'Conversation attachment att-2',
        });

        const result = await BuildReferenceBlocks(
            asset,
            bytes,
            true,
            extractKeyframes,
            'video/mp4',
        );

        expect(extractKeyframes).not.toHaveBeenCalled();
        expect(result.referenceKind).toBe('Video (native)');
        expect(result.blocks).toEqual([
            {
                type: 'video_url',
                content: `data:video/mp4;base64,${bytes.toString('base64')}`,
                mimeType: 'video/mp4',
            },
        ]);
    });

    it('extracts keyframes and uses up to 4 contact sheets as image_url blocks when videoCapable is false', async () => {
        const sheets = Array.from({ length: 5 }, (_, idx) => ({
            Index: idx,
            Kind: 'Grid' as const,
            MimeType: 'image/png' as const,
            Width: 1920,
            Height: 1080,
            StillKeys: [`frame-${idx}`],
            ImageBase64: `sheet-b64-${idx}`,
        }));
        const extractKeyframes = vi.fn().mockResolvedValue({
            DurationSeconds: 10,
            Frames: [
                {
                    Index: 0,
                    TimestampSeconds: 0,
                    Reason: 'UniformSample',
                    MimeType: 'image/png',
                    Width: 1920,
                    Height: 1080,
                    ImageBase64: 'frame-0',
                },
            ],
            Sheets: sheets,
        } satisfies KeyframeResult);

        const bytes = Buffer.from('webm-for-claude');
        const asset = makeAsset({
            Key: 'attachment:att-3',
            Kind: 'Video',
            Source: 'Conversation attachment att-3',
        });

        const result = await BuildReferenceBlocks(
            asset,
            bytes,
            false,
            extractKeyframes,
            'video/webm',
        );

        expect(extractKeyframes).toHaveBeenCalledTimes(1);
        expect(extractKeyframes).toHaveBeenCalledWith({
            VideoBase64: bytes.toString('base64'),
            MimeType: 'video/webm',
            MaxFrames: 16,
            BuildContactSheet: true,
        });
        expect(result.referenceKind).toBe('Video (keyframes)');
        expect(result.blocks).toHaveLength(4);
        expect(result.blocks.map((b) => b.content)).toEqual([
            'data:image/png;base64,sheet-b64-0',
            'data:image/png;base64,sheet-b64-1',
            'data:image/png;base64,sheet-b64-2',
            'data:image/png;base64,sheet-b64-3',
        ]);
    });

    it('falls back to keyframe extraction when videoCapable is true but video exceeds MAX_INLINE_REFERENCE_VIDEO_BYTES (20 MiB)', async () => {
        const extractKeyframes = vi.fn().mockResolvedValue({
            DurationSeconds: 30,
            Frames: [0, 1, 2, 3, 4].map((idx) => ({
                Index: idx,
                TimestampSeconds: idx * 2,
                Reason: 'SceneChange' as const,
                MimeType: 'image/jpeg' as const,
                Width: 1920,
                Height: 1080,
                ImageBase64: `f${idx}`,
            })),
            Sheets: [],
        } satisfies KeyframeResult);

        const oversizedBytes = Buffer.alloc(MAX_INLINE_REFERENCE_VIDEO_BYTES + 1, 0x41);
        const asset = makeAsset({ Key: 'ref:large.mp4', Kind: 'Video', Source: 'large.mp4' });

        const result = await BuildReferenceBlocks(
            asset,
            oversizedBytes,
            true,
            extractKeyframes,
            'video/mp4',
        );

        expect(extractKeyframes).toHaveBeenCalledTimes(1);
        expect(result.referenceKind).toBe('Video (keyframes)');
        expect(result.blocks).toHaveLength(4);
        expect(result.blocks.map((b) => b.content)).toEqual([
            'data:image/jpeg;base64,f0',
            'data:image/jpeg;base64,f1',
            'data:image/jpeg;base64,f2',
            'data:image/jpeg;base64,f3',
        ]);
    });

    it('throws naming asset.Key when MIME type is missing or non-image/video, and routes video/quicktime to keyframes even when videoCapable is true', async () => {
        const extractKeyframes = vi.fn().mockResolvedValue({
            DurationSeconds: 8,
            Frames: [],
            Sheets: [
                {
                    Index: 0,
                    Kind: 'Grid' as const,
                    MimeType: 'image/png' as const,
                    Width: 1920,
                    Height: 1080,
                    StillKeys: ['frame-0'],
                    ImageBase64: 'mov-sheet-0',
                },
            ],
        } satisfies KeyframeResult);

        const imageAsset = makeAsset({ Key: 'attachment:no-mime', Kind: 'Image' });
        await expect(
            BuildReferenceBlocks(imageAsset, Buffer.from('img'), true, extractKeyframes, undefined),
        ).rejects.toThrow('Asset "attachment:no-mime" has no usable MIME type ("none")');

        await expect(
            BuildReferenceBlocks(
                imageAsset,
                Buffer.from('img'),
                true,
                extractKeyframes,
                'application/octet-stream',
            ),
        ).rejects.toThrow(
            'Asset "attachment:no-mime" has no usable MIME type ("application/octet-stream")',
        );

        expect(extractKeyframes).not.toHaveBeenCalled();

        const movAsset = makeAsset({ Key: 'attachment:iphone.mov', Kind: 'Video' });
        const movBytes = Buffer.from('quicktime-bytes');
        const movResult = await BuildReferenceBlocks(
            movAsset,
            movBytes,
            true,
            extractKeyframes,
            'video/quicktime',
        );

        expect(extractKeyframes).toHaveBeenCalledTimes(1);
        expect(movResult.referenceKind).toBe('Video (keyframes)');
        expect(movResult.blocks).toEqual([
            {
                type: 'image_url',
                content: 'data:image/png;base64,mov-sheet-0',
                mimeType: 'image/png',
            },
        ]);
    });
});
