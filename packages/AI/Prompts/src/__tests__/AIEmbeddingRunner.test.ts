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
import { UserInfo } from '@memberjunction/core';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import {
  BuildRealisticCatalog,
  MakeModel,
  MakeModelVendor,
  MakePromptModel,
  MODEL_TYPE,
  VENDOR,
  VENDOR_TYPE,
} from '@memberjunction/unit-testing';
import type { FxModel, FxModelVendor, FxPromptModel, FxVendor } from '@memberjunction/unit-testing';
import { AIEmbeddingRunner } from '../embedding/AIEmbeddingRunner';
import { AIModelRunner } from '../AIModelRunner';

/** The prompt fields the runner reads. Value-list fields are typed from the entity so they can't drift. */
interface FakePrompt {
  ID: string;
  Name: string;
  Status: MJAIPromptEntityExtended['Status'];
  Type: string;
  AIModelTypeID: string | null;
  SelectionStrategy: MJAIPromptEntityExtended['SelectionStrategy'];
  FailoverStrategy: MJAIPromptEntityExtended['FailoverStrategy'];
  RequireSpecificModels: boolean;
}

/** Stands in for an `MJ: AI Prompt Runs` entity: records what the runner sets and how often it is saved. */
interface RecordedRun {
  ID: string;
  PromptID?: string;
  ModelID?: string;
  Status?: string;
  Success?: boolean;
  Result?: string;
  ErrorMessage?: string;
  TokensUsed?: number;
  Cost?: number;
  SaveCount: number;
}

const h = vi.hoisted(() => {
  const norm = (s: string | null | undefined): string => (s == null ? '' : s.trim().toLowerCase());

  const state = {
    vendorTypeDefinitions: [] as Array<{ ID: string; Name: string }>,
    vendors: [] as FxVendor[],
    modelTypes: [] as Array<{ ID: string; Name: string }>,
    models: [] as FxModel[],
    modelVendors: [] as FxModelVendor[],
    promptModels: [] as FxPromptModel[],
    prompts: [] as FakePrompt[],
    configuredDrivers: new Set<string>(),
    runs: [] as RecordedRun[],
  };

  const byModelID = <T extends { ModelID: string }>(rows: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = norm(row.ModelID);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  };

  const engine = {
    Config: vi.fn().mockResolvedValue(undefined),
    get VendorTypeDefinitions() { return state.vendorTypeDefinitions; },
    get Vendors() { return state.vendors; },
    get ModelTypes() { return state.modelTypes; },
    get Configurations() { return []; },
    get Models() { return state.models; },
    get ModelVendors() { return state.modelVendors; },
    get PromptModels() { return state.promptModels; },
    get Prompts() { return state.prompts; },
    IsInferenceProvider(mv: { TypeID?: string }) {
      const inference = state.vendorTypeDefinitions.find(v => v.Name === 'Inference Provider')?.ID;
      return inference ? norm(mv?.TypeID) === norm(inference) : true;
    },
    get ModelsByID() { return new Map(state.models.map(m => [norm(m.ID), m])); },
    get VendorsByID() { return new Map(state.vendors.map(v => [norm(v.ID), v])); },
    get ModelTypesByID() { return new Map(state.modelTypes.map(t => [norm(t.ID), t])); },
    get ModelVendorsByModelID() { return byModelID(state.modelVendors); },
    GetConfigurationChain() { return []; },
    HasCredentialBindings() { return false; },
    GetCredentialBindingsForTarget() { return []; },
  };

  let runSeq = 0;
  /** Returned for 'MJ: AI Prompt Runs'; the runner's base class sets many more fields than these at runtime. */
  class FakePromptRun implements RecordedRun {
    public ID = '';
    public SaveCount = 0;
    public NewRecord(): boolean {
      this.ID = `run-${++runSeq}`;
      state.runs.push(this);
      return true;
    }
    public async Save(): Promise<boolean> {
      this.SaveCount++;
      return true;
    }
  }

  const provider = {
    GetEntityObject: vi.fn(async (entityName: string) =>
      entityName === 'MJ: AI Prompt Runs' ? new FakePromptRun() : null
    ),
  };

  return {
    state,
    engine,
    provider,
    getApiKey: (driver: string) => (state.configuredDrivers.has(driver) ? 'test-api-key' : ''),
  };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/aiengine')>();
  return { ...actual, AIEngine: { Instance: h.engine } };
});

