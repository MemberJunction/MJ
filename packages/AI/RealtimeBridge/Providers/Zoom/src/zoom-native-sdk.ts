/**
 * @fileoverview `ZoomNativeMeetingSdk` — a **real, two-way** {@link IZoomMeetingSdk} binding over the
 * native **Zoom Meeting SDK** (the server/Linux headless bot build) with the **raw-data** entitlement.
 * Unlike the receive-only RTMS binding ({@link import('./zoom-rtms-sdk').ZoomRtmsMeetingSdk}), this
 * adapter gives the agent a **voice**: {@link sendAudioFrame} forwards the agent's synthesized PCM to the
 * Meeting SDK's raw-audio **send** path (virtual mic), and the host controls (chat / mute) actually act.
 *
 * ## Why a native binding
 * Pushing audio *into* a Zoom meeting is impossible over RTMS (receive-only). The native Zoom Meeting SDK
 * exposes a raw-audio **virtual-mic send** API alongside the per-participant raw-audio receive callback,
 * so a single binding carries **bidirectional** audio. This is the binding a two-way "agent talks in the
 * meeting" deployment uses.
 *
 * ## The native module seam (no SDK types leak)
 * The native Zoom Meeting SDK is a C++ SDK with **no official Node package**; deployments wrap it as a
 * N-API addon or a local sidecar process exposing the small {@link NativeMeetingModule} surface declared
 * below. This adapter depends ONLY on that structural surface — none of the SDK's real types leak into
 * the package, and the module is loaded **lazily** behind an injectable {@link NativeModuleLoader} so
 * `@memberjunction/ai-bridge-zoom` builds and unit-tests with **no addon and no network**. Tests inject a
 * fake module; production points {@link ZoomNativeSdkConfig.NativeModuleSpecifier} at the real addon.
 *
 * ## Entitlements + auth (deployment responsibility)
 * The native bot needs the Zoom **raw-data receive** AND **raw-data send** entitlements (ISV/partner
 * approved) and joins with a Meeting SDK **JWT signature** (from the SDK Key/Secret) — NOT the RTMS
 * webhook handshake. Credentials resolve **upstream** (MJ credential system / provider `Configuration`)
 * and are **never inlined**. See the package README's "Native two-way audio" section.
 *
 * Every spot where the native addon's exact surface is assumed carries a `// VERIFY against the native
 * Zoom Meeting SDK addon` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-zoom
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import {
    IZoomMeetingSdk,
    ZoomAudioFrame,
    ZoomJoinArgs,
    ZoomJoinResult,
    ZoomParticipant,
    ZoomParticipantRole,
} from './zoom-sdk';
// Reuse the package's single PCM-coercion helper (defined in the RTMS binding) rather than redefining +
// re-exporting it, which would collide under index.ts's `export *`.
import { toArrayBuffer } from './zoom-rtms-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-Meeting-SDK-addon surface this adapter depends on (a local
// structural type so NONE of the SDK's types leak and the package compiles WITHOUT
// the addon installed). VERIFY against the native Zoom Meeting SDK addon you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One raw per-participant audio frame the native addon surfaces (inbound hearing + diarization). */
export interface NativeAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** The Zoom participant id that produced the audio (the diarization speaker label). */
    participantId: string | number;
    /** The participant's display name at capture time, when the addon provides it. */
    displayName?: string;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** One participant as the native addon reports it. Mapped onto {@link ZoomParticipant}. */
export interface NativeParticipant {
    /** The native participant id. */
    participantId: string | number;
    /** The participant's display name. */
    displayName?: string;
    /** The participant's role as the addon reports it (`host` / `cohost` / `participant`). */
    role?: string;
    /** Whether this participant is the bot itself. */
    isSelf?: boolean;
}

/** The arguments the native addon's `join()` accepts. Mirrors {@link ZoomJoinArgs} plus raw-audio opts. */
export interface NativeJoinArgs {
    /** The Zoom meeting number / id to join. */
    meetingNumber: string;
    /** The meeting passcode, when required. */
    passcode?: string;
    /** The bot's display name in the participant list. */
    displayName: string;
    /** The signed Meeting SDK JWT authorizing the join (resolved upstream; never inline). */
    sdkSignature?: string;
    /** The ZAK token for joining as / on behalf of a host, when applicable. */
    zakToken?: string;
    /** Raw-audio sample rate the bot sends/receives (Hz), when the addon needs it told. */
    sampleRate?: number;
    /** Raw-audio channel count, when the addon needs it told. */
    channels?: number;
}

