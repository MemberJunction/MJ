/**
 * @fileoverview The realtime MEDIA PLANE — tracks and an open modality vocabulary.
 *
 * MJ's realtime architecture has three planes, and until now only two were named:
 *
 * - **Semantic** — discrete request/response against a surface. Modelled: interactive channels
 *   (`BaseRealtimeChannelServer`), whose entire surface is tool definitions plus session state.
 * - **Reasoning** — who thinks and how hard. Modelled: {@link import('./modelConfiguration').RealtimeReasoningPlane}.
 * - **Media** — continuous, time-sequenced samples bound to a model session. This file.
 *
 * The media plane was previously implicit: every driver hardcoded audio in and audio out, and
 * nothing named the concept. That is why a model able to accept live video had nowhere to put it,
 * and why a model that generates video (an avatar) would have had nowhere either.
 *
 * **Tracks and channels compose rather than compete.** A track transports samples; a channel is a
 * surface that may SOURCE or SINK one. The whiteboard stays a pure tool surface; a screen-share
 * channel sources an inbound video track; an avatar channel sinks an outbound one; a remote-browser
 * channel can source inbound video so the model watches the page continuously while the agent still
 * acts through tools.
 *
 * Design rationale, including the cases this was checked against: `plans/realtime/media-tracks-and-modalities.md`.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

import { BaseSingleton } from '@memberjunction/global';

/**
 * Which way samples flow on a track, relative to the model.
 *
 * Direction is a PROPERTY rather than part of the type because modalities are not one-directional:
 * audio is already both, and video is becoming both. Separate `InboundVideo` / `OutboundVideo` types
 * would double every future modality and encode a distinction that does not hold.
 */
export type RealtimeTrackDirection = 'inbound' | 'outbound';

/**
 * The modalities MJ itself reasons about — cost, consent, and whether a transcript means anything.
 *
 * Deliberately small. Everything outside this set is still transportable (see
 * {@link RealtimeModalityKey}); it simply gets no special handling.
 */
export type RealtimeWellKnownModality = 'audio' | 'video' | 'image' | 'text';

/**
 * A modality key: one of the well-known values, or any registered string.
 *
 * **Deliberately open.** A closed union would make every future modality a `@memberjunction/ai`
 * release plus a coordinated upgrade — pose and hand tracking for AR and accessibility, telemetry
 * for robotics, realtime music, biosignals, haptics, depth. This is the same shape as
 * `RealtimeTurnDetectionMode`'s `'native'`: a known core with a deliberate open door.
 *
 * The `string & {}` intersection is the TypeScript idiom for "any string, but keep autocomplete for
 * the known ones" — it is not a widening to `string` and it is not `any`.
 */
export type RealtimeModalityKey = RealtimeWellKnownModality | (string & {});

/**
 * How a track's usage is metered, so cost is a declared property and never a surprise.
 *
 * A LIST rather than an enum for the same reason `RealtimeSessionCapabilities.UsageBases` is one:
 * a provider can meter a single stream in more than one basis at once.
 */
export type RealtimeTrackUsageBasis = 'tokens' | 'seconds' | 'frames' | 'bytes';

/**
 * What a track IS — the negotiable description of one directional stream of one modality.
 *
 * Used in three roles, which is why every field past the first two is optional: a model DECLARES
 * what it supports, a session REQUESTS what it wants, and the driver REPORTS what it established.
 */
export interface RealtimeTrackDescriptor {
    /** The modality this track carries. */
    Modality: RealtimeModalityKey;

    /** Which way samples flow, relative to the model. */
    Direction: RealtimeTrackDirection;

    /**
     * Wire encoding, where it is negotiable or worth pinning — `'audio/pcm;rate=16000'`,
     * `'image/jpeg'`, `'video/vp8'`. Absent on a request means "the profile's default".
     */
    Encoding?: string;

    /** Sample or frame cadence where meaningful — fps for video, Hz for audio. */
    Rate?: number;

    /** How this track is metered. Absent means the session's own basis applies. */
    UsageBasis?: readonly RealtimeTrackUsageBasis[];

    /**
     * Whether establishing this track needs an explicit human grant — camera, screen capture,
     * microphone, biosignals.
     *
     * A track property rather than per-modality special-casing in the UI, so a host can prompt
     * generically and the audit trail is uniform across modalities we have not invented yet.
     */
    RequiresConsent?: boolean;

