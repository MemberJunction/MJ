/**
 * @fileoverview Pure, framework-agnostic helpers for the Realtime Recordings dashboard's
 * AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they can be
 * unit-tested in isolation. The component
 * ({@link RealtimeRecordingsDashboardComponent}) supplies a plain snapshot of its current
 * state and these helpers shape it into the key-value `AgentContext` object that flows to the
 * async chat agent and the realtime co-agent via `NavigationService.SetAgentContext`.
 *
 * The deep ("hardcore", Data-Explorer depth) enrichment here mirrors the Data Explorer
 * pattern: bounded session-name lists (cap {@link REALTIME_RECORDINGS_NAME_LIST_CAP} with a
 * companion `*Count` flag when truncated), the active client-side filter/search/sort state,
 * a structured (bounded) summary of the visible recordings, and a tolerant id→name→contains
 * resolver so the agent can pick a recording the way the user reads it on screen.
 *
 * 🚨 SAFETY BOUNDARY: Realtime Recordings is a read-only session-playback surface. The agent
 * may navigate playback (select / deselect a recording, refresh the list, narrow the list by a
 * client-side text filter, re-order the list) but is NEVER given any tool that mutates, deletes,
 * or exports a recording, a session, or its transcript. Keep it that way — all helpers here are
 * pure shaping / filtering / sorting with no side effects.
 */

/**
 * Upper bound on how many session names / summaries we publish in a list context field
 * (VisibleSessionNames, VisibleSessions). Keeping the streamed note bounded avoids flooding
 * the co-agent with hundreds of entries; when the underlying list is larger we surface a
 * companion total-count field instead.
 */
export const REALTIME_RECORDINGS_NAME_LIST_CAP = 25;

/** The fields a recording is sortable by (mirrors the list's sort controls). */
export const VALID_SESSION_SORT_FIELDS = ['date', 'agent', 'duration'] as const;
/** A recording sort field. */
export type SessionSortField = (typeof VALID_SESSION_SORT_FIELDS)[number];

/** The two sort directions. */
export const VALID_SESSION_SORT_DIRECTIONS = ['asc', 'desc'] as const;
/** A recording sort direction. */
export type SessionSortDirection = (typeof VALID_SESSION_SORT_DIRECTIONS)[number];

/** Type-guard for a recording sort field (keeps the SortSessions tool tolerant). */
export function isValidSessionSortField(value: unknown): value is SessionSortField {
    return typeof value === 'string' && (VALID_SESSION_SORT_FIELDS as readonly string[]).includes(value);
}

/** Type-guard for a recording sort direction (keeps the SortSessions tool tolerant). */
export function isValidSessionSortDirection(value: unknown): value is SessionSortDirection {
    return typeof value === 'string' && (VALID_SESSION_SORT_DIRECTIONS as readonly string[]).includes(value);
}

/** A bounded, plain projection of one selected recording for the agent context. */
export interface SelectedSessionAgentSnapshot {
    /** The `MJ: AI Agent Sessions` id of the selected recording. */
    ID: string;
    /** Denormalized agent name (or a friendly fallback). */
    AgentName: string;
    /** Denormalized conversation name, or null. */
    ConversationName: string | null;
    /** What was captured (`Audio` / `AudioVideo`), or null. */
    RecordingMedia: string | null;
    /** Human-readable duration label (t0 → last turn), or null when not derivable. */
    DurationLabel: string | null;
}

/** A bounded, plain projection of one recording in the master list for the agent context. */
export interface SessionListItemSnapshot {
    /** The `MJ: AI Agent Sessions` id. */
    ID: string;
    /** Denormalized agent name (or a friendly fallback). */
    AgentName: string;
    /** Denormalized conversation name, or null. */
    ConversationName: string | null;
    /** What was captured (`Audio` / `AudioVideo`), or null. */
    RecordingMedia: string | null;
    /** Human-readable duration label, or null when not derivable. */
    DurationLabel: string | null;
}

/**
 * The plain, component-supplied snapshot used to build the agent context. Mirrors the salient
 * slice of {@link RealtimeRecordingsDashboardComponent} state.
 */
export interface RealtimeRecordingsAgentContextInput {
    /** Total number of recorded sessions in the master list (unfiltered). */
    SessionCount: number;
    /** The currently selected recording, or null when nothing is selected. */
    SelectedSession: SelectedSessionAgentSnapshot | null;
    /** Number of transcript turns loaded for the selected recording. */
    TurnCount: number;
    /** True while the selected recording's transcript is loading. */
    IsDetailLoading: boolean;
    /** Active client-side text filter applied to the list (empty when none). */
    SearchQuery: string;
    /** The recordings currently visible after the active filter, in list order. */
    VisibleSessions: SessionListItemSnapshot[];
    /** Active sort field for the list. */
    SortField: SessionSortField;
    /** Active sort direction for the list. */
    SortDirection: SessionSortDirection;
}

/** Cap an array to {@link REALTIME_RECORDINGS_NAME_LIST_CAP} entries. Pure + deterministic. */
function capList<T>(items: readonly T[]): T[] {
    return items.slice(0, REALTIME_RECORDINGS_NAME_LIST_CAP);
}

/** A short display label for a recording — agent name, plus the conversation name when present. */
export function sessionDisplayLabel(session: { AgentName: string; ConversationName: string | null }): string {
    return session.ConversationName ? `${session.AgentName} — ${session.ConversationName}` : session.AgentName;
}

