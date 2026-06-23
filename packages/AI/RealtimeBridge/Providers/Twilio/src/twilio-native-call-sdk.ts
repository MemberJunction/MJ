/**
 * @fileoverview `TwilioNativeCallSdk` — a **real, two-way** {@link ITelephonyCallSdk} binding over the
 * native **Twilio Programmable Voice + Media Streams** path. Unlike the shipped, unbound
 * {@link import('./twilio-call-sdk').TwilioCallSdk} (every operation throws "bind the real Twilio
 * client"), this adapter actually carries the call: {@link TwilioNativeCallSdk.sendAudioFrame} forwards
 * the agent's synthesized PCM onto the call's Media-Streams websocket (the agent's **voice** on the
 * call), inbound Media-Streams audio maps to the seam's audio-frame callback (what the agent **hears**),
 * and DTMF / transfer / hangup actually reach the native client.
 *
 * ## Why a native binding
 * A phone call is a single-leg, bidirectional audio source. The native Twilio path has two halves — a
 * **REST API** (place / hang-up / transfer / send-DTMF) and a **Media Streams** websocket (bidirectional
 * realtime audio + inbound DTMF events). This adapter sits over both so a single binding gives the agent
 * full-duplex audio plus the call controls the telephony seam declares.
 *
 * ## The native module seam (no SDK types leak)
 * The `twilio` SDK is NOT imported here. Deployments wrap the REST + Media-Streams plumbing behind the
 * small structural {@link NativeCallModule} surface declared below, and this adapter depends ONLY on that
 * surface — none of `twilio`'s real types leak into `@memberjunction/ai-bridge-twilio`. The module is
 * loaded **lazily** behind an injectable {@link NativeModuleLoader} so the package builds and unit-tests
 * with **no `twilio` install and no network**. Tests inject a fake module; production points
 * {@link TwilioNativeSdkConfig.NativeModuleSpecifier} at the real adapter package/path.
 *
 * ## Auth (deployment responsibility)
 * The native client authenticates with the Twilio **Account SID + Auth Token** (or API key/secret) and a
 * resolved Media-Streams websocket URL. These resolve **upstream** (MJ credential system / provider
 * `Configuration`) and are **never inlined** at a call site — {@link readNativeConfig} reads already-
 * resolved values out of the loose `Configuration` map the engine passes at connect.
 *
 * @module @memberjunction/ai-bridge-twilio
 * @author MemberJunction.com
 * @see {@link ITelephonyCallSdk} — the platform-agnostic telephony seam this binds.
 */

