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
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJGlobal } from '@memberjunction/global';
import { TestLLM, makeModelUsage, makeSuccessChatResult } from '@memberjunction/unit-testing';
import { buildRealisticCatalog, DEFAULT_CONFIGURED_DRIVERS, MODEL_TYPE, type AICatalog } from './__fixtures__/ai-metadata.fixtures';
import type { ExecutionTaskResult, ResultSelectionConfig } from '../ParallelExecution';
import type { UserInfo } from '@memberjunction/core';
import type { AIPromptExecutionScope } from '@memberjunction/ai-core-plus';

const testLLM = new TestLLM();

let prSeq = 0;
class FakePromptRun {
  public ID = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public saveCount = 0;
  public RunType?: string;
  public ParentID?: string;
  public WasSelectedResult = false;
  public Cost?: number;
  public DescendantCost?: number;
  public TotalCost?: number;
  public ModelID?: string;
  public VendorID?: string;
  public JudgeID?: string;
  public JudgeScore?: number;
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
    ID: 'prompt-parallel',
    Name: 'Parallel Test Prompt',
    Status: 'Active',
    TemplateID: null,
    SelectionStrategy: 'Default',
    AIModelTypeID: MODEL_TYPE.LLM,
    OutputType: 'string',
    OutputExample: null,
    ValidationBehavior: 'Warn',
    MaxRetries: 0,
    ParallelizationMode: 'ModelSpecific',
    RequireSpecificModels: false,
    ...o,
  };
}

