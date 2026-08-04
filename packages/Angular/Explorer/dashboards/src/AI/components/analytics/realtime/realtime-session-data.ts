/**
 * @fileoverview Shared data layer for the Realtime Voice analytics sections.
 *
 * Loads `MJ: AI Agent Sessions`, their `MJ: AI Agent Session Channels` rows,
 * and the delegated `MJ: AI Agent Runs` (linked via `AgentSessionID`) in a
 * single batched `RunViews` call, then aggregates everything client-side into
 * per-session rollups (target agent, channel set, delegated-run count, token /
 * cost totals, duration, close cause from the persisted `CloseReason` column).
 *
 * Used by both `AnalyticsRealtimeOverviewComponent` (KPIs + charts) and
 * `AnalyticsRealtimeSessionsComponent` (management grid) so the two sections
 * share one query shape and one aggregation pass.
 */

import { IMetadataProvider, RunView } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

// ── Raw row shapes (ResultType: 'simple', narrowed Fields) ──

/**
 * Why a session was closed, as stamped server-side by `SessionManager.CloseSession`
 * (mirrors `AIAgentSessionEntity.CloseReason`). `null` means a legacy row closed
 * before the column existed — rendered as "unknown".
 */
export type RealtimeSessionCloseReason = 'Error' | 'Explicit' | 'Janitor' | 'Shutdown';

export interface RealtimeSessionRecord {
    ID: string;
    AgentID: string;
    Agent: string | null;
    UserID: string;
    User: string;
    Status: 'Active' | 'Idle' | 'Closed';
    ConversationID: string | null;
    LastSessionID: string | null;
    HostInstanceID: string | null;
    Config: string | null;
    LastActiveAt: string;
    ClosedAt: string | null;
    CloseReason: RealtimeSessionCloseReason | null;
    __mj_CreatedAt: string;
}

export interface RealtimeSessionChannelRecord {
    ID: string;
    AgentSessionID: string;
    Channel: string;
    Status: string;
    __mj_CreatedAt: string;
}

export interface RealtimeSessionRunRecord {
    ID: string;
    AgentSessionID: string | null;
    AgentID: string;
    Agent: string | null;
    TotalCost: number | null;
    TotalTokensUsed: number | null;
    StartedAt: string;
}

/** Shape of the run ids the realtime voice stack persists in `AIAgentSession.Config`. */
interface RealtimeSessionConfigJson {
    targetAgentID?: string;
    coAgentRunID?: string;
    promptRunID?: string;
    pendingFeedbackRunID?: string;
}

// ── Aggregated shapes ──

/** One session with everything the admin pages render, pre-aggregated. */
export interface RealtimeSessionRollup {
    Record: RealtimeSessionRecord;
    /** Parsed from Config JSON; null when the session carries no target. */
    TargetAgentID: string | null;
    /** Resolved client-side against AIEngineBase's cached agents. */
    TargetAgentName: string | null;
    /** Distinct channel names attached to the session. */
    ChannelNames: string[];
    /** Delegated AIAgentRuns (linked runs excluding the co-agent observability run). */
    DelegatedRunCount: number;
    /** Token total across all linked agent runs (co-agent + delegated). */
    TotalTokens: number;
    /** Cost total across all linked agent runs (co-agent + delegated). */
    TotalCost: number;
    StartedAt: Date;
    /** __mj_CreatedAt → (ClosedAt ?? LastActiveAt). 0 when not derivable. */
    DurationMs: number;
    /** Session resumed from a prior one (LastSessionID set). */
    IsResumed: boolean;
    /**
     * Close cause persisted by the server (`AIAgentSession.CloseReason`).
     * `null` either means the session is still open, or it's a legacy row
     * closed before the column existed ("unknown" in the UI).
     */
    CloseReason: RealtimeSessionCloseReason | null;
    /**
     * `CloseReason === 'Janitor'` — the session was force-closed by the
     * lifecycle janitor (startup orphan recovery or staleness sweep) rather
     * than ended explicitly. Derived from the real column; the old
     * ClosedAt−LastActiveAt timing heuristic has been retired, so legacy
     * NULL-reason rows report `false` here and "unknown" in the UI.
     */
    IsJanitorClosed: boolean;
}

/** Result of one load pass — current-window rollups plus trend context. */
export interface RealtimeSessionsDataset {
    /** Sessions started in the current window (or still open), newest first. */
    Sessions: RealtimeSessionRollup[];
    /** Every loaded session rollup (covers 2× the window, for trend math). */
    AllSessions: RealtimeSessionRollup[];
    /** Count of sessions started in the prior (equal-length) window. */
    PriorWindowSessionCount: number;
    WindowStart: Date;
    WindowMs: number;
}

// ── Constants ──

