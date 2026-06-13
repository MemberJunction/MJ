import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata, RunView, RunViewParams } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { RealtimeDelegationCardVM, RealtimeThreadItem } from '../components/realtime/realtime-session-state';
import { ParsedDelegationArtifact } from './delegation-result-parser';

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
 * MULTI-LEG channel-state merge: folds every leg's channel rows into one state set,
 * NEWEST leg wins per channel name — but only a leg that actually SAVED state counts.
 * A resumed session whose final leg never touched the whiteboard therefore still
 * reviews with the board an EARLIER leg drew (previously only the primary/newest leg's
 * rows were consulted, so that board silently vanished from review).
 *
 * @param legChannelStates Per-leg channel states, ordered OLDEST → NEWEST (the chain order).
 * @returns One entry per channel name (case-insensitive), each from the newest leg that
 *   saved a non-empty state; channels no leg ever saved keep a null-state entry so the
 *   review still knows the channel existed.
 */
export function MergeChainChannelStates(
  legChannelStates: ReadonlyArray<ReadonlyArray<RealtimeSessionReviewChannelState>>
): RealtimeSessionReviewChannelState[] {
  const byName = new Map<string, RealtimeSessionReviewChannelState>();
  for (const leg of legChannelStates) {
    for (const state of leg) {
      const key = state.ChannelName.trim().toLowerCase();
      if (key.length === 0) {
        continue;
      }
      const existing = byName.get(key);
      const hasState = typeof state.StateJson === 'string' && state.StateJson.trim().length > 0;
      // Later legs are newer: a saved state always supersedes; a null/empty state only
      // registers the channel's existence and never clobbers an earlier saved board.
      if (!existing || hasState) {
        byName.set(key, hasState ? state : (existing ?? state));
      }
    }
  }
  return [...byName.values()];
}

/**
 * One LEG of a reviewed session chain: a single `MJ: AI Agent Sessions` row plus its own
 * caption turns and delegated-run previews. A session resumed via `lastSessionId` chains
 * legs together (newest leg's `LastSessionID` → prior leg); the review loader walks that
 * chain BACKWARDS (capped — see the loader docs) so review mode can render the FULL
 * conversation arc chronologically, with a divider between legs.
 */
export interface RealtimeSessionReviewLeg {
  /** `MJ: AI Agent Sessions.ID` of this leg. */
  SessionID: string;
  /** When this leg started (`__mj_CreatedAt`). */
  StartedAt: Date | null;
  /** When this leg closed (null while still open). */
  ClosedAt: Date | null;
  /** Why this leg closed (null while open / legacy rows). */
  CloseReason: RealtimeReviewCloseReason | null;
  /** This leg's chronological caption turns (oldest first). */
  Turns: RealtimeSessionReviewTurn[];
  /** This leg's delegated-run previews (oldest first, minus its co-agent observability run). */
  DelegatedRuns: RealtimeSessionReviewRun[];
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
  /** Chronological caption turns (oldest first) — ALL legs of the chain, flattened. */
  Turns: RealtimeSessionReviewTurn[];
  /** Delegated run previews (oldest first, all legs), minus each leg's co-agent observability run. */
  DelegatedRuns: RealtimeSessionReviewRun[];
  /**
   * Saved channel states, one per session-channel row that carried a name. Channel state
   * (e.g. the whiteboard board) is the LATEST leg's only — earlier legs' states were
   * superseded when the chain resumed.
   */
  ChannelStates: RealtimeSessionReviewChannelState[];
  /**
   * The session-chain LEGS, chronological (oldest first; the LAST leg is the reviewed
   * session itself). Single-session reviews carry exactly one leg. Drives the per-leg
   * dividers `BuildReviewThreadItems` renders.
   */
  Legs: RealtimeSessionReviewLeg[];
  /**
   * ARTIFACTS attached to the chain's conversation history: every `MJ: Conversation
   * Detail Artifacts` junction (Direction `Output`) hanging off the chain's
   * session-stamped `Conversation Details`, resolved to `{ArtifactID, ArtifactVersionID,
   * Name}`. Review mode registers each as an (unfocused) artifact tab on the surface
   * panel, and they carry into a resumed live session. Empty when none / on any
   * tolerated load failure.
   */
  Artifacts: ParsedDelegationArtifact[];
}

// ── Raw row shapes (ResultType: 'simple', narrowed Fields) ──────────────────

