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
 * 🚨 SAFETY BOUNDARY: Realtime Recordings is a read-only session-playback surface. The agent
 * may navigate playback (select / deselect a recording, refresh the list, narrow the list by a
 * client-side text filter) but is NEVER given any tool that mutates, deletes, or exports a
 * recording, a session, or its transcript. Keep it that way — all helpers here are pure shaping
 * / filtering with no side effects.
 */

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

/**
 * The plain, component-supplied snapshot used to build the agent context. Mirrors the salient
 * slice of {@link RealtimeRecordingsDashboardComponent} state.
 */
export interface RealtimeRecordingsAgentContextInput {
    /** Total number of recorded sessions in the master list. */
    SessionCount: number;
    /** The currently selected recording, or null when nothing is selected. */
    SelectedSession: SelectedSessionAgentSnapshot | null;
    /** Number of transcript turns loaded for the selected recording. */
    TurnCount: number;
    /** True while the selected recording's transcript is loading. */
    IsDetailLoading: boolean;
}

/**
 * Build the agent-visible context object for the Realtime Recordings dashboard.
 *
 * Reports the size of the recordings list, whether a recording is selected (and if so its
 * identity / media / duration), how many transcript turns are loaded, and whether the detail
 * pane is still loading. Keeping this a pure function (no `this`) makes the context shape
 * unit-testable and decouples it from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildRealtimeRecordingsAgentContext(
    input: RealtimeRecordingsAgentContextInput,
): Record<string, unknown> {
    const selected = input.SelectedSession;
    return {
        SessionCount: input.SessionCount,
        HasSelection: selected !== null,
        SelectedSessionId: selected?.ID ?? null,
        SelectedAgentName: selected?.AgentName ?? null,
        SelectedConversationName: selected?.ConversationName ?? null,
        SelectedRecordingMedia: selected?.RecordingMedia ?? null,
        SelectedDurationLabel: selected?.DurationLabel ?? null,
        TurnCount: input.TurnCount,
        IsDetailLoading: input.IsDetailLoading,
    };
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
