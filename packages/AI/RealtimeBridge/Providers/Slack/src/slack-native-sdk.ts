/**
 * @fileoverview `SlackNativeMeetingSdk` — a **real, two-way** {@link ISlackHuddleSdk} binding over a
 * **native Slack huddle media addon** (the Chime-backed bot-join-with-media build). Unlike a
 * signaling-only adapter, this binding gives the agent a **voice**: {@link sendAudioFrame} forwards the
 * agent's synthesized PCM to the native huddle media **send** path, the inbound per-attendee audio maps
 * to the seam's diarized {@link SlackAudioFrame}, and the huddle controls (chat / mute) actually act.
 *
 * ## 🚨 REAL-API RISK carries over from the seam 🚨
 * Slack does NOT publicly document a supported bot-join-with-media huddle path — huddles run on **Amazon
 * Chime**, so production media access likely requires a Chime-level media pipeline / app-instance and/or
 * an entitlement Slack doesn't surface through its standard developer APIs (see the REAL-API RISK header
 * in {@link import('./slack-sdk')}). This adapter is built **as if** that native media addon exists, so
 * the driver is ready the moment it does; the signaling/chat subset is on firm public-API ground.
 *
 * ## The native module seam (no SDK types leak)
 * The native huddle media addon (the Chime media pipeline wrapper) has **no official Node package**;
 * deployments wrap it as an N-API addon or a local sidecar exposing the small {@link NativeMeetingModule}
 * surface declared below. This adapter depends ONLY on that structural surface — none of the Slack / Chime
 * SDK types leak into the package — and the module loads **lazily** behind an injectable
 * {@link NativeModuleLoader} so `@memberjunction/ai-bridge-slack` builds and unit-tests with **no addon and
 * no network**. Tests inject a fake module; production points
 * {@link SlackNativeSdkConfig.NativeModuleSpecifier} at the real addon.
 *
 * ## Credentials + auth (deployment responsibility)
 * The bot joins with a Slack OAuth bot token (Web API + Events) plus whatever the Chime media pipeline
 * needs. Credentials resolve **upstream** (MJ credential system / provider `Configuration`) and are
 * **never inlined**.
 *
 * Every spot where the native addon's exact surface is assumed carries a `// VERIFY against the native
 * Slack huddle media addon` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-slack
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import {
    ISlackHuddleSdk,
    SlackAudioFrame,
    SlackJoinArgs,
    SlackJoinResult,
    SlackParticipant,
    SlackParticipantRole,
} from './slack-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-huddle-media-addon surface this adapter depends on (a local
// structural type so NONE of the Slack/Chime SDK types leak and the package compiles
// WITHOUT the addon installed). VERIFY against the native Slack huddle media addon you ship.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Coerces a `Uint8Array` view or standalone `ArrayBuffer` into a freshly-copied `ArrayBuffer` sized to the
 * view's window. Copying (rather than aliasing) avoids handing the bridge a buffer whose bytes change
 * underneath it when the native addon recycles its capture buffer. Defined here (the Slack package has no
 * shared PCM helper to reuse) and exported for direct testing.
 */
export function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data;
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

/** One raw per-attendee audio frame the native addon surfaces (inbound hearing + diarization). */
export interface NativeAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** The Slack user id that produced the audio (the diarization speaker label). */
    userId: string | number;
    /** The participant's display name at capture time, when the addon provides it. */
    displayName?: string;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** One huddle participant as the native addon reports it. Mapped onto {@link SlackParticipant}. */
export interface NativeParticipant {
    /** The native Slack user id. */
    userId: string | number;
    /** The participant's display name. */
    displayName?: string;
    /** The participant's role as the addon reports it (`host` / `cohost` / `participant`). */
    role?: string;
    /** Whether this participant is the bot itself. */
    isSelf?: boolean;
}

/** The arguments the native addon's `join()` accepts. Mirrors {@link SlackJoinArgs} plus media opts. */
export interface NativeJoinArgs {
    /** The Slack channel id the huddle is hosted in. */
    channelId: string;
    /** The huddle / huddle-thread id, when resolved upstream. */
    huddleId?: string;
    /** The bot's display name in the participant list. */
    displayName: string;
    /** The OAuth bot token authorizing the Slack Web API + Events calls (resolved upstream; never inline). */
    botToken?: string;
    /** The Slack team / workspace id, when joining a specific workspace (resolved upstream). */
    teamId?: string;
    /** Huddle media sample rate the bot sends/receives (Hz), when the addon needs it told. */
    sampleRate?: number;
    /** Huddle media channel count, when the addon needs it told. */
    channels?: number;
}