interface SessionRow {
  ID: string;
  AgentID: string;
  Agent: string | null;
  Status: 'Active' | 'Closed' | 'Idle';
  ConversationID: string | null;
  Config: string | null;
  LastSessionID: string | null;
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

interface DetailArtifactJunctionRow {
  ID: string;
  ConversationDetailID: string;
  ArtifactVersionID: string | null;
}

interface ArtifactVersionRow {
  ID: string;
  ArtifactID: string;
  /** Version display name (nullable on the row). */
  Name: string | null;
  /** Denormalized parent-artifact name from the version view. */
  Artifact: string | null;
}

/** The raw rows of ONE chain leg, before mapping to the public review shapes. */
interface LegRows {
  session: SessionRow;
  details: DetailRow[];
  runs: RunRow[];
  channels: ChannelRow[];
}

/** The Config-JSON keys the realtime voice stack persists on `AIAgentSession.Config`. */
interface SessionConfigJson {
  targetAgentID?: string;
  coAgentRunID?: string;
}

const SESSION_FIELDS = ['ID', 'AgentID', 'Agent', 'Status', 'ConversationID', 'Config', 'LastSessionID', 'LastActiveAt', 'ClosedAt', 'CloseReason', '__mj_CreatedAt'];
const DETAIL_FIELDS = ['ID', 'Role', 'Message', 'HiddenToUser', '__mj_CreatedAt'];
const RUN_FIELDS = ['ID', 'AgentID', 'Agent', 'Status', 'Success', 'Message', 'ErrorMessage', 'FinalStep', 'StartedAt', 'CompletedAt'];
const CHANNEL_FIELDS = ['ID', 'Channel', 'Config'];
const JUNCTION_FIELDS = ['ID', 'ConversationDetailID', 'ArtifactVersionID'];
const VERSION_FIELDS = ['ID', 'ArtifactID', 'Name', 'Artifact'];

/** Maximum number of chain legs the review loader walks (the reviewed session included). */
export const MAX_REVIEW_LEGS = 5;
/** Maximum total caption-detail rows loaded across the whole chain (oldest legs trimmed first). */
export const MAX_REVIEW_DETAILS = 500;

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
 *
 * CHAIN-AWARE: when the review carries multiple {@link RealtimeSessionReview.Legs}, each
 * leg's items render in leg order with a `divider` item between legs ("Session leg
 * started · <time>", carrying the PREVIOUS leg's CloseReason as a chip). A single-leg
 * review (or a legless legacy shape) renders the flat thread with no divider —
 * byte-identical to the pre-chain behavior.
 */
export function BuildReviewThreadItems(review: RealtimeSessionReview): RealtimeThreadItem[] {
  const legs = review.Legs ?? [];
  if (legs.length <= 1) {
    const only = legs[0];
    return buildLegThreadItems(only?.Turns ?? review.Turns, only?.DelegatedRuns ?? review.DelegatedRuns, review.AgentName);
  }
  const items: RealtimeThreadItem[] = [];
  legs.forEach((leg, i) => {
    if (i > 0) {
      items.push({
        Kind: 'divider',
        Label: 'Session leg started',
        At: leg.StartedAt,
        Icon: 'fa-solid fa-arrows-rotate',
        CloseReason: legs[i - 1].CloseReason ?? null
      });
    }
    items.push(...buildLegThreadItems(leg.Turns, leg.DelegatedRuns, review.AgentName));
  });
  return items;
}

/**
 * Builds ONE leg's chronological items (caption turns + done delegation cards, oldest
 * first). Entries without a timestamp sort to the front, preserving their relative order.
 */
function buildLegThreadItems(
  turns: RealtimeSessionReviewTurn[],
  runs: RealtimeSessionReviewRun[],
  fallbackAgentName: string
): RealtimeThreadItem[] {
  const stamped: Array<{ At: number; Item: RealtimeThreadItem }> = [];
  for (const turn of turns) {
    stamped.push({ At: turn.At?.getTime() ?? 0, Item: { Kind: 'caption', Role: turn.Role, Text: turn.Text } });
  }
  for (const run of runs) {
    stamped.push({ At: run.StartedAt?.getTime() ?? 0, Item: { Kind: 'delegation', Card: BuildReviewDelegationCard(run, fallbackAgentName) } });
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
 * CHAIN-AWARE: when the reviewed session carries a `LastSessionID` (it RESUMED an earlier
 * session), the loader walks the chain BACKWARDS — capped at {@link MAX_REVIEW_LEGS} legs
 * and {@link MAX_REVIEW_DETAILS} caption rows total (oldest legs trimmed first), with a
 * cycle guard so a corrupt A→B→A chain can never loop — and surfaces ALL legs
 * chronologically on {@link RealtimeSessionReview.Legs}. Channel state stays the
 * reviewed (latest) leg's only. The chain's conversation-history ARTIFACTS (junction
 * rows on the session-stamped details) are collected onto
 * {@link RealtimeSessionReview.Artifacts}.
 *
 * TOLERANT by design: any missing piece degrades to an empty collection; the loader
 * returns `null` only when the reviewed session row itself can't be found.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeSessionReviewService {
  /**
   * Loads everything review mode renders for one past session (and its prior-leg chain).
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
      const md = provider ?? Metadata.Provider;
      const primary = await this.loadLegRows(trimmed, md, true);
      if (!primary) {
        return null;
      }
      const chain = await this.collectChainLegs(primary, md);
      const artifacts = await this.loadChainArtifacts(chain, md);
      return this.assembleReview(chain, artifacts);
    } catch (error) {
      console.error('[RealtimeSessionReview] Failed to load session review:', error);
      return null;
    }
  }

  /**
   * One batched RunViews pass for one chain leg: session row + caption turns + linked
   * runs (+ channel rows for the PRIMARY leg only — channel state is latest-leg-only).
   * Returns `null` when the session row can't be found.
   */
  private async loadLegRows(
    agentSessionId: string,
    provider: IMetadataProvider,
    includeChannels: boolean
  ): Promise<LegRows | null> {
    const safeID = agentSessionId.replace(/'/g, "''");
    const rv = RunView.FromMetadataProvider(provider);
    const queries: RunViewParams[] = [
      { EntityName: 'MJ: AI Agent Sessions', ExtraFilter: `ID='${safeID}'`, Fields: SESSION_FIELDS, ResultType: 'simple' as const },
      {
        EntityName: 'MJ: Conversation Details', ExtraFilter: `AgentSessionID='${safeID}'`, Fields: DETAIL_FIELDS,
        OrderBy: '__mj_CreatedAt ASC', MaxRows: MAX_REVIEW_DETAILS, ResultType: 'simple' as const
      },
      { EntityName: 'MJ: AI Agent Runs', ExtraFilter: `AgentSessionID='${safeID}'`, Fields: RUN_FIELDS, OrderBy: 'StartedAt ASC', ResultType: 'simple' as const }
    ];
    if (includeChannels) {
      queries.push({ EntityName: 'MJ: AI Agent Session Channels', ExtraFilter: `AgentSessionID='${safeID}'`, Fields: CHANNEL_FIELDS, ResultType: 'simple' as const });
    }
    const [sessionResult, detailResult, runResult, channelResult] = await rv.RunViews(queries);
    const sessions = (sessionResult?.Success ? sessionResult.Results : []) as SessionRow[];
    const session = sessions[0] ?? null;
    if (!session) {
      return null;
    }
    return {
      session,
      details: (detailResult?.Success ? detailResult.Results : []) as DetailRow[],
      runs: (runResult?.Success ? runResult.Results : []) as RunRow[],
      channels: (channelResult?.Success ? channelResult.Results : []) as ChannelRow[]
    };
  }

  /**
   * Walks the `LastSessionID` chain BACKWARDS from the reviewed (primary) leg, collecting
   * raw leg rows OLDEST-FIRST (primary last). Safety rails:
   *  - at most {@link MAX_REVIEW_LEGS} legs total;
   *  - at most {@link MAX_REVIEW_DETAILS} caption rows across the chain — an older leg
   *    whose details would overflow the budget is trimmed to its NEWEST rows and ends
   *    the walk;
   *  - a visited-set cycle guard (case-insensitive ids) so A→B→A can never loop;
   *  - a leg that fails to load simply ends the walk (the collected legs still render).
   */
  private async collectChainLegs(primary: LegRows, provider: IMetadataProvider): Promise<LegRows[]> {
    const chain: LegRows[] = [primary];
    const visited = new Set<string>([this.normalizeID(primary.session.ID)]);
    let cursor = primary.session.LastSessionID ?? null;
    let detailBudget = MAX_REVIEW_DETAILS - primary.details.length;

    while (cursor && chain.length < MAX_REVIEW_LEGS && detailBudget > 0) {
      const key = this.normalizeID(cursor);
      if (visited.has(key)) {
        console.warn(`[RealtimeSessionReview] Session chain cycle detected at ${cursor} — stopping the walk.`);
        break;
      }
      visited.add(key);
      const leg = await this.loadLegRows(cursor, provider, false);
      if (!leg) {
        break;
      }
      if (leg.details.length > detailBudget) {
        // Keep this leg's NEWEST rows (details arrive oldest-first) and end the walk.
        leg.details = leg.details.slice(leg.details.length - detailBudget);
        detailBudget = 0;
      } else {
        detailBudget -= leg.details.length;
      }
      chain.unshift(leg);
      cursor = leg.session.LastSessionID ?? null;
    }
    return chain;
  }

  /**
   * Collects the chain's conversation-history ARTIFACTS: `MJ: Conversation Detail
   * Artifacts` junction rows (Direction `Output`) hanging off the chain's session-stamped
   * details, resolved through `MJ: Artifact Versions` to `{ArtifactID, ArtifactVersionID,
   * Name}` (version name, falling back to the artifact name). Order follows junction
   * creation; duplicate versions are deduped. TOLERANT: any failure returns `[]`.
   */
  private async loadChainArtifacts(chain: LegRows[], provider: IMetadataProvider): Promise<ParsedDelegationArtifact[]> {
    const detailIDs = chain.flatMap(leg => leg.details.map(d => d.ID)).filter(id => typeof id === 'string' && id.length > 0);
    if (detailIDs.length === 0) {
      return [];
    }
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const detailList = detailIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
      const [junctionResult] = await rv.RunViews([{
        EntityName: 'MJ: Conversation Detail Artifacts',
        ExtraFilter: `ConversationDetailID IN (${detailList}) AND Direction='Output'`,
        Fields: JUNCTION_FIELDS,
        OrderBy: '__mj_CreatedAt ASC',
        ResultType: 'simple'
      }]);
      const junctions = (junctionResult?.Success ? junctionResult.Results : []) as DetailArtifactJunctionRow[];
      const versionIDs = this.uniqueVersionIDs(junctions);
      if (versionIDs.length === 0) {
        return [];
      }

      const versionList = versionIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
      const [versionResult] = await rv.RunViews([{
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ID IN (${versionList})`,
        Fields: VERSION_FIELDS,
        ResultType: 'simple'
      }]);
      const versions = (versionResult?.Success ? versionResult.Results : []) as ArtifactVersionRow[];
      const byID = new Map<string, ArtifactVersionRow>(versions.map(v => [this.normalizeID(v.ID), v]));

      const artifacts: ParsedDelegationArtifact[] = [];
      for (const versionID of versionIDs) {
        const row = byID.get(this.normalizeID(versionID));
        if (!row?.ArtifactID) {
          continue; // junction points at an unreadable / deleted version — skip
        }
        artifacts.push({
          ArtifactID: row.ArtifactID,
          ArtifactVersionID: row.ID,
          Name: row.Name?.trim() || row.Artifact?.trim() || 'Artifact'
        });
      }
      return artifacts;
    } catch (error) {
      console.warn('[RealtimeSessionReview] Artifact collection failed — review renders without artifact tabs.', error);
      return [];
    }
  }

  /** Unique, non-empty `ArtifactVersionID`s from junction rows, in arrival order (case-insensitive dedupe). */
  private uniqueVersionIDs(junctions: DetailArtifactJunctionRow[]): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const j of junctions) {
      const id = typeof j.ArtifactVersionID === 'string' ? j.ArtifactVersionID.trim() : '';
      if (id.length === 0 || seen.has(this.normalizeID(id))) {
        continue;
      }
      seen.add(this.normalizeID(id));
      ids.push(id);
    }
    return ids;
  }

  /** Case-insensitive UUID key for Set/Map membership (SQL Server uppercase vs PostgreSQL lowercase). */
  private normalizeID(id: string): string {
    return (id ?? '').trim().toLowerCase();
  }

  /**
   * Folds the chain's raw leg rows into the typed review. The PRIMARY (reviewed) leg —
   * the chain's LAST entry — supplies identity/lifecycle/channel state; turns and runs
   * are surfaced both per-leg (`Legs`) and flattened chronologically (`Turns` /
   * `DelegatedRuns`). Each leg excludes ITS OWN config's co-agent observability run.
   */
  private assembleReview(chain: LegRows[], artifacts: ParsedDelegationArtifact[]): RealtimeSessionReview {
    const primary = chain[chain.length - 1];
    const session = primary.session;
    const config = this.parseSessionConfig(session.Config);
    const legs = chain.map(leg => this.mapLeg(leg));
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
      Turns: legs.flatMap(l => l.Turns),
      DelegatedRuns: legs.flatMap(l => l.DelegatedRuns),
      // Multi-leg: newest leg with a SAVED state wins per channel — a final leg that
      // never touched the board no longer hides an earlier leg's drawing from review.
      ChannelStates: MergeChainChannelStates(chain.map(leg => this.mapChannels(leg.channels))),
      Legs: legs,
      Artifacts: artifacts
    };
  }

  /** Maps one leg's raw rows to the public leg shape (per-leg co-agent-run exclusion). */
  private mapLeg(leg: LegRows): RealtimeSessionReviewLeg {
    const config = this.parseSessionConfig(leg.session.Config);
    return {
      SessionID: leg.session.ID,
      StartedAt: this.toDate(leg.session.__mj_CreatedAt),
      ClosedAt: this.toDate(leg.session.ClosedAt),
      CloseReason: leg.session.CloseReason ?? null,
      Turns: this.mapTurns(leg.details),
      DelegatedRuns: this.mapRuns(leg.runs, config.coAgentRunID ?? null)
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
