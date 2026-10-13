/**
 * @fileoverview The video a conformance session's model sends, in the provider's form: an fMP4 init segment then
 * one-frame fragments, or encoded chunks from a key frame, or images. Each call continues the same 24 fps stream, so every
 * frame's bytes are distinct and its time follows the last.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import type { RealtimeVideoFrame, RealtimeVideoFrameKind } from '@memberjunction/ai';
import {
    CONFORMANCE_FMP4_FRAME_SECONDS,
    ConformanceChunkFrames,
    ConformanceFmp4InitSegment,
    ConformanceFmp4VideoFragment,
    ConformanceImageFrame,
    Fmp4Frame,
    FrameTimeMs,
} from './conformanceFixtures';

/** One session's video stream, of one frame kind. */
export class ConformanceVideoStream {
    /** The number of the next video frame (an fMP4 fragment, a chunk or an image), from 0. */
    private next = 0;

    /**
     * @param Kind The form the provider's model sends its video in.
     * @param CarriesVoice Whether an fMP4 stream's init segment has the voice's audio track.
     */
    constructor(public readonly Kind: RealtimeVideoFrameKind, public readonly CarriesVoice: boolean) {}

    /** Where the next frame sits on the stream's media timeline, in ms: the time a voice chunk sent now goes with. */
    public get NextTimeMs(): number {
        return FrameTimeMs(this.next);
    }

    /** The frame a stream starts with: an fMP4 init segment, or the first chunk (a key frame) or image. */
    public Start(): RealtimeVideoFrame {
        if (this.Kind === 'fmp4') {
            return Fmp4Frame(ConformanceFmp4InitSegment(this.CarriesVoice));
        }
        return this.Frames(1)[0];
    }

    /** The stream's next `count` video frames: one-frame fMP4 fragments, chunks or images. */
    public Frames(count: number): RealtimeVideoFrame[] {
        const first = this.next;
        this.next += count;
        if (this.Kind === 'chunk') {
            return ConformanceChunkFrames(count, { FirstIndex: first });
        }
        return Array.from({ length: count }, (_, i): RealtimeVideoFrame =>
            this.Kind === 'image' ? ConformanceImageFrame(first + i) : Fmp4Frame(ConformanceFmp4VideoFragment(1, first + i + 1))
        );
    }
}

/** The seconds of video some frames carry: 1/24 s each, an fMP4 init segment none. */
export function SecondsOfVideo(frames: readonly RealtimeVideoFrame[]): number {
    return frames.filter((frame) => !(frame.Kind === 'fmp4' && frame.Piece === 'init')).length * CONFORMANCE_FMP4_FRAME_SECONDS;
}
