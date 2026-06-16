/**
 * @fileoverview `ZoomRtmsMeetingSdk` — a **real** {@link IZoomMeetingSdk} binding over Zoom's
 * **Realtime Media Streams (RTMS)** Node SDK (`@zoom/rtms`). This is the production adapter that gives
 * the agent **hearing** in a live Zoom meeting: RTMS streams **per-participant** audio to your server
 * over a webhook-initiated WebSocket, which this adapter maps onto the bridge's diarized inbound-audio
 * path (`{ Pcm, ParticipantId }`).
 *
 * ## Receive-only — the outbound-audio gap (read this)
 * RTMS is **RECEIVE-ONLY**. It delivers per-participant inbound audio/video/transcripts but **cannot
 * send the agent's synthesized audio back into the meeting**. Pushing audio *into* a Zoom meeting
 * requires the heavy native **Zoom Meeting SDK** (a C++/Linux bot build with the raw-data / virtual-mic
 * entitlement) or a third-party meeting-bot service. So this adapter implements {@link onAudioFrame}
 * (hearing) faithfully and makes {@link sendAudioFrame} a **documented, logged no-op** — see that
 * method and the package README's "Outbound audio limitation" section.
 *
 * ## How a deployment activates this
 * RTMS is initiated by a Zoom **`meeting.rtms_started` webhook** that carries the connection params
 * (`server_urls`, `meeting_uuid`, `rtms_stream_id`, `signature`). A deployment wires that webhook to
 * hand those params to {@link ZoomBridge.SetSdkFactory} via the session `Configuration` (see
 * {@link ZoomRtmsConnectionParams}); credentials (`client_id` / `client_secret`) resolve from the MJ
 * credential system / provider `Configuration` and are **never inlined**. See {@link BindZoomRtms}.
 *
 * ## Optionality
 * `@zoom/rtms` is an **optionalDependency** (a native addon requiring Node ≥ 22). This module loads it
 * **lazily** behind the seam, so `@memberjunction/ai-bridge-zoom` builds and unit-tests **without it
 * installed**. The mapping logic ({@link mapRtmsAudioFrame}, the receive-only guard) is pure and
 * tested against a fake `@zoom/rtms` with no network.
 *
 * Every spot where the precise `@zoom/rtms` API surface is assumed carries a `// VERIFY against
 * @zoom/rtms` note so a live test against a real Zoom app can confirm it.
 *
 * @module @memberjunction/ai-bridge-zoom
 * @author MemberJunction.com
 */

import { LogError, LogStatus } from '@memberjunction/core';
import {
    IZoomMeetingSdk,
    ZoomAudioFrame,
    ZoomJoinArgs,
    ZoomJoinResult,
    ZoomParticipant,
} from './zoom-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal `@zoom/rtms` surface this adapter depends on (a local structural type
// so NONE of the SDK's types leak and the package compiles WITHOUT @zoom/rtms installed).
// VERIFY against @zoom/rtms: method/callback names + arg order confirmed from the SDK README
// and quickstart (https://github.com/zoom/rtms, https://zoom.github.io/rtms/js/). Marked inline.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The per-frame metadata `@zoom/rtms` attaches to a media callback. The diarization label (the
 * participant who produced the frame) lives here.
 *
 * VERIFY against @zoom/rtms: docs surface `metadata.userName`; the numeric participant id field name
 * varies across doc snippets (`userId`). Both are read defensively in {@link mapRtmsAudioFrame}.
 */
export interface RtmsMediaMetadata {
    /** The speaking participant's display name, when present. */
    userName?: string;
    /** The speaking participant's stable id, when present. */
    userId?: string | number;
}

/**
 * The audio-callback signature `@zoom/rtms` invokes. Zoom's docs show two arities across versions —
 * `(data, timestamp, metadata)` and `(data, size, timestamp, metadata)` — so this adapter accepts a
 * superset and resolves the metadata positionally. VERIFY against @zoom/rtms.
 */
export type RtmsAudioCallback = (
    data: Uint8Array | ArrayBuffer,
    sizeOrTimestamp?: number,
    timestampOrMetadata?: number | RtmsMediaMetadata,
    metadata?: RtmsMediaMetadata,
) => void;

