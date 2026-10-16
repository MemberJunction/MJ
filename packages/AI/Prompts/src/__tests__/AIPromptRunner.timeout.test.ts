/**
 * Tests for model-call timeout enforcement on the single-model execution path (issue #3064).
 *
 * Before this fix the single-model path bounded the model call ONLY when the caller supplied a
 * `cancellationToken` — with no token, `llm.ChatCompletion()` was awaited with no bound at all and
 * a hung provider hung forever. These tests pin the composed behavior — `AIPromptParams.timeoutMS`
 * (or the runner's `DefaultPromptTimeoutMS`) and the caller token BOTH apply, whichever fires first
 * wins, and neither bound may be discarded — plus the no-timeout legacy behavior.
 *
 * Boundaries mocked exactly like AIPromptRunner.execute-e2e.test.ts (AIEngine catalog, credentials,
 * ClassFactory → controllable LLM, prompt-run persistence), so these exercise the REAL ExecutePrompt
 * pipeline end to end.
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

import { AIPromptRunner, type ExecutionBound } from '../AIPromptRunner';
import { AIPromptTimeoutError } from '../AIPromptTimeoutError';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJGlobal } from '@memberjunction/global';
import { buildRealisticCatalog, DEFAULT_CONFIGURED_DRIVERS, MODEL_TYPE, type AICatalog } from './__fixtures__/ai-metadata.fixtures';

// ---- controllable LLM: one call, resolution controlled per test ----
type ChatResultLike = { success: boolean; data?: unknown; errorMessage?: string; errorInfo?: { errorType: string; severity: string; canFailover: boolean } };

/** Scripted per-call outcomes, used before the default delay behaviour: a failover-eligible failure, or a hung call. */
let llmScript: Array<'networkFailure' | 'hang'> = [];

/** How long the fake provider takes to answer. `'never'` models a hung socket. */
let llmDelayMS: number | 'never' = 0;
let llmCallCount = 0;
/** ChatParams captured on each call (so we can assert what the driver was handed). */
const llmCalls: Array<{ cancellationToken?: AbortSignal }> = [];

function makeChatResult(content: string): ChatResultLike {
  return { success: true, data: { choices: [{ message: { content } }], usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, cost: 0.001 } } };
}

const testLLM = {
  SupportsPrefill: false,
  GetFileCapabilities: () => null,
  async ChatCompletion(params: { cancellationToken?: AbortSignal }): Promise<ChatResultLike> {
    llmCallCount++;
    llmCalls.push(params);
    const scripted = llmScript.shift();
    if (scripted === 'networkFailure') {
      return { success: false, errorMessage: 'fetch failed: network socket disconnected', errorInfo: { errorType: 'NetworkError', severity: 'Retriable', canFailover: true } };
    }
    if (scripted === 'hang') {
      return await new Promise<ChatResultLike>(() => { /* never settles — a hung provider */ });
    }
    if (llmDelayMS === 'never') {
      return await new Promise<ChatResultLike>(() => { /* never settles — a hung provider */ });
    }
    const delay = llmDelayMS;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    return makeChatResult('done');
  },
};

// ---- fake AIPromptRun entity + provider ----
let prSeq = 0;
class FakePromptRun {
  /**
   * How long the first Save (the 'Running' INSERT) takes. When it lands, the run reloads from the
   * fields it sent, as BaseEntity's finalizeSave does — undoing anything set while it was in flight.
   */
  public static InsertDelayMS = 0;
  public ID = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public saveCount = 0;
  /** The fields as of the last Save: what the database holds. */
  public Persisted: Record<string, unknown> = {};
  [k: string]: unknown;
  NewRecord(): boolean { this.ID = `pr-${++prSeq}`; return true; }
  async Save(): Promise<boolean> {
    this.saveCount++;
    const sent = this.fields();
    if (this.saveCount === 1 && FakePromptRun.InsertDelayMS > 0) {
      await new Promise(resolve => setTimeout(resolve, FakePromptRun.InsertDelayMS));
      Object.assign(this, sent);
    }
    this.Persisted = sent;
    return true;
  }
  private fields(): Record<string, unknown> {
    const { Persisted: _persisted, saveCount: _saves, LatestResult: _latest, ...fields } = this as Record<string, unknown>;
    return { ...fields };
  }
}
let lastPromptRun: FakePromptRun | null = null;
const fakeProvider = { GetEntityObject: vi.fn(async () => { lastPromptRun = new FakePromptRun(); return lastPromptRun; }) };

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
    ID: 'prompt-1', Name: 'Timeout Prompt', Status: 'Active',
    TemplateID: null, // bypass template rendering
    SelectionStrategy: 'Default', AIModelTypeID: MODEL_TYPE.LLM,
    OutputType: 'string', OutputExample: null, ValidationBehavior: 'Warn',
    MaxRetries: 0, ParallelizationMode: 'None', RequireSpecificModels: false,
    FailoverStrategy: 'None',
    ...o,
  };
}

