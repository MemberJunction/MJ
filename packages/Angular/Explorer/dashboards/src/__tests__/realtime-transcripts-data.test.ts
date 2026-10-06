/**
 * Tests for the Voice Transcripts data layer
 * (`AI/components/analytics/realtime/realtime-transcripts-data.ts`):
 * - `attributeLine` — the diarization-attribution core: agent lines → agent name; heard lines → the
 *   diarized participant (human OR another agent, not lumped as "User"); undiarized → generic; errors.
 * - `LoadMeetingRooms` — queries `Type='Meeting Room'` newest-first and maps rows; tolerant of failure.
 * - `LoadRoomTranscript` — reads the room's current branch path with `ConversationEngine.ScopeFilter`
 *   in `Sequence` order; an unreadable scope gives an empty transcript.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (mirror realtime-session-data.test.ts) ──
const runViewMock = vi.fn();
const runViewsMock = vi.fn();
const { logErrorMock } = vi.hoisted(() => ({ logErrorMock: vi.fn() }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: logErrorMock,
        RunView: {
            FromMetadataProvider: () => ({ RunView: runViewMock, RunViews: runViewsMock }),
        },
    };
});
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: { Instance: { Agents: [{ ID: 'A1', Name: 'Sage' }] } },
}));

import type { IMetadataProvider } from '@memberjunction/core';
import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
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

describe('realtime-transcripts-data — LoadRoomTranscript (branch scope)', () => {
    const BRANCH: ConversationBranchRow = { ID: 'branch-2', ConversationID: 'conv-1', ParentBranchID: null, ForkFromSequence: 3, Name: null };
    const branchScope: ConversationScope = { ConversationID: 'conv-1', BranchID: 'branch-2', Branches: [BRANCH] };
    const detailRow = { ID: 'd1', Role: 'AI', Message: 'hello', AgentID: 'A1', __mj_CreatedAt: '2026-06-20T00:00:00Z' };

    beforeEach(() => {
        runViewsMock.mockReset();
        logErrorMock.mockReset();
        runViewsMock.mockResolvedValue([
            { Success: true, Results: [detailRow] },
            { Success: true, Results: [] },
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads the details on the current branch path in Sequence order', async () => {
        const loadScope = vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(branchScope);

        const lines = await LoadRoomTranscript(provider, 'conv-1', 'room-a');

        expect(loadScope).toHaveBeenCalledWith('conv-1', provider.CurrentUser, provider);
        const [details] = runViewsMock.mock.calls[0][0];
        expect(details.EntityName).toBe('MJ: Conversation Details');
        expect(details.ExtraFilter).toBe(ConversationEngine.ScopeFilter(branchScope));
        expect(details.ExtraFilter).toContain("[BranchID]='branch-2'");
        expect(details.OrderBy).toBe('Sequence ASC');
        expect(lines).toEqual([expect.objectContaining({ ID: 'd1', Kind: 'agent', Speaker: 'Sage', Message: 'hello' })]);
    });

    it('reads only trunk rows when the conversation is on the trunk', async () => {
        vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(ConversationEngine.TrunkScope('conv-1'));

        await LoadRoomTranscript(provider, 'conv-1', 'room-a');

        const [details] = runViewsMock.mock.calls[0][0];
        expect(details.ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL");
        expect(details.OrderBy).toBe('Sequence ASC');
    });

    it('returns an empty transcript and logs when the scope cannot be read', async () => {
        vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockRejectedValue(new Error('Conversation conv-1 not found'));

        const lines = await LoadRoomTranscript(provider, 'conv-1', 'room-a');

        expect(lines).toEqual([]);
        expect(runViewsMock).not.toHaveBeenCalled();
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('conv-1'));
    });

    it('returns an empty transcript and logs when the scope filter cannot be built', async () => {
        vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(branchScope);
        vi.spyOn(ConversationEngine, 'ScopeFilter').mockImplementationOnce(() => {
            throw new Error('Branch branch-2 chain is broken');
        });

        const lines = await LoadRoomTranscript(provider, 'conv-1', 'room-a');

        expect(lines).toEqual([]);
        expect(runViewsMock).not.toHaveBeenCalled();
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('chain is broken'));
    });
});
