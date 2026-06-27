/**
 * @fileoverview `RealTeamsBindings` — a production {@link ITeamsMeetingSdk} implementation over the real
 * **Microsoft Graph cloud-communications API** (`/communications/calls`) + the **ACS application-hosted-media**
 * audio sockets, plus the **pure** join-payload / meeting-URL / roster helpers it (and the MJAPI ingress)
 * build on.
 *
 * ## Why injected client surfaces (not `import { Client } from '@microsoft/microsoft-graph-client'`)
 * To stay buildable + unit-testable WITHOUT the Graph / ACS SDKs installed and WITHOUT any network, this
 * module does NOT import them directly. Instead it depends on two tiny, local structural surfaces:
 *  - {@link IGraphCallsLike} — the handful of Graph cloud-communications operations we use: create/join a
 *    call (`POST /communications/calls`), read its participants, post a chat message
 *    (`POST /chats/{id}/messages`), mute a participant, and hang up the call leg.
 *  - {@link IAcsMediaLike} — the application-hosted-media inbound/outbound **audio sockets** (the bot's
 *    per-participant hearing + its voice), expressed as raw PCM frame in/out + the roster/lifecycle events
 *    the media + signaling plane surfaces.
 *
 * Production wires these over `@microsoft/microsoft-graph-client` (the REST control plane) and the ACS
 * calling-bot media SDK (the audio plane); tests inject fakes. NONE of the Graph/ACS SDK types leak into
 * this package. The packages are declared in `optionalDependencies` (CLAUDE rule 8, category 2 — optional
 * peer SDKs loaded only when the Teams provider is configured) and are resolved by the host's
 * native-adapter wiring, never statically imported here.
 *
 * ## The audio contract (T0 codec)
 * ACS application-hosted media delivers/accepts **raw linear PCM** on the audio sockets (typically 16 kHz
 * mono PCM16). The {@link ITeamsMeetingSdk} seam speaks **PCM16 `ArrayBuffer`** at the model's rate. When
 * the ACS socket rate and the model rate differ, all resampling goes through the shared T0 codec
 * ({@link resamplePcm16Buffer} from `@memberjunction/ai-bridge-base`) — never reimplemented here. Per-frame
 * speaker labels (the ACS source participant id) ride through unchanged for diarization.
 *
 * ## Mapping to the documented binding (see `teams-sdk.ts`)
 *  - `join`        → Graph `POST /communications/calls` (join by meeting URL/coordinates); returns
 *                    `{ BotParticipantId, CallId }`.
 *  - `leave`       → Graph call `DELETE` (the bot's call-leg lifecycle).
 *  - `sendAudioFrame` → ACS outbound audio socket (the bot's voice in), transcoded via the T0 codec.
 *  - `onAudioFrame`   → ACS per-participant inbound audio socket (diarized hearing), transcoded via T0.
 *  - `getParticipants`/`onParticipantJoin`/`onParticipantLeave` → the call participants collection +
 *                    `participantsUpdated` change notifications.
 *  - `postChatMessage` → Graph `POST /chats/{id}/messages` against the meeting's chat thread.
 *  - `muteParticipant` → the call's `participant:mute` action.
 *  - `onHandRaise`     → the raised-hand signal — **tolerated as absent**: never throws if a tenant/build
 *                    does not surface it; the handler simply never fires.
 *  - `onMeetingEnded`  → the call's `callEnded` / `terminated` status.
 *
 * @module @memberjunction/ai-bridge-teams
 * @author MemberJunction.com
 * @see {@link ITeamsMeetingSdk} — the seam this implements.
 * @see `/plans/realtime/bridges-and-widget/meeting-vendor-bindings-teams-slack.md` §1b, §2 (M1).
 */

import { resamplePcm16Buffer } from '@memberjunction/ai-bridge-base';
import {
    ITeamsMeetingSdk,
    TeamsAudioFrame,
    TeamsJoinArgs,
    TeamsJoinResult,
    TeamsParticipant,
    TeamsParticipantRole,
} from './teams-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers — join-payload construction, meeting-URL/coordinate parsing, roster
// normalization, and audio transcode. No network, no SDK. Exported so the MJAPI
// ingress + the unit tests reuse them verbatim.
// ──────────────────────────────────────────────────────────────────────────────