vi.mock('@memberjunction/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/ai')>();
  return { ...actual, GetAIAPIKey: (driver: string) => h.getApiKey(driver) };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  /** Every run row goes through the default provider, so the tests read rows from the fake one. */
  class TestMetadata {
    public static get Provider() { return h.provider; }
  }
  return { ...actual, Metadata: TestMetadata };
});

vi.mock('@memberjunction/credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/credentials')>();
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

// ---------------------------------------------------------------------------
// Scripted drivers, registered with the ClassFactory under their driver keys so the
// runner resolves them exactly as it resolves real ones.
// ---------------------------------------------------------------------------

/** What one driver key was asked to do, and how it should answer. */
interface DriverScript {
  /** The key each instance was constructed with (including the runner's keyless probe). */
  ConstructedWith: string[];
  /** Every EmbedTexts call, in order. */
  Calls: EmbedTextsParams[];
  /** Replaces the default answer: one 3-wide (or `dimensions`-wide) vector per text. */
  Answer?: (params: EmbedTextsParams) => Promise<EmbedTextsResult>;
}

const scripts = new Map<string, DriverScript>();

function scriptFor(driverKey: string): DriverScript {
  const script = scripts.get(driverKey);
  if (!script) {
    throw new Error(`No scripted driver registered as '${driverKey}'`);
  }
  return script;
}

abstract class ScriptedEmbeddings extends BaseEmbeddings {
  constructor(apiKey: string, private readonly driverKey: string) {
    super(apiKey);
    scriptFor(driverKey).ConstructedWith.push(apiKey);
  }

  public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
    return { object: 'object', model: params.model ?? '', ModelUsage: new ModelUsage(5, 0), vector: [0.1, 0.2, 0.3] };
  }

  public async GetEmbeddingModels(): Promise<string[]> {
    return [];
  }

  public override async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
    const script = scriptFor(this.driverKey);
    script.Calls.push(params);
    if (script.Answer) {
      return script.Answer(params);
    }
    const width = params.dimensions ?? 3;
    return {
      object: 'list',
      model: params.model ?? '',
      ModelUsage: new ModelUsage(params.texts.length * 10, 0, 0.0002, 'USD'),
      vectors: params.texts.map(() => Array<number>(width).fill(0.1)),
    };
  }
}

const DRIVER_1 = 'EmbeddingRunnerTestDriver1';
const DRIVER_1B = 'EmbeddingRunnerTestDriver1B';
const DRIVER_2 = 'EmbeddingRunnerTestDriver2';
const DRIVER_LOCAL = 'EmbeddingRunnerTestLocalDriver';

class TestDriverOne extends ScriptedEmbeddings {
  constructor(apiKey: string) { super(apiKey, DRIVER_1); }
}
class TestDriverOneB extends ScriptedEmbeddings {
  constructor(apiKey: string) { super(apiKey, DRIVER_1B); }
}
class TestDriverTwo extends ScriptedEmbeddings {
  constructor(apiKey: string) { super(apiKey, DRIVER_2); }
}
/** Like `LocalEmbedding`: runs in-process and needs no key. */
class TestLocalDriver extends ScriptedEmbeddings {
  constructor(apiKey: string) { super(apiKey, DRIVER_LOCAL); }
  public override get RequiresAPIKey(): boolean { return false; }
}

