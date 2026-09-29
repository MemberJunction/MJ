/**
 * The examples reranking stage: `AgentContextInjector.GetExamplesForContext` reranks examples only when
 * the agent's reranker configuration sets `rerankExamples`, and `AgentMemoryContextBuilder` passes that
 * configuration through.
 *
 * The injector, the builder and `RerankerService.parseConfiguration` are real. Only the vector search
 * (`AIEngine.FindSimilarAgentExamples`), core logging and pre-execution RAG are mocked, and
 * `RerankerService.RerankExamples` is spied on, so a test shows whether the reranker was called at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { MJAIAgentExampleEntity } from '@memberjunction/core-entities';
import type { ExampleMatchResult } from '@memberjunction/aiengine';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { RerankerService } from '@memberjunction/ai-reranker';
import type { RerankerConfiguration } from '@memberjunction/ai-reranker';
import { AgentContextInjector } from '../agent-context-injector';
import { AgentMemoryContextBuilder } from '../agent-memory-context-builder';

const h = vi.hoisted(() => ({
    /** The examples the vector search ranks, most similar first. */
    candidates: [] as ExampleMatchResult[],
    /** The `topK` of each vector search. */
    fetchCounts: [] as number[],
}));

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        AIEngine: {
            Instance: {
                FindSimilarAgentExamples: async (_query: string, _agentId?: string, _userId?: string, _companyId?: string, topK = 3): Promise<ExampleMatchResult[]> => {
                    h.fetchCounts.push(topK);
                    return h.candidates.slice(0, topK);
                },
            },
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogStatus: vi.fn(), LogError: vi.fn() };
});

