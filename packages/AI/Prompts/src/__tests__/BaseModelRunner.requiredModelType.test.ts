/**
 * Tests for BaseModelRunner.RequiredModelType enforcement (Task 0.3 / PR 2c).
 *
 * Verifies candidate selection and prompt validation against the runner's
 * RequiredModelType across all 7 scenarios specified in Task 0.3 §6.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as core from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { MJAIPromptEntityExtended, AIPromptParams } from '@memberjunction/ai-core-plus';
import { BaseModelRunner, type ModelVendorCandidate } from '../BaseModelRunner';
import { AIPromptRunner } from '../AIPromptRunner';
import { TestLLM } from '@memberjunction/unit-testing';
import {
  buildRealisticCatalog,
  DEFAULT_CONFIGURED_DRIVERS,
  MODEL,
  VENDOR,
  MODEL_TYPE,
  makeModel,
  makeModelVendor,
  makePromptModel,
  type AICatalog,
} from './__fixtures__/ai-metadata.fixtures';

// ---------------------------------------------------------------------------
// Hoisted mock state and AIEngine mock
// ---------------------------------------------------------------------------
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
      const chain: Array<{ ID: string; Name: string; ParentID: string | null }> = [];
      const seen = new Set<string>();
      let cur: string | null = id;
      while (cur) {
        if (seen.has(norm(cur))) break;
        const cfg = state.configurations.find(c => eq(c.ID, cur));
        if (!cfg) break;
        seen.add(norm(cur));
        chain.push(cfg);
        cur = cfg.ParentID;
      }
      return chain;
    },
    HasCredentialBindings() { return false; },
    GetCredentialBindingsForTarget() { return []; },
  };

  const getApiKey = (driverClass: string): string =>
    state.configuredDrivers.has(driverClass) ? 'sk-test-key' : '';

  return { state, engine, getApiKey };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, AIEngine: { Instance: h.engine } };
});

vi.mock('@memberjunction/ai', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, GetAIAPIKey: (driverClass: string) => h.getApiKey(driverClass) };
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
// Test Subclasses of BaseModelRunner
// ---------------------------------------------------------------------------
class ConcreteTestRunner extends BaseModelRunner {
  private _type: string;

  constructor(type: string = 'LLM') {
    super();
    this._type = type;
  }

  public override get RequiredModelType(): string {
    return this._type;
  }

  public invokeRequiredModelTypeID(): string {
    return this.requiredModelTypeID();
  }

  public invokeAssertPromptMatchesRequiredType(prompt: MJAIPromptEntityExtended): void {
    this.assertPromptMatchesRequiredType(prompt);
  }

  public invokeBuildModelVendorCandidates(
    prompt: MJAIPromptEntityExtended,
    explicitModelId?: string,
    configurationId?: string,
    preferredVendorId?: string,
    verbose?: boolean
  ): ModelVendorCandidate[] {
    return this.buildModelVendorCandidates(prompt, explicitModelId, configurationId, preferredVendorId, verbose);
  }
}

// ---------------------------------------------------------------------------
// Helpers and Test LLM Setup
// ---------------------------------------------------------------------------
const EMBEDDING_MODEL_ID = 'model-embedding-top-power';
const testLLM = new TestLLM();

let prSeq = 0;
class FakePromptRun {
  public ID = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public saveCount = 0;
  [k: string]: unknown;
  NewRecord(): boolean { this.ID = `pr-${++prSeq}`; return true; }
  async Save(): Promise<boolean> { this.saveCount++; return true; }
}

const fakeProvider = {
  GetEntityObject: vi.fn(async () => new FakePromptRun()),
};

function loadCatalog(catalog: AICatalog, configuredDrivers: string[] = DEFAULT_CONFIGURED_DRIVERS): void {
  h.state.vendorTypeDefinitions = catalog.vendorTypeDefinitions;
  h.state.vendors = catalog.vendors;
  h.state.modelTypes = catalog.modelTypes;
  h.state.configurations = catalog.configurations;
  h.state.models = catalog.models as never;
  h.state.modelVendors = catalog.modelVendors as never;
  h.state.promptModels = catalog.promptModels as never;
  h.state.configuredDrivers = new Set(configuredDrivers);
}

function buildCatalogWithTopRankedEmbedding(): AICatalog {
  const catalog = buildRealisticCatalog();
  const vendor = makeModelVendor({
    ModelID: EMBEDDING_MODEL_ID,
    VendorID: VENDOR.OpenAI,
    Vendor: 'OpenAI',
    DriverClass: 'OpenAIEmbedding',
    APIName: 'text-embedding-3-large',
    Priority: 100,
  });
  catalog.models.push(makeModel({
    ID: EMBEDDING_MODEL_ID,
    Name: 'Text Embedding 3 Large',
    Vendor: 'OpenAI',
    AIModelTypeID: MODEL_TYPE.Embeddings,
    AIModelType: 'Embeddings',
    PowerRank: 99,
    ModelVendors: [vendor],
  }));
  catalog.modelVendors.push(vendor);
  return catalog;
}

function makePrompt(overrides: Record<string, unknown> = {}): MJAIPromptEntityExtended {
  return {
    ID: 'prompt-1',
    Name: 'Test Prompt',
    Status: 'Active',
    TemplateID: null,
    SelectionStrategy: 'Default',
    AIModelTypeID: MODEL_TYPE.LLM,
    OutputType: 'string',
    OutputExample: null,
    ValidationBehavior: 'Warn',
    MaxRetries: 0,
    ParallelizationMode: 'None',
    RequireSpecificModels: false,
    MinPowerRank: null,
    PowerPreference: null,
    ...overrides,
  } as unknown as MJAIPromptEntityExtended;
}

function makeParams(prompt: MJAIPromptEntityExtended, overrides: Record<string, unknown> = {}): AIPromptParams {
  return {
    prompt,
    contextUser: { ID: 'u1', Name: 'TestUser' },
    provider: fakeProvider,
    conversationMessages: [{ role: 'user', content: 'Hello' }],
    templateMessageRole: 'none',
    verbose: false,
    ...overrides,
  } as unknown as AIPromptParams;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('BaseModelRunner.RequiredModelType enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testLLM.Reset();
    testLLM.RepeatLastOutcome = true;
    testLLM.SetDefaultOutcome({ kind: 'succeed', content: 'test-llm-response' });
    loadCatalog(buildCatalogWithTopRankedEmbedding());
    vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined as never);
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => testLLM as never);
  });

  // -------------------------------------------------------------------------
  // Case 1: Prompt has AIModelTypeID = null
  // -------------------------------------------------------------------------
  it('1. Prompt has AIModelTypeID = null: selects active model matching RequiredModelType without drawing from other types even with higher PowerRank', () => {
    const runner = new ConcreteTestRunner('LLM');
    const prompt = makePrompt({
      AIModelTypeID: null,
      SelectionStrategy: 'ByPower',
    });

    const candidates = runner.invokeBuildModelVendorCandidates(prompt);

    expect(candidates.length).toBeGreaterThan(0);
    // Every candidate must match the runner's required model type (LLM)
    for (const c of candidates) {
      expect(c.model.AIModelTypeID).toBe(MODEL_TYPE.LLM);
    }
    // The embedding model has PowerRank 99 (higher than all LLMs), but must not be included
    expect(candidates.some(c => c.model.ID === EMBEDDING_MODEL_ID)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Case 2: Prompt has AIModelTypeID equal to runner's RequiredModelType
  // -------------------------------------------------------------------------
  it('2. Prompt has AIModelTypeID equal to runner RequiredModelType: normal selection proceeds', () => {
    const runner = new ConcreteTestRunner('LLM');
    const prompt = makePrompt({
      AIModelTypeID: MODEL_TYPE.LLM,
      SelectionStrategy: 'Default',
    });

    const candidates = runner.invokeBuildModelVendorCandidates(prompt);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(c => c.model.AIModelTypeID === MODEL_TYPE.LLM)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 3: Prompt has AIModelTypeID different from runner's RequiredModelType
  // -------------------------------------------------------------------------
  it('3. Prompt has AIModelTypeID different from runner RequiredModelType: ExecutePrompt fails fast, names both types, never calls executeModel', async () => {
    const runner = new AIPromptRunner();
    const prompt = makePrompt({
      AIModelTypeID: MODEL_TYPE.Embeddings,
    });

    const result = await runner.ExecutePrompt(makeParams(prompt));

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBeDefined();
    // Error must name both the prompt's configured type and the runner's required type
    expect(result.errorMessage).toContain('Embeddings');
    expect(result.errorMessage).toContain('LLM');
    // Model execution was never called
    expect(testLLM.CalledModels.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Case 4: Bound prompt models of the wrong type
  // -------------------------------------------------------------------------
  describe('4. Prompt models bound to wrong type (via AIPromptModel)', () => {
    it('skips mismatched bound model with LogStatus warning and considers remaining valid bound models', () => {
      const runner = new ConcreteTestRunner('LLM');
      const logSpy = vi.spyOn(core, 'LogStatus');

      const pmWrong = makePromptModel({
        PromptID: 'prompt-1',
        ModelID: EMBEDDING_MODEL_ID,
        Priority: 200,
        Status: 'Active',
      });
      const pmRight = makePromptModel({
        PromptID: 'prompt-1',
        ModelID: MODEL.ClaudeSonnet45,
        Priority: 100,
        Status: 'Active',
      });
      h.state.promptModels = [pmWrong, pmRight];

      const prompt = makePrompt({
        SelectionStrategy: 'Specific',
        RequireSpecificModels: true,
      });

      const candidates = runner.invokeBuildModelVendorCandidates(prompt);

      // Warning was logged with LogStatus
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Skipping model "Text Embedding 3 Large".*does not match runner required type "LLM"/)
      );
      // Valid candidate remains and was selected
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every(c => c.model.ID === MODEL.ClaudeSonnet45)).toBe(true);
      expect(candidates.some(c => c.model.ID === EMBEDDING_MODEL_ID)).toBe(false);
    });

    it('fails when all bound models are wrong type and RequireSpecificModels is true', () => {
      const runner = new ConcreteTestRunner('LLM');
      const pmWrong = makePromptModel({
        PromptID: 'prompt-1',
        ModelID: EMBEDDING_MODEL_ID,
        Priority: 200,
        Status: 'Active',
      });
      h.state.promptModels = [pmWrong];

      const prompt = makePrompt({
        SelectionStrategy: 'Specific',
        RequireSpecificModels: true,
      });

      expect(() => runner.invokeBuildModelVendorCandidates(prompt)).toThrow(
        /SelectionStrategy is 'Specific' but no valid AIPromptModel candidates found/
      );
    });

    it('falls back to power-matched fallback when all bound models are wrong type and RequireSpecificModels is false', () => {
      const runner = new ConcreteTestRunner('LLM');
      const pmWrong = makePromptModel({
        PromptID: 'prompt-1',
        ModelID: EMBEDDING_MODEL_ID,
        Priority: 200,
        Status: 'Active',
      });
      h.state.promptModels = [pmWrong];

      const prompt = makePrompt({
        SelectionStrategy: 'Specific',
        RequireSpecificModels: false,
      });

      const candidates = runner.invokeBuildModelVendorCandidates(prompt);

      // Fallback candidates of runner's required type (LLM) were appended
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every(c => c.model.AIModelTypeID === MODEL_TYPE.LLM)).toBe(true);
      expect(candidates.some(c => c.model.ID === EMBEDDING_MODEL_ID)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Case 5: Explicit model override of the wrong type
  // -------------------------------------------------------------------------
  it('5. Explicit model override of the wrong type: returns no candidate and does not execute the wrong-type model', async () => {
    const runner = new ConcreteTestRunner('LLM');
    const prompt = makePrompt({ AIModelTypeID: null });

    const candidates = runner.invokeBuildModelVendorCandidates(prompt, EMBEDDING_MODEL_ID);

    expect(candidates).toEqual([]);

    // Also verify via AIPromptRunner.ExecutePrompt
    const promptRunner = new AIPromptRunner();
    const result = await promptRunner.ExecutePrompt(
      makeParams(prompt, { override: { modelId: EMBEDDING_MODEL_ID } })
    );

    expect(result.success).toBe(false);
    expect(testLLM.CalledModels.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Case 6: Lookup case-insensitivity and trimming
  // -------------------------------------------------------------------------
  it('6. Lookup case-insensitivity and trimming: RequiredModelType with spaces and lowercase matches metadata type', () => {
    class SpacedLowerRunner extends BaseModelRunner {
      public override get RequiredModelType(): string {
        return '  llm  ';
      }
      public invokeRequiredModelTypeID(): string {
        return this.requiredModelTypeID();
      }
    }

    const runner = new SpacedLowerRunner();
    const typeId = runner.invokeRequiredModelTypeID();

    expect(typeId).toBe(MODEL_TYPE.LLM);
  });

  // -------------------------------------------------------------------------
  // Case 7: Missing metadata type throws on candidate building with clear error
  // -------------------------------------------------------------------------
  it('7. Missing metadata type: runner subclass with unknown RequiredModelType throws descriptive error', () => {
    class UnknownTypeRunner extends BaseModelRunner {
      public override get RequiredModelType(): string {
        return 'NonexistentType';
      }
      public invokeRequiredModelTypeID(): string {
        return this.requiredModelTypeID();
      }
      public invokeBuildModelVendorCandidates(p: MJAIPromptEntityExtended): ModelVendorCandidate[] {
        return this.buildModelVendorCandidates(p);
      }
    }

    const runner = new UnknownTypeRunner();
    const prompt = makePrompt({ AIModelTypeID: null });

    expect(() => runner.invokeRequiredModelTypeID()).toThrow(
      'Required model type "NonexistentType" was not found in AIEngine.Instance.ModelTypes'
    );
    expect(() => runner.invokeBuildModelVendorCandidates(prompt)).toThrow(
      'Required model type "NonexistentType" was not found in AIEngine.Instance.ModelTypes'
    );
  });
  // -------------------------------------------------------------------------
  // Case 8: Parallel execution planner. The ExecutionPlanner has its own fallback filters that treat
  // an empty AIModelTypeID as "any", so the runner applies the floor to everything it hands the
  // planner. NOTE: today ExecutePrompt always pre-selects a model (through the floor-enforcing
  // candidate builder) before the parallel path, so the planner branch is only reached when no
  // selection is passed in; these tests drive that branch directly.
  // -------------------------------------------------------------------------
  describe('8. Parallel execution planner receives only the required type', () => {
    type PlannerInputs = { promptModels: Array<{ ModelID: string }>; models: Array<{ AIModelTypeID: string }> };
    type ParallelHooks = {
      _executionPlanner: { createExecutionPlan: (...args: unknown[]) => unknown[] };
      executePromptInParallel: (prompt: MJAIPromptEntityExtended, rendered: string, params: AIPromptParams, startTime: Date) => Promise<unknown>;
    };

    it('passes the planner only models and bindings of the required type', async () => {
      h.state.promptModels = [
        makePromptModel({ PromptID: 'prompt-1', ModelID: EMBEDDING_MODEL_ID, Priority: 200, Status: 'Active' }),
        makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.ClaudeSonnet45, Priority: 100, Status: 'Active' }),
      ];
      const runner = new AIPromptRunner() as unknown as ParallelHooks;
      const planned: PlannerInputs[] = [];
      runner._executionPlanner = {
        createExecutionPlan: (...args: unknown[]) => {
          planned.push({ promptModels: args[1] as PlannerInputs['promptModels'], models: args[2] as PlannerInputs['models'] });
          return []; // no tasks: the call then rejects, but only the planner's inputs matter here
        },
      };
      const prompt = makePrompt({ AIModelTypeID: null, ParallelizationMode: 'ModelSpecific' });

      await expect(runner.executePromptInParallel(prompt, 'rendered', makeParams(prompt), new Date())).rejects.toThrow(/No execution tasks created/);

      expect(planned).toHaveLength(1);
      expect(planned[0].models.length).toBeGreaterThan(0);
      expect(planned[0].models.every(m => m.AIModelTypeID === MODEL_TYPE.LLM)).toBe(true);
      expect(planned[0].promptModels.map(pm => pm.ModelID)).toEqual([MODEL.ClaudeSonnet45]);
    });

    it('refuses a prompt typed differently before the planner runs', async () => {
      const runner = new AIPromptRunner() as unknown as ParallelHooks;
      const plan = vi.fn((..._args: unknown[]): unknown[] => []);
      runner._executionPlanner = { createExecutionPlan: plan };
      const prompt = makePrompt({ AIModelTypeID: MODEL_TYPE.Embeddings, ParallelizationMode: 'ModelSpecific' });

      await expect(runner.executePromptInParallel(prompt, 'rendered', makeParams(prompt), new Date()))
        .rejects.toThrow(/Embeddings.*but this runner requires "LLM"/);
      expect(plan).not.toHaveBeenCalled();
    });
  });
});
