/**
 * Compaction meets Gemini replay.
 *
 * Gemini signs each functionCall over the arguments it produced, and signs the turn's text and
 * thoughts too. When the agent loop shortens an older call's large arguments, the turn it replays
 * no longer matches any of those signatures: the call must go back under the placeholder Gemini
 * documents as always valid, and the turn's reasoning must not go back at all. A call turn the
 * loop left whole keeps its real signatures. The Gemini driver runs for real here, with only its
 * chat seam mocked, so the turn being compacted is exactly the one the driver produced.
 */
import { describe, it, expect } from 'vitest';
import { ChatMessageRole, ChatParams, type ChatMessage } from '@memberjunction/ai';
import { GeminiLLM } from '@memberjunction/ai-gemini';
import { CompactAnsweredToolCallArguments } from '@memberjunction/ai-agents';
import type { AgentChatMessage } from '@memberjunction/ai-core-plus';

/** The slice of a Gemini part this test writes. */
interface Part { text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { id: string; name: string; args: Record<string, unknown> } }

const MODEL = 'gemini-3.5-flash';
const ORIGIN = `gemini-api:${MODEL}`;
const PLACEHOLDER = 'skip_thought_signature_validator';
const DOCUMENT = 'x'.repeat(5000);

/** A Gemini turn that wrote a large document: a thought, signed narration, a signed call. */
const writeTurn = (id: string): Part[] => [
    { text: 'Write the whole report.', thought: true, thoughtSignature: `thought-${id}` },
    { text: 'Writing the report.', thoughtSignature: `text-${id}` },
    { functionCall: { id, name: 'write_file', args: { content: DOCUMENT } }, thoughtSignature: `call-${id}` }
];

/** The driver's own reading of a recorded turn — the message the agent loop replays. */
async function recordedMessage(parts: Part[]): Promise<AgentChatMessage> {
    const llm = new GeminiLLM('test-key');
    const seam = {
        chats: {
            create: () => ({
                sendMessage: async () => ({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], usageMetadata: {} }),
                sendMessageStream: async () => ({})
            })
        }
    };
    (llm as unknown as { _gemini: typeof seam })._gemini = seam;
    const params = new ChatParams();
    params.model = MODEL;
    params.messages = [{ role: ChatMessageRole.user, content: 'Write the report.' }];
    params.tools = [{ name: 'write_file', inputSchema: { type: 'object', properties: { content: { type: 'string' } } } }];
    const message = (await llm.ChatCompletion(params)).data.choices[0].message;
    return { role: 'assistant', content: message.content, toolCalls: message.toolCalls, reasoning: message.reasoning } as AgentChatMessage;
}

const answer = (id: string): AgentChatMessage =>
    ({ role: 'tool', content: [{ type: 'tool_result', toolCallId: id, toolName: 'write_file', content: 'Written.' }] } as AgentChatMessage);

describe('a compacted Gemini call turn, replayed', () => {
    it('goes back under the placeholder signature, with no reasoning; the turn left whole keeps its signatures', async () => {
        const messages: AgentChatMessage[] = [
            { role: 'user', content: 'Write the report.' } as AgentChatMessage,
            await recordedMessage(writeTurn('fc_old')), answer('fc_old'),
            await recordedMessage(writeTurn('fc_new')), answer('fc_new')
        ];

        const compacted = CompactAnsweredToolCallArguments(messages, { MinChars: 1000, KeepRecentCallTurns: 1 });
        expect(compacted).toBe(1);

        const old = GeminiLLM.MapMJMessageToGeminiHistoryEntry(messages[1] as ChatMessage, ORIGIN);
        expect(old.parts?.some((p) => p.thought)).toBe(false);
        expect(old.parts?.some((p) => p.thoughtSignature === 'text-fc_old')).toBe(false);
        const oldCall = old.parts?.find((p) => p.functionCall);
        expect(oldCall?.thoughtSignature).toBe(PLACEHOLDER);
        expect(String(oldCall?.functionCall?.args?.content)).toMatch(/^\[content omitted: 5,000 characters/);

        const recent = GeminiLLM.MapMJMessageToGeminiHistoryEntry(messages[3] as ChatMessage, ORIGIN);
        expect(recent.parts?.map((p) => p.thoughtSignature)).toEqual(['thought-fc_new', 'text-fc_new', 'call-fc_new']);
        expect(recent.parts?.find((p) => p.functionCall)?.functionCall?.args?.content).toBe(DOCUMENT);
    });
});
