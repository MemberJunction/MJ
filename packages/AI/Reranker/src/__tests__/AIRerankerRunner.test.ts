/**
 * Unit tests for AIRerankerRunner, and for RerankerService.RerankNotes going through it.
 *
 * The runner, its base (`BaseModelRunner` from @memberjunction/ai-prompts) and `BaseReranker` are
 * real. Only package boundaries are mocked: the AIEngine catalog, API-key lookup, the ClassFactory's
 * driver resolution, and the provider that hands out `MJ: AI Prompt Runs` rows. Follows
 * AIDecisionRunner.test.ts in @memberjunction/ai-prompts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { Metadata, UserInfo } from '@memberjunction/core';
import { BaseReranker, ModelUsage } from '@memberjunction/ai';
import type { RerankParams, RerankResponse, RerankResult } from '@memberjunction/ai';
import type { AIPromptRunResult } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIRerankerRunner } from '../AIRerankerRunner';
import type { AIRerankParams } from '../rerank-runner.types';
import { RerankerService } from '../RerankerService';
import type { RerankerConfiguration } from '../config.types';

// ---------------------------------------------------------------------------
// Catalog constants
// ---------------------------------------------------------------------------
const RERANKER_TYPE_ID = '86E771DA-DC64-4E29-94B3-77403A0994C0';
const NATIVE_DRIVER = 'TestReranker';
const LLM_DRIVER = 'LLMReranker';
const PRIMARY_MODEL_ID = 'rerank-primary';
const SECONDARY_MODEL_ID = 'rerank-secondary';
const LLM_MODEL_ID = 'rerank-llm';
const LEGACY_LLM_MODEL_ID = 'rerank-legacy-llm';
const DEFAULT_PROMPT_ID = 'prompt-default-rerank';
const CHAT_PROMPT_ID = 'prompt-rerank-documents';

// ---------------------------------------------------------------------------
// Hoisted catalog state and AIEngine mock
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
    const norm = (s: unknown): string => (s == null ? '' : String(s).trim().toLowerCase());
    const inferenceTypeId = 'vtd-inference-provider';

    const state = {
        vendors: [] as Array<{ ID: string; Name: string }>,
        modelTypes: [] as Array<{ ID: string; Name: string }>,
        models: [] as Array<Record<string, unknown>>,
        promptModels: [] as Array<Record<string, unknown>>,
        prompts: [] as Array<Record<string, unknown>>,
        keyedDrivers: new Set<string>(),
    };

    const engine = {
        get VendorTypeDefinitions() { return [{ ID: inferenceTypeId, Name: 'Inference Provider' }]; },
        get Vendors() { return state.vendors; },
        get ModelTypes() { return state.modelTypes; },
        get Configurations() { return []; },
        get Models() { return state.models; },
        get ModelVendors() { return state.models.flatMap(m => m.ModelVendors as Array<Record<string, unknown>>); },
        get PromptModels() { return state.promptModels; },
        get Prompts() { return state.prompts; },
        IsInferenceProvider(mv: { TypeID?: string }) { return norm(mv?.TypeID) === norm(inferenceTypeId); },
        get ModelsByID() { return new Map(state.models.map(m => [norm(m.ID), m])); },
        get VendorsByID() { return new Map(state.vendors.map(v => [norm(v.ID), v])); },
        get ModelTypesByID() { return new Map(state.modelTypes.map(t => [norm(t.ID), t])); },
        get ModelVendorsByModelID() {
            return new Map(state.models.map(m => [norm(m.ID), m.ModelVendors as Array<Record<string, unknown>>]));
        },
        GetConfigurationChain() { return []; },
        GetEffectiveModelConfiguration() { return undefined; },
        HasCredentialBindings() { return false; },
        GetCredentialBindingsForTarget() { return []; },
    };

    return {
        state,
        engine,
        inferenceTypeId,
        getApiKey: (driverClass: string): string => (state.keyedDrivers.has(driverClass) ? 'test-api-key' : ''),
    };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, AIEngine: { Instance: h.engine } };
});

vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, GetAIAPIKey: (driverClass: string) => h.getApiKey(driverClass) };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogStatus: vi.fn(), LogError: vi.fn() };
});

// ---------------------------------------------------------------------------
// A controllable driver
// ---------------------------------------------------------------------------
/**
 * Scores documents in the order given (0.9, 0.4, ...), or fails for the model names listed. When
 * `Usage` is set, every response reports it, as a driver that knows its cost does.
 */
