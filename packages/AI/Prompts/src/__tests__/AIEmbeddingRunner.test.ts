import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
  BaseEmbeddings,
  EmbedTextsParams,
  EmbedTextsResult,
  EmbedTextParams,
  EmbedTextResult,
  ModelUsage,
} from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import { AIEmbeddingRunner } from '../embedding/AIEmbeddingRunner';
import { AIModelRunner } from '../AIModelRunner';
import {
  buildRealisticCatalog,
  MODEL_TYPE,
  VENDOR,
  makeModel,
  makeModelVendor,
  makePromptModel,
} from './__fixtures__/ai-metadata.fixtures';

const EMBEDDINGS_MODEL_TYPE_ID = MODEL_TYPE.Embeddings;

const h = vi.hoisted(() => {
  const norm = (s: unknown): string => (s == null ? '' : String(s).trim().toLowerCase());
  const eq = (a: unknown, b: unknown): boolean => norm(a) === norm(b);

  type State = {
    vendorTypeDefinitions: Array<{ ID: string; Name: string }>;
    vendors: Array<{ ID: string; Name: string; CredentialTypeID?: string | null }>;
    modelTypes: Array<{ ID: string; Name: string }>;
    configurations: Array<{ ID: string; Name: string; ParentID: string | null }>;
    models: Array<Record<string, unknown>>;
    modelVendors: Array<Record<string, unknown>>;
    promptModels: Array<Record<string, unknown>>;
    prompts: Array<Record<string, unknown>>;
    configuredDrivers: Set<string>;
  };

  const state: State = {
    vendorTypeDefinitions: [],
    vendors: [],
    modelTypes: [],
    configurations: [],
    models: [],
    modelVendors: [],
    promptModels: [],
    prompts: [],
    configuredDrivers: new Set(),
  };

  const engine = {
    Config: vi.fn().mockResolvedValue(undefined),
    get VendorTypeDefinitions() { return state.vendorTypeDefinitions; },
    get Vendors() { return state.vendors; },
    get ModelTypes() { return state.modelTypes; },
    get Configurations() { return state.configurations; },
    get Models() { return state.models; },
    get ModelVendors() { return state.modelVendors; },
    get PromptModels() { return state.promptModels; },
    get Prompts() { return state.prompts; },
    get InferenceProviderTypeID() {
      return state.vendorTypeDefinitions.find(v => v.Name === 'Inference Provider')?.ID;
    },
    IsInferenceProvider(mv: { TypeID?: string }) {
      const inf = state.vendorTypeDefinitions.find(v => v.Name === 'Inference Provider')?.ID;
      return inf ? eq(mv?.TypeID, inf) : true;
    },
    get ModelsByID() { return new Map(state.models.map(m => [norm(m.ID), m])); },
    get VendorsByID() { return new Map(state.vendors.map(v => [norm(v.ID), v])); },
    get ModelTypesByID() { return new Map(state.modelTypes.map(t => [norm(t.ID), t])); },
    get ConfigurationsByID() { return new Map(state.configurations.map(c => [norm(c.ID), c])); },
    get ModelVendorsByModelID() {
      const map = new Map<string, Array<Record<string, unknown>>>();
      for (const mv of state.modelVendors) {
        const k = norm(mv.ModelID);
        (map.get(k) ?? map.set(k, []).get(k)!).push(mv);
      }
      return map;
    },
    get PromptModelsByPromptID() {
      const map = new Map<string, Array<Record<string, unknown>>>();
      for (const pm of state.promptModels) {
        const k = norm(pm.PromptID);
        (map.get(k) ?? map.set(k, []).get(k)!).push(pm);
      }
      return map;
    },
    GetConfigurationChain(id: string) {
      const chain: Array<{ ID: string; ParentID: string | null }> = [];
      let cur: string | null = id;
      const seen = new Set<string>();
      while (cur) {
        if (seen.has(norm(cur))) break;
        const c = state.configurations.find(x => eq(x.ID, cur));
        if (!c) break;
        seen.add(norm(cur));
        chain.push(c);
        cur = c.ParentID;
      }
      return chain;
    },
    HasCredentialBindings() { return false; },
    GetCredentialBindingsForTarget() { return []; },
  };

  return {
    state,
    engine,
    getApiKey: (d: string) => (state.configuredDrivers.has(d) ? 'test-api-key' : ''),
  };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, AIEngine: { Instance: h.engine } };
});

