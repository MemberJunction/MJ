/**
 * @fileoverview `DiscordNativeMeetingSdk` — a **real, two-way** {@link IDiscordVoiceSdk} binding over a
 * **native Discord voice-gateway addon** (the `@discordjs/voice`-style voice connection + Opus receiver/player,
 * plus the `discord.js`-style gateway client for member presence + text-channel posts). Unlike the in-memory
 * `FakeDiscordVoiceSdk` used in tests, this adapter actually drives a live voice channel: the agent **hears**
 * (per-user inbound Opus/PCM → diarized {@link DiscordAudioFrame}s) AND has a **voice**
 * ({@link sendAudioFrame} forwards the agent's synthesized PCM to the native voice-connection send path),
 * plus working member controls (text-channel chat / mute) and roster events.
 *
 * ## Why a native binding (and why it is voice-CHANNEL based)
 * Discord has no scheduled meeting + invite-link concept (see {@link import('./discord-sdk')}). A bot
 * **joins a persistent VOICE CHANNEL** (a guild + channel id) on demand over the gateway, then streams
 * audio over a UDP voice connection. Pushing audio *into* the channel requires the native voice connection's
 * audio-player send path; receiving per-user audio for diarization requires its Opus receiver. A single
 * native binding carries both directions — this is the binding a two-way "agent talks in the channel"
 * deployment uses.
 *
 * ## The native module seam (no SDK types leak)
 * `@discordjs/voice` + `discord.js` are wrapped by the deployment as a small N-API / sidecar surface
 * exposing the structural {@link NativeMeetingModule} declared below. This adapter depends ONLY on that
 * structural surface — none of the discord.js / @discordjs/voice real types leak into the package, and the
 * module is loaded **lazily** behind an injectable {@link NativeModuleLoader} so `@memberjunction/ai-bridge-discord`
 * builds and unit-tests with **no addon and no network**. Tests inject a fake module; production points
 * {@link DiscordNativeSdkConfig.NativeModuleSpecifier} at the real addon.
 *
 * ## Auth (deployment responsibility)
 * The native bot connects to the gateway with a **bot token** (and, for some addons, an application id).
 * Credentials resolve **upstream** (MJ credential system / provider `Configuration`) and are **never
 * inlined** at a call site. See the package README's "Native two-way audio" section.
 *
 * Every spot where the native addon's exact surface is assumed carries a `// VERIFY against the native
 * Discord voice addon` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-discord
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import {
    IDiscordVoiceSdk,
    DiscordAudioFrame,
    DiscordJoinArgs,
    DiscordJoinResult,
    DiscordMember,
    DiscordMemberRole,
} from './discord-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-Discord-voice-addon surface this adapter depends on (a local
// structural type so NONE of the discord.js / @discordjs/voice types leak and the
// package compiles WITHOUT the addon installed). VERIFY against the native Discord
// voice addon you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One raw per-user audio frame the native addon surfaces (inbound hearing + diarization). */
export interface NativeVoiceAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`; decoded from Opus by the addon). */
    data: Uint8Array | ArrayBuffer;
    /** The Discord user (snowflake) id that produced the audio — the diarization speaker label. */
    userId: string | number;
    /** The member's display name (guild nickname / username) at capture time, when the addon provides it. */
    displayName?: string;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** One voice-channel member as the native addon reports it. Mapped onto {@link DiscordMember}. */
export interface NativeVoiceMember {
    /** The Discord user (snowflake) id. */
    userId: string | number;
    /** The member's display name (guild nickname / username). */
    displayName?: string;
    /** The member's role as the addon reports it (`host`/`owner`/`admin` → Host, `moderator` → CoHost, else Participant). */
    role?: string;
    /** Whether this member is the bot itself. */
    isSelf?: boolean;
}

/** The arguments the native addon's `joinVoiceChannel()` accepts. Mirrors {@link DiscordJoinArgs} plus audio opts. */
export interface NativeVoiceJoinArgs {
    /** The Discord guild (server) id that owns the voice channel. */
    guildId: string;
    /** The Discord voice-channel id to join. */
    voiceChannelId: string;
    /** The bot's display name / nickname in the member list. */
    displayName: string;
    /** The resolved bot token authorizing the gateway connection (resolved upstream; never inline). */
    botToken?: string;
    /** Raw-audio sample rate the bot sends/receives (Hz), when the addon needs it told. */
    sampleRate?: number;
    /** Raw-audio channel count, when the addon needs it told. */
    channels?: number;
}

/** What the native addon's `joinVoiceChannel()` resolves to. */
export interface NativeVoiceJoinResult {
    /** The bot's own Discord user id in the joined voice channel. */
    botUserId: string | number;
    /** The Discord voice-channel id the bot joined (the durable external connection id). */
    voiceChannelId: string;
}

/**
 * The live native-voice client the addon hands back. The surface closely mirrors {@link IDiscordVoiceSdk}
 * but in the addon's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native Discord voice addon.
 */
export interface NativeVoiceClient {
    /** Joins the voice channel (async — the gateway + UDP voice handshake is network-bound). */
    joinVoiceChannel(args: NativeVoiceJoinArgs): Promise<NativeVoiceJoinResult>;
    /** Leaves the voice channel and releases the voice connection + gateway resources. */
    leaveVoiceChannel(): Promise<void>;
    /** Sends one raw PCM frame as the bot's outbound audio (the audio-player send path — the agent's voice). */
    sendAudioFrame(pcm: ArrayBuffer): void;
    /** Registers the inbound per-user raw-audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeVoiceAudioFrame) => void): void;
    /** Registers the member-join callback. */
    onMemberJoin(cb: (member: NativeVoiceMember) => void): void;
    /** Registers the member-leave callback (id of the member that left). */
    onMemberLeave(cb: (userId: string | number) => void): void;
    /** Returns the current voice-channel member roster (including the bot). */
    getMembers(): Promise<NativeVoiceMember[]>;
    /** Posts a message to the associated text channel (everyone). */
    postChatMessage(text: string): Promise<void>;
    /** Mutes a member (requires the bot have the guild's "Mute Members" permission). */
    muteMember(userId: string | number): Promise<void>;
    /** Registers the voice-connection-dropped callback (channel deleted, kicked, gateway disconnect). */
    onDisconnect(cb: () => void): void;
}

/** The native addon module surface — a factory that constructs a {@link NativeVoiceClient}. */
export interface NativeMeetingModule {
    /**
     * Constructs a native voice client from resolved options (bot credentials already resolved upstream).
     * VERIFY against the native Discord voice addon (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeClientOptions): NativeVoiceClient;
}

/** Options passed to {@link NativeMeetingModule.createClient}. Credentials are resolved upstream. */
export interface NativeClientOptions {
    /** The Discord bot token (resolved upstream) authorizing the gateway connection. */
    BotToken?: string;
    /** The Discord application (client) id, when the addon needs it to construct the gateway client. */
    ApplicationId?: string;
}

/**
 * Resolved configuration for {@link DiscordNativeMeetingSdk}. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) — this object carries already-resolved values; **never inline secrets**
 * at a call site.
 */
export interface DiscordNativeSdkConfig {
    /** The Discord bot token (resolved upstream). Authorizes the gateway connection. */
    BotToken?: string;
    /** The Discord application (client) id, when the addon needs it. */
    ApplicationId?: string;
    /** The bot's display name / nickname (defaults applied by the bridge when absent). */
    BotDisplayName?: string;
    /** Raw-audio sample rate (Hz) the bot sends/receives. */
    SampleRate?: number;
    /** Raw-audio channel count. */
    Channels?: number;
    /**
     * The module specifier of the native voice addon/sidecar to load (e.g. an internal N-API addon package
     * name or an absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
}

/**
 * Coerces raw PCM bytes (a `Uint8Array` view or a standalone `ArrayBuffer`) into a freshly-copied
 * `ArrayBuffer` over exactly this frame's bytes — never aliasing the addon's reused capture window. Defined
 * (and exported) here because the Discord package has no other PCM-coercion helper to reuse (the seam's own
 * {@link DiscordAudioFrame.Pcm} is already an `ArrayBuffer`); kept a single export so it does not collide
 * under `index.ts`'s `export *`.
 */
export function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data.slice(0);
    }
    // A Uint8Array may be a view over a larger backing buffer (e.g. a reused capture window); copy exactly
    // this view's bytes into a standalone ArrayBuffer.
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

/** Normalizes the addon's free-form role string onto the bridge's {@link DiscordMemberRole}. */
export function mapNativeRole(role?: string): DiscordMemberRole {
    switch ((role ?? '').trim().toLowerCase()) {
        case 'host':
        case 'owner':
        case 'admin':
            return 'Host';
        case 'cohost':
        case 'co-host':
        case 'moderator':
        case 'mod':
            return 'CoHost';
        default:
            return 'Participant';
    }
}

/**
 * **Pure mapping** of one native member onto the bridge's {@link DiscordMember}. Isolated from the addon and
 * from I/O so it is unit-tested directly.
 */
export function mapNativeMember(m: NativeVoiceMember): DiscordMember {
    return {
        UserId: String(m.userId),
        DisplayName: m.displayName,
        Role: mapNativeRole(m.role),
        IsSelf: m.isSelf,
    };
}

/**
 * **Pure mapping** of one native inbound audio frame onto the bridge's diarized {@link DiscordAudioFrame}.
 * Copies the PCM (see {@link toArrayBuffer}) and resolves the speaker label. Isolated for direct testing.
 */
export function mapNativeAudioFrame(frame: NativeVoiceAudioFrame): DiscordAudioFrame {
    return {
        Pcm: toArrayBuffer(frame.data),
        UserId: String(frame.userId),
        DisplayName: frame.displayName,
        TimestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : Date.now(),
    };
}

/**
 * The injectable loader for the native voice addon — overridable so unit tests supply a fake module with no
 * addon and no network. Production leaves it as {@link defaultNativeLoader}, which lazily imports the
 * configured {@link DiscordNativeSdkConfig.NativeModuleSpecifier}.
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
 * Lazily loads the native voice addon at the given specifier (category: runtime plugin discovery from
 * config — the addon path is deployment-supplied and not known at build time, so a static import cannot
 * name it). Throws a precise, actionable error when it can't be loaded so a misconfigured deployment fails
 * loudly, not silently.
 *
 * VERIFY against the native Discord voice addon: the module's default/namespace interop + that it exposes
 * `createClient`.
 */
export const defaultNativeLoader: NativeModuleLoader = async (specifier: string): Promise<NativeMeetingModule> => {
    try {
        // Runtime plugin discovery from config: the addon specifier is deployment-supplied (not known at
        // build time), so this dynamic import cannot be a static import. `@vite-ignore` stops Vite from
        // trying to pre-bundle a specifier it cannot resolve at build time.
        const mod: unknown = await import(/* @vite-ignore */ specifier);
        const resolved = unwrapDefault(mod);
        if (!isNativeModule(resolved)) {
            throw new Error('resolved module has no createClient() factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            `DiscordNativeMeetingSdk could not load the native Discord voice addon at '${specifier}'. Build/install ` +
                'the native Discord voice bot addon (the @discordjs/voice + discord.js bot build) and set ' +
                `DiscordNativeSdkConfig.NativeModuleSpecifier to it. Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link IDiscordVoiceSdk} over a native Discord voice addon (Opus send + receive).
 *
 * Gives the agent both **hearing** (per-user inbound audio → diarized {@link DiscordAudioFrame}s) and a
 * **voice** ({@link sendAudioFrame} → the native audio-player send path), plus working member controls
 * (chat / mute) and roster events. Construct via {@link BindDiscordNative} (the factory the bridge's
 * `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire consistently.
 */
export class DiscordNativeMeetingSdk implements IDiscordVoiceSdk {
    /** Resolved config (credentials + raw-audio + the native module specifier). */
    private readonly config: DiscordNativeSdkConfig;

    /** The native-addon module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native client once {@link joinVoiceChannel} succeeds. */
    private client: NativeVoiceClient | null = null;

    /** The inbound per-user audio handler registered by the bridge. */
    private audioHandler?: (frame: DiscordAudioFrame) => void;

    /** The member-join handler. */
    private joinHandler?: (member: DiscordMember) => void;

    /** The member-leave handler. */
    private leaveHandler?: (userId: string) => void;

    /** The voice-connection-dropped handler. */
    private disconnectHandler?: () => void;

    /**
     * @param config Resolved credentials + raw-audio opts + the native module specifier.
     * @param loadModule The native-addon loader (defaults to the lazy specifier loader).
     */
    constructor(config: DiscordNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── IDiscordVoiceSdk — lifecycle ─────────────────────────────────────────────────

    /**
     * Loads the native addon, constructs a client, wires its callbacks, and joins the voice channel with
     * the resolved bot token. Brings BOTH hearing and the agent's voice online.
     *
     * @param args The bridge's join args (guild id, voice-channel id, bot name, auth).
     * @returns The bot user + voice-channel identifiers.
     * @throws When the native module specifier is missing or the addon can't be loaded.
     */
    public async joinVoiceChannel(args: DiscordJoinArgs): Promise<DiscordJoinResult> {
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'DiscordNativeMeetingSdk.joinVoiceChannel: no NativeModuleSpecifier configured. Set it to the ' +
                    'native Discord voice bot addon (@discordjs/voice + discord.js build) in the session Configuration. ' +
                    'See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createClient({ BotToken: this.config.BotToken, ApplicationId: this.config.ApplicationId });
        this.wireClient(client);

        const result = await client.joinVoiceChannel({
            guildId: args.GuildId,
            voiceChannelId: args.VoiceChannelId,
            displayName: args.BotDisplayName || this.config.BotDisplayName || 'AI Agent',
            botToken: args.BotToken ?? this.config.BotToken,
            sampleRate: this.config.SampleRate,
            channels: this.config.Channels,
        });
        this.client = client;

        return {
            BotUserId: String(result.botUserId),
            VoiceChannelId: result.voiceChannelId || args.VoiceChannelId,
        };
    }

    /** Leaves the voice channel and releases the native client. Tolerant of teardown errors. */
    public async leaveVoiceChannel(): Promise<void> {
        const client = this.client;
        this.client = null;
        if (client) {
            try {
                await client.leaveVoiceChannel();
            } catch (err) {
                LogError(
                    `[DiscordNativeMeetingSdk] leaveVoiceChannel() failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
    }

    // ── IDiscordVoiceSdk — two-way audio (real) ──────────────────────────────────────

    /**
     * Sends one raw PCM frame as the bot's outbound audio — **the agent's real voice into the channel**,
     * via the native audio-player send path. No-ops (without throwing) before {@link joinVoiceChannel} so an
     * early model frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the channel.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.client?.sendAudioFrame(pcm);
    }

    /** Registers the inbound per-user audio handler (the diarized hearing path). */
    public onAudioFrame(cb: (frame: DiscordAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    // ── IDiscordVoiceSdk — roster + signals ──────────────────────────────────────────

    /** Registers the member-join handler. */
    public onMemberJoin(cb: (member: DiscordMember) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the member-leave handler. */
    public onMemberLeave(cb: (userId: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Returns the current roster from the native client, mapped to {@link DiscordMember}. */
    public async getMembers(): Promise<DiscordMember[]> {
        if (!this.client) {
            return [];
        }
        const natives = await this.client.getMembers();
        return natives.map(mapNativeMember);
    }

    /** Registers the voice-connection-dropped handler. */
    public onDisconnect(cb: () => void): void {
        this.disconnectHandler = cb;
    }

    // ── IDiscordVoiceSdk — member controls (real) ────────────────────────────────────

    /**
     * Posts a message to the associated text channel via the native client. No-ops (without throwing)
     * before {@link joinVoiceChannel}.
     *
     * @param text The chat message text.
     */
    public async postChatMessage(text: string): Promise<void> {
        await this.client?.postChatMessage(text);
    }

    /**
     * Mutes a member via the native control (requires the bot have the guild's "Mute Members" permission).
     * No-ops (without throwing) before {@link joinVoiceChannel}.
     *
     * @param userId The user to mute.
     */
    public async muteMember(userId: string): Promise<void> {
        await this.client?.muteMember(userId);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Wires the native client's callbacks to this adapter's handlers, mapping native shapes to the seam. */
    private wireClient(client: NativeVoiceClient): void {
        client.onAudioFrame((frame) => this.audioHandler?.(mapNativeAudioFrame(frame)));
        client.onMemberJoin((m) => this.joinHandler?.(mapNativeMember(m)));
        client.onMemberLeave((id) => this.leaveHandler?.(String(id)));
        client.onDisconnect(() => this.disconnectHandler?.());
    }
}

/**
 * Builds the {@link import('./discord-sdk').DiscordVoiceSdkFactory}-shaped factory that constructs a
 * {@link DiscordNativeMeetingSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `DiscordBridge.SetSdkFactory(...)` so a deployment activates **two-way native Discord audio** without code
 * changes to the driver.
 *
 * Reads the bot token / application id + raw-audio opts + the native module specifier out of the config map
 * the engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindDiscordNative());
 *
 * @param loadModule Optional native-addon loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => DiscordNativeMeetingSdk`.
 */
export function BindDiscordNative(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => DiscordNativeMeetingSdk {
    return (config?: Record<string, unknown>) => new DiscordNativeMeetingSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link DiscordNativeSdkConfig} from the engine's loosely-typed `Configuration` map without ever
 * widening to `any`. Each field is read + type-checked individually so a malformed config yields a clean,
 * partially-resolved object (and {@link DiscordNativeMeetingSdk.joinVoiceChannel} then throws a precise error
 * if the required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): DiscordNativeSdkConfig {
    const cfg = config ?? {};
    return {
        BotToken: readString(cfg.BotToken),
        ApplicationId: readString(cfg.ApplicationId),
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
