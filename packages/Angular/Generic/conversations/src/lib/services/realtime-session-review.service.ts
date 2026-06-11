import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { RealtimeDelegationCardVM, RealtimeThreadItem } from '../components/realtime/realtime-session-state';

/**
 * Why a reviewed session was closed, as stamped server-side by `SessionManager.CloseSession`
 * (mirrors `MJAIAgentSessionEntity.CloseReason`). `null` means the session is still open OR a
 * legacy row was closed before the column existed.
 */
export type RealtimeReviewCloseReason = 'Error' | 'Explicit' | 'Janitor' | 'Shutdown';

/** One historical caption turn of a reviewed session (a persisted `MJ: Conversation Details` row). */
export interface RealtimeSessionReviewTurn {
  /** Who spoke the turn. Persisted `AI` rows map to `Assistant`. */
  Role: 'User' | 'Assistant';
  /** The transcript text. */
  Text: string;
  /** When the turn was persisted (`__mj_CreatedAt`), or null when unknown. */
  At: Date | null;
}

/**
 * A compact preview of one DELEGATED agent run the reviewed session spawned (an
 * `MJ: AI Agent Runs` row linked via `AgentSessionID`, EXCLUDING the co-agent's own
 * observability run). Carries just enough to render a done delegation card.
 */
export interface RealtimeSessionReviewRun {
  /** `MJ: AI Agent Runs.ID`. */
  RunID: string;
  /** The delegated agent's id. */
  AgentID: string;
  /** Denormalized agent display name from the run view, when available. */
  AgentName: string | null;
  /** Terminal (or last-known) run status (`Completed` | `Failed` | `Running` | …). */
  Status: string;
  /** Whether the run reported success. */
  Success: boolean;
  /** The run's user-facing result message, when one was recorded. */
  Message: string | null;
  /** The run's error message, when it failed. */
  ErrorMessage: string | null;
  /** The final step the run reported (`Success` | `Failed` | `Retry` | …), when known. */
  FinalStep: string | null;
  StartedAt: Date | null;
  CompletedAt: Date | null;
}

/** The persisted state of one interactive channel of the reviewed session. */
export interface RealtimeSessionReviewChannelState {
  /** Channel display name (e.g. `Whiteboard`), denormalized on the session-channel row. */
  ChannelName: string;
  /** The channel's serialized state of record (`AIAgentSessionChannel.Config`), or null when none was saved. */
  StateJson: string | null;
}

/**
 * Everything the call overlay's SESSION REVIEW mode renders for one past realtime session:
 * the session identity/lifecycle row, the chronological caption turns, previews of the
 * delegated runs, and the saved per-channel states (e.g. the whiteboard board).
 */
export interface RealtimeSessionReview {
  /** `MJ: AI Agent Sessions.ID` of the reviewed session. */
  SessionID: string;
  /** The session's fronting agent id (`AIAgentSession.AgentID` — usually the Realtime Co-Agent). */
  AgentID: string;
  /** Display name shown in the review banner (target agent when resolvable, else the session agent). */
  AgentName: string;
  /**
   * The agent a RESUMED live session should front: the session Config's `targetAgentID`,
   * falling back to the session's own `AgentID` when the config doesn't carry one.
   */
  TargetAgentID: string;
  /** Conversation the session was bound to, when any. */
  ConversationID: string | null;
  Status: 'Active' | 'Closed' | 'Idle';
  CloseReason: RealtimeReviewCloseReason | null;
  /** When the session started (`__mj_CreatedAt`). */
  StartedAt: Date | null;
  LastActiveAt: Date | null;
  ClosedAt: Date | null;
  /** Chronological caption turns (oldest first). */
  Turns: RealtimeSessionReviewTurn[];
  /** Delegated run previews, chronological (oldest first), minus the co-agent observability run. */
  DelegatedRuns: RealtimeSessionReviewRun[];
  /** Saved channel states, one per session-channel row that carried a name. */
  ChannelStates: RealtimeSessionReviewChannelState[];
}

// ── Raw row shapes (ResultType: 'simple', narrowed Fields) ──────────────────

interface SessionRow {
  ID: string;
  AgentID: string;
  Agent: string | null;
  Status: 'Active' | 'Closed' | 'Idle';
  ConversationID: string | null;
  Config: string | null;
  LastActiveAt: string | null;
  ClosedAt: string | null;
  CloseReason: RealtimeReviewCloseReason | null;
  __mj_CreatedAt: string | null;
}

interface DetailRow {
  ID: string;
  Role: 'AI' | 'Error' | 'User';
  Message: string | null;
  HiddenToUser: boolean;
  __mj_CreatedAt: string | null;
}

interface RunRow {
  ID: string;
  AgentID: string;
  Agent: string | null;
  Status: string;
  Success: boolean | null;
  Message: string | null;
  ErrorMessage: string | null;
  FinalStep: string | null;
  StartedAt: string | null;
  CompletedAt: string | null;
}

