/**
 * The synthetic provider's harnesses: {@link SyntheticHarness} for its playout mode, in each form its model can send
 * video (fragmented MP4 that can carry the voice; encoded chunks or images on a timeline the voice shares), the runs that
 * exercise every check and the fault matrix's subject; and {@link SyntheticStreamHarness} for its stream mode (a live
 * stream, as a WebRTC provider hands over), which runs the checks' stream branches.
 */
import type { ClientRealtimeSessionConfig, RealtimeVideoFrame, RealtimeVideoFrameKind } from '@memberjunction/ai';
import type { IRealtimePcmPlayback } from '../../audio/pcmPlayback';
import type { BaseRealtimeClient } from '../../generic/baseRealtimeClient';
import type { IAvatarVideoPlayout, VideoPlayoutOptions } from '../../media/videoPlayout';
import {
    CONFORMANCE_FMP4_FRAME_SECONDS,
    type IRealtimeVideoConformanceHarness,
    type RealtimeVideoConformanceGrant,
    type RealtimeVideoConformanceMedia,
    type RealtimeVideoConformanceTraits,
} from '../../testing';
import { FakeMediaStream } from '../helpers/realtime-fakes';
import { HalfAnHourFromNow } from './harness-support';
import { SyntheticVideoClient, type SyntheticVideoMode } from './synthetic-video-client';
import { SYNTHETIC_FRAME_TYPES, SyntheticAvatarPact, SyntheticWire, type SyntheticFaults } from './synthetic-wire';

/** The synthetic model's frame rate: the kit's frames are this many to the second. */
const SYNTHETIC_FRAME_RATE = Math.round(1 / CONFORMANCE_FMP4_FRAME_SECONDS);

/** The synthetic client with the kit's recorders in its seams and the harness's say on what plays. */
class SyntheticKitClient extends SyntheticVideoClient {
    constructor(
        wire: SyntheticWire,
        mode: SyntheticVideoMode,
        faults: SyntheticFaults,
        private readonly media: RealtimeVideoConformanceMedia,
        private readonly playable: () => boolean
    ) {
        super(wire, mode, faults);
    }

    protected override CreatePlayback(): IRealtimePcmPlayback {
        return this.media.Voice;
    }

    protected override CreateVideoPlayout(options: VideoPlayoutOptions): IAvatarVideoPlayout {
        return this.media.CreateVideoPlayer(options);
    }

    protected override CanPlay(_mimeType: string): boolean {
        return this.playable();
    }

    protected override CreateRemoteStream(): MediaStream {
        return new FakeMediaStream([]);
    }
}

/** What both synthetic harnesses share: the pact, the wire, and the model's voice and turn boundaries. */
abstract class SyntheticHarnessBase implements IRealtimeVideoConformanceHarness {
    public abstract readonly Name: string;
    public abstract readonly Traits: RealtimeVideoConformanceTraits;
    protected Wire = new SyntheticWire();
    protected Playable = true;

    constructor(protected readonly Mode: SyntheticVideoMode, protected readonly Faults: SyntheticFaults) {}

    /** The synthetic server's pact: the `avatar` block, for the provider's frame kind, when it grants one. */
    public Mint(grant: RealtimeVideoConformanceGrant): ClientRealtimeSessionConfig {
        const kind = this.Traits.VideoFrameKind ?? 'fmp4';
        const sessionConfig = grant.Avatar
            ? SyntheticAvatarPact(SYNTHETIC_FRAME_TYPES[kind], grant.VideoCarriesVoice !== false, this.Traits.TimedVoice === true, SYNTHETIC_FRAME_RATE)
            : {};
        return { Provider: 'synthetic', Model: 'synthetic-avatar-1', EphemeralToken: 'synthetic-token', ExpiresAt: HalfAnHourFromNow(), SessionConfig: sessionConfig };
    }

    public CreateClient(media: RealtimeVideoConformanceMedia): BaseRealtimeClient {
        this.Wire = new SyntheticWire();
        return new SyntheticKitClient(this.Wire, this.Mode, this.Faults, media, () => this.Playable);
    }