/** The `@zoom/rtms` `Client` surface this adapter drives. VERIFY against @zoom/rtms. */
export interface RtmsClient {
    /** Joins the RTMS stream with the webhook-derived payload. VERIFY against @zoom/rtms (sync call). */
    join(payload: Record<string, unknown>): void;
    /** Closes the RTMS connection. VERIFY against @zoom/rtms. */
    leave(): void;
    /** Registers the per-participant audio callback. VERIFY against @zoom/rtms. */
    onAudioData(cb: RtmsAudioCallback): void;
    /** Diarized active-speaker signal `(timestamp, userId, userName)`. VERIFY against @zoom/rtms. */
    onActiveSpeakerEvent?(cb: (timestamp: number, userId: string | number, userName?: string) => void): void;
    /** Fired when the RTMS stream is confirmed joined. VERIFY against @zoom/rtms (optional). */
    onJoinConfirm?(cb: (reason?: number) => void): void;
    /** Fired when the RTMS session ends / leaves. VERIFY against @zoom/rtms (optional). */
    onLeave?(cb: (reason?: number) => void): void;
    /** Fired when the session state updates (used to detect meeting end). VERIFY against @zoom/rtms (optional). */
    onSessionUpdate?(cb: (op: number, ...rest: unknown[]) => void): void;
}

/** The `@zoom/rtms` module's default export shape this adapter uses. VERIFY against @zoom/rtms. */
export interface RtmsModule {
    /** The RTMS client constructor. VERIFY against @zoom/rtms (`new rtms.Client()`). */
    Client: new () => RtmsClient;
}

/**
 * The RTMS connection params delivered by the `meeting.rtms_started` webhook. A deployment passes these
 * to the bridge via the session `Configuration` (see {@link ZoomRtmsSdkConfig}); this adapter forwards
 * them to {@link RtmsClient.join}. Field names mirror the webhook payload verbatim. VERIFY against the
 * Zoom webhook schema (https://developers.zoom.us/docs/rtms/).
 */
export interface ZoomRtmsConnectionParams {
    /** The meeting UUID from the webhook (`payload.object.meeting_uuid`). */
    meeting_uuid: string;
    /** The RTMS stream id from the webhook (`payload.object.rtms_stream_id`). */
    rtms_stream_id: string;
    /** The signaling/media server URL(s) from the webhook (`payload.object.server_urls`). */
    server_urls: string;
    /** The webhook signature (HMAC-SHA256 over client_id+meeting_uuid+rtms_stream_id), when pre-computed. */
    signature?: string;
}

/**
 * Resolved configuration for {@link ZoomRtmsMeetingSdk}. Credentials resolve **upstream** (MJ credential
 * system / provider `Configuration`) — this object carries already-resolved values; **never inline
 * secrets** at a call site.
 */
export interface ZoomRtmsSdkConfig {
    /** The Zoom app OAuth client id (resolved upstream; used for the RTMS handshake signature). */
    ClientId?: string;
    /** The Zoom app OAuth client secret (resolved upstream). Used only to sign the handshake. */
    ClientSecret?: string;
    /** The RTMS connection params handed in by the `meeting.rtms_started` webhook for this session. */
    Connection?: ZoomRtmsConnectionParams;
}

/**
 * Coerces an RTMS audio payload (a `Uint8Array` or `ArrayBuffer`) to a standalone `ArrayBuffer` the
 * bridge can forward. A `Uint8Array` view is copied so a downstream consumer never sees bytes outside
 * its window or a recycled SDK buffer.
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
 * Resolves the {@link RtmsMediaMetadata} from the audio callback's variadic tail, accommodating both
 * documented arities (`(data, timestamp, metadata)` and `(data, size, timestamp, metadata)`). VERIFY
 * against @zoom/rtms.
 */
function resolveMetadata(
    timestampOrMetadata?: number | RtmsMediaMetadata,
    metadata?: RtmsMediaMetadata,
): RtmsMediaMetadata | undefined {
    if (metadata && typeof metadata === 'object') {
        return metadata;
    }
    if (timestampOrMetadata && typeof timestampOrMetadata === 'object') {
        return timestampOrMetadata;
    }
    return undefined;
}

/**
 * Resolves the inbound capture timestamp (epoch-ms) from the callback's variadic tail across both
 * arities, falling back to `Date.now()`. VERIFY against @zoom/rtms.
 */
function resolveTimestampMs(
    sizeOrTimestamp?: number,
    timestampOrMetadata?: number | RtmsMediaMetadata,
): number {
    if (typeof timestampOrMetadata === 'number') {
        return timestampOrMetadata; // 4-arg form: (data, size, timestamp, metadata)
    }
    if (typeof sizeOrTimestamp === 'number') {
        return sizeOrTimestamp; // 3-arg form: (data, timestamp, metadata)
    }
    return Date.now();
}

