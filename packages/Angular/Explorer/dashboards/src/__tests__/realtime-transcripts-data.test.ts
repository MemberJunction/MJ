/**
 * Tests for the Voice Transcripts data layer
 * (`AI/components/analytics/realtime/realtime-transcripts-data.ts`):
 * - `attributeLine` — the diarization-attribution core: agent lines → agent name; heard lines → the
 *   diarized participant (human OR another agent, not lumped as "User"); undiarized → generic; errors.
 * - `LoadMeetingRooms` — queries `Type='Meeting Room'` newest-first and maps rows; tolerant of failure.
 * - `LoadRoomTranscript` — reads the room's Main rows (a bridge session writes Main) in `Sequence` order.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (mirror realtime-session-data.test.ts) ──
const runViewMock = vi.fn();
const runViewsMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider: () => ({ RunView: runViewMock, RunViews: runViewsMock }),
        },
    };
});
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: { Instance: { Agents: [{ ID: 'A1', Name: 'Sage' }] } },
}));

import type { IMetadataProvider } from '@memberjunction/core';
import { LoadMeetingRooms, AttributeLine, LoadRoomTranscript } from '../AI/components/analytics/realtime/realtime-transcripts-data';

const provider = { CurrentUser: { ID: 'u1' } } as unknown as IMetadataProvider;

describe('realtime-transcripts-data — attributeLine (diarization attribution)', () => {
    const agents = new Map([['a1', 'Sage']]); // AgentID(lower) → name
    const participants = new Map([
        ['human-42', { name: 'Alice', isAgent: false }],
        ['agent-x', { name: 'Marketing', isAgent: true }],
    ]);
    const row = (over: Record<string, unknown>) => ({ ID: 'd1', __mj_CreatedAt: '2026-06-20T00:00:00Z', ...over });

    it('AI line → agent name from AgentID (falls back to "Agent")', () => {
        expect(AttributeLine(row({ Role: 'AI', Message: 'hi', AgentID: 'A1' }), participants, agents))
            .toMatchObject({ Kind: 'agent', Speaker: 'Sage', Message: 'hi' });
        expect(AttributeLine(row({ Role: 'AI', Message: 'hi', AgentID: 'who' }), participants, agents).Speaker).toBe('Agent');
    });

    it('User line with a diarized HUMAN participant → human + display name', () => {
        expect(AttributeLine(row({ Role: 'User', Message: 'hey', ExternalID: 'human-42' }), participants, agents))
            .toMatchObject({ Kind: 'human', Speaker: 'Alice' });
    });

    it('User line whose diarized speaker is ANOTHER AGENT → agent + name (not lumped as a generic user)', () => {
        expect(AttributeLine(row({ Role: 'User', Message: 'data', ExternalID: 'agent-x' }), participants, agents))
            .toMatchObject({ Kind: 'agent', Speaker: 'Marketing' });
    });

    it('User line with no diarization label → generic Participant', () => {
        expect(AttributeLine(row({ Role: 'User', Message: 'who?' }), participants, agents))
            .toMatchObject({ Kind: 'human', Speaker: 'Participant' });
    });

    it('Error line → error kind, message from Error column', () => {
        expect(AttributeLine(row({ Role: 'Error', Error: 'boom' }), participants, agents))
            .toMatchObject({ Kind: 'error', Speaker: 'Error', Message: 'boom' });
    });
});

describe('realtime-transcripts-data — LoadMeetingRooms', () => {
    it('queries Type=Meeting Room newest-first and maps rows to summaries', async () => {
        runViewMock.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: 'c1', Name: 'Room A', ExternalID: 'room-a', __mj_CreatedAt: '2026-06-20T00:00:00Z', __mj_UpdatedAt: '2026-06-20T01:00:00Z' }],
        });
        const rooms = await LoadMeetingRooms(provider);

        const params = runViewMock.mock.calls[0][0];
        expect(params.EntityName).toBe('MJ: Conversations');
        expect(params.ExtraFilter).toContain("Type='Meeting Room'");
        expect(params.OrderBy).toContain('__mj_UpdatedAt DESC');
        expect(rooms[0]).toMatchObject({ ConversationID: 'c1', Name: 'Room A', RoomKey: 'room-a' });
    });

    it('returns [] when the query fails (tolerant)', async () => {
        runViewMock.mockResolvedValueOnce({ Success: false, Results: [] });
        expect(await LoadMeetingRooms(provider)).toEqual([]);
    });
});

describe('realtime-transcripts-data — LoadRoomTranscript (Main)', () => {
    const detailRow = { ID: 'd1', Role: 'AI', Message: 'hello', AgentID: 'A1', __mj_CreatedAt: '2026-06-20T00:00:00Z' };

    beforeEach(() => {
        runViewsMock.mockReset();
        runViewsMock.mockResolvedValue([
            { Success: true, Results: [detailRow] },
            { Success: true, Results: [] },
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads the Main rows in Sequence order', async () => {
        const lines = await LoadRoomTranscript(provider, 'conv-1', 'room-a');

        const [details] = runViewsMock.mock.calls[0][0];
        expect(details.EntityName).toBe('MJ: Conversation Details');
        expect(details.ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL");
        expect(details.OrderBy).toBe('Sequence ASC');
        expect(lines).toEqual([expect.objectContaining({ ID: 'd1', Kind: 'agent', Speaker: 'Sage', Message: 'hello' })]);
    });
});