describe('Spec §5 — Parallel-execution accounting', () => {
  let runner: AIPromptRunner;
  const testUser: UserInfo = { ID: 'u-judge-1', Name: 'Judge User', Email: 'judge@example.com' } as UserInfo;

  beforeEach(() => {
    vi.restoreAllMocks();
    prSeq = 0;
    createdPromptRuns.length = 0;
    testLLM.Reset();
    testLLM.RepeatLastOutcome = true;
    testLLM.SetDefaultOutcome({ kind: 'succeed', content: '{}' });
    loadCatalog(buildRealisticCatalog());
    vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined as never);
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => testLLM as never);
    runner = new AIPromptRunner();
  });

  it('ExecutePrompt creates parent before execution, passes parentPromptRunId and contextUser, keeps parent Cost IS NULL, and marks winner child WasSelectedResult = true', async () => {
    testLLM.Script({ kind: 'succeed', content: 'winner-content' });
    const prompt = makePrompt({
      OutputType: 'string',
      ParallelizationMode: 'ModelSpecific',
      ResultSelectorPromptID: 'judge-prompt-1',
    });

    const model = h.state.models[0] as { ID: string; Name: string; Vendor?: string };

    const arm1Run = new FakePromptRun();
    arm1Run.NewRecord();
    arm1Run.RunType = 'ParallelChild';
    arm1Run.Cost = 0.005;

    const arm2Run = new FakePromptRun();
    arm2Run.NewRecord();
    arm2Run.RunType = 'ParallelChild';
    arm2Run.Cost = 0.008;

    const arm3Run = new FakePromptRun();
    arm3Run.NewRecord();
    arm3Run.RunType = 'ParallelChild';
    arm3Run.Cost = 0.003;

    const makeTaskResult = (taskId: string, content: string, ranking: number, cost: number, pr: FakePromptRun): ExecutionTaskResult => ({
      task: {
        taskId,
        prompt: prompt as never,
        model: { ID: model.ID, Name: model.Name } as never,
        vendorId: 'vendor-1',
        executionGroup: 0,
        priority: 1,
        renderedPrompt: 'test',
        contextUser: testUser,
      },
      success: true,
      rawResult: content,
      executionTimeMS: 50,
      tokensUsed: 15,
      ranking,
      modelResult: makeSuccessChatResult(content, {
        usage: makeModelUsage({ promptTokens: 10, completionTokens: 5, cost, costCurrency: 'USD' }),
      }),
      startTime: new Date(),
      endTime: new Date(),
      promptRun: pr as never,
    });

    const armResults = [
      makeTaskResult('t1', 'arm 1 result', 2, 0.005, arm1Run),
      makeTaskResult('t2', 'arm 2 result (winner)', 1, 0.008, arm2Run),
      makeTaskResult('t3', 'arm 3 result', 3, 0.003, arm3Run),
    ];

    let passedParentIdToTasks: string | undefined;
    let passedParentIdToSelector: string | undefined;
    let passedUserToSelector: UserInfo | undefined;
    let passedScopeToSelector: AIPromptExecutionScope | undefined;

    // Deterministic execution planner returning 3 tasks
    (runner as unknown as { _executionPlanner: { createExecutionPlan: () => unknown[] } })._executionPlanner = {
      createExecutionPlan: () => armResults.map(r => r.task),
    };

    // Deterministic parallel coordinator
    (runner as unknown as { _parallelCoordinator: { executeTasksInParallel: (...args: unknown[]) => Promise<unknown>; selectBestResult: (...args: unknown[]) => Promise<unknown> } })._parallelCoordinator = {
      executeTasksInParallel: async (_params, _tasks, _config, parentPromptRunId) => {
        passedParentIdToTasks = parentPromptRunId as string;
        // When tasks execute, they set ParentID on child runs
        for (const r of armResults) {
          if (r.promptRun) {
            (r.promptRun as unknown as FakePromptRun).ParentID = parentPromptRunId as string;
          }
        }
        return {
          success: true,
          taskResults: armResults,
          errors: [],
          successCount: 3,
          failureCount: 0,
          cancelledCount: 0,
          totalExecutionTimeMS: 150,
          totalTokensUsed: 45,
          groupResults: new Map([[0, {}]]),
          startTime: new Date(),
          endTime: new Date(),
        };
      },
      selectBestResult: async (_results, _config, parentPromptRunId, _cancellationToken, contextUser, executionScope) => {
        passedParentIdToSelector = parentPromptRunId as string;
        passedUserToSelector = contextUser as UserInfo;
        passedScopeToSelector = executionScope as AIPromptExecutionScope;
        // Winner is arm 2
        return armResults[1];
      },
    };

    const apiKeys = [{ driverClass: 'GeminiLLM', apiKey: 'customer-key' }];
    const execParams = {
      prompt,
      contextUser: testUser,
      provider: fakeProvider,
      apiKeys,
      CredentialScope: 'RuntimeOnly',
      conversationMessages: [{ role: 'user', content: 'test question' }],
      templateMessageRole: 'none',
      verbose: false,
    };

    const result = await runner.ExecutePrompt(execParams as never);

    expect(result.success).toBe(true);
    expect(result.promptRun).toBeTruthy();

    const parentRun = result.promptRun as unknown as FakePromptRun;

    // 1. Consolidated parent is created BEFORE arms run and has RunType = 'ParallelParent'
    expect(parentRun.RunType).toBe('ParallelParent');

    // 2. Both coordinator calls receive parent ID
    expect(passedParentIdToTasks).toBeTruthy();
    expect(passedParentIdToTasks).toBe(parentRun.ID);
    expect(passedParentIdToSelector).toBe(parentRun.ID);

    // 3. Coordinator selectBestResult receives contextUser, and the scope its judge runs under
    expect(passedUserToSelector).toEqual(testUser);
    expect(passedScopeToSelector?.apiKeys).toBe(apiKeys);
    expect(passedScopeToSelector?.CredentialScope).toBe('RuntimeOnly');

    // 4. Children have ParentID = parent.ID
    expect(arm1Run.ParentID).toBe(parentRun.ID);
    expect(arm2Run.ParentID).toBe(parentRun.ID);
    expect(arm3Run.ParentID).toBe(parentRun.ID);

    // 5. Parent's Cost is NEVER assigned from an arm (Cost IS NULL / undefined), but DescendantCost & TotalCost reflect sum of arms
    expect(parentRun.Cost).toBeUndefined();
    expect(parentRun.DescendantCost).toBeCloseTo(0.005 + 0.008 + 0.003, 5);
    expect(parentRun.TotalCost).toBeCloseTo(0.005 + 0.008 + 0.003, 5);

    // 6. Parent WasSelectedResult = false, winner child WasSelectedResult = true
    expect(parentRun.WasSelectedResult).toBe(false);
    expect(arm2Run.WasSelectedResult).toBe(true);
    expect(arm1Run.WasSelectedResult).toBe(false);
    expect(arm3Run.WasSelectedResult).toBe(false);
  });

  it('ParallelExecutionCoordinator selectResultWithPrompt saves ResultSelector with contextUser, ModelID, and records JudgeID/JudgeScore', async () => {
    const judgePrompt = makePrompt({
      ID: 'judge-prompt-100',
      Name: 'Judge Prompt',
      OutputType: 'string',
      ParallelizationMode: 'None',
    });
    h.state.prompts.push(judgePrompt);

    const judgeModel = h.state.models[0] as { ID: string; Name: string };
    h.state.promptModels.push({
      ID: 'pm-judge',
      PromptID: judgePrompt.ID,
      ModelID: judgeModel.ID,
      VendorID: 'vendor-judge-1',
      Status: 'Active',
    });

    const coordinator = new ParallelExecutionCoordinator();
    (coordinator as unknown as { Provider: typeof fakeProvider }).Provider = fakeProvider;

    const parentId = 'pr-parent-999';

    const child1Run = new FakePromptRun();
    child1Run.NewRecord();
    child1Run.RunType = 'ParallelChild';
    child1Run.ParentID = parentId;

    const child2Run = new FakePromptRun();
    child2Run.NewRecord();
    child2Run.RunType = 'ParallelChild';
    child2Run.ParentID = parentId;

    const armResults: ExecutionTaskResult[] = [
      {
        task: { taskId: 'c1', prompt: judgePrompt as never, model: judgeModel as never, executionGroup: 0, priority: 1, renderedPrompt: 'p1', contextUser: testUser },
        success: true,
        rawResult: 'Candidate 1 response',
        executionTimeMS: 50,
        startTime: new Date(),
        endTime: new Date(),
        promptRun: child1Run as never,
      },
      {
        task: { taskId: 'c2', prompt: judgePrompt as never, model: judgeModel as never, executionGroup: 0, priority: 1, renderedPrompt: 'p2', contextUser: testUser },
        success: true,
        rawResult: 'Candidate 2 response',
        executionTimeMS: 50,
        startTime: new Date(),
        endTime: new Date(),
        promptRun: child2Run as never,
      },
    ];

    // Mock judge execution: judge returns ranking with candidate c2 winning with score 9.5
    testLLM.Script({
      kind: 'succeed',
      content: JSON.stringify({
        rankings: [
          { rank: 1, candidateId: 'c2', score: 9.5, reason: 'Much better analysis' },
          { rank: 2, candidateId: 'c1', score: 6.0, reason: 'Incomplete' },
        ],
      }),
    });

    const selectionConfig: ResultSelectionConfig = {
      method: 'PromptSelector',
      selectorPromptId: judgePrompt.ID as string,
    };

    const selected = await coordinator.selectBestResult(armResults, selectionConfig, parentId, undefined, testUser);

    expect(selected).toBeTruthy();
    expect(selected?.task.taskId).toBe('c2');

    // Find the ResultSelector prompt run created
    const selectorRuns = createdPromptRuns.filter(r => r.RunType === 'ResultSelector');
    expect(selectorRuns.length).toBe(1);
    const selectorRun = selectorRuns[0];

    // Assert ResultSelector row gets contextUser, ModelID, ParentID
    expect(selectorRun.contextUser).toEqual(testUser);
    expect(selectorRun.ParentID).toBe(parentId);
    expect(selectorRun.ModelID).toBe(judgeModel.ID);
    expect(selectorRun.JudgeID).toBe(judgePrompt.ID);
    expect(selectorRun.JudgeScore).toBe(9.5);

    // Winner child is marked WasSelectedResult = true
    expect(child2Run.WasSelectedResult).toBe(true);
    expect(child2Run.JudgeID).toBe(judgePrompt.ID);
    expect(child2Run.JudgeScore).toBe(9.5);

    // Loser child is not selected
    expect(child1Run.WasSelectedResult).toBe(false);
    expect(child1Run.JudgeID).toBe(judgePrompt.ID);
    expect(child1Run.JudgeScore).toBe(6.0);
  });
});