class MockReranker extends BaseReranker {
    public static Calls: string[] = [];
    public static FailingModels = new Set<string>();
    public static Usage: ModelUsage | undefined;

    public override async Rerank(params: RerankParams): Promise<RerankResponse> {
        const response = await super.Rerank(params);
        if (MockReranker.Usage) {
            response.Usage = MockReranker.Usage;
        }
        return response;
    }

    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        MockReranker.Calls.push(this.ModelName);
        if (MockReranker.FailingModels.has(this.ModelName)) {
            throw new Error(`${this.ModelName} is unavailable`);
        }
        const scores = [0.9, 0.4];
        return params.documents.map((document, index) => ({
            id: document.id,
            relevanceScore: scores[index] ?? 0.1,
            document,
            rank: index,
        }));
    }
}

// ---------------------------------------------------------------------------
// Fake prompt-run rows and the provider that hands them out
// ---------------------------------------------------------------------------
let promptRunSeq = 0;

/** Stands in for an `MJ: AI Prompt Runs` entity: keeps what the runner sets, and saves nothing. */
class FakePromptRun {
    public ID = '';
    public Success?: boolean;
    public Status?: string;
    public ModelID?: string;
    public ParentID?: string | null;
    public Messages?: string;
    public Result?: string;
    public ErrorMessage?: string;
    public TokensPrompt?: number | null;
    public Cost?: number | null;
    public DescendantCost?: number | null;
    public TotalCost?: number | null;
    public CostCurrency?: string | null;
    public LatestResult: { CompleteMessage: string } | null = null;
    [key: string]: unknown;

    public NewRecord(): boolean {
        this.ID = `pr-${++promptRunSeq}`;
        return true;
    }

    public async Save(): Promise<boolean> {
        return true;
    }
}

let promptRuns: FakePromptRun[] = [];
const fakeProvider = {
    GetEntityObject: async (): Promise<FakePromptRun> => {
        const run = new FakePromptRun();
        promptRuns.push(run);
        return run;
    },
};

