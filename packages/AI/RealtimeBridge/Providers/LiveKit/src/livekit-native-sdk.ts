/**
 * @fileoverview `LiveKitNativeMeetingSdk` — a **real, two-way** {@link ILiveKitRoomSdk} binding over the
 * **native LiveKit server/agents SDK** (the Node room-participant build: `livekit-server-sdk` for token
 * minting + admin, plus a room client such as `@livekit/rtc-node` that publishes/subscribes media). It
 * gives the agent both **hearing** (each remote participant's subscribed audio track → a diarized
 * {@link LiveKitAudioFrame}) and a **voice** ({@link publishAudioFrame} forwards the agent's synthesized
 * PCM onto the bot's published audio track), plus full video/screen publish and the data-channel "chat".
 *
 * ## Why a native binding
 * Publishing audio *into* a LiveKit room requires a real WebRTC participant — there is no receive-only
 * shortcut as there is for some 3rd-party platforms. The native LiveKit room client exposes a
 * publish-track **send** path alongside per-participant subscribed-track **receive** callbacks, so a
 * single binding carries **bidirectional** media. This is the binding a two-way "agent talks in the
 * room" deployment uses.
 *
 * ## The native module seam (no SDK types leak)
 * The real LiveKit Node SDK is loaded **lazily** behind an injectable {@link NativeModuleLoader}, so this
 * package builds and unit-tests with **no SDK installed and no network**. The adapter depends ONLY on the
 * small structural {@link NativeRoomModule} / {@link NativeRoomClient} surface declared below — none of
 * LiveKit's real types leak into the package. Tests inject a fake module; production points
 * {@link LiveKitNativeSdkConfig.NativeModuleSpecifier} at the real room-client wrapper.
 *
 * ## Auth (deployment responsibility)
 * The bot joins with a signed LiveKit **access token** (room name + grants) minted upstream by MJ's
 * token/credential layer from the API **key/secret**. The ws URL + key/secret resolve **upstream** (MJ
 * credential system / provider `Configuration`) and are **never inlined** at a call site. When a
 * pre-signed token is supplied via {@link LiveKitConnectArgs.AccessToken} the adapter forwards it; when a
 * deployment lets the native module mint the token, the resolved key/secret + ws URL are handed to
 * {@link NativeRoomModule.createRoomClient}.
 *
 * Every spot where the native module's exact surface is assumed carries a `// VERIFY against the native
 * LiveKit Node SDK wrapper` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-livekit
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import {
    ILiveKitRoomSdk,
    LiveKitAudioFrame,
    LiveKitConnectArgs,
    LiveKitConnectResult,
    LiveKitParticipant,
    LiveKitParticipantRole,
} from './livekit-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-LiveKit-SDK surface this adapter depends on (a local
// structural type so NONE of the SDK's types leak and the package compiles WITHOUT
// the SDK installed). VERIFY against the native LiveKit Node SDK wrapper you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One subscribed per-participant audio frame the native room client surfaces (inbound hearing + diarization). */
export interface NativeRoomAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** The LiveKit participant identity that produced the audio (the diarization speaker label). */
    participantIdentity: string;
    /** The participant's display name at capture time, when the client provides it. */
    name?: string;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** One participant as the native room client reports it. Mapped onto {@link LiveKitParticipant}. */
export interface NativeRoomParticipant {
    /** The native participant identity (stable, application-assigned). */
    identity: string;
    /** The participant's display name (LiveKit's `name` attribute). */
    name?: string;
    /** The participant's role as the client/metadata reports it (`host` / `cohost` / `participant`). */
    role?: string;
    /** Whether this participant is the bot itself (LiveKit's local participant). */
    isLocal?: boolean;
}

/** The arguments the native room client's `connect()` accepts. Mirrors {@link LiveKitConnectArgs}. */
export interface NativeConnectArgs {
    /** The LiveKit room server ws URL (e.g. `wss://livekit.myorg.com`). Resolved upstream. */
    url: string;
    /** The signed LiveKit access token authorizing the bot to join (resolved upstream; never inline). */
    token: string;
    /** The bot's display name in the participant list. */
    name: string;
}

