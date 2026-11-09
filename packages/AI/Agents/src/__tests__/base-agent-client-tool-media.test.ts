/**
 * BaseAgent bookkeeping for a client tool result that carries an image: token estimates, string
 * conversion, compaction and context recovery work on a stub for the image, never on its base64.
 */
import { describe, it, expect } from 'vitest';
import type { ChatMessage, ChatMessageContent, ChatMessageContentBlock } from '@memberjunction/ai';
import type { AgentChatMessage } from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';
import { BuildClientToolResultMessage, IMAGE_BLOCK_TOKEN_ESTIMATE } from '../client-tool-results';

/** The compaction settings compactMessage takes. */
interface CompactSettings {
    compactMode: 'First N Chars' | 'AI Summary';
    compactLength: number;
    compactPromptId: string;
    originalLength: number;
}

/** The part of ExecuteAgentParams these paths read in 'First N Chars' mode. */
interface ConversationParams {
    conversationMessages: ChatMessage[];
    verbose?: boolean;
}

interface RecoveryResult {
    tokensSaved: number;
    strategyName: string;
}

/** The protected BaseAgent methods under test, reached through a narrowing type. */
type GuardInternals = {
    estimateTokens(content: ChatMessageContent): number;
    contentToString(content: ChatMessageContent): string;
    compactMessage(message: AgentChatMessage, settings: CompactSettings, params: ConversationParams): Promise<string>;
    recoveryStrategy_CompactAllToolResults(params: ConversationParams, tokensToSave: number): Promise<RecoveryResult>;
    recoveryStrategy_CompactOldToolResults(params: ConversationParams, tokensToSave: number, currentStepCount: number, minAge?: number): Promise<RecoveryResult>;
};

function guards(): GuardInternals {
    return new BaseAgent() as unknown as GuardInternals;
}

/** 200,000 characters of base64, about the size of a dashboard screenshot. */
const BASE64 = 'QUJD'.repeat(50_000);
/** A run of the base64 that must never show up in text, stubs or compacted content. */
const BASE64_SAMPLE = 'QUJDQUJDQUJD';

/** A client tool result message with one screenshot: `[image_url block, text block]`. */
function screenshotMessage(turnAdded: number): AgentChatMessage {
    return BuildClientToolResultMessage(
        [{ ToolName: 'GetDashboardScreenshot', Success: true, Result: { width: 1280, height: 800 }, Media: [{ MimeType: 'image/jpeg', Base64: BASE64 }] }],
        turnAdded,
        -1,
    );
}

/** The text of the message's text block. */
function textOf(message: AgentChatMessage): string {
    const blocks = message.content as ChatMessageContentBlock[];
    return blocks[1].content;
}

/** The message as contentToString and compaction see it: the stub, then the text. */
function stubbedTextOf(message: AgentChatMessage): string {
    return `[image omitted]\n${textOf(message)}`;
}

describe('BaseAgent bookkeeping for client tool images', () => {
    it('estimateTokens counts the image block as IMAGE_BLOCK_TOKEN_ESTIMATE, not by its base64 length', () => {
        const agent = guards();
        const message = screenshotMessage(1);
        expect((message.content as ChatMessageContentBlock[]).map(b => b.type)).toEqual(['image_url', 'text']);

        const tokens = agent.estimateTokens(message.content);
        expect(tokens).toBe(IMAGE_BLOCK_TOKEN_ESTIMATE + agent.estimateTokens(textOf(message)));
        const base64AsTextTokens = BASE64.length / 4;
        expect(tokens).toBeLessThan(base64AsTextTokens / 20);
    });

    it('contentToString gives the stub and the text', () => {
        const message = screenshotMessage(1);
        expect(guards().contentToString(message.content)).toBe(stubbedTextOf(message));
    });

    it('compactMessage in First N Chars mode cuts the stubbed text, never the base64', async () => {
        const message = screenshotMessage(1);
        const stubbed = stubbedTextOf(message);
        const compacted = await guards().compactMessage(
            message,
            { compactMode: 'First N Chars', compactLength: 40, compactPromptId: '', originalLength: stubbed.length },
            { conversationMessages: [message] },
        );
        expect(compacted.startsWith(stubbed.slice(0, 40))).toBe(true);
        expect(compacted).toContain(`showing first 40 of ${stubbed.length} characters`);
        expect(compacted).not.toContain(BASE64_SAMPLE);
    });

    it('recoveryStrategy_CompactAllToolResults leaves the stub and the text in place of the image message', async () => {
        const message = screenshotMessage(1);
        const params: ConversationParams = { conversationMessages: [{ role: 'user', content: 'Make the revenue chart wider' }, message] };
        const result = await guards().recoveryStrategy_CompactAllToolResults(params, 100_000);

        const compacted = params.conversationMessages[1] as AgentChatMessage;
        expect(result.tokensSaved).toBeGreaterThan(0);
        expect(compacted.content).toBe(stubbedTextOf(message));
        expect(compacted.metadata?.messageType).toBe('client-tool-result');
        expect(compacted.metadata?.wasCompacted).toBe(true);
        expect(JSON.stringify(compacted)).not.toContain(BASE64_SAMPLE);
    });

    it('recoveryStrategy_CompactOldToolResults does the same for an old image message', async () => {
        const message = screenshotMessage(1);
        const params: ConversationParams = { conversationMessages: [{ role: 'user', content: 'Make the revenue chart wider' }, message] };
        const result = await guards().recoveryStrategy_CompactOldToolResults(params, 100_000, 5, 3);

        const compacted = params.conversationMessages[1] as AgentChatMessage;
        expect(result.tokensSaved).toBeGreaterThan(0);
        expect(compacted.content).toBe(stubbedTextOf(message));
        expect(compacted.metadata?.originalLength).toBe(stubbedTextOf(message).length);
        expect(JSON.stringify(compacted)).not.toContain(BASE64_SAMPLE);
    });
});
