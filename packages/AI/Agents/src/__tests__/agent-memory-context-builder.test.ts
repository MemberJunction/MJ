import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks for the underlying retrieval collaborators ------------------------------------------
// The builder is the thin orchestration wrapper; we mock the collaborators so the tests are
// deterministic and never touch DB/network.

const getNotes = vi.fn(async () => [] as unknown[]);
const getExamples = vi.fn(async () => [] as unknown[]);
const formatNotes = vi.fn((notes: unknown[]) => (notes.length ? `NOTES(${notes.length})` : ''));
const formatExamples = vi.fn((examples: unknown[]) => (examples.length ? `EXAMPLES(${examples.length})` : ''));

vi.mock('../agent-context-injector', () => ({
    AgentContextInjector: class {
        GetNotesForContext = getNotes;
        GetExamplesForContext = getExamples;
        FormatNotesForInjection = formatNotes;
        FormatExamplesForInjection = formatExamples;
    }
}));

const ragExecute = vi.fn(async () => null as unknown);
vi.mock('../agent-pre-execution-rag', () => ({
    AgentPreExecutionRAG: class {
        Execute = ragExecute;
    }
}));

vi.mock('@memberjunction/ai-reranker', () => ({
    RerankerService: { Instance: { parseConfiguration: vi.fn(() => null) } }
}));

import { AgentMemoryContextBuilder } from '../agent-memory-context-builder';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import type { ChatMessage } from '@memberjunction/ai';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

/** Build an agent stub with injection flags + strategy/limit fields the builder reads. */
function makeAgent(overrides: Partial<MJAIAgentEntityExtended>): MJAIAgentEntityExtended {
    return {
        ID: 'agent-1',
        InjectNotes: false,
        InjectExamples: false,
        NoteInjectionStrategy: 'Relevant',
        ExampleInjectionStrategy: 'Semantic',
        MaxNotesToInject: 5,
        MaxExamplesToInject: 3,
        RerankerConfiguration: null,
        ...overrides
    } as unknown as MJAIAgentEntityExtended;
}

