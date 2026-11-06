import { describe, it, expect, vi } from 'vitest';
import type { ChatMessage } from '@memberjunction/ai';
import type { AgentFinishIf } from '@memberjunction/ai-core-plus';
import {
    AuthorFinishIf,
    BuildAuthorMessages,
    ExtractFinishIfGuidance,
    FINISH_IF_AUTHOR_MAX_RETRIES,
    ParseAuthoredCache,
    ParseAuthoredFinishIf,
    SerializeAuthoredLine,
    type AuthorChat,
    type AuthorChatReply
} from '../../finishif-replay/author';
import { ExtractRounds } from '../../finishif-replay/rounds';
import { ActionStep, AsksForActions, Guid, PromptStep, SENTINEL, Succeeds } from './fixtures';

const RUN = Guid(9, 1);

/** A round whose results and label turn carry text the author must never see. */
function roundWithResults(): ReturnType<typeof ExtractRounds>['Rounds'][number] {
    const action = ActionStep(RUN, 2, { Message: 'RESULT-ONLY-MESSAGE', ExtraParams: [{ Name: 'Body', Type: 'Output', Value: 'RESULT-ONLY-VALUE' }] });
    const label = { ...Succeeds(), message: 'LABEL-ONLY-MESSAGE' };
    return ExtractRounds([PromptStep(RUN, 1, AsksForActions()), action, PromptStep(RUN, 3, label)]).Rounds[0];
}

const TEMPLATE = [
    '# Something else',
    '{% if __agentTypePromptParams.includeDecisionsDocs != false %}',
    'Decisions docs.',
    '{% endif %}',
    '{% if __agentTypePromptParams.includeFinishIfDocs != false %}',
    '## Finishing after an action or sub-agent',
    'Add `finishIf` when the step should complete the task.',
    '{% if subAgentCount > 0 %}Sub-agents too.{% endif %}',
    'Ask about what the results show.',
    '{% endif %}',
    '# Agent Definition',
    '```ts',
    'interface AgentFinishIf {',
    '    questions: string[];  // One to three yes/no questions.',
    '    message: string;  // The final reply.',
    '}',
    '```'
].join('\n');

function messageText(messages: readonly ChatMessage[]): string {
    return messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
}

/** A chat that replies with each text in turn; `null` is a failed call. */
function scriptedChat(...replies: Array<string | null>): AuthorChat & { Calls: ChatMessage[][] } {
    const calls: ChatMessage[][] = [];
    return {
        Calls: calls,
        Complete: vi.fn(async (messages: ChatMessage[]): Promise<AuthorChatReply> => {
            calls.push([...messages]);
            const reply = replies[calls.length - 1] ?? null;
            return reply === null ? { Success: false, Text: '', Error: 'provider down' } : { Success: true, Text: reply, Error: null };
        })
    };
}

const VALID_FINISH_IF: AgentFinishIf = { questions: ['The results show the record was created.'], message: 'Done.' };
const VALID = JSON.stringify(VALID_FINISH_IF);

describe('ExtractFinishIfGuidance', () => {
    it('takes the includeFinishIfDocs block verbatim, nested tags and all, and the AgentFinishIf interface', () => {
        const guidance = ExtractFinishIfGuidance(TEMPLATE);
        expect(guidance).toContain('## Finishing after an action or sub-agent');
        expect(guidance).toContain('{% if subAgentCount > 0 %}Sub-agents too.{% endif %}');
        expect(guidance).toContain('Ask about what the results show.');
        expect(guidance).toContain('interface AgentFinishIf {');
        expect(guidance).not.toContain('Decisions docs.');
        expect(guidance).not.toContain('# Agent Definition');
    });

    it('refuses a template without the block, or with the block unclosed', () => {
        expect(() => ExtractFinishIfGuidance('# no guidance here')).toThrow(/includeFinishIfDocs/);
        expect(() => ExtractFinishIfGuidance('{% if __agentTypePromptParams.includeFinishIfDocs != false %}\nopen')).toThrow(/not closed/);
    });
});

describe('BuildAuthorMessages', () => {
    it("shows the pre-action reasoning, the requested actions and the guidance, but never the results or the label", () => {
        const round = roundWithResults();
        const text = messageText(BuildAuthorMessages(round, 'GUIDANCE-TEXT'));
        expect(text).toContain(`${SENTINEL} reasoning before the actions`);
        expect(text).toContain(`${SENTINEL} requested params`);
        expect(text).toContain('Web Search');
        expect(text).toContain('GUIDANCE-TEXT');
        for (const hidden of ['RESULT-ONLY-MESSAGE', 'RESULT-ONLY-VALUE', `${SENTINEL} result one`, `${SENTINEL} action message`, 'LABEL-ONLY-MESSAGE', `${SENTINEL} final message`]) {
            expect(text).not.toContain(hidden);
        }
    });
});

