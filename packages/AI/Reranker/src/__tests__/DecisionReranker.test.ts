/**
 * Unit tests for DecisionReranker, and for the prompt-backed branch it shares with LLMReranker in
 * RerankerService.GetReranker and AIRerankerRunner.
 *
 * DecisionReranker, BaseReranker, the ClassFactory, AIRerankerRunner and the decision runner's
 * candidate building (`BaseModelRunner` from @memberjunction/ai-prompts) are real. Only package
 * boundaries are mocked: the AIEngine catalog, API-key lookup, core logging, the decision call itself
 * (`AIDecisionRunner.ExecuteDecision`), and the provider that hands out `MJ: AI Prompt Runs` rows.
 * Follows AIRerankerRunner.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseReranker } from '@memberjunction/ai';
import type { AIModelConfiguration, DecisionAnswer, RerankDocument, RerankResponse } from '@memberjunction/ai';
import { AIDecisionRunner } from '@memberjunction/ai-prompts';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { DecisionReranker, DEFAULT_DECISION_RERANK_DOCUMENTS_PER_CALL, DEFAULT_DECISION_RERANK_TIMEOUT_MS } from '../DecisionReranker';
import { LLMReranker } from '../LLMReranker';
import { AIRerankerRunner } from '../AIRerankerRunner';
import { RerankerService } from '../RerankerService';

// ---------------------------------------------------------------------------
// Catalog constants
// ---------------------------------------------------------------------------
const RERANKER_TYPE_ID = 'type-reranker';
const DECISION_TYPE_ID = 'type-decision';
const PRIMARY_DECISION_MODEL_ID = 'model-decision-primary';
const FALLBACK_DECISION_MODEL_ID = 'model-decision-fallback';
const DECISION_RERANKER_MODEL_ID = 'model-decision-reranker';
const LEGACY_LLM_RERANKER_MODEL_ID = 'model-llm-reranker';
const DEFAULT_DECISION_PROMPT_ID = 'prompt-default-decision';
const CUSTOM_DECISION_PROMPT_ID = 'prompt-custom-decision';
const DEFAULT_RERANK_PROMPT_ID = 'prompt-default-rerank';
const STATEMENT = 'This note bears on the request: ';

// ---------------------------------------------------------------------------
// Catalog row shapes the fake engine hands out
// ---------------------------------------------------------------------------
interface FakeModelVendor {
    ID: string;
    ModelID: string;
    VendorID: string;
    Vendor: string;
    Priority: number;
    Status: string;
    DriverClass: string;
    APIName: string;
    TypeID: string;
    ModelConfiguration?: AIModelConfiguration;
}

interface FakeModel {
    ID: string;
    Name: string;
    AIModelTypeID: string;
    IsActive: boolean;
    APIName: string | null;
    DriverClass: string | null;
    PowerRank: number;
    ModelVendors: FakeModelVendor[];
    ModelConfiguration?: AIModelConfiguration;
}

interface FakePromptModel {
    ID: string;
    PromptID: string;
    ModelID: string;
    VendorID: string;
    Priority: number;
    Status: string;
    ConfigurationID: string | null;
}

interface FakePrompt {
    ID: string;
    Name: string;
    Status: string;
    AIModelTypeID: string;
    SelectionStrategy: string;
    RequireSpecificModels: boolean;
    FailoverStrategy: string;
    MaxRetries: number;
}

// ---------------------------------------------------------------------------
// Hoisted catalog state and AIEngine mock
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
    const norm = (s: unknown): string => (s == null ? '' : String(s).trim().toLowerCase());
    const inferenceTypeId = 'vtd-inference-provider';

    const state = {
        vendors: [] as Array<{ ID: string; Name: string }>,
        modelTypes: [] as Array<{ ID: string; Name: string }>,
        models: [] as FakeModel[],
        promptModels: [] as FakePromptModel[],
        prompts: [] as FakePrompt[],
    };

    const engine = {
        get VendorTypeDefinitions() { return [{ ID: inferenceTypeId, Name: 'Inference Provider' }]; },
        get Vendors() { return state.vendors; },
        get ModelTypes() { return state.modelTypes; },
        get Configurations() { return []; },
        get Models() { return state.models; },
        get ModelVendors() { return state.models.flatMap(m => m.ModelVendors); },
        get PromptModels() { return state.promptModels; },
        get Prompts() { return state.prompts; },
        IsInferenceProvider(mv: { TypeID?: string }) { return norm(mv?.TypeID) === norm(inferenceTypeId); },
        get ModelsByID() { return new Map(state.models.map(m => [norm(m.ID), m])); },
        get VendorsByID() { return new Map(state.vendors.map(v => [norm(v.ID), v])); },
        get ModelTypesByID() { return new Map(state.modelTypes.map(t => [norm(t.ID), t])); },
        get ModelVendorsByModelID() { return new Map(state.models.map(m => [norm(m.ID), m.ModelVendors])); },
        GetConfigurationChain() { return []; },
        /** Merges the model's and the model-vendor row's `Decision` section, as the real cascade does. */
        GetEffectiveModelConfiguration(modelID: string, modelVendorID?: string): AIModelConfiguration | null {
            const model = state.models.find(m => norm(m.ID) === norm(modelID));
            const vendor = model?.ModelVendors.find(mv => norm(mv.ID) === norm(modelVendorID));
            const decision = { ...model?.ModelConfiguration?.Decision, ...vendor?.ModelConfiguration?.Decision };
            return Object.keys(decision).length > 0 ? { Decision: decision } : null;
        },
        HasCredentialBindings() { return false; },
        GetCredentialBindingsForTarget() { return []; },
    };

    return { state, engine, inferenceTypeId };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, AIEngine: { Instance: h.engine } };
});