/** The Graph create-call meeting-coordinate fields parsed out of a Teams join URL. */
export interface TeamsMeetingCoordinates {
    /** The meeting **thread id** (the chat/conversation id behind the join URL, e.g. `19:meeting_…@thread.v2`). */
    ThreadId: string;
    /** The organizer's Azure AD object id, when the join URL encodes it (Graph `organizer.identity.user.id`). */
    OrganizerId?: string;
    /** The Azure tenant id, when the join URL encodes it (Graph `tid`). */
    TenantId?: string;
    /** The meeting message/conversation message id (Graph `messageId`), when present. `'0'` for most meetings. */
    MessageId?: string;
}

/**
 * **Pure** parse of a Teams `meetup-join` URL into the Graph create-call meeting coordinates. The Teams join
 * link embeds the thread id in its path (URL-encoded) and the organizer/tenant in the `context` query param
 * (URL-encoded JSON), e.g.
 * `https://teams.microsoft.com/l/meetup-join/19%3Ameeting_X%40thread.v2/0?context=%7B%22Tid%22%3A%22…%22%2C%22Oid%22%3A%22…%22%7D`.
 *
 * Decodes the thread id and (best-effort) the `Tid`/`Oid` from `context`. Returns `null` when the URL carries
 * no recognizable thread id, so the caller can fall back to an explicitly-supplied `ThreadId`. Never throws on
 * a malformed `context` blob — the meeting can still be joined by thread id alone.
 *
 * @param joinUrl The Teams meeting join URL.
 * @returns The parsed coordinates, or `null` when no thread id can be extracted.
 */
export function parseTeamsJoinUrl(joinUrl: string): TeamsMeetingCoordinates | null {
    const threadId = extractThreadId(joinUrl);
    if (!threadId) {
        return null;
    }
    const context = extractJoinContext(joinUrl);
    const messageId = extractMessageId(joinUrl);
    return {
        ThreadId: threadId,
        ...(context.OrganizerId ? { OrganizerId: context.OrganizerId } : {}),
        ...(context.TenantId ? { TenantId: context.TenantId } : {}),
        ...(messageId ? { MessageId: messageId } : {}),
    };
}

/** The Graph `POST /communications/calls` request body (the subset we construct for a join-by-URL bot call). */
export interface GraphCreateCallRequest {
    /** Always `'meeting'` — the bot joins an existing scheduled/online meeting (vs a peer-to-peer call). */
    CallType: 'meeting';
    /** The bot's display name in the participant list. */
    BotDisplayName: string;
    /** The original Teams join URL (Graph `meetingInfo.joinWebUrl`). */
    JoinWebUrl: string;
    /** The parsed meeting thread id (the durable meeting coordinate + chat target). */
    ThreadId: string;
    /** The meeting organizer's id, when resolved (helps Graph bind the call to the right meeting). */
    OrganizerId?: string;
    /** The Azure tenant id, when joining cross-tenant. */
    TenantId?: string;
    /** The application-hosted-media flag — this bot owns its media socket (vs service-hosted media). */
    AppHostedMedia: true;
}

/**
 * **Pure** construction of the Graph `POST /communications/calls` request body for a join-by-URL,
 * application-hosted-media bot call. Prefers an explicitly-supplied `ThreadId`/`TenantId` (resolved upstream)
 * over what the URL encodes, then fills the rest from {@link parseTeamsJoinUrl}. Throws when neither an
 * explicit thread id nor a parseable join URL is available, so a malformed join fails loud at the seam.
 *
 * Isolated from I/O so the request shape unit-tests directly and the live MJAPI wiring reuses it verbatim.
 *
 * @param args The bridge's join args (join URL, optional thread id, bot name, tenant).
 * @returns The Graph create-call request body.
 * @throws When no thread id can be resolved (neither explicit nor from the URL).
 */