/** What the native addon's `join()` resolves to. */
export interface NativeJoinResult {
    /** The bot's own Slack user id in the joined huddle. */
    botUserId: string | number;
    /** The Slack huddle id the bot joined. */
    huddleId: string;
}

/**
 * The live native-huddle client the addon hands back. The surface closely mirrors {@link ISlackHuddleSdk}
 * but in the addon's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native Slack huddle media addon.
 */
export interface NativeMeetingClient {
    /** Joins the huddle (async — the native join + Chime media handshake is network-bound). */
    join(args: NativeJoinArgs): Promise<NativeJoinResult>;
    /** Leaves the huddle and releases native media resources. */
    leave(): Promise<void>;
    /** Sends one raw PCM frame as the bot's outbound audio (the huddle media send path — the agent's voice). */
    sendAudioFrame(pcm: ArrayBuffer): void;
    /** Registers the inbound per-attendee raw-audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeAudioFrame) => void): void;
    /** Registers the participant-join callback. */
    onParticipantJoin(cb: (participant: NativeParticipant) => void): void;
    /** Registers the participant-leave callback (id of the participant that left). */
    onParticipantLeave(cb: (userId: string | number) => void): void;
    /** Registers the native hand-raise/lower callback (partial — may never fire on some workspaces). */
    onHandRaise(cb: (userId: string | number, raised: boolean) => void): void;
    /** Returns the current huddle roster (including the bot). */
    getParticipants(): Promise<NativeParticipant[]>;
    /** Posts a message to the huddle's thread/channel via `chat.postMessage`. */
    postChatMessage(text: string): Promise<void>;
    /** Mutes a participant (subject to the bot holding the relevant authority). */
    muteParticipant(userId: string | number): Promise<void>;
    /** Registers the huddle-ended callback. */
    onMeetingEnded(cb: () => void): void;
}

