import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentChatMessage, AgentChatMessageMetadata, BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

/**
 * Tests for the message expansion logic used in BaseAgent.executeExpandMessageStep().
 *
 * BaseAgent is extremely heavy to instantiate (many dependencies: Metadata, RunView,
 * AIEngine, ActionEngineServer, etc.), so we test the expansion logic in isolation
 * by reimplementing the same algorithm used in base-agent.ts lines ~8788-8826.
 *
 * This validates the core expansion contract without requiring full BaseAgent setup.
 */

// Mock dependencies
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

/**
 * Pure-function extraction of BaseAgent.executeExpandMessageStep logic.
 * This mirrors the implementation in base-agent.ts for testability.
 */
function executeExpandMessageStep(
    request: { messageIndex?: number; expandReason?: string },
    conversationMessages: AgentChatMessage[],
): { success: boolean; warning?: string } {
    const messageIndex = request.messageIndex;
    const reason = request.expandReason;

    if (messageIndex === undefined || messageIndex < 0 || messageIndex >= conversationMessages.length) {
        return { success: false, warning: `Cannot expand message: index ${messageIndex} out of bounds` };
    }

    const message = conversationMessages[messageIndex] as AgentChatMessage;

    if (!message.metadata?.canExpand || !message.metadata?.originalContent) {
        return { success: false, warning: `Cannot expand message at index ${messageIndex}: not expandable or no original content` };
    }

    // Restore original content
    message.content = message.metadata.originalContent;
    message.metadata.wasCompacted = false;
    message.metadata.canExpand = false;
    delete message.metadata.originalContent;

    return { success: true };
}

/**
 * Creates a compacted message that can be expanded.
 */
function createCompactedMessage(
    index: number,
    compactedContent: string,
    originalContent: string,
): AgentChatMessage {
    return {
        role: 'user',
        content: compactedContent,
        metadata: {
            wasCompacted: true,
            canExpand: true,
            originalContent,
            originalLength: originalContent.length,
            messageType: 'action-result',
        },
    };
}

/**
 * Creates a normal (non-compacted) message.
 */
function createNormalMessage(content: string): AgentChatMessage {
    return {
        role: 'assistant',
        content,
    };
}

describe('Message Expansion Logic', () => {
    let messages: AgentChatMessage[];

    beforeEach(() => {
        messages = [
            createNormalMessage('Hello, how can I help?'),
            createCompactedMessage(
                1,
                '[Compacted: SQL query results - 150 rows...]',
                'Full SQL output:\nRow 1: id=1, name=Alice\nRow 2: id=2, name=Bob\n... (150 rows of data)',
            ),
            createNormalMessage('Based on those results, I recommend...'),
            createCompactedMessage(
                3,
                '[Compacted: API response data...]',
                '{"status": "ok", "data": [{"id": 1}, {"id": 2}, {"id": 3}]}',
            ),
            createNormalMessage('Final summary here.'),
        ];
    });

    describe('Successful Expansion', () => {
        it('should restore original content from a compacted message', () => {
            const result = executeExpandMessageStep(
                { messageIndex: 1, expandReason: 'Need full SQL output' },
                messages,
            );

            expect(result.success).toBe(true);
            expect(messages[1].content).toBe(
                'Full SQL output:\nRow 1: id=1, name=Alice\nRow 2: id=2, name=Bob\n... (150 rows of data)',
            );
        });

        it('should set wasCompacted to false after expansion', () => {
            executeExpandMessageStep({ messageIndex: 1 }, messages);

            expect(messages[1].metadata!.wasCompacted).toBe(false);
        });

        it('should set canExpand to false after expansion (prevents re-expansion)', () => {
            executeExpandMessageStep({ messageIndex: 1 }, messages);

            expect(messages[1].metadata!.canExpand).toBe(false);
        });

        it('should delete originalContent after expansion (frees memory)', () => {
            executeExpandMessageStep({ messageIndex: 1 }, messages);

            expect(messages[1].metadata!.originalContent).toBeUndefined();
        });

        it('should not affect other messages when expanding one', () => {
            const originalMsg3Content = messages[3].content;
            const originalMsg3Metadata = { ...messages[3].metadata };

            executeExpandMessageStep({ messageIndex: 1 }, messages);

            // Message at index 3 should be unchanged
            expect(messages[3].content).toBe(originalMsg3Content);
            expect(messages[3].metadata!.canExpand).toBe(originalMsg3Metadata.canExpand);
            expect(messages[3].metadata!.wasCompacted).toBe(originalMsg3Metadata.wasCompacted);
        });

        it('should handle expansion of JSON content correctly', () => {
            executeExpandMessageStep({ messageIndex: 3 }, messages);

            expect(messages[3].content).toBe(
                '{"status": "ok", "data": [{"id": 1}, {"id": 2}, {"id": 3}]}',
            );
            expect(messages[3].metadata!.canExpand).toBe(false);
        });
    });

    describe('Out-of-Bounds messageIndex', () => {
        it('should fail gracefully for negative index', () => {
            const result = executeExpandMessageStep(
                { messageIndex: -1, expandReason: 'test' },
                messages,
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('out of bounds');
        });

        it('should fail gracefully for index beyond array length', () => {
            const result = executeExpandMessageStep(
                { messageIndex: 100, expandReason: 'test' },
                messages,
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('out of bounds');
        });

        it('should fail gracefully for undefined messageIndex', () => {
            const result = executeExpandMessageStep(
                { expandReason: 'test' },
                messages,
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('out of bounds');
        });

        it('should fail gracefully for index equal to array length (off-by-one)', () => {
            const result = executeExpandMessageStep(
                { messageIndex: messages.length, expandReason: 'test' },
                messages,
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('out of bounds');
        });
    });

    describe('Non-Expandable Messages', () => {
        it('should fail gracefully for a normal message (no metadata)', () => {
            const result = executeExpandMessageStep(
                { messageIndex: 0 },
                messages,
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('not expandable');
        });

        it('should fail gracefully when canExpand is false', () => {
            messages[1].metadata!.canExpand = false;

            const result = executeExpandMessageStep(
                { messageIndex: 1 },
                messages,
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('not expandable');
        });

        it('should fail gracefully when originalContent is missing', () => {
            delete messages[1].metadata!.originalContent;

            const result = executeExpandMessageStep(
                { messageIndex: 1 },
                messages,
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('no original content');
        });

        it('should fail gracefully when metadata exists but canExpand is undefined', () => {
            messages[1].metadata = {
                wasCompacted: true,
                originalContent: 'some content',
                // canExpand intentionally omitted
            };

            const result = executeExpandMessageStep(
                { messageIndex: 1 },
                messages,
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('not expandable');
        });
    });

    describe('Empty Conversation', () => {
        it('should fail gracefully with empty message array', () => {
            const result = executeExpandMessageStep(
                { messageIndex: 0 },
                [],
            );

            expect(result.success).toBe(false);
            expect(result.warning).toContain('out of bounds');
        });
    });

    describe('Double Expansion Prevention', () => {
        it('should not allow expanding the same message twice', () => {
            // First expansion succeeds
            const firstResult = executeExpandMessageStep({ messageIndex: 1 }, messages);
            expect(firstResult.success).toBe(true);

            // Second expansion fails because canExpand was set to false
            const secondResult = executeExpandMessageStep({ messageIndex: 1 }, messages);
            expect(secondResult.success).toBe(false);
            expect(secondResult.warning).toContain('not expandable');
        });
    });
});