// No driver has an API key: prompt-backed rerankers must not need one.
vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, GetAIAPIKey: () => '' };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogStatus: vi.fn(), LogError: vi.fn() };
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
function catalogModel(id: string, name: string, typeId: string, vendorId: string, vendorName: string, driverClass: string, vendorAPIName: string): FakeModel {
    return {
        ID: id,
        Name: name,
        AIModelTypeID: typeId,
        IsActive: true,
        APIName: null,
        DriverClass: null,
        PowerRank: 50,
        ModelVendors: [{
            ID: `mv-${id}`,
            ModelID: id,
            VendorID: vendorId,
            Vendor: vendorName,
            Priority: 1,
            Status: 'Active',
            DriverClass: driverClass,
            APIName: vendorAPIName,
            TypeID: h.inferenceTypeId,
        }],
    };
}

function catalogPrompt(id: string, name: string, typeId: string): FakePrompt {
    return {
        ID: id,
        Name: name,
        Status: 'Active',
        AIModelTypeID: typeId,
        SelectionStrategy: 'Specific',
        RequireSpecificModels: true,
        FailoverStrategy: 'None',
        MaxRetries: 0,
    };
}

function binding(id: string, promptId: string, modelId: string, vendorId: string, priority: number): FakePromptModel {
    return { ID: id, PromptID: promptId, ModelID: modelId, VendorID: vendorId, Priority: priority, Status: 'Active', ConfigurationID: null };
}

function setupCatalog(): void {
    h.state.vendors = [{ ID: 'vendor-openrouter', Name: 'OpenRouter' }, { ID: 'vendor-mj', Name: 'MemberJunction' }];
    h.state.modelTypes = [{ ID: RERANKER_TYPE_ID, Name: 'Reranker' }, { ID: DECISION_TYPE_ID, Name: 'Decision' }];
    h.state.models = [
        catalogModel(PRIMARY_DECISION_MODEL_ID, 'Primary Decision', DECISION_TYPE_ID, 'vendor-openrouter', 'OpenRouter', 'TestDecision', 'primary-decision-v1'),
        catalogModel(FALLBACK_DECISION_MODEL_ID, 'Fallback Decision', DECISION_TYPE_ID, 'vendor-mj', 'MemberJunction', 'LLMDecision', 'LLM Decision'),
        // The model-vendor row's APIName names the decision prompt, as in metadata/ai-models.
        catalogModel(DECISION_RERANKER_MODEL_ID, 'Decision Reranker', RERANKER_TYPE_ID, 'vendor-mj', 'MemberJunction', 'DecisionReranker', 'Default Decision'),
        // The seeded 'LLM Reranker': no model-vendor row, no driver class, no API name.
        { ID: LEGACY_LLM_RERANKER_MODEL_ID, Name: 'LLM Reranker', AIModelTypeID: RERANKER_TYPE_ID, IsActive: true, APIName: null, DriverClass: null, PowerRank: 50, ModelVendors: [] },
    ];
    h.state.promptModels = [
        binding('pm-1', DEFAULT_DECISION_PROMPT_ID, PRIMARY_DECISION_MODEL_ID, 'vendor-openrouter', 10),
        binding('pm-2', DEFAULT_DECISION_PROMPT_ID, FALLBACK_DECISION_MODEL_ID, 'vendor-mj', 5),
        binding('pm-3', CUSTOM_DECISION_PROMPT_ID, PRIMARY_DECISION_MODEL_ID, 'vendor-openrouter', 10),
    ];
    h.state.prompts = [
        catalogPrompt(DEFAULT_DECISION_PROMPT_ID, 'Default Decision', DECISION_TYPE_ID),
        catalogPrompt(CUSTOM_DECISION_PROMPT_ID, 'Custom Decision', DECISION_TYPE_ID),
        catalogPrompt(DEFAULT_RERANK_PROMPT_ID, 'Default Rerank', RERANKER_TYPE_ID),
    ];
}

