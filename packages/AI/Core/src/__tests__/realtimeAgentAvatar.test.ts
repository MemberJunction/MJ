import { describe, it, expect } from 'vitest';
import {
    AgentAvatarAttributes,
    AgentAvatarAudioOnlyAttributes,
    ReadAgentAvatarAttribute,
    REALTIME_AGENT_AVATAR_ATTRIBUTE,
} from '../generic/realtimeAgentAvatar';
import { REALTIME_AVATAR_UNAVAILABLE_REASONS } from '../generic/realtimeAvatarStatus';

describe('mj.agentAvatar', () => {
    it('is the attribute the room and the bot share', () => {
        expect(REALTIME_AGENT_AVATAR_ATTRIBUTE).toBe('mj.agentAvatar');
    });

    describe('AgentAvatarAttributes (the bot token at join)', () => {
        it('carries nothing when the session asked for no avatar', () => {
            expect(AgentAvatarAttributes(undefined)).toEqual({});
            expect(AgentAvatarAttributes(null)).toEqual({});
            expect(AgentAvatarAttributes({ Requested: false, Granted: false })).toEqual({});
        });

        it("says 'on' when the avatar was granted", () => {
            expect(AgentAvatarAttributes({ Requested: true, Granted: true })).toEqual({ 'mj.agentAvatar': 'on' });
        });

        it('says audio only, with the reason, when the request was refused', () => {
            expect(AgentAvatarAttributes({ Requested: true, Granted: false, Reason: 'decoder-missing' })).toEqual({ 'mj.agentAvatar': 'audio-only:decoder-missing' });
            expect(AgentAvatarAttributes({ Requested: true, Granted: false, Reason: 'endpoint' })).toEqual({ 'mj.agentAvatar': 'audio-only:endpoint' });
        });

        it("names 'bridged' when a refusal gives no reason", () => {
            expect(AgentAvatarAttributes({ Requested: true, Granted: false })).toEqual({ 'mj.agentAvatar': 'audio-only:bridged' });
        });
    });

    it('AgentAvatarAudioOnlyAttributes is the change a bot applies on a fallback', () => {
        expect(AgentAvatarAudioOnlyAttributes('decoder-failed')).toEqual({ 'mj.agentAvatar': 'audio-only:decoder-failed' });
    });

    describe('ReadAgentAvatarAttribute (the room)', () => {
        it("reads 'on'", () => {
            expect(ReadAgentAvatarAttribute({ 'mj.agentAvatar': 'on' })).toEqual({ State: 'on' });
        });

        it('reads every known reason back', () => {
            for (const reason of REALTIME_AVATAR_UNAVAILABLE_REASONS) {
                expect(ReadAgentAvatarAttribute(AgentAvatarAudioOnlyAttributes(reason))).toEqual({ State: 'audio-only', Reason: reason });
            }
        });

        it('reads an unknown reason as audio only, with no reason', () => {
            expect(ReadAgentAvatarAttribute({ 'mj.agentAvatar': 'audio-only:some-new-reason' })).toEqual({ State: 'audio-only' });
        });

        it('is null when absent, empty or anything else', () => {
            expect(ReadAgentAvatarAttribute(undefined)).toBeNull();
            expect(ReadAgentAvatarAttribute({})).toBeNull();
            expect(ReadAgentAvatarAttribute({ 'mj.agentAvatar': '' })).toBeNull();
            expect(ReadAgentAvatarAttribute({ 'mj.agentAvatar': 'true' })).toBeNull();
            expect(ReadAgentAvatarAttribute({ 'mj.agentAvatar': 'ON' })).toBeNull();
            expect(ReadAgentAvatarAttribute({ 'mj.agentWatches': 'on' })).toBeNull();
        });
    });
});