/** What the native addon's `join()` resolves to. */
export interface NativeJoinResult {
    /** The bot's own participant id in the joined meeting. */
    botParticipantId: string | number;
    /** The Zoom meeting id/number the bot joined. */
    meetingId: string;
}

/**
 * The live native-meeting client the addon hands back. The surface closely mirrors {@link IZoomMeetingSdk}
 * but in the addon's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native Zoom Meeting SDK addon.
 */
export interface NativeMeetingClient {
    /** Joins the meeting (async — the native join handshake is network-bound). */
    join(args: NativeJoinArgs): Promise<NativeJoinResult>;
    /** Leaves the meeting and releases native resources. */
    leave(): Promise<void>;
    /** Sends one raw PCM frame as the bot's outbound audio (the virtual-mic send path — the agent's voice). */
    sendAudioFrame(pcm: ArrayBuffer): void;
    /** Registers the inbound per-participant raw-audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeAudioFrame) => void): void;
    /** Registers the participant-join callback. */
    onParticipantJoin(cb: (participant: NativeParticipant) => void): void;
    /** Registers the participant-leave callback (id of the participant that left). */
    onParticipantLeave(cb: (participantId: string | number) => void): void;
    /** Registers the native hand-raise/lower callback. */
    onHandRaise(cb: (participantId: string | number, raised: boolean) => void): void;
    /** Returns the current participant roster (including the bot). */
    getParticipants(): Promise<NativeParticipant[]>;
    /** Posts a message to the in-meeting chat (everyone). */
    postChatMessage(text: string): Promise<void>;
    /** Mutes a participant (requires the bot be host/co-host). */
    muteParticipant(participantId: string | number): Promise<void>;
    /** Registers the meeting-ended callback. */
    onMeetingEnded(cb: () => void): void;
}

