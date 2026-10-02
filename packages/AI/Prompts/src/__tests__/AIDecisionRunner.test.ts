import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
  BaseDecision,
  BaseSystemOneDecision,
  DecisionParams,
  DecisionResult,
  DecisionQuestion,
  ModelUsage,
  GetAIAPIKey,
} from '@memberjunction/ai';
import type {
  MJAIPromptEntityExtended,
  MJAIModelEntityExtended,
  AIPromptParams,
  AIPromptRunResult,
} from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '../AIPromptRunner';
import { AIDecisionRunner } from '../decision/AIDecisionRunner';
import { LLMDecision } from '../decision/LLMDecision';
import { AIDecisionParams } from '../decision/decision-runner.types';
import {
  buildRealisticCatalog,
  MODEL_TYPE,
  VENDOR,
  type AICatalog,
} from './__fixtures__/ai-metadata.fixtures';

// ---------------------------------------------------------------------------
// Hoisted mock state and AIEngine mock
// ---------------------------------------------------------------------------
const DECISION_MODEL_TYPE_ID = '54866355-E16E-49ED-80A9-79E151A81281';

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
    modelConfigs: Map<string, Record<string, unknown>>;
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
    modelConfigs: new Map(),
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
    GetEffectiveModelConfiguration(modelId: string, _modelVendorId?: string) {
      return state.modelConfigs.get(norm(modelId));
    },
    HasCredentialBindings() { return false; },
    GetCredentialBindingsForTarget() { return []; },
  };

  const mockTemplatesArray: Array<{
    ID: string;
    Name: string;
    GetHighestPriorityContent: () => { ID: string; TemplateText: string } | null;
  }> = [];

  const mockRenderTemplate = vi.fn(async (_template: unknown, _content: unknown, data: Record<string, unknown>) => {
    return {
      Success: true,
      Output: `Rendered state for entity ${data?.entityId ?? 'default'}`,
    };
  });

  return {
    state,
    engine,
    logStatus: vi.fn(),
    getApiKey: (d: string) => (state.configuredDrivers.has(d) ? 'test-api-key' : ''),
    mockTemplatesArray,
    mockRenderTemplate,
  };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, AIEngine: { Instance: h.engine } };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, LogStatus: h.logStatus };
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

