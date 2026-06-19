/**
 * @fileoverview `WebexNativeMeetingSdk` — a **real, two-way** {@link IWebexMeetingSdk} binding over a
 * **native Cisco Webex media bot addon** (a headless meeting-bot build with the raw-media send + receive
 * entitlement). Unlike a UI/embedded-app binding, this adapter gives the agent a **voice**:
 * {@link sendAudioFrame} forwards the agent's synthesized PCM to the addon's outbound audio **send** path,
 * and the host controls (chat / mute) actually act on the live meeting.
 *
 * ## Why a native binding
 * Pushing audio *into* a Webex meeting as a server-side bot requires a media-capable bot runtime — the
 * Webex Meetings SDK's raw audio media tracks (or an equivalent media-bot addon) expose an outbound audio
 * **send** API alongside the per-member inbound raw-audio callback, so a single binding carries
 * **bidirectional** audio. This is the binding a two-way "agent talks in the meeting" deployment uses.
 *
 * ## The native module seam (no SDK types leak)
 * The native Webex media bot is delivered as an N-API addon or a local sidecar process exposing the small
 * {@link NativeMeetingModule} surface declared below. This adapter depends ONLY on that structural surface
 * — none of the Webex SDK's real types leak into the package, and the module is loaded **lazily** behind an
 * injectable {@link NativeModuleLoader} so `@memberjunction/ai-bridge-webex` builds and unit-tests with
 * **no addon and no network**. Tests inject a fake module; production points
 * {@link WebexNativeSdkConfig.NativeModuleSpecifier} at the real addon.
 *
 * ## Entitlements + auth (deployment responsibility)
 * The native bot joins with a Webex **bot/OAuth access token** (NOT inline) and needs the media-bot
 * (raw audio send + receive) entitlement on the Webex org. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) and are **never inlined**.
 *
 * Every spot where the native addon's exact surface is assumed carries a `// VERIFY against the native
 * Webex media bot addon` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-webex
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import {
    IWebexMeetingSdk,
    WebexAudioFrame,
    WebexJoinArgs,
    WebexJoinResult,
    WebexParticipant,
    WebexParticipantRole,
} from './webex-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-Webex-media-bot-addon surface this adapter depends on (a local
// structural type so NONE of the SDK's types leak and the package compiles WITHOUT
// the addon installed). VERIFY against the native Webex media bot addon you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One raw per-member audio frame the native addon surfaces (inbound hearing + diarization). */
export interface NativeAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** The Webex member id that produced the audio (the diarization speaker label). */
    participantId: string | number;
    /** The member's display name at capture time, when the addon provides it. */
    displayName?: string;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** One member as the native addon reports it. Mapped onto {@link WebexParticipant}. */
export interface NativeParticipant {
    /** The native member id. */
    participantId: string | number;
    /** The member's display name. */
    displayName?: string;
    /** The member's role as the addon reports it (`host` / `cohost` / `attendee`). */
    role?: string;
    /** Whether this member is the bot itself. */
    isSelf?: boolean;
}

/** The arguments the native addon's `join()` accepts. Mirrors {@link WebexJoinArgs} plus raw-audio opts. */
export interface NativeJoinArgs {
    /** The Webex meeting link the bot joins (the durable join coordinate). */
    meetingLink: string;
    /** The parsed meeting number / SIP address, when resolved upstream. */
    meetingNumber?: string;
    /** The bot's display name in the participant list. */
    displayName: string;
    /** The Webex bot/OAuth access token authorizing the join (resolved upstream; never inline). */
    accessToken?: string;
    /** The Webex site (org) the meeting belongs to, when joining cross-site. */
    siteUrl?: string;
    /** Raw-audio sample rate the bot sends/receives (Hz), when the addon needs it told. */
    sampleRate?: number;
    /** Raw-audio channel count, when the addon needs it told. */
    channels?: number;
}

/** What the native addon's `join()` resolves to. */
export interface NativeJoinResult {
    /** The bot's own member id in the joined meeting. */
    botParticipantId: string | number;
    /** The Webex meeting id the bot joined. */
    meetingId: string;
}

