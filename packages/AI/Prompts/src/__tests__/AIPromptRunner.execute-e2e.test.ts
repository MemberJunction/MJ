/**
 * End-to-end tests for AIPromptRunner.ExecutePrompt() — the full pipeline wired together with
 * the boundaries mocked: AIEngine (catalog), credentials (GetAIAPIKey + CredentialEngine), the
 * LLM (ClassFactory.CreateInstance → a controllable TestLLM), AIEngineBase.EnsureLoaded, and the
 * AIPromptRun persistence provider. Template rendering is bypassed via TemplateID=null +
 * conversationMessages so these tests stay focused on the orchestration: model selection →
 * execution → parse/validate → retry → result assembly → fire-and-forget persistence, plus
 * cancellation and the parallel-execution aggregation path.
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
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJGlobal } from '@memberjunction/global';
import { ChildPromptParam } from '@memberjunction/ai-core-plus';
import { buildRealisticCatalog, DEFAULT_CONFIGURED_DRIVERS, MODEL_TYPE, type AICatalog } from './__fixtures__/ai-metadata.fixtures';

/** Mock template engine: renders any template to `rendered:<id>` and exposes the requested templates. */
function mockTemplateEngine(): unknown {
  const tmpl = (id: string) => ({ ID: id, Name: id, GetHighestPriorityContent: () => ({ ID: `${id}-c`, TemplateText: `text:${id}` }) });
  const calls: string[] = [];
  return {
    __renderCalls: calls,
    Config: vi.fn().mockResolvedValue(undefined),
    Templates: [tmpl('tmpl-parent'), tmpl('tmpl-child')],
    RenderTemplate: vi.fn(async (template: { ID: string }) => { calls.push(template.ID); return { Success: true, Output: `rendered:${template.ID}` }; }),
  };
}

// ---- controllable LLM ----
type ChatResultLike = { success: boolean; data?: unknown; errorMessage?: string; errorInfo?: unknown };
let llmResponses: ChatResultLike[] = [];
let llmCallCount = 0;
const llmCalls: unknown[] = [];

function makeChatResult(content: string, usage: Partial<{ promptTokens: number; completionTokens: number; totalTokens: number; cost: number }> = {}): ChatResultLike {
  const u = { promptTokens: 10, completionTokens: 5, totalTokens: 15, cost: 0.001, ...usage };
  return { success: true, data: { choices: [{ message: { content } }], usage: u } };
}

const testLLM = {
  SupportsPrefill: false,
  GetFileCapabilities: () => null,
  async ChatCompletion(params: unknown) {
    llmCalls.push(params);
    const r = llmResponses[Math.min(llmCallCount, llmResponses.length - 1)] ?? makeChatResult('{}');
    llmCallCount++;
    return r;
  },
};

// ---- fake AIPromptRun entity + provider ----
let prSeq = 0;
class FakePromptRun {
  public ID = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public saveCount = 0;
  [k: string]: unknown;
  NewRecord(): boolean { this.ID = `pr-${++prSeq}`; return true; }
  async Save(): Promise<boolean> { this.saveCount++; return true; }
}
let lastPromptRun: FakePromptRun | null = null;
const fakeProvider = {
  GetEntityObject: vi.fn(async () => { lastPromptRun = new FakePromptRun(); return lastPromptRun; }),
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
    ID: 'prompt-1', Name: 'E2E Prompt', Status: 'Active',
    TemplateID: null, // bypass template rendering
    SelectionStrategy: 'Default', AIModelTypeID: MODEL_TYPE.LLM,
    OutputType: 'string', OutputExample: null, ValidationBehavior: 'Warn',
    MaxRetries: 0, ParallelizationMode: 'None', RequireSpecificModels: false,
    ...o,
  };
}

function makeParams(prompt: Record<string, unknown>, o: Record<string, unknown> = {}): unknown {
  return { prompt, contextUser: { ID: 'u1', Name: 'T' }, provider: fakeProvider, conversationMessages: [{ role: 'user', content: 'Hello' }], templateMessageRole: 'none', verbose: false, ...o };
}