vi.mock('@memberjunction/ai', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    GetAIAPIKey: (d: string) => h.getApiKey(d),
  };
});

vi.mock('@memberjunction/credentials', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
  return {
    ...actual,
    CredentialEngine: {
      Instance: {
        Config: vi.fn().mockResolvedValue(undefined),
        Credentials: [],
        getCredentialById: () => null,
        getCredential: vi.fn().mockResolvedValue({ values: {} }),
      },
    },
  };
});

class MockEmbeddingDriver extends BaseEmbeddings {
  public lastParams?: EmbedTextsParams;
  public embedTextsOverride?: (params: EmbedTextsParams) => Promise<EmbedTextsResult>;

  constructor(apiKey = 'test-key') {
    super(apiKey);
  }

  public async EmbedText(_params: EmbedTextParams): Promise<EmbedTextResult> {
    return {
      vector: [0.1, 0.2, 0.3],
      ModelUsage: new ModelUsage(5, 0, 0.0001, 'USD'),
    };
  }

  public async GetEmbeddingModels(): Promise<unknown> {
    return [];
  }

  public override async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
    this.lastParams = params;
    if (this.embedTextsOverride) {
      return this.embedTextsOverride(params);
    }
    const dims = params.dimensions ?? 3;
    const vectors = params.texts.map(() => Array(dims).fill(0.1));
    return {
      vectors,
      ModelUsage: new ModelUsage(params.texts.length * 10, 0, 0.0002, 'USD'),
    };
  }
}

let prSeq = 0;
class FakePromptRun {
  public ID = '';
  public PromptID?: string;
  public ModelID?: string;
  public VendorID?: string | null;
  public Status?: string;
  public Success?: boolean;
  public RunAt?: Date;
  public CompletedAt?: Date;
  public ExecutionTimeMS?: number;
  public Messages?: string;
  public Result?: string;
  public ErrorMessage?: string;
  public TokensPrompt?: number;
  public TokensCompletion?: number;
  public TokensUsed?: number;
  public Cost?: number;
  public CostCurrency?: string;
  public saveCount = 0;
  [k: string]: unknown;

  NewRecord(): boolean {
    this.ID = `pr-${++prSeq}`;
    return true;
  }
  async Save(): Promise<boolean> {
    this.saveCount++;
    return true;
  }
}

let lastPromptRun: FakePromptRun | null = null;
const fakeProvider = {
  GetEntityObject: vi.fn(async (entityName: string) => {
    if (entityName.includes('AI Prompt Runs')) {
      lastPromptRun = new FakePromptRun();
      return lastPromptRun;
    }
    return null;
  }),
};

const mockUser = {
  ID: 'user-001',
  Name: 'Test User',
  Email: 'test@example.com',
} as UserInfo;