// ---------------------------------------------------------------------------
// TemplateEngineServer Mock
// ---------------------------------------------------------------------------
vi.mock('@memberjunction/templates', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
  return {
    ...actual,
    TemplateEngineServer: {
      Instance: {
        Config: vi.fn().mockResolvedValue(undefined),
        get Templates() {
          return h.mockTemplatesArray;
        },
        RenderTemplate: h.mockRenderTemplate,
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Controllable Decision Driver
// ---------------------------------------------------------------------------
class MockDecisionDriver extends BaseDecision {
  public lastParams?: DecisionParams;
  public decideOverride?: (params: DecisionParams) => Promise<DecisionResult>;

  constructor(apiKey = 'test-key') {
    super(apiKey);
  }

  protected async DoDecide(params: DecisionParams): Promise<DecisionResult> {
    this.lastParams = params;
    if (this.decideOverride) {
      return this.decideOverride(params);
    }

    const startTime = new Date();
    const result = new DecisionResult(true, startTime, new Date());
    for (const [key, q] of Object.entries(params.Questions)) {
      if (q.Kind === 'Likelihood') {
        result.Answers[key] = {
          Kind: 'Likelihood',
          Probability: 0.85,
        };
      } else if (q.Kind === 'Choice') {
        const firstOpt = q.Options[0]?.Value ?? 'opt1';
        const probs: Record<string, number> = {};
        for (let i = 0; i < q.Options.length; i++) {
          probs[q.Options[i].Value] = i === 0 ? 1 : 0;
        }
        result.Answers[key] = {
          Kind: 'Choice',
          Value: firstOpt,
          Confidence: 0.9,
          Probabilities: probs,
        };
      } else if (q.Kind === 'Score') {
        const probs: Record<string, number> = {};
        for (let i = 0; i < q.Levels.length; i++) {
          probs[q.Levels[i]] = i === 0 ? 1 : 0;
        }
        result.Answers[key] = {
          Kind: 'Score',
          Value: 0,
          Confidence: 0.95,
          Probabilities: probs,
        };
      }
    }
    result.Usage = new ModelUsage(120, 45, 0.002, 'USD');
    result.ResolvedModel = 'test-decision-model-v1';
    return result;
  }
}

// ---------------------------------------------------------------------------
// Registered drivers, for tests that build drivers through the real ClassFactory
// ---------------------------------------------------------------------------
const SCRIPTED_LLM_DRIVER = 'ScriptedLLMDecision';
const SCRIPTED_NATIVE_DRIVER = 'ScriptedNativeDecision';

/**
 * An `LLMDecision` whose results are scripted, so no chat prompt runs. The runner links it to the
 * decision's run as it does a real one. It is registered under its own key, not 'LLMDecision'.
 */
@RegisterClass(BaseDecision, SCRIPTED_LLM_DRIVER)
class ScriptedLLMDecision extends LLMDecision {
  /** One result per call, in call order; the last one repeats. */
  public static Script: Array<() => DecisionResult> = [];
  /** The `ParentPromptRunID` each call ran under: the parent its chat run would name. */
  public static ParentsSeen: Array<string | undefined> = [];

  constructor(apiKey: string) {
    super(apiKey, 'chat-prompt-001', new UserInfo());
  }

  protected override async DoDecide(): Promise<DecisionResult> {
    const call = ScriptedLLMDecision.ParentsSeen.length;
    ScriptedLLMDecision.ParentsSeen.push(this.ParentPromptRunID);
    const script = ScriptedLLMDecision.Script;
    return script[Math.min(call, script.length - 1)]();
  }
}

/** A driver that calls its model directly, answering with Usage(120, 45, 0.002, 'USD'). */
@RegisterClass(BaseDecision, SCRIPTED_NATIVE_DRIVER)
class ScriptedNativeDecision extends MockDecisionDriver {}

/** A decision that answers its Likelihood question, after a model call that cost `cost`. */
function answeredWith(cost: number): DecisionResult {
  const answered = new DecisionResult(true, new Date(), new Date());
  answered.Answers = { q_likelihood: { Kind: 'Likelihood', Probability: 0.4 } };
  answered.Usage = new ModelUsage(120, 45, cost, 'USD');
  return answered;
}

/** A failed decision that allows failover, after a model call that cost `cost`. */
function failedOverAfter(cost: number): DecisionResult {
  const failed = new DecisionResult(false, new Date(), new Date());
  failed.errorMessage = 'Service unavailable';
  failed.errorInfo = { errorType: 'ServiceUnavailable', severity: 'Retriable', canFailover: true };
  failed.Usage = new ModelUsage(80, 10, cost, 'USD');
  return failed;
}

// ---------------------------------------------------------------------------
// Fake Prompt Run & Provider
// ---------------------------------------------------------------------------
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
  public ModelSpecificResponseDetails?: string;
  public TokensPrompt?: number;
  public TokensCompletion?: number;
  public TokensUsed?: number;
  public Cost?: number;
  public CostCurrency?: string;
  public LatestResult: { CompleteMessage: string } | null = null;
  public saveCount = 0;
  /** Whether a Save has succeeded, as `BaseEntity.IsSaved` reports it. */
  public IsSaved = false;
  /** When set, every Save fails, as an INSERT that fails validation does. */
  public static FailSaves = false;
  [k: string]: unknown;

  NewRecord(): boolean {
    this.ID = `pr-${++prSeq}`;
    return true;
  }
  async Save(): Promise<boolean> {
    this.saveCount++;
    if (FakePromptRun.FailSaves) {
      this.LatestResult = { CompleteMessage: 'Vendor cannot be null' };
      return false;
    }
    this.IsSaved = true;
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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('AIDecisionRunner', () => {
  let runner: AIDecisionRunner;
  let mockDriver: MockDecisionDriver;

  const NATIVE_DRIVER = 'TestDecisionDriver';
  const LLM_DRIVER = 'LLMDecision';
  const DECISION_MODEL_ID = 'decision-model-001';
  const LLM_DECISION_MODEL_ID = 'llm-decision-model-002';
  const CHAT_PROMPT_ID = 'chat-prompt-001';
  const TEMPLATE_ID = 'tmpl-decision-001';

  const defaultQuestions: Record<string, DecisionQuestion> = {
    q_likelihood: {
      Kind: 'Likelihood',
      Instructions: 'Is this high priority?',
    },
    q_choice: {
      Kind: 'Choice',
      Instructions: 'Select department',
      Options: [
        { Value: 'billing', Description: 'Billing related' },
        { Value: 'tech_support', Description: 'Technical support' },
      ],
    },
    q_score: {
      Kind: 'Score',
      Instructions: 'Rate urgency',
      Levels: ['low', 'medium', 'high'],
    },
  };

  function setupCatalog(): void {
    const catalog = buildRealisticCatalog();
    h.state.vendorTypeDefinitions = catalog.vendorTypeDefinitions;
    h.state.vendors = catalog.vendors;
    h.state.modelTypes = [
      ...catalog.modelTypes,
      { ID: DECISION_MODEL_TYPE_ID, Name: 'Decision' },
    ];
    h.state.configurations = catalog.configurations;

    // Add native decision model
    const nativeModel = {
      ID: DECISION_MODEL_ID,
      Name: 'Native Decision Model',
      AIModelTypeID: DECISION_MODEL_TYPE_ID,
      DriverClass: NATIVE_DRIVER,
      APIName: 'native-decision-v1',
      Status: 'Active',
      IsActive: true,
      PowerRank: 50,
      ModelVendors: [
        {
          ID: 'mv-decision-1',
          ModelID: DECISION_MODEL_ID,
          VendorID: VENDOR.OpenAI,
          Vendor: 'OpenAI',
          Priority: 100,
          Status: 'Active',
          DriverClass: NATIVE_DRIVER,
          APIName: 'native-decision-v1',
        },
      ],
    };

    // Add LLMDecision model
    const llmDecisionModel = {
      ID: LLM_DECISION_MODEL_ID,
      Name: 'LLM Decision Model',
      AIModelTypeID: DECISION_MODEL_TYPE_ID,
      DriverClass: LLM_DRIVER,
      APIName: 'Decision System Chat Prompt',
      Status: 'Active',
      IsActive: true,
      PowerRank: 50,
      ModelVendors: [
        {
          ID: 'mv-llm-decision-1',
          ModelID: LLM_DECISION_MODEL_ID,
          VendorID: VENDOR.OpenAI,
          Vendor: 'OpenAI',
          Priority: 90,
          Status: 'Active',
          DriverClass: LLM_DRIVER,
          APIName: 'Decision System Chat Prompt',
        },
      ],
    };

    h.state.models = [...catalog.models, nativeModel, llmDecisionModel];
    h.state.modelVendors = [
      ...catalog.modelVendors,
      nativeModel.ModelVendors[0],
      llmDecisionModel.ModelVendors[0],
    ];
    h.state.promptModels = [
      {
        ID: 'pm-decision-1',
        PromptID: 'decision-prompt-001',
        ModelID: DECISION_MODEL_ID,
        VendorID: VENDOR.OpenAI,
        Priority: 100,
        Status: 'Active',
        ConfigurationID: null,
      },
    ];
    h.state.prompts = [
      {
        ID: CHAT_PROMPT_ID,
        Name: 'Decision System Chat Prompt',
        Status: 'Active',
      },
    ];
    h.state.configuredDrivers = new Set([NATIVE_DRIVER]);
    h.state.modelConfigs = new Map();
  }

  function makeDecisionPrompt(overrides: Record<string, unknown> = {}): MJAIPromptEntityExtended {
    return {
      ID: 'decision-prompt-001',
      Name: 'Test Decision Prompt',
      Status: 'Active',
      TemplateID: null,
      SelectionStrategy: 'Specific',
      AIModelTypeID: DECISION_MODEL_TYPE_ID,
      RequireSpecificModels: false,
      MaxRetries: 0,
      ...overrides,
    } as unknown as MJAIPromptEntityExtended;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    FakePromptRun.FailSaves = false;
    setupCatalog();
    h.mockTemplatesArray.length = 0;
    h.mockTemplatesArray.push({
      ID: TEMPLATE_ID,
      Name: 'Decision Template',
      GetHighestPriorityContent: () => ({
        ID: 'tmpl-content-1',
        TemplateText: 'Evaluate entity {{entityId}}',
      }),
    });

    mockDriver = new MockDecisionDriver();
    vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined as never);
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(
      (_baseClass: unknown, driverClass: string) => {
        if (driverClass === NATIVE_DRIVER || driverClass === LLM_DRIVER) {
          return mockDriver as never;
        }
        return undefined as never;
      }
    );

    runner = new AIDecisionRunner();
  });

  // 1. Rejects missing prompt with success: false and error message without throwing
  it('1. rejects missing prompt with success: false and error message without throwing', async () => {
    const params = new AIDecisionParams();
    params.Questions = defaultQuestions;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(false);
    expect(result.status).toBe('Failed');
    expect(result.errorMessage).toMatch(/prompt is required/i);
    expect(result.Answers).toEqual({});
  });

  // 2. Rejects empty questions map with success: false
  it('2. rejects empty questions map with success: false', async () => {
    const prompt = makeDecisionPrompt();
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.Questions = {};

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(false);
    expect(result.status).toBe('Failed');
    expect(result.errorMessage).toMatch(/at least one question is required/i);
    expect(result.Answers).toEqual({});
  });

  // 3. Incompatible model type on prompt (e.g. LLM instead of Decision) returns success: false
  it('3. rejects prompt with incompatible model type (LLM instead of Decision) with success: false', async () => {
    const prompt = makeDecisionPrompt({
      AIModelTypeID: MODEL_TYPE.LLM,
    });
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.Questions = defaultQuestions;
    params.State = 'Sample state';
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(false);
    expect(result.status).toBe('Failed');
    expect(result.errorMessage).toMatch(/requires.*Decision/i);
    expect(result.Answers).toEqual({});
  });

  // 4. Template rendering path: when State is omitted from params, renders template and passes rendered string to driver
  it('4. renders template when State is omitted and passes rendered output to driver', async () => {
    const prompt = makeDecisionPrompt({
      TemplateID: TEMPLATE_ID,
    });
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.Questions = defaultQuestions;
    params.data = { entityId: 'E-456' };
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(true);
    expect(h.mockRenderTemplate).toHaveBeenCalled();
    expect(mockDriver.lastParams?.State).toBe('Rendered state for entity E-456');
  });

  // 5. Direct state path: when State is provided as string or object, uses it directly without template rendering
  it('5. uses State directly without rendering template when State is provided', async () => {
    const prompt = makeDecisionPrompt({
      TemplateID: TEMPLATE_ID,
    });
    const directState = { customerId: 'cust-999', balance: 500 };
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.Questions = defaultQuestions;
    params.State = directState;
    params.provider = fakeProvider;

    h.mockRenderTemplate.mockClear();
    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(true);
    expect(h.mockRenderTemplate).not.toHaveBeenCalled();
    expect(mockDriver.lastParams?.State).toEqual(directState);
  });

  // 6. Limit enforcement: rejects when questions count, choice options count, or score levels count exceed model config limits
  describe('6. limit enforcement against model configuration', () => {
    it('6a. rejects when question count exceeds MaxQuestionsPerCall', async () => {
      h.state.modelConfigs.set(DECISION_MODEL_ID.toLowerCase(), {
        Decision: {
          MaxQuestionsPerCall: 2,
        },
      });

      const prompt = makeDecisionPrompt();
      const params = new AIDecisionParams();
      params.prompt = prompt;
      params.Questions = defaultQuestions; // has 3 questions
      params.State = 'Test state';
      params.provider = fakeProvider;

      const result = await runner.ExecuteDecision(params);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/3 questions exceed the limit of 2/i);
    });

    it('6b. rejects when choice option count exceeds MaxChoiceOptions', async () => {
      h.state.modelConfigs.set(DECISION_MODEL_ID.toLowerCase(), {
        Decision: {
          MaxChoiceOptions: 2,
        },
      });

      const prompt = makeDecisionPrompt();
      const params = new AIDecisionParams();
      params.prompt = prompt;
      params.Questions = {
        q_choice: {
          Kind: 'Choice',
          Instructions: 'Choose one',
          Options: [
            { Value: 'opt1', Description: 'One' },
            { Value: 'opt2', Description: 'Two' },
            { Value: 'opt3', Description: 'Three' },
          ],
        },
      };
      params.State = 'Test state';
      params.provider = fakeProvider;

      const result = await runner.ExecuteDecision(params);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/3 options, over the limit of 2/i);
    });

    it('6c. rejects when score level count exceeds MaxScoreLevels', async () => {
      h.state.modelConfigs.set(DECISION_MODEL_ID.toLowerCase(), {
        Decision: {
          MaxScoreLevels: 3,
        },
      });

      const prompt = makeDecisionPrompt();
      const params = new AIDecisionParams();
      params.prompt = prompt;
      params.Questions = {
        q_score: {
          Kind: 'Score',
          Instructions: 'Rate',
          Levels: ['level1', 'level2', 'level3', 'level4'],
        },
      };
      params.State = 'Test state';
      params.provider = fakeProvider;

      const result = await runner.ExecuteDecision(params);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/4 levels, over the limit of 3/i);
    });
  });

  // 7. Credential check: LLMDecision candidate bypasses credential requirement; other driver requires credentials and fails when none available
  describe('7. credential checking behavior', () => {
    it('7a. native driver requires credentials and fails when driver has no API key', async () => {
      h.state.configuredDrivers.clear(); // remove credentials for NATIVE_DRIVER

      const prompt = makeDecisionPrompt();
      const params = new AIDecisionParams();
      params.prompt = prompt;
      params.override = { modelId: DECISION_MODEL_ID };
      params.Questions = defaultQuestions;
      params.State = 'Test state';
      params.provider = fakeProvider;

      const result = await runner.ExecuteDecision(params);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/no Decision model has credentials available/i);
    });

    it('7b. LLMDecision bypasses credential requirement even when LLMDecision has no direct API key', async () => {
      h.state.configuredDrivers.clear(); // no credentials configured anywhere

      h.state.promptModels = [
        {
          ID: 'pm-llm-decision-1',
          PromptID: 'decision-prompt-001',
          ModelID: LLM_DECISION_MODEL_ID,
          VendorID: VENDOR.OpenAI,
          Priority: 100,
          Status: 'Active',
          ConfigurationID: null,
        },
      ];

      const prompt = makeDecisionPrompt();
      const params = new AIDecisionParams();
      params.prompt = prompt;
      params.Questions = defaultQuestions;
      params.State = 'Test state';
      params.provider = fakeProvider;

      const result = await runner.ExecuteDecision(params);

      expect(result.success).toBe(true);
      expect(mockDriver.lastParams?.Model).toBe('Decision System Chat Prompt');
      // LLMDecision is built with the ID of the chat prompt its APIName names, and no API key.
      expect(MJGlobal.Instance.ClassFactory.CreateInstance).toHaveBeenCalledWith(
        BaseDecision, LLM_DRIVER, '', CHAT_PROMPT_ID, params.contextUser
      );
      expect(result.DriverClass).toBe(LLM_DRIVER);
    });

    it("7c. fails clearly when LLMDecision's chat prompt does not exist", async () => {
      h.state.configuredDrivers.clear();
      h.state.prompts = [];
      h.state.promptModels = [
        { ID: 'pm-llm-decision-1', PromptID: 'decision-prompt-001', ModelID: LLM_DECISION_MODEL_ID, VendorID: VENDOR.OpenAI, Priority: 100, Status: 'Active', ConfigurationID: null },
      ];
      const params = new AIDecisionParams();
      params.prompt = makeDecisionPrompt({ FailoverStrategy: 'None' });
      params.Questions = defaultQuestions;
      params.State = 'Test state';
      params.provider = fakeProvider;

      const result = await runner.ExecuteDecision(params);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/chat prompt 'Decision System Chat Prompt' was not found/);
      expect(result.Answers).toEqual({});
    });
  });

  // 8. Driver dispatch and answer mapping: verifies Likelihood, Choice, and Score answers are correctly mapped into AIDecisionRunResult
  it('8. dispatches driver and maps Likelihood, Choice, and Score answers into AIDecisionRunResult', async () => {
    const prompt = makeDecisionPrompt();
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.Questions = defaultQuestions;
    params.State = 'Test state to evaluate';
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(true);
    expect(result.status).toBe('Completed');

    // Verify answers mapping
    expect(result.Answers.q_likelihood).toEqual({
      Kind: 'Likelihood',
      Probability: 0.85,
    });
    expect(result.Answers.q_choice).toMatchObject({
      Kind: 'Choice',
      Value: 'billing',
      Confidence: 0.9,
    });
    expect(result.Answers.q_score).toMatchObject({
      Kind: 'Score',
      Value: 0,
      Confidence: 0.95,
      Probabilities: { low: 1, medium: 0, high: 0 },
    });
    expect(result.DecisionResult?.ResolvedModel).toBe('test-decision-model-v1');
    expect(result.DriverClass).toBe(NATIVE_DRIVER);
    expect(result.modelInfo?.modelId).toBe(DECISION_MODEL_ID);

    // Verify telemetry
    expect(result.promptTokens).toBe(120);
    expect(result.completionTokens).toBe(45);
    expect(result.tokensUsed).toBe(165);
    expect(result.cost).toBe(0.002);
    expect(result.costCurrency).toBe('USD');
    expect(result.executionTimeMS).toBeGreaterThanOrEqual(0);

    // Verify promptRun persisted fields
    expect(lastPromptRun).not.toBeNull();
    expect(lastPromptRun?.Success).toBe(true);
    expect(lastPromptRun?.Status).toBe('Completed');
    expect(lastPromptRun?.Messages).toContain('Test state to evaluate');
    // Every answer is persisted with its full distribution, plus the resolved version and usage.
    const persisted = JSON.parse(lastPromptRun?.Result ?? '{}');
    expect(persisted.q_choice.Probabilities).toEqual({ billing: 1, tech_support: 0 });
    expect(JSON.parse(lastPromptRun?.ModelSpecificResponseDetails ?? '{}').ResolvedModel).toBe('test-decision-model-v1');
    expect(lastPromptRun?.TokensPrompt).toBe(120);
    expect(lastPromptRun?.TokensCompletion).toBe(45);
    expect(lastPromptRun?.Cost).toBe(0.002);
  });

  // 9. Failover on retriable error
  it('9. fails over to secondary candidate when primary fails with retriable error', async () => {
    const prompt = makeDecisionPrompt({
      FailoverStrategy: 'NextInList',
      MaxFailoverAttempts: 3,
    });
    const SECONDARY_MODEL_ID = addSecondaryCandidate(prompt.ID);

    let callCount = 0;
    mockDriver.decideOverride = async (p: DecisionParams) => {
      callCount++;
      if (callCount === 1) {
        // First candidate fails with rate limit error
        const fail = new DecisionResult(false, new Date(), new Date());
        fail.errorMessage = 'Rate limit exceeded 429';
        fail.errorInfo = {
          errorType: 'RateLimit',
          severity: 'Retriable',
          canFailover: true,
        };
        return fail;
      }
      // Second candidate succeeds
      const success = new DecisionResult(true, new Date(), new Date());
      success.Answers = {
        q_likelihood: { Kind: 'Likelihood', Probability: 0.99 },
      };
      return success;
    };

    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.Questions = {
      q_likelihood: { Kind: 'Likelihood', Instructions: 'Is ok?' },
    };
    params.State = 'State to test failover';
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(callCount).toBe(2);
    expect(result.success).toBe(true);
    expect(result.Answers.q_likelihood).toEqual({ Kind: 'Likelihood', Probability: 0.99 });
    // The result names the model that answered, not the one first selected.
    expect(result.modelInfo?.modelId).toBe(SECONDARY_MODEL_ID);
  });

  it('10. an unregistered driver class fails with a clear message and never throws', async () => {
    vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockImplementation(() => undefined as never);
    const params = new AIDecisionParams();
    params.prompt = makeDecisionPrompt({ FailoverStrategy: 'None' });
    params.Questions = defaultQuestions;
    params.State = 'Test state';
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/No decision driver is registered for driver class 'TestDecisionDriver'/);
    expect(result.Answers).toEqual({});
  });

  it('11. a driver failure that allows no failover is returned as a failed result', async () => {
    mockDriver.decideOverride = async () => {
      const fail = new DecisionResult(false, new Date(), new Date());
      fail.errorMessage = 'Model rejected the request';
      fail.errorInfo = { errorType: 'InvalidRequest', severity: 'Fatal', canFailover: false };
      return fail;
    };
    const params = new AIDecisionParams();
    params.prompt = makeDecisionPrompt();
    params.Questions = defaultQuestions;
    params.State = 'Test state';
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Model rejected the request');
    expect(result.Answers).toEqual({});
    expect(lastPromptRun?.Success).toBe(false);
    expect(lastPromptRun?.ErrorMessage).toBe('Model rejected the request');
  });

  /** Adds a second, lower-priority native decision model bound to the prompt, and returns its ID. */
  function addSecondaryCandidate(promptId: string): string {
    const SECONDARY_MODEL_ID = 'secondary-decision-model';
    const secondaryModel = {
      ID: SECONDARY_MODEL_ID, Name: 'Secondary Decision Model', AIModelTypeID: DECISION_MODEL_TYPE_ID,
      DriverClass: NATIVE_DRIVER, APIName: 'secondary-v1', Status: 'Active', IsActive: true, PowerRank: 40,
      ModelVendors: [{ ID: 'mv-sec-1', ModelID: SECONDARY_MODEL_ID, VendorID: VENDOR.Anthropic, Priority: 50, Status: 'Active', DriverClass: NATIVE_DRIVER }],
    };
    // Drop the LLMDecision model, so the secondary is the only failover target.
    h.state.models = h.state.models.filter(m => m.ID !== LLM_DECISION_MODEL_ID);
    h.state.modelVendors = h.state.modelVendors.filter(mv => mv.ModelID !== LLM_DECISION_MODEL_ID);
    h.state.models.push(secondaryModel);
    h.state.modelVendors.push(secondaryModel.ModelVendors[0]);
    h.state.promptModels = [
      { ID: 'pm-1', PromptID: promptId, ModelID: DECISION_MODEL_ID, VendorID: VENDOR.OpenAI, Priority: 100, Status: 'Active', ConfigurationID: null },
      { ID: 'pm-2', PromptID: promptId, ModelID: SECONDARY_MODEL_ID, VendorID: VENDOR.Anthropic, Priority: 50, Status: 'Active', ConfigurationID: null },
    ];
    return SECONDARY_MODEL_ID;
  }

  it("9e. a System One driver's configuration error fails over to the next candidate instead of stopping the loop", async () => {
    // The real base class, missing its endpoint: what a fallback Clef with no account ID, or a Kev
    // size with no endpoint bound, returns before any request.
    class UnconfiguredSystemOneDecision extends BaseSystemOneDecision {
      protected get ServiceName(): string { return 'Unconfigured System One'; }
      protected get DefaultModel(): string { return 'unconfigured'; }
      protected GetEndpointURL(): string { return ''; }
      protected GetConfigurationError() {
        return { ErrorType: 'NoCredentials' as const, Message: 'Unconfigured System One has no base URL' };
      }
    }
    const prompt = makeDecisionPrompt({ FailoverStrategy: 'NextInList', MaxFailoverAttempts: 3 });
    const secondaryId = addSecondaryCandidate(prompt.ID);
    let callCount = 0;
    mockDriver.decideOverride = async (p: DecisionParams) => {
      callCount++;
      if (callCount === 1) {
        return new UnconfiguredSystemOneDecision('').Decide(p);
      }
      const success = new DecisionResult(true, new Date(), new Date());
      success.Answers = { q_likelihood: { Kind: 'Likelihood', Probability: 0.7 } };
      return success;
    };
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.Questions = { q_likelihood: { Kind: 'Likelihood', Instructions: 'Is ok?' } };
    params.State = 'State to test failover';
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(callCount).toBe(2);
    expect(result.success).toBe(true);
    expect(result.modelInfo?.modelId).toBe(secondaryId);
  });

  it('9b. a limit breach on the first model fails over to the next, which answers', async () => {
    h.state.modelConfigs.set(DECISION_MODEL_ID.toLowerCase(), { Decision: { MaxQuestionsPerCall: 1 } });
    const prompt = makeDecisionPrompt({ FailoverStrategy: 'NextInList', MaxFailoverAttempts: 3 });
    const secondaryId = addSecondaryCandidate(prompt.ID);
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.Questions = defaultQuestions; // 3 questions, over the first model's limit of 1
    params.State = 'Test state';
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(true);
    expect(mockDriver.lastParams?.Model).toBe('secondary-v1');
    expect(result.modelInfo?.modelId).toBe(secondaryId);
    expect(result.DriverClass).toBe(NATIVE_DRIVER);
  });

  it("9c. warns once when a higher-priority candidate is skipped for lack of a credential", async () => {
    h.logStatus.mockClear();
    // A model no other test uses: the warn-once set lasts for the process.
    const UNKEYED_ID = 'unkeyed-decision-model';
    const unkeyed = {
      ID: UNKEYED_ID, Name: 'Unkeyed Decision Model', AIModelTypeID: DECISION_MODEL_TYPE_ID, DriverClass: 'UnkeyedDriver',
      APIName: 'unkeyed-v1', Status: 'Active', IsActive: true, PowerRank: 60,
      ModelVendors: [{ ID: 'mv-unkeyed-1', ModelID: UNKEYED_ID, VendorID: VENDOR.OpenAI, Priority: 100, Status: 'Active', DriverClass: 'UnkeyedDriver' }],
    };
    h.state.models.push(unkeyed);
    h.state.modelVendors.push(unkeyed.ModelVendors[0]);
    const prompt = makeDecisionPrompt();
    h.state.promptModels = [
      { ID: 'pm-1', PromptID: prompt.ID, ModelID: UNKEYED_ID, VendorID: VENDOR.OpenAI, Priority: 100, Status: 'Active', ConfigurationID: null },
      { ID: 'pm-2', PromptID: prompt.ID, ModelID: LLM_DECISION_MODEL_ID, VendorID: VENDOR.OpenAI, Priority: 50, Status: 'Active', ConfigurationID: null },
    ];
    h.state.configuredDrivers.clear(); // the unkeyed model has no key; LLMDecision needs none
    const run = async (): Promise<void> => {
      const params = new AIDecisionParams();
      params.prompt = prompt;
      params.Questions = defaultQuestions;
      params.State = 'Test state';
      params.provider = fakeProvider;
      const result = await runner.ExecuteDecision(params);
      expect(result.DriverClass).toBe(LLM_DRIVER);
    };

    await run();
    await run();

    const warnings = h.logStatus.mock.calls.filter(c => String(c[0]).includes('AI_VENDOR_API_KEY__UNKEYEDDRIVER'));
    expect(warnings).toHaveLength(1);
  });

  it('9d. an exception after the run row is created finalizes the row as failed', async () => {
    vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockImplementation(() => {
      throw new Error('factory exploded');
    });
    const params = new AIDecisionParams();
    params.prompt = makeDecisionPrompt({ FailoverStrategy: 'None' });
    params.Questions = defaultQuestions;
    params.State = 'Test state';
    params.provider = fakeProvider;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('factory exploded');
    expect(lastPromptRun?.Success).toBe(false);
    expect(lastPromptRun?.Status).not.toBe('Running');
    expect(lastPromptRun?.ErrorMessage).toBe('factory exploded');
  });

  it("12. the caller's cancellation token reaches the driver", async () => {
    const controller = new AbortController();
    const params = new AIDecisionParams();
    params.prompt = makeDecisionPrompt();
    params.Questions = defaultQuestions;
    params.State = 'Test state';
    params.provider = fakeProvider;
    params.cancellationToken = controller.signal;

    await runner.ExecuteDecision(params);

    expect(mockDriver.lastParams?.CancellationToken).toBe(controller.signal);
  });

  it('13. a decision whose caller cancelled is reported as cancelled', async () => {
    const controller = new AbortController();
    mockDriver.decideOverride = async () => {
      controller.abort();
      const fail = new DecisionResult(false, new Date(), new Date());
      fail.errorMessage = 'Cancelled';
      fail.errorInfo = { errorType: 'Unknown', severity: 'Fatal', canFailover: false };
      return fail;
    };
    const params = new AIDecisionParams();
    params.prompt = makeDecisionPrompt();
    params.Questions = defaultQuestions;
    params.State = 'Test state';
    params.provider = fakeProvider;
    params.cancellationToken = controller.signal;

    const result = await runner.ExecuteDecision(params);

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  describe("14. a decision answered through a child run carries that run's cost", () => {
    /**
     * Makes LLMDecision the model that answers: the native model loses its credential (LLMDecision
     * needs none), and the prompt is bound to the LLMDecision model alone.
     */
    function bindLLMDecisionOnly(): void {
      h.state.configuredDrivers.clear();
      h.state.promptModels = [
        { ID: 'pm-llm-decision-1', PromptID: 'decision-prompt-001', ModelID: LLM_DECISION_MODEL_ID, VendorID: VENDOR.OpenAI, Priority: 100, Status: 'Active', ConfigurationID: null },
      ];
    }

    function likelihoodParams(): AIDecisionParams {
      const params = new AIDecisionParams();
      params.prompt = makeDecisionPrompt({ FailoverStrategy: 'None' });
      params.Questions = { q_likelihood: defaultQuestions.q_likelihood };
      params.State = 'Test state';
      params.provider = fakeProvider;
      return params;
    }

    /**
     * Params whose prompt runs only the models {@link bindInOrder} bound, in order, with no
     * power-matched fallbacks after them, and fails over down that list when `failover` is set.
     */
    function scriptedParams(failover = false): AIDecisionParams {
      const params = likelihoodParams();
      params.prompt = makeDecisionPrompt({
        RequireSpecificModels: true,
        ...(failover ? { FailoverStrategy: 'NextInList', MaxFailoverAttempts: 3 } : { FailoverStrategy: 'None' }),
      });
      return params;
    }

    /** Builds drivers through the real ClassFactory, which knows the registered test drivers. */
    function useRealClassFactory(): void {
      vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockRestore();
    }

    /**
     * Binds the decision prompt to one decision model per driver class, in that priority order, each
     * with a credential, and returns the models' IDs.
     */
    function bindInOrder(driverClasses: string[]): string[] {
      h.state.promptModels = [];
      return driverClasses.map((driverClass, i) => {
        const id = `scripted-decision-model-${i + 1}`;
        const priority = 100 - i * 10;
        const modelVendor = {
          ID: `mv-scripted-${i + 1}`, ModelID: id, VendorID: VENDOR.OpenAI, Vendor: 'OpenAI', Priority: priority,
          Status: 'Active', DriverClass: driverClass, APIName: `scripted-v${i + 1}`, TypeID: h.engine.InferenceProviderTypeID,
        };
        h.state.models.push({
          ID: id, Name: `Scripted Decision Model ${i + 1}`, AIModelTypeID: DECISION_MODEL_TYPE_ID, DriverClass: driverClass,
          APIName: `scripted-v${i + 1}`, Status: 'Active', IsActive: true, PowerRank: 50, ModelVendors: [modelVendor],
        });
        h.state.modelVendors.push(modelVendor);
        h.state.promptModels.push({
          ID: `pm-scripted-${i + 1}`, PromptID: 'decision-prompt-001', ModelID: id, VendorID: VENDOR.OpenAI,
          Priority: priority, Status: 'Active', ConfigurationID: null,
        });
        h.state.configuredDrivers.add(driverClass);
        return id;
      });
    }

    beforeEach(() => {
      ScriptedLLMDecision.Script = [];
      ScriptedLLMDecision.ParentsSeen = [];
    });

    it("14a. an LLMDecision built by the runner runs its chat prompt as a child of the decision's run", async () => {
      bindLLMDecisionOnly();
      // The real ClassFactory, so the runner builds a real LLMDecision.
      vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockRestore();
      const executePrompt = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockResolvedValue(
        chatRunResult({
          success: true,
          result: { q_likelihood: 0.7 },
          promptTokens: 300,
          completionTokens: 20,
          promptRun: asPromptRun({ Cost: 0.0007, DescendantCost: null, TotalCost: 0.0007, CostCurrency: 'USD' }),
        })
      );

      const result = await runner.ExecuteDecision(likelihoodParams());

      expect(result.success).toBe(true);
      expect(result.DriverClass).toBe(LLM_DRIVER);
      expect(executePrompt).toHaveBeenCalledTimes(1);
      expect(executePrompt.mock.calls[0][0].parentPromptRunId).toBe(lastPromptRun?.ID);
      // The chat run's cost is the decision run's descendant cost, not its own.
      expect(lastPromptRun?.DescendantCost).toBe(0.0007);
      expect(lastPromptRun?.TotalCost).toBe(0.0007);
      expect(lastPromptRun?.Cost).toBeUndefined();
      expect(result.cost).toBe(0.0007);
    });

    it("14a2. leaves the chat run unlinked when the decision run's INSERT failed, so the chat run can still be saved", async () => {
      // A chat run naming a decision run that was never inserted as its ParentID would fail its foreign key.
      FakePromptRun.FailSaves = true;
      bindLLMDecisionOnly();
      vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockRestore();
      const executePrompt = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockResolvedValue(
        chatRunResult({
          success: true,
          result: { q_likelihood: 0.7 },
          promptRun: asPromptRun({ Cost: 0.0007, DescendantCost: null, TotalCost: 0.0007, CostCurrency: 'USD' }),
        })
      );

      const result = await runner.ExecuteDecision(likelihoodParams());

      expect(result.success).toBe(true);
      expect(executePrompt).toHaveBeenCalledTimes(1);
      expect(executePrompt.mock.calls[0][0].parentPromptRunId).toBeUndefined();
      expect(result.cost).toBe(0.0007);
      // Not linked, so not a descendant: no DescendantCost without a child to carry it. The cost is
      // the decision run's own, and the chat run is a root run of its own, as before child runs.
      expect(lastPromptRun?.DescendantCost).toBeUndefined();
      expect(lastPromptRun?.Cost).toBe(0.0007);
      expect(lastPromptRun?.TotalCost).toBe(0.0007);
    });

    it('14b. for an LLMDecision it linked, the runner records DescendantCost and TotalCost, and not Cost', async () => {
      useRealClassFactory();
      bindInOrder([SCRIPTED_LLM_DRIVER]);
      ScriptedLLMDecision.Script = [() => answeredWith(0.002)];

      const result = await runner.ExecuteDecision(scriptedParams());

      // Registered under its own key: linking, and so booking, follows the driver's class.
      expect(result.DriverClass).toBe(SCRIPTED_LLM_DRIVER);
      expect(ScriptedLLMDecision.ParentsSeen).toEqual([lastPromptRun?.ID]);
      expect(lastPromptRun?.DescendantCost).toBe(0.002);
      expect(lastPromptRun?.TotalCost).toBe(0.002);
      expect(lastPromptRun?.Cost).toBeUndefined();
      expect(lastPromptRun?.CostCurrency).toBe('USD');
      // The decision run keeps its own tokens, as before.
      expect(lastPromptRun?.TokensPrompt).toBe(120);
      expect(lastPromptRun?.TokensCompletion).toBe(45);
      expect(lastPromptRun?.TokensUsedRollup).toBe(165);
    });

    it("14b2. a driver registered as 'LLMDecision' that is not an LLMDecision links nothing, so its cost is the run's own Cost", async () => {
      bindLLMDecisionOnly(); // the mock driver answers as LLMDecision, with Usage(120, 45, 0.002, 'USD')
      const waitForSaves = vi.spyOn(runner, 'WaitForPendingPromptRunSaves');

      const result = await runner.ExecuteDecision(likelihoodParams());

      expect(result.DriverClass).toBe(LLM_DRIVER);
      expect(waitForSaves).not.toHaveBeenCalled();
      expect(lastPromptRun?.Cost).toBe(0.002);
      expect(lastPromptRun?.TotalCost).toBe(0.002);
      expect(lastPromptRun?.DescendantCost).toBeUndefined();
    });

    it('14c. for a driver that calls its model directly the runner records Cost, as before', async () => {
      const result = await runner.ExecuteDecision(likelihoodParams());

      expect(result.DriverClass).toBe(NATIVE_DRIVER);
      expect(lastPromptRun?.Cost).toBe(0.002);
      expect(lastPromptRun?.TotalCost).toBe(0.002);
      expect(lastPromptRun?.DescendantCost).toBeUndefined();
    });

    it('14d. with no cost the runner records neither Cost nor DescendantCost', async () => {
      bindLLMDecisionOnly();
      mockDriver.decideOverride = async () => {
        const answered = new DecisionResult(true, new Date(), new Date());
        answered.Answers = { q_likelihood: { Kind: 'Likelihood', Probability: 0.4 } };
        answered.Usage = new ModelUsage(120, 45);
        return answered;
      };

      const result = await runner.ExecuteDecision(likelihoodParams());

      expect(result.success).toBe(true);
      expect(lastPromptRun?.TokensUsed).toBe(165);
      expect(lastPromptRun?.Cost).toBeUndefined();
      expect(lastPromptRun?.DescendantCost).toBeUndefined();
      expect(lastPromptRun?.TotalCost).toBeUndefined();
    });

    it("14e. the decision run's INSERT lands before an LLMDecision driver runs, because its chat run names it as parent", async () => {
      useRealClassFactory();
      bindInOrder([SCRIPTED_LLM_DRIVER]);
      const waitForSaves = vi.spyOn(runner, 'WaitForPendingPromptRunSaves');
      const decide = vi.fn(() => answeredWith(0.002));
      ScriptedLLMDecision.Script = [decide];

      await runner.ExecuteDecision(scriptedParams());

      expect(waitForSaves).toHaveBeenCalledTimes(1);
      expect(waitForSaves.mock.invocationCallOrder[0]).toBeLessThan(decide.mock.invocationCallOrder[0]);
    });

    it('14f. a driver that calls its model directly does not wait for the run to be saved', async () => {
      const waitForSaves = vi.spyOn(runner, 'WaitForPendingPromptRunSaves');

      const result = await runner.ExecuteDecision(likelihoodParams());

      expect(result.DriverClass).toBe(NATIVE_DRIVER);
      expect(waitForSaves).not.toHaveBeenCalled();
    });

    it("14g. books the cost as the run's own, never as a descendant, when the decision run's INSERT failed and nothing was linked", async () => {
      FakePromptRun.FailSaves = true;
      useRealClassFactory();
      bindInOrder([SCRIPTED_LLM_DRIVER]);
      ScriptedLLMDecision.Script = [() => answeredWith(0.002)];

      const result = await runner.ExecuteDecision(scriptedParams());

      expect(result.success).toBe(true);
      expect(ScriptedLLMDecision.ParentsSeen).toEqual([undefined]);
      expect(lastPromptRun?.DescendantCost).toBeUndefined();
      expect(lastPromptRun?.Cost).toBe(0.002);
      expect(lastPromptRun?.TotalCost).toBe(0.002);
    });

    it("14h. records every linked attempt's cost, not only the answering attempt's", async () => {
      useRealClassFactory();
      const [, second] = bindInOrder([SCRIPTED_LLM_DRIVER, SCRIPTED_LLM_DRIVER]);
      ScriptedLLMDecision.Script = [() => failedOverAfter(0.001), () => answeredWith(0.002)];

      const result = await runner.ExecuteDecision(scriptedParams(true));

      expect(result.success).toBe(true);
      expect(result.modelInfo?.modelId).toBe(second);
      // Both chat runs are children of the decision's run, and the server's rollup sums them both.
      expect(ScriptedLLMDecision.ParentsSeen).toEqual([lastPromptRun?.ID, lastPromptRun?.ID]);
      expect(lastPromptRun?.DescendantCost).toBeCloseTo(0.003, 12);
      expect(lastPromptRun?.TotalCost).toBeCloseTo(0.003, 12);
      expect(lastPromptRun?.Cost).toBeUndefined();
      expect(lastPromptRun?.CostCurrency).toBe('USD');
      // The tokens are still the answering attempt's.
      expect(lastPromptRun?.TokensPrompt).toBe(120);
      expect(lastPromptRun?.TokensCompletion).toBe(45);
    });

    it("14i. keeps a linked attempt's cost as a descendant when a direct driver answers, whose cost is the run's own", async () => {
      useRealClassFactory();
      bindInOrder([SCRIPTED_LLM_DRIVER, SCRIPTED_NATIVE_DRIVER]);
      ScriptedLLMDecision.Script = [() => failedOverAfter(0.001)];

      const result = await runner.ExecuteDecision(scriptedParams(true));

      expect(result.success).toBe(true);
      expect(result.DriverClass).toBe(SCRIPTED_NATIVE_DRIVER);
      expect(lastPromptRun?.Cost).toBe(0.002);
      expect(lastPromptRun?.DescendantCost).toBe(0.001);
      expect(lastPromptRun?.TotalCost).toBeCloseTo(0.003, 12);
    });

    it('14j. keeps what the linked attempts cost when every attempt fails', async () => {
      useRealClassFactory();
      bindInOrder([SCRIPTED_LLM_DRIVER, SCRIPTED_LLM_DRIVER]);
      ScriptedLLMDecision.Script = [() => failedOverAfter(0.001)];

      const result = await runner.ExecuteDecision(scriptedParams(true));

      expect(result.success).toBe(false);
      expect(ScriptedLLMDecision.ParentsSeen).toHaveLength(2);
      expect(lastPromptRun?.Success).toBe(false);
      expect(lastPromptRun?.DescendantCost).toBeCloseTo(0.002, 12);
      expect(lastPromptRun?.TotalCost).toBeCloseTo(0.002, 12);
      expect(lastPromptRun?.Cost).toBeUndefined();
      expect(lastPromptRun?.CostCurrency).toBe('USD');
    });
  });
});

/** The chat prompt's result fields an LLMDecision reads. */
type ChatRunResultFields = Pick<AIPromptRunResult, 'success' | 'result' | 'promptTokens' | 'completionTokens' | 'promptRun'>;

/** The seam onto the full `AIPromptRunResult` that `AIPromptRunner.ExecutePrompt` returns. */
function chatRunResult(fields: ChatRunResultFields): AIPromptRunResult {
  return fields as AIPromptRunResult;
}

/** The prompt-run entity an `AIPromptRunResult` carries. */
type ChatPromptRun = NonNullable<AIPromptRunResult['promptRun']>;

/** The seam onto the full prompt-run entity, from the cost columns LLMDecision reads. */
function asPromptRun(run: Pick<ChatPromptRun, 'Cost' | 'DescendantCost' | 'TotalCost' | 'CostCurrency'>): ChatPromptRun {
  return run as ChatPromptRun;
}
