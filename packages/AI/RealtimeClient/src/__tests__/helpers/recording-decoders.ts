/**
 * Decoders that record what the player asks of them, and registrations that create them, for the tests of
 * `VideoPlayout`'s decoder choice and of the registry. `RestoreBuiltInDecoders` puts the registry back as a page starts.
 */
import type { RealtimeVideoFrame, RealtimeVideoFrameKind } from '@memberjunction/ai';
import type { IVideoFrameDecoder, VideoFrameDecoderContext, VideoFrameDecoderRegistration } from '../../media/videoFrameDecoder';
import { VideoFrameDecoderRegistry } from '../../media/videoFrameDecoderRegistry';
import { IMAGE_FRAME_DECODER } from '../../media/decoders/imageFrameDecoder';
import { MSE_FMP4_DECODER } from '../../media/decoders/mseFmp4Decoder';
import { WEBCODECS_CHUNK_DECODER } from '../../media/decoders/webCodecsChunkDecoder';

/** A decoder that records each call: `attach`, `detach`, `append <kind> <type>`, `end`, `flush`, `dispose`. */
export class RecordingDecoder implements IVideoFrameDecoder {
    public readonly Calls: string[] = [];
    public IsPlaying = false;
    /** Controllable stand-in for the frames still to play. */
    public FramesAhead = 0;
    public Element: HTMLVideoElement | null = null;

    constructor(
        public readonly Name: string,
        public readonly Context: VideoFrameDecoderContext
    ) {}

    public Attach(element: HTMLVideoElement): void {
        this.Element = element;
        this.Calls.push('attach');
    }

    public Detach(): void {
        this.Element = null;
        this.Calls.push('detach');
    }

    public Append(frame: RealtimeVideoFrame): void {
        this.Calls.push(`append ${frame.Kind} ${frame.MimeType}`);
    }

    public EndOfTurn(): void {
        this.Calls.push('end');
    }

    public Flush(): void {
        this.Calls.push('flush');
    }

    public Dispose(): void {
        this.Calls.push('dispose');
    }
}

/** A registration that creates {@link RecordingDecoder}s and keeps them. */
export interface RecordingRegistration extends VideoFrameDecoderRegistration {
    readonly Created: RecordingDecoder[];
}

/**
 * A registration named `name` for frames of `kind` whose MIME essence is one of `types`.
 *
 * @param priority Its priority (default 100, above the built-ins).
 */
export function RecordingRegistrationOf(name: string, kind: RealtimeVideoFrameKind, types: readonly string[], priority = 100): RecordingRegistration {
    const created: RecordingDecoder[] = [];
    return {
        Name: name,
        Kind: kind,
        Priority: priority,
        Created: created,
        CanPlay: (mimeType) => types.includes(mimeType.split(';')[0].trim().toLowerCase()),
        Create: (context) => {
            const decoder = new RecordingDecoder(name, context);
            created.push(decoder);
            return decoder;
        },
    };
}

/** Removes the registrations a test added and registers the three built-ins again. */
export function RestoreBuiltInDecoders(added: readonly string[]): void {
    const registry = VideoFrameDecoderRegistry.Instance;
    for (const name of added) {
        registry.Unregister(name);
    }
    for (const builtIn of [MSE_FMP4_DECODER, WEBCODECS_CHUNK_DECODER, IMAGE_FRAME_DECODER]) {
        registry.Unregister(builtIn.Name);
        registry.Register(builtIn);
    }
}
