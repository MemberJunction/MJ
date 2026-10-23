/**
 * The system prompt and tools a replayed reasoning block is bound to.
 *
 * Anthropic on Claude 5.x accepts a replayed thinking block only while the system prompt, the tool
 * list and every earlier message are unchanged. The agent compares the messages; the runner, which
 * renders the system prompt and finalizes the tools, compares those two on the request as sent.
 */
import { describe, it, expect, vi } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import { ParallelExecutionCoordinator } from '../ParallelExecutionCoordinator';
import { GetSentPrefixFingerprint, RecordSentPrefixFingerprint, ReplayedReasoningPrefixFingerprint } from '../replayedReasoningPrefix';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { ChatParams, ChatResult, type ChatMessage } from '@memberjunction/ai';

interface GuardInternals {
    guardReplayedReasoningPrefix(chatParams: ChatParams, params: AIPromptParams, model: { Name: string }): string;
}

const thinkingTurn: ChatMessage = {
    role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'search', arguments: {} }],
    reasoning: [{ provider: 'anthropic', kind: 'thinking', text: 'Search first.', signature: 'sig-1' }]
};

function request(system: string, toolNames: string[]): ChatParams {
    const chatParams = new ChatParams();
    chatParams.messages = [{ role: 'system', content: system }, { role: 'user', content: 'Go' }, thinkingTurn];
    chatParams.tools = toolNames.map((name) => ({ name, description: `Call ${name}.`, inputSchema: { type: 'object', properties: {} } }));
    return chatParams;
}

describe('ReplayedReasoningPrefixFingerprint', () => {
    it('changes with the system prompt or the tools, and with nothing else', () => {
        const base = ReplayedReasoningPrefixFingerprint(request('You are Sage.', ['search']));
        expect(ReplayedReasoningPrefixFingerprint(request('You are Sage.', ['search']))).toBe(base);
        expect(ReplayedReasoningPrefixFingerprint(request('You are Sage.', ['search', 'skill_bundled_action']))).not.toBe(base);
        expect(ReplayedReasoningPrefixFingerprint(request('You are Sage. Skill: charts.', ['search']))).not.toBe(base);
    });
});

describe('AIPromptRunner — the replayed-reasoning prefix guard', () => {
    const runner = () => {
        const r = new AIPromptRunner();
        (r as unknown as { logStatus: () => void }).logStatus = vi.fn();
        return r as unknown as GuardInternals;
    };

    it('sends the request without replayed reasoning when the tools changed since the previous request (a skill activated)', () => {
        const before = ReplayedReasoningPrefixFingerprint(request('You are Sage.', ['search']));
        const params = new AIPromptParams();
        params.ReplayedReasoningPrefix = before;
        const chatParams = request('You are Sage.', ['search', 'skill_bundled_action']);

        const sent = runner().guardReplayedReasoningPrefix(chatParams, params, { Name: 'Claude Opus 5.5' });

        expect(chatParams.messages.some((m) => m.reasoning)).toBe(false);
        expect(chatParams.messages[2].toolCalls?.[0].id).toBe('c1');
        expect(sent).not.toBe(before);
    });

    it('keeps the reasoning when the system prompt and tools are unchanged', () => {
        const params = new AIPromptParams();
        params.ReplayedReasoningPrefix = ReplayedReasoningPrefixFingerprint(request('You are Sage.', ['search']));
        const chatParams = request('You are Sage.', ['search']);

        runner().guardReplayedReasoningPrefix(chatParams, params, { Name: 'M' });

        expect(chatParams.messages[2].reasoning?.[0]).toMatchObject({ signature: 'sig-1' });
    });

    it('does nothing for a caller that sent no previous fingerprint', () => {
        const chatParams = request('You are Sage.', ['search', 'other']);

        runner().guardReplayedReasoningPrefix(chatParams, new AIPromptParams(), { Name: 'M' });

        expect(chatParams.messages[2].reasoning).toHaveLength(1);
    });

    it('records the fingerprint on the result for the caller\'s next request', () => {
        const result = new ChatResult(true, new Date(), new Date());
        RecordSentPrefixFingerprint(result, 'abc');
        expect(GetSentPrefixFingerprint(result)).toBe('abc');
        expect(GetSentPrefixFingerprint(new ChatResult(true, new Date(), new Date()))).toBeUndefined();
    });
});

describe('ParallelExecutionCoordinator — a task whose attempt re-rendered its prompt', () => {
    it('records the re-rendered messages on the child prompt run', async () => {
        const coordinator = new ParallelExecutionCoordinator() as unknown as {
            updateChildPromptRun(run: Record<string, unknown>, result: ChatResult, end: Date, ms: number): Promise<void>;
        };
        const result = new ChatResult(true, new Date(), new Date());
        result.data = { choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop', index: 0 }], usage: undefined as never };
        (AIPromptRunner as unknown as { _rerenderedMessages: WeakMap<ChatResult, string> })._rerenderedMessages.set(result, 'stored: envelope text');
        const run: Record<string, unknown> = { Messages: 'stored: implicit text', Save: async () => true };

        await coordinator.updateChildPromptRun(run, result, new Date(), 5);

        expect(run.Messages).toBe('stored: envelope text');
    });
});
