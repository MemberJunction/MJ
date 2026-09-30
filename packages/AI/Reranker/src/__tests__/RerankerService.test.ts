import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class { GetEntityObject = vi.fn().mockResolvedValue({ Save: vi.fn().mockResolvedValue(true), ID: 'step-123', AgentRunID: '', StepNumber: 0, StepType: '', StepName: '', Status: '', StartedAt: null, ParentID: null, InputData: '', PayloadAtStart: '', PayloadAtEnd: '', CompletedAt: null, Success: false, ErrorMessage: null, OutputData: '', LatestResult: null }) },
    UserInfo: class { ID = 'user-1'; Name = 'Test'; Email = 'test@test.com'; UserRoles: Array<{RoleID: string}> = [] }
}));

const mockModels: Array<{ ID: string; Name: string; IsActive: boolean; APIName: string }> = [];
const mockModelVendors: Array<{ ModelID: string; Status: string; Priority: number; DriverClass: string; APIName: string }> = [];
const mockCreateInstance = vi.fn().mockReturnValue(null);

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: (...args: unknown[]) => mockCreateInstance(...args)
                }
            }
        }
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            get Models() { return mockModels; },
            get ModelVendors() { return mockModelVendors; },
            Prompts: []
        }
    }
}));

vi.mock('@memberjunction/ai', () => ({
    BaseReranker: class {},
    GetAIAPIKey: vi.fn().mockImplementation((driverClass: string) => {
        // Mirror the real GetAIAPIKey logic: read from env var
        return process.env[`AI_VENDOR_API_KEY__${driverClass}`] || null;
    })
}));
vi.mock('@memberjunction/ai-core-plus', () => ({ MJAIModelEntityExtended: class {} }));
vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentNoteEntity: class { ID = ''; Note = ''; Type = ''; Get(_f: string) { return ''; } },
    MJAIAgentRunStepEntity: class {}
}));

// RerankNotes reranks through AIRerankerRunner; AIRerankerRunner.test.ts covers the runner itself.
const mockRunRerank = vi.fn();
vi.mock('../AIRerankerRunner', () => ({
    AIRerankerRunner: class {
        RunRerank = (...args: unknown[]) => mockRunRerank(...args);
    }
}));

import { RerankerService, RerankObservabilityOptions } from '../RerankerService';
import { RerankerConfiguration } from '../config.types';
import { GetGlobalObjectStore } from '@memberjunction/global';
import type { MJAIAgentExampleEntity, MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import type { ExampleMatchResult, NoteMatchResult } from '@memberjunction/aiengine';

const mockUser = { ID: 'user-1', Name: 'Test' } as never;

function resetSingleton(): void {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g['___SINGLETON__RerankerService'];
    }
}

function makeConfig(overrides?: Partial<RerankerConfiguration>): RerankerConfiguration {
    return { enabled: true, rerankerModelId: 'model-1', retrievalMultiplier: 3, minRelevanceThreshold: 0.5, fallbackOnError: true, ...overrides };
}

