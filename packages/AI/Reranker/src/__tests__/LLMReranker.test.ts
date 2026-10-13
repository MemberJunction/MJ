/**
 * Unit tests for LLMReranker and createLLMReranker.
 *
 * `@memberjunction/ai` is NOT mocked: LLMReranker extends the REAL BaseReranker
 * (ModelName, sortByRelevance, the Rerank template method), so these tests break
 * at compile/run time if that contract evolves instead of silently drifting on a
 * hand-faked copy — the shared-harness doctrine from @memberjunction/unit-testing
 * (real code under test, only package boundaries mocked). `@memberjunction/global`
 * is real too, so the @RegisterClass(BaseReranker, 'LLMReranker') decorator runs
 * against the real ClassFactory. Boundaries that stay mocked: core logging,
 * AIEngine's prompt catalog, and the AIPromptRunner execution seam.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock package boundaries before imports
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    UserInfo: class {},
}));

const mockPromptsArray: Array<{ ID: string; Name: string }> = [];
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            get Prompts() {
                return mockPromptsArray;
            },
        },
    },
}));

const mockExecutePrompt = vi.fn();
const mockWaitForPendingPromptRunSaves = vi.fn();
vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class {
        ExecutePrompt = mockExecutePrompt;
        WaitForPendingPromptRunSaves = mockWaitForPendingPromptRunSaves;
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {
        prompt: unknown = null;
        contextUser: unknown = null;
        attemptJSONRepair = false;
        data: unknown = null;
    },
    MJAIPromptEntityExtended: class {},
}));

import type { RerankParams } from '@memberjunction/ai';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import { LLMReranker, CreateLLMReranker } from '../LLMReranker';

// Helper to access protected doRerank
interface RerankCallable {
    doRerank(params: {
        query: string;
        documents: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>;
        topK?: number;
    }): Promise<Array<{ id: string; relevanceScore: number; document: { id: string; text: string }; rank: number }>>;
}

describe('LLMReranker', () => {
    const mockUser = { ID: 'user-1', Name: 'Test' } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPromptsArray.length = 0;
        mockExecutePrompt.mockReset();
        mockWaitForPendingPromptRunSaves.mockReset();
    });

    describe('constructor', () => {
        it('should store the promptID', () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            expect(reranker.PromptID).toBe('prompt-123');
        });

        it('should default modelName to LLM when empty string passed', () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            expect(reranker.ModelName).toBe('LLM');
        });

        it('should use provided modelName when given', () => {
            const reranker = new LLMReranker('', 'custom-model', 'prompt-123', mockUser);
            expect(reranker.ModelName).toBe('custom-model');
        });
    });

    describe('PromptID getter', () => {
        it('should return the configured prompt ID', () => {
            const reranker = new LLMReranker('', '', 'prompt-456', mockUser);
            expect(reranker.PromptID).toBe('prompt-456');
        });
    });

    describe('doRerank', () => {
        let reranker: LLMReranker;
        let doRerank: RerankCallable['doRerank'];

        beforeEach(() => {
            reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            doRerank = (reranker as unknown as RerankCallable).doRerank.bind(reranker);
        });

        it('should throw when prompt is not found', async () => {
            await expect(
                doRerank({ query: 'test', documents: [{ id: '1', text: 'doc' }] })
            ).rejects.toThrow('Rerank prompt not found');
        });

        it('should throw when prompt execution fails', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: false,
                errorMessage: 'Model error',
            });

            await expect(
                doRerank({ query: 'test', documents: [{ id: '1', text: 'doc' }] })
            ).rejects.toThrow('Prompt execution failed');
        });

        it('should parse array result from prompt execution', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [
                    { index: 0, score: 0.95 },
                    { index: 1, score: 0.72 },
                ],
                rawResult: null,
            });

            const results = await doRerank({
                query: 'test query',
                documents: [
                    { id: 'doc-1', text: 'First document' },
                    { id: 'doc-2', text: 'Second document' },
                ],
            });

            expect(results).toHaveLength(2);
            expect(results[0].relevanceScore).toBe(0.95);
            expect(results[0].id).toBe('doc-1');
            expect(results[1].relevanceScore).toBe(0.72);
            expect(results[1].id).toBe('doc-2');
        });

        it('should parse string JSON result from rawResult', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: null,
                rawResult: '[{"index":0,"score":0.85}]',
            });

            const results = await doRerank({
                query: 'test',
                documents: [{ id: 'doc-1', text: 'A document' }],
            });

            expect(results).toHaveLength(1);
            expect(results[0].relevanceScore).toBe(0.85);
        });

        it('should return empty array for invalid JSON string', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: null,
                rawResult: 'not valid json',
            });

            const results = await doRerank({
                query: 'test',
                documents: [{ id: 'doc-1', text: 'Doc' }],
            });

            expect(results).toHaveLength(0);
        });

        it('should return empty array for unexpected response type', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: 42,
                rawResult: null,
            });

            const results = await doRerank({
                query: 'test',
                documents: [{ id: 'doc-1', text: 'Doc' }],
            });

            expect(results).toHaveLength(0);
        });

        it('should skip items with out-of-bounds index', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [
                    { index: 0, score: 0.9 },
                    { index: 5, score: 0.8 },
                ],
                rawResult: null,
            });

            const results = await doRerank({
                query: 'test',
                documents: [
                    { id: 'doc-1', text: 'First' },
                    { id: 'doc-2', text: 'Second' },
                ],
            });

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('doc-1');
        });

        it('should skip items with negative index', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [
                    { index: -1, score: 0.9 },
                    { index: 0, score: 0.8 },
                ],
                rawResult: null,
            });

            const results = await doRerank({
                query: 'test',
                documents: [{ id: 'doc-1', text: 'Doc' }],
            });

            expect(results).toHaveLength(1);
            expect(results[0].relevanceScore).toBe(0.8);
        });

        it('should skip items with score outside 0-1 range', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [
                    { index: 0, score: 1.5 },
                    { index: 1, score: -0.1 },
                    { index: 0, score: 0.7 },
                ],
                rawResult: null,
            });

            const results = await doRerank({
                query: 'test',
                documents: [
                    { id: 'doc-1', text: 'First' },
                    { id: 'doc-2', text: 'Second' },
                ],
            });

            expect(results).toHaveLength(1);
            expect(results[0].relevanceScore).toBe(0.7);
        });

        it('should skip items with non-numeric index or score', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [
                    { index: 'zero', score: 0.9 },
                    { index: 0, score: 'high' },
                ],
                rawResult: null,
            });

            const results = await doRerank({
                query: 'test',
                documents: [{ id: 'doc-1', text: 'Doc' }],
            });

            expect(results).toHaveLength(0);
        });

        it('should use cached prompt on subsequent calls', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [{ index: 0, score: 0.9 }],
                rawResult: null,
            });

            await doRerank({
                query: 'test1',
                documents: [{ id: '1', text: 'doc' }],
            });

            // Remove prompt from the list to verify caching
            mockPromptsArray.length = 0;

            const results = await doRerank({
                query: 'test2',
                documents: [{ id: '2', text: 'another' }],
            });

            expect(results).toHaveLength(1);
        });

        it('should pass topK from params to prompt data', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [{ index: 0, score: 0.9 }],
                rawResult: null,
            });

            await doRerank({
                query: 'test',
                documents: [{ id: '1', text: 'doc' }],
                topK: 5,
            });

            const callArgs = mockExecutePrompt.mock.calls[0][0];
            expect(callArgs.data.topK).toBe(5);
        });

        it('should default topK to document count', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [{ index: 0, score: 0.9 }],
                rawResult: null,
            });

            await doRerank({
                query: 'test',
                documents: [
                    { id: '1', text: 'doc1' },
                    { id: '2', text: 'doc2' },
                    { id: '3', text: 'doc3' },
                ],
            });

            const callArgs = mockExecutePrompt.mock.calls[0][0];
            expect(callArgs.data.topK).toBe(3);
            expect(callArgs.data.documentCount).toBe(3);
        });

        it('should format documents as indexed text in prompt data', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [],
                rawResult: null,
            });

            await doRerank({
                query: 'my query',
                documents: [
                    { id: '1', text: 'Alpha' },
                    { id: '2', text: 'Beta' },
                ],
            });

            const callArgs = mockExecutePrompt.mock.calls[0][0];
            expect(callArgs.data.documents).toContain('[0] Alpha');
            expect(callArgs.data.documents).toContain('[1] Beta');
            expect(callArgs.data.query).toBe('my query');
        });

        it('should set attemptJSONRepair to true', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [],
                rawResult: null,
            });

            await doRerank({
                query: 'test',
                documents: [{ id: '1', text: 'doc' }],
            });

            const callArgs = mockExecutePrompt.mock.calls[0][0];
            expect(callArgs.attemptJSONRepair).toBe(true);
        });

        it('should sort results by relevance score descending', async () => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
            mockExecutePrompt.mockResolvedValue({
                success: true,
                result: [
                    { index: 0, score: 0.3 },
                    { index: 1, score: 0.9 },
                    { index: 2, score: 0.6 },
                ],
                rawResult: null,
            });

            const results = await doRerank({
                query: 'test',
                documents: [
                    { id: 'doc-1', text: 'Low' },
                    { id: 'doc-2', text: 'High' },
                    { id: 'doc-3', text: 'Mid' },
                ],
            });

            expect(results[0].relevanceScore).toBe(0.9);
            expect(results[1].relevanceScore).toBe(0.6);
            expect(results[2].relevanceScore).toBe(0.3);
        });
    });

    describe("the chat run's parent and cost", () => {
        function rerankParams(): RerankParams {
            return {
                query: 'test',
                documents: [
                    { id: 'doc-1', text: 'First' },
                    { id: 'doc-2', text: 'Second' },
                ],
            };
        }

        /** A reply ranking both documents, whose runner reported no cost, as AIPromptRunner does today. */
        function unpricedChatResult(run: ChatRunCost): AIPromptRunResult {
            return rankedChatResult({ promptRun: asPromptRun(run) });
        }

        beforeEach(() => {
            mockPromptsArray.push({ ID: 'prompt-123', Name: 'Test Prompt' });
        });

        it('passes ParentPromptRunID to the chat prompt as parentPromptRunId', async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            reranker.ParentPromptRunID = 'rerank-run-001';
            mockExecutePrompt.mockResolvedValueOnce(rankedChatResult());

            await reranker.Rerank(rerankParams());

            const callParams: AIPromptParams = mockExecutePrompt.mock.calls[0][0];
            expect(callParams.parentPromptRunId).toBe('rerank-run-001');
        });

        it('leaves parentPromptRunId unset when it has no parent run', async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            mockExecutePrompt.mockResolvedValueOnce(rankedChatResult());

            await reranker.Rerank(rerankParams());

            const callParams: AIPromptParams = mockExecutePrompt.mock.calls[0][0];
            expect(callParams.parentPromptRunId).toBeUndefined();
        });

        it("waits for the chat run's pending save before it reads the run's cost", async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            const run: ChatRunCost = { Cost: null, DescendantCost: null, TotalCost: null, CostCurrency: null };
            mockExecutePrompt.mockResolvedValueOnce(unpricedChatResult(run));
            // The server prices the chat run when its row is saved.
            mockWaitForPendingPromptRunSaves.mockImplementation(async () => {
                run.Cost = 0.0007;
                run.TotalCost = 0.0007;
                run.CostCurrency = 'USD';
            });

            const response = await reranker.Rerank(rerankParams());

            expect(mockWaitForPendingPromptRunSaves).toHaveBeenCalledTimes(1);
            expect(mockExecutePrompt.mock.invocationCallOrder[0]).toBeLessThan(mockWaitForPendingPromptRunSaves.mock.invocationCallOrder[0]);
            expect(response.Usage?.cost).toBe(0.0007);
            expect(response.Usage?.costCurrency).toBe('USD');
        });

        it("reports the chat run's TotalCost, which includes its children, over its own Cost", async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            mockExecutePrompt.mockResolvedValueOnce(
                unpricedChatResult({ Cost: 0.0007, DescendantCost: 0.0002, TotalCost: 0.0009, CostCurrency: 'USD' })
            );

            const response = await reranker.Rerank(rerankParams());

            expect(response.success).toBe(true);
            expect(response.Usage?.cost).toBe(0.0009);
            expect(response.Usage?.costCurrency).toBe('USD');
            expect(response.Usage?.promptTokens).toBe(150);
            expect(response.Usage?.completionTokens).toBe(50);
        });

        it("falls back to the chat run's Cost when it has no TotalCost", async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            mockExecutePrompt.mockResolvedValueOnce(
                unpricedChatResult({ Cost: 0.0007, DescendantCost: null, TotalCost: null, CostCurrency: 'EUR' })
            );

            const response = await reranker.Rerank(rerankParams());

            expect(response.Usage?.cost).toBe(0.0007);
            expect(response.Usage?.costCurrency).toBe('EUR');
        });

        it('leaves the cost unset when the chat run could not be priced (TotalCost 0, no Cost)', async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            mockExecutePrompt.mockResolvedValueOnce(
                unpricedChatResult({ Cost: null, DescendantCost: null, TotalCost: 0, CostCurrency: null })
            );

            const response = await reranker.Rerank(rerankParams());

            expect(response.Usage).toBeDefined();
            expect(response.Usage?.cost).toBeUndefined();
            expect(response.Usage?.costCurrency).toBeUndefined();
        });

        it("keeps the runner's reported cost over the chat run's saved cost", async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            mockExecutePrompt.mockResolvedValueOnce(rankedChatResult({
                cost: 0.003,
                costCurrency: 'USD',
                promptRun: asPromptRun({ Cost: 0.0007, DescendantCost: null, TotalCost: 0.0007, CostCurrency: 'EUR' }),
            }));

            const response = await reranker.Rerank(rerankParams());

            expect(response.Usage?.cost).toBe(0.003);
            expect(response.Usage?.costCurrency).toBe('USD');
        });

        it("reports the chat run's cost when the chat prompt fails, because the call still cost money", async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            mockExecutePrompt.mockResolvedValueOnce(chatRunResult({
                success: false,
                errorMessage: 'Output failed validation',
                promptRun: asPromptRun({ Cost: 0.0007, DescendantCost: null, TotalCost: 0.0007, CostCurrency: 'USD' }),
            }));

            const response = await reranker.Rerank(rerankParams());

            expect(response.success).toBe(false);
            expect(response.errorMessage).toContain('Output failed validation');
            expect(response.Usage?.cost).toBe(0.0007);
        });

        it('reports no Usage when the chat prompt never ran', async () => {
            const reranker = new LLMReranker('', '', 'no-such-prompt', mockUser);

            const response = await reranker.Rerank(rerankParams());

            expect(response.success).toBe(false);
            expect(mockExecutePrompt).not.toHaveBeenCalled();
            expect(response.Usage).toBeUndefined();
        });

        it('keeps the costs of concurrent reranks on one instance apart', async () => {
            const reranker = new LLMReranker('', '', 'prompt-123', mockUser);
            mockExecutePrompt
                .mockResolvedValueOnce(rankedChatResult({ cost: 0.001, costCurrency: 'USD' }))
                .mockResolvedValueOnce(rankedChatResult({ cost: 0.002, costCurrency: 'USD' }));
            // Both calls share the instance's prompt runner, so one flush of its save queue releases both.
            let flushSaves: () => void = () => undefined;
            const saved = new Promise<void>(resolve => {
                flushSaves = resolve;
            });
            mockWaitForPendingPromptRunSaves.mockImplementation(() => saved);

            const first = reranker.Rerank(rerankParams());
            const second = reranker.Rerank(rerankParams());
            flushSaves();
            const [firstResponse, secondResponse] = await Promise.all([first, second]);

            expect(firstResponse.Usage?.cost).toBe(0.001);
            expect(secondResponse.Usage?.cost).toBe(0.002);
        });
    });
});

