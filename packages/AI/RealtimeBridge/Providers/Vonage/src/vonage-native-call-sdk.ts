/**
 * @fileoverview `VonageNativeCallSdk` — a **real, two-way** {@link ITelephonyCallSdk} binding over the
 * native **Vonage Voice API + WebSocket media** path. Unlike the unbound {@link VonageCallSdk} (whose every
 * operation throws "bind the real Vonage client" until a deployment supplies bindings), this adapter gives
 * the agent a **real voice on a live phone call**: {@link sendAudioFrame} forwards the agent's synthesized
 * PCM onto the call's WebSocket media **send** path, and inbound WebSocket media maps to the seam's audio
 * callback (what the agent hears). DTMF send/receive, transfer, and hangup all reach the native call client.
 *
 * ## Why a native binding
 * Vonage telephony is two halves: the **Voice API** (place / modify / hang-up calls, driven by NCCO
 * documents) and a **WebSocket** media leg the call's NCCO `connect`s to (bidirectional realtime audio +
 * DTMF). To both *hear* and *speak* on a live call the bridge needs a client that owns BOTH halves. This
 * adapter binds that combined Voice-API-plus-WebSocket client and carries **bidirectional** audio through it
 * — the binding a two-way "agent talks on the phone" deployment uses.
 *
 * ## The native module seam (no SDK types leak)
 * The real client is built over `@vonage/server-sdk` (Voice API) plus a WebSocket media handler. Neither is
 * imported here: this adapter depends ONLY on the small structural {@link NativeCallModule} surface declared
 * below, loaded **lazily** behind an injectable {@link NativeModuleLoader} so `@memberjunction/ai-bridge-vonage`
 * builds and unit-tests with **no SDK, no addon, and no network**. Tests inject a fake module; production
 * points {@link VonageNativeSdkConfig.NativeModuleSpecifier} at the real client module.
 *
 * ## Auth (deployment responsibility)
 * The Voice API authenticates with a JWT signed from the Voice **application id** + **private key**; the
 * Account API uses the **API key** + **API secret**. All of these resolve **upstream** (MJ credential system
 * / provider `Configuration`) and are **never inlined** at a call site — {@link readNativeConfig} carries
 * already-resolved values and {@link VonageNativeCallSdk} passes them straight to the native client factory.
 *
 * Every spot where the native module's exact surface is assumed carries a `// VERIFY against the native
 * Vonage Voice client` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-vonage
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-Vonage-Voice-client surface this adapter depends on (local
// structural types so NONE of `@vonage/server-sdk`'s types leak and the package
// compiles WITHOUT the SDK installed). VERIFY against the native Vonage Voice
// client module you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** Resolved Vonage auth + media options the native client factory needs. Credentials resolved upstream. */
export interface NativeClientOptions {
    /** The Voice **application id** (resolved upstream). Used with the private key to sign the Voice JWT. */
    ApplicationId?: string;
    /** The Voice **private key** (resolved upstream). Signs the Voice API JWT; never inline. */
    PrivateKey?: string;
    /** The Account **API key** (resolved upstream), for the Account/Number APIs. */
    ApiKey?: string;
    /** The Account **API secret** (resolved upstream); never inline. */
    ApiSecret?: string;
    /** The WebSocket media URL the call's NCCO `connect`s to (the bidirectional media leg). */
    WebsocketMediaUrl?: string;
}

/** The arguments the native client's `placeCall()` accepts for an outbound dial. */
export interface NativePlaceCallArgs {
    /** Destination number to dial (E.164 recommended). */
    to: string;
    /** The agent's caller-id / DID the call originates from. */
    from: string;
    /** Provider-specific dial options (event-webhook URL, recording flags, region, …). */
    options?: Record<string, unknown>;
}

/**
 * The live native call client the module hands back. The surface mirrors {@link ITelephonyCallSdk} but in
 * the native client's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native Vonage Voice client.
 */