export function buildGraphCreateCallRequest(args: TeamsJoinArgs): GraphCreateCallRequest {
    const parsed = parseTeamsJoinUrl(args.JoinUrl);
    const threadId = args.ThreadId ?? parsed?.ThreadId;
    if (!threadId) {
        throw new Error(
            'buildGraphCreateCallRequest: could not resolve a meeting thread id. Supply TeamsJoinArgs.ThreadId ' +
                `or a join URL containing the meeting thread id. Got join URL: '${args.JoinUrl}'.`,
        );
    }
    const tenantId = args.TenantId ?? parsed?.TenantId;
    const organizerId = parsed?.OrganizerId;
    return {
        CallType: 'meeting',
        BotDisplayName: args.BotDisplayName,
        JoinWebUrl: args.JoinUrl,
        ThreadId: threadId,
        ...(organizerId ? { OrganizerId: organizerId } : {}),
        ...(tenantId ? { TenantId: tenantId } : {}),
        AppHostedMedia: true,
    };
}

/** One Graph call participant as the participants collection / `participantsUpdated` notification reports it. */
export interface GraphCallParticipant {
    /** The Graph participant id (`participant.id`) — stable for the participant's presence in the call. */
    id: string;
    /** The participant's display name (`participant.info.identity.user.displayName`), when known. */
    displayName?: string;
    /** The Graph meeting role string (`'organizer'` / `'presenter'` / `'coorganizer'` / `'attendee'`). */
    role?: string;
    /** Whether this participant is the bot's own call leg (`participant.isInLobby === false && isSelf`). */
    isSelf?: boolean;
}

/** Normalizes a Graph meeting role string onto the bridge's {@link TeamsParticipantRole}. */
export function mapGraphRole(role?: string): TeamsParticipantRole {
    switch ((role ?? '').trim().toLowerCase()) {
        case 'organizer':
            return 'Organizer';
        case 'presenter':
        case 'coorganizer':
        case 'co-organizer':
            return 'Presenter';
        default:
            return 'Attendee';
    }
}

/**
 * **Pure** normalization of one Graph call participant onto the bridge's {@link TeamsParticipant}. Isolated
 * from the Graph SDK and from I/O so it unit-tests directly.
 */
export function normalizeGraphParticipant(p: GraphCallParticipant): TeamsParticipant {
    return {
        ParticipantId: p.id,
        DisplayName: p.displayName,
        Role: mapGraphRole(p.role),
        IsSelf: p.isSelf,
    };
}

/** **Pure** normalization of a full Graph participants collection onto the bridge roster. */
export function normalizeGraphRoster(participants: GraphCallParticipant[]): TeamsParticipant[] {
    return participants.map(normalizeGraphParticipant);
}

/** One raw per-participant audio frame the ACS inbound socket surfaces (PCM at the socket's sample rate). */
export interface AcsInboundAudioFrame {
    /** Raw little-endian PCM16 bytes for this frame. */
    Pcm: ArrayBuffer;
    /** The ACS source participant id this audio came from (the diarization speaker label). */
    ParticipantId: string;
    /** The participant's display name at capture time, when ACS provides it. */
    DisplayName?: string;
    /** Optional epoch-ms capture timestamp. */
    TimestampMs?: number;
}

/**
 * **Pure** transcode of one inbound ACS audio frame to the bridge's diarized {@link TeamsAudioFrame},
 * resampling from the ACS socket rate to the model rate via the T0 codec when they differ. The speaker
 * label and timestamp pass through unchanged. Isolated for direct testing.
 *
 * @param frame The inbound ACS audio frame (PCM16 at `acsRate`).
 * @param acsRate The ACS audio-socket sample rate (Hz).
 * @param modelRate The realtime model's expected inbound sample rate (Hz).
 * @returns The diarized PCM16 frame at the model rate.
 */
export function transcodeInboundAudio(
    frame: AcsInboundAudioFrame,
    acsRate: number,
    modelRate: number,
): TeamsAudioFrame {
    const pcm = acsRate === modelRate ? frame.Pcm : resamplePcm16Buffer(frame.Pcm, acsRate, modelRate);
    return {
        Pcm: pcm,
        ParticipantId: frame.ParticipantId,
        DisplayName: frame.DisplayName,
        TimestampMs: typeof frame.TimestampMs === 'number' ? frame.TimestampMs : Date.now(),
    };
}