/**
 * The nesting-depth contract behind usage attribution.
 *
 * vwAIUsageFacts finds a prompt run's agent run through AIAgentRunStep.TargetLogID, looking at the
 * run itself, its parent and its grandparent (the s0 / s1 / s2 OUTER APPLYs) — so every prompt run
 * must sit at most two levels below the run an agent step targets. A deeper run is not an error in
 * the view; it silently resolves to no agent run (SourceKind 'Direct'). These tests pin each edge a
 * producer creates, so a change that nests deeper fails here instead:
 *
 *   parallel arm      → parallel parent        (1 level)
 *   result selector   → parallel parent        (1 level; asserted in the test above)
 *   JSON repair       → the run it repairs     (+1, and never repaired itself)
 *
 * The deepest chain is therefore repair → arm-or-selector → parallel parent: two levels. If you add a
 * producer, or let one recurse, extend the view's OUTER APPLY chain with it.
 */
describe('Prompt-run nesting depth (vwAIUsageFacts resolves self, parent, grandparent)', () => {
  const testUser: UserInfo = { ID: 'u-depth-1', Name: 'Depth User', Email: 'depth@example.com' } as UserInfo;

  beforeEach(() => {
    vi.restoreAllMocks();
    prSeq = 0;
    createdPromptRuns.length = 0;
    loadCatalog(buildRealisticCatalog());
    vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined);
  });

  it('creates a parallel arm one level below the parallel parent', async () => {
    const coordinator = new ParallelExecutionCoordinator();
    (coordinator as unknown as { Provider: typeof fakeProvider }).Provider = fakeProvider;
    const createArm = (coordinator as unknown as {
      createChildPromptRun(task: Record<string, unknown>, startTime: Date, parentPromptRunId: string, executionOrder?: number): Promise<FakePromptRun>;
    }).createChildPromptRun.bind(coordinator);

    const arm = await createArm(
      { taskId: 't1', prompt: { ID: 'p1' }, model: { ID: 'm1' }, executionGroup: 0, priority: 1, renderedPrompt: 'x', contextUser: testUser },
      new Date(),
      'parallel-parent-1',
      0,
    );

    expect(arm.RunType).toBe('ParallelChild');
    expect(arm.ParentID).toBe('parallel-parent-1');
  });

  it('runs a JSON repair one level below the run it repairs, and never lets it start a repair of its own', async () => {
    h.state.prompts = [{ ID: 'repair-json', Name: 'Repair JSON', Category: 'MJ: System', Status: 'Active', OutputType: 'object' }];
    const runner = new AIPromptRunner();
    const execute = vi.spyOn(runner, 'ExecutePrompt').mockResolvedValue({ success: true, result: '{"total": 1}' } as Awaited<ReturnType<AIPromptRunner['ExecutePrompt']>>);
    const attemptJSONRepair = (runner as unknown as {
      attemptJSONRepair(rawOutput: string, originalError: Error, params: Record<string, unknown>, currentPromptRun: { ID: string }): Promise<unknown>;
    }).attemptJSONRepair.bind(runner);

    // Malformed beyond what the local (JSON5, lexical) repairs can fix, so the AI repair runs.
    const repaired = await attemptJSONRepair(
      '{"total": }',
      new Error('Unexpected token }'),
      { contextUser: testUser, attemptJSONRepair: true, agentId: 'agent-1', provider: fakeProvider },
      { ID: 'run-being-repaired' },
    );

    expect(repaired).toEqual({ total: 1 });
    expect(execute).toHaveBeenCalledTimes(1);
    const repairParams = execute.mock.calls[0][0];
    // One level below the repaired run...
    expect(repairParams.parentPromptRunId).toBe('run-being-repaired');
    // ...and a leaf: a repair is only ever started when attemptJSONRepair is set, and the repair's
    // own run does not set it, so its output can never trigger a second, deeper repair.
    expect(repairParams.attemptJSONRepair).toBeFalsy();
  });

  it("runs a JSON repair under the repaired prompt's configuration and credentials", async () => {
    // It forwarded contextUser alone, so inside a customer's run the repair spent the platform's keys.
    h.state.prompts = [{ ID: 'repair-json', Name: 'Repair JSON', Category: 'MJ: System', Status: 'Active', OutputType: 'object' }];
    const runner = new AIPromptRunner();
    const execute = vi.spyOn(runner, 'ExecutePrompt').mockResolvedValue({ success: true, result: '{"total": 1}' } as Awaited<ReturnType<AIPromptRunner['ExecutePrompt']>>);
    const attemptJSONRepair = (runner as unknown as {
      attemptJSONRepair(rawOutput: string, originalError: Error, params: Record<string, unknown>, currentPromptRun: { ID: string }): Promise<unknown>;
    }).attemptJSONRepair.bind(runner);
    const apiKeys = [{ driverClass: 'GeminiLLM', apiKey: 'customer-key' }];

    await attemptJSONRepair(
      '{"total": }',
      new Error('Unexpected token }'),
      { contextUser: testUser, provider: fakeProvider, configurationId: 'config-1', apiKeys, credentialId: 'credential-1', CredentialScope: 'RuntimeOnly' },
      { ID: 'run-being-repaired' },
    );

    const repairParams = execute.mock.calls[0][0];
    expect(repairParams.contextUser).toBe(testUser);
    expect(repairParams.provider).toBe(fakeProvider);
    expect(repairParams.configurationId).toBe('config-1');
    expect(repairParams.apiKeys).toBe(apiKeys);
    expect(repairParams.credentialId).toBe('credential-1');
    expect(repairParams.CredentialScope).toBe('RuntimeOnly');
  });
});