/**
 * Resolves the diarization participant label from RTMS metadata. Prefers the stable `userId`, falling
 * back to `userName`, then a sentinel so a frame is never dropped for a missing label. VERIFY against
 * @zoom/rtms (metadata field names).
 */
function resolveParticipantId(metadata: RtmsMediaMetadata | undefined): string {
    if (metadata?.userId != null) {
        return String(metadata.userId);
    }
    if (metadata?.userName) {
        return metadata.userName;
    }
    return 'unknown';
}

/**
 * **Pure mapping** of one `@zoom/rtms` audio callback invocation to the bridge's diarized
 * {@link ZoomAudioFrame} (`{ Pcm, ParticipantId, DisplayName?, TimestampMs? }`). Isolated from the SDK
 * and from I/O so it is unit-tested directly. Handles both documented callback arities and both
 * payload types.
 *
 * @param data The RTMS audio bytes (PCM — VERIFY the codec/sample-rate the deployment requests; the
 *   bridge forwards raw bytes regardless).
 * @param sizeOrTimestamp Either the byte size (4-arg form) or the timestamp (3-arg form).
 * @param timestampOrMetadata Either the timestamp (4-arg form) or the metadata (3-arg form).
 * @param metadata The metadata (4-arg form), carrying the diarization label.
 * @returns The diarized inbound audio frame.
 */
export function mapRtmsAudioFrame(
    data: Uint8Array | ArrayBuffer,
    sizeOrTimestamp?: number,
    timestampOrMetadata?: number | RtmsMediaMetadata,
    metadata?: RtmsMediaMetadata,
): ZoomAudioFrame {
    const meta = resolveMetadata(timestampOrMetadata, metadata);
    return {
        Pcm: toArrayBuffer(data),
        ParticipantId: resolveParticipantId(meta),
        DisplayName: meta?.userName,
        TimestampMs: resolveTimestampMs(sizeOrTimestamp, timestampOrMetadata),
    };
}

/**
 * The injectable loader for the `@zoom/rtms` module — overridable so unit tests supply a fake module
 * with no native addon and no network. Production leaves it as {@link defaultRtmsLoader}, which lazily
 * imports the optional dependency.
 */
export type RtmsModuleLoader = () => Promise<RtmsModule>;

/** Unwraps a `{ default }` interop wrapper (CJS-with-default), returning the inner value or the input. */
function unwrapDefault(mod: unknown): unknown {
    if (mod && typeof mod === 'object' && 'default' in mod) {
        const inner = (mod as { default: unknown }).default;
        // The real `@zoom/rtms` is CJS-with-default; prefer the inner export when it carries the Client.
        if (inner && typeof inner === 'object') {
            return inner;
        }
    }
    return mod;
}

/** Structural guard: a value is an {@link RtmsModule} when it exposes a `Client` constructor. */
function isRtmsModule(value: unknown): value is RtmsModule {
    return (
        value != null &&
        typeof value === 'object' &&
        typeof (value as { Client?: unknown }).Client === 'function'
    );
}

/**
 * Lazily loads the **optional** `@zoom/rtms` dependency (category: optional peer dependency, per the
 * dynamic-import policy — it's a native addon we must not force on installs). Resolves the module's
 * default export (`@zoom/rtms` is CJS-with-default). Throws a precise, actionable error when the
 * dependency is absent so a misconfigured deployment fails loudly, not silently.
 *
 * VERIFY against @zoom/rtms: the `.default` interop shape (`import rtms from '@zoom/rtms'`).
 */
export const defaultRtmsLoader: RtmsModuleLoader = async (): Promise<RtmsModule> => {
    try {
        // The optional dep ships no types we depend on here (the ambient declaration types it as
        // `unknown`); narrow the resolved value structurally through RtmsModule at this boundary,
        // covering both CJS `.default` and ESM namespace interop forms.
        const mod: unknown = await import(/* @vite-ignore */ '@zoom/rtms');
        const resolved = unwrapDefault(mod);
        if (!isRtmsModule(resolved)) {
            throw new Error('resolved module has no Client constructor');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            "ZoomRtmsMeetingSdk could not load the optional '@zoom/rtms' dependency. Install it " +
                "(npm i @zoom/rtms — a native addon requiring Node >= 22) and ensure the deployment " +
                `wired the meeting.rtms_started webhook. Underlying error: ${message}`,
        );
    }
};