export interface NativeCallClient {
    /** Places an outbound call via the Voice API and opens its WebSocket media leg. Returns the call UUID. */
    placeCall(args: NativePlaceCallArgs): Promise<string>;
    /** Accepts the WebSocket media leg for an inbound call already delivered by the answer webhook. */
    acceptInbound(callUuid: string): Promise<void>;
    /** Ends the call (Voice API `PUT /v1/calls/:uuid` → `{ action: 'hangup' }`) and closes the media leg. */
    endCall(callUuid: string): Promise<void>;
    /** Writes one outbound PCM payload onto the call's WebSocket media leg (the agent's voice). */
    writeMedia(callUuid: string, pcm: ArrayBuffer): void;
    /** Registers the inbound WebSocket media callback for the call (what the agent hears). */
    onMedia(callUuid: string, cb: (media: NativeMediaFrame) => void): void;
    /** Sends DTMF digits on the call (Voice API `PUT /v1/calls/:uuid/dtmf`). */
    sendDigits(callUuid: string, digits: string): Promise<void>;
    /** Registers the inbound DTMF callback (NCCO `input`/`dtmf` results from the event webhook). */
    onDigits(callUuid: string, cb: (digits: string) => void): void;
    /** Transfers the live call (Voice API `PUT /v1/calls/:uuid` → `{ action: 'transfer', … }`). */
    transferCall(callUuid: string, toNumber: string): Promise<void>;
    /** Registers the call-ended callback (event-webhook terminal status OR the WebSocket `close` event). */
    onCallStatus(callUuid: string, cb: () => void): void;
}

/** One inbound media frame the native client surfaces. The PCM may be a view or a standalone buffer. */
export interface NativeMediaFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
}

/** The native module surface — a factory that constructs a {@link NativeCallClient} from resolved options. */
export interface NativeCallModule {
    /**
     * Constructs a native Vonage call client from resolved options (credentials already resolved upstream).
     * VERIFY against the native Vonage Voice client (`createClient` vs a `Client` constructor).
     */
    createClient(options: NativeClientOptions): NativeCallClient;
}

/**
 * Resolved configuration for {@link VonageNativeCallSdk}. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) — this object carries already-resolved values; **never inline
 * secrets** at a call site.
 */
export interface VonageNativeSdkConfig {
    /** The Voice **application id** (resolved upstream). */
    ApplicationId?: string;
    /** The Voice **private key** (resolved upstream). Signs the Voice API JWT. */
    PrivateKey?: string;
    /** The Account **API key** (resolved upstream). */
    ApiKey?: string;
    /** The Account **API secret** (resolved upstream). */
    ApiSecret?: string;
    /** The WebSocket media URL the call's NCCO `connect`s to. */
    WebsocketMediaUrl?: string;
    /**
     * The module specifier of the native Vonage Voice client module to load (an internal package name or an
     * absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
}

/**
 * **Pure helper** — coerces a `Uint8Array` view (which may be a window onto a larger buffer) or a standalone
 * `ArrayBuffer` into a **copied** `ArrayBuffer` of exactly the frame's bytes. A view's `.buffer` can be
 * larger than the frame, so we slice the exact window; isolated from I/O so it is unit-tested directly.
 *
 * Defined here (the Vonage package has no other PCM-coercion helper) so there is no duplicate `export *`
 * collision under `index.ts`.
 */
export function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    // Copy into a fresh Uint8Array — its `.buffer` is always a plain ArrayBuffer (not SharedArrayBuffer)
    // and is sized to exactly the frame, so a view onto a larger window never aliases extra bytes.
    const source = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy.buffer;
}

/**
 * **Pure mapping** of one native inbound media frame onto the seam's PCM `ArrayBuffer`. Copies the PCM (see
 * {@link toArrayBuffer}) so the caller never aliases the native client's buffer. Isolated for direct testing.
 */
export function mapNativeMediaFrame(frame: NativeMediaFrame): ArrayBuffer {
    return toArrayBuffer(frame.data);
}

/**
 * The injectable loader for the native Vonage Voice client module — overridable so unit tests supply a fake
 * module with no SDK and no network. Production leaves it as {@link defaultNativeLoader}, which lazily
 * imports the configured {@link VonageNativeSdkConfig.NativeModuleSpecifier}.
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
 * Lazily loads the native Vonage Voice client module at the given specifier (category: runtime plugin
 * discovery from config — the module path is deployment-supplied and not known at build time, hence the
 * `@vite-ignore` so the bundler does not try to resolve it statically). Throws a precise, actionable error
 * when it can't be loaded so a misconfigured deployment fails loudly, not silently.
 *
 * VERIFY against the native Vonage Voice client: the module's default/namespace interop + that it exposes
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
            `VonageNativeCallSdk could not load the native Vonage Voice client module at '${specifier}'. ` +
                'Build/install the native Vonage Voice client (the @vonage/server-sdk Voice API + WebSocket media ' +
                'wrapper) and set VonageNativeSdkConfig.NativeModuleSpecifier to it. Underlying error: ' +
                message,
        );
    }
};

/**
 * A **real, two-way** {@link ITelephonyCallSdk} over the native Vonage Voice API + WebSocket media.
 *
 * Gives the agent both **hearing** (inbound WebSocket media → seam audio frames) and a **voice**
 * ({@link sendAudioFrame} → the native WebSocket media send path), plus working DTMF send/receive, call
 * transfer, and hangup. Construct via {@link BindVonageNativeCall} (the factory the bridge's
 * `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire consistently.
 *
 * The adapter is lazy: the native client is created and the call placed/answered at {@link dial} /
 * {@link answer}. Handlers registered before the call exists (`onAudioFrame`, `onDtmf`, `onCallEnded`) are
 * buffered and (re-)attached to the native client once the call's UUID is known — mirroring {@link VonageCallSdk}.
 */
