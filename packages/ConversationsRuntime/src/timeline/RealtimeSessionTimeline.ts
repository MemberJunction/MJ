/**
 * Realtime-session timeline grouping for the standard conversation message list.
 *
 * `MJ: Conversation Details` rows persisted DURING a live realtime session are stamped
 * with `AgentSessionID` (the transcript relay stamps every caption turn; the artifact
 * junction-anchor rows are stamped too). Rendering those rows as the normal back/forth
 * chat bubbles is wrong — a 40-turn voice call would flood the timeline. Instead the
 * message list collapses each session's stamped rows into ONE distinct timeline element
 * (a session card) at the session's chronological position, from which the user can
 * reopen the session review.
 *
 * This module is PURE (no Angular, no entities) so the grouping pass is unit-testable:
 * the source shape is a minimal structural interface that `MJConversationDetailEntity`
 * satisfies via its getters.
 *
 * It LIVED in `ng-conversations` and was promoted here unchanged, because purity was
 * never the same thing as being in the right package: the mobile thread rendered every
 * stamped row as an ordinary bubble — precisely what the paragraph above calls wrong —
 * while the only implementation of the rule sat behind an Angular import. Any surface
 * that renders a conversation needs this, so it belongs with the engine they all share.
 * `ng-conversations` re-exports it, so its own consumers are unaffected.
 */

import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/** The minimal detail-row shape the grouping pass reads (satisfied by `MJConversationDetailEntity`). */
export interface RealtimeTimelineSourceDetail {
  ID: string;
  /** Stamped session id for rows persisted during a live realtime session; null for normal chat rows. */
  AgentSessionID: string | null;
  /** `User` | `AI` | `Error` on the entity; widened to string for structural compatibility. */
  Role: string;
  Message: string | null;
  /** Hidden rows (system/junction-anchor details) never count as visible turns. */
  HiddenToUser: boolean;
  __mj_CreatedAt: Date | null;
}

/**
 * One realtime session's collapsed block: everything the timeline card renders that can
 * be computed from the conversation's already-loaded detail rows (no extra queries).
 */
export interface RealtimeSessionTimelineGroup {
  /** `MJ: AI Agent Sessions.ID` the block's rows are stamped with (original casing of the first row). */
  SessionID: string;
  /** Timestamp of the session's first stamped row (≈ when the session's transcript began). */
  StartedAt: Date | null;
  /** Timestamp of the session's last stamped row (≈ when the transcript ended). */
  EndedAt: Date | null;
  /** VISIBLE caption turns: non-hidden `User`/`AI` rows with text (mirrors review-mode's turn mapping). */
  TurnCount: number;
  /** ALL stamped rows folded into this block, hidden anchors included. */
  DetailCount: number;
  /** Who spoke the last visible turn (AI → `Assistant`), or null when no visible turn exists. */
  LastTurnRole: 'User' | 'Assistant' | null;
  /** The last visible turn's text (untruncated — the card ellipsizes), or null. */
  LastTurnPreview: string | null;
}

/**
 * Session-row metadata the card enriches itself with when the host has it (one batched
 * `MJ: AI Agent Sessions` lookup per conversation). All-optional by design: a missing
 * meta entry degrades the card to its generic label with no status chip.
 */
export interface RealtimeSessionTimelineMeta {
  /** `MJ: AI Agent Sessions.ID`. */
  SessionID: string;
  /** Denormalized agent display name from the session view (usually the co-agent). */
  AgentName: string | null;
  Status: 'Active' | 'Closed' | 'Idle' | null;
  /** Why the session closed (`Error` | `Explicit` | `Janitor` | `Shutdown`), when closed. */
  CloseReason: string | null;
  ClosedAt: Date | null;
  /**
   * When the session row was created, which is when the call started. That is earlier than the
   * first caption, so it measures the call better than the transcript does. Optional, so meta built
   * before this field existed still type-checks.
   */
  StartedAt?: Date | null;
  /** The user whose call it was (`MJ: AI Agent Sessions.UserID`). */
  UserID?: string | null;
  /** That user's display name (the session view's denormalized `User`). */
  UserName?: string | null;
}

/** One renderable timeline entry: a normal chat message OR a collapsed session block. */
export type ConversationTimelineItem<T extends RealtimeTimelineSourceDetail> =
  | { Kind: 'message'; Detail: T }
  | { Kind: 'session'; Group: RealtimeSessionTimelineGroup };

