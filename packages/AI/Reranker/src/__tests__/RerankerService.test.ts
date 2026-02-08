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

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: (...args: unknown[]) => mockCreateInstance(...args)
            }
        }
    }
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            get Models() { return mockModels; },
            get ModelVendors() { return mockModelVendors; },
            Prompts: []
        }
    }
}));

vi.mock('@memberjunction/ai', () => ({ BaseReranker: class {} }));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIModelEntityExtended: class {} }));
vi.mock('@memberjunction/core-entities', () => ({
    AIAgentNoteEntity: class { ID = ''; Note = ''; Type = ''; Get(_f: string) { return ''; } },
    AIAgentRunStepEntity: class {}
}));

import { RerankerService, RerankObservabilityOptions } from '../RerankerService';
import { RerankerConfiguration, parseRerankerConfiguration } from '../config.types';

const mockUser = { ID: 'user-1', Name: 'Test' } as never;

function makeConfig(overrides?: Partial<RerankerConfiguration>): RerankerConfiguration {
    return { enabled: true, rerankerModelId: 'model-1', retrievalMultiplier: 3, minRelevanceThreshold: 0.5, fallbackOnError: true, ...overrides };
}

describe('RerankerService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateInstance.mockReturnValue(null);
        mockModels.length = 0;
        mockModelVendors.length = 0;
        // Reset singleton
        (RerankerService as Record<string, unknown>)['_instance'] = null;
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

        it('should throw when reranker is not available', async () => {
            const note = { note: { ID: 'n1', Note: 'text', Type: 'G', Get: vi.fn() }, similarity: 0.8 };
            await expect(
                RerankerService.Instance.rerankNotes([note as never], 'query', makeConfig({ rerankerModelId: 'nonexistent' }), mockUser)
            ).rejects.toThrow('Reranker not available');
        });

        it('should throw when Rerank fails', async () => {
            mockModels.push({ ID: 'model-1', Name: 'T', IsActive: true, APIName: 'x' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'TD', APIName: 'x' });
            process.env['AI_VENDOR_API_KEY__TD'] = 'k';
            mockCreateInstance.mockReturnValue({ Rerank: vi.fn().mockResolvedValue({ success: false, errorMessage: 'Err', results: [] }) });

            const note = { note: { ID: 'n1', Note: 'text', Type: 'G', Get: vi.fn() }, similarity: 0.8 };
            await expect(
                RerankerService.Instance.rerankNotes([note as never], 'query', makeConfig(), mockUser)
            ).rejects.toThrow('Err');
            delete process.env['AI_VENDOR_API_KEY__TD'];
        });

        it('should filter results below threshold', async () => {
            mockModels.push({ ID: 'model-1', Name: 'T', IsActive: true, APIName: 'x' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'TD', APIName: 'x' });
            process.env['AI_VENDOR_API_KEY__TD'] = 'k';

            const ne1 = { ID: 'n1', Note: 'Good', Type: 'G', Get: vi.fn() };
            const ne2 = { ID: 'n2', Note: 'Bad', Type: 'G', Get: vi.fn() };
            mockCreateInstance.mockReturnValue({
                Rerank: vi.fn().mockResolvedValue({
                    success: true,
                    results: [
                        { id: 'n1', relevanceScore: 0.9, document: { id: 'n1', text: 'Good', metadata: { noteEntity: ne1 } }, rank: 0 },
                        { id: 'n2', relevanceScore: 0.3, document: { id: 'n2', text: 'Bad', metadata: { noteEntity: ne2 } }, rank: 1 }
                    ]
                })
            });

            const result = await RerankerService.Instance.rerankNotes(
                [{ note: ne1, similarity: 0.8 }, { note: ne2, similarity: 0.7 }] as never[],
                'query', makeConfig({ minRelevanceThreshold: 0.5 }), mockUser
            );

            expect(result.success).toBe(true);
            expect(result.notes).toHaveLength(1);
            expect(result.notes[0].similarity).toBe(0.9);
            delete process.env['AI_VENDOR_API_KEY__TD'];
        });

        it('should include runStepID with observability options', async () => {
            mockModels.push({ ID: 'model-1', Name: 'T', IsActive: true, APIName: 'x' });
            mockModelVendors.push({ ModelID: 'model-1', Status: 'Active', Priority: 1, DriverClass: 'TD', APIName: 'x' });
            process.env['AI_VENDOR_API_KEY__TD'] = 'k';

            const ne = { ID: 'n1', Note: 'note', Type: 'G', Get: vi.fn() };
            mockCreateInstance.mockReturnValue({
                Rerank: vi.fn().mockResolvedValue({
                    success: true,
                    results: [{ id: 'n1', relevanceScore: 0.8, document: { id: 'n1', text: 'note', metadata: { noteEntity: ne } }, rank: 0 }]
                })
            });

            const opts: RerankObservabilityOptions = { agentRunID: 'run-1', parentStepID: 'parent-1', stepNumber: 3 };
            const result = await RerankerService.Instance.rerankNotes(
                [{ note: ne, similarity: 0.5 }] as never[],
                'query', makeConfig(), mockUser, opts
            );

            expect(result.success).toBe(true);
            expect(result.runStepID).toBe('step-123');
            delete process.env['AI_VENDOR_API_KEY__TD'];
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
});