describe('PromptSelector judge runs under the parallel prompt\'s execution scope', () => {
  const testUser: UserInfo = { ID: 'u-scope-1', Name: 'Scope User', Email: 'scope@example.com' } as UserInfo;

  beforeEach(() => {
    vi.restoreAllMocks();
    loadCatalog(buildRealisticCatalog());
    h.state.prompts = [makePrompt({ ID: 'judge-prompt-scope', Name: 'Judge Prompt', ParallelizationMode: 'None' })];
  });

  it("forwards the scope's apiKeys, configurationId and CredentialScope to the judge's ExecutePrompt", async () => {
    // The judge used to run on contextUser alone, so inside a customer's RuntimeOnly run it spent the platform's keys.
    const execute = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockResolvedValue(
      { success: false, errorMessage: 'judge stubbed' } as Awaited<ReturnType<AIPromptRunner['ExecutePrompt']>>
    );
    const coordinator = new ParallelExecutionCoordinator();
    const apiKeys = [{ driverClass: 'GeminiLLM', apiKey: 'customer-key' }];
    const scope: AIPromptExecutionScope = { contextUser: testUser, configurationId: 'config-1', apiKeys, credentialId: 'credential-1', CredentialScope: 'RuntimeOnly' };
    const arm = (taskId: string): ExecutionTaskResult => ({
      task: { taskId, prompt: h.state.prompts[0] as never, model: h.state.models[0] as never, executionGroup: 0, priority: 1, renderedPrompt: taskId, contextUser: testUser },
      success: true,
      rawResult: `response ${taskId}`,
      executionTimeMS: 1,
      startTime: new Date(),
      endTime: new Date(),
    });
    const config: ResultSelectionConfig = { method: 'PromptSelector', selectorPromptId: 'judge-prompt-scope' };

    await coordinator.selectBestResult([arm('c1'), arm('c2')], config, 'parent-1', undefined, testUser, scope);

    expect(execute).toHaveBeenCalledTimes(1);
    const judgeParams = execute.mock.calls[0][0];
    expect(judgeParams.prompt).toBe(h.state.prompts[0]);
    expect(judgeParams.apiKeys).toBe(apiKeys);
    expect(judgeParams.configurationId).toBe('config-1');
    expect(judgeParams.credentialId).toBe('credential-1');
    expect(judgeParams.CredentialScope).toBe('RuntimeOnly');
    expect(judgeParams.contextUser).toBe(testUser);
  });
});
