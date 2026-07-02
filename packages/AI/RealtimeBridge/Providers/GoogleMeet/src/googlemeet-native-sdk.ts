/**
 * @fileoverview `GoogleMeetNativeMeetingSdk` — a **real, two-way** {@link IGoogleMeetSdk} binding over a
 * **native Google Meet media bot addon** (the allowlisted participating-client build). Unlike a
 * receive-only binding, this adapter gives the agent a **voice**: {@link sendAudioFrame} forwards the
 * agent's synthesized PCM to the addon's audio-contribution **send** path, and the host controls (mute)
 * actually act through the native client.
 *
 * ## Why a native binding
 * Pushing audio *into* a Meet conference requires the Media API's audio-contribution channel, which only
 * the allowlisted participating-client build exposes. The native addon wraps that build and surfaces both
 * the per-participant raw-audio receive callback (the agent's "hearing" + diarization) and the outbound
 * send path, so a single binding carries **bidirectional** audio. This is the binding a two-way "agent
 * talks in the meeting" deployment uses.
 *
 * ## The native module seam (no SDK types leak)
 * The Google Meet Media API ships no first-class Node package for the participating-client build;
 * deployments wrap it as an N-API addon or a local sidecar process exposing the small
 * {@link NativeMeetingModule} surface declared below. This adapter depends ONLY on that structural surface
 * — none of the API's real types leak into the package, and the module is loaded **lazily** behind an
 * injectable {@link NativeModuleLoader} so `@memberjunction/ai-bridge-googlemeet` builds and unit-tests
 * with **no addon and no network**. Tests inject a fake module; production points
 * {@link GoogleMeetNativeSdkConfig.NativeModuleSpecifier} at the real addon.
 *
 * ## Early-access / allowlist + auth (deployment responsibility)
 * The native bot requires the **Google Meet Media API** early-access allowlist binding for the Workspace
 * tenant and joins with a resolved OAuth/access token. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) and are **never inlined** at a call site. See the package README and
 * the seam's early-access caveat in {@link import('./googlemeet-sdk')}.
 *
 * ## Meet capability shape (what the seam OMITS)
 * The {@link IGoogleMeetSdk} seam deliberately has **no chat** and **no hand-raise** operations (the Media
 * API surfaces neither — see the seam file). The native addon may still report hand-raise (some addons do),
 * so this adapter exposes a Meet-native {@link onHandRaise} surface OUTSIDE the seam (like the bridge's
 * other Meet-native surfaces) without forwarding it into the capability-narrow seam.
 *
 * Every spot where the native addon's exact surface is assumed carries a `// VERIFY against the native
 * Google Meet media bot addon` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-googlemeet
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import {
    IGoogleMeetSdk,
    GoogleMeetAudioFrame,
    GoogleMeetJoinArgs,
    GoogleMeetJoinResult,
    GoogleMeetParticipant,
    GoogleMeetParticipantRole,
} from './googlemeet-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-Meet-media-bot-addon surface this adapter depends on (a local
// structural type so NONE of the API's types leak and the package compiles WITHOUT
// the addon installed). VERIFY against the native Google Meet media bot addon you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One raw per-participant audio frame the native addon surfaces (inbound hearing + diarization). */
export interface NativeMeetAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** The Meet participant id that produced the audio (the diarization speaker label). */
    participantId: string | number;
    /** The participant's display name at capture time, when the addon provides it. */
    displayName?: string;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** One participant as the native addon reports it. Mapped onto {@link GoogleMeetParticipant}. */
export interface NativeMeetParticipant {
    /** The native participant id. */
    participantId: string | number;
    /** The participant's display name. */
    displayName?: string;
    /** The participant's role as the addon reports it (`host` / `cohost` / `participant`). */
    role?: string;
    /** Whether this participant is the bot itself. */
    isSelf?: boolean;
}

