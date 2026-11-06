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
  UserID?: string | null;
  Status?: string;
  Success?: boolean;
  Result?: string;
  ErrorMessage?: string;
  Cancelled?: boolean;
  CancellationReason?: string | null;
  TokensUsed?: number;
  Cost?: number;
  SaveCount: number;
  /** The row's Status as each save started: the INSERT sees 'Running', the finalize UPDATE the outcome. */
  StatusAtSave: string[];
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
    /** When true, every run-row save reports failure, as a failed INSERT or UPDATE would. */
    failRunSaves: false,
  };

  const byModelID = <T extends { ModelID: string }>(rows: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = norm(row.ModelID);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  };

  const byPromptID = <T extends { PromptID: string }>(rows: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = norm(row.PromptID);
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
    get PromptModelsByPromptID() { return byPromptID(state.promptModels); },
    GetConfigurationChain() { return []; },
    HasCredentialBindings() { return false; },
    GetCredentialBindingsForTarget() { return []; },
    // The real one prefixes texts from the model's catalog config; AIEngine's own tests cover that.
    PrepareEmbeddingInput: vi.fn((_model: unknown, texts: string[]) => ({ texts, maxInputTokens: undefined as number | undefined })),
  };

  let runSeq = 0;
  /** Returned for 'MJ: AI Prompt Runs'; the runner's base class sets many more fields than these at runtime. */
  class FakePromptRun implements RecordedRun {
    public ID = '';
    public UserID?: string | null = null;
    public Status?: string;
    public SaveCount = 0;
    public StatusAtSave: string[] = [];
    public LatestResult: { CompleteMessage: string } | null = null;
    public NewRecord(): boolean {
      this.ID = `run-${++runSeq}`;
      state.runs.push(this);
      return true;
    }
    public async Save(): Promise<boolean> {
      this.StatusAtSave.push(this.Status ?? '');
      await new Promise(resolve => setTimeout(resolve, 2));
      this.SaveCount++;
      if (state.failRunSaves) {
        this.LatestResult = { CompleteMessage: 'simulated save failure' };
        return false;
      }
      return true;
    }
  }

  /**
   * Returned for 'MJ: AI Prompts', which the runner asks for only when no Embedding prompt exists.
   * The real GetEntityObject hands back a new record carrying the entity's defaults.
   */
  class FakeNewPrompt {
    public ID = 'unsaved-prompt';
    public Name = '';
    public Status: MJAIPromptEntityExtended['Status'] = 'Pending';
    public AIModelTypeID: string | null = null;
    public SelectionStrategy: MJAIPromptEntityExtended['SelectionStrategy'] = 'Default';
    public FailoverStrategy: MJAIPromptEntityExtended['FailoverStrategy'] = 'SameModelDifferentVendor';
    public RequireSpecificModels = false;
  }

  const provider = {
    GetEntityObject: vi.fn(async (entityName: string) => {
      if (entityName === 'MJ: AI Prompt Runs') {
        return new FakePromptRun();
      }
      return entityName === 'MJ: AI Prompts' ? new FakeNewPrompt() : null;
    }),
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
    FailoverStrategy: 'SameModelDifferentVendor',
    RequireSpecificModels: false,
  }];
  h.state.promptModels = [
    MakePromptModel({ ID: 'pm-001', PromptID: PROMPT_ID, ModelID: MODEL_1_ID, Priority: 10 }),
    MakePromptModel({ ID: 'pm-002', PromptID: PROMPT_ID, ModelID: MODEL_2_ID, Priority: 5 }),
  ];
  h.state.configuredDrivers = new Set([DRIVER_1, DRIVER_1B, DRIVER_2]);
}

function setFailoverStrategy(strategy: FakePrompt['FailoverStrategy']): void {
  h.state.prompts[0].FailoverStrategy = strategy;
}