function makeParams(prompt: Record<string, unknown>, o: Record<string, unknown> = {}): unknown {
  return { prompt, contextUser: { ID: 'u1', Name: 'T' }, provider: fakeProvider, conversationMessages: [{ role: 'user', content: 'Hello' }], templateMessageRole: 'none', verbose: false, ...o };
}

/** Reaches the protected bound-composition helpers for direct unit assertions. */
type BoundInternals = {
  getEffectiveTimeoutMS(params: { timeoutMS?: number }): number | undefined;
  createExecutionBound(prompt: { Name: string }, params: { timeoutMS?: number }, token?: AbortSignal): ExecutionBound;
};
function priv(r: AIPromptRunner): BoundInternals { return r as unknown as BoundInternals; }

let runner: AIPromptRunner;
beforeEach(() => {
  vi.restoreAllMocks();
  llmDelayMS = 0; llmCallCount = 0; llmCalls.length = 0; llmScript = []; lastPromptRun = null; FakePromptRun.InsertDelayMS = 0;
  loadCatalog(buildRealisticCatalog());
  vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined as never);
  vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => testLLM as never);
  runner = new AIPromptRunner();
});

describe('getEffectiveTimeoutMS', () => {
  it('returns the caller-supplied timeoutMS when it is a positive number', () => {
    expect(priv(runner).getEffectiveTimeoutMS({ timeoutMS: 5000 })).toBe(5000);
  });
  it('returns undefined when no timeoutMS is supplied and the runner declares no default (opt-out preserved)', () => {
    expect(priv(runner).getEffectiveTimeoutMS({})).toBeUndefined();
  });
  it('returns undefined for 0 / negative values (treated as "no timeout")', () => {
    expect(priv(runner).getEffectiveTimeoutMS({ timeoutMS: 0 })).toBeUndefined();
    expect(priv(runner).getEffectiveTimeoutMS({ timeoutMS: -1 })).toBeUndefined();
  });
  it('falls back to the runner-level DefaultPromptTimeoutMS when the caller supplies none', () => {
    class BoundedRunner extends AIPromptRunner {
      protected override get DefaultPromptTimeoutMS(): number | undefined { return 1234; }
    }
    const bounded = new BoundedRunner();
    expect(priv(bounded).getEffectiveTimeoutMS({})).toBe(1234);
    // an explicit caller value still wins over the engine default
    expect(priv(bounded).getEffectiveTimeoutMS({ timeoutMS: 99 })).toBe(99);
  });
});

describe('createExecutionBound — composing the caller token with the timeout', () => {
  it('no timeout + no token => no signal at all (unbounded legacy behavior)', () => {
    const bound = priv(runner).createExecutionBound({ Name: 'p' }, {});
    expect(bound.Signal).toBeUndefined();
    bound.Dispose();
  });

  it('no timeout + caller token => the caller token is used verbatim (never discarded)', () => {
    const controller = new AbortController();
    const bound = priv(runner).createExecutionBound({ Name: 'p' }, {}, controller.signal);
    expect(bound.Signal).toBe(controller.signal);
    bound.Dispose();
  });

  it('timeout only => the composed signal aborts with a typed AIPromptTimeoutError', async () => {
    const bound = priv(runner).createExecutionBound({ Name: 'p' }, { timeoutMS: 20 });
    expect(bound.Signal).toBeDefined();
    expect(bound.TimedOut()).toBe(false);
    await new Promise<void>((r) => setTimeout(r, 60));
    expect(bound.Signal!.aborted).toBe(true);
    expect(bound.TimedOut()).toBe(true);
    expect(bound.Signal!.reason).toBeInstanceOf(AIPromptTimeoutError);
    bound.Dispose();
  });

  it('timeout + caller token => an already-aborted caller token aborts the composed signal immediately', () => {
    const controller = new AbortController();
    controller.abort();
    const bound = priv(runner).createExecutionBound({ Name: 'p' }, { timeoutMS: 10_000 }, controller.signal);
    expect(bound.Signal!.aborted).toBe(true);
    expect(bound.TimedOut()).toBe(false); // the CALLER aborted, not the timeout
    bound.Dispose();
  });

  it('timeout + caller token => the caller aborting later still aborts the composed signal (token not discarded)', async () => {
    const controller = new AbortController();
    const bound = priv(runner).createExecutionBound({ Name: 'p' }, { timeoutMS: 10_000 }, controller.signal);
    expect(bound.Signal!.aborted).toBe(false);
    controller.abort();
    expect(bound.Signal!.aborted).toBe(true);
    expect(bound.TimedOut()).toBe(false);
    bound.Dispose();
  });

  it('Dispose() clears the timer so a disposed bound never aborts afterwards', async () => {
    const bound = priv(runner).createExecutionBound({ Name: 'p' }, { timeoutMS: 20 });
    bound.Dispose();
    await new Promise<void>((r) => setTimeout(r, 60));
    expect(bound.Signal!.aborted).toBe(false);
    expect(bound.TimedOut()).toBe(false);
  });
});