describe('AgentMemoryContextBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getNotes.mockResolvedValue([]);
        getExamples.mockResolvedValue([]);
    });

    describe('InjectContextMemory', () => {
        it('returns empty and injects nothing when both InjectNotes and InjectExamples are false', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectContextMemory(
                'hi',
                makeAgent({ InjectNotes: false, InjectExamples: false }),
                undefined,
                undefined,
                fakeUser,
                messages
            );

            expect(result).toEqual({ notes: [], examples: [] });
            expect(getNotes).not.toHaveBeenCalled();
            expect(getExamples).not.toHaveBeenCalled();
            expect(messages).toHaveLength(1); // unchanged — no system message unshifted
            expect(messages[0].role).toBe('user');
        });

        it('does not unshift a system message when injection enabled but no notes/examples found', async () => {
            getNotes.mockResolvedValueOnce([]);
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectContextMemory(
                'hi',
                makeAgent({ InjectNotes: true, InjectExamples: false }),
                undefined,
                undefined,
                fakeUser,
                messages
            );

            expect(getNotes).toHaveBeenCalledTimes(1);
            expect(result.notes).toHaveLength(0);
            expect(messages).toHaveLength(1);
        });

        it('unshifts a formatted system message when notes are present', async () => {
            const note = { ID: 'n1' };
            getNotes.mockResolvedValueOnce([note]);
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectContextMemory(
                'hi',
                makeAgent({ InjectNotes: true, InjectExamples: false }),
                undefined,
                undefined,
                fakeUser,
                messages
            );

            expect(result.notes).toEqual([note]);
            expect(messages).toHaveLength(2);
            expect(messages[0].role).toBe('system');
            expect(messages[0].content).toContain('NOTES(1)');
        });

        it('combines notes and examples into a single system message and returns both', async () => {
            getNotes.mockResolvedValueOnce([{ ID: 'n1' }, { ID: 'n2' }]);
            getExamples.mockResolvedValueOnce([{ ID: 'e1' }]);
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectContextMemory(
                'hi',
                makeAgent({ InjectNotes: true, InjectExamples: true }),
                'user-1',
                'company-1',
                fakeUser,
                messages
            );

            expect(result.notes).toHaveLength(2);
            expect(result.examples).toHaveLength(1);
            expect(messages[0].role).toBe('system');
            expect(messages[0].content).toContain('NOTES(2)');
            expect(messages[0].content).toContain('EXAMPLES(1)');
        });

        it('passes observability through to the notes retrieval call', async () => {
            getNotes.mockResolvedValueOnce([{ ID: 'n1' }]);
            const builder = new AgentMemoryContextBuilder();

            await builder.InjectContextMemory(
                'hi',
                makeAgent({ InjectNotes: true }),
                undefined,
                undefined,
                fakeUser,
                [],
                undefined,
                undefined,
                undefined,
                undefined,
                { agentRunID: 'run-9', stepNumber: 3 }
            );

            expect(getNotes).toHaveBeenCalledTimes(1);
            const arg = getNotes.mock.calls[0][0] as { observability?: { agentRunID: string; stepNumber: number } };
            expect(arg.observability).toEqual({ agentRunID: 'run-9', stepNumber: 3 });
        });

        it('injects an examples-only system message when only InjectExamples is enabled', async () => {
            getExamples.mockResolvedValueOnce([{ ID: 'e1' }, { ID: 'e2' }]);
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectContextMemory(
                'hi',
                makeAgent({ InjectNotes: false, InjectExamples: true }),
                undefined,
                undefined,
                fakeUser,
                messages
            );

            expect(getNotes).not.toHaveBeenCalled();
            expect(result.examples).toHaveLength(2);
            expect(messages[0].role).toBe('system');
            expect(messages[0].content).toContain('EXAMPLES(2)');
            expect(messages[0].content).not.toContain('NOTES');
        });

        it('returns the retrieved memory without unshifting when no conversationMessages array is supplied', async () => {
            getNotes.mockResolvedValueOnce([{ ID: 'n1' }]);
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectContextMemory(
                'hi',
                makeAgent({ InjectNotes: true }),
                undefined,
                undefined,
                fakeUser,
                undefined // no message array — formatting/unshift must be skipped safely
            );

            expect(result.notes).toHaveLength(1);
            expect(formatNotes).not.toHaveBeenCalled();
        });

        it('falls back to the default limits (5 notes / 3 examples) when the agent limits are null', async () => {
            getNotes.mockResolvedValueOnce([{ ID: 'n1' }]);
            getExamples.mockResolvedValueOnce([{ ID: 'e1' }]);
            const builder = new AgentMemoryContextBuilder();

            await builder.InjectContextMemory(
                'hi',
                makeAgent({
                    InjectNotes: true,
                    InjectExamples: true,
                    MaxNotesToInject: null as unknown as number,
                    MaxExamplesToInject: null as unknown as number,
                    NoteInjectionStrategy: 'Recent',
                    ExampleInjectionStrategy: 'Rated'
                }),
                'user-1',
                'company-1',
                fakeUser,
                []
            );

            const notesArg = getNotes.mock.calls[0][0] as { maxNotes: number; strategy: string };
            expect(notesArg.maxNotes).toBe(5);
            expect(notesArg.strategy).toBe('Recent');
            const examplesArg = getExamples.mock.calls[0][0] as { maxExamples: number; strategy: string };
            expect(examplesArg.maxExamples).toBe(3);
            expect(examplesArg.strategy).toBe('Rated');
        });

        it('invokes the verbose status logger when content is injected', async () => {
            getNotes.mockResolvedValueOnce([{ ID: 'n1' }]);
            const logStatus = vi.fn();
            const builder = new AgentMemoryContextBuilder();

            await builder.InjectContextMemory(
                'hi',
                makeAgent({ InjectNotes: true }),
                undefined,
                undefined,
                fakeUser,
                [],
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                logStatus
            );

            expect(logStatus).toHaveBeenCalled();
            // verboseOnly flag is true for the injector status lines
            expect(logStatus.mock.calls.every(c => c[1] === true)).toBe(true);
        });
    });

    describe('InjectPreExecutionRAG', () => {
        it('returns null and injects nothing when contextUser is missing', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectPreExecutionRAG(
                'hi',
                makeAgent({}),
                undefined,
                messages,
                messages
            );

            expect(result).toBeNull();
            expect(ragExecute).not.toHaveBeenCalled();
            expect(messages).toHaveLength(1);
        });

        it('returns null when the agent has no ID', async () => {
            const builder = new AgentMemoryContextBuilder();
            const result = await builder.InjectPreExecutionRAG(
                'hi',
                {} as unknown as MJAIAgentEntityExtended,
                fakeUser,
                [],
                []
            );
            expect(result).toBeNull();
            expect(ragExecute).not.toHaveBeenCalled();
        });

        it('unshifts a <retrieved_context> system message when RAG returns a formatted result', async () => {
            ragExecute.mockResolvedValueOnce({
                formattedSystemMessage: '<retrieved_context>data</retrieved_context>',
                combinedResults: [{ id: 'r1' }],
                queriedScopeIDs: ['s1']
            });
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectPreExecutionRAG(
                'hi',
                makeAgent({}),
                fakeUser,
                messages,
                messages
            );

            expect(result).not.toBeNull();
            expect(messages).toHaveLength(2);
            expect(messages[0].role).toBe('system');
            expect(messages[0].content).toContain('<retrieved_context>');
        });

        it('returns null without injecting when the RAG engine yields no result', async () => {
            ragExecute.mockResolvedValueOnce(null);
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectPreExecutionRAG('hi', makeAgent({}), fakeUser, messages, messages);

            expect(ragExecute).toHaveBeenCalledTimes(1);
            expect(result).toBeNull();
            expect(messages).toHaveLength(1);
        });

        it('returns the result WITHOUT unshifting when it carries no formattedSystemMessage', async () => {
            ragExecute.mockResolvedValueOnce({
                formattedSystemMessage: '',
                combinedResults: [],
                queriedScopeIDs: ['s1']
            });
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectPreExecutionRAG('hi', makeAgent({}), fakeUser, messages, messages);

            expect(result).not.toBeNull();
            expect(messages).toHaveLength(1); // nothing injected
        });

        it('passes only the LAST FIVE original messages to the RAG engine as recentMessages', async () => {
            ragExecute.mockResolvedValueOnce(null);
            const original: ChatMessage[] = Array.from({ length: 8 }, (_, i) => ({
                role: 'user' as const,
                content: `msg-${i}`
            }));
            const builder = new AgentMemoryContextBuilder();

            await builder.InjectPreExecutionRAG('msg-7', makeAgent({}), fakeUser, [...original], original);

            const arg = ragExecute.mock.calls[0][0] as { recentMessages?: ChatMessage[] };
            expect(arg.recentMessages).toHaveLength(5);
            expect(arg.recentMessages![0].content).toBe('msg-3');
            expect(arg.recentMessages![4].content).toBe('msg-7');
        });

        it('returns null and calls the error logger when RAG execution throws', async () => {
            ragExecute.mockRejectedValueOnce(new Error('boom'));
            const logError = vi.fn();
            const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const builder = new AgentMemoryContextBuilder();

            const result = await builder.InjectPreExecutionRAG(
                'hi',
                makeAgent({}),
                fakeUser,
                messages,
                messages,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                logError
            );

            expect(result).toBeNull();
            expect(logError).toHaveBeenCalledTimes(1);
            expect(messages).toHaveLength(1); // no injection on failure
        });
    });
});
