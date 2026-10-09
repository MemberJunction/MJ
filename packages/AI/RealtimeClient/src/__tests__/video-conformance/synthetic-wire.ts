/**
 * The synthetic video provider's wire and pact: what its model sends over an in-memory connection, what its server
 * mints, and the faults its client driver can be told to have (one broken rule each, for the kit's own tests).
 */
import type { JSONObject, JSONValue, RealtimeTrackDescriptor, RealtimeVideoFrame, RealtimeVideoFrameKind } from '@memberjunction/ai';
import { REQUESTED_TRACKS_SESSION_KEY } from '../../generic/baseRealtimeClient';

/** What the synthetic model sends. */
export type SyntheticModelMessage =
    /** A frame of the agent's video, as the provider's wire carries it: already typed. */
    | { Kind: 'frame'; Frame: RealtimeVideoFrame }
    /** A chunk of the agent's voice, with its place on the stream's media timeline when the provider times its voice. */
    | { Kind: 'voice'; Data: ArrayBuffer; MediaTimeMs?: number }
    /** A part of any type, as a provider names it: video, PCM, or something no driver plays. */
    | { Kind: 'part'; MimeType: string; Data: ArrayBuffer }
    | { Kind: 'generation-complete' }
    | { Kind: 'turn-complete' }
    | { Kind: 'interrupted' }
    /** The session moved to a new connection mid-turn (a resume). */
    | { Kind: 'moved' };

/** The in-memory connection between the synthetic model (the harness) and the client. */
export class SyntheticWire {
    private listener: ((message: SyntheticModelMessage) => void) | null = null;
    /** Whether the client asked the model for video when it connected; `null` before it connected. */
    public RequestedVideo: boolean | null = null;

    /** The client connects: from now on the model's messages reach it. */
    public Attach(requestedVideo: boolean, listener: (message: SyntheticModelMessage) => void): void {
        this.RequestedVideo = requestedVideo;
        this.listener = listener;
    }

    /** The client disconnects: the model's later messages reach nobody. */
    public Detach(): void {
        this.listener = null;
    }

    /** The model sends a message. */
    public Send(message: SyntheticModelMessage): void {
        this.listener?.(message);
    }
}

/** One rule each the driver can break, for the kit's tests. */
export interface SyntheticFaults {
    /** VC01: reports the outbound video track live in a session with no avatar. */
    TrackLiveWithoutGrant?: boolean;
    /** VC02: plays a video part as the voice in an audio-only session. */
    PlaysVideoPartsAsVoice?: boolean;
    /** VC03: hands the video over a second time when the first video arrives. */
    HandsOverTwice?: boolean;
    /** VC03: shows the avatar but asks the model for audio only. */
    AsksForAudioOnly?: boolean;
    /** VC04: shows the avatar to a host that asked for no agent video. */
    IgnoresHost?: boolean;
    /** VC05: sets up the avatar although the browser can't play its type. */
    IgnoresPlayability?: boolean;
    /** VC06: plays each frame of video as the voice too. */
    VideoToVoice?: boolean;
    /** VC06, VC10, VF01: never hands its player the fMP4 init segment. */
    DropsInitSegment?: boolean;
    /** VC07: plays a part of an unknown type as video. */
    PlaysUnknownParts?: boolean;
    /** VC08: leaves the video playing at a barge-in. */
    KeepsVideoOnBargeIn?: boolean;
    /** VC09: plays the media an interrupted turn still sends. */
    PlaysLateMedia?: boolean;
    /** VC10: never ends a turn's video at the turn's end. */
    NoEndOfTurn?: boolean;
    /** VC11: plays PCM later in a turn whose video carries the voice. */
    PlaysVoiceTwice?: boolean;
    /** VC12: reports nothing at Disconnect for the turn it cuts off. */
    NoSecondsAtDisconnect?: boolean;
    /** VC12-VC14: reports a turn's seconds again at turn complete. */
    SecondsTwice?: boolean;
    /** VC13: counts the frames an interrupted turn still sends. */
    CountsLateFrames?: boolean;
    /** VC14: flushes the video when the session resumes. */
    FlushOnResume?: boolean;
    /** VC15: keeps the video player after Disconnect. */
    KeepsPlayerOnDisconnect?: boolean;
    /** VF01: labels every fMP4 piece a fragment, the init segment too. */
    MislabelsPieces?: boolean;
    /** VF01, VF02: hands the player its chunks and images retimed to 0, as key frames. */
    RetimesFrames?: boolean;
    /** VF01: hands the player its chunks labelled as images. */
    RelabelsChunks?: boolean;
    /** VF02: creates the video player without the voice's clock. */
    NoClock?: boolean;
    /** VF02: queues the voice without its media times. */
    UntimedVoice?: boolean;
}

/** The avatar the synthetic server granted, as its pact says. */
export interface SyntheticGrant {
    /** The type of the frames the model sends. */
    Encoding: string;
    /** Whether the avatar's video carries the voice (an fMP4 stream with an audio track). */
    CarriesVoice: boolean;
    /** The frames' rate: each frame is one over it, in seconds of generated video. */
    FrameRate: number;
    /** Whether the voice and the video share one media timeline the driver keeps. */
    TimedVoice: boolean;
}

/** The synthetic server's pact for a granted avatar, in the shape {@link ReadSyntheticGrant} reads. */
export function SyntheticAvatarPact(encoding: string, carriesVoice: boolean, timedVoice: boolean, frameRate: number): JSONObject {
    return { avatar: { encoding, carriesVoice, timedVoice, frameRate } };
}

/** The type of each frame kind the synthetic model sends. */
export const SYNTHETIC_FRAME_TYPES: Readonly<Record<RealtimeVideoFrameKind, string>> = {
    fmp4: 'video/mp4; codecs="avc1.42c01f"',
    chunk: 'video/h264; codecs="avc1.42e01f"',
    image: 'image/jpeg',
};

/** The pact's `avatar` block, or `null` when the server granted none. */
export function ReadSyntheticGrant(sessionConfig: JSONObject): SyntheticGrant | null {
    const block = asObject(sessionConfig['avatar']);
    if (!block) {
        return null;
    }
    const encoding = block['encoding'];
    const frameRate = block['frameRate'];
    return {
        Encoding: typeof encoding === 'string' ? encoding : SYNTHETIC_FRAME_TYPES.fmp4,
        CarriesVoice: block['carriesVoice'] !== false,
        FrameRate: typeof frameRate === 'number' && frameRate > 0 ? frameRate : 24,
        TimedVoice: block['timedVoice'] === true,
    };
}

/** The tracks the host requested (`requestedTracks`), or `undefined` when it sent none. */
export function ReadRequestedTracks(sessionConfig: JSONObject): RealtimeTrackDescriptor[] | undefined {
    const raw = sessionConfig[REQUESTED_TRACKS_SESSION_KEY];
    if (!Array.isArray(raw)) {
        return undefined;
    }
    return raw.flatMap((item): RealtimeTrackDescriptor[] => {
        const track = asObject(item);
        const modality = track?.['Modality'];
        const direction = track?.['Direction'];
        return typeof modality === 'string' && (direction === 'inbound' || direction === 'outbound') ? [{ Modality: modality, Direction: direction }] : [];
    });
}

function asObject(value: JSONValue | undefined): JSONObject | null {
    return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