const SESSION_FIELDS = [
    'ID', 'AgentID', 'Agent', 'UserID', 'User', 'Status', 'ConversationID',
    'LastSessionID', 'HostInstanceID', 'Config', 'LastActiveAt', 'ClosedAt', 'CloseReason', '__mj_CreatedAt'
];

const SESSION_CHANNEL_FIELDS = ['ID', 'AgentSessionID', 'Channel', 'Status', '__mj_CreatedAt'];

const SESSION_RUN_FIELDS = ['ID', 'AgentSessionID', 'AgentID', 'Agent', 'TotalCost', 'TotalTokensUsed', 'StartedAt'];

/** Supported time-range keys → milliseconds. */
const TIME_RANGE_MS: Record<string, number> = {
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000
};

export function TimeRangeToMs(range: string): number {
    return TIME_RANGE_MS[range] ?? TIME_RANGE_MS['7d'];
}

// ── Loading + aggregation ──

/**
 * Loads sessions (2× window for trend), their channels, and linked agent runs
 * via one batched RunViews call, then folds them into per-session rollups.
 */
export async function LoadRealtimeSessionsDataset(
    provider: IMetadataProvider,
    timeRange: string
): Promise<RealtimeSessionsDataset> {
    const windowMs = TimeRangeToMs(timeRange);
    const now = Date.now();
    const windowStart = new Date(now - windowMs);
    const doubleWindowStart = new Date(now - windowMs * 2);

    const rv = RunView.FromMetadataProvider(provider);
    const [sessionResult, channelResult, runResult] = await rv.RunViews([
        {
            EntityName: 'MJ: AI Agent Sessions',
            ExtraFilter: `__mj_CreatedAt >= '${doubleWindowStart.toISOString()}' OR Status IN ('Active','Idle')`,
            Fields: SESSION_FIELDS,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'simple'
        },
        {
            EntityName: 'MJ: AI Agent Session Channels',
            ExtraFilter: `__mj_CreatedAt >= '${doubleWindowStart.toISOString()}' OR Status = 'Connected'`,
            Fields: SESSION_CHANNEL_FIELDS,
            ResultType: 'simple'
        },
        {
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `AgentSessionID IS NOT NULL AND StartedAt >= '${doubleWindowStart.toISOString()}'`,
            Fields: SESSION_RUN_FIELDS,
            OrderBy: 'StartedAt DESC',
            ResultType: 'simple'
        }
    ]);

    const sessions = (sessionResult?.Success ? sessionResult.Results : []) as RealtimeSessionRecord[];
    const channels = (channelResult?.Success ? channelResult.Results : []) as RealtimeSessionChannelRecord[];
    const runs = (runResult?.Success ? runResult.Results : []) as RealtimeSessionRunRecord[];

    const agentNameMap = await buildAgentNameMap();
    const channelMap = groupBySessionId(channels, c => c.AgentSessionID);
    const runMap = groupBySessionId(runs, r => r.AgentSessionID);

    const allRollups = sessions.map(s => buildRollup(s, channelMap, runMap, agentNameMap));

    const currentWindow = allRollups.filter(
        r => r.StartedAt >= windowStart || r.Record.Status !== 'Closed'
    );
    const priorCount = allRollups.filter(
        r => r.StartedAt >= doubleWindowStart && r.StartedAt < windowStart
    ).length;

    return {
        Sessions: currentWindow,
        AllSessions: allRollups,
        PriorWindowSessionCount: priorCount,
        WindowStart: windowStart,
        WindowMs: windowMs
    };
}

/** Loads AIEngineBase (no-op when cached) and maps normalized agent ID → name. */
async function buildAgentNameMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
        await AIEngineBase.Instance.Config(false);
        for (const agent of AIEngineBase.Instance.Agents ?? []) {
            map.set(NormalizeUUID(agent.ID), agent.Name ?? '');
        }
    } catch {
        // Tolerate engine load failures — target names degrade to null.
    }
    return map;
}

function groupBySessionId<T>(rows: T[], keyOf: (row: T) => string | null): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
        const raw = keyOf(row);
        if (!raw) continue;
        const key = NormalizeUUID(raw);
        const list = map.get(key);
        if (list) {
            list.push(row);
        } else {
            map.set(key, [row]);
        }
    }
    return map;
}