/**
 * **Pure** transcode of one outbound PCM16 frame (the agent's voice, at the model rate) to the ACS outbound
 * socket rate via the T0 codec when they differ. Returns a fresh buffer the caller can hand straight to the
 * ACS outbound socket.
 *
 * @param pcm The agent's outbound PCM16 audio at `modelRate`.
 * @param modelRate The realtime model's outbound sample rate (Hz).
 * @param acsRate The ACS audio-socket sample rate (Hz).
 * @returns The PCM16 audio at the ACS socket rate.
 */
export function transcodeOutboundAudio(pcm: ArrayBuffer, modelRate: number, acsRate: number): ArrayBuffer {
    return modelRate === acsRate ? pcm.slice(0) : resamplePcm16Buffer(pcm, modelRate, acsRate);
}

/** Extracts and URL-decodes the `19:meeting_…@thread.v2` thread id from a Teams `meetup-join` URL path. */
function extractThreadId(joinUrl: string): string | undefined {
    const match = joinUrl.match(/meetup-join\/([^/?#]+)/i);
    if (!match) {
        return undefined;
    }
    const decoded = safeDecode(match[1]);
    return decoded.length > 0 ? decoded : undefined;
}

/** Best-effort extract of the `0`-or-message-id segment that follows the thread id in the join URL path. */
function extractMessageId(joinUrl: string): string | undefined {
    const match = joinUrl.match(/meetup-join\/[^/?#]+\/([^/?#]+)/i);
    if (!match) {
        return undefined;
    }
    const decoded = safeDecode(match[1]);
    return decoded.length > 0 ? decoded : undefined;
}

/** Best-effort parse of the `context` query param (URL-encoded JSON with `Tid`/`Oid`). Never throws. */
function extractJoinContext(joinUrl: string): { OrganizerId?: string; TenantId?: string } {
    const match = joinUrl.match(/[?&]context=([^&#]+)/i);
    if (!match) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(safeDecode(match[1]));
        if (parsed && typeof parsed === 'object') {
            const obj = parsed as Record<string, unknown>;
            return {
                OrganizerId: readNonEmptyString(obj.Oid),
                TenantId: readNonEmptyString(obj.Tid),
            };
        }
    } catch {
        // Malformed context — the meeting is still joinable by thread id; swallow and return nothing.
    }
    return {};
}

/** URL-decodes a segment, falling back to the raw value if it is not valid percent-encoding. */
function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** Reads a value as a non-empty string, or `undefined`. */
function readNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// Injected minimal client surfaces — the seams RealTeamsBindings drives. Production
// wires these over the real Graph client + the ACS application-hosted-media SDK;
// tests inject fakes. NONE of the Graph/ACS SDK types leak into this package.
// ──────────────────────────────────────────────────────────────────────────────

/** What {@link IGraphCallsLike.CreateCall} resolves to — the bot's call-leg + participant handles. */
export interface GraphCreateCallResult {
    /** The Graph call id (`/communications/calls/{id}`) — the durable external connection id. */
    CallId: string;
    /** The bot's own participant id in the joined call. */
    BotParticipantId: string;
}

/**
 * The minimal Microsoft Graph cloud-communications surface {@link RealTeamsBindings} drives — just the
 * control-plane operations we use. A production wiring implements this over
 * `@microsoft/microsoft-graph-client` (`Client.api('/communications/calls').post(...)`, etc.); tests inject
 * a fake. NO Graph SDK types leak through this surface.
 */
export interface IGraphCallsLike {
    /** Creates/joins a meeting call (`POST /communications/calls`); resolves the call + bot participant ids. */
    CreateCall(request: GraphCreateCallRequest): Promise<GraphCreateCallResult>;
    /** Hangs up the bot's call leg (`DELETE /communications/calls/{id}`). */
    DeleteCall(callId: string): Promise<void>;
    /** Reads the call's current participants collection (`GET /communications/calls/{id}/participants`). */
    GetParticipants(callId: string): Promise<GraphCallParticipant[]>;
    /** Posts a chat message to the meeting thread (`POST /chats/{threadId}/messages`). */
    PostChatMessage(threadId: string, text: string): Promise<void>;
    /** Mutes a participant (`POST /communications/calls/{id}/participants/{pid}/mute`). */
    MuteParticipant(callId: string, participantId: string): Promise<void>;
    /** Registers the participants-changed handler (`participantsUpdated` change notifications). */
    OnParticipantsUpdated(callId: string, handler: (participants: GraphCallParticipant[]) => void): void;
    /** Registers the call-ended handler (`callEnded` / `terminated` status notification). */
    OnCallEnded(callId: string, handler: () => void): void;
}

/**
 * The ACS application-hosted-media audio plane for a single call — the bot's per-participant inbound
 * **hearing** socket and its outbound **voice** socket, plus the (optionally-absent) raised-hand signal.
 * Production wires this over the ACS calling-bot media SDK; tests inject a fake. Speaks raw PCM16 frames;
 * the T0 transcode happens in {@link RealTeamsBindings} via the pure helpers above.
 */
export interface IAcsMediaLike {
    /** The ACS audio-socket sample rate in Hz (e.g. 16000) — used to drive T0 resampling. */
    readonly SampleRate: number;
    /** Sends one outbound PCM16 frame on the bot's outbound audio socket (the agent's voice). */
    SendAudioFrame(callId: string, pcm: ArrayBuffer): void;
    /** Registers the inbound per-participant audio handler on the bot's inbound socket (latest wins). */
    OnAudioFrame(callId: string, handler: (frame: AcsInboundAudioFrame) => void): void;
    /**
     * Registers the raised-hand handler, when the platform exposes it. **Optional** — a tenant/build that
     * does not surface a clean per-participant hand-raise event simply omits this method, and the binding
     * tolerates its absence (never throws). "Latest handler wins" when present.
     */
    OnHandRaise?(callId: string, handler: (participantId: string, raised: boolean) => void): void;
}

/** Options {@link RealTeamsBindings} needs at construction — the injected client surfaces + audio rates. */
export interface RealTeamsBindingsOptions {
    /** The Graph cloud-communications control-plane surface (create/join call, roster, chat, mute, hangup). */
    Graph: IGraphCallsLike;
    /** The ACS application-hosted-media audio plane (inbound hearing + outbound voice + hand-raise). */
    Media: IAcsMediaLike;
    /**
     * The realtime model's PCM16 sample rate (Hz) the seam carries on both directions. The binding
     * resamples between this and {@link IAcsMediaLike.SampleRate} via the T0 codec. Defaults to 16000.
     */
    ModelSampleRate?: number;
}

/**
 * Production {@link ITeamsMeetingSdk} over the real Graph cloud-communications API + ACS
 * application-hosted-media sockets, expressed against the injected {@link IGraphCallsLike} /
 * {@link IAcsMediaLike} surfaces so it builds and unit-tests with no Graph/ACS install and no network.
 *
 * - `join`            → Graph `CreateCall` with the {@link buildGraphCreateCallRequest} body; wires the ACS
 *                       audio + roster + lifecycle callbacks; returns `{ BotParticipantId, CallId }`.
 * - `leave`           → Graph `DeleteCall`.
 * - `sendAudioFrame`  → ACS outbound socket, resampled model→ACS rate via T0.
 * - `onAudioFrame`    → ACS inbound socket, resampled ACS→model rate via T0, with the speaker label.
 * - `getParticipants` → Graph `GetParticipants`, normalized via {@link normalizeGraphRoster}.
 * - `postChatMessage` → Graph `PostChatMessage` on the meeting thread.
 * - `muteParticipant` → Graph `MuteParticipant`.
 * - `onHandRaise`     → ACS `OnHandRaise` when present; **no-op (tolerated) when absent**.
 * - `onMeetingEnded`  → Graph `OnCallEnded`.
 */
export class RealTeamsBindings implements ITeamsMeetingSdk {
    private readonly graph: IGraphCallsLike;
    private readonly media: IAcsMediaLike;
    private readonly modelSampleRate: number;

    /** The active call id once {@link join} succeeds (the durable external connection id). */
    private callId: string | null = null;
    /** The meeting thread id resolved at join (the chat-post target + meeting coordinate). */
    private threadId: string | null = null;

    private audioHandler?: (frame: TeamsAudioFrame) => void;
    private joinHandler?: (participant: TeamsParticipant) => void;
    private leaveHandler?: (participantId: string) => void;
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;
    private endedHandler?: () => void;

    /** The last roster snapshot, kept so `participantsUpdated` can diff into join/leave events. */
    private lastRoster: TeamsParticipant[] = [];

    constructor(options: RealTeamsBindingsOptions) {
        this.graph = options.Graph;
        this.media = options.Media;
        this.modelSampleRate = options.ModelSampleRate ?? 16000;
    }

    /** @inheritdoc */
    public async join(args: TeamsJoinArgs): Promise<TeamsJoinResult> {
        const request = buildGraphCreateCallRequest(args);
        const result = await this.graph.CreateCall(request);
        this.callId = result.CallId;
        this.threadId = request.ThreadId;
        this.wireCallbacks(result.CallId);
        return { BotParticipantId: result.BotParticipantId, CallId: result.CallId };
    }

    /** @inheritdoc */
    public async leave(): Promise<void> {
        const callId = this.callId;
        this.callId = null;
        this.threadId = null;
        this.lastRoster = [];
        if (callId) {
            await this.graph.DeleteCall(callId);
        }
    }

    /** @inheritdoc */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        if (!this.callId) {
            return;
        }
        const out = transcodeOutboundAudio(pcm, this.modelSampleRate, this.media.SampleRate);
        this.media.SendAudioFrame(this.callId, out);
    }

    /** @inheritdoc */
    public onAudioFrame(cb: (frame: TeamsAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    /** @inheritdoc */
    public onParticipantJoin(cb: (participant: TeamsParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** @inheritdoc */
    public onParticipantLeave(cb: (participantId: string) => void): void {
        this.leaveHandler = cb;
    }

    /** @inheritdoc */
    public onHandRaise(cb: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = cb;
    }

    /** @inheritdoc */
    public async getParticipants(): Promise<TeamsParticipant[]> {
        if (!this.callId) {
            return [];
        }
        const roster = normalizeGraphRoster(await this.graph.GetParticipants(this.callId));
        this.lastRoster = roster;
        return roster;
    }

    /** @inheritdoc */
    public async postChatMessage(text: string): Promise<void> {
        if (!this.threadId) {
            return;
        }
        await this.graph.PostChatMessage(this.threadId, text);
    }

    /** @inheritdoc */
    public async muteParticipant(participantId: string): Promise<void> {
        if (!this.callId) {
            return;
        }
        await this.graph.MuteParticipant(this.callId, participantId);
    }

    /** @inheritdoc */
    public onMeetingEnded(cb: () => void): void {
        this.endedHandler = cb;
    }

    /** Wires the Graph + ACS callbacks for the joined call to this binding's seam handlers. */
    private wireCallbacks(callId: string): void {
        this.media.OnAudioFrame(callId, (frame) =>
            this.audioHandler?.(transcodeInboundAudio(frame, this.media.SampleRate, this.modelSampleRate)),
        );
        this.graph.OnParticipantsUpdated(callId, (participants) =>
            this.handleRosterUpdate(normalizeGraphRoster(participants)),
        );
        this.graph.OnCallEnded(callId, () => this.endedHandler?.());
        // Hand-raise is partial on Teams — only wire it when the ACS plane exposes the optional method. Its
        // absence is tolerated (no throw); the handler simply never fires on tenants/builds without it.
        this.media.OnHandRaise?.(callId, (participantId, raised) =>
            this.handRaiseHandler?.(participantId, raised),
        );
    }

    /** Diffs a fresh roster against the last snapshot and emits per-participant join/leave events. */
    private handleRosterUpdate(roster: TeamsParticipant[]): void {
        const previousIds = new Set(this.lastRoster.map((p) => p.ParticipantId));
        const currentIds = new Set(roster.map((p) => p.ParticipantId));
        for (const p of roster) {
            if (!previousIds.has(p.ParticipantId)) {
                this.joinHandler?.(p);
            }
        }
        for (const id of previousIds) {
            if (!currentIds.has(id)) {
                this.leaveHandler?.(id);
            }
        }
        this.lastRoster = roster;
    }
}