interface ChannelRow {
  ID: string;
  Channel: string | null;
  Config: string | null;
}

/** The Config-JSON keys the realtime voice stack persists on `AIAgentSession.Config`. */
interface SessionConfigJson {
  targetAgentID?: string;
  coAgentRunID?: string;
}

const SESSION_FIELDS = ['ID', 'AgentID', 'Agent', 'Status', 'ConversationID', 'Config', 'LastActiveAt', 'ClosedAt', 'CloseReason', '__mj_CreatedAt'];
const DETAIL_FIELDS = ['ID', 'Role', 'Message', 'HiddenToUser', '__mj_CreatedAt'];
const RUN_FIELDS = ['ID', 'AgentID', 'Agent', 'Status', 'Success', 'Message', 'ErrorMessage', 'FinalStep', 'StartedAt', 'CompletedAt'];
const CHANNEL_FIELDS = ['ID', 'Channel', 'Config'];

// ── Review → thread-item mapping (pure, unit-testable) ──────────────────────

/** Maps one delegated-run preview to the done delegation-card VM the thread/rail render. */
export function BuildReviewDelegationCard(run: RealtimeSessionReviewRun, fallbackAgentName: string): RealtimeDelegationCardVM {
  const startedAt = run.StartedAt?.getTime() ?? 0;
  return {
    CallID: run.RunID,
    AgentName: run.AgentName || fallbackAgentName,
    LatestMessage: run.Message ?? run.ErrorMessage ?? run.Status,
    LatestStep: run.FinalStep ?? '',
    Done: true,
    Success: run.Success,
    RunRef: shortRunRef(run.RunID),
    RunID: run.RunID,
    Result: run.Message ?? run.ErrorMessage ?? null,
    StartedAt: startedAt,
    FinishedAt: run.CompletedAt?.getTime() ?? startedAt
  };
}

/**
 * Builds the chronological thread (caption turns + done delegation cards, oldest first)
 * for a reviewed session — the items `RealtimeSessionState.LoadHistoricalItems` takes.
 * Entries without a timestamp sort to the front, preserving their relative order.
 */
export function BuildReviewThreadItems(review: RealtimeSessionReview): RealtimeThreadItem[] {
  const stamped: Array<{ At: number; Item: RealtimeThreadItem }> = [];
  for (const turn of review.Turns) {
    stamped.push({ At: turn.At?.getTime() ?? 0, Item: { Kind: 'caption', Role: turn.Role, Text: turn.Text } });
  }
  for (const run of review.DelegatedRuns) {
    stamped.push({ At: run.StartedAt?.getTime() ?? 0, Item: { Kind: 'delegation', Card: BuildReviewDelegationCard(run, review.AgentName) } });
  }
  // Array.prototype.sort is stable — equal timestamps keep their build order.
  stamped.sort((a, b) => a.At - b.At);
  return stamped.map(s => s.Item);
}

/** Derives a short run reference (e.g. "#a3f1") from the run id — mirrors the live cards. */
function shortRunRef(runId: string): string {
  const compact = runId.replace(/[^a-z0-9]/gi, '');
  return compact.length >= 4 ? `#${compact.slice(-4).toLowerCase()}` : `#${compact.toLowerCase()}`;
}