    /**
     * Whether this track is required for the session to proceed (`true`) or optional/best-effort (`false`).
     * When optional, failure to establish the track does not terminate the session.
     */
    Required?: boolean;
}

/**
 * Canonical track descriptor for channel-sourced inbound video (e.g. Whiteboard, Remote Browser).
 * Encoded as JPEG, 1 fps rate ceiling, billed on tokens + frames, and requires no human OS consent grant.
 */
export const CHANNEL_INBOUND_VIDEO_TRACK: RealtimeTrackDescriptor = Object.freeze({
    Modality: 'video',
    Direction: 'inbound',
    Encoding: 'image/jpeg',
    Rate: 1,
    UsageBasis: ['tokens', 'frames'] as const,
    RequiresConsent: false,
});

/**
 * Baseline audio tracks for realtime voice sessions: inbound user audio and outbound model speech.
 * Represents the fundamental floor of every realtime voice session.
 */
export const DEFAULT_REALTIME_AUDIO_TRACKS: readonly RealtimeTrackDescriptor[] = Object.freeze([
    Object.freeze({ Modality: 'audio' as const, Direction: 'inbound' as const }),
    Object.freeze({ Modality: 'audio' as const, Direction: 'outbound' as const }),
]);

/**
 * Where a track is in its lifecycle.
 *
 * `'denied'` and `'unsupported'` are distinct on purpose: the first is a human refusing consent
 * (recoverable, re-askable, and a UX event), the second is the model not supporting the modality
 * (permanent for this session, and the trigger for falling back to a non-track path). Collapsing
 * them would make "ask again" indistinguishable from "never ask".
 */
export type RealtimeTrackState = 'requested' | 'establishing' | 'live' | 'ended' | 'denied' | 'unsupported';

/** A track as it exists on a live session: what was asked for, and where it actually got to. */
export interface RealtimeTrack {
    /** Stable id for this track within the session, so state changes can be correlated. */
    TrackID: string;

    /** What was requested, refined with what was actually negotiated once `'live'`. */
    Descriptor: RealtimeTrackDescriptor;

    /** Current lifecycle state. */
    State: RealtimeTrackState;

    /**
     * Why the track is in a terminal state it did not ask for (`'denied'`, `'unsupported'`, an
     * error-driven `'ended'`). Never swallowed — a track that fails silently looks to the host
     * exactly like a track nobody asked for.
     */
    Reason?: string;
}

/**
 * Descriptor for a registered modality — what MJ knows about a modality beyond its key.
 *
 * Registration is how a modality becomes more than an opaque string: it gains a default encoding,
 * a consent requirement, and a metering basis that hosts and cost accounting can rely on without
 * hardcoding a modality list of their own.
 */
export interface RealtimeModalityDescriptor {
    /** The key this descriptor describes. */
    Key: RealtimeModalityKey;

    /** Human-readable name for UI and logs. */
    DisplayName: string;

    /** Directions this modality is meaningful in. */
    Directions: readonly RealtimeTrackDirection[];

    /** Default wire encoding when a request does not pin one. */
    DefaultEncoding?: string;

    /** Whether tracks of this modality require an explicit human grant by default. */
    RequiresConsent?: boolean;

    /** Default metering basis for tracks of this modality. */
    DefaultUsageBasis?: readonly RealtimeTrackUsageBasis[];
}

/**
 * The modality registry — an open vocabulary with a known core.
 *
 * A **code** registry rather than a database table, deliberately: the well-known keys plus every
 * modality we can currently name are covered without one, and an unregistered key still transports.
 * A table earns itself the day a customer must add a modality without shipping a release; at that
 * point it is purely additive (see `plans/realtime/gemini-3-8-live.md` §9.1).
 *
 * `BaseSingleton` rather than a `static _instance` so a bundler that loads this module twice does
 * not produce two registries with divergent contents.
 */
export class RealtimeModalityRegistry extends BaseSingleton<RealtimeModalityRegistry> {
    private _modalities = new Map<string, RealtimeModalityDescriptor>();

    protected constructor() {
        super();
        this.registerWellKnown();
    }

    public static get Instance(): RealtimeModalityRegistry {
        return super.getInstance<RealtimeModalityRegistry>();
    }

    /**
     * Registers (or replaces) a modality descriptor.
     *
     * Last registration wins, matching `MJGlobal.ClassFactory`'s own convention, so a deployment can
     * refine a well-known modality — raising `RequiresConsent` on `video` for a stricter
     * jurisdiction, say — without a code change here.
     */
    public Register(descriptor: RealtimeModalityDescriptor): void {
        if (!descriptor?.Key) {
            throw new Error('RealtimeModalityRegistry.Register requires a descriptor with a Key.');
        }
        this._modalities.set(descriptor.Key.trim().toLowerCase(), descriptor);
    }

