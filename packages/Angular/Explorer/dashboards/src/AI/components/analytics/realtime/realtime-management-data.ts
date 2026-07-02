/**
 * @fileoverview Shared data layer for the **Realtime management** section.
 *
 * Distinct from `realtime-session-data.ts` (which powers the operational
 * *analytics* on voice sessions), this module loads the whole realtime + bridge
 * **management** surface described in §11b of the Realtime Bridges architecture:
 * bridge providers, agent identities, channels, provider→channel contributions,
 * co-agent pairings, live + historical session bridges, and bridge
 * participants. Everything loads in one batched `RunViews` call and is folded
 * into per-surface view models client-side.
 *
 * The pure aggregation in {@link BucketSessionBridgesByDay} +
 * {@link SummarizeBridgesByProvider} / {@link SummarizeBridgesByStatus} is
 * extracted here (no Angular, no `RunView`) so it can be unit-tested in
 * isolation — see `realtime-management-data.spec.ts`.
 */

import { IMetadataProvider, RunView } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import type {
    MJAIBridgeProviderEntity_IBridgeProviderFeatures
} from '@memberjunction/core-entities';

// ─────────────────────────────────────────────────────────────────────────────
// Raw row shapes (ResultType: 'simple', narrowed Fields)
// ─────────────────────────────────────────────────────────────────────────────

/** A bridge provider registry row (`MJ: AI Bridge Providers`). */
export interface BridgeProviderRecord {
    ID: string;
    Name: string;
    Description: string | null;
    BridgeType: 'Meeting' | 'Telephony';
    DriverClass: string;
    Status: 'Active' | 'Disabled';
    /** Raw `SupportedFeatures` JSON string (parsed client-side, see {@link parseFeatures}). */
    SupportedFeatures: string | null;
}

/** A bridge agent-identity row (`MJ: AI Bridge Agent Identities`). */
export interface BridgeAgentIdentityRecord {
    ID: string;
    AgentID: string;
    Agent: string | null;
    ProviderID: string;
    Provider: string;
    IdentityType: 'AccountID' | 'Email' | 'PhoneNumber';
    IdentityValue: string;
    DisplayName: string | null;
    IsActive: boolean;
}

/** An agent-channel registry row (`MJ: AI Agent Channels`). */
export interface AgentChannelRecord {
    ID: string;
    Name: string;
    Description: string | null;
    TransportType: 'PubSub' | 'WebRTC' | 'WebSocket';
    ServerPluginClass: string;
    ClientPluginClass: string;
    IsActive: boolean;
}

/** A provider→channel contribution row (`MJ: AI Bridge Provider Channels`). */
export interface BridgeProviderChannelRecord {
    ID: string;
    ProviderID: string;
    Provider: string;
    ChannelID: string;
    Channel: string;
    IsDefault: boolean;
    Sequence: number;
}

/** A co-agent pairing row (`MJ: AI Agent Co Agents`). */
export interface AgentCoAgentRecord {
    ID: string;
    CoAgentID: string;
    CoAgent: string | null;
    TargetAgentID: string | null;
    TargetAgent: string | null;
    TargetAgentTypeID: string | null;
    TargetAgentType: string | null;
    Type: 'CoAgent' | 'Delegate' | 'Fallback' | 'Observer' | 'Peer' | 'Reviewer';
    IsDefault: boolean;
    Sequence: number;
    Status: 'Active' | 'Disabled';
}

/** A session-bridge row (`MJ: AI Agent Session Bridges`). */
export interface SessionBridgeRecord {
    ID: string;
    AgentSessionID: string;
    ProviderID: string;
    Provider: string;
    Direction: 'Inbound' | 'Outbound';
    JoinMethod: 'InMeetingCommand' | 'InboundRoute' | 'Invite' | 'NativeInvite' | 'OnDemand' | 'Scheduled';
    TurnMode: 'Active' | 'Hybrid' | 'Passive';
    Address: string | null;
    Status: 'Connected' | 'Connecting' | 'Disconnected' | 'Disconnecting' | 'Failed' | 'Pending' | 'Scheduled';
    ScheduledStartTime: string | null;
    ConnectedAt: string | null;
    DisconnectedAt: string | null;
    CloseReason: 'Error' | 'Explicit' | 'HostEnded' | 'Janitor' | 'Shutdown' | null;
    HostInstanceID: string | null;
    __mj_CreatedAt: string;
}