    public async Connect(client: BaseRealtimeClient, config: ClientRealtimeSessionConfig, microphone: MediaStream): Promise<void> {
        await client.Connect(config, microphone);
    }

    public AskedProviderForVideo(): boolean {
        return this.Wire.RequestedVideo === true;
    }

    public abstract SendVideo(frame: RealtimeVideoFrame): Promise<void>;

    public async SendVoice(pcm16: ArrayBuffer, mediaTimeMs?: number): Promise<void> {
        this.Wire.Send(typeof mediaTimeMs === 'number' ? { Kind: 'voice', Data: pcm16, MediaTimeMs: mediaTimeMs } : { Kind: 'voice', Data: pcm16 });
    }

    /** The model's first words, transcribed: its answer is under way. */
    public async AnswerStarted(): Promise<void> {
        this.Wire.Send({ Kind: 'transcript', Text: 'Here is what I found.' });
    }

    public async TurnComplete(): Promise<void> {
        this.Wire.Send({ Kind: 'turn-complete' });
    }

    public async Interrupted(): Promise<void> {
        this.Wire.Send({ Kind: 'interrupted' });
    }
}

/** A run's name: its frame kind, and the faults it was given. */
function syntheticName(kind: RealtimeVideoFrameKind, faults: SyntheticFaults): string {
    const base = kind === 'fmp4' ? 'synthetic' : `synthetic-${kind}`;
    const broken = Object.entries(faults).filter(([, on]) => on).map(([fault]) => fault);
    return broken.length > 0 ? `${base} (${broken.join(', ')})` : base;
}

/**
 * The synthetic provider in playout mode: every check that applies to its frame kind runs. fMP4 video can carry the
 * voice; chunks and images can't, and share a timeline with the voice. `faults` breaks rules for the kit's own tests.
 */
export class SyntheticHarness extends SyntheticHarnessBase {
    public readonly Name: string;
    public readonly Traits: RealtimeVideoConformanceTraits;

    constructor(faults: SyntheticFaults = {}, kind: RealtimeVideoFrameKind = 'fmp4') {
        super('playout', faults);
        this.Name = syntheticName(kind, faults);
        this.Traits = {
            AgentVideo: 'playout',
            GrantsAvatar: true,
            Voice: 'pcm',
            VideoCanCarryVoice: kind === 'fmp4',
            VideoUsage: true,
            VideoFrameKind: kind,
            TimedVoice: kind !== 'fmp4',
        };
    }

    public RefusePlayback(): () => void {
        this.Playable = false;
        return () => {
            this.Playable = true;
        };
    }

    /** The synthetic wire carries typed frames as they are. */
    public async SendVideo(frame: RealtimeVideoFrame): Promise<void> {
        this.Wire.Send({ Kind: 'frame', Frame: frame });
    }

    public async SendPart(mimeType: string, data: ArrayBuffer): Promise<void> {
        this.Wire.Send({ Kind: 'part', MimeType: mimeType, Data: data });
    }

    public async GenerationComplete(): Promise<void> {
        this.Wire.Send({ Kind: 'generation-complete' });
    }

    public async Resume(): Promise<void> {
        this.Wire.Send({ Kind: 'moved' });
    }
}

/** The synthetic provider in stream mode: its video is a live stream, so only the checks' stream branches apply. */
export class SyntheticStreamHarness extends SyntheticHarnessBase {
    public readonly Name = 'synthetic-stream';
    public readonly Traits: RealtimeVideoConformanceTraits = {
        AgentVideo: 'stream',
        GrantsAvatar: true,
        Voice: 'pcm',
        VideoCanCarryVoice: false,
        VideoUsage: false,
    };

    constructor() {
        super('stream', {});
    }

    /** The video rides the live stream, not the wire: nothing to send. */
    public async SendVideo(_frame: RealtimeVideoFrame): Promise<void> {
        // A stream provider's model video is the stream itself.
    }
}