vi.mock('../agent-pre-execution-rag', () => ({
    AgentPreExecutionRAG: class {},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const contextUser = new UserInfo(undefined, { ID: 'user-1', Name: 'Test User' });
const INPUT = 'Where can I find my invoice?';

/** The example fields the injector and the reranker read: all a test has to supply. */
type ExampleFields = Pick<MJAIAgentExampleEntity, 'ID' | 'ExampleInput' | 'ExampleOutput'>;

/** A vector search match, through the seam onto the full entity the injector is declared to return. */
function exampleMatch(id: string, similarity: number): ExampleMatchResult {
    const fields: ExampleFields = { ID: id, ExampleInput: `Question ${id}`, ExampleOutput: `Answer ${id}` };
    return { example: fields as MJAIAgentExampleEntity, similarity };
}

/** The agent fields the builder reads when only examples are injected. */
type AgentFields = Pick<MJAIAgentEntityExtended, 'ID' | 'InjectNotes' | 'InjectExamples' | 'ExampleInjectionStrategy' | 'MaxExamplesToInject' | 'RerankerConfiguration'>;

/** An agent that injects semantically retrieved examples, through the seam onto the full agent entity. */
function examplesAgent(rerankerConfiguration: string | null): MJAIAgentEntityExtended {
    const fields: AgentFields = {
        ID: 'agent-1',
        InjectNotes: false,
        InjectExamples: true,
        ExampleInjectionStrategy: 'Semantic',
        MaxExamplesToInject: 2,
        RerankerConfiguration: rerankerConfiguration,
    };
    return fields as MJAIAgentEntityExtended;
}

/** A reranker configuration shaped like Sage's: notes are reranked, examples are not mentioned. */
function rerankerConfig(overrides: Partial<RerankerConfiguration> = {}): RerankerConfiguration {
    return {
        enabled: true,
        rerankerModelId: 'reranker-model',
        retrievalMultiplier: 3,
        minRelevanceThreshold: 0.5,
        fallbackOnError: true,
        ...overrides,
    };
}

function getExamples(config: RerankerConfiguration | null | undefined): Promise<MJAIAgentExampleEntity[]> {
    return new AgentContextInjector().GetExamplesForContext({
        agentId: 'agent-1',
        currentInput: INPUT,
        strategy: 'Semantic',
        maxExamples: 2,
        contextUser,
        rerankerConfig: config,
    });
}

function ids(examples: MJAIAgentExampleEntity[]): string[] {
    return examples.map(e => e.ID);
}

/** Spies on the examples reranker, answering with `result` (or rejecting with it when it is an Error). */
function spyOnRerankExamples(result: ExampleMatchResult[] | Error = []) {
    return vi.spyOn(RerankerService.Instance, 'RerankExamples').mockImplementation(async () => {
        if (result instanceof Error) {
            throw result;
        }
        return result;
    });
}

beforeEach(() => {
    h.candidates = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5'].map((id, i) => exampleMatch(id, 0.9 - i * 0.05));
    h.fetchCounts = [];
});

// ---------------------------------------------------------------------------
// AgentContextInjector
// ---------------------------------------------------------------------------
describe('AgentContextInjector examples reranking stage', () => {
    it('does not rerank examples when the agent has no reranker configuration', async () => {
        const rerank = spyOnRerankExamples();

        const examples = await getExamples(null);

        expect(rerank).not.toHaveBeenCalled();
        expect(h.fetchCounts).toEqual([2]);
        expect(ids(examples)).toEqual(['e0', 'e1']);
    });

    it("is off by default: a configuration like Sage's, which reranks notes, leaves examples alone", async () => {
        const rerank = spyOnRerankExamples();

        const examples = await getExamples(rerankerConfig());

        expect(rerank).not.toHaveBeenCalled();
        expect(h.fetchCounts).toEqual([2]);
        expect(ids(examples)).toEqual(['e0', 'e1']);
    });

    it('does not rerank examples when rerankExamples is false', async () => {
        const rerank = spyOnRerankExamples();

        await getExamples(rerankerConfig({ rerankExamples: false }));

        expect(rerank).not.toHaveBeenCalled();
        expect(h.fetchCounts).toEqual([2]);
    });

    it('reranks when rerankExamples is true: it fetches retrievalMultiplier times as many, and returns the top N reranked', async () => {
        const config = rerankerConfig({ rerankExamples: true });
        const rerank = spyOnRerankExamples([h.candidates[4], h.candidates[1], h.candidates[0]]);

        const examples = await getExamples(config);

        expect(h.fetchCounts).toEqual([6]);
        expect(rerank).toHaveBeenCalledTimes(1);
        expect(rerank).toHaveBeenCalledWith(h.candidates, INPUT, config, contextUser);
        expect(ids(examples)).toEqual(['e4', 'e1']);
    });

    it('falls back to the vector search results when reranking fails and fallbackOnError is true', async () => {
        spyOnRerankExamples(new Error('Decision model is down'));

        const examples = await getExamples(rerankerConfig({ rerankExamples: true, fallbackOnError: true }));

        expect(ids(examples)).toEqual(['e0', 'e1']);
    });

    it('throws when reranking fails and fallbackOnError is false', async () => {
        spyOnRerankExamples(new Error('Decision model is down'));

        await expect(getExamples(rerankerConfig({ rerankExamples: true, fallbackOnError: false }))).rejects.toThrow('Decision model is down');
    });
});

// ---------------------------------------------------------------------------
// AgentMemoryContextBuilder
// ---------------------------------------------------------------------------
describe('AgentMemoryContextBuilder examples reranking', () => {
    function injectExamples(agent: MJAIAgentEntityExtended): Promise<{ examples: MJAIAgentExampleEntity[] }> {
        return new AgentMemoryContextBuilder().InjectContextMemory(INPUT, agent, undefined, undefined, contextUser, []);
    }

    it("leaves examples on vector search for an agent configured like Sage, with the reranker never called", async () => {
        const rerank = spyOnRerankExamples();
        const sageLike = JSON.stringify({ enabled: true, rerankerModelId: 'cohere-model', retrievalMultiplier: 3, minRelevanceThreshold: 0.5 });

        const result = await injectExamples(examplesAgent(sageLike));

        expect(rerank).not.toHaveBeenCalled();
        expect(h.fetchCounts).toEqual([2]);
        expect(ids(result.examples)).toEqual(['e0', 'e1']);
    });

    it("reranks examples for an agent whose RerankerConfiguration sets rerankExamples, with the notes' model", async () => {
        const rerank = spyOnRerankExamples([h.candidates[3], h.candidates[2]]);
        const optedIn = JSON.stringify({ enabled: true, rerankerModelId: 'decision-reranker-model', rerankExamples: true });

        const result = await injectExamples(examplesAgent(optedIn));

        expect(rerank).toHaveBeenCalledWith(
            h.candidates,
            INPUT,
            expect.objectContaining({ rerankerModelId: 'decision-reranker-model', rerankExamples: true }),
            contextUser
        );
        expect(ids(result.examples)).toEqual(['e3', 'e2']);
    });
});