/** The arguments the native addon's `join()` accepts. Mirrors {@link GoogleMeetJoinArgs} plus raw-audio opts. */
export interface NativeMeetJoinArgs {
    /** The Meet meeting code / space id to join. */
    meetingCode: string;
    /** The bot's display name in the participant list. */
    displayName: string;
    /** The resolved OAuth/access token authorizing the allowlisted client (resolved upstream; never inline). */
    accessToken?: string;
    /** Raw-audio sample rate the bot sends/receives (Hz), when the addon needs it told. */
    sampleRate?: number;
    /** Raw-audio channel count, when the addon needs it told. */
    channels?: number;
}

/** What the native addon's `join()` resolves to. */
export interface NativeMeetJoinResult {
    /** The bot's own participant id in the joined conference. */
    botParticipantId: string | number;
    /** The Meet conference/space id the bot joined. */
    meetingId: string;
}

/**
 * The live native-meeting client the addon hands back. The surface closely mirrors {@link IGoogleMeetSdk}
 * but in the addon's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native Google Meet media bot addon.
 */
export interface NativeMeetClient {
    /** Joins the conference (async — the native join handshake is network-bound). */
    join(args: NativeMeetJoinArgs): Promise<NativeMeetJoinResult>;
    /** Leaves the conference and releases native resources. */
    leave(): Promise<void>;
    /** Sends one raw PCM frame as the bot's outbound audio (the audio-contribution path — the agent's voice). */
    sendAudioFrame(pcm: ArrayBuffer): void;
    /** Registers the inbound per-participant raw-audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeMeetAudioFrame) => void): void;
    /** Registers the participant-join callback. */
    onParticipantJoin(cb: (participant: NativeMeetParticipant) => void): void;
    /** Registers the participant-leave callback (id of the participant that left). */
    onParticipantLeave(cb: (participantId: string | number) => void): void;
    /**
     * Registers the native hand-raise/lower callback, when the addon reports it. The seam itself has no
     * hand-raise operation (Meet does not surface one through the Media API), so this is a Meet-native
     * surface the channel plane may consume — not forwarded into {@link IGoogleMeetSdk}.
     */
    onHandRaise(cb: (participantId: string | number, raised: boolean) => void): void;
    /** Returns the current participant roster (including the bot). */
    getParticipants(): Promise<NativeMeetParticipant[]>;
    /** Mutes a participant (requires the tenant's allowlist/tier grant the action). */
    muteParticipant(participantId: string | number): Promise<void>;
    /** Registers the meeting-ended callback. */
    onMeetingEnded(cb: () => void): void;
}