describe('ExecutePrompt — timeout enforcement on the single-model path', () => {
  it('aborts a hung model call at the configured timeout even with NO caller cancellation token', async () => {
    llmDelayMS = 'never';
    const start = Date.now();
    const result = await runner.ExecutePrompt(makeParams(makePrompt(), { timeoutMS: 50 }) as never);
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.errorMessage?.toLowerCase()).toContain('timeout');
    expect(elapsed).toBeLessThan(3000); // would hang forever before the fix
    expect(llmCallCount).toBe(1);
  });

  it('the timeout failure is a typed AIPromptTimeoutError carrying the configured budget', async () => {
    llmDelayMS = 'never';
    const result = await runner.ExecutePrompt(makeParams(makePrompt(), { timeoutMS: 40 }) as never);
    expect(result.success).toBe(false);
    const err = result.chatResult?.exception;
    expect(err).toBeInstanceOf(AIPromptTimeoutError);
    expect((err as AIPromptTimeoutError).TimeoutMS).toBe(40);
    // ErrorAnalyzer classifies it as a retriable NetworkError, so failover/retry logic can act on it
    expect(result.chatResult?.errorInfo?.errorType).toBe('NetworkError');
    expect(result.chatResult?.errorInfo?.canFailover).toBe(true);
  });

  it('hands the driver the COMPOSED signal on ChatParams.cancellationToken (ready for HTTP-level abort)', async () => {
    llmDelayMS = 'never';
    await runner.ExecutePrompt(makeParams(makePrompt(), { timeoutMS: 40 }) as never);
    expect(llmCalls[0].cancellationToken).toBeDefined();
    expect(llmCalls[0].cancellationToken!.aborted).toBe(true); // the timeout aborted it
  });

  it('a call that finishes INSIDE the budget succeeds normally', async () => {
    llmDelayMS = 10;
    const result = await runner.ExecutePrompt(makeParams(makePrompt(), { timeoutMS: 5000 }) as never);
    expect(result.success).toBe(true);
    expect(result.result).toBe('done');
  });
});

describe('ExecutePrompt — caller cancellation still honored when no timeout is set', () => {
  it('aborts a hung model call when the caller aborts mid-flight (legacy behavior preserved)', async () => {
    llmDelayMS = 'never';
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);

    const result = await runner.ExecutePrompt(makeParams(makePrompt(), { cancellationToken: controller.signal }) as never);
    expect(result.success).toBe(false);
    expect(result.errorMessage?.toLowerCase()).toContain('cancel');
  });

  it('with NO timeout and NO token the call is unbounded (a slow-but-finite provider still succeeds)', async () => {
    llmDelayMS = 120;
    const result = await runner.ExecutePrompt(makeParams(makePrompt()) as never);
    expect(result.success).toBe(true);
    expect(result.result).toBe('done');
  });
});

