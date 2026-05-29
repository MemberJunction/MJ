/**
 * No-op `ITransportAdapter` for channels that don't actually carry media
 * (text-chat) or where the transport's role is purely placeholder during
 * scaffolding. All inbound iterables are forever-pending; outbound sends are
 * no-ops. `Open()` / `Close()` resolve immediately.
 *
 * Used by `StartChannelSession` to satisfy `ChannelSession`'s `Transport`
 * requirement when no real wire is in play.
 */
import type { AudioFrame } from '@memberjunction/ai';
import type {
    ITransportAdapter,
    ParticipantStream,
} from '@memberjunction/ai-agent-channel-runtime';
import type { VideoFrame, ControlEvent } from '@memberjunction/ai-agent-channel-runtime';

class NeverIterable<T> implements AsyncIterable<T> {
    public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<T> {
                return this;
            },
            next(): Promise<IteratorResult<T>> {
                return new Promise<IteratorResult<T>>(() => {
                    /* never resolves — placeholder transport */
                });
            },
        };
    }
}

export class NullTransport implements ITransportAdapter {
    private readonly audioIn = new NeverIterable<AudioFrame>();
    private readonly videoIn = new NeverIterable<VideoFrame>();
    private readonly controlIn = new NeverIterable<ControlEvent>();

    public get AudioFramesIn(): AsyncIterable<AudioFrame> {
        return this.audioIn;
    }
    public get VideoFramesIn(): AsyncIterable<VideoFrame> {
        return this.videoIn;
    }
    public get ControlEventsIn(): AsyncIterable<ControlEvent> {
        return this.controlIn;
    }
    public get Participants(): ReadonlyArray<ParticipantStream> {
        return [];
    }

    public OnParticipantJoin(_cb: (p: ParticipantStream) => void): void {
        // no-op
    }
    public OnParticipantLeave(_cb: (p: ParticipantStream) => void): void {
        // no-op
    }

    public SendAudioFrame(_frame: AudioFrame): void {
        // no-op
    }
    public SendVideoFrame(_frame: VideoFrame): void {
        // no-op
    }
    public SendControlEvent(_event: ControlEvent): void {
        // no-op
    }

    public async Open(): Promise<void> {
        // no-op
    }
    public async Close(): Promise<void> {
        // no-op
    }
}