/**
 * STATELESS loader for the call overlay's SESSION REVIEW mode: given a past
 * `MJ: AI Agent Sessions` id, batch-loads the session row, its persisted caption turns
 * (`MJ: Conversation Details` linked by `AgentSessionID`), its delegated agent runs
 * (minus the co-agent observability run named in the session Config's `coAgentRunID`),
 * and its saved channel states — and folds them into one {@link RealtimeSessionReview}.
 *
 * TOLERANT by design: any missing piece degrades to an empty collection; the loader
 * returns `null` only when the session row itself can't be found.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeSessionReviewService {
  /**
   * Loads everything review mode renders for one past session.
   *
   * @param agentSessionId The `MJ: AI Agent Sessions.ID` to review.
   * @param provider Optional metadata provider (multi-server apps); falls back to the global default.
   * @returns The assembled review, or `null` when the session doesn't exist / can't be read.
   */
  public async LoadSessionReview(agentSessionId: string, provider?: IMetadataProvider): Promise<RealtimeSessionReview | null> {
    const trimmed = agentSessionId?.trim() ?? '';
    if (trimmed.length === 0) {
      return null;
    }
    try {
      const [session, details, runs, channels] = await this.loadRows(trimmed, provider ?? Metadata.Provider);
      if (!session) {
        return null;
      }
      return this.assembleReview(session, details, runs, channels);
    } catch (error) {
      console.error('[RealtimeSessionReview] Failed to load session review:', error);
      return null;
    }
  }

  /** One batched RunViews pass: session row + caption turns + linked runs + channel rows. */
  private async loadRows(
    agentSessionId: string,
    provider: IMetadataProvider
  ): Promise<[SessionRow | null, DetailRow[], RunRow[], ChannelRow[]]> {
    const safeID = agentSessionId.replace(/'/g, "''");
    const rv = RunView.FromMetadataProvider(provider);
    const [sessionResult, detailResult, runResult, channelResult] = await rv.RunViews([
      { EntityName: 'MJ: AI Agent Sessions', ExtraFilter: `ID='${safeID}'`, Fields: SESSION_FIELDS, ResultType: 'simple' },
      { EntityName: 'MJ: Conversation Details', ExtraFilter: `AgentSessionID='${safeID}'`, Fields: DETAIL_FIELDS, OrderBy: '__mj_CreatedAt ASC', ResultType: 'simple' },
      { EntityName: 'MJ: AI Agent Runs', ExtraFilter: `AgentSessionID='${safeID}'`, Fields: RUN_FIELDS, OrderBy: 'StartedAt ASC', ResultType: 'simple' },
      { EntityName: 'MJ: AI Agent Session Channels', ExtraFilter: `AgentSessionID='${safeID}'`, Fields: CHANNEL_FIELDS, ResultType: 'simple' }
    ]);
    const sessions = (sessionResult?.Success ? sessionResult.Results : []) as SessionRow[];
    return [
      sessions[0] ?? null,
      (detailResult?.Success ? detailResult.Results : []) as DetailRow[],
      (runResult?.Success ? runResult.Results : []) as RunRow[],
      (channelResult?.Success ? channelResult.Results : []) as ChannelRow[]
    ];
  }

  /** Folds the loaded rows into the typed review (config parse, co-agent-run exclusion, mapping). */
  private assembleReview(session: SessionRow, details: DetailRow[], runs: RunRow[], channels: ChannelRow[]): RealtimeSessionReview {
    const config = this.parseSessionConfig(session.Config);
    return {
      SessionID: session.ID,
      AgentID: session.AgentID,
      AgentName: session.Agent || 'the agent',
      TargetAgentID: config.targetAgentID ?? session.AgentID,
      ConversationID: session.ConversationID ?? null,
      Status: session.Status,
      CloseReason: session.CloseReason ?? null,
      StartedAt: this.toDate(session.__mj_CreatedAt),
      LastActiveAt: this.toDate(session.LastActiveAt),
      ClosedAt: this.toDate(session.ClosedAt),
      Turns: this.mapTurns(details),
      DelegatedRuns: this.mapRuns(runs, config.coAgentRunID ?? null),
      ChannelStates: this.mapChannels(channels)
    };
  }

  /** Persisted detail rows → caption turns: visible `User`/`AI` rows with text (AI → Assistant). */
  private mapTurns(details: DetailRow[]): RealtimeSessionReviewTurn[] {
    const turns: RealtimeSessionReviewTurn[] = [];
    for (const row of details) {
      const text = row.Message?.trim() ?? '';
      if (row.HiddenToUser || text.length === 0 || (row.Role !== 'User' && row.Role !== 'AI')) {
        continue;
      }
      turns.push({
        Role: row.Role === 'AI' ? 'Assistant' : 'User',
        Text: text,
        At: this.toDate(row.__mj_CreatedAt)
      });
    }
    return turns;
  }

  /** Linked run rows → delegated-run previews, EXCLUDING the co-agent's observability run. */
  private mapRuns(runs: RunRow[], coAgentRunId: string | null): RealtimeSessionReviewRun[] {
    return runs
      .filter(r => !coAgentRunId || !UUIDsEqual(r.ID, coAgentRunId))
      .map(r => ({
        RunID: r.ID,
        AgentID: r.AgentID,
        AgentName: r.Agent ?? null,
        Status: r.Status ?? '',
        Success: r.Success === true,
        Message: r.Message ?? null,
        ErrorMessage: r.ErrorMessage ?? null,
        FinalStep: r.FinalStep ?? null,
        StartedAt: this.toDate(r.StartedAt),
        CompletedAt: this.toDate(r.CompletedAt)
      }));
  }

  /** Session-channel rows → named channel states (rows without a channel name are skipped). */
  private mapChannels(channels: ChannelRow[]): RealtimeSessionReviewChannelState[] {
    return channels
      .filter(c => !!c.Channel)
      .map(c => ({ ChannelName: c.Channel as string, StateJson: c.Config ?? null }));
  }

  /** Tolerant Config JSON parse — malformed/missing payloads degrade to `{}`. */
  private parseSessionConfig(raw: string | null): SessionConfigJson {
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as SessionConfigJson;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Tolerant date conversion — view rows arrive as ISO strings (or Dates from some providers). */
  private toDate(value: string | Date | null | undefined): Date | null {
    if (value == null) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
}