/**
 * A **real** {@link IZoomMeetingSdk} over Zoom RTMS (`@zoom/rtms`).
 *
 * Gives the agent **hearing** — per-participant inbound audio mapped to diarized {@link ZoomAudioFrame}s
 * via {@link mapRtmsAudioFrame}. Because RTMS is **receive-only**, the outbound and host-control surfaces
 * ({@link sendAudioFrame}, {@link postChatMessage}, {@link muteParticipant}) are documented no-ops here
 * (each warns once) — those require the native Zoom Meeting SDK / a bot service.
 *
 * Construct via {@link BindZoomRtms} (the factory the bridge's `SetSdkFactory` wants), not directly, so
 * config resolution + the lazy loader are wired consistently.
 */
export class ZoomRtmsMeetingSdk implements IZoomMeetingSdk {
    /** Resolved config (credentials + the webhook connection params for this session). */
    private readonly config: ZoomRtmsSdkConfig;

    /** The module loader (overridable for tests). */
    private readonly loadModule: RtmsModuleLoader;

    /** The live RTMS client once {@link join} succeeds. */
    private client: RtmsClient | null = null;

    /** The inbound per-participant audio handler registered by the bridge. */
    private audioHandler?: (frame: ZoomAudioFrame) => void;

    /** The participant-join handler (driven from RTMS active-speaker discovery). */
    private joinHandler?: (participant: ZoomParticipant) => void;

    /** The participant-leave handler. */
    private leaveHandler?: (participantId: string) => void;

    /** The meeting-ended handler. */
    private endedHandler?: () => void;

    /**
     * Live roster discovered from RTMS, keyed by participant id. RTMS does not expose a host roster API
     * the way the Meeting SDK does, so the roster is **observed** from audio/active-speaker events.
     * VERIFY against @zoom/rtms (whether a participant-list/event API exists to seed this directly).
     */
    private readonly roster = new Map<string, ZoomParticipant>();

    /** One-time warning guards for the receive-only no-op surfaces. */
    private warnedSend = false;
    private warnedChat = false;
    private warnedMute = false;
    private warnedHandRaise = false;

