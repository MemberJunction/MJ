/**
 * A tool call whose arguments were compacted replays without its original signature.
 *
 * Gemini signs each `functionCall` part over the arguments it produced. The agent loop drops that
 * signature when it shortens a call's arguments, and the driver must then send the documented
 * placeholder, which Gemini never rejects — never the original signature over different arguments.
 */
import { describe, it, expect } from 'vitest';
import { ChatMessageRole } from '@memberjunction/ai';
import { GeminiLLM } from '../index';

describe('Gemini replay of a compacted tool call', () => {
    it('sends the placeholder signature for a call that carries none', () => {
        const entry = GeminiLLM.MapMJMessageToGeminiHistoryEntry({
            role: ChatMessageRole.assistant,
            content: '',
            toolCalls: [{ id: 'fc_1', name: 'write_file', arguments: { content: '[content omitted: 5,000 characters sent to write_file]' } }]
        }, 'gemini-api:gemini-3.5-flash');

        expect(entry.parts?.[0].thoughtSignature).toBe('skip_thought_signature_validator');
        expect(entry.parts?.[0].functionCall?.args).toEqual({ content: '[content omitted: 5,000 characters sent to write_file]' });
    });
});
