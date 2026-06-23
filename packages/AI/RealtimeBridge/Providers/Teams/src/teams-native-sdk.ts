/**
 * @fileoverview `TeamsNativeMeetingSdk` — a **real, two-way** {@link ITeamsMeetingSdk} binding over a
 * native **Microsoft Teams real-time-media / calling-bot addon** (the application-hosted-media bot build).
 * Unlike a receive-only or stub binding, this adapter gives the agent a **voice**: {@link sendAudioFrame}
 * forwards the agent's synthesized PCM to the native client's outbound audio-socket **send** path, and the
 * host controls (chat / mute) actually act.
 *
 * ## Why a native binding
 * Pushing audio *into* a Teams meeting and observing per-participant inbound audio requires the
 * application-hosted-media bot model (Azure Communication Services calling-bot + Microsoft Graph
 * cloud-communications API). The native addon exposes both the outbound audio **send** path (the bot's
 * voice) and the per-participant inbound raw-audio receive callback, so a single binding carries
 * **bidirectional** audio. This is the binding a two-way "agent talks in the meeting" deployment uses.
 *
 * ## The native module seam (no SDK types leak)
 * The ACS/Graph calling-bot media stack has **no single official Node real-time-media package** that fits
 * this seam; deployments wrap it as a N-API addon or a local sidecar process exposing the small
 * {@link NativeMeetingModule} surface declared below. This adapter depends ONLY on that structural surface
 * — none of the ACS/Graph SDK's real types leak into the package, and the module is loaded **lazily**
 * behind an injectable {@link NativeModuleLoader} so `@memberjunction/ai-bridge-teams` builds and
 * unit-tests with **no addon and no network**. Tests inject a fake module; production points
 * {@link TeamsNativeSdkConfig.NativeModuleSpecifier} at the real addon.
 *
 * ## Entitlements + auth (deployment responsibility)
 * The native bot needs the Graph cloud-communications **application-hosted media** permissions and joins
 * with an OAuth bearer / application token (the bot's identity in the tenant) — resolved **upstream** (MJ
 * credential system / provider `Configuration`) and **never inlined**. See the package README's
 * "Native two-way audio" section.
 *
 * Every spot where the native addon's exact surface is assumed carries a `// VERIFY against the native
 * Teams real-time-media addon` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-teams
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import {
    ITeamsMeetingSdk,
    TeamsAudioFrame,
    TeamsJoinArgs,
    TeamsJoinResult,
    TeamsParticipant,
    TeamsParticipantRole,
} from './teams-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// Local PCM-coercion helper. The Teams package has no existing `toArrayBuffer`
// export (unlike Zoom, which reuses its RTMS binding's), so we define a
// non-colliding local one (`toPcmArrayBuffer`) to avoid clashing under index.ts's
// `export *`.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Copies arbitrary PCM input (`Uint8Array` view or standalone `ArrayBuffer`) into a fresh, exactly-sized
 * `ArrayBuffer`. Copying (rather than aliasing) protects the bridge from a native buffer the addon may
 * recycle for the next frame, and respects a `Uint8Array`'s byteOffset/byteLength window.
 */
