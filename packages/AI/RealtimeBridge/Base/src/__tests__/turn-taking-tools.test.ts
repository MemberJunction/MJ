import { describe, it, expect } from 'vitest';
import {
    TURN_TAKING_TOOL_DEFINITIONS,
    TURN_TOOL_I_AM_ADDRESSED,
    TURN_TOOL_YIELD_TURN,
    MODEL_SIDE_TURN_TAKING_FRAMING,
    IsTurnTakingTool,
    ParseTurnTakingToolCall,
} from '../turn-taking-tools';

describe('turn-taking tool definitions', () => {
    it('declares exactly the two tools, each with an object parameter schema', () => {
        expect(TURN_TAKING_TOOL_DEFINITIONS.map(t => t.Name)).toEqual([TURN_TOOL_I_AM_ADDRESSED, TURN_TOOL_YIELD_TURN]);
        for (const tool of TURN_TAKING_TOOL_DEFINITIONS) {
            expect(tool.ParametersSchema['type']).toBe('object');
            expect(tool.Description.length).toBeGreaterThan(20);
        }
    });

    it('frames the model on both tools by name', () => {
        expect(MODEL_SIDE_TURN_TAKING_FRAMING).toContain(TURN_TOOL_I_AM_ADDRESSED);
        expect(MODEL_SIDE_TURN_TAKING_FRAMING).toContain(TURN_TOOL_YIELD_TURN);
    });
});

describe('IsTurnTakingTool', () => {
    it('owns its two tools and nothing else', () => {
        expect(IsTurnTakingTool('i_am_addressed')).toBe(true);
        expect(IsTurnTakingTool('yield_turn')).toBe(true);
        expect(IsTurnTakingTool('transfer_call')).toBe(false);
    });
});

describe('ParseTurnTakingToolCall', () => {
    it('returns null for a tool that is not ours', () => {
        expect(ParseTurnTakingToolCall('send_dtmf', '{}')).toBeNull();
    });

    it('parses i_am_addressed regardless of arguments', () => {
        expect(ParseTurnTakingToolCall('i_am_addressed', '')).toEqual({ Kind: 'Addressed' });
        expect(ParseTurnTakingToolCall('i_am_addressed', 'not json')).toEqual({ Kind: 'Addressed' });
    });

    it('parses a yield with and without a target', () => {
        expect(ParseTurnTakingToolCall('yield_turn', '')).toEqual({ Kind: 'Yield' });
        expect(ParseTurnTakingToolCall('yield_turn', '{}')).toEqual({ Kind: 'Yield' });
        expect(ParseTurnTakingToolCall('yield_turn', '{"to":"  Demo Loop "}')).toEqual({ Kind: 'Yield', To: 'Demo Loop' });
    });

    it('degrades a malformed target to a plain yield rather than failing', () => {
        expect(ParseTurnTakingToolCall('yield_turn', '{"to": 7}')).toEqual({ Kind: 'Yield' });
        expect(ParseTurnTakingToolCall('yield_turn', '{"to": "   "}')).toEqual({ Kind: 'Yield' });
        expect(ParseTurnTakingToolCall('yield_turn', 'null')).toEqual({ Kind: 'Yield' });
    });

    it('reports unreadable JSON for a yield', () => {
        expect(ParseTurnTakingToolCall('yield_turn', '{oops')?.Kind).toBe('Invalid');
    });
});
