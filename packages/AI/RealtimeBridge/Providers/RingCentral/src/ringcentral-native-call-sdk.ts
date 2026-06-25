/**
 * @fileoverview `RingCentralNativeCallSdk` — a **real, two-way** {@link ITelephonyCallSdk} binding over the
 * native **RingCentral RingCX / Voice media-stream** path. Unlike the unbound {@link RingCentralCallSdk}
 * shipped by default (whose every operation throws "bind the real RingCentral client"), this adapter is a
 * fully-wired telephony seam: {@link RingCentralNativeCallSdk.sendAudioFrame} forwards the agent's
 * synthesized PCM onto the native media **send** path (the agent's voice into the call), inbound media maps
 * to the seam's audio frame (what the agent hears), and DTMF / transfer / hangup / lifecycle each reach the
 * native client.
 *
 * ## Why a native binding
 * RingCentral's Call Control REST API supervises a call (place / answer / transfer / hang up) but the
 * **bidirectional realtime audio** rides a separate **media stream** (RingCX / Voice media gateway). A
 * two-way "agent talks on the phone" deployment needs both the outbound media **send** leg AND the inbound
 * media **receive** leg on the live telephony session — exactly what this binding wires onto the
 * platform-agnostic {@link ITelephonyCallSdk} the {@link import('./ringcentral-bridge').RingCentralBridge}
 * drives.
 *
 * ## The native module seam (no SDK types leak)
 * The native RingCentral media gateway is reached through a deployment-supplied module (an N-API addon or a
 * local sidecar exposing the small {@link NativeCallModule} surface declared below). This adapter depends
 * ONLY on that structural surface — none of the real `@ringcentral/sdk` / media-gateway types leak into the
 * package, and the module is loaded **lazily** behind an injectable {@link NativeModuleLoader} so
 * `@memberjunction/ai-bridge-ringcentral` builds and unit-tests with **no addon and no network**. Tests
 * inject a fake module; production points {@link RingCentralNativeCallConfig.NativeModuleSpecifier} at the
 * real addon.
 *
 * ## Credentials + auth (deployment responsibility)
 * The native client authenticates with RingCentral app credentials (clientId / clientSecret / JWT). Those
 * resolve **upstream** (MJ credential system / provider `Configuration`) and are **never inlined** at a call
 * site — {@link readNativeConfig} extracts already-resolved values and {@link BindRingCentralNativeCall}
 * passes them to the native client factory.
 *
 * Every spot where the native addon's exact surface is assumed carries a `// VERIFY against the native
 * RingCentral media gateway` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 * @see {@link ITelephonyCallSdk} — the platform-agnostic telephony seam this binds.
 */