describe('createLLMReranker', () => {
    it('should create an LLMReranker instance', () => {
        const mockUser = { ID: 'user-1' } as never;
        const reranker = CreateLLMReranker('prompt-123', mockUser);
        expect(reranker).toBeInstanceOf(LLMReranker);
    });

    it('should set the promptID on the created instance', () => {
        const mockUser = { ID: 'user-1' } as never;
        const reranker = CreateLLMReranker('prompt-789', mockUser);
        expect(reranker.PromptID).toBe('prompt-789');
    });

    it('should default model name to LLM', () => {
        const mockUser = { ID: 'user-1' } as never;
        const reranker = CreateLLMReranker('prompt-789', mockUser);
        expect(reranker.ModelName).toBe('LLM');
    });
});

/** The chat prompt's result fields LLMReranker reads. */
type ChatRunResultFields = Pick<
    AIPromptRunResult,
    'success' | 'errorMessage' | 'result' | 'promptTokens' | 'completionTokens' | 'cost' | 'costCurrency' | 'promptRun'
>;

/** The seam onto the full `AIPromptRunResult` that `AIPromptRunner.ExecutePrompt` returns. */
function chatRunResult(fields: ChatRunResultFields): AIPromptRunResult {
    return fields as AIPromptRunResult;
}

/** A successful chat reply ranking both documents, with 150 prompt and 50 completion tokens. */
function rankedChatResult(fields: Partial<ChatRunResultFields> = {}): AIPromptRunResult {
    return chatRunResult({
        success: true,
        result: [
            { index: 0, score: 0.9 },
            { index: 1, score: 0.4 },
        ],
        promptTokens: 150,
        completionTokens: 50,
        ...fields,
    });
}

/** The prompt-run entity an `AIPromptRunResult` carries. */
type ChatPromptRun = NonNullable<AIPromptRunResult['promptRun']>;

/** The chat run's cost columns: what LLMReranker reads once the run is saved. */
type ChatRunCost = Pick<ChatPromptRun, 'Cost' | 'DescendantCost' | 'TotalCost' | 'CostCurrency'>;

/** The seam onto the full prompt-run entity that `AIPromptRunResult.promptRun` is declared as. */
function asPromptRun(run: ChatRunCost): ChatPromptRun {
    return run as ChatPromptRun;
}