/** The native addon module surface — a factory that constructs a {@link NativeMeetingClient}. */
export interface NativeMeetingModule {
    /**
     * Constructs a native huddle client from resolved options (credentials already resolved upstream).
     * VERIFY against the native Slack huddle media addon (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeClientOptions): NativeMeetingClient;
}

/** Options passed to {@link NativeMeetingModule.createClient}. Credentials are resolved upstream. */
export interface NativeClientOptions {
    /** The Slack OAuth bot token (resolved upstream). */
    BotToken?: string;
    /** The Slack team / workspace id (resolved upstream). */
    TeamId?: string;
}

/**
 * Resolved configuration for {@link SlackNativeMeetingSdk}. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) — this object carries already-resolved values; **never inline
 * secrets** at a call site.
 */
export interface SlackNativeSdkConfig {
    /** The Slack OAuth bot token (resolved upstream). */
    BotToken?: string;
    /** The Slack team / workspace id (resolved upstream). */
    TeamId?: string;
    /** The Slack channel id the huddle is hosted in (resolved upstream / from the address). */
    ChannelId?: string;
    /** The huddle id, when the deployment resolves it out-of-band. */
    HuddleId?: string;
    /** The bot's display name (defaults applied by the bridge when absent). */
    BotDisplayName?: string;
    /** Huddle media sample rate (Hz) the bot sends/receives. */
    SampleRate?: number;
    /** Huddle media channel count. */
    Channels?: number;
    /**
     * The module specifier of the native huddle media addon/sidecar to load (e.g. an internal N-API addon
     * package name or an absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
}

/** Normalizes the addon's free-form role string onto the bridge's {@link SlackParticipantRole}. */
export function mapNativeRole(role?: string): SlackParticipantRole {
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
 * **Pure mapping** of one native participant onto the bridge's {@link SlackParticipant}. Isolated from the
 * addon and from I/O so it is unit-tested directly.
 */
export function mapNativeParticipant(p: NativeParticipant): SlackParticipant {
    return {
        ParticipantId: String(p.userId),
        DisplayName: p.displayName,
        Role: mapNativeRole(p.role),
        IsSelf: p.isSelf,
    };
}

/**
 * **Pure mapping** of one native inbound audio frame onto the bridge's diarized {@link SlackAudioFrame}.
 * Copies the PCM (see {@link toArrayBuffer}) and resolves the speaker label. Isolated for direct testing.
 */
export function mapNativeAudioFrame(frame: NativeAudioFrame): SlackAudioFrame {
    return {
        Pcm: toArrayBuffer(frame.data),
        ParticipantId: String(frame.userId),
        DisplayName: frame.displayName,
        TimestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : Date.now(),
    };
}

/**
 * The injectable loader for the native huddle media addon — overridable so unit tests supply a fake module
 * with no addon and no network. Production leaves it as {@link defaultNativeLoader}, which lazily imports
 * the configured {@link SlackNativeSdkConfig.NativeModuleSpecifier}.
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
 * Lazily loads the native huddle media addon at the given specifier (category: runtime plugin discovery
 * from config — the addon path is deployment-supplied and not known at build time). Throws a precise,
 * actionable error when it can't be loaded so a misconfigured deployment fails loudly, not silently.
 *
 * VERIFY against the native Slack huddle media addon: the module's default/namespace interop + that it
 * exposes `createClient`.
 */
export const defaultNativeLoader: NativeModuleLoader = async (specifier: string): Promise<NativeMeetingModule> => {
    try {
        // Dynamic import — category 5 (runtime plugin discovery from config): the addon specifier is
        // deployment-supplied and unknown at build time, so a static import is impossible.
        const mod: unknown = await import(/* @vite-ignore */ specifier);
        const resolved = unwrapDefault(mod);
        if (!isNativeModule(resolved)) {
            throw new Error('resolved module has no createClient() factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            `SlackNativeMeetingSdk could not load the native huddle media addon at '${specifier}'. Build/install ` +
                'the native Slack huddle media bot addon (the Chime-backed bot-join-with-media build — see the ' +
                'REAL-API RISK in slack-sdk.ts) and set SlackNativeSdkConfig.NativeModuleSpecifier to it. ' +
                `Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link ISlackHuddleSdk} over the native Slack huddle media addon (Chime-backed
 * send + receive).
 *
 * Gives the agent both **hearing** (per-attendee inbound audio → diarized {@link SlackAudioFrame}s) and a
 * **voice** ({@link sendAudioFrame} → the native huddle media send path), plus working huddle controls
 * (chat / mute) and roster/hand-raise events. Construct via {@link BindSlackNative} (the factory the
 * bridge's `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire consistently.
 */
export class SlackNativeMeetingSdk implements ISlackHuddleSdk {
    /** Resolved config (credentials + media opts + the native module specifier). */
    private readonly config: SlackNativeSdkConfig;

    /** The native-addon module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native client once {@link join} succeeds. */
    private client: NativeMeetingClient | null = null;

    /** The inbound per-attendee audio handler registered by the bridge. */
    private audioHandler?: (frame: SlackAudioFrame) => void;

    /** The participant-join handler. */
    private joinHandler?: (participant: SlackParticipant) => void;

    /** The participant-leave handler. */
    private leaveHandler?: (participantId: string) => void;

    /** The hand-raise handler. */
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    /** The huddle-ended handler. */
    private endedHandler?: () => void;

    /**
     * @param config Resolved credentials + media opts + the native module specifier.
     * @param loadModule The native-addon loader (defaults to the lazy specifier loader).
     */
    constructor(config: SlackNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── ISlackHuddleSdk — lifecycle ──────────────────────────────────────────────────

    /**
     * Loads the native addon, constructs a client, wires its callbacks, and joins the huddle with the
     * resolved bot token. Brings BOTH hearing and the agent's voice online.
     *
     * @param args The bridge's join args (channel id, huddle id, bot name, auth).
     * @returns The bot/huddle identifiers.
     * @throws When the native module specifier is missing or the addon can't be loaded.
     */
    public async join(args: SlackJoinArgs): Promise<SlackJoinResult> {
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'SlackNativeMeetingSdk.join: no NativeModuleSpecifier configured. Set it to the native Slack ' +
                    'huddle media bot addon (Chime-backed bot-join-with-media build) in the session Configuration. ' +
                    'See the REAL-API RISK in slack-sdk.ts and the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createClient({ BotToken: this.config.BotToken, TeamId: this.config.TeamId });
        this.wireClient(client);

        const result = await client.join({
            channelId: args.ChannelId,
            huddleId: args.HuddleId ?? this.config.HuddleId,
            displayName: args.BotDisplayName || this.config.BotDisplayName || 'AI Agent',
            botToken: args.BotToken ?? this.config.BotToken,
            teamId: args.TeamId ?? this.config.TeamId,
            sampleRate: this.config.SampleRate,
            channels: this.config.Channels,
        });
        this.client = client;

        return {
            BotParticipantId: String(result.botUserId),
            HuddleId: result.huddleId || args.HuddleId || this.config.HuddleId || args.ChannelId,
        };
    }

    /** Leaves the huddle and releases the native client. Tolerant of teardown errors. */
    public async leave(): Promise<void> {
        const client = this.client;
        this.client = null;
        if (client) {
            try {
                await client.leave();
            } catch (err) {
                LogError(`[SlackNativeMeetingSdk] leave() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    // ── ISlackHuddleSdk — two-way audio (real) ───────────────────────────────────────

    /**
     * Sends one raw PCM frame as the bot's outbound audio — **the agent's real voice into the huddle**,
     * via the native huddle media send path. No-ops (without throwing) before {@link join} so an early
     * model frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the huddle.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.client?.sendAudioFrame(pcm);
    }

    /** Registers the inbound per-attendee audio handler (the diarized hearing path). */
    public onAudioFrame(cb: (frame: SlackAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    // ── ISlackHuddleSdk — roster + signals ───────────────────────────────────────────

    /** Registers the participant-join handler. */
    public onParticipantJoin(cb: (participant: SlackParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the participant-leave handler. */
    public onParticipantLeave(cb: (participantId: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Registers the native hand-raise/lower handler (partial — may never fire on some workspaces). */
    public onHandRaise(cb: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = cb;
    }

    /** Returns the current roster from the native client, mapped to {@link SlackParticipant}. */
    public async getParticipants(): Promise<SlackParticipant[]> {
        if (!this.client) {
            return [];
        }
        const natives = await this.client.getParticipants();
        return natives.map(mapNativeParticipant);
    }

    /** Registers the huddle-ended handler. */
    public onMeetingEnded(cb: () => void): void {
        this.endedHandler = cb;
    }

    // ── ISlackHuddleSdk — huddle controls (real) ─────────────────────────────────────

    /**
     * Posts a message to the huddle's thread/channel via the native client. No-ops (without throwing)
     * before {@link join}.
     *
     * @param text The chat message text.
     */
    public async postChatMessage(text: string): Promise<void> {
        await this.client?.postChatMessage(text);
    }

    /**
     * Mutes a participant via the native huddle control (subject to the bot's authority). No-ops (without
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
 * Builds the {@link import('./slack-sdk').SlackHuddleSdkFactory}-shaped factory that constructs a
 * {@link SlackNativeMeetingSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `SlackBridge.SetSdkFactory(...)` so a deployment activates **two-way native Slack huddle audio** without
 * code changes to the driver.
 *
 * Reads bot token / team / channel / huddle + media opts + the native module specifier out of the config
 * map the engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindSlackNative());
 *
 * @param loadModule Optional native-addon loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => SlackNativeMeetingSdk`.
 */
export function BindSlackNative(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => SlackNativeMeetingSdk {
    return (config?: Record<string, unknown>) => new SlackNativeMeetingSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link SlackNativeSdkConfig} from the engine's loosely-typed `Configuration` map without ever
 * widening to `any`. Each field is read + type-checked individually so a malformed config yields a clean,
 * partially-resolved object (and {@link SlackNativeMeetingSdk.join} then throws a precise error if the
 * required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): SlackNativeSdkConfig {
    const cfg = config ?? {};
    return {
        BotToken: readString(cfg.BotToken),
        TeamId: readString(cfg.TeamId),
        ChannelId: readString(cfg.ChannelId),
        HuddleId: readString(cfg.HuddleId),
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