let runner: AIPromptRunner;
beforeEach(() => {
  vi.restoreAllMocks();
  llmResponses = []; llmCallCount = 0; llmCalls.length = 0; lastPromptRun = null;
  loadCatalog(buildRealisticCatalog());
  vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined as never);
  vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => testLLM as never);
  runner = new AIPromptRunner();
});

describe('ExecutePrompt — single execution happy path', () => {
  it('returns success with the raw string result and a Completed prompt run', async () => {
    llmResponses = [makeChatResult('The answer is 42.')];
    const result = await runner.ExecutePrompt(makeParams(makePrompt({ OutputType: 'string' })) as never);
    expect(result.success).toBe(true);
    expect(result.result).toBe('The answer is 42.');
    expect(result.promptRun).toBeTruthy();
    expect((result.promptRun as unknown as { Status: string }).Status).toBe('Completed');
    expect(result.tokensUsed).toBe(15);
    expect(result.modelInfo?.modelName).toBeTruthy();
  });

  it('parses + validates object output against the OutputExample', async () => {
    llmResponses = [makeChatResult(JSON.stringify({ sentiment: 'positive', score: 0.9 }))];
    const prompt = makePrompt({ OutputType: 'object', OutputExample: JSON.stringify({ sentiment: 'x', score: 0 }), ValidationBehavior: 'Strict' });
    const result = await runner.ExecutePrompt<{ sentiment: string; score: number }>(makeParams(prompt) as never);
    expect(result.success).toBe(true);
    expect(result.result?.sentiment).toBe('positive');
    expect(result.validationResult?.Success).toBe(true);
  });
});

describe('ExecutePrompt — validation + retry', () => {
  it('Strict mode retries on validation failure then succeeds (tokens accumulate across attempts)', async () => {
    const example = JSON.stringify({ name: 'x', age: 0 });
    llmResponses = [
      makeChatResult(JSON.stringify({ name: 'Bob' }), { promptTokens: 10, completionTokens: 5 }),          // missing age -> invalid
      makeChatResult(JSON.stringify({ name: 'Bob', age: 30 }), { promptTokens: 12, completionTokens: 6 }),  // valid
    ];
    const prompt = makePrompt({ OutputType: 'object', OutputExample: example, ValidationBehavior: 'Strict', MaxRetries: 1 });
    const result = await runner.ExecutePrompt(makeParams(prompt) as never);
    expect(result.success).toBe(true);
    expect(result.validationAttempts?.length).toBe(2);
    expect(result.tokensUsed).toBe(10 + 5 + 12 + 6); // cumulative across both attempts
  });

  it('Warn mode returns the invalid output without retrying', async () => {
    const example = JSON.stringify({ name: 'x', age: 0 });
    llmResponses = [makeChatResult(JSON.stringify({ name: 'Bob' }))]; // missing age
    const prompt = makePrompt({ OutputType: 'object', OutputExample: example, ValidationBehavior: 'Warn', MaxRetries: 3 });
    const result = await runner.ExecutePrompt(makeParams(prompt) as never);
    expect(result.validationAttempts?.length).toBe(1); // no retry in Warn mode
    expect(result.validationResult?.Success).toBe(false);
    expect(result.errorMessage).toMatch(/Validation failed/);
  });
});

describe('ExecutePrompt — model execution failure', () => {
  it('propagates a failed ChatResult as an unsuccessful prompt result', async () => {
    llmResponses = [{ success: false, errorMessage: 'provider exploded', data: null }];
    const result = await runner.ExecutePrompt(makeParams(makePrompt()) as never);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/provider exploded/);
  });
});

describe('ExecutePrompt — cancellation', () => {
  it('returns a Cancelled result when the token is already aborted before starting', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runner.ExecutePrompt(makeParams(makePrompt(), { cancellationToken: controller.signal }) as never);
    expect(result.success).toBe(false);
    expect(result.status).toBe('Cancelled');
    expect(result.cancelled).toBe(true);
  });
});