/**
 * The live native-meeting client the addon hands back. The surface closely mirrors {@link IWebexMeetingSdk}
 * but in the addon's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native Webex media bot addon.
 */
export interface NativeMeetingClient {
    /** Joins the meeting (async — the native join handshake is network-bound). */
    join(args: NativeJoinArgs): Promise<NativeJoinResult>;
    /** Leaves the meeting and releases native resources. */
    leave(): Promise<void>;
    /** Sends one raw PCM frame as the bot's outbound audio (the outbound media track — the agent's voice). */
    sendAudioFrame(pcm: ArrayBuffer): void;
    /** Registers the inbound per-member raw-audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeAudioFrame) => void): void;
    /** Registers the member-join callback. */
    onParticipantJoin(cb: (participant: NativeParticipant) => void): void;
    /** Registers the member-leave callback (id of the member that left). */
    onParticipantLeave(cb: (participantId: string | number) => void): void;
    /** Registers the native hand-raise/lower callback. */
    onHandRaise(cb: (participantId: string | number, raised: boolean) => void): void;
    /** Returns the current member roster (including the bot). */
    getParticipants(): Promise<NativeParticipant[]>;
    /** Posts a message to the meeting space chat (everyone). */
    postChatMessage(text: string): Promise<void>;
    /** Mutes a member (requires the bot be host/cohost). */
    muteParticipant(participantId: string | number): Promise<void>;
    /** Registers the meeting-ended callback. */
    onMeetingEnded(cb: () => void): void;
}

