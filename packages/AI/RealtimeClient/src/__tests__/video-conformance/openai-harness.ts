/**
 * The OpenAI Realtime harness: the real `OpenAIRealtimeClient` over the existing WebRTC fakes (peer connection, data
 * channel, audio sink, SDP post). OpenAI's realtime API sends no video, so the run proves the audio-only half of the
 * contract on a WebRTC driver: its voice plays through the transport, and it hands over no agent video.
 */
import type { ClientRealtimeSessionConfig, RealtimeVideoFrame } from '@memberjunction/ai';
import type { BaseRealtimeClient } from '../../generic/baseRealtimeClient';
import type { IRealtimeAudioSink, IRealtimePeerConnection } from '../../drivers/openAIRealtimeClient';
import { OpenAIRealtimeClient } from '../../drivers/openAIRealtimeClient';
import type { IRealtimeVideoConformanceHarness, RealtimeVideoConformanceGrant, RealtimeVideoConformanceMedia, RealtimeVideoConformanceTraits } from '../../testing';
import { FakeAudioSink, FakePeerConnection } from '../helpers/realtime-fakes';
import { HalfAnHourFromNow } from './harness-support';

/** The real OpenAI client with its WebRTC transport replaced by the fakes. */
export class OpenAIKitClient extends OpenAIRealtimeClient {
    public readonly Pc = new FakePeerConnection();
    private readonly sink = new FakeAudioSink();

    protected override createPeerConnection(): IRealtimePeerConnection {
        return this.Pc;
    }

    protected override createAudioSink(): IRealtimeAudioSink {
        return this.sink;
    }

    protected override async postSdpOffer(_offerSdp: string, _ephemeralToken: string): Promise<string> {
        return 'CONFORMANCE_ANSWER_SDP';
    }
}

/** OpenAI Realtime over WebRTC: the model's events on the `oai-events` data channel; its voice on the remote track. */
export class OpenAIHarness implements IRealtimeVideoConformanceHarness {
    public readonly Name = 'openai';
    public readonly Traits: RealtimeVideoConformanceTraits = {
        AgentVideo: 'none',
        GrantsAvatar: false,
        Voice: 'transport',
        VideoCanCarryVoice: false,
        VideoUsage: false,
    };
    private client: OpenAIKitClient | null = null;

    /** The client secret's session object, as `OpenAIRealtime` mints it; OpenAI grants no avatar. */
    public Mint(grant: RealtimeVideoConformanceGrant): ClientRealtimeSessionConfig {
        if (grant.Avatar) {
            throw new Error('OpenAI Realtime renders no avatar.');
        }
        return { Provider: 'openai', Model: 'gpt-realtime', EphemeralToken: 'ek_conformance', ExpiresAt: HalfAnHourFromNow(), SessionConfig: { instructions: 'be the voice' } };
    }

    /** The client; OpenAI plays its voice through the peer connection, so the kit's recorders aren't wired in. */
    public CreateClient(_media: RealtimeVideoConformanceMedia): BaseRealtimeClient {
        this.client = new OpenAIKitClient();
        return this.client;
    }

    /** Connects (the SDP handshake), then opens the data channel: the client applies the session and listens. */
    public async Connect(client: BaseRealtimeClient, config: ClientRealtimeSessionConfig, microphone: MediaStream): Promise<void> {
        await client.Connect(config, microphone);
        this.requireClient().Pc.Channel.Open();
    }

    /** OpenAI's wire carries no video; the kit sends none to a provider whose AgentVideo is 'none'. */
    public async SendVideo(_frame: RealtimeVideoFrame): Promise<void> {
        throw new Error('The OpenAI Realtime wire carries no video.');
    }

    /** A response starts and its audio plays on the remote track (the provider reports the playback buffer). */
    public async SendVoice(_pcm16: ArrayBuffer, _mediaTimeMs?: number): Promise<void> {
        this.emit({ type: 'response.created' });
        this.emit({ type: 'output_audio_buffer.started' });
    }

    public async TurnComplete(): Promise<void> {
        this.emit({ type: 'output_audio_buffer.stopped' });
        this.emit({ type: 'response.done' });
    }

    /** The user speaks over the model: server VAD reports speech started. */
    public async Interrupted(): Promise<void> {
        this.emit({ type: 'input_audio_buffer.speech_started' });
    }

    private emit(event: { type: string }): void {
        this.requireClient().Pc.Channel.EmitServer(event);
    }

    private requireClient(): OpenAIKitClient {
        if (!this.client) {
            throw new Error('openai: no client yet');
        }
        return this.client;
    }
}
