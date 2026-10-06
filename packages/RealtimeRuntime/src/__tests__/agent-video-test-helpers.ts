/**
 * The client half of a fake video provider, for the tests of the agent's video: a driver whose model sends video (an
 * avatar), and one whose model sends none. No DOM, no devices.
 */
import {
    DEFAULT_REALTIME_AUDIO_TRACKS,
    type ClientRealtimeSessionConfig,
    type JSONValue,
    type RealtimeTrackDescriptor,
} from '@memberjunction/ai';
import { BaseRealtimeClient, type MediaVideoSource } from '@memberjunction/ai-realtime-client';

/** The track a channel that shows the agent sinks: outbound video, in whatever encoding the model sends. */
export const AGENT_VIDEO_TRACK: RealtimeTrackDescriptor = { Modality: 'video', Direction: 'outbound' };

/**
 * A driver that negotiates the tracks the session requests against what its model supports (audio, plus outbound video
 * when {@link OutputsVideo}), and hands over the agent's video when the test says, in either form a real driver uses: a
 * live stream (WebRTC) or a player that owns the element (MSE or WebCodecs playout).
 */
export abstract class FakeVideoDriver extends BaseRealtimeClient {
    /** The config the session connected with. */
    public Config: ClientRealtimeSessionConfig | null = null;

    /** Whether this driver's model sends video. */
    protected abstract get OutputsVideo(): boolean;

    public async Connect(config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {
        this.Config = config;
        const supported: RealtimeTrackDescriptor[] = [...DEFAULT_REALTIME_AUDIO_TRACKS];
        if (this.OutputsVideo) {
            supported.push({ Modality: 'video', Direction: 'outbound', Encoding: 'video/mp4' });
        }
        this.negotiateTracks(requestedTracksOf(config), supported, 0);
    }

    /** The model's video arrives. */
    public ShowAgentVideo(video: MediaVideoSource | MediaStream): void {
        this.emitRemoteVideo(video);
    }

    public SendText(): void {}
    public SendContextNote(): void {}
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public CancelActiveResponse(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
}

/** A stream the tests only pass around. */
export const videoStream = (name: string): MediaStream =>
    ({ id: name, getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] }) as unknown as MediaStream;

/** A player source, as MSE playout of an avatar hands over. */
export const videoPlayer = (): MediaVideoSource => ({ Kind: 'element', Attach: () => () => undefined });

/** The tracks a connect config requests, as the session wrote them. */
function requestedTracksOf(config: ClientRealtimeSessionConfig): RealtimeTrackDescriptor[] {
    const raw = config.SessionConfig['requestedTracks'];
    return Array.isArray(raw) ? raw.flatMap(trackOf) : [];
}

function trackOf(raw: JSONValue): RealtimeTrackDescriptor[] {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return [];
    }
    const modality = raw['Modality'];
    const direction = raw['Direction'];
    return typeof modality === 'string' && (direction === 'inbound' || direction === 'outbound') ? [{ Modality: modality, Direction: direction }] : [];
}