describe('ExecutePrompt — fire-and-forget persistence', () => {
  it('creates + finalizes the AIPromptRun via queued saves (>=2 saves), flushable via WaitForPendingPromptRunSaves', async () => {
    llmResponses = [makeChatResult('ok')];
    const result = await runner.ExecutePrompt(makeParams(makePrompt()) as never);
    expect(result.success).toBe(true);
    await runner.WaitForPendingPromptRunSaves();
    expect(lastPromptRun).toBeTruthy();
    expect(lastPromptRun!.saveCount).toBeGreaterThanOrEqual(2); // INSERT (Running) + UPDATE (Completed)
    expect(lastPromptRun!.ID).toMatch(/^pr-/);                  // ID assigned by NewRecord before any await
  });
});

describe('ExecutePrompt — hierarchical child-prompt composition', () => {
  it('renders child templates then the parent, and executes the composed prompt once', async () => {
    llmResponses = [makeChatResult('composed answer')];
    const te = mockTemplateEngine();
    (runner as unknown as { _templateEngine: unknown })._templateEngine = te;

    const parent = makePrompt({ TemplateID: 'tmpl-parent', OutputType: 'string' });
    const child = makePrompt({ ID: 'child-1', Name: 'Child', TemplateID: 'tmpl-child', OutputType: 'string' });
    const childParams = { prompt: child, contextUser: { ID: 'u1' }, data: {} };
    const params = makeParams(parent, {
      conversationMessages: undefined,
      templateMessageRole: 'system',
      childPrompts: [new ChildPromptParam(childParams as never, 'analysis')],
    });

    const result = await runner.ExecutePrompt(params as never);
    expect(result.success).toBe(true);
    expect(result.result).toBe('composed answer');
    // Both the child and the parent templates were rendered (depth-first compose).
    const renderCalls = (te as { __renderCalls: string[] }).__renderCalls;
    expect(renderCalls).toContain('tmpl-child');
    expect(renderCalls).toContain('tmpl-parent');
    // Exactly one model call — the composed prompt runs once.
    expect(llmCallCount).toBe(1);
  });
});

describe('ExecutePrompt — parallel execution aggregation', () => {
  it('aggregates tokens across tasks, selects a result, and surfaces additionalResults', async () => {
    llmResponses = [makeChatResult('unused')];
    const prompt = makePrompt({ OutputType: 'string', ParallelizationMode: 'ModelSpecific' });

    const model = h.state.models[0] as { ID: string; Name: string; Vendor?: string };
    const taskResult = (taskId: string, content: string, ranking: number) => ({
      success: true, rawResult: content, executionTimeMS: 10, ranking,
      task: { taskId, model: { ID: model.ID, Name: model.Name, Vendor: 'Anthropic' } },
      modelResult: makeChatResult(content, { promptTokens: 7, completionTokens: 3, totalTokens: 10 }),
    });

    // Replace the heavy collaborators with deterministic stand-ins.
    (runner as unknown as { _executionPlanner: { createExecutionPlan: () => unknown[] } })._executionPlanner = {
      createExecutionPlan: () => [{ taskId: 't1' }, { taskId: 't2' }],
    };
    (runner as unknown as { _parallelCoordinator: { executeTasksInParallel: () => Promise<unknown> } })._parallelCoordinator = {
      executeTasksInParallel: async () => ({
        success: true,
        taskResults: [taskResult('t1', 'first', 1), taskResult('t2', 'second', 2)],
        errors: [], successCount: 2, failureCount: 0, totalExecutionTimeMS: 20, totalTokensUsed: 20,
        groupResults: new Map([[0, {}]]),
      }),
    };

    const result = await runner.ExecutePrompt(makeParams(prompt) as never);
    expect(result.success).toBe(true);
    expect(result.combinedTokensUsed).toBe(20);       // 10 + 10 across both tasks
    expect(result.additionalResults?.length).toBe(1); // the non-selected task
  });
});