/** The native addon module surface — a factory that constructs a {@link NativeMeetingClient}. */
export interface NativeMeetingModule {
    /**
     * Constructs a native meeting client from resolved options (Webex credentials already resolved upstream).
     * VERIFY against the native Webex media bot addon (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeClientOptions): NativeMeetingClient;
}

/** Options passed to {@link NativeMeetingModule.createClient}. Credentials are resolved upstream. */
export interface NativeClientOptions {
    /** The Webex bot/OAuth access token (resolved upstream). */
    AccessToken?: string;
    /** The Webex site (org) url, when joining cross-site (resolved upstream). */
    SiteUrl?: string;
}

/**
 * Resolved configuration for {@link WebexNativeMeetingSdk}. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) — this object carries already-resolved values; **never inline
 * secrets** at a call site.
 */
export interface WebexNativeSdkConfig {
    /** The Webex bot/OAuth access token authorizing the bot's Meetings + Messaging calls (resolved upstream). */
    AccessToken?: string;
    /** The Webex site (org) the meeting belongs to, when joining cross-site (resolved upstream). */
    SiteUrl?: string;
    /** The bot's display name (defaults applied by the bridge when absent). */
    BotDisplayName?: string;
    /** Raw-audio sample rate (Hz) the bot sends/receives. */
    SampleRate?: number;
    /** Raw-audio channel count. */
    Channels?: number;
    /**
     * The module specifier of the native Webex media bot addon/sidecar to load (e.g. an internal N-API addon
     * package name or an absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
}

/**
 * Coerces a `Uint8Array | ArrayBuffer` to a standalone `ArrayBuffer`, **copying** the exact byte window so
 * the result never aliases a larger backing buffer (a view over a pooled buffer would otherwise expose
 * neighboring bytes). Defined locally in this binding (the Webex seam carries raw `ArrayBuffer`s
 * elsewhere), so it does not collide with any other export under `index.ts`'s `export *`.
 */
export function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data;
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

/** Normalizes the addon's free-form role string onto the bridge's {@link WebexParticipantRole}. */
export function mapNativeRole(role?: string): WebexParticipantRole {
    switch ((role ?? '').trim().toLowerCase()) {
        case 'host':
            return 'Host';
        case 'cohost':
        case 'co-host':
            return 'Cohost';
        default:
            return 'Attendee';
    }
}

/**
 * **Pure mapping** of one native member onto the bridge's {@link WebexParticipant}. Isolated from the
 * addon and from I/O so it is unit-tested directly.
 */
export function mapNativeParticipant(p: NativeParticipant): WebexParticipant {
    return {
        ParticipantId: String(p.participantId),
        DisplayName: p.displayName,
        Role: mapNativeRole(p.role),
        IsSelf: p.isSelf,
    };
}

/**
 * **Pure mapping** of one native inbound audio frame onto the bridge's diarized {@link WebexAudioFrame}.
 * Copies the PCM (see {@link toArrayBuffer}) and resolves the speaker label. Isolated for direct testing.
 */
export function mapNativeAudioFrame(frame: NativeAudioFrame): WebexAudioFrame {
    return {
        Pcm: toArrayBuffer(frame.data),
        ParticipantId: String(frame.participantId),
        DisplayName: frame.displayName,
        TimestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : Date.now(),
    };
}

/**
 * The injectable loader for the native Webex media bot addon — overridable so unit tests supply a fake
 * module with no addon and no network. Production leaves it as {@link defaultNativeLoader}, which lazily
 * imports the configured {@link WebexNativeSdkConfig.NativeModuleSpecifier}.
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
 * Lazily loads the native Webex media bot addon at the given specifier (category: runtime plugin discovery
 * from config — the addon path is deployment-supplied and not known at build time, so a static import is
 * impossible). Throws a precise, actionable error when it can't be loaded so a misconfigured deployment
 * fails loudly, not silently.
 *
 * VERIFY against the native Webex media bot addon: the module's default/namespace interop + that it
 * exposes `createClient`.
 */
export const defaultNativeLoader: NativeModuleLoader = async (specifier: string): Promise<NativeMeetingModule> => {
    try {
        // `/* @vite-ignore */`: the specifier is a deployment-supplied, runtime-resolved plugin path (not a
        // build-time constant), so Vite/ESBuild must not try to analyze or pre-bundle it.
        const mod: unknown = await import(/* @vite-ignore */ specifier);
        const resolved = unwrapDefault(mod);
        if (!isNativeModule(resolved)) {
            throw new Error('resolved module has no createClient() factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            `WebexNativeMeetingSdk could not load the native Webex media bot addon at '${specifier}'. Build/install ` +
                'the native Webex media bot addon (the raw-audio send+receive build, media-bot entitled) and set ' +
                `WebexNativeSdkConfig.NativeModuleSpecifier to it. Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link IWebexMeetingSdk} over the native Webex media bot addon (raw-audio send + receive).
 *
 * Gives the agent both **hearing** (per-member inbound audio → diarized {@link WebexAudioFrame}s) and a
 * **voice** ({@link sendAudioFrame} → the native outbound media track), plus working host controls
 * (chat / mute) and roster/hand-raise events. Construct via {@link BindWebexNative} (the factory the
 * bridge's `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire consistently.
 */
export class WebexNativeMeetingSdk implements IWebexMeetingSdk {
    /** Resolved config (credentials + raw-audio + the native module specifier). */
    private readonly config: WebexNativeSdkConfig;

    /** The native-addon module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native client once {@link join} succeeds. */
    private client: NativeMeetingClient | null = null;

    /** The inbound per-member audio handler registered by the bridge. */
    private audioHandler?: (frame: WebexAudioFrame) => void;

    /** The member-join handler. */
    private joinHandler?: (participant: WebexParticipant) => void;

    /** The member-leave handler. */
    private leaveHandler?: (participantId: string) => void;

    /** The hand-raise handler. */
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    /** The meeting-ended handler. */
    private endedHandler?: () => void;

    /**
     * @param config Resolved credentials + raw-audio opts + the native module specifier.
     * @param loadModule The native-addon loader (defaults to the lazy specifier loader).
     */
    constructor(config: WebexNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── IWebexMeetingSdk — lifecycle ─────────────────────────────────────────────────

    /**
     * Loads the native addon, constructs a client, wires its callbacks, and joins the meeting with the
     * resolved Webex access token. Brings BOTH hearing and the agent's voice online.
     *
     * @param args The bridge's join args (meeting link, meeting number, bot name, auth).
     * @returns The bot/meeting identifiers.
     * @throws When the native module specifier is missing or the addon can't be loaded.
     */
    public async join(args: WebexJoinArgs): Promise<WebexJoinResult> {
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'WebexNativeMeetingSdk.join: no NativeModuleSpecifier configured. Set it to the native Webex ' +
                    'media bot addon (raw-audio send+receive build) in the session Configuration. See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createClient({ AccessToken: this.config.AccessToken, SiteUrl: this.config.SiteUrl });
        this.wireClient(client);

        const result = await client.join({
            meetingLink: args.MeetingLink,
            meetingNumber: args.MeetingNumber,
            displayName: args.BotDisplayName || this.config.BotDisplayName || 'AI Agent',
            accessToken: args.AccessToken ?? this.config.AccessToken,
            siteUrl: args.SiteUrl ?? this.config.SiteUrl,
            sampleRate: this.config.SampleRate,
            channels: this.config.Channels,
        });
        this.client = client;

        return {
            BotParticipantId: String(result.botParticipantId),
            MeetingId: result.meetingId || args.MeetingNumber || args.MeetingLink,
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
                LogError(`[WebexNativeMeetingSdk] leave() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    // ── IWebexMeetingSdk — two-way audio (real) ──────────────────────────────────────

    /**
     * Sends one raw PCM frame as the bot's outbound audio — **the agent's real voice into the meeting**,
     * via the native outbound media track. No-ops (without throwing) before {@link join} so an early model
     * frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the meeting.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.client?.sendAudioFrame(pcm);
    }

    /** Registers the inbound per-member audio handler (the diarized hearing path). */
    public onAudioFrame(cb: (frame: WebexAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    // ── IWebexMeetingSdk — roster + signals ──────────────────────────────────────────

    /** Registers the member-join handler. */
    public onParticipantJoin(cb: (participant: WebexParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the member-leave handler. */
    public onParticipantLeave(cb: (participantId: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Registers the native hand-raise/lower handler. */
    public onHandRaise(cb: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = cb;
    }

    /** Returns the current roster from the native client, mapped to {@link WebexParticipant}. */
    public async getParticipants(): Promise<WebexParticipant[]> {
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

    // ── IWebexMeetingSdk — host controls (real) ──────────────────────────────────────

    /**
     * Posts a message to the meeting space chat via the native client. No-ops (without throwing) before
     * {@link join}.
     *
     * @param text The chat message text.
     */
    public async postChatMessage(text: string): Promise<void> {
        await this.client?.postChatMessage(text);
    }

    /**
     * Mutes a member via the native host control (requires the bot be host/cohost). No-ops (without
     * throwing) before {@link join}.
     *
     * @param participantId The member to mute.
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
 * Builds the {@link import('./webex-sdk').WebexMeetingSdkFactory}-shaped factory that constructs a
 * {@link WebexNativeMeetingSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `WebexBridge.SetSdkFactory(...)` so a deployment activates **two-way native Webex audio** without code
 * changes to the driver.
 *
 * Reads the access token / site + raw-audio opts + the native module specifier out of the config map the
 * engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindWebexNative());
 *
 * @param loadModule Optional native-addon loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => WebexNativeMeetingSdk`.
 */
export function BindWebexNative(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => WebexNativeMeetingSdk {
    return (config?: Record<string, unknown>) => new WebexNativeMeetingSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link WebexNativeSdkConfig} from the engine's loosely-typed `Configuration` map without ever
 * widening to `any`. Each field is read + type-checked individually so a malformed config yields a clean,
 * partially-resolved object (and {@link WebexNativeMeetingSdk.join} then throws a precise error if the
 * required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): WebexNativeSdkConfig {
    const cfg = config ?? {};
    return {
        AccessToken: readString(cfg.AccessToken),
        SiteUrl: readString(cfg.SiteUrl),
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