export function toPcmArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data.slice(0);
    }
    const out = new ArrayBuffer(data.byteLength);
    new Uint8Array(out).set(data);
    return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-Teams-media-addon surface this adapter depends on (a local
// structural type so NONE of the ACS/Graph SDK types leak and the package compiles
// WITHOUT the addon installed). VERIFY against the native Teams real-time-media
// addon you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One raw per-participant audio frame the native addon surfaces (inbound hearing + diarization). */
export interface NativeAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** The Teams participant id that produced the audio (the diarization speaker label). */
    participantId: string | number;
    /** The participant's display name at capture time, when the addon provides it. */
    displayName?: string;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** One participant as the native addon reports it. Mapped onto {@link TeamsParticipant}. */
export interface NativeParticipant {
    /** The native participant id. */
    participantId: string | number;
    /** The participant's display name. */
    displayName?: string;
    /** The participant's role as the addon reports it (`organizer` / `presenter` / `attendee`). */
    role?: string;
    /** Whether this participant is the bot itself. */
    isSelf?: boolean;
}

/** The arguments the native addon's `join()` accepts. Mirrors {@link TeamsJoinArgs} plus raw-audio opts. */
export interface NativeJoinArgs {
    /** The Teams meeting join URL (the `https://teams.microsoft.com/l/meetup-join/...` link). */
    joinUrl: string;
    /** The parsed meeting thread id (chat/conversation id behind the join URL), when resolved upstream. */
    threadId?: string;
    /** The bot's display name in the participant list. */
    displayName: string;
    /** The OAuth bearer / application token authorizing the bot's Graph + ACS calls (resolved upstream; never inline). */
    accessToken?: string;
    /** The Azure tenant id the meeting belongs to, when joining cross-tenant. */
    tenantId?: string;
    /** Raw-audio sample rate the bot sends/receives (Hz), when the addon needs it told. */
    sampleRate?: number;
    /** Raw-audio channel count, when the addon needs it told. */
    channels?: number;
}

/** What the native addon's `join()` resolves to. */
export interface NativeJoinResult {
    /** The bot's own participant id in the joined meeting. */
    botParticipantId: string | number;
    /** The Teams call id the bot joined (the durable external connection id). */
    callId: string;
}

/**
 * The live native-meeting client the addon hands back. The surface closely mirrors {@link ITeamsMeetingSdk}
 * but in the addon's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native Teams real-time-media addon.
 */
export interface NativeMeetingClient {
    /** Joins the meeting (async — the native join handshake is network-bound). */
    join(args: NativeJoinArgs): Promise<NativeJoinResult>;
    /** Leaves the meeting and releases native resources. */
    leave(): Promise<void>;
    /** Sends one raw PCM frame as the bot's outbound audio (the outbound audio-socket — the agent's voice). */
    sendAudioFrame(pcm: ArrayBuffer): void;
    /** Registers the inbound per-participant raw-audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeAudioFrame) => void): void;
    /** Registers the participant-join callback. */
    onParticipantJoin(cb: (participant: NativeParticipant) => void): void;
    /** Registers the participant-leave callback (id of the participant that left). */
    onParticipantLeave(cb: (participantId: string | number) => void): void;
    /** Registers the native hand-raise/lower callback (⚠️ partial on Teams). */
    onHandRaise(cb: (participantId: string | number, raised: boolean) => void): void;
    /** Returns the current participant roster (including the bot). */
    getParticipants(): Promise<NativeParticipant[]>;
    /** Posts a message to the Teams meeting chat thread (everyone). */
    postChatMessage(text: string): Promise<void>;
    /** Mutes a participant (requires the bot be organizer/presenter with the relevant policy). */
    muteParticipant(participantId: string | number): Promise<void>;
    /** Registers the meeting-ended callback. */
    onMeetingEnded(cb: () => void): void;
}

/** The native addon module surface — a factory that constructs a {@link NativeMeetingClient}. */
export interface NativeMeetingModule {
    /**
     * Constructs a native meeting client from resolved options (credentials already resolved upstream).
     * VERIFY against the native Teams real-time-media addon (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeClientOptions): NativeMeetingClient;
}

/** Options passed to {@link NativeMeetingModule.createClient}. Credentials are resolved upstream. */
export interface NativeClientOptions {
    /** The bot's Azure AD application (client) id (resolved upstream). */
    AppId?: string;
    /** The Azure tenant id the bot operates in (resolved upstream). */
    TenantId?: string;
    /** A pre-resolved OAuth bearer / application token, when the deployment computes it out-of-band. */
    AccessToken?: string;
}

/**
 * Resolved configuration for {@link TeamsNativeMeetingSdk}. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) — this object carries already-resolved values; **never inline
 * secrets** at a call site.
 */
export interface TeamsNativeSdkConfig {
    /** The bot's Azure AD application (client) id (resolved upstream). */
    AppId?: string;
    /** The Azure tenant id the bot operates in (resolved upstream). */
    TenantId?: string;
    /** A pre-resolved OAuth bearer / application token, when the deployment computes it out-of-band. */
    AccessToken?: string;
    /** The bot's display name (defaults applied by the bridge when absent). */
    BotDisplayName?: string;
    /** Raw-audio sample rate (Hz) the bot sends/receives. */
    SampleRate?: number;
    /** Raw-audio channel count. */
    Channels?: number;
    /**
     * The module specifier of the native Teams real-time-media addon/sidecar to load (e.g. an internal
     * N-API addon package name or an absolute path to a sidecar entry). Required in production; tests
     * inject a loader.
     */
    NativeModuleSpecifier?: string;
}

/** Normalizes the addon's free-form role string onto the bridge's {@link TeamsParticipantRole}. */
export function mapNativeRole(role?: string): TeamsParticipantRole {
    switch ((role ?? '').trim().toLowerCase()) {
        case 'organizer':
            return 'Organizer';
        case 'presenter':
        case 'co-organizer':
        case 'coorganizer':
            return 'Presenter';
        default:
            return 'Attendee';
    }
}

/**
 * **Pure mapping** of one native participant onto the bridge's {@link TeamsParticipant}. Isolated from the
 * addon and from I/O so it is unit-tested directly.
 */
export function mapNativeParticipant(p: NativeParticipant): TeamsParticipant {
    return {
        ParticipantId: String(p.participantId),
        DisplayName: p.displayName,
        Role: mapNativeRole(p.role),
        IsSelf: p.isSelf,
    };
}

/**
 * **Pure mapping** of one native inbound audio frame onto the bridge's diarized {@link TeamsAudioFrame}.
 * Copies the PCM (see {@link toPcmArrayBuffer}) and resolves the speaker label. Isolated for direct testing.
 */
export function mapNativeAudioFrame(frame: NativeAudioFrame): TeamsAudioFrame {
    return {
        Pcm: toPcmArrayBuffer(frame.data),
        ParticipantId: String(frame.participantId),
        DisplayName: frame.displayName,
        TimestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : Date.now(),
    };
}

/**
 * The injectable loader for the native Teams real-time-media addon — overridable so unit tests supply a
 * fake module with no addon and no network. Production leaves it as {@link defaultNativeLoader}, which
 * lazily imports the configured {@link TeamsNativeSdkConfig.NativeModuleSpecifier}.
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
 * Lazily loads the native Teams real-time-media addon at the given specifier (category: runtime plugin
 * discovery from config — the addon path is deployment-supplied and not known at build time). Throws a
 * precise, actionable error when it can't be loaded so a misconfigured deployment fails loudly, not
 * silently.
 *
 * VERIFY against the native Teams real-time-media addon: the module's default/namespace interop + that it
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
            `TeamsNativeMeetingSdk could not load the native Teams real-time-media addon at '${specifier}'. ` +
                'Build/install the native Teams calling-bot addon (the ACS application-hosted-media build, with ' +
                'Graph cloud-communications permissions) and set TeamsNativeSdkConfig.NativeModuleSpecifier to it. ' +
                `Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link ITeamsMeetingSdk} over the native Teams real-time-media addon (outbound audio
 * send + per-participant inbound receive).
 *
 * Gives the agent both **hearing** (per-participant inbound audio → diarized {@link TeamsAudioFrame}s) and
 * a **voice** ({@link sendAudioFrame} → the native outbound audio-socket), plus working host controls
 * (chat / mute) and roster/hand-raise events. Construct via {@link BindTeamsNative} (the factory the
 * bridge's `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire consistently.
 */
export class TeamsNativeMeetingSdk implements ITeamsMeetingSdk {
    /** Resolved config (credentials + raw-audio + the native module specifier). */
    private readonly config: TeamsNativeSdkConfig;

    /** The native-addon module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native client once {@link join} succeeds. */
    private client: NativeMeetingClient | null = null;

    /** The inbound per-participant audio handler registered by the bridge. */
    private audioHandler?: (frame: TeamsAudioFrame) => void;

    /** The participant-join handler. */
    private joinHandler?: (participant: TeamsParticipant) => void;

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
    constructor(config: TeamsNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── ITeamsMeetingSdk — lifecycle ─────────────────────────────────────────────────

    /**
     * Loads the native addon, constructs a client, wires its callbacks, and joins the meeting with the
     * resolved bot token. Brings BOTH hearing and the agent's voice online.
     *
     * @param args The bridge's join args (join URL, thread id, bot name, auth).
     * @returns The bot/call identifiers.
     * @throws When the native module specifier is missing or the addon can't be loaded.
     */
    public async join(args: TeamsJoinArgs): Promise<TeamsJoinResult> {
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'TeamsNativeMeetingSdk.join: no NativeModuleSpecifier configured. Set it to the native Teams ' +
                    'real-time-media bot addon (ACS application-hosted-media build) in the session Configuration. ' +
                    'See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createClient({
            AppId: this.config.AppId,
            TenantId: this.config.TenantId,
            AccessToken: this.config.AccessToken,
        });
        this.wireClient(client);

        const result = await client.join({
            joinUrl: args.JoinUrl,
            threadId: args.ThreadId,
            displayName: args.BotDisplayName || this.config.BotDisplayName || 'AI Agent',
            accessToken: args.AccessToken ?? this.config.AccessToken,
            tenantId: args.TenantId ?? this.config.TenantId,
            sampleRate: this.config.SampleRate,
            channels: this.config.Channels,
        });
        this.client = client;

        return {
            BotParticipantId: String(result.botParticipantId),
            CallId: result.callId || args.ThreadId || args.JoinUrl,
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
                LogError(`[TeamsNativeMeetingSdk] leave() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    // ── ITeamsMeetingSdk — two-way audio (real) ──────────────────────────────────────

    /**
     * Sends one raw PCM frame as the bot's outbound audio — **the agent's real voice into the meeting**,
     * via the native outbound audio-socket. No-ops (without throwing) before {@link join} so an early
     * model frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the meeting.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.client?.sendAudioFrame(pcm);
    }

    /** Registers the inbound per-participant audio handler (the diarized hearing path). */
    public onAudioFrame(cb: (frame: TeamsAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    // ── ITeamsMeetingSdk — roster + signals ──────────────────────────────────────────

    /** Registers the participant-join handler. */
    public onParticipantJoin(cb: (participant: TeamsParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the participant-leave handler. */
    public onParticipantLeave(cb: (participantId: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Registers the native hand-raise/lower handler (⚠️ partial on Teams; tolerant of never firing). */
    public onHandRaise(cb: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = cb;
    }

    /** Returns the current roster from the native client, mapped to {@link TeamsParticipant}. */
    public async getParticipants(): Promise<TeamsParticipant[]> {
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

    // ── ITeamsMeetingSdk — host controls (real) ──────────────────────────────────────

    /**
     * Posts a message to the Teams meeting chat via the native client. No-ops (without throwing) before
     * {@link join}.
     *
     * @param text The chat message text.
     */
    public async postChatMessage(text: string): Promise<void> {
        await this.client?.postChatMessage(text);
    }

    /**
     * Mutes a participant via the native host control (requires the bot be organizer/presenter). No-ops
     * (without throwing) before {@link join}.
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
 * Builds the {@link import('./teams-sdk').TeamsMeetingSdkFactory}-shaped factory that constructs a
 * {@link TeamsNativeMeetingSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `TeamsBridge.SetSdkFactory(...)` so a deployment activates **two-way native Teams audio** without code
 * changes to the driver.
 *
 * Reads bot credentials / token + raw-audio opts + the native module specifier out of the config map the
 * engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindTeamsNative());
 *
 * @param loadModule Optional native-addon loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => TeamsNativeMeetingSdk`.
 */
export function BindTeamsNative(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => TeamsNativeMeetingSdk {
    return (config?: Record<string, unknown>) => new TeamsNativeMeetingSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link TeamsNativeSdkConfig} from the engine's loosely-typed `Configuration` map without ever
 * widening to `any`. Each field is read + type-checked individually so a malformed config yields a clean,
 * partially-resolved object (and {@link TeamsNativeMeetingSdk.join} then throws a precise error if the
 * required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): TeamsNativeSdkConfig {
    const cfg = config ?? {};
    return {
        AppId: readString(cfg.AppId),
        TenantId: readString(cfg.TenantId),
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