/** The native addon module surface — a factory that constructs a {@link NativeMeetingClient}. */
export interface NativeMeetingModule {
    /**
     * Constructs a native meeting client from resolved options (SDK credentials already resolved upstream).
     * VERIFY against the native Zoom Meeting SDK addon (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeClientOptions): NativeMeetingClient;
}

/** Options passed to {@link NativeMeetingModule.createClient}. Credentials are resolved upstream. */
export interface NativeClientOptions {
    /** The Zoom Meeting SDK Key (resolved upstream; used to generate the join JWT when not pre-signed). */
    SdkKey?: string;
    /** The Zoom Meeting SDK Secret (resolved upstream). Used only to sign the join JWT. */
    SdkSecret?: string;
}

/**
 * Resolved configuration for {@link ZoomNativeMeetingSdk}. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) — this object carries already-resolved values; **never inline
 * secrets** at a call site.
 */
export interface ZoomNativeSdkConfig {
    /** The Zoom Meeting SDK Key (resolved upstream). */
    SdkKey?: string;
    /** The Zoom Meeting SDK Secret (resolved upstream). Used only to sign the join JWT. */
    SdkSecret?: string;
    /** A pre-signed Meeting SDK JWT, when the deployment computes it out-of-band instead of via key/secret. */
    SdkSignature?: string;
    /** The ZAK token for joining as / on behalf of a host, when applicable. */
    ZakToken?: string;
    /** The bot's display name (defaults applied by the bridge when absent). */
    BotDisplayName?: string;
    /** Raw-audio sample rate (Hz) the bot sends/receives. */
    SampleRate?: number;
    /** Raw-audio channel count. */
    Channels?: number;
    /**
     * The module specifier of the native Meeting SDK addon/sidecar to load (e.g. an internal N-API addon
     * package name or an absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
}

/** Normalizes the addon's free-form role string onto the bridge's {@link ZoomParticipantRole}. */
export function mapNativeRole(role?: string): ZoomParticipantRole {
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
 * **Pure mapping** of one native participant onto the bridge's {@link ZoomParticipant}. Isolated from the
 * addon and from I/O so it is unit-tested directly.
 */
export function mapNativeParticipant(p: NativeParticipant): ZoomParticipant {
    return {
        ParticipantId: String(p.participantId),
        DisplayName: p.displayName,
        Role: mapNativeRole(p.role),
        IsSelf: p.isSelf,
    };
}

/**
 * **Pure mapping** of one native inbound audio frame onto the bridge's diarized {@link ZoomAudioFrame}.
 * Copies the PCM (see {@link toArrayBuffer}) and resolves the speaker label. Isolated for direct testing.
 */
export function mapNativeAudioFrame(frame: NativeAudioFrame): ZoomAudioFrame {
    return {
        Pcm: toArrayBuffer(frame.data),
        ParticipantId: String(frame.participantId),
        DisplayName: frame.displayName,
        TimestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : Date.now(),
    };
}

/**
 * The injectable loader for the native Meeting SDK addon — overridable so unit tests supply a fake module
 * with no addon and no network. Production leaves it as {@link defaultNativeLoader}, which lazily imports
 * the configured {@link ZoomNativeSdkConfig.NativeModuleSpecifier}.
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
 * Lazily loads the native Meeting SDK addon at the given specifier (category: runtime plugin discovery
 * from config — the addon path is deployment-supplied and not known at build time). Throws a precise,
 * actionable error when it can't be loaded so a misconfigured deployment fails loudly, not silently.
 *
 * VERIFY against the native Zoom Meeting SDK addon: the module's default/namespace interop + that it
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
            `ZoomNativeMeetingSdk could not load the native Meeting SDK addon at '${specifier}'. Build/install ` +
                'the native Zoom Meeting SDK bot addon (the raw-data send+receive build, ISV-entitled) and set ' +
                `ZoomNativeSdkConfig.NativeModuleSpecifier to it. Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link IZoomMeetingSdk} over the native Zoom Meeting SDK (raw-data send + receive).
 *
 * Gives the agent both **hearing** (per-participant inbound audio → diarized {@link ZoomAudioFrame}s) and
 * a **voice** ({@link sendAudioFrame} → the native virtual-mic send path), plus working host controls
 * (chat / mute) and roster/hand-raise events. Construct via {@link BindZoomNative} (the factory the
 * bridge's `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire consistently.
 */
export class ZoomNativeMeetingSdk implements IZoomMeetingSdk {
    /** Resolved config (credentials + raw-audio + the native module specifier). */
    private readonly config: ZoomNativeSdkConfig;

    /** The native-addon module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native client once {@link join} succeeds. */
    private client: NativeMeetingClient | null = null;

    /** The inbound per-participant audio handler registered by the bridge. */
    private audioHandler?: (frame: ZoomAudioFrame) => void;

    /** The participant-join handler. */
    private joinHandler?: (participant: ZoomParticipant) => void;

    /** The participant-leave handler. */
    private leaveHandler?: (participantId: string) => void;

    /** The hand-raise handler. */
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    /** The meeting-ended handler. */
    private endedHandler?: () => void;

    /**
     * @param config Resolved credentials + raw-audio opts + the native module specifier.
     * @param loadModule The native-addon loader (defaults to the lazy specifier loader).
     */
    constructor(config: ZoomNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── IZoomMeetingSdk — lifecycle ──────────────────────────────────────────────────

    /**
     * Loads the native addon, constructs a client, wires its callbacks, and joins the meeting with the
     * resolved Meeting SDK signature. Brings BOTH hearing and the agent's voice online.
     *
     * @param args The bridge's join args (meeting number, passcode, bot name, auth).
     * @returns The bot/meeting identifiers.
     * @throws When the native module specifier is missing or the addon can't be loaded.
     */
    public async join(args: ZoomJoinArgs): Promise<ZoomJoinResult> {
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'ZoomNativeMeetingSdk.join: no NativeModuleSpecifier configured. Set it to the native Zoom ' +
                    'Meeting SDK bot addon (raw-data send+receive build) in the session Configuration. See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createClient({ SdkKey: this.config.SdkKey, SdkSecret: this.config.SdkSecret });
        this.wireClient(client);

        const result = await client.join({
            meetingNumber: args.MeetingNumber,
            passcode: args.Passcode,
            displayName: args.BotDisplayName || this.config.BotDisplayName || 'AI Agent',
            sdkSignature: args.SdkSignature ?? this.config.SdkSignature,
            zakToken: args.ZakToken ?? this.config.ZakToken,
            sampleRate: this.config.SampleRate,
            channels: this.config.Channels,
        });
        this.client = client;

        return {
            BotParticipantId: String(result.botParticipantId),
            MeetingId: result.meetingId || args.MeetingNumber,
        };
    }

    /** Leaves the meeting and releases the native client. Tolerant of teardown errors. */
    public async leave(): Promise<void> {
        const client = this.client;
        this.client = null;
        if (client) {
            try {
                await client.leave();
            } catch (err) {
                LogError(`[ZoomNativeMeetingSdk] leave() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    // ── IZoomMeetingSdk — two-way audio (real) ───────────────────────────────────────

    /**
     * Sends one raw PCM frame as the bot's outbound audio — **the agent's real voice into the meeting**,
     * via the native virtual-mic send path. No-ops (without throwing) before {@link join} so an early
     * model frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the meeting.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.client?.sendAudioFrame(pcm);
    }

    /** Registers the inbound per-participant audio handler (the diarized hearing path). */
    public onAudioFrame(cb: (frame: ZoomAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    // ── IZoomMeetingSdk — roster + signals ───────────────────────────────────────────

    /** Registers the participant-join handler. */
    public onParticipantJoin(cb: (participant: ZoomParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the participant-leave handler. */
    public onParticipantLeave(cb: (participantId: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Registers the native hand-raise/lower handler. */
    public onHandRaise(cb: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = cb;
    }

    /** Returns the current roster from the native client, mapped to {@link ZoomParticipant}. */
    public async getParticipants(): Promise<ZoomParticipant[]> {
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

    // ── IZoomMeetingSdk — host controls (real) ───────────────────────────────────────

    /**
     * Posts a message to the in-meeting chat via the native client. No-ops (without throwing) before
     * {@link join}.
     *
     * @param text The chat message text.
     */
    public async postChatMessage(text: string): Promise<void> {
        await this.client?.postChatMessage(text);
    }

    /**
     * Mutes a participant via the native host control (requires the bot be host/co-host). No-ops (without
     * throwing) before {@link join}.
     *
     * @param participantId The participant to mute.
     */
    public async muteParticipant(participantId: string): Promise<void> {
        await this.client?.muteParticipant(participantId);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Wires the native client's callbacks to this adapter's handlers, mapping native shapes to the seam. */
    private wireClient(client: NativeMeetingClient): void {
        client.onAudioFrame((frame) => this.audioHandler?.(mapNativeAudioFrame(frame)));
        client.onParticipantJoin((p) => this.joinHandler?.(mapNativeParticipant(p)));
        client.onParticipantLeave((id) => this.leaveHandler?.(String(id)));
        client.onHandRaise((id, raised) => this.handRaiseHandler?.(String(id), raised));
        client.onMeetingEnded(() => this.endedHandler?.());
    }
}

/**
 * Builds the {@link import('./zoom-sdk').ZoomMeetingSdkFactory}-shaped factory that constructs a
 * {@link ZoomNativeMeetingSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `ZoomBridge.SetSdkFactory(...)` so a deployment activates **two-way native Zoom audio** without code
 * changes to the driver.
 *
 * Reads SDK credentials / signature / ZAK + raw-audio opts + the native module specifier out of the config
 * map the engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindZoomNative());
 *
 * @param loadModule Optional native-addon loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => ZoomNativeMeetingSdk`.
 */
export function BindZoomNative(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => ZoomNativeMeetingSdk {
    return (config?: Record<string, unknown>) => new ZoomNativeMeetingSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link ZoomNativeSdkConfig} from the engine's loosely-typed `Configuration` map without ever
 * widening to `any`. Each field is read + type-checked individually so a malformed config yields a clean,
 * partially-resolved object (and {@link ZoomNativeMeetingSdk.join} then throws a precise error if the
 * required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): ZoomNativeSdkConfig {
    const cfg = config ?? {};
    return {
        SdkKey: readString(cfg.SdkKey),
        SdkSecret: readString(cfg.SdkSecret),
        SdkSignature: readString(cfg.SdkSignature),
        ZakToken: readString(cfg.ZakToken),
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