/** The native addon module surface — a factory that constructs a {@link NativeMeetClient}. */
export interface NativeMeetingModule {
    /**
     * Constructs a native meeting client from resolved options (credentials already resolved upstream).
     * VERIFY against the native Google Meet media bot addon (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeMeetClientOptions): NativeMeetClient;
}

/** Options passed to {@link NativeMeetingModule.createClient}. Credentials are resolved upstream. */
export interface NativeMeetClientOptions {
    /** The Google Cloud / Workspace project id the allowlisted client runs under (resolved upstream). */
    ProjectId?: string;
    /** The resolved OAuth/access token authorizing the allowlisted client (resolved upstream). */
    AccessToken?: string;
}

/**
 * Resolved configuration for {@link GoogleMeetNativeMeetingSdk}. Credentials resolve **upstream** (MJ
 * credential system / provider `Configuration`) — this object carries already-resolved values; **never
 * inline secrets** at a call site.
 */
export interface GoogleMeetNativeSdkConfig {
    /** The Google Cloud / Workspace project id the allowlisted client runs under (resolved upstream). */
    ProjectId?: string;
    /** The resolved OAuth/access token authorizing the allowlisted client (resolved upstream). */
    AccessToken?: string;
    /** The bot's display name (defaults applied by the bridge when absent). */
    BotDisplayName?: string;
    /** Raw-audio sample rate (Hz) the bot sends/receives. */
    SampleRate?: number;
    /** Raw-audio channel count. */
    Channels?: number;
    /**
     * The module specifier of the native Meet media bot addon/sidecar to load (e.g. an internal N-API addon
     * package name or an absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
}

/** Copies any `Uint8Array` view or `ArrayBuffer` into a standalone `ArrayBuffer` (no aliasing the source window). */
export function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data.slice(0);
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

/** Normalizes the addon's free-form role string onto the seam's {@link GoogleMeetParticipantRole}. */
export function mapNativeRole(role?: string): GoogleMeetParticipantRole {
    switch ((role ?? '').trim().toLowerCase()) {
        case 'host':
            return 'Host';
        case 'cohost':
        case 'co-host':
            return 'CoHost';
        default:
            return 'Participant';
    }
}

/**
 * **Pure mapping** of one native participant onto the seam's {@link GoogleMeetParticipant}. Isolated from
 * the addon and from I/O so it is unit-tested directly.
 */
export function mapNativeParticipant(p: NativeMeetParticipant): GoogleMeetParticipant {
    return {
        ParticipantId: String(p.participantId),
        DisplayName: p.displayName,
        Role: mapNativeRole(p.role),
        IsSelf: p.isSelf,
    };
}

/**
 * **Pure mapping** of one native inbound audio frame onto the seam's diarized {@link GoogleMeetAudioFrame}.
 * Copies the PCM (see {@link toArrayBuffer}) and resolves the speaker label. Isolated for direct testing.
 */
export function mapNativeAudioFrame(frame: NativeMeetAudioFrame): GoogleMeetAudioFrame {
    return {
        Pcm: toArrayBuffer(frame.data),
        ParticipantId: String(frame.participantId),
        DisplayName: frame.displayName,
        TimestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : Date.now(),
    };
}

/**
 * The injectable loader for the native Meet media bot addon — overridable so unit tests supply a fake
 * module with no addon and no network. Production leaves it as {@link defaultNativeLoader}, which lazily
 * imports the configured {@link GoogleMeetNativeSdkConfig.NativeModuleSpecifier}.
 */
export type NativeModuleLoader = (specifier: string) => Promise<NativeMeetingModule>;

/** Structural guard: a value is a {@link NativeMeetingModule} when it exposes a `createClient` function. */
function isNativeModule(value: unknown): value is NativeMeetingModule {
    return (
        value != null &&
        typeof value === 'object' &&
        typeof (value as { createClient?: unknown }).createClient === 'function'
    );
}

/** Unwraps a `{ default }` interop wrapper (CJS-with-default), returning the inner value or the input. */
function unwrapDefault(mod: unknown): unknown {
    if (mod && typeof mod === 'object' && 'default' in mod) {
        const inner = (mod as { default: unknown }).default;
        if (isNativeModule(inner)) {
            return inner;
        }
    }
    return mod;
}

/**
 * Lazily loads the native Meet media bot addon at the given specifier (category: runtime plugin discovery
 * from config — the addon path is deployment-supplied and not known at build time). Throws a precise,
 * actionable error when it can't be loaded so a misconfigured deployment fails loudly, not silently.
 *
 * VERIFY against the native Google Meet media bot addon: the module's default/namespace interop + that it
 * exposes `createClient`.
 */
export const defaultNativeLoader: NativeModuleLoader = async (specifier: string): Promise<NativeMeetingModule> => {
    try {
        const mod: unknown = await import(/* @vite-ignore */ specifier);
        const resolved = unwrapDefault(mod);
        if (!isNativeModule(resolved)) {
            throw new Error('resolved module has no createClient() factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            `GoogleMeetNativeMeetingSdk could not load the native Meet media bot addon at '${specifier}'. ` +
                'Build/install the native Google Meet media bot addon (the allowlisted participating-client ' +
                'build) and set GoogleMeetNativeSdkConfig.NativeModuleSpecifier to it. ' +
                `Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link IGoogleMeetSdk} over the native Google Meet media bot addon (raw-audio send +
 * receive).
 *
 * Gives the agent both **hearing** (per-participant inbound audio → diarized {@link GoogleMeetAudioFrame}s)
 * and a **voice** ({@link sendAudioFrame} → the native audio-contribution send path), plus the seam's
 * participant mute and roster/meeting-ended events. Construct via {@link BindGoogleMeetNative} (the factory
 * the bridge's `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire
 * consistently.
 *
 * Hand-raise is a Meet-native surface ({@link onHandRaise}) OUTSIDE the seam — the {@link IGoogleMeetSdk}
 * contract has no hand-raise operation because the Media API surfaces no such signal.
 */
export class GoogleMeetNativeMeetingSdk implements IGoogleMeetSdk {
    /** Resolved config (credentials + raw-audio + the native module specifier). */
    private readonly config: GoogleMeetNativeSdkConfig;

    /** The native-addon module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native client once {@link join} succeeds. */
    private client: NativeMeetClient | null = null;

    /** The inbound per-participant audio handler registered by the bridge. */
    private audioHandler?: (frame: GoogleMeetAudioFrame) => void;

    /** The participant-join handler. */
    private joinHandler?: (participant: GoogleMeetParticipant) => void;

    /** The participant-leave handler. */
    private leaveHandler?: (participantId: string) => void;

    /** The hand-raise handler (Meet-native; not part of the seam). */
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    /** The meeting-ended handler. */
    private endedHandler?: () => void;

    /**
     * @param config Resolved credentials + raw-audio opts + the native module specifier.
     * @param loadModule The native-addon loader (defaults to the lazy specifier loader).
     */
    constructor(config: GoogleMeetNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── IGoogleMeetSdk — lifecycle ───────────────────────────────────────────────────

    /**
     * Loads the native addon, constructs a client, wires its callbacks, and joins the conference with the
     * resolved access token. Brings BOTH hearing and the agent's voice online.
     *
     * @param args The bridge's join args (meeting code, bot name, auth).
     * @returns The bot/meeting identifiers.
     * @throws When the native module specifier is missing or the addon can't be loaded.
     */
    public async join(args: GoogleMeetJoinArgs): Promise<GoogleMeetJoinResult> {
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'GoogleMeetNativeMeetingSdk.join: no NativeModuleSpecifier configured. Set it to the native ' +
                    'Google Meet media bot addon (allowlisted participating-client build) in the session ' +
                    'Configuration. See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createClient({ ProjectId: this.config.ProjectId, AccessToken: this.config.AccessToken });
        this.wireClient(client);

        const result = await client.join({
            meetingCode: args.MeetingCode,
            displayName: args.BotDisplayName || this.config.BotDisplayName || 'AI Agent',
            accessToken: args.AccessToken ?? this.config.AccessToken,
            sampleRate: this.config.SampleRate,
            channels: this.config.Channels,
        });
        this.client = client;

        return {
            BotParticipantId: String(result.botParticipantId),
            MeetingId: result.meetingId || args.MeetingCode,
        };
    }

    /** Leaves the conference and releases the native client. Tolerant of teardown errors. */
    public async leave(): Promise<void> {
        const client = this.client;
        this.client = null;
        if (client) {
            try {
                await client.leave();
            } catch (err) {
                LogError(
                    `[GoogleMeetNativeMeetingSdk] leave() failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
    }

    // ── IGoogleMeetSdk — two-way audio (real) ────────────────────────────────────────

    /**
     * Sends one raw PCM frame as the bot's outbound audio — **the agent's real voice into the meeting**,
     * via the native audio-contribution send path. No-ops (without throwing) before {@link join} so an
     * early model frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the meeting.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.client?.sendAudioFrame(pcm);
    }

    /** Registers the inbound per-participant audio handler (the diarized hearing path). */
    public onAudioFrame(cb: (frame: GoogleMeetAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    // ── IGoogleMeetSdk — roster + signals ────────────────────────────────────────────

    /** Registers the participant-join handler. */
    public onParticipantJoin(cb: (participant: GoogleMeetParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the participant-leave handler. */
    public onParticipantLeave(cb: (participantId: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Returns the current roster from the native client, mapped to {@link GoogleMeetParticipant}. */
    public async getParticipants(): Promise<GoogleMeetParticipant[]> {
        if (!this.client) {
            return [];
        }
        const natives = await this.client.getParticipants();
        return natives.map(mapNativeParticipant);
    }

    /** Registers the meeting-ended handler. */
    public onMeetingEnded(cb: () => void): void {
        this.endedHandler = cb;
    }

    // ── IGoogleMeetSdk — host controls (real) ────────────────────────────────────────

    /**
     * Mutes a participant via the native host control (requires the tenant's allowlist/tier grant the
     * action). No-ops (without throwing) before {@link join}.
     *
     * @param participantId The participant to mute.
     */
    public async muteParticipant(participantId: string): Promise<void> {
        await this.client?.muteParticipant(participantId);
    }

    // ── Meet-native surfaces (OUTSIDE the seam) ──────────────────────────────────────

    /**
     * Registers a hand-raise/lower handler. This is a **Meet-native** surface — NOT part of
     * {@link IGoogleMeetSdk} (the Media API surfaces no hand-raise signal). Wired from the native addon's
     * own hand-raise callback when the addon reports it; inert otherwise. The channel plane may consume
     * it where available.
     *
     * @param cb Invoked with the participant id and whether the hand is raised.
     */
    public onHandRaise(cb: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = cb;
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Wires the native client's callbacks to this adapter's handlers, mapping native shapes to the seam. */
    private wireClient(client: NativeMeetClient): void {
        client.onAudioFrame((frame) => this.audioHandler?.(mapNativeAudioFrame(frame)));
        client.onParticipantJoin((p) => this.joinHandler?.(mapNativeParticipant(p)));
        client.onParticipantLeave((id) => this.leaveHandler?.(String(id)));
        client.onHandRaise((id, raised) => this.handRaiseHandler?.(String(id), raised));
        client.onMeetingEnded(() => this.endedHandler?.());
    }
}

/**
 * Builds the {@link import('./googlemeet-sdk').GoogleMeetSdkFactory}-shaped factory that constructs a
 * {@link GoogleMeetNativeMeetingSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `GoogleMeetBridge.SetSdkFactory(...)` so a deployment activates **two-way native Google Meet audio**
 * without code changes to the driver.
 *
 * Reads the access token / project id + raw-audio opts + the native module specifier out of the config map
 * the engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindGoogleMeetNative());
 *
 * @param loadModule Optional native-addon loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => GoogleMeetNativeMeetingSdk`.
 */
export function BindGoogleMeetNative(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => GoogleMeetNativeMeetingSdk {
    return (config?: Record<string, unknown>) =>
        new GoogleMeetNativeMeetingSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link GoogleMeetNativeSdkConfig} from the engine's loosely-typed `Configuration` map without
 * ever widening to `any`. Each field is read + type-checked individually so a malformed config yields a
 * clean, partially-resolved object (and {@link GoogleMeetNativeMeetingSdk.join} then throws a precise error
 * if the required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): GoogleMeetNativeSdkConfig {
    const cfg = config ?? {};
    return {
        ProjectId: readString(cfg.ProjectId),
        AccessToken: readString(cfg.AccessToken),
        BotDisplayName: readString(cfg.BotDisplayName),
        SampleRate: readNumber(cfg.SampleRate),
        Channels: readNumber(cfg.Channels),
        NativeModuleSpecifier: readString(cfg.NativeModuleSpecifier),
    };
}

/** Reads a value as a non-empty string, or `undefined`. */
function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Reads a value as a finite number, or `undefined`. */
function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
