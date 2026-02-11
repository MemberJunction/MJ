/**
 * Unit tests for LLMReranker and createLLMReranker
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => () => {},
}));

vi.mock('@memberjunction/ai', () => {
    class MockBaseReranker {
        protected _modelName: string;
        constructor(_apiKey: string, modelName?: string) {
            this._modelName = modelName || '';
        }
        get ModelName(): string {
            return this._modelName;
        }
        protected sortByRelevance<T extends { relevanceScore: number }>(results: T[]): T[] {
            return [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);
        }
    }
    return { BaseReranker: MockBaseReranker };
});

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
vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class {
        ExecutePrompt = mockExecutePrompt;
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {
        prompt: unknown = null;
        contextUser: unknown = null;
        attemptJSONRepair = false;
        data: unknown = null;
    },
    AIPromptEntityExtended: class {},
}));

import { LLMReranker, createLLMReranker } from '../LLMReranker';

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
});

describe('createLLMReranker', () => {
    it('should create an LLMReranker instance', () => {
        const mockUser = { ID: 'user-1' } as never;
        const reranker = createLLMReranker('prompt-123', mockUser);
        expect(reranker).toBeInstanceOf(LLMReranker);
    });

    it('should set the promptID on the created instance', () => {
        const mockUser = { ID: 'user-1' } as never;
        const reranker = createLLMReranker('prompt-789', mockUser);
        expect(reranker.PromptID).toBe('prompt-789');
    });

    it('should default model name to LLM', () => {
        const mockUser = { ID: 'user-1' } as never;
        const reranker = createLLMReranker('prompt-789', mockUser);
        expect(reranker.ModelName).toBe('LLM');
    });
});
