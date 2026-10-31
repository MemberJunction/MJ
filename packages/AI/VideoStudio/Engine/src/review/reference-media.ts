import type { ChatMessageContentBlock } from '@memberjunction/ai';
import type {
    KeyframeRequest,
    KeyframeResult,
    VideoAsset,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

/**
 * Maximum number of reference assets analyzed in a single Art Director run.
 */
export const MAX_REFERENCES = 6;

/**
 * Maximum byte length for sending a reference video inline as a native
 * `video_url` block (20 MiB). Larger videos fall back to keyframe contact sheets.
 */
export const MAX_INLINE_REFERENCE_VIDEO_BYTES = 20 * 1024 * 1024;

/**
 * Maximum number of contact sheets or individual keyframe images attached for a
 * single reference video on the keyframe fallback path.
 */
export const MAX_KEYFRAME_IMAGES = 4;

/**
 * Reference media representation kind passed to the `Video Studio - Reference Analysis` prompt.
 */
export type ReferenceMediaKind = 'Image' | 'Video (native)' | 'Video (keyframes)';

/**
 * Output of {@link BuildReferenceBlocks}.
 */
export interface BuiltReferenceMedia {
    blocks: ChatMessageContentBlock[];
    referenceKind: ReferenceMediaKind;
}

/**
 * Callback used by {@link BuildReferenceBlocks} to extract keyframes and contact
 * sheets when a reference video cannot be sent inline as a native `video_url` block.
 */
export type ExtractKeyframesFn = (
    request: KeyframeRequest,
) => Promise<KeyframeResult>;

/**
 * Selects up to {@link MAX_REFERENCES} unanalyzed reference media assets from
 * `spec.Assets.Approved` in declaration order.
 *
 * Eligible assets must:
 * 1. Have `Kind === 'Image' | 'Screenshot' | 'Video'`.
 * 2. Carry a non-empty `FileID` or `ArtifactVersionID`.
 * 3. Have `Provenance !== 'Generated'`.
 * 4. Have a `Key` that does not already appear as `SourceKey` in `spec.Style.References`.
 */
export function PickReferences(spec: Partial<VideoGenerationSpec>): VideoAsset[] {
    const approved = spec.Assets?.Approved ?? [];
    const existingKeys = new Set<string>(
        (spec.Style?.References ?? [])
            .map((ref) => ref?.SourceKey)
            .filter((key): key is string => typeof key === 'string' && key.length > 0),
    );

    const eligible: VideoAsset[] = [];
    for (const asset of approved) {
        if (!asset || !isReferenceMediaAssetKind(asset.Kind)) {
            continue;
        }
        const hasStorageRef = Boolean(asset.FileID?.trim() || asset.ArtifactVersionID?.trim());
        if (!hasStorageRef) {
            continue;
        }
        if (asset.Provenance === 'Generated') {
            continue;
        }
        if (!asset.Key || existingKeys.has(asset.Key)) {
            continue;
        }
        eligible.push(asset);
        if (eligible.length >= MAX_REFERENCES) {
            break;
        }
    }

    return eligible;
}

/**
 * Builds multimodal `ChatMessageContentBlock[]` and the matching
 * {@link ReferenceMediaKind} label for a single reference asset:
 * - `Image` / `Screenshot` -> requires an `image/*` MIME type and returns a single `image_url` data URL block (`referenceKind: 'Image'`).
 * - `Video` -> requires a `video/*` MIME type. When `videoCapable === true`, the MIME type is `video/mp4` or `video/webm`,
 *   and `bytes.byteLength <= MAX_INLINE_REFERENCE_VIDEO_BYTES`, returns a single `video_url` data URL block (`referenceKind: 'Video (native)'`).
 * - Any other `video/*` -> calls `extractKeyframes` (`MaxFrames: 16`, `BuildContactSheet: true`)
 *   and returns up to 4 contact-sheet `image_url` blocks (or the first 4 individual frame
 *   `image_url` blocks when no contact sheets are returned) with `referenceKind: 'Video (keyframes)'`.
 */
export async function BuildReferenceBlocks(
    asset: VideoAsset,
    bytes: Buffer,
    videoCapable: boolean,
    extractKeyframes: ExtractKeyframesFn,
    mimeTypeOverride?: string,
): Promise<BuiltReferenceMedia> {
    const mimeType = resolveAssetMimeType(asset, mimeTypeOverride);

    if (asset.Kind === 'Image' || asset.Kind === 'Screenshot') {
        const base64 = bytes.toString('base64');
        return {
            referenceKind: 'Image',
            blocks: [
                {
                    type: 'image_url',
                    content: `data:${mimeType};base64,${base64}`,
                    mimeType,
                },
            ],
        };
    }

    const base64 = bytes.toString('base64');
    const lowerMimeType = mimeType.toLowerCase();
    const isNativeVideoMime = lowerMimeType === 'video/mp4' || lowerMimeType === 'video/webm';
    if (
        videoCapable &&
        isNativeVideoMime &&
        bytes.byteLength <= MAX_INLINE_REFERENCE_VIDEO_BYTES
    ) {
        const canonicalVideoMime = lowerMimeType as 'video/mp4' | 'video/webm';
        return {
            referenceKind: 'Video (native)',
            blocks: [
                {
                    type: 'video_url',
                    content: `data:${canonicalVideoMime};base64,${base64}`,
                    mimeType: canonicalVideoMime,
                },
            ],
        };
    }

    const extracted = await extractKeyframes({
        VideoBase64: base64,
        MimeType: normalizeVideoMimeType(lowerMimeType),
        MaxFrames: 16,
        BuildContactSheet: true,
    });

    const sheets = extracted.Sheets ?? [];
    if (sheets.length > 0) {
        const blocks: ChatMessageContentBlock[] = sheets
            .slice(0, MAX_KEYFRAME_IMAGES)
            .map((sheet) => {
                const sheetMime = sheet.MimeType || 'image/png';
                return {
                    type: 'image_url',
                    content: `data:${sheetMime};base64,${sheet.ImageBase64}`,
                    mimeType: sheetMime,
                };
            });
        return {
            referenceKind: 'Video (keyframes)',
            blocks,
        };
    }

    const frames = extracted.Frames ?? [];
    const blocks: ChatMessageContentBlock[] = frames
        .slice(0, MAX_KEYFRAME_IMAGES)
        .map((frame) => {
            const frameMime = frame.MimeType || 'image/png';
            return {
                type: 'image_url',
                content: `data:${frameMime};base64,${frame.ImageBase64}`,
                mimeType: frameMime,
            };
        });
    return {
        referenceKind: 'Video (keyframes)',
        blocks,
    };
}

function isReferenceMediaAssetKind(kind: VideoAsset['Kind']): boolean {
    return kind === 'Image' || kind === 'Screenshot' || kind === 'Video';
}

function resolveAssetMimeType(asset: VideoAsset, mimeTypeOverride?: string): string {
    const trimmed = mimeTypeOverride?.trim() ?? '';
    const lower = trimmed.toLowerCase();
    if (asset.Kind === 'Image' || asset.Kind === 'Screenshot') {
        if (lower.startsWith('image/') && lower.length > 'image/'.length) {
            return lower;
        }
        throw new Error(`Asset "${asset.Key}" has no usable MIME type ("${trimmed || 'none'}")`);
    }

    if (lower.startsWith('video/') && lower.length > 'video/'.length) {
        return lower;
    }
    throw new Error(`Asset "${asset.Key}" has no usable MIME type ("${trimmed || 'none'}")`);
}

function normalizeVideoMimeType(mimeType: string): 'video/mp4' | 'video/webm' {
    return mimeType.toLowerCase().includes('webm') ? 'video/webm' : 'video/mp4';
}