for (const [key, driverClass] of [
  [DRIVER_1, TestDriverOne],
  [DRIVER_1B, TestDriverOneB],
  [DRIVER_2, TestDriverTwo],
  [DRIVER_LOCAL, TestLocalDriver],
] as const) {
  MJGlobal.Instance.ClassFactory.Register(BaseEmbeddings, driverClass, key, 1000);
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const MODEL_1_ID = 'E0000000-0000-0000-0000-000000000001';
const MODEL_2_ID = 'E0000000-0000-0000-0000-000000000002';
const LOCAL_MODEL_ID = 'E0000000-0000-0000-0000-000000000003';
const LOCAL_VENDOR_ID = 'E0000000-0000-0000-0000-0000000000AA';
const PROMPT_ID = 'E0000000-0000-0000-0000-0000000000P1';

const mockUser = new UserInfo(undefined, { ID: 'user-001', Name: 'Test User', Email: 'test@example.com' });

function embeddingVendor(id: string, modelID: string, vendorID: string, vendor: string, driver: string, apiName: string, priority: number): FxModelVendor {
  return MakeModelVendor({
    ID: id,
    ModelID: modelID,
    VendorID: vendorID,
    Vendor: vendor,
    DriverClass: driver,
    APIName: apiName,
    Priority: priority,
    TypeID: VENDOR_TYPE.InferenceProvider,
  });
}

function embeddingModel(id: string, name: string, vendors: FxModelVendor[], powerRank: number): FxModel {
  return MakeModel({
    ID: id,
    Name: name,
    AIModelTypeID: MODEL_TYPE.Embeddings,
    AIModelType: 'Embeddings',
    DriverClass: vendors[0].DriverClass,
    APIName: vendors[0].APIName,
    PowerRank: powerRank,
    ModelVendors: vendors,
  });
}

/**
 * Model 1 (OpenAI, driver 1) is the prompt's first choice and model 2 (Google, driver 2) its second.
 * The local model (keyless driver) is bound to no prompt, so an unpinned call reaches it only as a
 * power-matched fallback.
 */
function loadCatalog(): void {
  const catalog = BuildRealisticCatalog();
  h.state.vendorTypeDefinitions = catalog.vendorTypeDefinitions;
  h.state.vendors = [...catalog.vendors, { ID: LOCAL_VENDOR_ID, Name: 'LocalEmbeddings', CredentialTypeID: null }];
  h.state.modelTypes = catalog.modelTypes;

  const mv1 = embeddingVendor('mv-001', MODEL_1_ID, VENDOR.OpenAI, 'OpenAI', DRIVER_1, 'text-embed-1', 10);
  const mv2 = embeddingVendor('mv-002', MODEL_2_ID, VENDOR.Google, 'Google', DRIVER_2, 'text-embed-2', 5);
  const mvLocal = embeddingVendor('mv-local', LOCAL_MODEL_ID, LOCAL_VENDOR_ID, 'LocalEmbeddings', DRIVER_LOCAL, 'Xenova/all-MiniLM-L6-v2', 1);

  h.state.models = [
    embeddingModel(MODEL_1_ID, 'Test Embedding Model 1', [mv1], 50),
    embeddingModel(MODEL_2_ID, 'Test Embedding Model 2', [mv2], 40),
    embeddingModel(LOCAL_MODEL_ID, 'Test Local Embedding Model', [mvLocal], 10),
  ];
  h.state.modelVendors = [mv1, mv2, mvLocal];
  h.state.prompts = [{
    ID: PROMPT_ID,
    Name: 'Standard Embedding Prompt',
    Status: 'Active',
    Type: 'Embedding',
    AIModelTypeID: MODEL_TYPE.Embeddings,
    SelectionStrategy: 'Specific',
    FailoverStrategy: 'NextBestModel',
    RequireSpecificModels: false,
  }];
  h.state.promptModels = [
    MakePromptModel({ ID: 'pm-001', PromptID: PROMPT_ID, ModelID: MODEL_1_ID, Priority: 10 }),
    MakePromptModel({ ID: 'pm-002', PromptID: PROMPT_ID, ModelID: MODEL_2_ID, Priority: 5 }),
  ];
  h.state.configuredDrivers = new Set([DRIVER_1, DRIVER_1B, DRIVER_2]);
}

/** Drops the keyless local model, so a catalog with no keys configured has no usable candidate at all. */
function removeLocalModel(): void {
  h.state.models = h.state.models.filter(m => m.ID !== LOCAL_MODEL_ID);
  h.state.modelVendors = h.state.modelVendors.filter(mv => mv.ModelID !== LOCAL_MODEL_ID);
}

function lastRun(): RecordedRun | undefined {
  return h.state.runs[h.state.runs.length - 1];
}

describe('AIEmbeddingRunner', () => {
  let runner: AIEmbeddingRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    h.state.runs = [];
    for (const key of [DRIVER_1, DRIVER_1B, DRIVER_2, DRIVER_LOCAL]) {
      scripts.set(key, { ConstructedWith: [], Calls: [] });
    }
    loadCatalog();
    runner = new AIEmbeddingRunner();
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

    const run = lastRun();
    expect(run?.ID).toBe(result.PromptRunID);
    expect(run?.PromptID).toBe(PROMPT_ID);
    expect(run?.Success).toBe(true);
    expect(run?.Status).toBe('Completed');
    expect(run?.TokensUsed).toBe(20);
    expect(run?.Cost).toBe(0.0002);
    expect(run?.SaveCount).toBeGreaterThanOrEqual(2);
    const parsedResult = JSON.parse(run?.Result ?? '{}');
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
    expect(scriptFor(DRIVER_2).Calls[0]?.model).toBe('text-embed-2');
    expect(scriptFor(DRIVER_1).Calls).toHaveLength(0);
  });

  it('under NextBestModel, fails over to the second model after a Retriable failure, naming the second model', async () => {
    scriptFor(DRIVER_1).Answer = () => Promise.reject(new Error('503 Service Unavailable'));

    const result = await runner.RunEmbedding({
      Texts: ['failover test text'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
    });

    expect(result.Success).toBe(true);
    expect(result.ModelID).toBe(MODEL_2_ID);
    expect(result.ModelName).toBe('Test Embedding Model 2');
    expect(result.Vectors).toHaveLength(1);
    expect(scriptFor(DRIVER_1).Calls).toHaveLength(1);
  });

  it('no candidate with credentials gives a clear Success: false', async () => {
    h.state.configuredDrivers.clear();
    removeLocalModel();

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
    removeLocalModel();
    scriptFor(DRIVER_1).Answer = () => { throw new Error('Fatal unrecoverable network crash'); };
    scriptFor(DRIVER_2).Answer = () => { throw new Error('Fatal unrecoverable network crash on secondary'); };

    const result = await runner.RunEmbedding({
      Texts: ['crash text'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
    });

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('Fatal unrecoverable network crash');
    expect(result.PromptRunID).toBeTruthy();

    await runner.WaitForPendingPromptRunSaves();

    const run = lastRun();
    expect(run?.Success).toBe(false);
    expect(run?.Status).toBe('Failed');
    expect(run?.ErrorMessage).toContain('Fatal unrecoverable network crash');
  });

  it('Dimensions are forwarded to the driver', async () => {
    const result = await runner.RunEmbedding({
      Texts: ['dimension test text'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
      Dimensions: 512,
    });

    expect(result.Success).toBe(true);
    expect(scriptFor(DRIVER_1).Calls[0]?.dimensions).toBe(512);
    expect(result.Vectors[0]).toHaveLength(512);
  });

  describe('keyless drivers', () => {
    it('a pinned call to a model whose driver needs no key succeeds with no key configured', async () => {
      h.state.configuredDrivers.clear();

      const result = await runner.RunEmbedding({
        Texts: ['keyless local text'],
        ContextUser: mockUser,
        ModelID: LOCAL_MODEL_ID,
      });

      expect(result.Success).toBe(true);
      expect(result.ErrorMessage).toBeNull();
      expect(result.ModelID).toBe(LOCAL_MODEL_ID);
      expect(result.Vectors).toHaveLength(1);
      const local = scriptFor(DRIVER_LOCAL);
      expect(local.Calls).toHaveLength(1);
      expect(local.Calls[0]?.model).toBe('Xenova/all-MiniLM-L6-v2');
      // The driver the call ran on got no key: there was none to give it.
      expect(local.ConstructedWith[local.ConstructedWith.length - 1]).toBe('');
    });

    it('a keyless vendor does not make a cloud driver that needs a key count as credentialed', async () => {
      h.state.configuredDrivers.clear();

      const result = await runner.RunEmbedding({
        Texts: ['cloud text'],
        ContextUser: mockUser,
        ModelID: MODEL_1_ID,
      });

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('No Embeddings model has credentials available');
      expect(scriptFor(DRIVER_1).Calls).toHaveLength(0);
    });
  });

  it('AIModelRunner delegation works transparently', async () => {
    const legacyRunner = new AIModelRunner();

    const result = await legacyRunner.RunEmbedding({
      Texts: ['delegation test'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
    });

    expect(result.Success).toBe(true);
    expect(result.Vectors).toHaveLength(1);
    await legacyRunner.WaitForPendingPromptRunSaves();
    expect(lastRun()?.Status).toBe('Completed');
  });
});