function modelByID(id: string): FakeModel {
    const model = h.state.models.find(m => m.ID === id);
    if (!model) {
        throw new Error(`No catalog model ${id}`);
    }
    return model;
}

/** Declares a model's `Decision.MaxQuestionsPerCall` on the model row. */
function setModelLimit(modelId: string, limit: number): void {
    modelByID(modelId).ModelConfiguration = { Decision: { MaxQuestionsPerCall: limit } };
}

/** Declares a model's `Decision.MaxQuestionsPerCall` on its model-vendor row. */
function setVendorLimit(modelId: string, limit: number): void {
    modelByID(modelId).ModelVendors[0].ModelConfiguration = { Decision: { MaxQuestionsPerCall: limit } };
}

// ---------------------------------------------------------------------------
// Documents, and the decision call they are scored by
// ---------------------------------------------------------------------------
const contextUser = new UserInfo(undefined, { ID: 'user-1', Name: 'Test User' });
const QUERY = 'How does the member like to be contacted?';

/** The probability the stubbed decision model gives each document text. */
let relevanceByText = new Map<string, number>();

/** A document the stubbed decision model scores at `probability`. */
function note(id: string, text: string, probability: number): RerankDocument {
    relevanceByText.set(text, probability);
    return { id, text };
}

/** `count` documents (at most 1000), scored 0.001, 0.002, ... in order. */
function notes(count: number): RerankDocument[] {
    return Array.from({ length: count }, (_, i) => note(`doc-${i}`, `Note ${i}`, (i + 1) / 1000));
}

/** Answers every question with the probability of the document its instructions carry. */
function answerAll(params: AIDecisionParams): AIDecisionRunResult {
    const answers: Record<string, DecisionAnswer> = {};
    for (const [key, question] of Object.entries(params.Questions)) {
        const text = question.Instructions.slice(STATEMENT.length);
        answers[key] = { Kind: 'Likelihood', Probability: relevanceByText.get(text) ?? 0.5 };
    }
    return { success: true, Answers: answers };
}

/** Every decision call made, in the order the reranker made them. */
let decisionCalls: AIDecisionParams[] = [];

/** Replaces the decision call with `answer`, recording each call's parameters. */
function stubDecisions(answer: (params: AIDecisionParams) => Promise<AIDecisionRunResult> = async p => answerAll(p)): void {
    vi.spyOn(AIDecisionRunner.prototype, 'ExecuteDecision').mockImplementation(async params => {
        decisionCalls.push(params);
        return answer(params);
    });
}

function rerank(reranker: DecisionReranker, documents: RerankDocument[], options?: Record<string, number | string>): Promise<RerankResponse> {
    return reranker.Rerank({ query: QUERY, documents, options });
}

/** A decision call that never answers, as a hung model call does. */
function neverAnswer(): Promise<AIDecisionRunResult> {
    return new Promise<AIDecisionRunResult>(() => undefined);
}

/** Starts a rerank and reports whether it has settled, for tests that move fake time. */
function startRerank(reranker: DecisionReranker, documents: RerankDocument[], options?: Record<string, number | string>): { Settled: () => boolean; Response: Promise<RerankResponse> } {
    let settled = false;
    const response = rerank(reranker, documents, options).then(result => {
        settled = true;
        return result;
    });
    return { Settled: () => settled, Response: response };
}

/** The number of questions in each decision call. */
function batchSizes(): number[] {
    return decisionCalls.map(call => Object.keys(call.Questions).length);
}

/** The usage fields of a decision call's result, as `AIDecisionRunner` reports them. */
type DecisionUsageFields = Pick<AIDecisionRunResult, 'promptTokens' | 'completionTokens' | 'cost' | 'costCurrency' | 'promptRun'>;

/** Answers every question, and reports `usage` as the call's tokens and cost. */
function answerWithUsage(params: AIDecisionParams, usage: DecisionUsageFields): AIDecisionRunResult {
    return { ...answerAll(params), ...usage };
}