import { LogError } from '@memberjunction/core';
import { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-RingCentral-media-gateway surface this adapter depends on (a
// local structural type so NONE of the SDK's types leak and the package compiles
// WITHOUT the addon installed). VERIFY against the native RingCentral media gateway
// addon you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One raw inbound audio frame the native media gateway surfaces (what the agent hears). */
export interface NativeCallAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** The arguments the native gateway's outbound `dial()` accepts. */
export interface NativeDialArgs {
    /** The destination phone number to dial (E.164 recommended). */
    toNumber: string;
    /** The agent's RingCentral DID / caller-id the call originates from. */
    fromNumber: string;
    /** Provider-specific dial options (account/extension id, subscription URL, recording flags, …). */
    options?: Record<string, unknown>;
}

/**
 * The live native call client the addon hands back for one telephony session. The surface mirrors the
 * call-shaped {@link ITelephonyCallSdk} primitives in the gateway's own (lower-cased) vocabulary; this
 * adapter maps between the two. VERIFY against the native RingCentral media gateway addon.
 */
export interface NativeCallClient {
    /** Places an outbound call and brings the media leg online. Resolves to the telephony session id. */
    dial(args: NativeDialArgs): Promise<string>;
    /** Answers a routed inbound call (the session id arrives from the subscription webhook). */
    answer(sessionId: string): Promise<void>;
    /** Hangs up the call and releases native media/session resources. */
    hangup(sessionId: string): Promise<void>;
    /** Writes one raw PCM frame onto the session's outbound media stream — the agent's voice. */
    sendAudio(pcm: ArrayBuffer): void;
    /** Registers the inbound media-stream audio callback (what the agent hears). "Latest handler wins." */
    onAudio(cb: (frame: NativeCallAudioFrame) => void): void;
    /** Sends DTMF digits on the call (the gateway's play-digits / dtmf action). */
    sendDigits(digits: string): Promise<void>;
    /** Registers the inbound DTMF callback (DTMF events on the session's media/event stream). */
    onDigits(cb: (digits: string) => void): void;
    /** Transfers the live call (supervise/transfer to a number or extension). */
    transfer(sessionId: string, toNumber: string): Promise<void>;
    /** Registers the call-ended callback (session `Disconnected`/`Finished` or media-stream `stop`). */
    onEnded(cb: () => void): void;
}

/** Options passed to {@link NativeCallModule.createClient}. Credentials are resolved upstream. */
export interface NativeCallClientOptions {
    /** The RingCentral app client id (resolved upstream). */
    ClientId?: string;
    /** The RingCentral app client secret (resolved upstream). */
    ClientSecret?: string;
    /** A RingCentral JWT for server-to-server auth (resolved upstream), when used instead of client secret. */
    Jwt?: string;
    /** The RingCentral platform server URL (sandbox vs production), when the gateway needs it told. */
    ServerUrl?: string;
    /** Media-stream sample rate (Hz) the agent sends/receives, when the gateway needs it told. */
    SampleRate?: number;
}

/** The native addon module surface — a factory that constructs a {@link NativeCallClient}. */
export interface NativeCallModule {
    /**
     * Constructs a native call client from resolved options (app credentials already resolved upstream).
     * VERIFY against the native RingCentral media gateway addon (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeCallClientOptions): NativeCallClient;
}

/**
 * Resolved configuration for {@link RingCentralNativeCallSdk}. Credentials resolve **upstream** (MJ
 * credential system / provider `Configuration`) — this object carries already-resolved values; **never
 * inline secrets** at a call site.
 */
export interface RingCentralNativeCallConfig {
    /** The RingCentral app client id (resolved upstream). */
    ClientId?: string;
    /** The RingCentral app client secret (resolved upstream). */
    ClientSecret?: string;
    /** A RingCentral JWT for server-to-server auth (resolved upstream). */
    Jwt?: string;
    /** The RingCentral platform server URL (sandbox vs production). */
    ServerUrl?: string;
    /** Media-stream sample rate (Hz) the agent sends/receives. */
    SampleRate?: number;
    /**
     * The module specifier of the native RingCentral media gateway addon/sidecar to load (an internal
     * N-API addon package name or an absolute path to a sidecar entry). Required in production; tests inject
     * a loader.
     */
    NativeModuleSpecifier?: string;
}

/**
 * **Pure helper** — coerces a `Uint8Array` view or `ArrayBuffer` into a standalone `ArrayBuffer`, copying a
 * view so the result never aliases a larger backing buffer window. Defined here (this package has no other
 * PCM-coercion helper) so it does not collide under `index.ts`'s `export *`.
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
 * **Pure mapping** of one native inbound audio frame onto the bridge seam's plain PCM `ArrayBuffer` (the
 * single-party telephony media is unlabeled — the bridge stamps the caller's id). Copies the PCM via
 * {@link toArrayBuffer}. Isolated from I/O so it is unit-tested directly.
 */
export function mapNativeCallAudio(frame: NativeCallAudioFrame): ArrayBuffer {
    return toArrayBuffer(frame.data);
}

/**
 * **Pure mapping** of a {@link RingCentralNativeCallConfig} onto the {@link NativeCallClientOptions} the
 * native factory accepts. Isolated so the credential hand-off (always already-resolved, never inline) is
 * unit-tested directly.
 */
export function mapNativeClientOptions(config: RingCentralNativeCallConfig): NativeCallClientOptions {
    return {
        ClientId: config.ClientId,
        ClientSecret: config.ClientSecret,
        Jwt: config.Jwt,
        ServerUrl: config.ServerUrl,
        SampleRate: config.SampleRate,
    };
}

/**
 * The injectable loader for the native media gateway addon — overridable so unit tests supply a fake module
 * with no addon and no network. Production leaves it as {@link defaultNativeLoader}, which lazily imports
 * the configured {@link RingCentralNativeCallConfig.NativeModuleSpecifier}.
 */
export type NativeModuleLoader = (specifier: string) => Promise<NativeCallModule>;

/** Structural guard: a value is a {@link NativeCallModule} when it exposes a `createClient` function. */
function isNativeModule(value: unknown): value is NativeCallModule {
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
 * Lazily loads the native RingCentral media gateway addon at the given specifier (category: runtime plugin
 * discovery from config — the addon path is deployment-supplied and not known at build time, so a static
 * import is impossible; the `/* @vite-ignore *\/` keeps the bundler from trying to resolve it at build
 * time). Throws a precise, actionable error when it can't be loaded so a misconfigured deployment fails
 * loudly, not silently.
 *
 * VERIFY against the native RingCentral media gateway addon: the module's default/namespace interop + that
 * it exposes `createClient`.
 */
export const defaultNativeLoader: NativeModuleLoader = async (specifier: string): Promise<NativeCallModule> => {
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
            `RingCentralNativeCallSdk could not load the native RingCentral media gateway addon at '${specifier}'. ` +
                'Build/install the native RingCentral RingCX / Voice media-stream addon and set ' +
                `RingCentralNativeCallConfig.NativeModuleSpecifier to it. Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link ITelephonyCallSdk} over the native RingCentral RingCX / Voice media stream.
 *
 * Gives the agent both **hearing** (inbound media → the seam's audio frame) and a **voice**
 * ({@link sendAudioFrame} → the native media send path), plus working DTMF send/receive, call transfer, and
 * hangup. Construct via {@link BindRingCentralNativeCall} (the {@link import('@memberjunction/ai-bridge-base').TelephonyCallSdkFactory}-shaped
 * factory the bridge's `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire
 * consistently.
 *
 * The native client is constructed lazily on the first {@link dial} / {@link answer} so a handler the bridge
 * registers before the call exists (the base wires inbound audio / DTMF / call-ended at connect, BEFORE
 * dialling) is replayed onto the live client.
 */
export class RingCentralNativeCallSdk implements ITelephonyCallSdk {
    /** Resolved config (credentials + media opts + the native module specifier). */
    private readonly config: RingCentralNativeCallConfig;

    /** The native-addon module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native call client once {@link dial} / {@link answer} brings the session online. */
    private client: NativeCallClient | null = null;

    /** The active telephony session id once dialled/answered. */
    private activeSessionId: string | null = null;

    /** The inbound-audio handler the bridge registered (replayed onto the client once it exists). */
    private audioCb?: (pcm: ArrayBuffer) => void;

    /** The inbound-DTMF handler the bridge registered. */
    private dtmfCb?: (digits: string) => void;

    /** The call-ended handler the bridge registered. */
    private endedCb?: () => void;

    /**
     * @param config Resolved credentials + media opts + the native module specifier.
     * @param loadModule The native-addon loader (defaults to the lazy specifier loader).
     */
    constructor(config: RingCentralNativeCallConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── ITelephonyCallSdk — lifecycle ────────────────────────────────────────────────

    /**
     * Places an **outbound** call: loads the native addon, constructs + wires a client, dials, and returns
     * the telephony session id. Brings BOTH hearing and the agent's voice online.
     *
     * @param toNumber The destination phone number to dial.
     * @param fromNumber The agent's caller-id / DID the call originates from.
     * @param args Provider-specific dial options.
     * @returns The platform-native telephony session id.
     * @throws When the native module specifier is missing or the addon can't be loaded.
     */
    public async dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const client = await this.ensureClient();
        const sessionId = await client.dial({ toNumber, fromNumber, options: args });
        this.activeSessionId = sessionId;
        return sessionId;
    }

    /**
     * Answers a routed **inbound** call: loads + wires the native client and accepts the session's media.
     *
     * @param callId The platform-native telephony session id from the inbound webhook.
     * @throws When the native module specifier is missing or the addon can't be loaded.
     */
    public async answer(callId: string): Promise<void> {
        const client = await this.ensureClient();
        await client.answer(callId);
        this.activeSessionId = callId;
    }

    /**
     * Hangs up the call and releases the native client. Tolerant of teardown errors.
     *
     * @param callId The telephony session id to end.
     */
    public async hangup(callId: string): Promise<void> {
        const client = this.client;
        this.client = null;
        this.activeSessionId = null;
        if (client) {
            try {
                await client.hangup(callId);
            } catch (err) {
                LogError(
                    `[RingCentralNativeCallSdk] hangup() failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
    }

    // ── ITelephonyCallSdk — two-way audio (real) ─────────────────────────────────────

    /**
     * Sends one raw PCM frame as the agent's outbound voice into the call — **the real send leg**, via the
     * native media stream. No-ops (without throwing) before the call is up so an early model frame never
     * crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the call.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.client?.sendAudio(pcm);
    }

    /**
     * Registers the inbound-audio handler (what the agent hears). Replayed onto the native client when it
     * comes online if the bridge registered it before dialling.
     *
     * @param cb Invoked with each inbound PCM audio frame.
     */
    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.audioCb = cb;
        if (this.client) {
            this.client.onAudio((frame) => cb(mapNativeCallAudio(frame)));
        }
    }

    // ── ITelephonyCallSdk — DTMF / transfer / lifecycle signals ──────────────────────

    /**
     * Sends DTMF digits on the call via the native client. No-ops (without throwing) before the call is up.
     *
     * @param digits The DTMF digit string to send (e.g. `'1234#'`).
     */
    public async sendDtmf(digits: string): Promise<void> {
        await this.client?.sendDigits(digits);
    }

    /**
     * Registers the inbound-DTMF handler. Replayed onto the native client when it comes online.
     *
     * @param cb Invoked with each received DTMF digit string.
     */
    public onDtmf(cb: (digits: string) => void): void {
        this.dtmfCb = cb;
        this.client?.onDigits(cb);
    }

    /**
     * Transfers the live call to another party via the native client (supervise/transfer).
     *
     * @param callId The telephony session id to transfer.
     * @param toNumber The transfer destination (a phone number or extension).
     */
    public async transfer(callId: string, toNumber: string): Promise<void> {
        await this.client?.transfer(callId, toNumber);
    }

    /**
     * Registers the call-ended handler. Replayed onto the native client when it comes online.
     *
     * @param cb Invoked when the call has ended.
     */
    public onCallEnded(cb: () => void): void {
        this.endedCb = cb;
        this.client?.onEnded(cb);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /**
     * Loads the native addon (once), constructs a client with the resolved credentials, wires the bridge's
     * pre-registered handlers onto it, and memoizes it. Idempotent for the life of one call.
     *
     * @throws When no {@link RingCentralNativeCallConfig.NativeModuleSpecifier} is configured, or the addon
     *   cannot be loaded.
     */
    private async ensureClient(): Promise<NativeCallClient> {
        if (this.client) {
            return this.client;
        }
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'RingCentralNativeCallSdk: no NativeModuleSpecifier configured. Set it to the native RingCentral ' +
                    'RingCX / Voice media-stream addon in the session Configuration. See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createClient(mapNativeClientOptions(this.config));
        this.wireClient(client);
        this.client = client;
        return client;
    }

    /** Wires the bridge's pre-registered handlers onto the live native client, mapping native shapes. */
    private wireClient(client: NativeCallClient): void {
        if (this.audioCb) {
            const cb = this.audioCb;
            client.onAudio((frame) => cb(mapNativeCallAudio(frame)));
        }
        if (this.dtmfCb) {
            client.onDigits(this.dtmfCb);
        }
        if (this.endedCb) {
            client.onEnded(this.endedCb);
        }
    }
}

/**
 * Builds the {@link import('@memberjunction/ai-bridge-base').TelephonyCallSdkFactory}-shaped factory that
 * constructs a {@link RingCentralNativeCallSdk} from the bridge's per-session `Configuration`. Pass the
 * result to `RingCentralBridge.SetSdkFactory(...)` (or the base's) so a deployment activates **two-way
 * native RingCentral audio** without code changes to the driver.
 *
 * Reads RingCentral app credentials + media opts + the native module specifier out of the config map the
 * engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindRingCentralNativeCall());
 *
 * @param loadModule Optional native-addon loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => RingCentralNativeCallSdk`.
 */
export function BindRingCentralNativeCall(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => RingCentralNativeCallSdk {
    return (config?: Record<string, unknown>) => new RingCentralNativeCallSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link RingCentralNativeCallConfig} from the engine's loosely-typed `Configuration` map without
 * ever widening to `any`. Each field is read + type-checked individually so a malformed config yields a
 * clean, partially-resolved object (and {@link RingCentralNativeCallSdk}'s lifecycle then throws a precise
 * error if the required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): RingCentralNativeCallConfig {
    const cfg = config ?? {};
    return {
        ClientId: readString(cfg.ClientId),
        ClientSecret: readString(cfg.ClientSecret),
        Jwt: readString(cfg.Jwt),
        ServerUrl: readString(cfg.ServerUrl),
        SampleRate: readNumber(cfg.SampleRate),
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
