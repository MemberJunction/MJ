/**
 * Tests for the Realtime Recordings dashboard's pure agent-integration helpers:
 * - buildRealtimeRecordingsAgentContext: state snapshot → agent context object
 * - sessionMatchesQuery: client-side text-filter predicate for the SearchSessions tool
 */
import { describe, it, expect } from 'vitest';
import {
    buildRealtimeRecordingsAgentContext,
    sessionMatchesQuery,
    RealtimeRecordingsAgentContextInput,
    SelectedSessionAgentSnapshot,
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

function makeInput(overrides: Partial<RealtimeRecordingsAgentContextInput> = {}): RealtimeRecordingsAgentContextInput {
    return {
        SessionCount: 0,
        SelectedSession: null,
        TurnCount: 0,
        IsDetailLoading: false,
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

describe('buildRealtimeRecordingsAgentContext', () => {
    it('reports the empty-selection surface', () => {
        const ctx = buildRealtimeRecordingsAgentContext(makeInput({ SessionCount: 5 }));
        expect(ctx['SessionCount']).toBe(5);
        expect(ctx['HasSelection']).toBe(false);
        expect(ctx['SelectedSessionId']).toBeNull();
        expect(ctx['SelectedAgentName']).toBeNull();
        expect(ctx['SelectedConversationName']).toBeNull();
        expect(ctx['SelectedRecordingMedia']).toBeNull();
        expect(ctx['SelectedDurationLabel']).toBeNull();
        expect(ctx['TurnCount']).toBe(0);
        expect(ctx['IsDetailLoading']).toBe(false);
    });

    it('projects the selected recording into the context', () => {
        const ctx = buildRealtimeRecordingsAgentContext(makeInput({
            SessionCount: 12,
            SelectedSession: makeSelected({ ID: 'sess-9' }),
            TurnCount: 27,
            IsDetailLoading: true,
        }));
        expect(ctx['SessionCount']).toBe(12);
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
        const ctx = buildRealtimeRecordingsAgentContext(makeInput({
            SessionCount: 1,
            SelectedSession: makeSelected({ ConversationName: null, RecordingMedia: null, DurationLabel: null }),
        }));
        expect(ctx['HasSelection']).toBe(true);
        expect(ctx['SelectedConversationName']).toBeNull();
        expect(ctx['SelectedRecordingMedia']).toBeNull();
        expect(ctx['SelectedDurationLabel']).toBeNull();
    });
});

describe('sessionMatchesQuery', () => {
    it('matches case-insensitively against the agent name', () => {
        expect(sessionMatchesQuery(makeSearchFields(), 'sage')).toBe(true);
        expect(sessionMatchesQuery(makeSearchFields(), 'SAGE')).toBe(true);
    });

    it('matches against the conversation name and media type', () => {
        expect(sessionMatchesQuery(makeSearchFields(), 'quarterly')).toBe(true);
        expect(sessionMatchesQuery(makeSearchFields(), 'audiovideo')).toBe(true);
    });

    it('returns false when nothing matches', () => {
        expect(sessionMatchesQuery(makeSearchFields(), 'nonexistent')).toBe(false);
    });

    it('treats an empty / whitespace query as matching everything', () => {
        expect(sessionMatchesQuery(makeSearchFields(), '')).toBe(true);
        expect(sessionMatchesQuery(makeSearchFields(), '   ')).toBe(true);
    });

    it('tolerates null optional fields without throwing', () => {
        const sparse = makeSearchFields({ ConversationName: null, RecordingMedia: null });
        expect(sessionMatchesQuery(sparse, 'sage')).toBe(true);
        expect(sessionMatchesQuery(sparse, 'quarterly')).toBe(false);
    });
});