/** The cost columns of a decision call's prompt run that the reranker reads. */
type DecisionRunCost = Pick<MJAIPromptRunEntity, 'Cost' | 'DescendantCost' | 'TotalCost' | 'CostCurrency'>;

/** The seam onto the full prompt-run entity a decision result carries, from the cost columns the reranker reads. */
function asPromptRun(run: DecisionRunCost): MJAIPromptRunEntity {
    return run as MJAIPromptRunEntity;
}

// ---------------------------------------------------------------------------
// Fake prompt-run rows and the provider that hands them out (for AIRerankerRunner)
// ---------------------------------------------------------------------------
let promptRunSeq = 0;

/** Stands in for an `MJ: AI Prompt Runs` entity: keeps what the runner sets, and saves nothing. */
class FakePromptRun {
    public ID = '';
    public LatestResult: { CompleteMessage: string } | null = null;
    /** Whether a Save has succeeded, as `BaseEntity.IsSaved` reports it. */
    public IsSaved = false;
    [key: string]: unknown;

    public NewRecord(): boolean {
        this.ID = `pr-${++promptRunSeq}`;
        return true;
    }

    public async Save(): Promise<boolean> {
        this.IsSaved = true;
        return true;
    }
}

/** The provider members the runner uses to create run rows: all a test has to supply. */
const fakeProvider = {
    GetEntityObject: async (): Promise<FakePromptRun> => new FakePromptRun(),
};

function newRerankerRunner(): AIRerankerRunner {
    const runner = new AIRerankerRunner();
    // The seam onto the full provider the runner is declared to take.
    runner.Provider = fakeProvider as unknown as IMetadataProvider;
    return runner;
}

