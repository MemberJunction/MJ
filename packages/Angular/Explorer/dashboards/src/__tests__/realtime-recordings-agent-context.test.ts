/**
 * Tests for the Realtime Recordings dashboard's pure agent-integration helpers:
 * - buildRealtimeRecordingsAgentContext: state snapshot → agent context object (counts,
 *   filter/sort state, selection, bounded visible-session summary).
 * - sessionMatchesQuery: client-side text-filter predicate for the SearchSessions tool.
 * - resolveSessionByIdOrName / buildSessionNotFoundError: tolerant id→name→contains resolver.
 * - isValidSessionSortField / isValidSessionSortDirection: tolerant SortSessions guards.
 * - sessionDisplayLabel: the "Agent — Conversation" label.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildRealtimeRecordingsAgentContext,
    BuildSessionNotFoundError,
    IsValidSessionSortDirection,
    IsValidSessionSortField,
    REALTIME_RECORDINGS_NAME_LIST_CAP,
    RealtimeRecordingsAgentContextInput,
    ResolveSessionByIdOrName,
    SelectedSessionAgentSnapshot,
    SessionListItemSnapshot,
    SessionDisplayLabel,
    SessionMatchesQuery,
    SessionResolveCandidate,
    SessionSearchFields,
} from '../RealtimeRecordings/realtime-recordings-agent-context';

function makeSelected(overrides: Partial<SelectedSessionAgentSnapshot> = {}): SelectedSessionAgentSnapshot {
    return {
        ID: 'sess-1',
        AgentName: 'Sage',
        ConversationName: 'Quarterly Review',
        RecordingMedia: 'AudioVideo',
        DurationLabel: '3:42',
        ...overrides,
    };
}

function makeListItem(overrides: Partial<SessionListItemSnapshot> = {}): SessionListItemSnapshot {
    return {
        ID: 'sess-1',
        AgentName: 'Sage',
        ConversationName: 'Quarterly Review',
        RecordingMedia: 'AudioVideo',
        DurationLabel: '3:42',
        ...overrides,
    };
}

function makeInput(overrides: Partial<RealtimeRecordingsAgentContextInput> = {}): RealtimeRecordingsAgentContextInput {
    return {
        SessionCount: 0,
        SelectedSession: null,
        TurnCount: 0,
        IsDetailLoading: false,
        SearchQuery: '',
        VisibleSessions: [],
        SortField: 'date',
        SortDirection: 'desc',
        ...overrides,
    };
}

function makeSearchFields(overrides: Partial<SessionSearchFields> = {}): SessionSearchFields {
    return {
        AgentName: 'Sage',
        ConversationName: 'Quarterly Review',
        RecordingMedia: 'AudioVideo',
        ...overrides,
    };
}

describe('sessionDisplayLabel', () => {
    it('combines agent + conversation when both present', () => {
        expect(SessionDisplayLabel({ AgentName: 'Sage', ConversationName: 'Review' })).toBe('Sage — Review');
    });
    it('falls back to the agent name alone when there is no conversation', () => {
        expect(SessionDisplayLabel({ AgentName: 'Sage', ConversationName: null })).toBe('Sage');
    });
});

describe('buildRealtimeRecordingsAgentContext', () => {
    it('reports the empty-selection surface with filter/sort state', () => {
        const ctx = BuildRealtimeRecordingsAgentContext(makeInput({ SessionCount: 5 }));
        expect(ctx['SessionCount']).toBe(5);
        expect(ctx['FilteredSessionCount']).toBe(0);
        expect(ctx['HasSelection']).toBe(false);
        expect(ctx['HasSearch']).toBe(false);
        expect(ctx['SelectedSessionId']).toBeNull();
        expect(ctx['TurnCount']).toBe(0);
        expect(ctx['IsDetailLoading']).toBe(false);
        expect(ctx['SortField']).toBe('date');
        expect(ctx['SortDirection']).toBe('desc');
        expect(ctx['SearchQuery']).toBeUndefined();
        expect(ctx['VisibleSessions']).toBeUndefined();
    });

    it('projects the selected recording into the context', () => {
        const ctx = BuildRealtimeRecordingsAgentContext(makeInput({
            SessionCount: 12,
            SelectedSession: makeSelected({ ID: 'sess-9' }),
            TurnCount: 27,
            IsDetailLoading: true,
        }));
        expect(ctx['HasSelection']).toBe(true);
        expect(ctx['SelectedSessionId']).toBe('sess-9');
        expect(ctx['SelectedAgentName']).toBe('Sage');
        expect(ctx['SelectedConversationName']).toBe('Quarterly Review');
        expect(ctx['SelectedRecordingMedia']).toBe('AudioVideo');
        expect(ctx['SelectedDurationLabel']).toBe('3:42');
        expect(ctx['TurnCount']).toBe(27);
        expect(ctx['IsDetailLoading']).toBe(true);
    });

    it('preserves null optional fields on the selected recording', () => {
        const ctx = BuildRealtimeRecordingsAgentContext(makeInput({
            SessionCount: 1,
            SelectedSession: makeSelected({ ConversationName: null, RecordingMedia: null, DurationLabel: null }),
        }));
        expect(ctx['HasSelection']).toBe(true);
        expect(ctx['SelectedConversationName']).toBeNull();
        expect(ctx['SelectedRecordingMedia']).toBeNull();
        expect(ctx['SelectedDurationLabel']).toBeNull();
    });

    it('surfaces the search query + filtered count + visible summary when present', () => {
        const ctx = BuildRealtimeRecordingsAgentContext(makeInput({
            SessionCount: 3,
            SearchQuery: 'sage',
            VisibleSessions: [makeListItem({ ID: 'a' }), makeListItem({ ID: 'b', ConversationName: null })],
        }));
        expect(ctx['HasSearch']).toBe(true);
        expect(ctx['SearchQuery']).toBe('sage');
        expect(ctx['FilteredSessionCount']).toBe(2);
        expect(ctx['VisibleSessionNames']).toEqual(['Sage — Quarterly Review', 'Sage']);
        expect((ctx['VisibleSessions'] as unknown[]).length).toBe(2);
    });

    it('bounds the visible-session lists and flags truncation', () => {
        const many = Array.from({ length: REALTIME_RECORDINGS_NAME_LIST_CAP + 4 }, (_, i) => makeListItem({ ID: `s${i}`, AgentName: `Agent ${i}` }));
        const ctx = BuildRealtimeRecordingsAgentContext(makeInput({ SessionCount: many.length, VisibleSessions: many }));
        expect((ctx['VisibleSessionNames'] as string[]).length).toBe(REALTIME_RECORDINGS_NAME_LIST_CAP);
        expect((ctx['VisibleSessions'] as unknown[]).length).toBe(REALTIME_RECORDINGS_NAME_LIST_CAP);
        expect(ctx['VisibleSessionsTruncated']).toBe(true);
        expect(ctx['FilteredSessionCount']).toBe(many.length);
    });
});

describe('sessionMatchesQuery', () => {
    it('matches case-insensitively against agent, conversation, and media', () => {
        expect(SessionMatchesQuery(makeSearchFields(), 'SAGE')).toBe(true);
        expect(SessionMatchesQuery(makeSearchFields(), 'quarterly')).toBe(true);
        expect(SessionMatchesQuery(makeSearchFields(), 'audiovideo')).toBe(true);
    });

    it('returns false when nothing matches', () => {
        expect(SessionMatchesQuery(makeSearchFields(), 'nonexistent')).toBe(false);
    });

    it('treats an empty / whitespace query as matching everything', () => {
        expect(SessionMatchesQuery(makeSearchFields(), '')).toBe(true);
        expect(SessionMatchesQuery(makeSearchFields(), '   ')).toBe(true);
    });

    it('tolerates null optional fields without throwing', () => {
        const sparse = makeSearchFields({ ConversationName: null, RecordingMedia: null });
        expect(SessionMatchesQuery(sparse, 'sage')).toBe(true);
        expect(SessionMatchesQuery(sparse, 'quarterly')).toBe(false);
    });
});

describe('resolveSessionByIdOrName', () => {
    const candidates: SessionResolveCandidate[] = [
        { ID: 'id-1', AgentName: 'Sage', ConversationName: 'Quarterly Review' },
        { ID: 'id-2', AgentName: 'Atlas', ConversationName: 'Onboarding' },
        { ID: 'id-3', AgentName: 'Sage', ConversationName: null },
    ];

    it('resolves by exact ID (case-insensitive)', () => {
        expect(ResolveSessionByIdOrName('ID-2', candidates)?.ID).toBe('id-2');
    });

    it('resolves by the combined "Agent — Conversation" label', () => {
        expect(ResolveSessionByIdOrName('Sage — Quarterly Review', candidates)?.ID).toBe('id-1');
    });

    it('resolves by exact agent name', () => {
        expect(ResolveSessionByIdOrName('Atlas', candidates)?.ID).toBe('id-2');
    });

    it('resolves by exact conversation name', () => {
        expect(ResolveSessionByIdOrName('onboarding', candidates)?.ID).toBe('id-2');
    });

    it('falls back to a partial (contains) match on the label', () => {
        expect(ResolveSessionByIdOrName('quarterly', candidates)?.ID).toBe('id-1');
    });

    it('returns null on a miss / blank input', () => {
        expect(ResolveSessionByIdOrName('nope', candidates)).toBeNull();
        expect(ResolveSessionByIdOrName('  ', candidates)).toBeNull();
    });
});

describe('buildSessionNotFoundError', () => {
    it('lists a bounded sample of available recording labels', () => {
        const msg = BuildSessionNotFoundError('xyz', [
            { ID: '1', AgentName: 'Sage', ConversationName: 'Review' },
            { ID: '2', AgentName: 'Atlas', ConversationName: null },
        ]);
        expect(msg).toContain('xyz');
        expect(msg).toContain('Sage — Review');
        expect(msg).toContain('Atlas');
    });

    it('handles an empty candidate list gracefully', () => {
        expect(BuildSessionNotFoundError('x', [])).toContain('(none)');
    });
});

describe('SortSessions guards', () => {
    it('validates sort fields', () => {
        expect(IsValidSessionSortField('date')).toBe(true);
        expect(IsValidSessionSortField('agent')).toBe(true);
        expect(IsValidSessionSortField('duration')).toBe(true);
        expect(IsValidSessionSortField('bogus')).toBe(false);
        expect(IsValidSessionSortField(42)).toBe(false);
    });

    it('validates sort directions', () => {
        expect(IsValidSessionSortDirection('asc')).toBe(true);
        expect(IsValidSessionSortDirection('desc')).toBe(true);
        expect(IsValidSessionSortDirection('sideways')).toBe(false);
        expect(IsValidSessionSortDirection(null)).toBe(false);
    });
});