describe('ParseAuthoredFinishIf', () => {
    it('accepts a bare object, a fenced one, and one wrapped in finishIf', () => {
        expect(ParseAuthoredFinishIf(VALID).FinishIf).toEqual(VALID_FINISH_IF);
        expect(ParseAuthoredFinishIf(`Here it is:\n\`\`\`json\n${VALID}\n\`\`\``).FinishIf).not.toBeNull();
        expect(ParseAuthoredFinishIf(JSON.stringify({ finishIf: VALID_FINISH_IF })).FinishIf).not.toBeNull();
    });

    it.each([
        ['no JSON', 'I would not attach one.'],
        ['broken JSON', '{"questions": ['],
        ['four questions', JSON.stringify({ questions: ['a', 'b', 'c', 'd'], message: 'Done.' })],
        ['a blank question', JSON.stringify({ questions: [' '], message: 'Done.' })],
        ['no message', JSON.stringify({ questions: ['Created?'] })]
    ])('rejects %s, as the loop agent type would', (_label, text) => {
        const parsed = ParseAuthoredFinishIf(text);
        expect(parsed.FinishIf).toBeNull();
        expect(parsed.Error).toBeTruthy();
    });
});

describe('AuthorFinishIf', () => {
    it('returns the first valid reply', async () => {
        const chat = scriptedChat(VALID);
        const outcome = await AuthorFinishIf(roundWithResults(), 'G', chat);
        expect(outcome).toEqual({ FinishIf: VALID_FINISH_IF, Attempts: 1, Error: null });
    });

    it('asks again after an invalid reply, telling the model why', async () => {
        const chat = scriptedChat('not json', VALID);
        const outcome = await AuthorFinishIf(roundWithResults(), 'G', chat);
        expect(outcome.Attempts).toBe(2);
        expect(outcome.FinishIf).not.toBeNull();
        const retry = chat.Calls[1];
        expect(retry).toHaveLength(4);
        expect(retry[2]).toEqual({ role: 'assistant', content: 'not json' });
        expect(String(retry[3].content)).toContain('not a valid finishIf');
    });

    it('gives up after two retries', async () => {
        const chat = scriptedChat('no', 'still no', 'never', VALID);
        const outcome = await AuthorFinishIf(roundWithResults(), 'G', chat);
        expect(FINISH_IF_AUTHOR_MAX_RETRIES).toBe(2);
        expect(outcome).toMatchObject({ FinishIf: null, Attempts: 3 });
        expect(outcome.Error).toBeTruthy();
        expect(chat.Calls).toHaveLength(3);
    });

    it('counts a failed call as an attempt', async () => {
        const chat = scriptedChat(null, VALID);
        expect(await AuthorFinishIf(roundWithResults(), 'G', chat)).toMatchObject({ Attempts: 2, Error: null });
        const failing = scriptedChat(null, null, null);
        expect(await AuthorFinishIf(roundWithResults(), 'G', failing)).toEqual({ FinishIf: null, Attempts: 3, Error: 'provider down' });
    });

    it('never sends the results or the label, on any attempt', async () => {
        const chat = scriptedChat('no', 'no', 'no');
        await AuthorFinishIf(roundWithResults(), 'G', chat);
        for (const call of chat.Calls) {
            const text = messageText(call);
            expect(text).not.toContain('RESULT-ONLY');
            expect(text).not.toContain('LABEL-ONLY');
        }
    });
});

describe('the authored.jsonl cache', () => {
    it('writes { roundId, questions, message } and reads it back by normalized round ID', () => {
        const entry = { RoundId: Guid(1, 5).toLowerCase(), FinishIf: { questions: ['Created?'], message: 'Done.' } };
        const line = SerializeAuthoredLine(entry);
        expect(JSON.parse(line)).toEqual({ roundId: entry.RoundId, questions: ['Created?'], message: 'Done.' });
        const cache = ParseAuthoredCache(`${line}\n`);
        expect(cache.get(Guid(1, 5))).toEqual(entry);
    });

    it('skips lines that are not a valid entry', () => {
        const good = SerializeAuthoredLine({ RoundId: Guid(1, 1), FinishIf: { questions: ['Created?'], message: 'Done.' } });
        const text = [good, 'not json', JSON.stringify({ roundId: Guid(1, 2), questions: [], message: 'x' }), JSON.stringify({ questions: ['a'], message: 'b' }), ''].join('\n');
        expect([...ParseAuthoredCache(text).keys()]).toEqual([Guid(1, 1)]);
    });
});