beforeEach(() => {
    setupCatalog();
    relevanceByText = new Map();
    decisionCalls = [];
    RerankerService.Instance.ClearCache();
    // BaseReranker logs a failed rerank to console.error, and BaseModel warns about the empty API key
    // every prompt-backed reranker is built with; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// DecisionReranker
// ---------------------------------------------------------------------------
describe('DecisionReranker', () => {
    it('asks one Likelihood question per document, in one call to Default Decision, with the query as the state', async () => {
        stubDecisions();
        const documents = [note('doc-1', 'Prefers email over phone', 0.9), note('doc-2', 'Lives in Ohio', 0.2)];

        await rerank(new DecisionReranker('', '', '', contextUser), documents);

        expect(decisionCalls).toHaveLength(1);
        const call = decisionCalls[0];
        expect(call.prompt.ID).toBe(DEFAULT_DECISION_PROMPT_ID);
        expect(call.State).toBe(QUERY);
        expect(call.contextUser).toBe(contextUser);
        expect(Object.values(call.Questions)).toEqual([
            { Kind: 'Likelihood', Instructions: 'This note bears on the request: Prefers email over phone' },
            { Kind: 'Likelihood', Instructions: 'This note bears on the request: Lives in Ohio' },
        ]);
    });

    it('scores each document by its probability, most relevant first', async () => {
        stubDecisions();
        const documents = [note('doc-1', 'Lives in Ohio', 0.2), note('doc-2', 'Prefers email over phone', 0.9), note('doc-3', 'Has a dog', 0.05)];

        const response = await rerank(new DecisionReranker('', '', '', contextUser), documents);

        expect(response.success).toBe(true);
        expect(response.results.map(r => [r.id, r.relevanceScore, r.rank])).toEqual([
            ['doc-2', 0.9, 0],
            ['doc-1', 0.2, 1],
            ['doc-3', 0.05, 2],
        ]);
        expect(response.results[0].document).toBe(documents[1]);
    });

    it('asks the decision prompt whose ID it is given, in place of Default Decision', async () => {
        stubDecisions();

        await rerank(new DecisionReranker('', '', CUSTOM_DECISION_PROMPT_ID, contextUser), notes(2));

        expect(decisionCalls[0].prompt.ID).toBe(CUSTOM_DECISION_PROMPT_ID);
    });

    it('fails, without a decision call, when the prompt it is given does not exist', async () => {
        stubDecisions();

        const response = await rerank(new DecisionReranker('', '', 'no-such-prompt', contextUser), notes(2));

        expect(response.success).toBe(false);
        expect(response.errorMessage).toBe('DecisionReranker: Decision prompt not found with ID: no-such-prompt');
        expect(decisionCalls).toHaveLength(0);
    });

    it("splits the documents across parallel calls when they exceed the model's MaxQuestionsPerCall", async () => {
        setModelLimit(PRIMARY_DECISION_MODEL_ID, 2);
        let inFlight = 0;
        let mostInFlight = 0;
        stubDecisions(async params => {
            inFlight++;
            mostInFlight = Math.max(mostInFlight, inFlight);
            await new Promise(resolve => setTimeout(resolve, 5));
            inFlight--;
            return answerAll(params);
        });

        const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(5));

        expect(batchSizes()).toEqual([2, 2, 1]);
        expect(mostInFlight).toBe(3);
        expect(response.success).toBe(true);
        expect(response.results.map(r => r.id)).toEqual(['doc-4', 'doc-3', 'doc-2', 'doc-1', 'doc-0']);
        expect(response.results.map(r => r.relevanceScore)).toEqual([0.005, 0.004, 0.003, 0.002, 0.001]);
    });

    it('keeps every call within the smallest limit among the models the prompt can run on', async () => {
        setModelLimit(PRIMARY_DECISION_MODEL_ID, 3);
        setModelLimit(FALLBACK_DECISION_MODEL_ID, 2);
        stubDecisions();

        await rerank(new DecisionReranker('', '', '', contextUser), notes(5));

        expect(batchSizes()).toEqual([2, 2, 1]);
    });

    it('reads the limit from the effective model configuration, including the model-vendor row', async () => {
        setVendorLimit(FALLBACK_DECISION_MODEL_ID, 4);
        stubDecisions();

        await rerank(new DecisionReranker('', '', '', contextUser), notes(9));

        expect(batchSizes()).toEqual([4, 4, 1]);
    });

    it(`caps each call at ${DEFAULT_DECISION_RERANK_DOCUMENTS_PER_CALL} documents when no model declares a limit, and keeps every score`, async () => {
        stubDecisions();

        const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(45));

        expect(DEFAULT_DECISION_RERANK_DOCUMENTS_PER_CALL).toBe(20);
        expect(batchSizes()).toEqual([20, 20, 5]);
        expect(response.results).toHaveLength(45);
        expect(response.results[0].id).toBe('doc-44');
        expect(response.results[44].id).toBe('doc-0');
    });

    it('makes one call when the documents fit in one', async () => {
        stubDecisions();

        await rerank(new DecisionReranker('', '', '', contextUser), notes(DEFAULT_DECISION_RERANK_DOCUMENTS_PER_CALL));

        expect(batchSizes()).toEqual([DEFAULT_DECISION_RERANK_DOCUMENTS_PER_CALL]);
    });

    it('takes the cap from options.MaxDocumentsPerCall, rounded down', async () => {
        stubDecisions();

        await rerank(new DecisionReranker('', '', '', contextUser), notes(7), { MaxDocumentsPerCall: 3.9 });

        expect(batchSizes()).toEqual([3, 3, 1]);
    });

    it.each([0, 0.5, -3, '3'])('ignores a MaxDocumentsPerCall of %s, which is not a number of at least 1, and keeps the default', async maxDocumentsPerCall => {
        stubDecisions();

        await rerank(new DecisionReranker('', '', '', contextUser), notes(25), { MaxDocumentsPerCall: maxDocumentsPerCall });

        expect(batchSizes()).toEqual([20, 5]);
    });

    it("keeps a model's declared limit over the cap, because a call over it fails", async () => {
        setModelLimit(PRIMARY_DECISION_MODEL_ID, 30);
        stubDecisions();

        await rerank(new DecisionReranker('', '', '', contextUser), notes(45), { MaxDocumentsPerCall: 5 });

        expect(batchSizes()).toEqual([30, 15]);
    });

    it('returns a failed response, with no scores, when the decision call fails', async () => {
        stubDecisions(async () => ({ success: false, errorMessage: 'Decision model is down', Answers: {} }));

        const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(3));

        expect(response.success).toBe(false);
        expect(response.errorMessage).toBe('DecisionReranker: Decision call failed: Decision model is down');
        expect(response.results).toEqual([]);
    });

    it('fails the whole rerank when one of the split calls fails', async () => {
        setModelLimit(PRIMARY_DECISION_MODEL_ID, 2);
        let callCount = 0;
        stubDecisions(async params => {
            callCount++;
            return callCount === 2 ? { success: false, errorMessage: 'Rate limited', Answers: {} } : answerAll(params);
        });

        const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(5));

        expect(decisionCalls).toHaveLength(3);
        expect(response.success).toBe(false);
        expect(response.errorMessage).toBe('DecisionReranker: Decision call failed: Rate limited');
        expect(response.results).toEqual([]);
    });

    it('fails rather than inventing a score when a document has no answer', async () => {
        stubDecisions(async params => {
            const result = answerAll(params);
            delete result.Answers[Object.keys(result.Answers)[1]];
            return result;
        });

        const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(3));

        expect(response.success).toBe(false);
        expect(response.errorMessage).toBe('DecisionReranker: No valid Likelihood answer for document doc-1');
        expect(response.results).toEqual([]);
    });

    describe("its decision runs' parent, and their usage", () => {
        it('asks every decision call as a child of its parent run, when it has one', async () => {
            setModelLimit(PRIMARY_DECISION_MODEL_ID, 2);
            stubDecisions();
            const reranker = new DecisionReranker('', '', '', contextUser);
            reranker.ParentPromptRunID = 'rerank-run-1';

            await rerank(reranker, notes(5));

            expect(decisionCalls.map(call => call.parentPromptRunId)).toEqual(['rerank-run-1', 'rerank-run-1', 'rerank-run-1']);
        });

        it('leaves parentPromptRunId unset when it has no parent run', async () => {
            stubDecisions();

            await rerank(new DecisionReranker('', '', '', contextUser), notes(2));

            expect(decisionCalls[0].parentPromptRunId).toBeUndefined();
        });

        it("reports the tokens and cost of all its decision calls as the response's Usage", async () => {
            setModelLimit(PRIMARY_DECISION_MODEL_ID, 2);
            stubDecisions(async params => answerWithUsage(params, { promptTokens: 100, completionTokens: 5, cost: 0.001, costCurrency: 'USD' }));

            const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(5));

            expect(decisionCalls).toHaveLength(3);
            expect(response.Usage?.promptTokens).toBe(300);
            expect(response.Usage?.completionTokens).toBe(15);
            expect(response.Usage?.cost).toBeCloseTo(0.003, 10);
            expect(response.Usage?.costCurrency).toBe('USD');
        });

        it("waits for the decision runs' saves, then reads the cost the server gave a run the model did not price", async () => {
            const run: DecisionRunCost = { Cost: null, DescendantCost: null, TotalCost: null, CostCurrency: null };
            stubDecisions(async params => answerWithUsage(params, { promptTokens: 80, completionTokens: 4, promptRun: asPromptRun(run) }));
            // The server prices a decision run when its row is saved.
            const waitForSaves = vi.spyOn(AIDecisionRunner.prototype, 'WaitForPendingPromptRunSaves').mockImplementation(async () => {
                run.Cost = 0.0004;
                run.TotalCost = 0.0004;
                run.CostCurrency = 'USD';
            });

            const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(2));

            expect(waitForSaves).toHaveBeenCalledTimes(1);
            expect(response.Usage?.cost).toBe(0.0004);
            expect(response.Usage?.costCurrency).toBe('USD');
        });

        it('reports the usage of every call when one of them fails, because a failed call still cost money', async () => {
            setModelLimit(PRIMARY_DECISION_MODEL_ID, 2);
            let callCount = 0;
            stubDecisions(async params => {
                callCount++;
                const usage: DecisionUsageFields = { promptTokens: 100, completionTokens: 5, cost: 0.001, costCurrency: 'USD' };
                return callCount === 2 ? { success: false, errorMessage: 'Rate limited', Answers: {}, ...usage } : answerWithUsage(params, usage);
            });

            const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(5));

            expect(response.success).toBe(false);
            expect(response.Usage?.promptTokens).toBe(300);
            expect(response.Usage?.cost).toBeCloseTo(0.003, 10);
        });

        it('leaves the cost unset when no call reports one', async () => {
            stubDecisions(async params => answerWithUsage(params, { promptTokens: 80, completionTokens: 4 }));

            const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(2));

            expect(response.Usage?.promptTokens).toBe(80);
            expect(response.Usage?.cost).toBeUndefined();
        });
    });

    describe('its time budget', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('fails, and aborts its decision calls, when they are still running when its budget runs out', async () => {
            stubDecisions(neverAnswer);
            const rerankInFlight = startRerank(new DecisionReranker('', '', '', contextUser), notes(2));

            await vi.advanceTimersByTimeAsync(DEFAULT_DECISION_RERANK_TIMEOUT_MS - 1);
            expect(rerankInFlight.Settled()).toBe(false);
            expect(decisionCalls[0].cancellationToken?.aborted).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            const response = await rerankInFlight.Response;

            expect(response.success).toBe(false);
            expect(response.errorMessage).toBe(`DecisionReranker: The decision calls did not finish within ${DEFAULT_DECISION_RERANK_TIMEOUT_MS} ms`);
            expect(response.results).toEqual([]);
            expect(decisionCalls[0].cancellationToken?.aborted).toBe(true);
        });

        it('gives its parallel calls one budget and one cancellation token', async () => {
            setModelLimit(PRIMARY_DECISION_MODEL_ID, 2);
            stubDecisions(neverAnswer);
            const rerankInFlight = startRerank(new DecisionReranker('', '', '', contextUser), notes(5));

            await vi.advanceTimersByTimeAsync(DEFAULT_DECISION_RERANK_TIMEOUT_MS);
            await rerankInFlight.Response;

            const tokens = new Set(decisionCalls.map(call => call.cancellationToken));
            expect(decisionCalls).toHaveLength(3);
            expect(tokens.size).toBe(1);
            expect(decisionCalls.every(call => call.cancellationToken?.aborted)).toBe(true);
        });

        it('takes its budget from options.TimeoutMS', async () => {
            stubDecisions(neverAnswer);
            const rerankInFlight = startRerank(new DecisionReranker('', '', '', contextUser), notes(2), { TimeoutMS: 50 });

            await vi.advanceTimersByTimeAsync(50);
            const response = await rerankInFlight.Response;

            expect(response.errorMessage).toBe('DecisionReranker: The decision calls did not finish within 50 ms');
        });

        it.each([0, -50, Number.NaN, '50'])('ignores a TimeoutMS of %s, which is not a positive number, and keeps the default', async timeoutMS => {
            stubDecisions(neverAnswer);
            const rerankInFlight = startRerank(new DecisionReranker('', '', '', contextUser), notes(2), { TimeoutMS: timeoutMS });

            await vi.advanceTimersByTimeAsync(DEFAULT_DECISION_RERANK_TIMEOUT_MS - 1);
            expect(rerankInFlight.Settled()).toBe(false);
            await vi.advanceTimersByTimeAsync(1);

            expect((await rerankInFlight.Response).errorMessage).toContain(`within ${DEFAULT_DECISION_RERANK_TIMEOUT_MS} ms`);
        });

        it('clears its timer when the calls finish in time', async () => {
            stubDecisions();

            const response = await rerank(new DecisionReranker('', '', '', contextUser), notes(2));

            expect(response.success).toBe(true);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    it("is registered with the ClassFactory as 'DecisionReranker'", () => {
        const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseReranker>(
            BaseReranker, 'DecisionReranker', '', '', CUSTOM_DECISION_PROMPT_ID, contextUser
        );

        expect(resolution.Resolved).toBe(true);
        expect(resolution.Instance).toBeInstanceOf(DecisionReranker);
    });
});

// ---------------------------------------------------------------------------
// The prompt-backed branch in RerankerService.GetReranker
// ---------------------------------------------------------------------------
describe('RerankerService.GetReranker, prompt-backed branch', () => {
    it('builds DecisionReranker with the prompt ID and the context user, and no API key', async () => {
        const createInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance');

        const reranker = await RerankerService.Instance.GetReranker(DECISION_RERANKER_MODEL_ID, contextUser, CUSTOM_DECISION_PROMPT_ID);

        expect(reranker).toBeInstanceOf(DecisionReranker);
        expect(createInstance).toHaveBeenCalledWith(BaseReranker, 'DecisionReranker', '', 'Default Decision', CUSTOM_DECISION_PROMPT_ID, contextUser);
    });

    it('requires a prompt ID for DecisionReranker, as it does for LLMReranker', async () => {
        expect(await RerankerService.Instance.GetReranker(DECISION_RERANKER_MODEL_ID, contextUser)).toBeNull();
    });

    it('builds LLMReranker as before: the seeded model, a chat prompt ID, the context user, and no API key', async () => {
        const createInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance');

        const reranker = await RerankerService.Instance.GetReranker(LEGACY_LLM_RERANKER_MODEL_ID, contextUser, 'chat-prompt-1');

        expect(reranker).toBeInstanceOf(LLMReranker);
        expect(createInstance).toHaveBeenCalledWith(BaseReranker, 'LLMReranker', '', '', 'chat-prompt-1', contextUser);
        expect(await RerankerService.Instance.GetReranker(LEGACY_LLM_RERANKER_MODEL_ID, contextUser)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// The prompt-backed branch in AIRerankerRunner
// ---------------------------------------------------------------------------
describe('AIRerankerRunner, prompt-backed branch', () => {
    it('builds DecisionReranker with no key and the decision prompt its model-vendor APIName names', async () => {
        stubDecisions();
        const tryCreateInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'TryCreateInstance');
        const runner = newRerankerRunner();

        const result = await runner.RunRerank({
            query: QUERY,
            documents: [note('doc-1', 'Lives in Ohio', 0.2), note('doc-2', 'Prefers email over phone', 0.9)],
            ContextUser: contextUser,
            ModelID: DECISION_RERANKER_MODEL_ID,
        });
        await runner.WaitForPendingPromptRunSaves();

        expect(result.Success).toBe(true);
        expect(result.DriverClass).toBe('DecisionReranker');
        expect(tryCreateInstance).toHaveBeenCalledWith(BaseReranker, 'DecisionReranker', '', '', DEFAULT_DECISION_PROMPT_ID, contextUser);
        expect(result.Response?.results.map(r => [r.id, r.relevanceScore])).toEqual([['doc-2', 0.9], ['doc-1', 0.2]]);
        expect(decisionCalls[0].prompt.ID).toBe(DEFAULT_DECISION_PROMPT_ID);
    });

    it('passes the configured prompt to DecisionReranker in place of the one its APIName names', async () => {
        stubDecisions();
        const tryCreateInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'TryCreateInstance');

        const result = await newRerankerRunner().RunRerank({
            query: QUERY,
            documents: notes(2),
            ContextUser: contextUser,
            ModelID: DECISION_RERANKER_MODEL_ID,
            ChatPromptID: CUSTOM_DECISION_PROMPT_ID,
        });

        expect(result.Success).toBe(true);
        expect(tryCreateInstance).toHaveBeenCalledWith(BaseReranker, 'DecisionReranker', '', '', CUSTOM_DECISION_PROMPT_ID, contextUser);
        expect(decisionCalls[0].prompt.ID).toBe(CUSTOM_DECISION_PROMPT_ID);
    });

    it("makes the decision calls children of the rerank's run, whose cost and token rollups are theirs", async () => {
        setModelLimit(PRIMARY_DECISION_MODEL_ID, 2);
        stubDecisions(async params => answerWithUsage(params, { promptTokens: 200, completionTokens: 10, cost: 0.002, costCurrency: 'USD' }));
        const runner = newRerankerRunner();

        const result = await runner.RunRerank({
            query: QUERY,
            documents: notes(3),
            ContextUser: contextUser,
            ModelID: DECISION_RERANKER_MODEL_ID,
        });
        await runner.WaitForPendingPromptRunSaves();

        expect(result.Success).toBe(true);
        expect(result.PromptRunID).toBeDefined();
        expect(decisionCalls.map(call => call.parentPromptRunId)).toEqual([result.PromptRunID, result.PromptRunID]);
        const run = result.PromptRun;
        expect(run?.ID).toBe(result.PromptRunID);
        // The decision calls' cost is the rerank run's descendant cost, not its own.
        expect(run?.DescendantCost).toBeCloseTo(0.004, 10);
        expect(run?.TotalCost).toBeCloseTo(0.004, 10);
        expect(run?.Cost).toBeUndefined();
        expect(run?.CostCurrency).toBe('USD');
        // Their tokens are in its rollups, which count a run and its descendants, and not in its own tokens.
        expect(run?.TokensPromptRollup).toBe(400);
        expect(run?.TokensCompletionRollup).toBe(20);
        expect(run?.TokensUsedRollup).toBe(420);
        expect(run?.TokensUsed).toBeUndefined();
    });

    it('reports a rerank that runs out of time as a failed rerank, so the caller falls back', async () => {
        stubDecisions(neverAnswer);

        const result = await newRerankerRunner().RunRerank({
            query: QUERY,
            documents: notes(2),
            options: { TimeoutMS: 20 },
            ContextUser: contextUser,
            ModelID: DECISION_RERANKER_MODEL_ID,
        });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe('DecisionReranker: The decision calls did not finish within 20 ms');
    });

    it('reports a failed decision call as a failed rerank, with no scores', async () => {
        stubDecisions(async () => ({ success: false, errorMessage: 'Decision model is down', Answers: {} }));

        const result = await newRerankerRunner().RunRerank({
            query: QUERY,
            documents: notes(2),
            ContextUser: contextUser,
            ModelID: DECISION_RERANKER_MODEL_ID,
        });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe('DecisionReranker: Decision call failed: Decision model is down');
        expect(result.Response?.results ?? []).toEqual([]);
    });
});