/**
 * Builds the renderable conversation timeline from the loaded detail rows (chronological,
 * as the engine returns them):
 *  - rows WITHOUT an `AgentSessionID` pass through unchanged, in order;
 *  - rows WITH one collapse into ONE session block per session id, positioned where the
 *    session's FIRST stamped row sits. Later stamped rows of the same session (even when
 *    interleaved with normal messages) fold into that same block — one element per
 *    session, period.
 *
 * Session-id comparison is case-insensitive ({@link NormalizeUUID}) so SQL Server
 * (uppercase) and PostgreSQL (lowercase) ids group identically.
 */
export function BuildConversationTimeline<T extends RealtimeTimelineSourceDetail>(
  details: readonly T[]
): ConversationTimelineItem<T>[] {
  const items: ConversationTimelineItem<T>[] = [];
  const groupsBySessionKey = new Map<string, RealtimeSessionTimelineGroup>();

  for (const detail of details) {
    const sessionId = normalizeSessionId(detail.AgentSessionID);
    if (!sessionId) {
      items.push({ Kind: 'message', Detail: detail });
      continue;
    }
    const key = NormalizeUUID(sessionId);
    let group = groupsBySessionKey.get(key);
    if (!group) {
      group = createGroup(sessionId);
      groupsBySessionKey.set(key, group);
      items.push({ Kind: 'session', Group: group });
    }
    foldDetailIntoGroup(group, detail);
  }
  return items;
}