describe('RerankerService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateInstance.mockReturnValue(null);
        mockModels.length = 0;
        mockModelVendors.length = 0;
        resetSingleton();
    });

    describe('Instance (singleton)', () => {
        it('should return the same instance', () => {
            expect(RerankerService.Instance).toBe(RerankerService.Instance);
        });
    });

    describe('parseConfiguration', () => {
        it('should parse valid config', () => {
            const result = RerankerService.Instance.parseConfiguration(
                JSON.stringify({ enabled: true, rerankerModelId: 'model-1' })
            );
            expect(result).not.toBeNull();
            expect(result!.rerankerModelId).toBe('model-1');
        });

        it('should return null for null', () => {
            expect(RerankerService.Instance.parseConfiguration(null)).toBeNull();
        });

        it('should return null for disabled config', () => {
            expect(RerankerService.Instance.parseConfiguration(
                JSON.stringify({ enabled: false, rerankerModelId: 'x' })
            )).toBeNull();
        });
    });

    describe('getReranker', () => {
        it('should return null when model not found', async () => {
            expect(await RerankerService.Instance.getReranker('nonexistent', mockUser)).toBeNull();
        });

        it('should return null for inactive model', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Test', IsActive: false, APIName: 'x' });
            expect(await RerankerService.Instance.getReranker('model-1', mockUser)).toBeNull();
        });

        it('should return null when no vendors and not LLM Reranker', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Regular', IsActive: true, APIName: 'x' });
            expect(await RerankerService.Instance.getReranker('model-1', mockUser)).toBeNull();
        });

        it('should use LLMReranker driver for "LLM Reranker" model name', async () => {
            mockModels.push({ ID: 'model-1', Name: 'LLM Reranker', IsActive: true, APIName: '' });
            const mockReranker = { Rerank: vi.fn() };
            mockCreateInstance.mockReturnValue(mockReranker);

            const result = await RerankerService.Instance.getReranker('model-1', mockUser, 'prompt-1');
            expect(result).toBe(mockReranker);
        });

        it('should return null for LLMReranker without promptID', async () => {
            mockModels.push({ ID: 'model-1', Name: 'LLM Reranker', IsActive: true, APIName: '' });
            expect(await RerankerService.Instance.getReranker('model-1', mockUser)).toBeNull();
        });

        it('should create standard reranker with API key from env', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Cohere', IsActive: true, APIName: 'v3' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'CohereReranker', APIName: 'v3' });
            process.env['AI_VENDOR_API_KEY__CohereReranker'] = 'test-key';
            const mockReranker = { Rerank: vi.fn() };
            mockCreateInstance.mockReturnValue(mockReranker);

            const result = await RerankerService.Instance.getReranker('model-1', mockUser);
            expect(result).toBe(mockReranker);
            delete process.env['AI_VENDOR_API_KEY__CohereReranker'];
        });

        it('should return null when no API key for standard reranker', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Cohere', IsActive: true, APIName: 'v3' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'CohereReranker', APIName: 'v3' });
            delete process.env['AI_VENDOR_API_KEY__CohereReranker'];
            expect(await RerankerService.Instance.getReranker('model-1', mockUser)).toBeNull();
        });

        it('should cache reranker instances', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Test', IsActive: true, APIName: 'x' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'TestDriver', APIName: 'x' });
            process.env['AI_VENDOR_API_KEY__TestDriver'] = 'key';
            const mockReranker = { Rerank: vi.fn() };
            mockCreateInstance.mockReturnValue(mockReranker);

            const service = RerankerService.Instance;
            const first = await service.getReranker('model-1', mockUser);
            const second = await service.getReranker('model-1', mockUser);
            expect(first).toBe(second);
            expect(mockCreateInstance).toHaveBeenCalledTimes(1);
            delete process.env['AI_VENDOR_API_KEY__TestDriver'];
        });

        it('should prefer highest-priority vendor', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Multi', IsActive: true, APIName: 'x' });
            mockModelVendors.push(
                { ModelID: 'model-1', Status: 'Active', Priority: 10, DriverClass: 'LowPriority', APIName: 'low' },
                { ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'HighPriority', APIName: 'high' }
            );
            process.env['AI_VENDOR_API_KEY__HighPriority'] = 'key';
            mockCreateInstance.mockReturnValue({ Rerank: vi.fn() });

            await RerankerService.Instance.getReranker('model-1', mockUser);
            expect(mockCreateInstance).toHaveBeenCalledWith(expect.anything(), 'HighPriority', 'key', 'high');
            delete process.env['AI_VENDOR_API_KEY__HighPriority'];
        });

        it('should return null when ClassFactory returns null', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Test', IsActive: true, APIName: 'x' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'BadDriver', APIName: 'x' });
            process.env['AI_VENDOR_API_KEY__BadDriver'] = 'key';
            mockCreateInstance.mockReturnValue(null);

            expect(await RerankerService.Instance.getReranker('model-1', mockUser)).toBeNull();
            delete process.env['AI_VENDOR_API_KEY__BadDriver'];
        });

        it('should return null when ClassFactory throws', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Test', IsActive: true, APIName: 'x' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'ErrDriver', APIName: 'x' });
            process.env['AI_VENDOR_API_KEY__ErrDriver'] = 'key';
            mockCreateInstance.mockImplementation(() => { throw new Error('Boom'); });

            expect(await RerankerService.Instance.getReranker('model-1', mockUser)).toBeNull();
            delete process.env['AI_VENDOR_API_KEY__ErrDriver'];
        });

        it('should skip inactive vendors', async () => {
            mockModels.push({ ID: 'model-1', Name: 'Test', IsActive: true, APIName: 'x' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Inactive', Priority: 1, DriverClass: 'SomeDriver', APIName: 'x' });
            expect(await RerankerService.Instance.getReranker('model-1', mockUser)).toBeNull();
        });
    });

    describe('rerankNotes', () => {
        it('should return early for empty notes', async () => {
            const result = await RerankerService.Instance.rerankNotes([], 'query', makeConfig(), mockUser);
            expect(result.success).toBe(true);
            expect(result.notes).toHaveLength(0);
        });

        it('should throw when reranker is not available and fallbackOnError is false', async () => {
            mockRunRerank.mockResolvedValue({ Success: false, ErrorMessage: 'Reranker not available for model ID: nonexistent', ExecutionTimeMS: 1 });
            const note = { note: { ID: 'n1', Note: 'text', Type: 'G', Get: vi.fn() }, similarity: 0.8 };
            await expect(
                RerankerService.Instance.rerankNotes([note as never], 'query', makeConfig({ rerankerModelId: 'nonexistent', fallbackOnError: false }), mockUser)
            ).rejects.toThrow('Reranker not available');
        });

        it('should throw when Rerank fails and fallbackOnError is false', async () => {
            mockRunRerank.mockResolvedValue({ Success: false, ErrorMessage: 'Err', Response: { success: false, errorMessage: 'Err', results: [], durationMs: 1 }, ExecutionTimeMS: 1 });

            const note = { note: { ID: 'n1', Note: 'text', Type: 'G', Get: vi.fn() }, similarity: 0.8 };
            await expect(
                RerankerService.Instance.rerankNotes([note as never], 'query', makeConfig({ fallbackOnError: false }), mockUser)
            ).rejects.toThrow('Err');
        });

        it('should filter results below threshold', async () => {
            const ne1 = { ID: 'n1', Note: 'Good', Type: 'G', Get: vi.fn() };
            const ne2 = { ID: 'n2', Note: 'Bad', Type: 'G', Get: vi.fn() };
            mockRunRerank.mockResolvedValue({
                Success: true,
                ExecutionTimeMS: 1,
                Response: {
                    success: true,
                    durationMs: 1,
                    results: [
                        { id: 'n1', relevanceScore: 0.9, document: { id: 'n1', text: 'Good', metadata: { noteEntity: ne1 } }, rank: 0 },
                        { id: 'n2', relevanceScore: 0.3, document: { id: 'n2', text: 'Bad', metadata: { noteEntity: ne2 } }, rank: 1 }
                    ]
                }
            });

            const result = await RerankerService.Instance.rerankNotes(
                [{ note: ne1, similarity: 0.8 }, { note: ne2, similarity: 0.7 }] as never[],
                'query', makeConfig({ minRelevanceThreshold: 0.5 }), mockUser
            );

            expect(result.success).toBe(true);
            expect(result.notes).toHaveLength(1);
            expect(result.notes[0].similarity).toBe(0.9);
        });

        it('should include runStepID with observability options', async () => {
            const ne = { ID: 'n1', Note: 'note', Type: 'G', Get: vi.fn() };
            mockRunRerank.mockResolvedValue({
                Success: true,
                ExecutionTimeMS: 1,
                Response: {
                    success: true,
                    durationMs: 1,
                    results: [{ id: 'n1', relevanceScore: 0.8, document: { id: 'n1', text: 'note', metadata: { noteEntity: ne } }, rank: 0 }]
                }
            });

            const opts: RerankObservabilityOptions = { agentRunID: 'run-1', parentStepID: 'parent-1', stepNumber: 3 };
            const result = await RerankerService.Instance.rerankNotes(
                [{ note: ne, similarity: 0.5 }] as never[],
                'query', makeConfig(), mockUser, opts
            );

            expect(result.success).toBe(true);
            expect(result.runStepID).toBe('step-123');
        });

        it("hands the step to OnStepCreated before the rerank runs, and puts the rerank's run on it", async () => {
            const match = noteMatch({ ID: 'n1', Note: 'note', Type: 'Context', Get: vi.fn() }, 0.5);
            const rerankRun = { ID: 'pr-rerank-1', TotalCost: 0.004, TokensUsedRollup: 420 };
            mockRunRerank.mockResolvedValue({
                Success: true,
                ExecutionTimeMS: 1,
                PromptRunID: rerankRun.ID,
                PromptRun: rerankRun,
                Response: {
                    success: true,
                    durationMs: 1,
                    results: [{ id: 'n1', relevanceScore: 0.8, document: { id: 'n1', text: 'note', metadata: { noteEntity: match.note } }, rank: 0 }]
                }
            });
            const created: Array<{ ID: string }> = [];
            const onStepCreated = vi.fn((step: { ID: string }) => created.push(step));

            await RerankerService.Instance.rerankNotes(
                [match],
                'query', makeConfig(), mockUser, { agentRunID: 'run-1', OnStepCreated: onStepCreated }
            );

            expect(onStepCreated).toHaveBeenCalledTimes(1);
            expect(onStepCreated.mock.invocationCallOrder[0]).toBeLessThan(mockRunRerank.mock.invocationCallOrder[0]);
            expect(created[0]).toMatchObject({ ID: 'step-123', TargetLogID: rerankRun.ID, PromptRun: rerankRun });
        });

        it("puts the rerank's run on the step when the rerank fails, because a failed rerank still cost money", async () => {
            const match = noteMatch({ ID: 'n1', Note: 'note', Type: 'Context', Get: vi.fn() }, 0.5);
            const rerankRun = { ID: 'pr-rerank-2', TotalCost: 0.004 };
            mockRunRerank.mockResolvedValue({ Success: false, ErrorMessage: 'Decision model is down', ExecutionTimeMS: 1, PromptRunID: rerankRun.ID, PromptRun: rerankRun });
            const created: Array<{ ID: string }> = [];

            await expect(RerankerService.Instance.rerankNotes(
                [match],
                'query', makeConfig(), mockUser, { agentRunID: 'run-1', OnStepCreated: step => created.push(step) }
            )).rejects.toThrow('Decision model is down');

            expect(created[0]).toMatchObject({ Status: 'Failed', TargetLogID: rerankRun.ID, PromptRun: rerankRun });
        });
    });

    describe('clearCache', () => {
        it('should not throw', () => {
            expect(() => RerankerService.Instance.clearCache()).not.toThrow();
        });

        it('should allow new reranker after clearing', async () => {
            mockModels.push({ ID: 'model-1', Name: 'T', IsActive: true, APIName: 'x' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'TD', APIName: 'x' });
            process.env['AI_VENDOR_API_KEY__TD'] = 'k';

            const rA = { Rerank: vi.fn() };
            const rB = { Rerank: vi.fn() };
            mockCreateInstance.mockReturnValueOnce(rA).mockReturnValueOnce(rB);

            const service = RerankerService.Instance;
            expect(await service.getReranker('model-1', mockUser)).toBe(rA);
            service.clearCache();
            expect(await service.getReranker('model-1', mockUser)).toBe(rB);
            delete process.env['AI_VENDOR_API_KEY__TD'];
        });
    });

    describe('RerankExamples', () => {
        const reset = exampleMatch({ ID: 'e1', ExampleInput: 'How do I reset my password?', ExampleOutput: 'Use the reset link.' }, 0.8);
        const invoice = exampleMatch({ ID: 'e2', ExampleInput: 'Where is my invoice?', ExampleOutput: 'Under Billing.' }, 0.7);

        it('returns no examples, and makes no rerank call, when there are none', async () => {
            expect(await RerankerService.Instance.RerankExamples([], 'query', makeConfig(), mockUser)).toEqual([]);
            expect(mockRunRerank).not.toHaveBeenCalled();
        });

        it("reranks each example's input and output with the configured model and prompt, keeping those at or above the threshold", async () => {
            mockRunRerank.mockResolvedValue({
                Success: true,
                ExecutionTimeMS: 1,
                Response: {
                    success: true,
                    durationMs: 1,
                    results: [
                        { id: 'e2', relevanceScore: 0.9, document: { id: 'e2', text: 'invoice' }, rank: 0 },
                        { id: 'e1', relevanceScore: 0.3, document: { id: 'e1', text: 'reset' }, rank: 1 }
                    ]
                }
            });

            const result = await RerankerService.Instance.RerankExamples(
                [reset, invoice], 'Where can I find my invoice?', makeConfig({ rerankPromptID: 'prompt-9', minRelevanceThreshold: 0.5 }), mockUser
            );

            expect(mockRunRerank).toHaveBeenCalledWith({
                query: 'Where can I find my invoice?',
                documents: [
                    { id: 'e1', text: 'Input: How do I reset my password?\nOutput: Use the reset link.', originalScore: 0.8 },
                    { id: 'e2', text: 'Input: Where is my invoice?\nOutput: Under Billing.', originalScore: 0.7 }
                ],
                topK: 2,
                ContextUser: mockUser,
                ModelID: 'model-1',
                ChatPromptID: 'prompt-9',
                AgentRunID: undefined
            });
            expect(result).toEqual([{ example: invoice.example, similarity: 0.9 }]);
        });

        it('throws when reranking fails, so the caller decides whether to fall back', async () => {
            mockRunRerank.mockResolvedValue({ Success: false, ErrorMessage: 'Decision model is down', ExecutionTimeMS: 1 });

            await expect(
                RerankerService.Instance.RerankExamples([reset], 'query', makeConfig({ fallbackOnError: true }), mockUser)
            ).rejects.toThrow('Decision model is down');
        });
    });
});

/** The example fields RerankExamples reads: all a test has to supply. */
type ExampleFields = Pick<MJAIAgentExampleEntity, 'ID' | 'ExampleInput' | 'ExampleOutput'>;

/** A vector search match for an example, through the seam onto the full entity RerankExamples is declared to take. */
function exampleMatch(fields: ExampleFields, similarity: number): ExampleMatchResult {
    return { example: fields as MJAIAgentExampleEntity, similarity };
}

/** The note fields RerankNotes reads: all a test has to supply. */
type NoteFields = Pick<MJAIAgentNoteEntity, 'ID' | 'Note' | 'Type' | 'Get'>;

/** A vector search match for a note, through the seam onto the full entity RerankNotes is declared to take. */
function noteMatch(fields: NoteFields, similarity: number): NoteMatchResult {
    return { note: fields as MJAIAgentNoteEntity, similarity };
}
