/**
 * @fileoverview VIDEO FRAME DECODER REGISTRY: the page's video frame decoders, which `VideoPlayout` chooses from for each
 * frame type. The three built-in decoders (`'mse-fmp4'`, `'webcodecs'`, `'image'`) are registered when the registry is
 * first used; an app adds its own with {@link VideoFrameDecoderRegistry.Register}, or replaces a built-in by registering
 * the same name.
 *
 * @module @memberjunction/ai-realtime-client/media
 */
import { BaseSingleton } from '@memberjunction/global';
import type { RealtimeVideoFrameKind } from '@memberjunction/ai';
import type { VideoFrameDecoderRegistration } from './videoFrameDecoder';
import { IMAGE_FRAME_DECODER } from './decoders/imageFrameDecoder';
import { MSE_FMP4_DECODER } from './decoders/mseFmp4Decoder';
import { WEBCODECS_CHUNK_DECODER } from './decoders/webCodecsChunkDecoder';

/** The decoders every page starts with. */
const BUILT_IN_DECODERS: readonly VideoFrameDecoderRegistration[] = [MSE_FMP4_DECODER, WEBCODECS_CHUNK_DECODER, IMAGE_FRAME_DECODER];

/** The page's video frame decoders, by name. */
export class VideoFrameDecoderRegistry extends BaseSingleton<VideoFrameDecoderRegistry> {
    private readonly registrations = new Map<string, VideoFrameDecoderRegistration>();

    protected constructor() {
        super();
        for (const registration of BUILT_IN_DECODERS) {
            this.Register(registration);
        }
    }

    /** The page's registry, with the built-in decoders registered. */
    public static get Instance(): VideoFrameDecoderRegistry {
        return super.getInstance<VideoFrameDecoderRegistry>();
    }

    /**
     * Adds a decoder. One with the same name is replaced; players that already use the old one keep it until they choose a
     * decoder again.
     *
     * @param registration The decoder: its name, frame kind, priority, support check and factory.
     */
    public Register(registration: VideoFrameDecoderRegistration): void {
        this.registrations.set(registration.Name, registration);
    }

    /**
     * Removes a decoder by name. Players that already use it keep it until they choose a decoder again.
     *
     * @param name The decoder's name.
     */
    public Unregister(name: string): void {
        this.registrations.delete(name);
    }

    /**
     * The decoders that can play frames of `kind` and `mimeType` in this browser, highest priority first (in registration
     * order among equals). A decoder whose support check throws is left out.
     *
     * @param kind The frame kind.
     * @param mimeType The frame's MIME type.
     */
    public Candidates(kind: RealtimeVideoFrameKind, mimeType: string): readonly VideoFrameDecoderRegistration[] {
        return [...this.registrations.values()]
            .filter((registration) => registration.Kind === kind && canPlay(registration, mimeType))
            .sort((a, b) => b.Priority - a.Priority);
    }
}

/** A registration's support check, with a check that throws read as "no" (logged). */
function canPlay(registration: VideoFrameDecoderRegistration, mimeType: string): boolean {
    try {
        return registration.CanPlay(mimeType);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[VideoPlayout] The ${registration.Name} decoder's support check failed for ${mimeType}: ${reason}`);
        return false;
    }
}