/** Trims the stamped session id; empty/whitespace ids are treated as unstamped. */
function normalizeSessionId(raw: string | null): string | null {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** A fresh, empty session block for the given session id. */
function createGroup(sessionId: string): RealtimeSessionTimelineGroup {
  return {
    SessionID: sessionId,
    StartedAt: null,
    EndedAt: null,
    TurnCount: 0,
    DetailCount: 0,
    LastTurnRole: null,
    LastTurnPreview: null
  };
}

/** Folds one stamped detail row into its session block (range, counts, last-turn preview). */
function foldDetailIntoGroup(group: RealtimeSessionTimelineGroup, detail: RealtimeTimelineSourceDetail): void {
  group.DetailCount++;

  const at = toDate(detail.__mj_CreatedAt);
  if (at) {
    if (!group.StartedAt || at.getTime() < group.StartedAt.getTime()) {
      group.StartedAt = at;
    }
    if (!group.EndedAt || at.getTime() > group.EndedAt.getTime()) {
      group.EndedAt = at;
    }
  }

  if (IsVisibleRealtimeTurn(detail)) {
    group.TurnCount++;
    group.LastTurnRole = detail.Role === 'AI' ? 'Assistant' : 'User';
    group.LastTurnPreview = detail.Message?.trim() ?? '';
  }
}

/**
 * Whether a session-stamped row is a turn a person should see.
 *
 * Exported because a surface that expands a session card to show its transcript must select the
 * same rows the card counted — a list whose length disagrees with the "12 turns" above it reads as
 * a bug even when both numbers are defensible. Hidden rows are the system/junction anchors the
 * relay also stamps.
 *
 * @param detail One stamped detail row.
 */
export function IsVisibleRealtimeTurn(detail: RealtimeTimelineSourceDetail): boolean {
  const text = detail.Message?.trim() ?? '';
  return !detail.HiddenToUser && text.length > 0 && (detail.Role === 'User' || detail.Role === 'AI');
}

/** Tolerant date conversion — raw cache rows can carry ISO strings instead of Dates. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * How a session card's status chip should read.
 *
 * `Tone` is semantic rather than a colour so each surface maps it to its own palette — the web to
 * its chip modifier classes, React Native to its token set.
 */
export interface RealtimeSessionStatusChip {
  /** The chip text ("Live", "Ended", "Timed out", …). */
  Label: string;
  /** What the chip means, for styling. */
  Tone: 'live' | 'idle' | 'error' | 'neutral';
}

/**
 * The card's title, in the words the rest of the product uses for a realtime session ("Start a
 * voice call with…", "End call"): "Voice call with Sage", or "Voice call" when the lookup did not
 * name the agent.
 *
 * @param meta The session-row enrichment, or null when the lookup was unavailable.
 */
export function SessionCardTitle(meta: RealtimeSessionTimelineMeta | null | undefined): string {
  const agent = meta?.AgentName?.trim();
  return agent ? `Voice call with ${agent}` : 'Voice call';
}

/**
 * The card's status chip, or `null` to hide it entirely.
 *
 * Closed sessions show a humanized close reason, falling back to "Closed" for legacy rows that
 * predate the column. No meta at all means no chip — a session whose row could not be read should
 * say nothing rather than guess.
 *
 * @param meta The session-row enrichment, or null when the lookup was unavailable.
 */
export function SessionCardStatusChip(
  meta: RealtimeSessionTimelineMeta | null | undefined
): RealtimeSessionStatusChip | null {
  switch (meta?.Status) {
    case 'Closed':
      return closeReasonChip(meta.CloseReason);
    case 'Active':
      return { Label: 'Live', Tone: 'live' };
    case 'Idle':
      return { Label: 'Idle', Tone: 'idle' };
    default:
      return null;
  }
}

/**
 * Whether the block's start and end fall on the same calendar day.
 *
 * Drives the end-time format: a same-day range shows only the time on its right half, so the date
 * is not repeated. An incomplete range counts as same-day, since there is no second date to show.
 *
 * @param group The collapsed session block.
 */
export function SessionCardIsSameDayRange(group: RealtimeSessionTimelineGroup | null | undefined): boolean {
  const start = group?.StartedAt;
  const end = group?.EndedAt;
  if (!start || !end) {
    return true;
  }
  return start.toDateString() === end.toDateString();
}

/**
 * When the call started: the session row's creation time when the lookup supplied it, else the
 * first caption's. The row is the better answer, because the transcript only begins once somebody
 * speaks.
 *
 * @param group The collapsed session block.
 * @param meta The session-row enrichment, or null when the lookup was unavailable.
 */
export function SessionCardStartedAt(
  group: RealtimeSessionTimelineGroup | null | undefined,
  meta: RealtimeSessionTimelineMeta | null | undefined
): Date | null {
  return meta?.StartedAt ?? group?.StartedAt ?? null;
}

/**
 * How long the call lasted, as a person would say it: "Under a minute", "12 min", "1 hr 5 min".
 *
 * Measured from the session row's start and close when the lookup supplied them, since the
 * transcript runs from the first thing said to the last and so comes up short. Otherwise it falls
 * back to the transcript's own span.
 *
 * `null` while the call is still going (Active or Idle), and whenever there is no span to measure.
 * A single caption says nothing about how long a call ran, so it gets no duration rather than a
 * confident "Under a minute".
 *
 * @param group The collapsed session block.
 * @param meta The session-row enrichment, or null when the lookup was unavailable.
 */
export function SessionCardDurationLabel(
  group: RealtimeSessionTimelineGroup | null | undefined,
  meta: RealtimeSessionTimelineMeta | null | undefined
): string | null {
  if (meta?.Status === 'Active' || meta?.Status === 'Idle') {
    return null;
  }
  const start = SessionCardStartedAt(group, meta);
  const end = meta?.ClosedAt ?? group?.EndedAt ?? null;
  if (!start || !end) {
    return null;
  }
  const elapsedMs = end.getTime() - start.getTime();
  // `> 0` rather than `<= 0` so a NaN from a bad date falls through to "no duration" too.
  return elapsedMs > 0 ? formatCallDuration(elapsedMs) : null;
}

/**
 * The card's message count: "No messages", "1 message", "12 messages".
 *
 * Counts the same visible turns review mode lists ({@link IsVisibleRealtimeTurn}), so the card and
 * the transcript it opens agree.
 *
 * @param group The collapsed session block.
 */
export function SessionCardMessageCountLabel(group: RealtimeSessionTimelineGroup | null | undefined): string {
  const count = group?.TurnCount ?? 0;
  if (count === 0) {
    return 'No messages';
  }
  return count === 1 ? '1 message' : `${count} messages`;
}

/**
 * Who said the card's quoted line.
 *
 * An agent turn is labeled with the agent's name, or "Agent" when the lookup did not supply one.
 * A user turn is labeled "You" on the viewer's own call and with the caller's name on anyone
 * else's. When the session row doesn't say whose call it was, the label is the neutral "Caller",
 * so a shared conversation never labels someone else's call as yours.
 *
 * `fallbackUserName` is used only when the caller passes no viewer id, and so can't tell whose
 * call it was either way.
 *
 * @param role Who spoke the line (`RealtimeSessionTimelineGroup.LastTurnRole`).
 * @param meta The session-row enrichment, or null when the lookup was unavailable.
 * @param viewerUserID The signed-in user's id, or null when the caller does not know it.
 * @param fallbackUserName Label for a user turn when the caller passes no viewer id.
 */
export function SessionCardSpeakerLabel(
  role: RealtimeSessionTimelineGroup['LastTurnRole'],
  meta: RealtimeSessionTimelineMeta | null | undefined,
  viewerUserID: string | null | undefined,
  fallbackUserName = 'You'
): string {
  if (role === 'Assistant') {
    return meta?.AgentName?.trim() || 'Agent';
  }
  const viewerID = viewerUserID?.trim();
  if (!viewerID) {
    return fallbackUserName;
  }
  const ownerID = meta?.UserID?.trim();
  if (!ownerID) {
    return 'Caller';
  }
  if (UUIDsEqual(ownerID, viewerID)) {
    return 'You';
  }
  // Someone else's call: their name if the row carried it.
  return meta?.UserName?.trim() || 'Caller';
}

/** Formats a positive span in milliseconds for {@link SessionCardDurationLabel}. */
function formatCallDuration(elapsedMs: number): string {
  if (elapsedMs < 60_000) {
    return 'Under a minute';
  }
  const totalMinutes = Math.round(elapsedMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/** Maps a close reason to its chip. `Error` is the only one that reads as a failure. */
function closeReasonChip(reason: string | null): RealtimeSessionStatusChip {
  switch (reason) {
    case 'Explicit':
      return { Label: 'Ended', Tone: 'neutral' };
    case 'Error':
      return { Label: 'Error', Tone: 'error' };
    case 'Janitor':
      return { Label: 'Timed out', Tone: 'neutral' };
    case 'Shutdown':
      // The server restarted under the call. Worded for the person on it, who never saw a server.
      return { Label: 'Interrupted', Tone: 'neutral' };
    default:
      return { Label: 'Closed', Tone: 'neutral' };
  }
}

/**
 * The `MJ: AI Agent Sessions` row shape the meta lookup reads.
 *
 * Deliberately structural and string-tolerant on the dates: a `simple` RunView returns ISO strings
 * where an entity object would return `Date`, and both callers use `simple`.
 */
export interface RealtimeSessionMetaRow {
  ID: string;
  /** Denormalized agent display name from the session view. */
  Agent?: string | null;
  Status?: 'Active' | 'Closed' | 'Idle' | null;
  CloseReason?: string | null;
  ClosedAt?: Date | string | null;
  /** The user whose call it was. */
  UserID?: string | null;
  /** Denormalized display name of that user from the session view. */
  User?: string | null;
  /** When the row was created, which is when the call started. */
  __mj_CreatedAt?: Date | string | null;
}

/**
 * The columns the meta lookup needs, so both surfaces ask for the same ones.
 *
 * A host that trims this list gets cards missing their chips on that host only — the kind of
 * divergence that is invisible until someone compares two screenshots.
 */
export const REALTIME_SESSION_META_FIELDS: readonly string[] = [
  'ID',
  'Agent',
  'Status',
  'CloseReason',
  'ClosedAt',
  'UserID',
  'User',
  '__mj_CreatedAt'
];

/**
 * The DISTINCT session ids stamped across `details`, in first-seen order.
 *
 * Deduped case-insensitively ({@link NormalizeUUID}) because SQL Server returns uppercase ids and
 * PostgreSQL lowercase; the original casing of the first occurrence is what comes back, since that
 * is what the `ID IN (…)` filter has to match.
 *
 * @param details The conversation's loaded detail rows.
 */
export function CollectRealtimeSessionIDs(details: readonly RealtimeTimelineSourceDetail[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const detail of details) {
    const raw = detail.AgentSessionID?.trim() ?? '';
    if (raw.length === 0) {
      continue;
    }
    const key = NormalizeUUID(raw);
    if (!seen.has(key)) {
      seen.add(key);
      ids.push(raw);
    }
  }
  return ids;
}

/**
 * Maps session rows to the card's meta, keyed by {@link NormalizeUUID} so lookups match however
 * the database cased the id.
 *
 * Tolerant: an unparseable `ClosedAt` or `__mj_CreatedAt` becomes `null` rather than an Invalid
 * Date, which would otherwise render as "Invalid Date" on the card.
 *
 * @param rows Rows from `MJ: AI Agent Sessions` (see {@link REALTIME_SESSION_META_FIELDS}).
 */
export function MapRealtimeSessionMeta(
  rows: readonly RealtimeSessionMetaRow[] | null | undefined
): Map<string, RealtimeSessionTimelineMeta> {
  const map = new Map<string, RealtimeSessionTimelineMeta>();
  for (const row of rows ?? []) {
    map.set(NormalizeUUID(row.ID), {
      SessionID: row.ID,
      AgentName: row.Agent ?? null,
      Status: row.Status ?? null,
      CloseReason: row.CloseReason ?? null,
      ClosedAt: toDate(row.ClosedAt),
      StartedAt: toDate(row.__mj_CreatedAt),
      UserID: row.UserID ?? null,
      UserName: row.User ?? null
    });
  }
  return map;
}

/** Looks up a session block's meta, matching however the database cased the id. */
export function FindRealtimeSessionMeta(
  metaMap: ReadonlyMap<string, RealtimeSessionTimelineMeta> | null | undefined,
  sessionId: string
): RealtimeSessionTimelineMeta | null {
  return metaMap?.get(NormalizeUUID(sessionId)) ?? null;
}