/**
 * Build the agent-visible context object for the Realtime Recordings dashboard.
 *
 * Reports the size of the recordings list (total + filtered), the active client-side
 * search/sort state, whether a recording is selected (and if so its identity / media /
 * duration), how many transcript turns are loaded, whether the detail pane is still loading,
 * and a bounded structured summary of the visible recordings (so the co-agent knows what's
 * selectable). Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildRealtimeRecordingsAgentContext(
    input: RealtimeRecordingsAgentContextInput,
): Record<string, unknown> {
    const selected = input.SelectedSession;
    const hasSearch = input.SearchQuery.trim().length > 0;

    const context: Record<string, unknown> = {
        SessionCount: input.SessionCount,
        FilteredSessionCount: input.VisibleSessions.length,
        HasSearch: hasSearch,
        HasSelection: selected !== null,
        SelectedSessionId: selected?.ID ?? null,
        SelectedAgentName: selected?.AgentName ?? null,
        SelectedConversationName: selected?.ConversationName ?? null,
        SelectedRecordingMedia: selected?.RecordingMedia ?? null,
        SelectedDurationLabel: selected?.DurationLabel ?? null,
        TurnCount: input.TurnCount,
        IsDetailLoading: input.IsDetailLoading,
        SortField: input.SortField,
        SortDirection: input.SortDirection,
    };

    if (hasSearch) {
        context['SearchQuery'] = input.SearchQuery;
    }

    if (input.VisibleSessions.length > 0) {
        context['VisibleSessionNames'] = capList(input.VisibleSessions.map(s => sessionDisplayLabel(s)));
        context['VisibleSessions'] = capList(input.VisibleSessions.map(s => ({
            ID: s.ID,
            AgentName: s.AgentName,
            ConversationName: s.ConversationName,
            RecordingMedia: s.RecordingMedia,
            DurationLabel: s.DurationLabel,
        })));
        if (input.VisibleSessions.length > REALTIME_RECORDINGS_NAME_LIST_CAP) {
            context['VisibleSessionsTruncated'] = true;
        }
    }

    return context;
}

/** The fields of a recording considered when matching a client-side text filter. */
export interface SessionSearchFields {
    /** The recording's agent name. */
    AgentName: string;
    /** The recording's conversation name, or null. */
    ConversationName: string | null;
    /** What was captured (`Audio` / `AudioVideo`), or null. */
    RecordingMedia: string | null;
}

/**
 * Pure, case-insensitive predicate: does a recording match a free-text query? Matches against
 * the agent name, the conversation name, and the captured-media label. An empty / whitespace
 * query matches everything (the caller decides whether to short-circuit).
 *
 * @param session - the recording's searchable fields
 * @param query - the raw, untrusted query string
 * @returns true when the recording matches the query
 */
export function sessionMatchesQuery(session: SessionSearchFields, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) {
        return true;
    }
    const haystack = [session.AgentName, session.ConversationName ?? '', session.RecordingMedia ?? '']
        .join(' ')
        .toLowerCase();
    return haystack.includes(needle);
}

/** A minimal id/name-bearing recording descriptor for the tolerant resolver. */
export interface SessionResolveCandidate {
    /** The `MJ: AI Agent Sessions` id. */
    ID: string;
    /** The recording's agent name. */
    AgentName: string;
    /** The recording's conversation name, or null. */
    ConversationName: string | null;
}

/**
 * Resolve an agent-supplied recording reference to one of the loaded recordings. The agent may
 * pass either a session ID (GUID) or a name the way the user reads it (the agent name, the
 * conversation name, or the combined "Agent — Conversation" label). We try, in order:
 *   1. exact ID (case-insensitive — UUIDs may differ in case across SQL Server / PG)
 *   2. exact combined display label (case-insensitive)
 *   3. exact agent name (case-insensitive)
 *   4. exact conversation name (case-insensitive)
 *   5. partial (contains) match on the combined display label
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable in isolation.
 *
 * @param input - whatever the agent passed (a session ID or a name)
 * @param candidates - the loaded recordings
 * @returns the matched candidate, or null on a miss
 */
export function resolveSessionByIdOrName<T extends SessionResolveCandidate>(input: string, candidates: readonly T[]): T | null {
    const needle = input.trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    const byLabel = candidates.find(c => sessionDisplayLabel(c).toLowerCase() === needle);
    if (byLabel) {
        return byLabel;
    }
    const byAgent = candidates.find(c => c.AgentName.toLowerCase() === needle);
    if (byAgent) {
        return byAgent;
    }
    const byConversation = candidates.find(c => (c.ConversationName ?? '').toLowerCase() === needle);
    if (byConversation) {
        return byConversation;
    }
    const byContains = candidates.find(c => sessionDisplayLabel(c).toLowerCase().includes(needle));
    if (byContains) {
        return byContains;
    }
    return null;
}

/**
 * Build a tolerant "not found" error for a recording lookup miss, listing a bounded sample of
 * available recording labels so the agent can correct itself.
 */
export function buildSessionNotFoundError(input: string, candidates: readonly SessionResolveCandidate[]): string {
    const sample = candidates
        .slice(0, REALTIME_RECORDINGS_NAME_LIST_CAP)
        .map(c => sessionDisplayLabel(c))
        .join(', ');
    return `No recorded session matches "${input}". Available recordings include: ${sample || '(none)'}.`;
}
