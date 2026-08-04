import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the core module so the sink's `new RunView()` + loggers are controllable. RunView is the only
// runtime value the sink pulls from core (UserInfo/IMetadataProvider are type-only).
const { runViewMock } = vi.hoisted(() => ({ runViewMock: vi.fn() }));
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    UserInfo: class {},
    RunView: class {
        RunView = runViewMock;
    },
}));

import { CreateBridgeRoomTranscriptSink, type BridgeTranscriptLineInput } from '../realtime/bridge-room-transcript-sink';

/** A minimal fake BaseEntity that records assigned fields as own properties + a settable id. */
function makeFakeEntity(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { ID: id, NewRecord: vi.fn(), Save: vi.fn(async () => true), LatestResult: { CompleteMessage: '' } } as any;
}

/** Provider that returns the same Conversation entity but a FRESH detail per GetEntityObject (no cross-test bleed). */
function makeProvider(conv: ReturnType<typeof makeFakeEntity>) {
    const details: ReturnType<typeof makeFakeEntity>[] = [];
    const provider = {
        GetEntityObject: vi.fn(async (name: string) => {
            if (name === 'MJ: Conversations') {
                return conv;
            }
            const d = makeFakeEntity(`detail-${details.length}`);
            details.push(d);
            return d;
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    return { provider, details };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const user = { ID: 'user-1' } as any;

describe('CreateBridgeRoomTranscriptSink', () => {
    beforeEach(() => {
        runViewMock.mockReset();
    });

    it('creates the room Conversation (Type/scope/ExternalID) and writes an attributed AI detail for agent speech', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] }); // no existing room conversation
        const conv = makeFakeEntity('conv-1');
        const { provider, details } = makeProvider(conv);
        const sink = CreateBridgeRoomTranscriptSink({ ConversationType: 'Meeting Room' });

        const line: BridgeTranscriptLineInput = {
            RoomKey: 'room-X', AgentSessionID: 's1', AgentID: 'a1', IsAgentSpeech: true, SpeakerParticipantID: 'agent-s1', Text: 'hello',
        };
        await sink(line, user, provider);

        expect(conv.NewRecord).toHaveBeenCalledOnce();
        expect(conv.Type).toBe('Meeting Room');
        expect(conv.ApplicationScope).toBe('Application'); // default scope hides it from the main list
        expect(conv.ExternalID).toBe('room-X');
        expect(conv.UserID).toBe('user-1');

        expect(details).toHaveLength(1);
        expect(details[0].ConversationID).toBe('conv-1');
        expect(details[0].Role).toBe('AI');
        expect(details[0].Message).toBe('hello');
        expect(details[0].AgentSessionID).toBe('s1');
        expect(details[0].AgentID).toBe('a1');
        expect(details[0].ExternalID).toBe('agent-s1');
    });

    it('writes heard speech as a User detail with no agent attribution', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const conv = makeFakeEntity('conv-2');
        const { provider, details } = makeProvider(conv);
        const sink = CreateBridgeRoomTranscriptSink({ ConversationType: 'Meeting Room' });

        await sink({ RoomKey: 'room-Y', AgentSessionID: 's1', IsAgentSpeech: false, Text: 'a human spoke' }, user, provider);

        expect(details[0].Role).toBe('User');
        expect(details[0].Message).toBe('a human spoke');
        expect(details[0].AgentSessionID).toBeUndefined();
        expect(details[0].AgentID).toBeUndefined();
    });

    it('reuses an existing room Conversation instead of creating a new one', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [{ ID: 'existing-conv' }] });
        const conv = makeFakeEntity('should-not-create');
        const { provider, details } = makeProvider(conv);
        const sink = CreateBridgeRoomTranscriptSink({ ConversationType: 'Meeting Room' });

        await sink({ RoomKey: 'room-Z', AgentSessionID: 's1', IsAgentSpeech: true, Text: 'x' }, user, provider);

        expect(conv.NewRecord).not.toHaveBeenCalled();
        expect(details[0].ConversationID).toBe('existing-conv');
    });

    it('caches the room→conversation resolution (a second line for the same room does not re-query)', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const conv = makeFakeEntity('conv-cache');
        const { provider } = makeProvider(conv);
        const sink = CreateBridgeRoomTranscriptSink({ ConversationType: 'Meeting Room' });

        await sink({ RoomKey: 'same-room', AgentSessionID: 's1', IsAgentSpeech: true, Text: 'one' }, user, provider);
        await sink({ RoomKey: 'same-room', AgentSessionID: 's1', IsAgentSpeech: true, Text: 'two' }, user, provider);

        // Only the FIRST line resolved the conversation (RunView once); the second hit the cache.
        expect(runViewMock).toHaveBeenCalledTimes(1);
        expect(conv.NewRecord).toHaveBeenCalledOnce();
    });

    it('no-ops without a user or provider (nothing to write under)', async () => {
        const sink = CreateBridgeRoomTranscriptSink({ ConversationType: 'Meeting Room' });
        await sink({ RoomKey: 'r', AgentSessionID: 's', IsAgentSpeech: true, Text: 't' }, undefined, undefined);
        expect(runViewMock).not.toHaveBeenCalled();
    });
});