/** What the native room client's `connect()` resolves to. */
export interface NativeConnectResult {
    /** The bot's own participant identity in the joined room. */
    localIdentity: string;
    /** The LiveKit room name the bot joined. */
    roomName: string;
}

/**
 * The live native room client the module hands back. The surface mirrors {@link ILiveKitRoomSdk} but in
 * the native SDK's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native LiveKit Node SDK wrapper.
 */
export interface NativeRoomClient {
    /** Connects to the room (async — the native connect handshake is network-bound). */
    connect(args: NativeConnectArgs): Promise<NativeConnectResult>;
    /** Disconnects from the room and releases native resources. */
    disconnect(): Promise<void>;
    /** Publishes one raw PCM frame on the bot's audio track (the agent's voice). */
    publishAudio(pcm: ArrayBuffer): void;
    /** Drops all pending/queued outbound audio — flushes the agent's voice on barge-in. */
    flushOutbound(): void;
    /** Publishes one raw frame on the bot's camera/video track. */
    publishVideo(frame: ArrayBuffer): void;
    /** Publishes one raw frame on the bot's screen-share track. */
    publishScreen(frame: ArrayBuffer): void;
    /** Registers the inbound per-participant subscribed-audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeRoomAudioFrame) => void): void;
    /** Registers the participant-connected callback. */
    onParticipantConnected(cb: (participant: NativeRoomParticipant) => void): void;
    /** Registers the participant-disconnected callback (identity of the participant that left). */
    onParticipantDisconnected(cb: (participantIdentity: string) => void): void;
    /** Returns the current participant roster (including the bot). */
    getParticipants(): Promise<NativeRoomParticipant[]>;
    /** Publishes a reliable message on the room data channel (the room-native "chat"). */
    publishData(text: string): Promise<void>;
    /** Registers the room-disconnected callback (SFU closed / the bot was removed). */
    onDisconnected(cb: () => void): void;
}

/** The native room module surface — a factory that constructs a {@link NativeRoomClient}. */
export interface NativeRoomModule {
    /**
     * Constructs a native room client from resolved options (credentials already resolved upstream).
     * VERIFY against the native LiveKit Node SDK wrapper (`createRoomClient` vs a `Room` constructor).
     */
    createRoomClient(options: NativeRoomClientOptions): NativeRoomClient;
}

/** Options passed to {@link NativeRoomModule.createRoomClient}. Credentials are resolved upstream. */
export interface NativeRoomClientOptions {
    /** The LiveKit room server ws URL (resolved upstream). */
    Url?: string;
    /** The LiveKit API key (resolved upstream; used to mint the join token when not pre-signed). */
    ApiKey?: string;
    /** The LiveKit API secret (resolved upstream). Used only to sign the join token. */
    ApiSecret?: string;
    /**
     * PCM rate (Hz) the agent's model CONSUMES — the rate inbound room audio is resampled to. Default 24000
     * (OpenAI); Gemini Live = 16000. A wrapper that ignores this stays on its constructed default.
     */
    InboundSampleRate?: number;
    /** PCM rate (Hz) the agent's model EMITS — the bot's published voice-track rate. Default 24000. */
    OutboundSampleRate?: number;
}

/**
 * Resolved configuration for {@link LiveKitNativeMeetingSdk}. Credentials resolve **upstream** (MJ
 * credential system / provider `Configuration`) — this object carries already-resolved values; **never
 * inline secrets** at a call site.
 */