/** The runner with key resolution reduced to the test's key table, so no credential store is needed. */
class TestRerankerRunner extends AIRerankerRunner {
    protected override async ResolveCredentialForExecution(driverClass: string): Promise<string> {
        return h.getApiKey(driverClass);
    }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
function rerankModel(id: string, name: string, vendorId: string, driverClass: string, apiName: string, modelAPIName = apiName): Record<string, unknown> {
    return {
        ID: id,
        Name: name,
        AIModelTypeID: RERANKER_TYPE_ID,
        IsActive: true,
        APIName: modelAPIName,
        DriverClass: driverClass,
        PowerRank: 50,
        ModelVendors: [{
            ID: `mv-${id}`,
            ModelID: id,
            VendorID: vendorId,
            Vendor: vendorId,
            Priority: 1,
            Status: 'Active',
            DriverClass: driverClass,
            APIName: apiName,
            TypeID: h.inferenceTypeId,
        }],
    };
}

function setupCatalog(): void {
    h.state.vendors = [
        { ID: 'vendor-cohere', Name: 'Cohere' },
        { ID: 'vendor-backup', Name: 'Backup' },
        { ID: 'vendor-mj', Name: 'MemberJunction' },
    ];
    h.state.modelTypes = [{ ID: RERANKER_TYPE_ID, Name: 'Reranker' }, { ID: 'type-llm', Name: 'LLM' }];
    h.state.models = [
        rerankModel(PRIMARY_MODEL_ID, 'Primary Reranker', 'vendor-cohere', NATIVE_DRIVER, 'primary-v1'),
        rerankModel(SECONDARY_MODEL_ID, 'Secondary Reranker', 'vendor-backup', NATIVE_DRIVER, 'secondary-v1'),
        // The vendor row's APIName names the chat prompt; the model's own APIName is distinct.
        rerankModel(LLM_MODEL_ID, 'LLM Reranker Model', 'vendor-mj', LLM_DRIVER, 'Rerank Documents', 'llm-rerank-model'),
        // The seeded 'LLM Reranker': no model-vendor row, no driver class, no API name.
        { ID: LEGACY_LLM_MODEL_ID, Name: 'LLM Reranker', AIModelTypeID: RERANKER_TYPE_ID, IsActive: true, APIName: null, DriverClass: null, PowerRank: 40, ModelVendors: [] },
    ];
    h.state.promptModels = [
        { ID: 'pm-1', PromptID: DEFAULT_PROMPT_ID, ModelID: PRIMARY_MODEL_ID, VendorID: 'vendor-cohere', Priority: 20, Status: 'Active', ConfigurationID: null },
        { ID: 'pm-2', PromptID: DEFAULT_PROMPT_ID, ModelID: SECONDARY_MODEL_ID, VendorID: 'vendor-backup', Priority: 10, Status: 'Active', ConfigurationID: null },
    ];
    h.state.prompts = [
        {
            ID: DEFAULT_PROMPT_ID,
            Name: 'Default Rerank',
            Status: 'Active',
            AIModelTypeID: RERANKER_TYPE_ID,
            SelectionStrategy: 'Specific',
            RequireSpecificModels: true,
            FailoverStrategy: 'NextBestModel',
            MaxRetries: 0,
        },
        { ID: CHAT_PROMPT_ID, Name: 'Rerank Documents', Status: 'Active' },
    ];
    h.state.keyedDrivers = new Set([NATIVE_DRIVER]);
}

/** Sets a field on the Default Rerank prompt. */
function setDefaultPrompt(field: string, value: unknown): void {
    const prompt = h.state.prompts.find(p => p.ID === DEFAULT_PROMPT_ID);
    if (prompt) {
        prompt[field] = value;
    }
}

const contextUser = new UserInfo(undefined, { ID: 'user-1', Name: 'Test User' });

function rerankParams(overrides: Partial<AIRerankParams> = {}): AIRerankParams {
    return {
        query: 'How does the member like to be contacted?',
        documents: [
            { id: 'doc-1', text: 'Prefers email over phone' },
            { id: 'doc-2', text: 'Lives in Ohio' },
        ],
        ContextUser: contextUser,
        ...overrides,
    };
}

function newRunner(): TestRerankerRunner {
    const runner = new TestRerankerRunner();
    runner.Provider = fakeProvider as never;
    return runner;
}

/** Resolves the registered test drivers; any other driver class is unregistered. */
function stubDriverFactory(): void {
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'TryCreateInstance').mockImplementation(
        (_base: unknown, key: string | null = null, ...args: unknown[]) => {
            if (key !== NATIVE_DRIVER && key !== LLM_DRIVER) {
                return { Resolved: false, Instance: null } as never;
            }
            return { Resolved: true, Instance: new MockReranker(String(args[0] ?? ''), String(args[1] ?? '')) } as never;
        }
    );
}