/** A bridge participant row (`MJ: AI Agent Session Bridge Participants`). */
export interface SessionBridgeParticipantRecord {
    ID: string;
    SessionBridgeID: string;
    DisplayName: string | null;
    Role: 'Agent' | 'CoHost' | 'Host' | 'Participant';
    UserID: string | null;
    User: string | null;
    IsAgent: boolean;
    JoinedAt: string | null;
    LeftAt: string | null;
}

/** The session a bridge attaches to (`MJ: AI Agent Sessions`, narrowed). */
export interface SessionLiteRecord {
    ID: string;
    Agent: string | null;
    User: string;
    Status: 'Active' | 'Idle' | 'Closed';
    __mj_CreatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated view models
// ─────────────────────────────────────────────────────────────────────────────

/** A provider plus its parsed capability summary and contributed channels. */
export interface BridgeProviderRollup {
    Record: BridgeProviderRecord;
    /** Parsed `SupportedFeatures` JSON; `null` when unset/unparseable. */
    Features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null;
    /** Count of `true` capability flags. */
    FeatureCount: number;
    /** Channels this provider contributes (sorted by Sequence). */
    Channels: BridgeProviderChannelRecord[];
}

/** A session bridge joined with its session + participant count. */
export interface SessionBridgeRollup {
    Record: SessionBridgeRecord;
    /** The attached session, when found in the loaded window. */
    Session: SessionLiteRecord | null;
    AgentName: string;
    UserName: string;
    ParticipantCount: number;
    StartedAt: Date;
    /** ConnectedAt → (DisconnectedAt ?? now) for connected; else 0. */
    DurationMs: number;
    /** True when the bridge is live (Connecting / Connected). */
    IsLive: boolean;
}

/** A complete load pass of the management surface. */
export interface RealtimeManagementDataset {
    Providers: BridgeProviderRollup[];
    Identities: BridgeAgentIdentityRecord[];
    Channels: AgentChannelRecord[];
    ProviderChannels: BridgeProviderChannelRecord[];
    CoAgents: AgentCoAgentRecord[];
    /** Live session bridges (Connecting / Connected), newest first. */
    LiveBridges: SessionBridgeRollup[];
    /** Closed/terminal session bridges in the window, newest first. */
    HistoryBridges: SessionBridgeRollup[];
    /** Every bridge rollup loaded (live + history), for metrics. */
    AllBridges: SessionBridgeRollup[];
    WindowStart: Date;
    WindowMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_FIELDS = ['ID', 'Name', 'Description', 'BridgeType', 'DriverClass', 'Status', 'SupportedFeatures'];
const IDENTITY_FIELDS = ['ID', 'AgentID', 'Agent', 'ProviderID', 'Provider', 'IdentityType', 'IdentityValue', 'DisplayName', 'IsActive'];
const CHANNEL_FIELDS = ['ID', 'Name', 'Description', 'TransportType', 'ServerPluginClass', 'ClientPluginClass', 'IsActive'];
const PROVIDER_CHANNEL_FIELDS = ['ID', 'ProviderID', 'Provider', 'ChannelID', 'Channel', 'IsDefault', 'Sequence'];
const COAGENT_FIELDS = ['ID', 'CoAgentID', 'CoAgent', 'TargetAgentID', 'TargetAgent', 'TargetAgentTypeID', 'TargetAgentType', 'Type', 'IsDefault', 'Sequence', 'Status'];
const BRIDGE_FIELDS = ['ID', 'AgentSessionID', 'ProviderID', 'Provider', 'Direction', 'JoinMethod', 'TurnMode', 'Address', 'Status', 'ScheduledStartTime', 'ConnectedAt', 'DisconnectedAt', 'CloseReason', 'HostInstanceID', '__mj_CreatedAt'];
const PARTICIPANT_FIELDS = ['ID', 'SessionBridgeID', 'DisplayName', 'Role', 'UserID', 'User', 'IsAgent', 'JoinedAt', 'LeftAt'];
const SESSION_LITE_FIELDS = ['ID', 'Agent', 'User', 'Status', '__mj_CreatedAt'];

/** Bridge statuses that mean "still on the call/meeting". */
const LIVE_BRIDGE_STATUSES = new Set(['Pending', 'Scheduled', 'Connecting', 'Connected', 'Disconnecting']);

/** Supported time-range keys → milliseconds (history window; live is never filtered out). */
const TIME_RANGE_MS: Record<string, number> = {
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000
};

/** History-window range → milliseconds (local to this module). */
function timeRangeToMs(range: string): number {
    return TIME_RANGE_MS[range] ?? TIME_RANGE_MS['7d'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading + aggregation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads the full management surface in one batched `RunViews` call, then folds
 * everything into per-surface view models. History is windowed by `timeRange`;
 * live bridges are always included regardless of age.
 */
export async function LoadRealtimeManagementDataset(
    provider: IMetadataProvider,
    timeRange: string
): Promise<RealtimeManagementDataset> {
    const windowMs = timeRangeToMs(timeRange);
    const now = Date.now();
    const windowStart = new Date(now - windowMs);

    const rv = RunView.FromMetadataProvider(provider);
    const [
        providerResult, identityResult, channelResult, providerChannelResult,
        coAgentResult, bridgeResult, participantResult, sessionResult
    ] = await rv.RunViews([
        { EntityName: 'MJ: AI Bridge Providers', Fields: PROVIDER_FIELDS, OrderBy: 'Name', ResultType: 'simple' },
        { EntityName: 'MJ: AI Bridge Agent Identities', Fields: IDENTITY_FIELDS, OrderBy: 'Provider, IdentityValue', ResultType: 'simple' },
        { EntityName: 'MJ: AI Agent Channels', Fields: CHANNEL_FIELDS, OrderBy: 'Name', ResultType: 'simple' },
        { EntityName: 'MJ: AI Bridge Provider Channels', Fields: PROVIDER_CHANNEL_FIELDS, OrderBy: 'Provider, Sequence', ResultType: 'simple' },
        { EntityName: 'MJ: AI Agent Co Agents', Fields: COAGENT_FIELDS, OrderBy: 'CoAgent, Sequence', ResultType: 'simple' },
        {
            EntityName: 'MJ: AI Agent Session Bridges',
            ExtraFilter: `__mj_CreatedAt >= '${windowStart.toISOString()}' OR Status IN ('Pending','Scheduled','Connecting','Connected','Disconnecting')`,
            Fields: BRIDGE_FIELDS,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'simple'
        },
        { EntityName: 'MJ: AI Agent Session Bridge Participants', Fields: PARTICIPANT_FIELDS, ResultType: 'simple' },
        {
            EntityName: 'MJ: AI Agent Sessions',
            ExtraFilter: `__mj_CreatedAt >= '${windowStart.toISOString()}' OR Status IN ('Active','Idle')`,
            Fields: SESSION_LITE_FIELDS,
            ResultType: 'simple'
        }
    ]);

    const providers = (providerResult?.Success ? providerResult.Results : []) as BridgeProviderRecord[];
    const identities = (identityResult?.Success ? identityResult.Results : []) as BridgeAgentIdentityRecord[];
    const channels = (channelResult?.Success ? channelResult.Results : []) as AgentChannelRecord[];
    const providerChannels = (providerChannelResult?.Success ? providerChannelResult.Results : []) as BridgeProviderChannelRecord[];
    const coAgents = (coAgentResult?.Success ? coAgentResult.Results : []) as AgentCoAgentRecord[];
    const bridges = (bridgeResult?.Success ? bridgeResult.Results : []) as SessionBridgeRecord[];
    const participants = (participantResult?.Success ? participantResult.Results : []) as SessionBridgeParticipantRecord[];
    const sessions = (sessionResult?.Success ? sessionResult.Results : []) as SessionLiteRecord[];

    const providerChannelMap = groupBy(providerChannels, pc => pc.ProviderID);
    const providerRollups = providers.map(p => buildProviderRollup(p, providerChannelMap));

    const sessionMap = new Map(sessions.map(s => [NormalizeUUID(s.ID), s]));
    const participantCountMap = countBy(participants, p => p.SessionBridgeID);
    const bridgeRollups = bridges.map(b => buildBridgeRollup(b, sessionMap, participantCountMap, now));

    const liveBridges = bridgeRollups.filter(b => b.IsLive);
    const historyBridges = bridgeRollups.filter(b => !b.IsLive);

    return {
        Providers: providerRollups,
        Identities: identities,
        Channels: channels,
        ProviderChannels: providerChannels,
        CoAgents: coAgents,
        LiveBridges: liveBridges,
        HistoryBridges: historyBridges,
        AllBridges: bridgeRollups,
        WindowStart: windowStart,
        WindowMs: windowMs
    };
}

function buildProviderRollup(
    record: BridgeProviderRecord,
    providerChannelMap: Map<string, BridgeProviderChannelRecord[]>
): BridgeProviderRollup {
    const features = parseFeatures(record.SupportedFeatures);
    const channels = (providerChannelMap.get(NormalizeUUID(record.ID)) ?? [])
        .slice()
        .sort((a, b) => a.Sequence - b.Sequence);
    return {
        Record: record,
        Features: features,
        FeatureCount: features ? countTrueFlags(features) : 0,
        Channels: channels
    };
}

function buildBridgeRollup(
    record: SessionBridgeRecord,
    sessionMap: Map<string, SessionLiteRecord>,
    participantCountMap: Map<string, number>,
    now: number
): SessionBridgeRollup {
    const session = sessionMap.get(NormalizeUUID(record.AgentSessionID)) ?? null;
    const startedAt = new Date(record.__mj_CreatedAt);
    const isLive = LIVE_BRIDGE_STATUSES.has(record.Status);
    let durationMs = 0;
    if (record.ConnectedAt) {
        const end = record.DisconnectedAt ? new Date(record.DisconnectedAt).getTime() : now;
        durationMs = Math.max(0, end - new Date(record.ConnectedAt).getTime());
    }
    return {
        Record: record,
        Session: session,
        AgentName: session?.Agent ?? 'Unknown agent',
        UserName: session?.User ?? '—',
        ParticipantCount: participantCountMap.get(NormalizeUUID(record.ID)) ?? 0,
        StartedAt: startedAt,
        DurationMs: durationMs,
        IsLive: isLive
    };
}

/** Parses the `SupportedFeatures` JSON string into the typed interface. */
function parseFeatures(raw: string | null): MJAIBridgeProviderEntity_IBridgeProviderFeatures | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as MJAIBridgeProviderEntity_IBridgeProviderFeatures;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

/** Counts `true` boolean flags on a features object. */
function countTrueFlags(features: MJAIBridgeProviderEntity_IBridgeProviderFeatures): number {
    return Object.values(features).filter(v => v === true).length;
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
        const key = NormalizeUUID(keyOf(row));
        const list = map.get(key);
        if (list) list.push(row);
        else map.set(key, [row]);
    }
    return map;
}

function countBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
        const key = NormalizeUUID(keyOf(row));
        map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure metrics aggregation (unit-tested in realtime-management-data.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** One day bucket for the sessions-over-time metric. */
export interface SessionBridgeDayBucket {
    /** Local-midnight Date for the bucket. */
    Date: Date;
    /** YYYY-MM-DD label. */
    Label: string;
    Count: number;
}

/** One labeled aggregate slice (provider, status, etc.) with a count. */
export interface MetricSlice {
    Label: string;
    Count: number;
}

/**
 * Buckets session bridges by their local calendar day across `[windowStart, now]`,
 * emitting one bucket **per day in the window** (including zero-count days) so the
 * resulting series is dense and renderable as bars without gaps.
 *
 * Pure + deterministic given its inputs — `now` is injected for testability.
 *
 * @param bridges   the bridge rollups to bucket (uses each `StartedAt`)
 * @param windowStart inclusive start of the window
 * @param now       the window end (exclusive upper edge is `now`'s day + 1)
 * @returns one bucket per day, oldest → newest
 */
export function BucketSessionBridgesByDay(
    bridges: SessionBridgeRollup[],
    windowStart: Date,
    now: Date
): SessionBridgeDayBucket[] {
    const startDay = startOfDay(windowStart);
    const endDay = startOfDay(now);
    if (endDay.getTime() < startDay.getTime()) return [];

    // Seed every day in [startDay, endDay] with a zero count.
    const buckets = new Map<string, SessionBridgeDayBucket>();
    for (let d = new Date(startDay); d.getTime() <= endDay.getTime(); d = addDays(d, 1)) {
        const label = toDayLabel(d);
        buckets.set(label, { Date: new Date(d), Label: label, Count: 0 });
    }

    for (const bridge of bridges) {
        const day = startOfDay(bridge.StartedAt);
        if (day.getTime() < startDay.getTime() || day.getTime() > endDay.getTime()) continue;
        const bucket = buckets.get(toDayLabel(day));
        if (bucket) bucket.Count++;
    }

    return Array.from(buckets.values()).sort((a, b) => a.Date.getTime() - b.Date.getTime());
}

/** Aggregates bridge rollups into count-by-provider slices, descending by count. */
export function SummarizeBridgesByProvider(bridges: SessionBridgeRollup[]): MetricSlice[] {
    return summarizeBy(bridges, b => b.Record.Provider || 'Unknown');
}

/** Aggregates bridge rollups into count-by-status slices, descending by count. */
export function SummarizeBridgesByStatus(bridges: SessionBridgeRollup[]): MetricSlice[] {
    return summarizeBy(bridges, b => b.Record.Status);
}

/** Aggregates bridge rollups into count-by-agent slices, descending by count. */
export function SummarizeBridgesByAgent(bridges: SessionBridgeRollup[]): MetricSlice[] {
    return summarizeBy(bridges, b => b.AgentName || 'Unknown agent');
}

function summarizeBy(bridges: SessionBridgeRollup[], labelOf: (b: SessionBridgeRollup) => string): MetricSlice[] {
    const counts = new Map<string, number>();
    for (const bridge of bridges) {
        const label = labelOf(bridge);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([Label, Count]) => ({ Label, Count }))
        .sort((a, b) => b.Count - a.Count || a.Label.localeCompare(b.Label));
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function toDayLabel(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers (shared by the section's sub-tabs)
// ─────────────────────────────────────────────────────────────────────────────

/** Font Awesome icon for a bridge type. */
export function BridgeTypeIcon(type: BridgeProviderRecord['BridgeType']): string {
    return type === 'Telephony' ? 'fa-solid fa-phone' : 'fa-solid fa-video';
}

/** Font Awesome icon for an identity type. */
export function IdentityTypeIcon(type: BridgeAgentIdentityRecord['IdentityType']): string {
    switch (type) {
        case 'Email': return 'fa-solid fa-envelope';
        case 'PhoneNumber': return 'fa-solid fa-phone';
        default: return 'fa-solid fa-id-badge';
    }
}

/** Font Awesome icon for a channel transport type. */
export function TransportTypeIcon(type: AgentChannelRecord['TransportType']): string {
    switch (type) {
        case 'WebRTC': return 'fa-solid fa-tower-broadcast';
        case 'WebSocket': return 'fa-solid fa-plug';
        default: return 'fa-solid fa-satellite-dish';
    }
}

/**
 * A compact, human-readable summary of a provider's top capabilities — a few
 * key icons + label pairs derived from the parsed features, capped for density.
 */
export interface CapabilityChip {
    Icon: string;
    Label: string;
}

/**
 * Builds the prioritized capability chips for a provider's feature set. Returns
 * the highest-signal capabilities first (media, then join methods, then
 * signals), so the grid can render a few and show "+N" for the remainder.
 */
export function BuildCapabilityChips(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null
): CapabilityChip[] {
    if (!features) return [];
    const chips: CapabilityChip[] = [];
    const add = (flag: boolean | undefined, icon: string, label: string) => {
        if (flag) chips.push({ Icon: icon, Label: label });
    };
    add(features.AudioIn || features.AudioOut, 'fa-solid fa-microphone-lines', 'Audio');
    add(features.VideoIn || features.VideoOut, 'fa-solid fa-video', 'Video');
    add(features.ScreenIn || features.ScreenOut, 'fa-solid fa-display', 'Screen');
    add(features.SpeakerDiarization, 'fa-solid fa-user-group', 'Diarization');
    add(features.InviteJoin, 'fa-solid fa-calendar-check', 'Invite/Calendar');
    add(features.OnDemandJoin, 'fa-solid fa-bolt', 'On-demand');
    add(features.ScheduledJoin, 'fa-solid fa-clock', 'Scheduled');
    add(features.InboundRouting, 'fa-solid fa-arrow-right-to-bracket', 'Inbound');
    add(features.OutboundDial, 'fa-solid fa-phone-volume', 'Outbound dial');
    add(features.DTMF, 'fa-solid fa-hashtag', 'DTMF');
    add(features.CallTransfer, 'fa-solid fa-arrow-right-arrow-left', 'Transfer');
    add(features.Recording, 'fa-solid fa-circle-dot', 'Recording');
    return chips;
}

/** Formats a duration as m:ss (or h:mm:ss past the hour). */
export function FormatBridgeDuration(ms: number): string {
    if (ms <= 0) return '—';
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Today → "3:40 pm", yesterday → "Yesterday", else "M/d". */
export function FormatBridgeStart(date: Date): string {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startYesterday = new Date(startToday.getTime() - 86_400_000);
    if (date >= startToday) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    if (date >= startYesterday) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}