function buildRollup(
    session: RealtimeSessionRecord,
    channelMap: Map<string, RealtimeSessionChannelRecord[]>,
    runMap: Map<string, RealtimeSessionRunRecord[]>,
    agentNameMap: Map<string, string>
): RealtimeSessionRollup {
    const key = NormalizeUUID(session.ID);
    const config = parseSessionConfig(session.Config);
    const sessionRuns = runMap.get(key) ?? [];
    const coAgentRunKey = config.coAgentRunID ? NormalizeUUID(config.coAgentRunID) : null;

    const delegatedRuns = sessionRuns.filter(r => !coAgentRunKey || NormalizeUUID(r.ID) !== coAgentRunKey);
    const totalTokens = sessionRuns.reduce((s, r) => s + (r.TotalTokensUsed ?? 0), 0);
    const totalCost = sessionRuns.reduce((s, r) => s + (r.TotalCost ?? 0), 0);

    const channelNames = Array.from(
        new Set((channelMap.get(key) ?? []).map(c => c.Channel).filter(Boolean))
    );

    const startedAt = new Date(session.__mj_CreatedAt);
    const endAt = session.ClosedAt ? new Date(session.ClosedAt) : new Date(session.LastActiveAt);
    const durationMs = Math.max(0, endAt.getTime() - startedAt.getTime());

    const closeReason = session.Status === 'Closed' ? session.CloseReason ?? null : null;

    const targetAgentID = config.targetAgentID ?? null;
    return {
        Record: session,
        TargetAgentID: targetAgentID,
        TargetAgentName: targetAgentID ? agentNameMap.get(NormalizeUUID(targetAgentID)) ?? null : null,
        ChannelNames: channelNames,
        DelegatedRunCount: delegatedRuns.length,
        TotalTokens: totalTokens,
        TotalCost: totalCost,
        StartedAt: startedAt,
        DurationMs: durationMs,
        IsResumed: session.LastSessionID != null,
        CloseReason: closeReason,
        IsJanitorClosed: closeReason === 'Janitor'
    };
}

function parseSessionConfig(raw: string | null): RealtimeSessionConfigJson {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as RealtimeSessionConfigJson;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

// ── Formatting helpers (shared by both sections) ──

/** How a session's status pill should render — label, hover title, and Font Awesome icon. */
export interface SessionStatusDisplay {
    Label: string;
    Title: string;
    /** Icon class for the pill; empty for `Active` (the template renders the pulsing live dot instead). */
    Icon: string;
}

/**
 * Builds the status-pill presentation for a session from its `Status` and persisted
 * `CloseReason`. `Closed` sessions surface the real close cause; a `null` reason
 * (legacy rows written before the column existed) renders as "unknown".
 */
export function BuildSessionStatusDisplay(
    status: RealtimeSessionRecord['Status'],
    closeReason: RealtimeSessionCloseReason | null
): SessionStatusDisplay {
    if (status === 'Active') {
        return { Label: 'Active', Title: 'Live duplex session', Icon: '' };
    }
    if (status === 'Idle') {
        return { Label: 'Idle', Title: 'Holding — past the idle threshold', Icon: 'fa-solid fa-pause' };
    }
    switch (closeReason) {
        case 'Explicit':
            return { Label: 'Closed', Title: 'Closed explicitly (user hang-up / close mutation)', Icon: 'fa-solid fa-circle-stop' };
        case 'Janitor':
            return { Label: 'Closed · janitor', Title: 'Force-closed by the lifecycle janitor (staleness sweep / orphan reconciliation)', Icon: 'fa-solid fa-broom' };
        case 'Shutdown':
            return { Label: 'Closed · shutdown', Title: 'Closed by the host’s graceful shutdown drain', Icon: 'fa-solid fa-power-off' };
        case 'Error':
            return { Label: 'Closed · error', Title: 'Closed by a failure-path teardown', Icon: 'fa-solid fa-triangle-exclamation' };
        default:
            return { Label: 'Closed · unknown', Title: 'Closed before close-cause tracking existed (legacy row)', Icon: 'fa-solid fa-circle-question' };
    }
}

/** Formats a duration as m:ss (or h:mm:ss past the hour) like the mockups' 4:51 / 11:18. */
export function FormatSessionDuration(ms: number): string {
    if (ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** 4200 → "4.2K", 1_250_000 → "1.3M". */
export function FormatTokenCount(value: number): string {
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
    return value.toString();
}

export function FormatSessionCost(value: number, decimals = 2): string {
    if (value === 0) return '$0.00';
    if (value < 0.01 && decimals < 4) decimals = 4;
    return '$' + value.toFixed(decimals);
}

/** Today → "3:40 pm", yesterday → "Yesterday", else "M/d". */
export function FormatSessionStart(date: Date): string {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
    if (date >= startOfToday) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    }
    if (date >= startOfYesterday) {
        return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

/** Font Awesome icon for a channel name (keyword-mapped, with a generic fallback). */
export function ChannelIconClass(channelName: string): string {
    const name = channelName.toLowerCase();
    if (name.includes('voice') || name.includes('audio')) return 'fa-solid fa-microphone-lines';
    if (name.includes('whiteboard') || name.includes('board')) return 'fa-solid fa-chalkboard';
    if (name.includes('text') || name.includes('chat')) return 'fa-solid fa-comment';
    if (name.includes('control')) return 'fa-solid fa-sliders';
    if (name.includes('video')) return 'fa-solid fa-video';
    return 'fa-solid fa-plug';
}