export class VonageNativeCallSdk implements ITelephonyCallSdk {
    /** Resolved config (credentials + media URL + the native module specifier). */
    private readonly config: VonageNativeSdkConfig;

    /** The native-module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native client once {@link dial}/{@link answer} succeeds. */
    private client: NativeCallClient | null = null;

    /** The active call's UUID once dialled/answered, so per-call operations can address it. */
    private activeCallUuid: string | null = null;

    /** The inbound-audio handler the bridge registered (buffered until the call exists). */
    private audioCb?: (pcm: ArrayBuffer) => void;

    /** The inbound-DTMF handler the bridge registered (buffered until the call exists). */
    private dtmfCb?: (digits: string) => void;

    /** The call-ended handler the bridge registered (buffered until the call exists). */
    private endedCb?: () => void;

    /**
     * @param config Resolved credentials + media URL + the native module specifier.
     * @param loadModule The native-module loader (defaults to the lazy specifier loader).
     */
    constructor(config: VonageNativeSdkConfig, loadModule: NativeModuleLoader = defaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── ITelephonyCallSdk — lifecycle ────────────────────────────────────────────────

    /**
     * Places an **outbound** call: loads the native module, constructs a client with the resolved Voice
     * credentials, places the call (opening its WebSocket media leg), binds the UUID, and (re-)attaches any
     * buffered handlers. Brings BOTH hearing and the agent's voice online.
     *
     * @param toNumber Destination number to dial (E.164 recommended).
     * @param fromNumber The agent's caller-id / DID the call originates from.
     * @param args Provider-specific dial options.
     * @returns The placed call's UUID.
     * @throws When the native module specifier is missing or the module can't be loaded.
     */
    public async dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const client = await this.ensureClient();
        const uuid = await client.placeCall({ to: toNumber, from: fromNumber, options: args });
        this.bindCall(uuid);
        return uuid;
    }

    /**
     * Answers an **inbound** call already delivered by the answer webhook: loads the native module, accepts
     * the call's WebSocket media leg, binds the UUID, and (re-)attaches any buffered handlers.
     *
     * @param callId The inbound call UUID from the webhook.
     * @throws When the native module specifier is missing or the module can't be loaded.
     */
    public async answer(callId: string): Promise<void> {
        const client = await this.ensureClient();
        await client.acceptInbound(callId);
        this.bindCall(callId);
    }