    /**
     * Looks a modality up by key, case- and whitespace-insensitively.
     *
     * Returns `undefined` for an unregistered key rather than throwing: an unknown modality is
     * transportable-but-unreasoned-about by design, so callers fall back to the descriptor on the
     * track itself.
     */
    public Get(key: RealtimeModalityKey): RealtimeModalityDescriptor | undefined {
        return this._modalities.get(String(key ?? '').trim().toLowerCase());
    }

    /** Whether a key has a registered descriptor. */
    public IsRegistered(key: RealtimeModalityKey): boolean {
        return this.Get(key) !== undefined;
    }

    /** Every registered descriptor, for UI and diagnostics. */
    public get All(): readonly RealtimeModalityDescriptor[] {
        return [...this._modalities.values()];
    }

    /** Seeds the modalities MJ reasons about. */
    private registerWellKnown(): void {
        this.Register({
            Key: 'audio',
            DisplayName: 'Audio',
            Directions: ['inbound', 'outbound'],
            RequiresConsent: true,
            DefaultUsageBasis: ['tokens', 'seconds'],
        });
        this.Register({
            Key: 'video',
            DisplayName: 'Video',
            Directions: ['inbound', 'outbound'],
            RequiresConsent: true,
            DefaultEncoding: 'image/jpeg',
            DefaultUsageBasis: ['tokens', 'frames'],
        });
        this.Register({
            Key: 'image',
            DisplayName: 'Image',
            Directions: ['inbound'],
            DefaultEncoding: 'image/jpeg',
            DefaultUsageBasis: ['tokens'],
        });
        this.Register({
            Key: 'text',
            DisplayName: 'Text',
            Directions: ['inbound', 'outbound'],
            DefaultUsageBasis: ['tokens'],
        });
    }
}

/**
 * Resolves the set of tracks to establish: what the caller asked for, intersected with what the
 * model supports.
 *
 * **This function is why "video off by default" is structural rather than a default value.** An
 * unrequested track is never established, so omitting configuration cannot silently inherit a
 * provider default — which matters concretely because Gemini 3.8 Live's own turn coverage defaults
 * to including every video frame, billed.
 *
 * A requested track the model does not support resolves to `'unsupported'` rather than being
 * dropped, so the caller can fall back deliberately instead of wondering why no frames arrive.
 *
 * @param requested Tracks the session asked for. Empty or absent yields an empty result.
 * @param supported Tracks the model declares, from `RealtimeSessionCapabilities`.
 * @param makeTrackID Id factory, injected so callers control id shape and tests stay deterministic.
 */
export function ResolveRequestedTracks(
    requested: readonly RealtimeTrackDescriptor[] | undefined,
    supported: readonly RealtimeTrackDescriptor[] | undefined,
    makeTrackID: (descriptor: RealtimeTrackDescriptor, index: number) => string
): RealtimeTrack[] {
    if (!requested || requested.length === 0) {
        return [];
    }
    const supportedList = supported ?? [];
    return requested.map((descriptor, index) => {
        const supportedTrack = supportedList.find(
            (s) =>
                String(s.Modality).trim().toLowerCase() === String(descriptor.Modality).trim().toLowerCase() &&
                s.Direction === descriptor.Direction
        );
        const isSupported = Boolean(supportedTrack);
        let refinedDescriptor = descriptor;
        if (supportedTrack) {
            let effectiveRate = descriptor.Rate;
            if (typeof supportedTrack.Rate === 'number' && supportedTrack.Rate > 0) {
                effectiveRate = typeof descriptor.Rate === 'number' && descriptor.Rate > 0
                    ? Math.min(descriptor.Rate, supportedTrack.Rate)
                    : supportedTrack.Rate;
            }
            refinedDescriptor = {
                ...descriptor,
                Rate: effectiveRate,
            };
        }
        return {
            TrackID: makeTrackID(refinedDescriptor, index),
            Descriptor: refinedDescriptor,
            State: isSupported ? 'requested' : 'unsupported',
            Reason: isSupported
                ? undefined
                : `Model does not support ${descriptor.Direction} ${String(descriptor.Modality)} tracks.`,
        } satisfies RealtimeTrack;
    });
}