describe('AIEmbeddingRunner', () => {
  let runner: AIEmbeddingRunner;
  let driver1: MockEmbeddingDriver;
  let driver2: MockEmbeddingDriver;

  const DRIVER_1 = 'MockDriver1';
  const DRIVER_2 = 'MockDriver2';
  const MODEL_1_ID = 'embedding-model-001';
  const MODEL_2_ID = 'embedding-model-002';
  const PROMPT_ID = 'prompt-embedding-001';

  beforeEach(() => {
    prSeq = 0;
    lastPromptRun = null;
    vi.clearAllMocks();

    driver1 = new MockEmbeddingDriver();
    driver2 = new MockEmbeddingDriver();

    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(
      (_baseClass: unknown, className: string) => {
        if (className === DRIVER_1) return driver1 as never;
        if (className === DRIVER_2) return driver2 as never;
        return driver1 as never;
      }
    );

    const catalog = buildRealisticCatalog();
    h.state.vendorTypeDefinitions = catalog.vendorTypeDefinitions;
    h.state.vendors = catalog.vendors;
    h.state.modelTypes = catalog.modelTypes;
    h.state.configurations = catalog.configurations;
    h.state.configuredDrivers = new Set([DRIVER_1, DRIVER_2]);

    const mv1 = makeModelVendor({
      ID: 'mv-001',
      ModelID: MODEL_1_ID,
      VendorID: VENDOR.OpenAI,
      Vendor: 'OpenAI',
      DriverClass: DRIVER_1,
      APIName: 'text-embed-1',
      Priority: 10,
      Status: 'Active',
      TypeID: catalog.vendorTypeDefinitions.find(v => v.Name === 'Inference Provider')?.ID,
    });

    const mv2 = makeModelVendor({
      ID: 'mv-002',
      ModelID: MODEL_2_ID,
      VendorID: VENDOR.Cohere,
      Vendor: 'Cohere',
      DriverClass: DRIVER_2,
      APIName: 'text-embed-2',
      Priority: 5,
      Status: 'Active',
      TypeID: catalog.vendorTypeDefinitions.find(v => v.Name === 'Inference Provider')?.ID,
    });

    const m1 = makeModel({
      ID: MODEL_1_ID,
      Name: 'Test Embedding Model 1',
      Vendor: 'OpenAI',
      AIModelTypeID: EMBEDDINGS_MODEL_TYPE_ID,
      AIModelType: 'Embeddings',
      DriverClass: DRIVER_1,
      APIName: 'text-embed-1',
      IsActive: true,
      PowerRank: 50,
      ModelVendors: [mv1],
    });

    const m2 = makeModel({
      ID: MODEL_2_ID,
      Name: 'Test Embedding Model 2',
      Vendor: 'Cohere',
      AIModelTypeID: EMBEDDINGS_MODEL_TYPE_ID,
      AIModelType: 'Embeddings',
      DriverClass: DRIVER_2,
      APIName: 'text-embed-2',
      IsActive: true,
      PowerRank: 40,
      ModelVendors: [mv2],
    });

    h.state.models = [m1, m2];
    h.state.modelVendors = [mv1, mv2];

    h.state.prompts = [
      {
        ID: PROMPT_ID,
        Name: 'Standard Embedding Prompt',
        Status: 'Active',
        Type: 'Embedding',
        AIModelTypeID: EMBEDDINGS_MODEL_TYPE_ID,
        SelectionStrategy: 'Specific',
        FailoverStrategy: 'NextInList',
        RequireSpecificModels: false,
        MaxFailoverAttempts: 3,
        PromptModels: [],
      },
    ];

    h.state.promptModels = [
      makePromptModel({
        ID: 'pm-001',
        PromptID: PROMPT_ID,
        ModelID: MODEL_1_ID,
        Priority: 10,
        Status: 'Active',
        ConfigurationID: null,
      }),
      makePromptModel({
        ID: 'pm-002',
        PromptID: PROMPT_ID,
        ModelID: MODEL_2_ID,
        Priority: 5,
        Status: 'Active',
        ConfigurationID: null,
      }),
    ];

    runner = new AIEmbeddingRunner();
    runner.Provider = fakeProvider as never;
  });

  it('happy path with vectors, tokens, cost, and an MJ: AI Prompt Runs record', async () => {
    const result = await runner.RunEmbedding({
      Texts: ['hello world', 'memberjunction embeddings'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
      Description: 'Test embedding run',
    });

    expect(result.Success).toBe(true);
    expect(result.Vectors).toHaveLength(2);
    expect(result.Vectors[0]).toHaveLength(3);
    expect(result.TokensUsed).toBe(20);
    expect(result.Cost).toBe(0.0002);
    expect(result.ErrorMessage).toBeNull();
    expect(result.ModelID).toBe(MODEL_1_ID);
    expect(result.ModelName).toBe('Test Embedding Model 1');
    expect(result.PromptRunID).toBeTruthy();

    await runner.WaitForPendingPromptRunSaves();

    expect(lastPromptRun).not.toBeNull();
    expect(lastPromptRun?.Success).toBe(true);
    expect(lastPromptRun?.Status).toBe('Completed');
    expect(lastPromptRun?.TokensUsed).toBe(20);
    expect(lastPromptRun?.Cost).toBe(0.0002);
    expect(lastPromptRun?.saveCount).toBeGreaterThanOrEqual(2);
    const parsedResult = JSON.parse(lastPromptRun?.Result ?? '{}');
    expect(parsedResult.vectorCount).toBe(2);
    expect(parsedResult.dimensions).toBe(3);
  });

  it('ModelID pinning passes through to BuildModelVendorCandidates', async () => {
    const result = await runner.RunEmbedding({
      Texts: ['pinned model test'],
      ContextUser: mockUser,
      ModelID: MODEL_2_ID,
    });

    expect(result.Success).toBe(true);
    expect(result.ModelID).toBe(MODEL_2_ID);
    expect(result.ModelName).toBe('Test Embedding Model 2');
    expect(driver2.lastParams?.model).toBe('text-embed-2');
  });

  it('failover to a second candidate after a Retriable failure, naming the second model', async () => {
    driver1.embedTextsOverride = vi.fn().mockRejectedValue(new Error('Rate limit exceeded (429)'));

    const result = await runner.RunEmbedding({
      Texts: ['failover test text'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
    });

    expect(result.Success).toBe(true);
    expect(result.ModelID).toBe(MODEL_2_ID);
    expect(result.ModelName).toBe('Test Embedding Model 2');
    expect(result.Vectors).toHaveLength(1);
    expect(driver1.embedTextsOverride).toHaveBeenCalled();
  });

  it('no candidate with credentials gives a clear Success: false', async () => {
    h.state.configuredDrivers.clear();

    const result = await runner.RunEmbedding({
      Texts: ['test without credentials'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
    });

    expect(result.Success).toBe(false);
    expect(result.Vectors).toEqual([]);
    expect(result.ErrorMessage).toContain('No Embeddings model has credentials available');
  });

  it('an exception after the row is created finalizes the row as failed', async () => {
    driver1.embedTextsOverride = vi.fn().mockImplementation(() => {
      throw new Error('Fatal unrecoverable network crash');
    });
    driver2.embedTextsOverride = vi.fn().mockImplementation(() => {
      throw new Error('Fatal unrecoverable network crash on secondary');
    });

    const result = await runner.RunEmbedding({
      Texts: ['crash text'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
    });

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('Fatal unrecoverable network crash');
    expect(result.PromptRunID).toBeTruthy();

    await runner.WaitForPendingPromptRunSaves();

    expect(lastPromptRun).not.toBeNull();
    expect(lastPromptRun?.Success).toBe(false);
    expect(lastPromptRun?.Status).toBe('Failed');
    expect(lastPromptRun?.ErrorMessage).toContain('Fatal unrecoverable network crash');
  });

  it('Dimensions are forwarded to the driver', async () => {
    const result = await runner.RunEmbedding({
      Texts: ['dimension test text'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
      Dimensions: 512,
    });

    expect(result.Success).toBe(true);
    expect(driver1.lastParams?.dimensions).toBe(512);
    expect(result.Vectors[0]).toHaveLength(512);
  });

  it('AIModelRunner delegation works transparently', async () => {
    const legacyRunner = new AIModelRunner();
    legacyRunner.Provider = fakeProvider as never;

    const result = await legacyRunner.RunEmbedding({
      Texts: ['delegation test'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
    });

    expect(result.Success).toBe(true);
    expect(result.Vectors).toHaveLength(1);
    await legacyRunner.WaitForPendingPromptRunSaves();
    expect(lastPromptRun?.Status).toBe('Completed');
  });
});
