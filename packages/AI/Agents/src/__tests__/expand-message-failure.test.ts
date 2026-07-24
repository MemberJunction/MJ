/**
 * Tests for BaseAgent.executeExpandMessageStep failure surfacing — regression coverage
 * for a live-discovered unbounded Retry loop: when the model requested expansion of a
 * message with no compacted original content (observed with the spliced cross-turn
 * conversation summary message, which has no expanded form), the expansion silently
 * no-op'd, the loop state stayed identical, and the model re-requested the same
 * expansion until the process exhausted its heap.
 *
 * The contract under test: executeExpandMessageStep returns a model-facing failure
 * reason (never a silent void) for every non-expandable case, and null on success.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';

interface ExpandRequest {
    step: 'Retry';
    terminate: boolean;
    messageIndex?: number;
    expandReason?: string;
}

interface TestMessage {
    role: string;
    content: string;
    metadata?: {
        canExpand?: boolean;
        originalContent?: string;
        wasCompacted?: boolean;
        isConversationSummary?: boolean;
    };
}

function callExpand(agent: BaseAgent, request: ExpandRequest, messages: TestMessage[]): string | null {
    const invoke = agent as unknown as {
        executeExpandMessageStep(
            req: ExpandRequest,
            params: { conversationMessages: TestMessage[]; verbose?: boolean },
            turn: number
        ): string | null;
    };
    return invoke.executeExpandMessageStep(request, { conversationMessages: messages }, 1);
}

describe('BaseAgent.executeExpandMessageStep failure surfacing', () => {
    it('returns an out-of-bounds reason for an index past the end of the conversation', () => {
        const agent = new BaseAgent();
        const reason = callExpand(agent, { step: 'Retry', terminate: false, messageIndex: 5 }, [
            { role: 'user', content: 'hello' }
        ]);
        expect(reason).toContain('out of bounds');
        expect(reason).toContain('do not request this expansion again');
    });

    it('returns a tool-redirecting reason when the target is the cross-turn conversation summary', () => {
        const agent = new BaseAgent();
        const reason = callExpand(agent, { step: 'Retry', terminate: false, messageIndex: 0 }, [
            {
                role: 'user',
                content: 'summary text',
                metadata: { isConversationSummary: true }
            }
        ]);
        expect(reason).toContain('cross-turn conversation summary');
        expect(reason).toContain('getMessageBySequence');
        expect(reason).toContain('do not request expansion of this message again');
    });

    it('returns a generic not-expandable reason for an ordinary message without original content', () => {
        const agent = new BaseAgent();
        const reason = callExpand(agent, { step: 'Retry', terminate: false, messageIndex: 0 }, [
            { role: 'assistant', content: 'plain reply' }
        ]);
        expect(reason).toContain('not expandable');
        expect(reason).toContain('do not request this expansion again');
    });

    it('returns null and restores original content for a genuinely expandable message', () => {
        const agent = new BaseAgent();
        const message: TestMessage = {
            role: 'assistant',
            content: '[compacted]',
            metadata: { canExpand: true, originalContent: 'the full original text', wasCompacted: true }
        };
        const reason = callExpand(agent, { step: 'Retry', terminate: false, messageIndex: 0 }, [message]);
        expect(reason).toBeNull();
        expect(message.content).toBe('the full original text');
        expect(message.metadata?.canExpand).toBe(false);
        expect(message.metadata?.originalContent).toBeUndefined();
    });
});