/** Gives model 1 a second, lower-priority vendor on driver 1B, so same-model failover has somewhere to go. */
function addSecondVendorToModel1(): FxModelVendor {
  const mv1b = embeddingVendor('mv-001b', MODEL_1_ID, VENDOR.AmazonBedrock, 'Amazon Bedrock', DRIVER_1B, 'text-embed-1', 8);
  h.state.modelVendors.push(mv1b);
  h.state.models.find(m => m.ID === MODEL_1_ID)?.ModelVendors.push(mv1b);
  return mv1b;
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
    h.state.failRunSaves = false;
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
    expect(run?.UserID).toBe(mockUser.ID);
    expect(run?.Success).toBe(true);
    expect(run?.Status).toBe('Completed');
    expect(run?.TokensUsed).toBe(20);
    expect(run?.Cost).toBe(0.0002);
    expect(run?.SaveCount).toBeGreaterThanOrEqual(2);
    const parsedResult = JSON.parse(run?.Result ?? '{}');
    expect(parsedResult.vectorCount).toBe(2);
    expect(parsedResult.dimensions).toBe(3);
  });

  it('runs the prompt-model row\'s vendor, not its model\'s top vendor, with failover off', async () => {
    const mv1b = addSecondVendorToModel1(); // Bedrock (driver 1B, priority 8) below OpenAI (priority 10)
    h.state.prompts[0].SelectionStrategy = 'Default';
    setFailoverStrategy('None');
    h.state.promptModels[0] = MakePromptModel({ ID: 'pm-001', PromptID: PROMPT_ID, ModelID: MODEL_1_ID, VendorID: mv1b.VendorID, Priority: 10 });

    const result = await runner.RunEmbedding({ Texts: ['row vendor'], ContextUser: mockUser, PromptID: PROMPT_ID });

    expect(result.Success).toBe(true);
    expect(scriptFor(DRIVER_1B).Calls).toHaveLength(1);
    expect(scriptFor(DRIVER_1).Calls).toHaveLength(0);
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

  describe('failover follows the prompt\'s FailoverStrategy', () => {
    const serviceUnavailable = (): Promise<EmbedTextsResult> => Promise.reject(new Error('503 Service Unavailable'));

    it('a 503 under SameModelDifferentVendor fails rather than answering from another model', async () => {
      scriptFor(DRIVER_1).Answer = serviceUnavailable;

      const result = await runner.RunEmbedding({
        Texts: ['failover test text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
      });

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('503');
      expect(result.ModelID).toBe(MODEL_1_ID);
      expect(result.Vectors).toEqual([]);
      expect(scriptFor(DRIVER_1).Calls).toHaveLength(1);
      expect(scriptFor(DRIVER_2).Calls).toHaveLength(0);
      expect(scriptFor(DRIVER_LOCAL).Calls).toHaveLength(0);
    });

    it('under SameModelDifferentVendor, a 503 fails over to another vendor of the same model', async () => {
      const mv1b = addSecondVendorToModel1();
      scriptFor(DRIVER_1).Answer = serviceUnavailable;

      const result = await runner.RunEmbedding({
        Texts: ['failover test text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
      });

      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(MODEL_1_ID);
      expect(result.ModelInfo?.vendorId).toBe(mv1b.VendorID);
      expect(scriptFor(DRIVER_1B).Calls).toHaveLength(1);
      expect(scriptFor(DRIVER_2).Calls).toHaveLength(0);
    });

    it('under None, a 503 fails without trying another vendor of the same model', async () => {
      setFailoverStrategy('None');
      addSecondVendorToModel1();
      scriptFor(DRIVER_1).Answer = serviceUnavailable;

      const result = await runner.RunEmbedding({
        Texts: ['failover test text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
      });

      expect(result.Success).toBe(false);
      expect(result.ModelID).toBe(MODEL_1_ID);
      expect(scriptFor(DRIVER_1).Calls).toHaveLength(1);
      expect(scriptFor(DRIVER_1B).Calls).toHaveLength(0);
      expect(scriptFor(DRIVER_2).Calls).toHaveLength(0);
    });

    it('under NextBestModel, a 503 fails over to the second model, naming the second model', async () => {
      setFailoverStrategy('NextBestModel');
      scriptFor(DRIVER_1).Answer = serviceUnavailable;

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

    it('a pinned call under NextBestModel still never leaves the pinned model', async () => {
      setFailoverStrategy('NextBestModel');
      scriptFor(DRIVER_1).Answer = serviceUnavailable;

      const result = await runner.RunEmbedding({
        Texts: ['pinned failover text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
        ModelID: MODEL_1_ID,
      });

      expect(result.Success).toBe(false);
      expect(scriptFor(DRIVER_2).Calls).toHaveLength(0);
      expect(scriptFor(DRIVER_LOCAL).Calls).toHaveLength(0);
    });
  });

  it('an unpinned call may answer from a model the prompt does not name: here the keyless fallback', async () => {
    h.state.configuredDrivers.clear();

    const result = await runner.RunEmbedding({
      Texts: ['unpinned text'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
    });

    expect(result.Success).toBe(true);
    expect(result.ModelID).toBe(LOCAL_MODEL_ID);
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

  it('sends the texts AIEngine prepared, with the input type and the catalog token cap', async () => {
    h.engine.PrepareEmbeddingInput.mockImplementationOnce((_model: unknown, texts: string[]) => ({
      texts: texts.map(t => `task: search result | query: ${t}`),
      maxInputTokens: 8192,
    }));
    const result = await runner.RunEmbedding({
      Texts: ['red planet'],
      ContextUser: mockUser,
      PromptID: PROMPT_ID,
      InputType: 'query',
    });

    expect(result.Success).toBe(true);
    expect(h.engine.PrepareEmbeddingInput).toHaveBeenCalledWith(expect.objectContaining({ ID: expect.any(String) }), ['red planet'], 'query', expect.anything());
    expect(scriptFor(DRIVER_1).Calls[0]).toMatchObject({
      texts: ['task: search result | query: red planet'],
      inputType: 'query',
      maxInputTokens: 8192,
    });
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

  describe('run rows', () => {
    it('SkipRunRecord embeds without writing a row, and returns a null PromptRunID', async () => {
      const result = await runner.RunEmbedding({
        Texts: ['search query'],
        ContextUser: mockUser,
        ModelID: MODEL_1_ID,
        SkipRunRecord: true,
      });

      expect(result.Success).toBe(true);
      expect(result.PromptRunID).toBeNull();
      await runner.WaitForPendingPromptRunSaves();
      expect(h.state.runs).toHaveLength(0);
    });

    it('without PromptID, the row is recorded against the first active Embedding prompt', async () => {
      const result = await runner.RunEmbedding({
        Texts: ['vector sync batch'],
        ContextUser: mockUser,
        ModelID: MODEL_1_ID,
      });

      expect(result.Success).toBe(true);
      await runner.WaitForPendingPromptRunSaves();
      expect(lastRun()?.PromptID).toBe(PROMPT_ID);
    });

    it('with no Embedding prompt, a pinned call runs under an unsaved stand-in and writes no row', async () => {
      h.state.prompts = [];

      const result = await runner.RunEmbedding({
        Texts: ['no prompt configured'],
        ContextUser: mockUser,
        ModelID: MODEL_1_ID,
      });

      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(MODEL_1_ID);
      expect(result.PromptRunID).toBeNull();
      expect(h.provider.GetEntityObject).toHaveBeenCalledWith('MJ: AI Prompts', mockUser);
      await runner.WaitForPendingPromptRunSaves();
      expect(h.state.runs).toHaveLength(0);
    });

    it('the stand-in keeps a pinned call on the pinned model when it fails', async () => {
      h.state.prompts = [];
      addSecondVendorToModel1();
      scriptFor(DRIVER_1).Answer = () => Promise.reject(new Error('503 Service Unavailable'));

      const result = await runner.RunEmbedding({
        Texts: ['no prompt configured'],
        ContextUser: mockUser,
        ModelID: MODEL_1_ID,
      });

      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(MODEL_1_ID);
      expect(scriptFor(DRIVER_1B).Calls).toHaveLength(1);
    });

    it('the INSERT lands before the finalize UPDATE', async () => {
      await runner.RunEmbedding({ Texts: ['ordered saves'], ContextUser: mockUser, PromptID: PROMPT_ID });
      await runner.WaitForPendingPromptRunSaves();

      expect(lastRun()?.StatusAtSave).toEqual(['Running', 'Completed']);
    });

    it('a failed run-row save does not fail the call, and the flush still settles', async () => {
      h.state.failRunSaves = true;

      const result = await runner.RunEmbedding({ Texts: ['save fails'], ContextUser: mockUser, PromptID: PROMPT_ID });

      expect(result.Success).toBe(true);
      expect(result.Vectors).toHaveLength(1);
      await expect(runner.WaitForPendingPromptRunSaves()).resolves.toBeUndefined();
    });

    it('WaitForPendingPromptRunSaves resolves with nothing queued, on the runner and on AIModelRunner', async () => {
      await expect(runner.WaitForPendingPromptRunSaves()).resolves.toBeUndefined();
      await expect(new AIModelRunner().WaitForPendingPromptRunSaves()).resolves.toBeUndefined();
    });

    it('an unknown PromptID fails clearly and writes no row', async () => {
      const result = await runner.RunEmbedding({
        Texts: ['text'],
        ContextUser: mockUser,
        PromptID: 'E0000000-0000-0000-0000-00000000DEAD',
      });

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('was not found');
      expect(h.state.runs).toHaveLength(0);
    });
  });

  describe('timeout and cancellation', () => {
    /** A driver call that never settles on its own: it ignores any signal it is given. */
    const neverSettles = (): Promise<EmbedTextsResult> => new Promise<EmbedTextsResult>(() => { /* hangs */ });

    /** A driver call that hangs until its signal aborts, then rejects as `fetch` does. */
    const hangsUntilAborted = (params: EmbedTextsParams): Promise<EmbedTextsResult> =>
      new Promise<EmbedTextsResult>((_, reject) => {
        params.CancellationToken?.addEventListener('abort', () => {
          const abort = new Error('This operation was aborted');
          abort.name = 'AbortError';
          reject(abort);
        }, { once: true });
      });

    it('a token already aborted is refused before a run row exists, and no driver is called', async () => {
      const controller = new AbortController();
      controller.abort('stop');

      const result = await runner.RunEmbedding({
        Texts: ['text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
        CancellationToken: controller.signal,
      });

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('The Embeddings call was cancelled before it started');
      expect(result.PromptRunID).toBeNull();
      expect(h.state.runs).toHaveLength(0);
      expect(scriptFor(DRIVER_1).Calls).toHaveLength(0);
    });

    it('cancelled mid-call: the call ends at once, is not failed over, and the row is recorded Cancelled', async () => {
      addSecondVendorToModel1();
      const controller = new AbortController();
      scriptFor(DRIVER_1).Answer = () => {
        controller.abort('user pressed stop');
        return neverSettles();
      };

      const result = await runner.RunEmbedding({
        Texts: ['text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
        CancellationToken: controller.signal,
      });
      await runner.WaitForPendingPromptRunSaves();

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('The Embeddings call was cancelled');
      expect(scriptFor(DRIVER_1).Calls).toHaveLength(1);
      expect(scriptFor(DRIVER_1B).Calls).toHaveLength(0);
      const run = lastRun();
      expect(run?.ID).toBe(result.PromptRunID);
      expect(run?.Status).toBe('Cancelled');
      expect(run?.Cancelled).toBe(true);
      expect(run?.CancellationReason).toBe('user_requested');
      expect(run?.Success).toBe(false);
    });

    it('a driver that reports the abort itself is still recorded Cancelled, not failed over', async () => {
      addSecondVendorToModel1();
      const controller = new AbortController();
      scriptFor(DRIVER_1).Answer = (params) => {
        const pending = hangsUntilAborted(params);
        controller.abort('user pressed stop');
        return pending;
      };

      const result = await runner.RunEmbedding({
        Texts: ['text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
        TimeoutMS: 60_000,
        CancellationToken: controller.signal,
      });
      await runner.WaitForPendingPromptRunSaves();

      expect(result.Success).toBe(false);
      expect(scriptFor(DRIVER_1B).Calls).toHaveLength(0);
      expect(lastRun()?.Status).toBe('Cancelled');
    });

    it('a timeout aborts the driver\'s request and fails over to the next vendor', async () => {
      addSecondVendorToModel1();
      scriptFor(DRIVER_1).Answer = hangsUntilAborted;

      const result = await runner.RunEmbedding({
        Texts: ['text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
        TimeoutMS: 30,
      });
      await runner.WaitForPendingPromptRunSaves();

      expect(result.Success).toBe(true);
      expect(scriptFor(DRIVER_1).Calls).toHaveLength(1);
      expect(scriptFor(DRIVER_1).Calls[0].CancellationToken?.aborted).toBe(true);
      expect(scriptFor(DRIVER_1B).Calls).toHaveLength(1);
      expect(lastRun()?.Status).toBe('Completed');
    });

    it('a timeout on a driver that ignores its signal still ends the wait and fails over', async () => {
      addSecondVendorToModel1();
      scriptFor(DRIVER_1).Answer = neverSettles;

      const result = await runner.RunEmbedding({
        Texts: ['text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
        TimeoutMS: 30,
      });

      expect(result.Success).toBe(true);
      expect(scriptFor(DRIVER_1B).Calls).toHaveLength(1);
    });

    it('the driver receives the bound\'s signal, which aborts when the caller cancels', async () => {
      const controller = new AbortController();
      let seen: AbortSignal | undefined;
      scriptFor(DRIVER_1).Answer = (params) => {
        seen = params.CancellationToken;
        const pending = hangsUntilAborted(params);
        controller.abort('stop');
        return pending;
      };

      await runner.RunEmbedding({
        Texts: ['text'],
        ContextUser: mockUser,
        PromptID: PROMPT_ID,
        TimeoutMS: 60_000,
        CancellationToken: controller.signal,
      });

      expect(seen).toBeDefined();
      expect(seen).not.toBe(controller.signal); // the composed bound, not the caller's token itself
      expect(seen?.aborted).toBe(true);
    });

    it('with neither a timeout nor a token, the driver gets no signal', async () => {
      await runner.RunEmbedding({ Texts: ['text'], ContextUser: mockUser, PromptID: PROMPT_ID });
      expect(scriptFor(DRIVER_1).Calls[0].CancellationToken).toBeUndefined();
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
