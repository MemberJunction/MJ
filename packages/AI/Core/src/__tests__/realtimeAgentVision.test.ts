import { describe, it, expect } from 'vitest';
import {
    AgentVisionAttributes,
    AgentWatchesAttributes,
    AllowsAgentVision,
    IsAgentWatching,
    REALTIME_AGENT_CAN_SEE_ATTRIBUTE,
    REALTIME_AGENT_WATCHES_ATTRIBUTE,
} from '../generic/realtimeAgentVision';

describe('realtime agent vision attributes', () => {
    it('keeps the names the room, the server and the bot agree on', () => {
        expect(REALTIME_AGENT_CAN_SEE_ATTRIBUTE).toBe('mj.agentCanSee');
        expect(REALTIME_AGENT_WATCHES_ATTRIBUTE).toBe('mj.agentWatches');
    });

    describe('AllowsAgentVision', () => {
        it("is true only for the value 'true'", () => {
            expect(AllowsAgentVision({ [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'true' })).toBe(true);
        });

        it('is false when the attribute is missing, empty or anything else', () => {
            for (const value of ['', 'false', 'TRUE', 'yes', '1']) {
                expect(AllowsAgentVision({ [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: value })).toBe(false);
            }
            expect(AllowsAgentVision({})).toBe(false);
            expect(AllowsAgentVision(undefined)).toBe(false);
            expect(AllowsAgentVision(null)).toBe(false);
        });

        it("ignores the bot's attribute", () => {
            expect(AllowsAgentVision({ [REALTIME_AGENT_WATCHES_ATTRIBUTE]: 'true' })).toBe(false);
        });
    });

    describe('IsAgentWatching', () => {
        it("is true only for the value 'true'", () => {
            expect(IsAgentWatching({ [REALTIME_AGENT_WATCHES_ATTRIBUTE]: 'true' })).toBe(true);
        });

        it('is false when the attribute is missing, empty or anything else', () => {
            for (const value of ['', 'false', 'TRUE', 'yes', '1']) {
                expect(IsAgentWatching({ [REALTIME_AGENT_WATCHES_ATTRIBUTE]: value })).toBe(false);
            }
            expect(IsAgentWatching({})).toBe(false);
            expect(IsAgentWatching(undefined)).toBe(false);
            expect(IsAgentWatching(null)).toBe(false);
        });

        it("ignores a person's consent attribute", () => {
            expect(IsAgentWatching({ [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'true' })).toBe(false);
        });
    });

    describe('AgentVisionAttributes', () => {
        it("sets 'true' to allow, and '' to withdraw so LiveKit removes the attribute", () => {
            expect(AgentVisionAttributes(true)).toEqual({ [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'true' });
            expect(AgentVisionAttributes(false)).toEqual({ [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: '' });
        });

        it('reads back as the choice it records', () => {
            expect(AllowsAgentVision(AgentVisionAttributes(true))).toBe(true);
            expect(AllowsAgentVision(AgentVisionAttributes(false))).toBe(false);
        });
    });

    describe('AgentWatchesAttributes', () => {
        it("sets 'true' while the bot watches, and '' (never 'false') to withdraw", () => {
            expect(AgentWatchesAttributes(true)).toEqual({ [REALTIME_AGENT_WATCHES_ATTRIBUTE]: 'true' });
            expect(AgentWatchesAttributes(false)).toEqual({ [REALTIME_AGENT_WATCHES_ATTRIBUTE]: '' });
        });

        it('reads back as watching, and never as a person allowing it', () => {
            expect(IsAgentWatching(AgentWatchesAttributes(true))).toBe(true);
            expect(IsAgentWatching(AgentWatchesAttributes(false))).toBe(false);
            expect(AllowsAgentVision(AgentWatchesAttributes(true))).toBe(false);
        });
    });
});