    /**
     * @param config Resolved credentials + the per-session RTMS connection params (from the webhook).
     * @param loadModule The `@zoom/rtms` loader (defaults to the lazy optional-dependency loader).
     */
    constructor(config: ZoomRtmsSdkConfig, loadModule: RtmsModuleLoader = defaultRtmsLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── IZoomMeetingSdk — the hearing path (real) ─────────────────────────────────────

    /**
     * Establishes the RTMS session for the target meeting using the webhook-delivered connection params
     * and brings the agent's hearing online. The RTMS stream is initiated by the `meeting.rtms_started`
     * webhook; this method consumes those params (from {@link ZoomRtmsSdkConfig.Connection}) and joins.
     *
     * @param args The bridge's join args (meeting number used as the durable id; auth resolves upstream).
     * @returns The bot/connection identifiers.
     * @throws When `@zoom/rtms` is not installed or the webhook connection params are missing.
     */
    public async join(args: ZoomJoinArgs): Promise<ZoomJoinResult> {
        const connection = this.config.Connection;
        if (!connection) {
            throw new Error(
                'ZoomRtmsMeetingSdk.join: no RTMS connection params. RTMS is webhook-initiated — wire the ' +
                    "meeting.rtms_started webhook to hand { server_urls, meeting_uuid, rtms_stream_id, signature } " +
                    'into the session Configuration before connecting. See the package README.',
            );
        }
        const mod = await this.loadModule();
        const client = new mod.Client();
        this.wireClient(client);
        // VERIFY against @zoom/rtms: join() takes the webhook payload object directly and is synchronous.
        client.join(this.buildJoinPayload(connection));
        this.client = client;

        return {
            // RTMS has no in-meeting "bot participant" (it's a passive listener), so the stream id is the
            // stable self/connection handle; the meeting id is the bare meeting number when supplied,
            // else the meeting UUID. VERIFY against @zoom/rtms.
            BotParticipantId: `rtms:${connection.rtms_stream_id}`,
            MeetingId: args.MeetingNumber || connection.meeting_uuid,
        };
    }

    /** Closes the RTMS connection and clears session state. Tolerant of teardown errors. */
    public async leave(): Promise<void> {
        const client = this.client;
        this.client = null;
        this.roster.clear();
        if (client) {
            try {
                client.leave(); // VERIFY against @zoom/rtms (sync leave()).
            } catch (err) {
                LogError(`[ZoomRtmsMeetingSdk] leave() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /** Registers the inbound per-participant audio handler (the diarized hearing path). */
    public onAudioFrame(cb: (frame: ZoomAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    /** Registers the participant-join handler (driven from RTMS active-speaker discovery). */
    public onParticipantJoin(cb: (participant: ZoomParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the participant-leave handler. */
    public onParticipantLeave(cb: (participantId: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Returns the roster observed from RTMS so far (RTMS exposes no host roster API). */
    public async getParticipants(): Promise<ZoomParticipant[]> {
        return Array.from(this.roster.values());
    }

    /** Registers the meeting-ended handler (fired from the RTMS session/leave signal). */
    public onMeetingEnded(cb: () => void): void {
        this.endedHandler = cb;
    }

    // ── IZoomMeetingSdk — receive-only no-op surfaces (documented gaps) ───────────────

    /**
     * **RTMS is receive-only — this CANNOT send the agent's audio into the meeting.** Pushing audio into
     * a Zoom meeting requires the native Zoom Meeting SDK / a bot service. To avoid crashing a live
     * session each time the realtime model emits an audio frame, this **logs a one-time warning and
     * no-ops** rather than throwing. See the package README's "Outbound audio limitation".
     *
     * @param _pcm The PCM the agent would speak — discarded; RTMS has no send path.
     */
    public sendAudioFrame(_pcm: ArrayBuffer): void {
        if (!this.warnedSend) {
            this.warnedSend = true;
            LogStatus(
                '[ZoomRtmsMeetingSdk] Outbound audio into Zoom requires the Zoom Meeting SDK / a bot service; ' +
                    'RTMS is receive-only. Dropping the agent\'s outbound audio. See the package README. ' +
                    '(This warning logs once per session.)',
            );
        }
    }

    /**
     * Native hand-raise is delivered (if at all) only via the Meeting SDK, not RTMS — registering is a
     * documented one-time-warned no-op so the bridge's wiring is harmless.
     */
    public onHandRaise(_cb: (participantId: string, raised: boolean) => void): void {
        if (!this.warnedHandRaise) {
            this.warnedHandRaise = true;
            LogStatus('[ZoomRtmsMeetingSdk] Hand-raise signals are not available over RTMS (receive-only). No-op.');
        }
    }

    /**
     * In-meeting chat is a host/Meeting-SDK control, not an RTMS capability — a one-time-warned no-op.
     *
     * @param _text The chat text the agent would post — discarded over RTMS.
     */
    public async postChatMessage(_text: string): Promise<void> {
        if (!this.warnedChat) {
            this.warnedChat = true;
            LogStatus('[ZoomRtmsMeetingSdk] In-meeting chat is not available over RTMS (receive-only). No-op.');
        }
    }

    /**
     * Host mute is a Meeting-SDK control, not an RTMS capability — a one-time-warned no-op.
     *
     * @param _participantId The participant the facilitator would mute — discarded over RTMS.
     */
    public async muteParticipant(_participantId: string): Promise<void> {
        if (!this.warnedMute) {
            this.warnedMute = true;
            LogStatus('[ZoomRtmsMeetingSdk] Participant mute is not available over RTMS (receive-only). No-op.');
        }
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Wires the RTMS client's callbacks to this adapter's handlers. */
    private wireClient(client: RtmsClient): void {
        client.onAudioData((data, sizeOrTimestamp, timestampOrMetadata, metadata) =>
            this.handleAudio(data, sizeOrTimestamp, timestampOrMetadata, metadata),
        );
        // Active-speaker is the most reliable participant-discovery signal RTMS exposes; use it to keep
        // the observed roster current. VERIFY against @zoom/rtms.
        client.onActiveSpeakerEvent?.((_timestamp, userId, userName) =>
            this.observeParticipant(String(userId), userName),
        );
        // Session end → meeting ended. VERIFY against @zoom/rtms (onLeave/onSessionUpdate semantics).
        client.onLeave?.(() => this.handleEnded());
        client.onSessionUpdate?.((op) => {
            // VERIFY against @zoom/rtms: which op code denotes session-stopped. Treat a leave-like signal
            // conservatively; the explicit onLeave above is the primary path.
            if (op === 0) {
                this.handleEnded();
            }
        });
    }

    /** Maps + forwards one RTMS audio frame, and observes its speaker into the roster. */
    private handleAudio(
        data: Uint8Array | ArrayBuffer,
        sizeOrTimestamp?: number,
        timestampOrMetadata?: number | RtmsMediaMetadata,
        metadata?: RtmsMediaMetadata,
    ): void {
        const frame = mapRtmsAudioFrame(data, sizeOrTimestamp, timestampOrMetadata, metadata);
        this.observeParticipant(frame.ParticipantId, frame.DisplayName);
        this.audioHandler?.(frame);
    }

    /** Records a newly-seen participant in the observed roster and fires the join handler once. */
    private observeParticipant(participantId: string, displayName?: string): void {
        if (!participantId || participantId === 'unknown') {
            return;
        }
        const key = participantId.trim().toLowerCase();
        if (this.roster.has(key)) {
            return;
        }
        const participant: ZoomParticipant = {
            ParticipantId: participantId,
            DisplayName: displayName,
            Role: 'Participant',
        };
        this.roster.set(key, participant);
        this.joinHandler?.(participant);
    }

    /** Fires the meeting-ended handler once and clears the roster. */
    private handleEnded(): void {
        this.roster.clear();
        this.endedHandler?.();
    }

    /**
     * Builds the `@zoom/rtms` `join()` payload from the webhook connection params + resolved credentials.
     * Field names mirror the webhook payload Zoom hands the SDK verbatim. VERIFY against @zoom/rtms.
     */
    private buildJoinPayload(connection: ZoomRtmsConnectionParams): Record<string, unknown> {
        return {
            meeting_uuid: connection.meeting_uuid,
            rtms_stream_id: connection.rtms_stream_id,
            server_urls: connection.server_urls,
            // The SDK computes the handshake signature from client creds when not pre-supplied; pass
            // both through so either path works. NEVER inline secrets — these are resolved upstream.
            signature: connection.signature,
            client_id: this.config.ClientId,
            client_secret: this.config.ClientSecret,
        };
    }
}

/**
 * Builds the {@link ZoomMeetingSdkFactory}-shaped factory that constructs a {@link ZoomRtmsMeetingSdk}
 * from the bridge's per-session `Configuration`. Pass the result to `ZoomBridge.SetSdkFactory(...)` so a
 * deployment activates real Zoom RTMS **without code changes** to the driver.
 *
 * The factory reads `ClientId` / `ClientSecret` (resolved upstream — **never inline secrets**) and the
 * webhook-delivered `Connection` params out of the config map the engine passes at connect.
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindZoomRtms());
 *
 * @param loadModule Optional `@zoom/rtms` loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => ZoomRtmsMeetingSdk`.
 */
export function BindZoomRtms(
    loadModule: RtmsModuleLoader = defaultRtmsLoader,
): (config?: Record<string, unknown>) => ZoomRtmsMeetingSdk {
    return (config?: Record<string, unknown>) => new ZoomRtmsMeetingSdk(readRtmsConfig(config), loadModule);
}

/**
 * Extracts a {@link ZoomRtmsSdkConfig} from the engine's loosely-typed `Configuration` map without ever
 * widening to `any`. Strings are read individually; the `Connection` block is validated field-by-field
 * so a malformed webhook payload yields `undefined` (and {@link ZoomRtmsMeetingSdk.join} then throws a
 * precise error) rather than a half-formed connection.
 */
export function readRtmsConfig(config?: Record<string, unknown>): ZoomRtmsSdkConfig {
    const cfg = config ?? {};
    return {
        ClientId: readString(cfg.ClientId),
        ClientSecret: readString(cfg.ClientSecret),
        Connection: readConnection(cfg.Connection),
    };
}

/** Reads a value as a non-empty string, or `undefined`. */
function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Validates the loosely-typed `Connection` block into {@link ZoomRtmsConnectionParams} or `undefined`. */
function readConnection(value: unknown): ZoomRtmsConnectionParams | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    const meetingUuid = readString(record.meeting_uuid);
    const streamId = readString(record.rtms_stream_id);
    const serverUrls = readString(record.server_urls);
    if (!meetingUuid || !streamId || !serverUrls) {
        return undefined;
    }
    return {
        meeting_uuid: meetingUuid,
        rtms_stream_id: streamId,
        server_urls: serverUrls,
        signature: readString(record.signature),
    };
}
