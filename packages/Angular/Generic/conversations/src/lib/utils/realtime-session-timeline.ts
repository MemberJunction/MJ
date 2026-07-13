/**
 * Realtime-session timeline grouping for the standard conversation message list.
 *
 * `MJ: Conversation Details` rows persisted DURING a live realtime session are stamped
 * with `AgentSessionID` (the transcript relay stamps every caption turn; the artifact
 * junction-anchor rows are stamped too). Rendering those rows as the normal back/forth
 * chat bubbles is wrong — a 40-turn voice call would flood the timeline. Instead the
 * message list collapses each session's stamped rows into ONE distinct timeline element
 * (a session card) at the session's chronological position, from which the user can
 * reopen the existing SESSION REVIEW overlay.
 *
 * This module is PURE (no Angular, no entities) so the grouping pass is unit-testable:
 * the source shape is a minimal structural interface that `MJConversationDetailEntity`
 * satisfies via its getters.
 */

import { NormalizeUUID } from '@memberjunction/global';

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

  const text = detail.Message?.trim() ?? '';
  const isVisibleTurn = !detail.HiddenToUser && text.length > 0 && (detail.Role === 'User' || detail.Role === 'AI');
  if (isVisibleTurn) {
    group.TurnCount++;
    group.LastTurnRole = detail.Role === 'AI' ? 'Assistant' : 'User';
    group.LastTurnPreview = text;
  }
}

/** Tolerant date conversion — raw cache rows can carry ISO strings instead of Dates. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
