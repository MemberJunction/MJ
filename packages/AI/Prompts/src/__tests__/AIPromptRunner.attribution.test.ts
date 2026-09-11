/**
 * Tests for prompt-run attribution stamping (Spec §6 / PR3).
 * Verifies that:
 * 1. Single prompt runs stamp AgentID, AgentRunID, and UserID (with contextUser fallback).
 * 2. Parallel execution planner / coordinator propagate AgentID, AgentRunID, and UserID to child execution tasks.
 * 3. Parallel child prompt runs and result-selector runs inherit AgentID, AgentRunID, and UserID.
 * 4. AIModelRunner stamps AgentRunID and UserID on embedding/model run records.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const norm = (s: unknown): string => (s == null ? '' : String(s).trim().toLowerCase());
  const eq = (a: unknown, b: unknown): boolean => norm(a) === norm(b);
  const state = {
    vendorTypeDefinitions: [] as Array<{ ID: string; Name: string }>,
    vendors: [] as Array<{ ID: string; Name: string; CredentialTypeID?: string | null }>,
    modelTypes: [] as Array<{ ID: string; Name: string }>,
    configurations: [] as Array<{ ID: string; Name: string; ParentID: string | null }>,
    models: [] as Array<Record<string, unknown>>,
    modelVendors: [] as Array<Record<string, unknown>>,
    promptModels: [] as Array<Record<string, unknown>>,
    prompts: [] as Array<Record<string, unknown>>,
    configuredDrivers: new Set<string>(),
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
    get InferenceProviderTypeID() { return state.vendorTypeDefinitions.find(v => v.Name === 'Inference Provider')?.ID; },
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
      for (const mv of state.modelVendors) { const k = norm(mv.ModelID); (map.get(k) ?? map.set(k, []).get(k)!).push(mv); }
      return map;
    },
    get PromptModelsByPromptID() {
      const map = new Map<string, Array<Record<string, unknown>>>();
      for (const pm of state.promptModels) { const k = norm(pm.PromptID); (map.get(k) ?? map.set(k, []).get(k)!).push(pm); }
      return map;
    },
    GetConfigurationChain(id: string) {
      const chain: Array<{ ID: string; ParentID: string | null }> = [];
      let cur: string | null = id; const seen = new Set<string>();
      while (cur) { if (seen.has(norm(cur))) break; const c = state.configurations.find(x => eq(x.ID, cur)); if (!c) break; seen.add(norm(cur)); chain.push(c); cur = c.ParentID; }
      return chain;
    },
    HasCredentialBindings() { return false; },
    GetCredentialBindingsForTarget() { return []; },
  };
  return { state, engine, getApiKey: (d: string) => (state.configuredDrivers.has(d) ? 'sk-test' : '') };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, AIEngine: { Instance: h.engine } };
});
vi.mock('@memberjunction/ai', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, GetAIAPIKey: (d: string) => h.getApiKey(d) };
});
vi.mock('@memberjunction/credentials', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
  return {
    ...actual,
    CredentialEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), Credentials: [], getCredentialById: () => null, getCredential: vi.fn().mockResolvedValue({ values: {} }) } },
  };
});

import { AIPromptRunner } from '../AIPromptRunner';
import { ParallelExecutionCoordinator } from '../ParallelExecutionCoordinator';
import { AIModelRunner, EmbeddingRunParams } from '../AIModelRunner';
import { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJGlobal } from '@memberjunction/global';
import { TestLLM } from '@memberjunction/unit-testing';
import { buildRealisticCatalog, DEFAULT_CONFIGURED_DRIVERS, MODEL_TYPE, type AICatalog } from './__fixtures__/ai-metadata.fixtures';
import type { UserInfo } from '@memberjunction/core';
import type { ExecutionTask } from '../ParallelExecution';

const testLLM = new TestLLM();
let prSeq = 0;

class FakePromptRun {
  public ID = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public saveCount = 0;
  public RunType?: string;
  public ParentID?: string | null = null;
  public AgentID?: string | null = null;
  public AgentRunID?: string | null = null;
  public UserID?: string | null = null;
  public PromptID?: string;
  public ModelID?: string;
  public VendorID?: string;
  public Cost?: number | null = null;
  public TotalCost?: number | null = null;
  public WasSelectedResult = false;
  public Status?: string;
  public Success?: boolean;
  public contextUser?: UserInfo;
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

const createdPromptRuns: FakePromptRun[] = [];
const fakeProvider = {
  GetEntityObject: vi.fn(async (_entityName: string, contextUser?: UserInfo) => {
    const run = new FakePromptRun();
    run.contextUser = contextUser;
    createdPromptRuns.push(run);
    return run;
  }),
};

function loadCatalog(catalog: AICatalog, drivers = DEFAULT_CONFIGURED_DRIVERS): void {
  h.state.vendorTypeDefinitions = catalog.vendorTypeDefinitions;
  h.state.vendors = catalog.vendors;
  h.state.modelTypes = catalog.modelTypes;
  h.state.configurations = catalog.configurations;
  h.state.models = catalog.models as never;
  h.state.modelVendors = catalog.modelVendors as never;
  h.state.promptModels = catalog.promptModels as never;
  h.state.configuredDrivers = new Set(drivers);
}

function makePrompt(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ID: 'prompt-test',
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
    ...o,
  };
}

describe('Spec §6 — AIPromptRunner Attribution Writers', () => {
  let runner: AIPromptRunner;
  const testUser: UserInfo = { ID: 'user-ctx-100', Name: 'Context User', Email: 'ctx@example.com', UserRoles: [] } as unknown as UserInfo;

  beforeEach(() => {
    vi.restoreAllMocks();
    prSeq = 0;
    createdPromptRuns.length = 0;
    testLLM.Reset();
    testLLM.RepeatLastOutcome = true;
    testLLM.SetDefaultOutcome({ kind: 'succeed', content: 'test response' });
    loadCatalog(buildRealisticCatalog());
    vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined as never);
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => testLLM as never);
    runner = new AIPromptRunner();
  });

  it('stamps explicit agentId, agentRunId, and userId onto the AIPromptRun', async () => {
    const prompt = makePrompt();
    const params: AIPromptParams = {
      prompt: prompt as never,
      provider: fakeProvider as never,
      contextUser: testUser,
      agentId: 'agent-uuid-1',
      agentRunId: 'agent-run-uuid-2',
      userId: 'user-override-uuid-3',
    };

    const result = await runner.ExecutePrompt(params);
    expect(result.success).toBe(true);
    await runner.WaitForPendingPromptRunSaves();

    expect(createdPromptRuns.length).toBeGreaterThanOrEqual(1);
    const run = createdPromptRuns[0];
    expect(run.AgentID).toBe('agent-uuid-1');
    expect(run.AgentRunID).toBe('agent-run-uuid-2');
    expect(run.UserID).toBe('user-override-uuid-3');
  });

  it('falls back to contextUser.ID when userId is omitted, and leaves agentRunId null for direct runs', async () => {
    const prompt = makePrompt();
    const params: AIPromptParams = {
      prompt: prompt as never,
      provider: fakeProvider as never,
      contextUser: testUser,
    };

    const result = await runner.ExecutePrompt(params);
    expect(result.success).toBe(true);
    await runner.WaitForPendingPromptRunSaves();

    const run = createdPromptRuns[0];
    expect(run.AgentID).toBeNull();
    expect(run.AgentRunID).toBeNull();
    expect(run.UserID).toBe('user-ctx-100');
  });

  it('leaves UserID null when both userId and contextUser are omitted', async () => {
    const prompt = makePrompt();
    const params: AIPromptParams = {
      prompt: prompt as never,
      provider: fakeProvider as never,
    };

    const result = await runner.ExecutePrompt(params);
    expect(result.success).toBe(true);
    await runner.WaitForPendingPromptRunSaves();

    const run = createdPromptRuns[0];
    expect(run.AgentRunID).toBeNull();
    expect(run.UserID).toBeNull();
  });

  it('ParallelExecutionCoordinator stamps child and selector runs with attribution from task/config', async () => {
    const coordinator = new ParallelExecutionCoordinator();
    coordinator.Provider = fakeProvider as never;
    const prompt = makePrompt();

    const task: ExecutionTask = {
      taskId: 'task-1',
      prompt: prompt as never,
      model: { ID: 'model-1', Name: 'Model 1' } as never,
      vendorId: 'vendor-1',
      executionGroup: 0,
      priority: 1,
      renderedPrompt: 'test prompt',
      contextUser: testUser,
      agentId: 'task-agent-1',
      agentRunId: 'task-agent-run-2',
      userId: 'task-user-3',
    };

    type CoordPrivates = {
      createChildPromptRun(task: ExecutionTask, startTime: Date, parentPromptRunId?: string): Promise<FakePromptRun>;
      createResultSelectorPromptRun(
        judgePrompt: MJAIPromptEntityExtended,
        judgeData: Record<string, unknown>,
        parentPromptRunId: string,
        executionOrder: number,
        contextUser?: UserInfo,
        modelId?: string,
        vendorId?: string,
        agentId?: string,
        agentRunId?: string,
        userId?: string,
      ): Promise<FakePromptRun>;
    };
    const privCoord = coordinator as unknown as CoordPrivates;

    // Test child prompt run creation
    const childRun = await privCoord.createChildPromptRun(task, new Date(), 'parent-pr-10');
    expect(childRun).toBeDefined();
    expect(childRun.RunType).toBe('ParallelChild');
    expect(childRun.ParentID).toBe('parent-pr-10');
    expect(childRun.AgentID).toBe('task-agent-1');
    expect(childRun.AgentRunID).toBe('task-agent-run-2');
    expect(childRun.UserID).toBe('task-user-3');

    // Test result selector prompt run creation
    const judgePrompt = { ID: 'judge-prompt-1' } as MJAIPromptEntityExtended;
    const selectorRun = await privCoord.createResultSelectorPromptRun(
      judgePrompt,
      {},
      'parent-pr-10',
      1,
      testUser,
      'judge-model-1',
      'judge-vendor-1',
      'selector-agent-1',
      'selector-agent-run-2',
      'selector-user-3',
    );
    expect(selectorRun).toBeDefined();
    expect(selectorRun.RunType).toBe('ResultSelector');
    expect(selectorRun.ParentID).toBe('parent-pr-10');
    expect(selectorRun.AgentID).toBe('selector-agent-1');
    expect(selectorRun.AgentRunID).toBe('selector-agent-run-2');
    expect(selectorRun.UserID).toBe('selector-user-3');
  });
});

describe('Spec §6 — AIModelRunner Attribution Writers', () => {
  let modelRunner: AIModelRunner;
  const testUser: UserInfo = { ID: 'user-embedding-1', Name: 'Embedding User', UserRoles: [] } as unknown as UserInfo;

  beforeEach(() => {
    vi.restoreAllMocks();
    prSeq = 0;
    createdPromptRuns.length = 0;
    modelRunner = new AIModelRunner();
    modelRunner.Provider = fakeProvider as never;
  });

  it('stamps AgentRunID and UserID on model/embedding run record', async () => {
    const params: EmbeddingRunParams = {
      Texts: ['text to embed'],
      ContextUser: testUser,
      ModelID: 'model-embed-1',
      AgentRunID: 'agent-run-embed-99',
    };

    type ModelRunnerPrivates = {
      createRunRecord(prompt: unknown, modelID: string, vendorID: string, params: EmbeddingRunParams, startTime: number): Promise<FakePromptRun>;
    };
    const priv = modelRunner as unknown as ModelRunnerPrivates;

    const runRecord = await priv.createRunRecord(null, 'model-embed-1', 'vendor-embed-2', params, Date.now());
    expect(runRecord).toBeDefined();
    expect(runRecord.AgentRunID).toBe('agent-run-embed-99');
    expect(runRecord.UserID).toBe('user-embedding-1');
  });

  it('falls back to contextUser.ID for UserID and null for AgentRunID when not supplied', async () => {
    const params: EmbeddingRunParams = {
      Texts: ['text to embed'],
      ContextUser: testUser,
      ModelID: 'model-embed-1',
    };

    type ModelRunnerPrivates = {
      createRunRecord(prompt: unknown, modelID: string, vendorID: string, params: EmbeddingRunParams, startTime: number): Promise<FakePromptRun>;
    };
    const priv = modelRunner as unknown as ModelRunnerPrivates;

    const runRecord = await priv.createRunRecord(null, 'model-embed-1', 'vendor-embed-2', params, Date.now());
    expect(runRecord).toBeDefined();
    expect(runRecord.AgentRunID).toBeNull();
    expect(runRecord.UserID).toBe('user-embedding-1');
  });
});