    /**
     * Hangs up the call via the native client and clears the active UUID. Tolerant of teardown errors.
     *
     * @param callId The call UUID to end.
     */
    public async hangup(callId: string): Promise<void> {
        const client = this.client;
        this.activeCallUuid = null;
        if (client) {
            try {
                await client.endCall(callId);
            } catch (err) {
                LogError(`[VonageNativeCallSdk] hangup() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    // ── ITelephonyCallSdk — two-way audio (real) ─────────────────────────────────────

    /**
     * Sends one raw PCM frame as the agent's outbound voice — **the agent's real voice onto the phone call**,
     * via the native WebSocket media send path. No-ops (without throwing) before the call exists so an early
     * model frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak onto the call.
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        if (this.client && this.activeCallUuid) {
            this.client.writeMedia(this.activeCallUuid, pcm);
        }
    }

    /**
     * Registers the inbound-audio handler (what the agent hears). Buffered until the call exists, then
     * attached; if the call is already live it attaches immediately.
     *
     * @param cb Invoked with each inbound PCM audio frame.
     */
    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.audioCb = cb;
        if (this.client && this.activeCallUuid) {
            this.attachAudio(this.client, this.activeCallUuid, cb);
        }
    }

    // ── ITelephonyCallSdk — DTMF / transfer / call-ended ─────────────────────────────

    /**
     * Sends DTMF digits on the live call via the native client. No-ops (without throwing) before the call
     * exists.
     *
     * @param digits The DTMF digit string to send (e.g. `'1234#'`).
     */
    public async sendDtmf(digits: string): Promise<void> {
        if (this.client && this.activeCallUuid) {
            await this.client.sendDigits(this.activeCallUuid, digits);
        }
    }

    /**
     * Registers the inbound-DTMF handler. Buffered until the call exists, then attached.
     *
     * @param cb Invoked with each received DTMF digit string.
     */
    public onDtmf(cb: (digits: string) => void): void {
        this.dtmfCb = cb;
        if (this.client && this.activeCallUuid) {
            this.client.onDigits(this.activeCallUuid, cb);
        }
    }

    /**
     * Transfers the live call to another party via the native client.
     *
     * @param callId The call UUID to transfer.
     * @param toNumber The transfer destination.
     */
    public async transfer(callId: string, toNumber: string): Promise<void> {
        if (this.client) {
            await this.client.transferCall(callId, toNumber);
        }
    }

    /**
     * Registers the call-ended handler. Buffered until the call exists, then attached.
     *
     * @param cb Invoked when the call ends (remote hangup / carrier drop / WebSocket close).
     */
    public onCallEnded(cb: () => void): void {
        this.endedCb = cb;
        if (this.client && this.activeCallUuid) {
            this.client.onCallStatus(this.activeCallUuid, cb);
        }
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Loads the native module (once) and constructs a client with the resolved Voice credentials. */
    private async ensureClient(): Promise<NativeCallClient> {
        if (this.client) {
            return this.client;
        }
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'VonageNativeCallSdk: no NativeModuleSpecifier configured. Set it to the native Vonage Voice ' +
                    'client module (@vonage/server-sdk Voice API + WebSocket media wrapper) in the session ' +
                    'Configuration. See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        this.client = mod.createClient({
            ApplicationId: this.config.ApplicationId,
            PrivateKey: this.config.PrivateKey,
            ApiKey: this.config.ApiKey,
            ApiSecret: this.config.ApiSecret,
            WebsocketMediaUrl: this.config.WebsocketMediaUrl,
        });
        return this.client;
    }

    /** Binds the active call UUID and (re-)attaches any handlers registered before the call existed. */
    private bindCall(callUuid: string): void {
        this.activeCallUuid = callUuid;
        const client = this.client;
        if (!client) {
            return;
        }
        if (this.audioCb) {
            this.attachAudio(client, callUuid, this.audioCb);
        }
        if (this.dtmfCb) {
            client.onDigits(callUuid, this.dtmfCb);
        }
        if (this.endedCb) {
            client.onCallStatus(callUuid, this.endedCb);
        }
    }

    /** Attaches the inbound-media callback, mapping each native frame to a copied PCM `ArrayBuffer`. */
    private attachAudio(client: NativeCallClient, callUuid: string, cb: (pcm: ArrayBuffer) => void): void {
        client.onMedia(callUuid, (frame) => cb(mapNativeMediaFrame(frame)));
    }
}

/**
 * Builds the {@link import('@memberjunction/ai-bridge-base').TelephonyCallSdkFactory}-shaped factory that
 * constructs a {@link VonageNativeCallSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `VonageBridge.SetSdkFactory(...)` (via {@link BaseTelephonyBridge.SetSdkFactory}) so a deployment activates
 * **two-way native Vonage audio** without code changes to the driver.
 *
 * Reads the Voice application id / private key + API key / secret + the WebSocket media URL + the native
 * module specifier out of the config map the engine passes at connect (credentials resolved upstream —
 * **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindVonageNativeCall());
 *
 * @param loadModule Optional native-module loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => VonageNativeCallSdk`.
 */
export function BindVonageNativeCall(
    loadModule: NativeModuleLoader = defaultNativeLoader,
): (config?: Record<string, unknown>) => VonageNativeCallSdk {
    return (config?: Record<string, unknown>) => new VonageNativeCallSdk(readNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link VonageNativeSdkConfig} from the engine's loosely-typed `Configuration` map without ever
 * widening to `any`. Each field is read + type-checked individually so a malformed config yields a clean,
 * partially-resolved object (and {@link VonageNativeCallSdk.dial}/{@link VonageNativeCallSdk.answer} then
 * throw a precise error if the required specifier is absent) rather than a half-typed blob.
 */
export function readNativeConfig(config?: Record<string, unknown>): VonageNativeSdkConfig {
    const cfg = config ?? {};
    return {
        ApplicationId: readString(cfg.ApplicationId),
        PrivateKey: readString(cfg.PrivateKey),
        ApiKey: readString(cfg.ApiKey),
        ApiSecret: readString(cfg.ApiSecret),
        WebsocketMediaUrl: readString(cfg.WebsocketMediaUrl),
        NativeModuleSpecifier: readString(cfg.NativeModuleSpecifier),
    };
}

/** Reads a value as a non-empty string, or `undefined`. */
function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