beforeEach(() => {
    setupCatalog();
    promptRuns = [];
    MockReranker.Calls = [];
    MockReranker.FailingModels = new Set();
    MockReranker.Usage = undefined;
    stubDriverFactory();
    // BaseReranker logs a driver's exception to console.error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// AIRerankerRunner
// ---------------------------------------------------------------------------
describe('AIRerankerRunner', () => {
    it('reranks on a native driver, writes a run row, and names the driver class', async () => {
        const runner = newRunner();

        const result = await runner.RunRerank(rerankParams());
        await runner.WaitForPendingPromptRunSaves();

        expect(result.Success).toBe(true);
        expect(result.Response?.results.map(r => r.id)).toEqual(['doc-1', 'doc-2']);
        expect(result.ModelID).toBe(PRIMARY_MODEL_ID);
        expect(result.ModelName).toBe('Primary Reranker');
        expect(result.DriverClass).toBe(NATIVE_DRIVER);
        expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).toHaveBeenCalledWith(
            BaseReranker, NATIVE_DRIVER, 'test-api-key', 'primary-v1'
        );

        expect(promptRuns).toHaveLength(1);
        const row = promptRuns[0];
        expect(result.PromptRunID).toBe(row.ID);
        expect(row.Success).toBe(true);
        expect(row.Status).toBe('Completed');
        // Result holds the ranked IDs and scores, and Messages the query and document count; neither holds document text.
        expect(JSON.parse(row.Result ?? '')).toEqual([{ ID: 'doc-1', Score: 0.9 }, { ID: 'doc-2', Score: 0.4 }]);
        expect(JSON.parse(row.Messages ?? '')).toEqual({ Query: 'How does the member like to be contacted?', DocumentCount: 2 });
        expect(`${row.Result}${row.Messages}`).not.toContain('Prefers email');
        // No driver reports usage, so no cost or tokens are invented.
        expect(row.Cost ?? null).toBeNull();
        expect(row.TokensPrompt ?? null).toBeNull();
    });

    it('builds LLMReranker with the ID of the chat prompt its model-vendor APIName names, and no key', async () => {
        h.state.keyedDrivers.clear(); // LLMReranker needs no key
        const runner = newRunner();

        const result = await runner.RunRerank(rerankParams({ ModelID: LLM_MODEL_ID }));

        expect(result.Success).toBe(true);
        expect(result.DriverClass).toBe(LLM_DRIVER);
        expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).toHaveBeenCalledWith(
            BaseReranker, LLM_DRIVER, '', 'llm-rerank-model', CHAT_PROMPT_ID, contextUser
        );
    });

    it("fails clearly when LLMReranker's chat prompt does not exist", async () => {
        h.state.prompts = h.state.prompts.filter(p => p.ID !== CHAT_PROMPT_ID);
        setDefaultPrompt('FailoverStrategy', 'None');

        const result = await newRunner().RunRerank(rerankParams({ ModelID: LLM_MODEL_ID }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe("LLMReranker's chat prompt 'Rerank Documents' was not found");
    });

    it('pins the seeded LLM Reranker, which has no vendor row, and runs the chat prompt the caller names', async () => {
        const result = await newRunner().RunRerank(rerankParams({ ModelID: LEGACY_LLM_MODEL_ID, ChatPromptID: 'custom-chat-prompt' }));

        expect(result.Success).toBe(true);
        expect(result.ModelID).toBe(LEGACY_LLM_MODEL_ID);
        expect(result.DriverClass).toBe(LLM_DRIVER);
        expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).toHaveBeenCalledWith(
            BaseReranker, LLM_DRIVER, '', '', 'custom-chat-prompt', contextUser
        );
    });

    it('runs only the model pinned by ModelID', async () => {
        const result = await newRunner().RunRerank(rerankParams({ ModelID: SECONDARY_MODEL_ID }));

        expect(result.Success).toBe(true);
        expect(MockReranker.Calls).toEqual(['secondary-v1']);
        expect(result.ModelID).toBe(SECONDARY_MODEL_ID);
    });

    it("fails over after a 'Retriable' failure, and the result and row name the model that answered", async () => {
        MockReranker.FailingModels.add('primary-v1');
        const runner = newRunner();

        const result = await runner.RunRerank(rerankParams());
        await runner.WaitForPendingPromptRunSaves();

        expect(MockReranker.Calls).toEqual(['primary-v1', 'secondary-v1']);
        expect(result.Success).toBe(true);
        expect(result.ModelID).toBe(SECONDARY_MODEL_ID);
        expect(result.ModelName).toBe('Secondary Reranker');
        expect(result.DriverClass).toBe(NATIVE_DRIVER);
        expect(promptRuns[0].ModelID).toBe(SECONDARY_MODEL_ID);
    });

    it('fails over past an unregistered driver class', async () => {
        const primary = h.state.models.find(m => m.ID === PRIMARY_MODEL_ID);
        const primaryVendors = primary?.ModelVendors as Array<Record<string, unknown>>;
        primaryVendors[0].DriverClass = 'UnregisteredReranker';
        h.state.keyedDrivers.add('UnregisteredReranker');

        const result = await newRunner().RunRerank(rerankParams());

        expect(result.Success).toBe(true);
        expect(result.ModelID).toBe(SECONDARY_MODEL_ID);
    });

    it('reports an unregistered driver class as a clear failure when there is nothing to fail over to', async () => {
        setDefaultPrompt('FailoverStrategy', 'None');
        const primary = h.state.models.find(m => m.ID === PRIMARY_MODEL_ID);
        const primaryVendors = primary?.ModelVendors as Array<Record<string, unknown>>;
        primaryVendors[0].DriverClass = 'UnregisteredReranker';
        h.state.keyedDrivers.add('UnregisteredReranker');

        const result = await newRunner().RunRerank(rerankParams());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe("No reranker driver is registered for driver class 'UnregisteredReranker'");
        expect(result.DriverClass).toBe('UnregisteredReranker');
    });

    it('returns a clear Success: false when no candidate has credentials, without writing a row', async () => {
        h.state.keyedDrivers.clear();

        const result = await newRunner().RunRerank(rerankParams());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/^No Reranker model has credentials available for prompt 'Default Rerank'/);
        expect(result.PromptRunID).toBeUndefined();
        expect(promptRuns).toHaveLength(0);
    });

    it('finalizes the row as failed when an exception follows its creation', async () => {
        setDefaultPrompt('FailoverStrategy', 'None');
        vi.mocked(MJGlobal.Instance.ClassFactory.TryCreateInstance).mockImplementation(() => {
            throw new Error('factory exploded');
        });
        const runner = newRunner();

        const result = await runner.RunRerank(rerankParams());
        await runner.WaitForPendingPromptRunSaves();

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe('factory exploded');
        expect(result.PromptRunID).toBe(promptRuns[0].ID);
        expect(promptRuns[0].Success).toBe(false);
        expect(promptRuns[0].Status).toBe('Failed');
        expect(promptRuns[0].ErrorMessage).toBe('factory exploded');
    });

    it('links the run to its parent run and records the agent run', async () => {
        const runner = newRunner();

        await runner.RunRerank(rerankParams({ ParentRunID: 'parent-run-1', AgentRunID: 'agent-run-1' }));
        await runner.WaitForPendingPromptRunSaves();

        expect(promptRuns[0].ParentID).toBe('parent-run-1');
        expect(JSON.parse(promptRuns[0].Messages ?? '').AgentRunID).toBe('agent-run-1');
    });

    it('rejects a request with no query, without throwing', async () => {
        const result = await newRunner().RunRerank(rerankParams({ query: '  ' }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe('A query is required (params.query)');
        expect(promptRuns).toHaveLength(0);
    });

    it('rejects a pinned model of another type', async () => {
        h.state.models.push({ ...rerankModel('chat-model', 'Chat Model', 'vendor-cohere', 'TestLLM', 'chat-v1'), AIModelTypeID: 'type-llm' });

        const result = await newRunner().RunRerank(rerankParams({ ModelID: 'chat-model' }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/is type "LLM", but this runner requires "Reranker"/);
    });

    describe("a rerank answered through a child run carries that run's cost", () => {
        it("an LLMReranker built by the runner runs its chat prompt as a child of the rerank's run", async () => {
            // The real ClassFactory, so the runner builds a real LLMReranker.
            vi.mocked(MJGlobal.Instance.ClassFactory.TryCreateInstance).mockRestore();
            const executePrompt = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockResolvedValue(
                chatRunResult({
                    success: true,
                    result: [{ index: 1, score: 0.8 }, { index: 0, score: 0.3 }],
                    promptTokens: 300,
                    completionTokens: 20,
                    promptRun: asPromptRun({ Cost: 0.0007, DescendantCost: null, TotalCost: 0.0007, CostCurrency: 'USD' }),
                })
            );
            const runner = newRunner();

            const result = await runner.RunRerank(rerankParams({ ModelID: LLM_MODEL_ID }));
            await runner.WaitForPendingPromptRunSaves();

            expect(result.Success).toBe(true);
            expect(result.DriverClass).toBe(LLM_DRIVER);
            expect(result.Response?.results.map(r => r.id)).toEqual(['doc-2', 'doc-1']);
            expect(executePrompt).toHaveBeenCalledTimes(1);
            expect(executePrompt.mock.calls[0][0].parentPromptRunId).toBe(promptRuns[0].ID);
            // The chat run's cost is the rerank run's descendant cost, not its own.
            expect(promptRuns[0].DescendantCost).toBe(0.0007);
            expect(promptRuns[0].TotalCost).toBe(0.0007);
            expect(promptRuns[0].Cost).toBeUndefined();
            expect(result.Response?.Usage?.cost).toBe(0.0007);
        });

        it('for LLMReranker the runner records DescendantCost and TotalCost, and not Cost', async () => {
            MockReranker.Usage = new ModelUsage(120, 45, 0.002, 'USD');
            const runner = newRunner();

            const result = await runner.RunRerank(rerankParams({ ModelID: LLM_MODEL_ID }));
            await runner.WaitForPendingPromptRunSaves();

            expect(result.DriverClass).toBe(LLM_DRIVER);
            expect(promptRuns[0].DescendantCost).toBe(0.002);
            expect(promptRuns[0].TotalCost).toBe(0.002);
            expect(promptRuns[0].Cost).toBeUndefined();
            expect(promptRuns[0].CostCurrency).toBe('USD');
            // The tokens are the chat run's, recorded on that run.
            expect(promptRuns[0].TokensPrompt).toBeUndefined();
        });

        it("for LLMReranker the runner records a failed call's cost, because the call still cost money", async () => {
            setDefaultPrompt('FailoverStrategy', 'None');
            MockReranker.FailingModels.add('llm-rerank-model');
            MockReranker.Usage = new ModelUsage(120, 45, 0.002, 'USD');
            const runner = newRunner();

            const result = await runner.RunRerank(rerankParams({ ModelID: LLM_MODEL_ID }));
            await runner.WaitForPendingPromptRunSaves();

            expect(result.Success).toBe(false);
            expect(promptRuns[0].Status).toBe('Failed');
            expect(promptRuns[0].DescendantCost).toBe(0.002);
            expect(promptRuns[0].TotalCost).toBe(0.002);
            expect(promptRuns[0].Cost).toBeUndefined();
        });

        it('for a driver that calls its model directly the runner records Cost', async () => {
            MockReranker.Usage = new ModelUsage(0, 0, 0.002, 'USD');
            const runner = newRunner();

            const result = await runner.RunRerank(rerankParams());
            await runner.WaitForPendingPromptRunSaves();

            expect(result.DriverClass).toBe(NATIVE_DRIVER);
            expect(promptRuns[0].Cost).toBe(0.002);
            expect(promptRuns[0].TotalCost).toBe(0.002);
            expect(promptRuns[0].DescendantCost).toBeUndefined();
            expect(promptRuns[0].CostCurrency).toBe('USD');
        });

        it('with no cost the runner records neither Cost nor DescendantCost', async () => {
            MockReranker.Usage = new ModelUsage(120, 45);
            const runner = newRunner();

            const result = await runner.RunRerank(rerankParams({ ModelID: LLM_MODEL_ID }));
            await runner.WaitForPendingPromptRunSaves();

            expect(result.Success).toBe(true);
            expect(promptRuns[0].Cost).toBeUndefined();
            expect(promptRuns[0].DescendantCost).toBeUndefined();
            expect(promptRuns[0].TotalCost).toBeUndefined();
            expect(promptRuns[0].CostCurrency).toBeUndefined();
        });

        it("the rerank run's INSERT lands before an LLMReranker driver runs, because its chat run names it as parent", async () => {
            const runner = newRunner();
            const waitForSaves = vi.spyOn(runner, 'WaitForPendingPromptRunSaves');
            const rerank = vi.spyOn(MockReranker.prototype, 'Rerank');

            const result = await runner.RunRerank(rerankParams({ ModelID: LLM_MODEL_ID }));

            expect(result.DriverClass).toBe(LLM_DRIVER);
            expect(waitForSaves).toHaveBeenCalledTimes(1);
            expect(rerank).toHaveBeenCalledTimes(1);
            expect(waitForSaves.mock.invocationCallOrder[0]).toBeLessThan(rerank.mock.invocationCallOrder[0]);
        });

        it('a driver that calls its model directly does not wait for the run to be saved', async () => {
            const runner = newRunner();
            const waitForSaves = vi.spyOn(runner, 'WaitForPendingPromptRunSaves');

            const result = await runner.RunRerank(rerankParams());

            expect(result.DriverClass).toBe(NATIVE_DRIVER);
            expect(waitForSaves).not.toHaveBeenCalled();
        });
    });
});

// ---------------------------------------------------------------------------
// RerankerService.RerankNotes through the runner
// ---------------------------------------------------------------------------
describe('RerankerService.RerankNotes through the runner', () => {
    const notes = [
        { note: { ID: 'note-1', Note: 'Prefers email over phone', Type: 'Preference' }, similarity: 0.7 },
        { note: { ID: 'note-2', Note: 'Lives in Ohio', Type: 'Context' }, similarity: 0.6 },
    ] as never[];

    function makeConfig(overrides: Partial<RerankerConfiguration> = {}): RerankerConfiguration {
        return {
            enabled: true,
            rerankerModelId: SECONDARY_MODEL_ID,
            retrievalMultiplier: 3,
            minRelevanceThreshold: 0.5,
            fallbackOnError: true,
            ...overrides,
        };
    }

    it('passes the configured model, chat prompt and agent run to the runner, and links the step to the run row', async () => {
        const step: Record<string, unknown> = { ID: 'step-1', TargetLogID: null, LatestResult: null, Save: async () => true };
        vi.spyOn(Metadata.prototype, 'GetEntityObject').mockResolvedValue(step as never);
        const runRerank = vi.spyOn(AIRerankerRunner.prototype, 'RunRerank').mockResolvedValue({
            Success: true,
            PromptRunID: 'pr-rerank-7',
            Response: {
                success: true,
                durationMs: 1,
                results: [{ id: 'note-2', relevanceScore: 0.8, rank: 0, document: { id: 'note-2', text: 'Lives in Ohio', metadata: { noteEntity: notes[1] } } }],
            },
            ExecutionTimeMS: 1,
        });

        const result = await RerankerService.Instance.RerankNotes(
            notes, 'Where does the member live?', makeConfig({ rerankPromptID: 'custom-chat-prompt' }), contextUser, { agentRunID: 'agent-run-9' }
        );

        expect(runRerank).toHaveBeenCalledWith(expect.objectContaining({
            query: 'Where does the member live?',
            ModelID: SECONDARY_MODEL_ID,
            ChatPromptID: 'custom-chat-prompt',
            AgentRunID: 'agent-run-9',
            ContextUser: contextUser,
        }));
        expect(result.success).toBe(true);
        expect(result.notes).toHaveLength(1);
        expect(result.runStepID).toBe('step-1');
        expect(step.TargetLogID).toBe('pr-rerank-7');
    });

    it('throws when the runner fails, even with fallbackOnError, because the caller owns the fallback', async () => {
        // A real run: the pinned model does not exist, so the runner fails before any model call.
        await expect(RerankerService.Instance.RerankNotes(
            notes, 'Where does the member live?', makeConfig({ rerankerModelId: 'no-such-model' }), contextUser
        )).rejects.toThrow();
    });

    it('throws when the runner fails and fallbackOnError is false', async () => {
        vi.spyOn(AIRerankerRunner.prototype, 'RunRerank').mockResolvedValue({
            Success: false,
            ErrorMessage: 'Cohere is down',
            ExecutionTimeMS: 1,
        });

        await expect(RerankerService.Instance.RerankNotes(
            notes, 'Where does the member live?', makeConfig({ fallbackOnError: false }), contextUser
        )).rejects.toThrow('Cohere is down');
    });
});

/** The chat prompt's result fields an LLMReranker reads. */
type ChatRunResultFields = Pick<AIPromptRunResult, 'success' | 'result' | 'promptTokens' | 'completionTokens' | 'promptRun'>;

/** The seam onto the full `AIPromptRunResult` that `AIPromptRunner.ExecutePrompt` returns. */
function chatRunResult(fields: ChatRunResultFields): AIPromptRunResult {
    return fields as AIPromptRunResult;
}

/** The prompt-run entity an `AIPromptRunResult` carries. */
type ChatPromptRun = NonNullable<AIPromptRunResult['promptRun']>;

/** The seam onto the full prompt-run entity, from the cost columns LLMReranker reads. */
function asPromptRun(run: Pick<ChatPromptRun, 'Cost' | 'DescendantCost' | 'TotalCost' | 'CostCurrency'>): ChatPromptRun {
    return run as ChatPromptRun;
}