describe('ExecutePrompt — both bounds present: whichever fires first wins', () => {
  it('the timeout fires first => reported as a timeout, not a cancellation', async () => {
    llmDelayMS = 'never';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000); // caller bound far in the future

    const result = await runner.ExecutePrompt(makeParams(makePrompt(), { timeoutMS: 40, cancellationToken: controller.signal }) as never);
    clearTimeout(timer);

    expect(result.success).toBe(false);
    expect(result.errorMessage?.toLowerCase()).toContain('timeout');
    expect(result.errorMessage?.toLowerCase()).not.toContain('cancelled');
  });

  it('the caller token fires first => reported as a cancellation, not a timeout', async () => {
    llmDelayMS = 'never';
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);

    const result = await runner.ExecutePrompt(makeParams(makePrompt(), { timeoutMS: 5000, cancellationToken: controller.signal }) as never);

    expect(result.success).toBe(false);
    expect(result.errorMessage?.toLowerCase()).toContain('cancel');
    expect(result.errorMessage?.toLowerCase()).not.toContain('timeout');
  });
});

describe('ExecutePrompt — caller cancellation stops failover', () => {
  const failoverPrompt = (): Record<string, unknown> => makePrompt({ FailoverStrategy: 'NextBestModel' });
  /** The console.error lines a run wrote — every logError / LogErrorEx ends there. */
  function errorLines(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.map(call => String(call[0]));
  }

  it('calls one candidate when the caller aborts mid-call, and records the run as cancelled with no error logged', async () => {
    llmDelayMS = 'never';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    const result = await runner.ExecutePrompt(makeParams(failoverPrompt(), { cancellationToken: controller.signal }) as never);
    await runner.WaitForPendingPromptRunSaves();

    expect(llmCallCount).toBe(1);
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.status).toBe('Cancelled');
    expect(errorLines(errorSpy)).toEqual([]);
    expect(lastPromptRun!.Status).toBe('Cancelled');
    expect(lastPromptRun!.Cancelled).toBe(true);
    expect(lastPromptRun!.CancellationReason).toBe('user_requested');
  });

  it('keeps the real failure that came before the cancellation, and still stops at the cancelled candidate', async () => {
    llmScript = ['networkFailure', 'hang'];
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    const result = await runner.ExecutePrompt(makeParams(failoverPrompt(), { cancellationToken: controller.signal }) as never);
    await runner.WaitForPendingPromptRunSaves();

    expect(llmCallCount).toBe(2);
    expect(result.cancelled).toBe(true);
    expect(lastPromptRun!.Persisted.FailoverAttempts).toBe(1);
    expect(lastPromptRun!.Persisted.Status).toBe('Cancelled');
  });

  it('keeps the failover attempt on the saved run when the INSERT lands after the cancellation', async () => {
    FakePromptRun.InsertDelayMS = 100;
    llmScript = ['networkFailure', 'hang'];
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    await runner.ExecutePrompt(makeParams(failoverPrompt(), { cancellationToken: controller.signal }) as never);
    await runner.WaitForPendingPromptRunSaves();

    expect(lastPromptRun!.Persisted.FailoverAttempts).toBe(1);
    expect(lastPromptRun!.Persisted.Status).toBe('Cancelled');
  });

  it('keeps the failover attempt of a run that recovered by failing over, when the INSERT is slow', async () => {
    FakePromptRun.InsertDelayMS = 100;
    llmScript = ['networkFailure'];

    const result = await runner.ExecutePrompt(makeParams(failoverPrompt()) as never);
    await runner.WaitForPendingPromptRunSaves();

    expect(result.success).toBe(true);
    expect(lastPromptRun!.Persisted.FailoverAttempts).toBe(1);
  });

  it('still fails over from a prompt timeout, which is not a cancellation', async () => {
    llmScript = ['hang'];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = new AbortController();

    const result = await runner.ExecutePrompt(makeParams(failoverPrompt(), { timeoutMS: 20, cancellationToken: controller.signal }) as never);

    expect(result.success).toBe(true);
    expect(llmCallCount).toBe(2);
  });

  it('leaves no abort listener on a caller token reused across prompts', async () => {
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');

    for (let i = 0; i < 3; i++) {
      const result = await runner.ExecutePrompt(makeParams(makePrompt(), { cancellationToken: controller.signal }) as never);
      expect(result.success).toBe(true);
    }

    const abortAdds = added.mock.calls.filter(([type]) => type === 'abort').length;
    const abortRemoves = removed.mock.calls.filter(([type]) => type === 'abort').length;
    expect(abortAdds).toBeGreaterThan(0);
    expect(abortRemoves).toBe(abortAdds);
  });
});
