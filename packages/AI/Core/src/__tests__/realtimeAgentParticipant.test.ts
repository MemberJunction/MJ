import { describe, it, expect } from 'vitest';
import { AgentParticipantIdentity, IsAgentParticipantIdentity } from '../generic/realtimeAgentParticipant';

describe('realtime agent participant identity', () => {
    describe('AgentParticipantIdentity (the coordinator, when a bot joins)', () => {
        it('is agent- followed by the agent session id, as given', () => {
            expect(AgentParticipantIdentity('sess-1')).toBe('agent-sess-1');
            expect(AgentParticipantIdentity('2B6F3C4D-1A2B-4C3D-8E9F-0123456789AB')).toBe('agent-2B6F3C4D-1A2B-4C3D-8E9F-0123456789AB');
        });

        it('reads back as an agent', () => {
            expect(IsAgentParticipantIdentity(AgentParticipantIdentity('2B6F3C4D-1A2B-4C3D-8E9F-0123456789AB'))).toBe(true);
            expect(IsAgentParticipantIdentity(AgentParticipantIdentity('sess-1'))).toBe(true);
        });
    });

    describe('IsAgentParticipantIdentity (the bridge, the engine and the bot)', () => {
        it('is true for an identity that starts with agent-, in any case', () => {
            for (const identity of ['agent-1234', 'Agent-XYZ', 'AGENT-7f3c', 'agent-']) {
                expect(IsAgentParticipantIdentity(identity)).toBe(true);
            }
        });

        it("is false for a person's identity, and for agent without the dash or not at the start", () => {
            for (const identity of ['user-1a2b', 'p-ada', 'ada', 'agent', 'agentsmith', 'agent_1', ' agent-1', 'my-agent-1', '']) {
                expect(IsAgentParticipantIdentity(identity)).toBe(false);
            }
        });

        it('is false when there is no identity', () => {
            expect(IsAgentParticipantIdentity(undefined)).toBe(false);
            expect(IsAgentParticipantIdentity(null)).toBe(false);
        });

        it('is false for a value that is not a string, from an untyped caller', () => {
            expect(IsAgentParticipantIdentity(1234 as unknown as string)).toBe(false);
        });
    });
});