import { LogError } from '@memberjunction/core';
import { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-Twilio-call surface this adapter depends on (a local structural
// type so NONE of the `twilio` SDK's types leak and the package compiles WITHOUT the
// `twilio` package installed). VERIFY against the native Twilio adapter you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One inbound Media-Streams audio frame the native adapter surfaces (what the agent hears). */
export interface NativeCallAudioFrame {
    /** Raw PCM/μ-law bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** Optional epoch-ms capture timestamp (informational; the seam carries only the bytes). */
    timestampMs?: number;
}

/** Options the native adapter's `createCall` (outbound dial) accepts. Mirrors the seam's `dial` args. */
export interface NativeDialArgs {
    /** Destination number to dial (E.164 recommended). */
    toNumber: string;
    /** The agent's caller-id / DID the call originates FROM. */
    fromNumber: string;
    /** Provider-specific dial options (status-callback URL, stream URL, recording flags, …). */
    extra?: Record<string, unknown>;
}

/**
 * The live native-call client the adapter hands back. The surface mirrors {@link ITelephonyCallSdk} but in
 * the native adapter's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native Twilio adapter.
 */
export interface NativeCallClient {
    /** Places the outbound call (REST `calls.create` with a `<Connect><Stream>` TwiML). Resolves the Call SID. */
    dial(args: NativeDialArgs): Promise<string>;
    /** Accepts the Media-Streams websocket for an already-delivered inbound Call SID. */
    answer(callId: string): Promise<void>;
    /** Ends the call (REST `calls(sid).update({ status: 'completed' })`). */
    hangup(callId: string): Promise<void>;
    /** Pushes one outbound PCM frame onto the call's Media-Streams websocket — the agent's voice. */
    sendAudioFrame(pcm: ArrayBuffer): void;
    /** Registers the inbound Media-Streams audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeCallAudioFrame) => void): void;
    /** Sends DTMF digits on the call (REST `<Play digits>` / `<Dial sendDigits>`). */
    sendDtmf(digits: string): Promise<void>;
    /** Registers the inbound DTMF callback (`<Gather>` results or Media-Streams `dtmf` events). */
    onDtmf(cb: (digits: string) => void): void;
    /** Transfers the live call (REST `calls(sid).update({ twiml: '<Dial>...' })`). */
    transfer(callId: string, toNumber: string): Promise<void>;
    /** Registers the call-ended callback (status-callback `completed`/`failed` or stream `stop`). */
    onCallEnded(cb: () => void): void;
}

/** Options passed to {@link NativeCallModule.createClient}. Credentials are resolved upstream. */
export interface NativeClientOptions {
    /** The Twilio Account SID (resolved upstream). */
    AccountSid?: string;
    /** The Twilio Auth Token (resolved upstream). */
    AuthToken?: string;
    /** The Twilio API Key SID (resolved upstream; alternative to Account SID + Auth Token). */
    ApiKeySid?: string;
    /** The Twilio API Key Secret (resolved upstream). */
    ApiKeySecret?: string;
    /** The Media-Streams websocket URL the call's `<Connect><Stream>` connects to (resolved upstream). */
    StreamUrl?: string;
}

/** The native adapter module surface — a factory that constructs a {@link NativeCallClient}. */
export interface NativeCallModule {
    /**
     * Constructs a native call client from resolved options (Twilio credentials already resolved upstream).
     * VERIFY against the native Twilio adapter (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeClientOptions): NativeCallClient;
}

/**
 * Resolved configuration for {@link TwilioNativeCallSdk}. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) — this object carries already-resolved values; **never inline
 * secrets** at a call site.
 */
export interface TwilioNativeSdkConfig {
    /** The Twilio Account SID (resolved upstream). */
    AccountSid?: string;
    /** The Twilio Auth Token (resolved upstream). */
    AuthToken?: string;
    /** The Twilio API Key SID (resolved upstream; alternative to Account SID + Auth Token). */
    ApiKeySid?: string;
    /** The Twilio API Key Secret (resolved upstream). */
    ApiKeySecret?: string;
    /** The Media-Streams websocket URL the call's `<Connect><Stream>` connects to (resolved upstream). */
    StreamUrl?: string;
    /**
     * The module specifier of the native Twilio adapter to load (an internal adapter package name or an
     * absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
}

/**
 * Copies arbitrary PCM bytes into a standalone `ArrayBuffer`, never aliasing the caller's buffer window.
 * A `Uint8Array` view may be a slice of a larger backing buffer (offset/length), so a naive `.buffer`
 * grab would leak neighbouring audio; this copies exactly the view's bytes. Defined locally because the
 * Twilio package has no shared coercion helper to reuse (unlike the Zoom package's RTMS binding).
 */
export function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data.slice(0);
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

/**
 * **Pure mapping** of one native inbound audio frame onto the raw PCM `ArrayBuffer` the telephony seam's
 * audio callback delivers. Copies the bytes (see {@link toArrayBuffer}). Isolated from I/O for direct
 * unit testing. (The telephony seam carries no per-speaker label — a 1:1 call has one remote party.)
 */
export function mapNativeAudioFrame(frame: NativeCallAudioFrame): ArrayBuffer {
    return toArrayBuffer(frame.data);
}

/**
 * The injectable loader for the native Twilio adapter — overridable so unit tests supply a fake module
 * with no `twilio` install and no network. Production leaves it as {@link defaultNativeLoader}, which
 * lazily imports the configured {@link TwilioNativeSdkConfig.NativeModuleSpecifier}.
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
 * Lazily loads the native Twilio adapter at the given specifier (category: runtime plugin discovery from
 * config — the adapter path is deployment-supplied and not known at build time, so a static import is
 * impossible). Throws a precise, actionable error when it can't be loaded so a misconfigured deployment
 * fails loudly, not silently.
 *
 * VERIFY against the native Twilio adapter: the module's default/namespace interop + that it exposes
 * `createClient`.
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
            `TwilioNativeCallSdk could not load the native Twilio adapter at '${specifier}'. Build/install the ` +
                'native Twilio Programmable Voice + Media Streams adapter (REST + websocket) and set ' +
                `TwilioNativeSdkConfig.NativeModuleSpecifier to it. Underlying error: ${message}`,
        );
    }
};

/**
 * A **real, two-way** {@link ITelephonyCallSdk} over the native Twilio Programmable Voice + Media Streams
 * path.
 *
 * Gives the agent both **hearing** (inbound Media-Streams audio → the seam's audio callback) and a
 * **voice** ({@link sendAudioFrame} → the native Media-Streams send path), plus working DTMF, transfer,
 * and hangup. Construct via {@link BindTwilioNativeCall} (the factory the bridge's `SetSdkFactory` wants),
 * not directly, so config resolution + the lazy loader wire consistently.
 *
 * The adapter tracks the active Call SID so per-call REST/websocket operations can be addressed, and
 * re-registers any handlers the bridge set before the call existed once a call comes online.
 */
export class TwilioNativeCallSdk implements ITelephonyCallSdk {
    /** Resolved config (credentials + stream URL + the native module specifier). */
    private readonly config: TwilioNativeSdkConfig;

    /** The native-adapter module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native client once {@link dial}/{@link answer} brings a call online. */
    private client: NativeCallClient | null = null;

    /** The active call's SID, so per-call operations can address it. */
    private activeCallId: string | null = null;

    /** The inbound audio handler the bridge registered (may predate the call). */
    private audioHandler?: (pcm: ArrayBuffer) => void;

    /** The inbound DTMF handler the bridge registered (may predate the call). */
    private dtmfHandler?: (digits: string) => void;

    /** The call-ended handler the bridge registered (may predate the call). */
    private endedHandler?: () => void;

    /**
     * @param config Resolved credentials + stream URL + the native module specifier.
     * @param loadModule The native-adapter loader (defaults to the lazy specifier loader).
     */
    constructor(config: TwilioNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── ITelephonyCallSdk — lifecycle ────────────────────────────────────────────────

    /**
     * Loads the native adapter, constructs a client, wires its callbacks, and places the **outbound** call.
     * Brings BOTH hearing and the agent's voice online. Resolves the platform-native Call SID.
     *
     * @param toNumber The destination phone number to dial.
     * @param fromNumber The agent's caller-id / DID the call originates from.
     * @param args Provider-specific dial parameters.
     * @returns The Twilio Call SID for the placed call.
     * @throws When the native module specifier is missing or the adapter can't be loaded.
     */
    public async dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const client = await this.ensureClient();
        const callSid = await client.dial({ toNumber, fromNumber, extra: args });
        this.bindCall(callSid);
        return callSid;
    }

    /**
     * Loads the native adapter, constructs a client, wires its callbacks, and **answers** an inbound call
     * already delivered to the agent's number. Brings BOTH hearing and the agent's voice online.
     *
     * @param callId The platform-native identifier of the inbound call to answer.
     * @throws When the native module specifier is missing or the adapter can't be loaded.
     */
    public async answer(callId: string): Promise<void> {
        const client = await this.ensureClient();
        await client.answer(callId);
        this.bindCall(callId);
    }

    /**
     * Hangs up the call via the native client and clears the active call. Tolerant of teardown errors.
     *
     * @param callId The platform-native identifier of the call to end.
     */
    public async hangup(callId: string): Promise<void> {
        const client = this.client;
        this.activeCallId = null;
        if (client) {
            try {
                await client.hangup(callId);
            } catch (err) {
                LogError(`[TwilioNativeCallSdk] hangup() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    // ── ITelephonyCallSdk — two-way audio (real) ─────────────────────────────────────

    /**
     * Sends one raw PCM frame as the agent's outbound voice into the call — **the agent's real voice on
     * the call**, via the native Media-Streams send path. No-ops (without throwing) before a call exists
     * so an early model frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the call.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.client?.sendAudioFrame(pcm);
    }

    /**
     * Registers the inbound audio handler (the agent's hearing path). Wires it to the live client when a
     * call already exists; otherwise it is (re-)registered at {@link bindCall} when the call comes online.
     *
     * @param cb Invoked with each inbound PCM audio frame.
     */
    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.audioHandler = cb;
        this.client?.onAudioFrame((frame) => cb(mapNativeAudioFrame(frame)));
    }

    // ── ITelephonyCallSdk — DTMF, transfer (real) ────────────────────────────────────

    /**
     * Sends DTMF touch-tones on the call via the native client. No-ops (without throwing) before a call
     * exists.
     *
     * @param digits The DTMF digit string to send.
     */
    public async sendDtmf(digits: string): Promise<void> {
        await this.client?.sendDtmf(digits);
    }

    /**
     * Registers the inbound DTMF handler. Wires it to the live client when a call already exists; otherwise
     * it is (re-)registered at {@link bindCall} when the call comes online.
     *
     * @param cb Invoked with each received DTMF digit string.
     */
    public onDtmf(cb: (digits: string) => void): void {
        this.dtmfHandler = cb;
        this.client?.onDtmf(cb);
    }

    /**
     * Transfers the live call to another party via the native client. No-ops (without throwing) before a
     * call exists.
     *
     * @param callId The platform-native identifier of the call to transfer.
     * @param toNumber The transfer destination.
     */
    public async transfer(callId: string, toNumber: string): Promise<void> {
        await this.client?.transfer(callId, toNumber);
    }

    /**
     * Registers the call-ended handler. Wires it to the live client when a call already exists; otherwise
     * it is (re-)registered at {@link bindCall} when the call comes online.
     *
     * @param cb Invoked when the call ends.
     */
    public onCallEnded(cb: () => void): void {
        this.endedHandler = cb;
        this.client?.onCallEnded(cb);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /**
     * Lazily loads the native adapter and constructs the client (once), throwing an actionable error when
     * the required {@link TwilioNativeSdkConfig.NativeModuleSpecifier} is absent.
     */
    private async ensureClient(): Promise<NativeCallClient> {
        if (this.client) {
            return this.client;
        }
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'TwilioNativeCallSdk: no NativeModuleSpecifier configured. Set it to the native Twilio Programmable ' +
                    'Voice + Media Streams adapter (REST + websocket) in the session Configuration. See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        this.client = mod.createClient({
            AccountSid: this.config.AccountSid,
            AuthToken: this.config.AuthToken,
            ApiKeySid: this.config.ApiKeySid,
            ApiKeySecret: this.config.ApiKeySecret,
            StreamUrl: this.config.StreamUrl,
        });
        return this.client;
    }

    /** Binds the active Call SID and (re-)registers any handlers the bridge set before the call existed. */
    private bindCall(callId: string): void {
        this.activeCallId = callId;
        const client = this.client;
        if (!client) {
            return;
        }
        if (this.audioHandler) {
            const cb = this.audioHandler;
            client.onAudioFrame((frame) => cb(mapNativeAudioFrame(frame)));
        }
        if (this.dtmfHandler) {
            client.onDtmf(this.dtmfHandler);
        }
        if (this.endedHandler) {
            client.onCallEnded(this.endedHandler);
        }
    }
}

/**
 * Builds the {@link import('@memberjunction/ai-bridge-base').TelephonyCallSdkFactory}-shaped factory that
 * constructs a {@link TwilioNativeCallSdk} from the bridge's per-session `Configuration`. Pass the result
 * to `TwilioBridge.SetSdkFactory(...)` so a deployment activates **two-way native Twilio audio** without
 * code changes to the driver.
 *
 * Reads Twilio credentials + stream URL + the native module specifier out of the config map the engine
 * passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindTwilioNativeCall());
 *
 * @param loadModule Optional native-adapter loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => TwilioNativeCallSdk`.
 */
export function BindTwilioNativeCall(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => TwilioNativeCallSdk {
    return (config?: Record<string, unknown>) => new TwilioNativeCallSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link TwilioNativeSdkConfig} from the engine's loosely-typed `Configuration` map without
 * ever widening to `any`. Each field is read + type-checked individually so a malformed config yields a
 * clean, partially-resolved object (and {@link TwilioNativeCallSdk} then throws a precise error if the
 * required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): TwilioNativeSdkConfig {
    const cfg = config ?? {};
    return {
        AccountSid: readString(cfg.AccountSid),
        AuthToken: readString(cfg.AuthToken),
        ApiKeySid: readString(cfg.ApiKeySid),
        ApiKeySecret: readString(cfg.ApiKeySecret),
        StreamUrl: readString(cfg.StreamUrl),
        NativeModuleSpecifier: readString(cfg.NativeModuleSpecifier),
    };
}

/** Reads a value as a non-empty string, or `undefined`. */
function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
