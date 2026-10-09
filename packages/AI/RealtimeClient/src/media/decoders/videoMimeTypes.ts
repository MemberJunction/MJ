/**
 * @fileoverview VIDEO MIME TYPES: what `VideoPlayout` and its decoders read from a frame's MIME type: its essence
 * (`type/subtype`), its `codecs` parameter, the frame kind it names, and an encoded chunk's WebCodecs codec string.
 *
 * Chunk types follow the `RealtimeChunkVideoFrame` contract: `video/h264`, `video/vp9` and `video/av1` carry the WebCodecs
 * codec string in their `codecs` parameter (`video/h264; codecs="avc1.42e01f"`); `video/vp8` needs none.
 *
 * @module @memberjunction/ai-realtime-client/media
 */
import type { RealtimeVideoFrameKind } from '@memberjunction/ai';

/** An encoded chunk type: the prefixes its WebCodecs codec string may start with, and the string when it needs none. */
interface ChunkCodecFamily {
    Prefixes: readonly string[];
    Default?: string;
}

/** The chunk types a WebCodecs decoder can be configured for, by MIME essence. */
const CHUNK_CODEC_FAMILIES: ReadonlyMap<string, ChunkCodecFamily> = new Map([
    ['video/h264', { Prefixes: ['avc1.', 'avc3.'] }],
    ['video/vp8', { Prefixes: ['vp8'], Default: 'vp8' }],
    ['video/vp9', { Prefixes: ['vp09.'] }],
    ['video/av1', { Prefixes: ['av01.'] }],
]);

/** The image types `createImageBitmap` decodes in every browser that has it. */
export const IMAGE_FRAME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** A MIME type's essence: `type/subtype` in lower case, without parameters. */
export function MimeEssence(mimeType: string): string {
    return mimeType.split(';')[0].trim().toLowerCase();
}

/** The first entry of a MIME type's `codecs` parameter, unquoted; `undefined` when it has none. */
export function MimeCodec(mimeType: string): string | undefined {
    const match = /;\s*codecs\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(mimeType);
    const codec = (match?.[1] ?? match?.[2])?.split(',')[0].trim();
    return codec || undefined;
}

/**
 * The frame kind a MIME type names: `video/mp4` is fragmented MP4, the chunk types above are encoded chunks, and any
 * `image/*` is an image. `null` for anything else.
 */
export function FrameKindOfMimeType(mimeType: string): RealtimeVideoFrameKind | null {
    const essence = MimeEssence(mimeType);
    if (essence === 'video/mp4') {
        return 'fmp4';
    }
    if (CHUNK_CODEC_FAMILIES.has(essence)) {
        return 'chunk';
    }
    return essence.startsWith('image/') ? 'image' : null;
}

/**
 * The WebCodecs codec string for an encoded chunk type: its `codecs` parameter, or `'vp8'` for `video/vp8` without one.
 * `null` for another type, or a `codecs` parameter of another codec family.
 */
export function WebCodecsCodecOf(mimeType: string): string | null {
    const family = CHUNK_CODEC_FAMILIES.get(MimeEssence(mimeType));
    const codec = MimeCodec(mimeType) ?? family?.Default;
    if (!family || !codec) {
        return null;
    }
    return family.Prefixes.some((prefix) => codec.toLowerCase().startsWith(prefix)) ? codec : null;
}

/** A frame's type as the player tells decoders apart: its kind and its MIME essence. */
export function FrameTypeKey(kind: RealtimeVideoFrameKind, mimeType: string): string {
    return `${kind} ${MimeEssence(mimeType)}`;
}
