/**
 * Tests for ConversationMessageResolver — resolve() and isConversationReference().
 *
 * Tests are written against the JSDoc CONTRACT to catch divergence from documented behavior.
 * Also probes edge cases informed by the "type confusion" bug pattern (git history)
 * where string parsing had ambiguous format handling.
 */
import { describe, it, expect } from 'vitest';
import { ConversationMessageResolver } from '../utils/ConversationMessageResolver';
import { ChatMessage } from '@memberjunction/ai';

const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello there' },
    { role: 'assistant', content: 'Hi! How can I help?' },
    { role: 'user', content: 'What is 2+2?' },
    { role: 'assistant', content: 'The answer is 4.' },
    { role: 'user', content: 'Thanks!' },
];

describe('ConversationMessageResolver', () => {
    // ════════════════════════════════════════════════════════════════════
    // isConversationReference
    // ════════════════════════════════════════════════════════════════════

    describe('isConversationReference', () => {
        it('should return true for "conversation.user.last"', () => {
            expect(ConversationMessageResolver.isConversationReference('conversation.user.last')).toBe(true);
        });

        it('should return true for "conversation.all"', () => {
            expect(ConversationMessageResolver.isConversationReference('conversation.all')).toBe(true);
        });

        it('should be case-insensitive', () => {
            expect(ConversationMessageResolver.isConversationReference('Conversation.User.Last')).toBe(true);
            expect(ConversationMessageResolver.isConversationReference('CONVERSATION.ALL')).toBe(true);
        });

        it('should handle leading/trailing whitespace', () => {
            expect(ConversationMessageResolver.isConversationReference('  conversation.user.last  ')).toBe(true);
        });

        it('should return false for non-conversation references', () => {
            expect(ConversationMessageResolver.isConversationReference('payload.data')).toBe(false);
            expect(ConversationMessageResolver.isConversationReference('convo.user.last')).toBe(false);
            expect(ConversationMessageResolver.isConversationReference('')).toBe(false);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // resolve — Role filtering
    // ════════════════════════════════════════════════════════════════════

    describe('resolve — role filtering', () => {
        it('conversation.all should return all messages', () => {
            const result = ConversationMessageResolver.resolve('conversation.all', messages);
            expect(result).toEqual(messages);
        });

        it('conversation.user should return all user messages', () => {
            const result = ConversationMessageResolver.resolve('conversation.user', messages) as ChatMessage[];
            expect(result).toHaveLength(3);
            expect(result.every(m => m.role === 'user')).toBe(true);
        });

        it('conversation.assistant should return all assistant messages', () => {
            const result = ConversationMessageResolver.resolve('conversation.assistant', messages) as ChatMessage[];
            expect(result).toHaveLength(2);
            expect(result.every(m => m.role === 'assistant')).toBe(true);
        });

        it('conversation.ai should be alias for assistant', () => {
            const aiResult = ConversationMessageResolver.resolve('conversation.ai', messages) as ChatMessage[];
            const assistantResult = ConversationMessageResolver.resolve('conversation.assistant', messages) as ChatMessage[];
            expect(aiResult).toEqual(assistantResult);
        });

        it('conversation.system should return system messages', () => {
            const result = ConversationMessageResolver.resolve('conversation.system', messages) as ChatMessage[];
            expect(result).toHaveLength(1);
            expect(result[0].content).toBe('You are a helpful assistant.');
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // resolve — Position selection
    // ════════════════════════════════════════════════════════════════════

    describe('resolve — position selection', () => {
        it('conversation.user.last should return the last user message (single object)', () => {
            const result = ConversationMessageResolver.resolve('conversation.user.last', messages) as ChatMessage;
            expect(result.content).toBe('Thanks!');
            // Should be single object, not array
            expect(Array.isArray(result)).toBe(false);
        });

        it('conversation.user.first should return the first user message (single object)', () => {
            const result = ConversationMessageResolver.resolve('conversation.user.first', messages) as ChatMessage;
            expect(result.content).toBe('Hello there');
            expect(Array.isArray(result)).toBe(false);
        });

        it('conversation.all.last[2] should return the last 2 messages (array)', () => {
            const result = ConversationMessageResolver.resolve('conversation.all.last[2]', messages) as ChatMessage[];
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
            expect(result[0].content).toBe('The answer is 4.');
            expect(result[1].content).toBe('Thanks!');
        });

        it('conversation.user.last[2] should return last 2 user messages', () => {
            const result = ConversationMessageResolver.resolve('conversation.user.last[2]', messages) as ChatMessage[];
            expect(result).toHaveLength(2);
            expect(result[0].content).toBe('What is 2+2?');
            expect(result[1].content).toBe('Thanks!');
        });

        it('conversation.all.first[3] should return first 3 messages', () => {
            const result = ConversationMessageResolver.resolve('conversation.all.first[3]', messages) as ChatMessage[];
            expect(result).toHaveLength(3);
            expect(result[0].role).toBe('system');
            expect(result[2].role).toBe('assistant');
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // resolve — Property extraction
    // ════════════════════════════════════════════════════════════════════

    describe('resolve — property extraction', () => {
        it('conversation.user.last.content should extract content string', () => {
            const result = ConversationMessageResolver.resolve('conversation.user.last.content', messages);
            expect(result).toBe('Thanks!');
        });

        it('conversation.user.last.role should extract role', () => {
            const result = ConversationMessageResolver.resolve('conversation.user.last.role', messages);
            expect(result).toBe('user');
        });

        it('conversation.user.last[2].content should map content over array', () => {
            const result = ConversationMessageResolver.resolve('conversation.user.last[2].content', messages);
            expect(result).toEqual(['What is 2+2?', 'Thanks!']);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // resolve — Edge cases
    // ════════════════════════════════════════════════════════════════════

    describe('resolve — edge cases', () => {
        it('should return undefined for non-conversation path', () => {
            const result = ConversationMessageResolver.resolve('payload.data', messages);
            expect(result).toBeUndefined();
        });

        it('should return undefined when only "conversation" with no role', () => {
            const result = ConversationMessageResolver.resolve('conversation', messages);
            expect(result).toBeUndefined();
        });

        it('should handle empty conversation array', () => {
            const result = ConversationMessageResolver.resolve('conversation.user.last', []);
            expect(result).toBeUndefined();
        });

        it('should handle role with no matching messages', () => {
            const noSystem: ChatMessage[] = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' },
            ];
            const result = ConversationMessageResolver.resolve('conversation.system', noSystem) as ChatMessage[];
            expect(result).toHaveLength(0);
        });

        it('should handle count larger than available messages (no error, returns what exists)', () => {
            // Documented: no bounds checking on count, returns all available
            const result = ConversationMessageResolver.resolve('conversation.user.last[1000]', messages) as ChatMessage[];
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(3); // Only 3 user messages exist
        });

        it('should handle property extraction on non-existent property', () => {
            const result = ConversationMessageResolver.resolve('conversation.user.last.nonExistent', messages);
            expect(result).toBeUndefined();
        });

        it('should handle "conversation.all.length" as property on the array', () => {
            // When position spec doesn't match first/last, it's treated as property
            const result = ConversationMessageResolver.resolve('conversation.all.length', messages);
            expect(result).toBe(6);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // resolve — Contract invariants
    // ════════════════════════════════════════════════════════════════════

    describe('resolve — invariants', () => {
        it('count=1 returns single object; count>1 returns array', () => {
            const single = ConversationMessageResolver.resolve('conversation.user.last', messages);
            const multi = ConversationMessageResolver.resolve('conversation.user.last[2]', messages);

            expect(Array.isArray(single)).toBe(false);
            expect(Array.isArray(multi)).toBe(true);
        });

        it('first[1] and last[1] should return the same type (single object, not array)', () => {
            const first = ConversationMessageResolver.resolve('conversation.user.first', messages);
            const last = ConversationMessageResolver.resolve('conversation.user.last', messages);

            // Both should be single ChatMessage objects
            expect(Array.isArray(first)).toBe(false);
            expect(Array.isArray(last)).toBe(false);
            expect((first as ChatMessage).role).toBe('user');
            expect((last as ChatMessage).role).toBe('user');
        });
    });
});