export interface LiveKitNativeSdkConfig {
    /** The LiveKit room server ws URL (resolved upstream). */
    Url?: string;
    /** The LiveKit API key (resolved upstream). Used to mint the join token when not pre-signed. */
    ApiKey?: string;
    /** The LiveKit API secret (resolved upstream). Used only to sign the join token. */
    ApiSecret?: string;
    /** A pre-signed LiveKit access token, when the deployment mints it out-of-band instead of via key/secret. */
    AccessToken?: string;
    /** The bot's display name (defaults applied by the bridge when absent). */
    BotDisplayName?: string;
    /**
     * The module specifier of the native LiveKit room-client wrapper to load (e.g. an internal wrapper
     * package name or an absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
    /**
     * PCM rate (Hz) the agent's realtime model **consumes** — the rate inbound room audio is resampled to
     * before reaching the model. Threaded from the model via the engine (`IRealtimeSession.InputSampleRate`).
     * Default 24000 (OpenAI); Gemini Live = 16000. Mismatch = the agent never hears the user on the bridge.
     */
    InboundSampleRate?: number;
    /** PCM rate (Hz) the agent's model **emits** — the bot's published voice track rate. Default 24000. */
    OutboundSampleRate?: number;
}

/** Normalizes the native client's free-form role string onto the seam's {@link LiveKitParticipantRole}. */
export function mapNativeRole(role?: string): LiveKitParticipantRole {
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
 * **Pure mapping** of one native participant onto the seam's {@link LiveKitParticipant}. Isolated from the
 * native client and from I/O so it is unit-tested directly.
 */
export function mapNativeParticipant(p: NativeRoomParticipant): LiveKitParticipant {
    return {
        Identity: String(p.identity),
        DisplayName: p.name,
        Role: mapNativeRole(p.role),
        IsLocal: p.isLocal,
    };
}

/**
 * Coerces a `Uint8Array` view or `ArrayBuffer` into a standalone `ArrayBuffer`, **copying** the exact
 * window of a view (so the result never aliases a larger backing buffer). The LiveKit package has no
 * pre-existing PCM-coercion helper to reuse, so this is defined here; it is the single such export.
 */
export function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data;
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

/**
 * **Pure mapping** of one native inbound audio frame onto the seam's diarized {@link LiveKitAudioFrame}.
 * Copies the PCM (see {@link toArrayBuffer}) and resolves the speaker label. Isolated for direct testing.
 */
export function mapNativeAudioFrame(frame: NativeRoomAudioFrame): LiveKitAudioFrame {
    return {
        Pcm: toArrayBuffer(frame.data),
        ParticipantIdentity: String(frame.participantIdentity),
        DisplayName: frame.name,
        TimestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : Date.now(),
    };
}

/**
 * The injectable loader for the native LiveKit room module — overridable so unit tests supply a fake
 * module with no SDK and no network. Production leaves it as {@link defaultNativeLoader}, which lazily
 * imports the configured {@link LiveKitNativeSdkConfig.NativeModuleSpecifier}.
 */
export type NativeModuleLoader = (specifier: string) => Promise<NativeRoomModule>;

/** Structural guard: a value is a {@link NativeRoomModule} when it exposes a `createRoomClient` function. */
function isNativeModule(value: unknown): value is NativeRoomModule {
    return (
        value != null &&
        typeof value === 'object' &&
        typeof (value as { createRoomClient?: unknown }).createRoomClient === 'function'
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
 * Lazily loads the native LiveKit room module at the given specifier (category: runtime plugin discovery
 * from config — the wrapper path is deployment-supplied and not known at build time, hence the
 * `@vite-ignore` on the dynamic import). Throws a precise, actionable error when it can't be loaded so a
 * misconfigured deployment fails loudly, not silently.
 *
 * VERIFY against the native LiveKit Node SDK wrapper: the module's default/namespace interop + that it
 * exposes `createRoomClient`.
 */
export const defaultNativeLoader: NativeModuleLoader = async (specifier: string): Promise<NativeRoomModule> => {
    try {
        const mod: unknown = await import(/* @vite-ignore */ specifier);
        const resolved = unwrapDefault(mod);
        if (!isNativeModule(resolved)) {
            throw new Error('resolved module has no createRoomClient() factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            `LiveKitNativeMeetingSdk could not load the native LiveKit room module at '${specifier}'. Build/install ` +
                'the native LiveKit Node room-client wrapper (livekit-server-sdk + a room client like @livekit/rtc-node) ' +
                `and set LiveKitNativeSdkConfig.NativeModuleSpecifier to it. Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link ILiveKitRoomSdk} over the native LiveKit Node room SDK (publish + subscribe).
 *
 * Gives the agent both **hearing** (per-participant subscribed audio → diarized {@link LiveKitAudioFrame}s)
 * and a **voice** ({@link publishAudioFrame} → the native publish path), plus working video/screen publish,
 * the data-channel chat, and roster events. Construct via {@link BindLiveKitNative} (the factory the
 * bridge's `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire consistently.
 */
export class LiveKitNativeMeetingSdk implements ILiveKitRoomSdk {
    /** Resolved config (credentials + the native module specifier). */
    private readonly config: LiveKitNativeSdkConfig;

    /** The native-module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native room client once {@link connect} succeeds. */
    private client: NativeRoomClient | null = null;

    /** The inbound per-participant audio handler registered by the bridge. */
    private audioHandler?: (frame: LiveKitAudioFrame) => void;

    /** The participant-join handler. */
    private joinHandler?: (participant: LiveKitParticipant) => void;

    /** The participant-leave handler. */
    private leaveHandler?: (participantIdentity: string) => void;

    /** The room-disconnected handler. */
    private disconnectedHandler?: () => void;

    /**
     * @param config Resolved credentials + the native module specifier.
     * @param loadModule The native-module loader (defaults to the lazy specifier loader).
     */
    constructor(config: LiveKitNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── ILiveKitRoomSdk — lifecycle ──────────────────────────────────────────────────

    /**
     * Loads the native module, constructs a room client, wires its callbacks, and connects to the room
     * with the resolved access token. Brings BOTH hearing and the agent's voice online.
     *
     * @param args The bridge's connect args (room ws URL, signed access token, bot name).
     * @returns The bot/room identifiers.
     * @throws When the native module specifier is missing or the module can't be loaded.
     */
    public async connect(args: LiveKitConnectArgs): Promise<LiveKitConnectResult> {
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'LiveKitNativeMeetingSdk.connect: no NativeModuleSpecifier configured. Set it to the native LiveKit ' +
                    'Node room-client wrapper in the session Configuration. See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createRoomClient({
            Url: args.RoomUrl || this.config.Url,
            ApiKey: this.config.ApiKey,
            ApiSecret: this.config.ApiSecret,
            // The model's audio format (threaded from IRealtimeSession via the engine) — so inbound room
            // audio is resampled to what the model consumes (OpenAI 24 kHz; Gemini Live 16 kHz).
            InboundSampleRate: this.config.InboundSampleRate,
            OutboundSampleRate: this.config.OutboundSampleRate,
        });
        this.wireClient(client);

        const result = await client.connect({
            url: args.RoomUrl || this.config.Url || '',
            token: args.AccessToken || this.config.AccessToken || '',
            name: args.BotDisplayName || this.config.BotDisplayName || 'AI Agent',
        });
        this.client = client;

        return {
            BotIdentity: String(result.localIdentity),
            RoomName: result.roomName,
        };
    }

    /** Disconnects from the room and releases the native client. Tolerant of teardown errors. */
    public async disconnect(): Promise<void> {
        const client = this.client;
        this.client = null;
        if (client) {
            try {
                await client.disconnect();
            } catch (err) {
                LogError(
                    `[LiveKitNativeMeetingSdk] disconnect() failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
    }

    // ── ILiveKitRoomSdk — two-way media (real) ───────────────────────────────────────

    /**
     * Publishes one raw PCM frame on the bot's audio track — **the agent's real voice into the room**, via
     * the native publish path. No-ops (without throwing) before {@link connect} so an early model frame
     * never crashes the session.
     *
     * @param pcm The PCM audio bytes to publish into the room.
     */
    public publishAudioFrame(pcm: ArrayBuffer): void {
        this.client?.publishAudio(pcm);
    }

    /** Flushes the agent's queued outbound audio (barge-in). No-ops before connect. */
    public flushOutboundAudio(): void {
        this.client?.flushOutbound();
    }

    /**
     * Publishes one raw video frame on the bot's camera track via the native publish path. No-ops before
     * {@link connect}.
     *
     * @param frame The video frame bytes to publish.
     */
    public publishVideoFrame(frame: ArrayBuffer): void {
        this.client?.publishVideo(frame);
    }

    /**
     * Publishes one raw screen-share frame on the bot's screen track via the native publish path. No-ops
     * before {@link connect}.
     *
     * @param frame The screen frame bytes to publish.
     */
    public publishScreenFrame(frame: ArrayBuffer): void {
        this.client?.publishScreen(frame);
    }

    /** Registers the inbound per-participant audio handler (the diarized hearing path). */
    public onAudioTrack(cb: (frame: LiveKitAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    // ── ILiveKitRoomSdk — roster + signals ───────────────────────────────────────────

    /** Registers the participant-join handler. */
    public onParticipantJoin(cb: (participant: LiveKitParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the participant-leave handler. */
    public onParticipantLeave(cb: (participantIdentity: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Returns the current roster from the native client, mapped to {@link LiveKitParticipant}. */
    public async getParticipants(): Promise<LiveKitParticipant[]> {
        if (!this.client) {
            return [];
        }
        const natives = await this.client.getParticipants();
        return natives.map(mapNativeParticipant);
    }

    /** Registers the room-disconnected handler. */
    public onDisconnected(cb: () => void): void {
        this.disconnectedHandler = cb;
    }

    // ── ILiveKitRoomSdk — data channel (real) ────────────────────────────────────────

    /**
     * Sends a reliable text message on the room data channel via the native client — the room-native
     * "chat". No-ops (without throwing) before {@link connect}.
     *
     * @param text The data/chat message text.
     */
    public async sendDataMessage(text: string): Promise<void> {
        await this.client?.publishData(text);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Wires the native client's callbacks to this adapter's handlers, mapping native shapes to the seam. */
    private wireClient(client: NativeRoomClient): void {
        client.onAudioFrame((frame) => this.audioHandler?.(mapNativeAudioFrame(frame)));
        client.onParticipantConnected((p) => this.joinHandler?.(mapNativeParticipant(p)));
        client.onParticipantDisconnected((id) => this.leaveHandler?.(String(id)));
        client.onDisconnected(() => this.disconnectedHandler?.());
    }
}

/**
 * Builds the {@link import('./livekit-sdk').LiveKitRoomSdkFactory}-shaped factory that constructs a
 * {@link LiveKitNativeMeetingSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `LiveKitBridge.SetSdkFactory(...)` so a deployment activates **two-way native LiveKit media** without
 * code changes to the driver.
 *
 * Reads the ws URL / API key/secret / pre-signed token + bot name + the native module specifier out of
 * the config map the engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindLiveKitNative());
 *
 * @param loadModule Optional native-module loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => LiveKitNativeMeetingSdk`.
 */
export function BindLiveKitNative(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => LiveKitNativeMeetingSdk {
    return (config?: Record<string, unknown>) => new LiveKitNativeMeetingSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link LiveKitNativeSdkConfig} from the engine's loosely-typed `Configuration` map without
 * ever widening to `any`. Each field is read + type-checked individually so a malformed config yields a
 * clean, partially-resolved object (and {@link LiveKitNativeMeetingSdk.connect} then throws a precise
 * error if the required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): LiveKitNativeSdkConfig {
    const cfg = config ?? {};
    return {
        Url: readString(cfg.Url),
        ApiKey: readString(cfg.ApiKey),
        ApiSecret: readString(cfg.ApiSecret),
        AccessToken: readString(cfg.AccessToken),
        BotDisplayName: readString(cfg.BotDisplayName),
        NativeModuleSpecifier: readString(cfg.NativeModuleSpecifier),
        InboundSampleRate: readNumber(cfg.InboundSampleRate),
        OutboundSampleRate: readNumber(cfg.OutboundSampleRate),
    };
}

/** Reads a value as a non-empty string, or `undefined`. */
function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Reads a positive finite number from a free-form config value, or `undefined`. */
function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}
