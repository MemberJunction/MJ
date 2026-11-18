import { describe, it, expect } from 'vitest';
import { NormalizeFinishReason } from '../generic/chat.types';

describe('NormalizeFinishReason (#4335)', () => {
    it.each([
        // Anthropic
        ['end_turn', 'stop'],
        ['stop_sequence', 'stop'],
        ['max_tokens', 'length'],
        ['refusal', 'content_filter'],
        ['tool_use', 'tool_calls'],
        // Gemini
        ['STOP', 'stop'],
        ['MAX_TOKENS', 'length'],
        ['SAFETY', 'content_filter'],
        ['RECITATION', 'content_filter'],
        ['PROHIBITED_CONTENT', 'content_filter'],
        // Bedrock / Titan / Mistral
        ['guardrail_intervened', 'content_filter'],
        ['FINISH', 'stop'],
        ['model_length', 'length'],
        // OpenAI pass-through
        ['stop', 'stop'],
        ['length', 'length'],
        ['content_filter', 'content_filter'],
        ['tool_calls', 'tool_calls'],
        // the old Anthropic constant
        ['completed', 'stop'],
    ])('%s -> %s', (raw, expected) => {
        expect(NormalizeFinishReason(raw)).toBe(expected);
    });

    it('passes an unknown value through unchanged, keeping its case', () => {
        expect(NormalizeFinishReason('references_json')).toBe('references_json');
        expect(NormalizeFinishReason('MALFORMED_FUNCTION_CALL')).toBe('MALFORMED_FUNCTION_CALL');
    });

    it('uses the fallback for an empty or missing value', () => {
        expect(NormalizeFinishReason(undefined)).toBe('stop');
        expect(NormalizeFinishReason(null)).toBe('stop');
        expect(NormalizeFinishReason('  ')).toBe('stop');
        expect(NormalizeFinishReason(undefined, 'length')).toBe('length');
    });
});
