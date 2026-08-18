/**
 * Failover tests for the REAL AIPromptRunner failover machinery.
 *
 * Unlike the previous incarnation of this file (which re-implemented the failover decision
 * logic in-test and asserted against its own copy), every test here drives the actual
 * production path:
 *
 *   executeModelWithFailover  → the candidate loop, credential gating, and the CRITICAL
 *                               `!result.success && result.errorInfo?.canFailover` check
 *   executeModel              → the real model-execution path (credential resolution,
 *                               ChatParams assembly, driver instantiation via ClassFactory)
 *   processFailoverError      → attempt recording, vendor-level filtering, Fatal-severity
 *                               stop, errorScope filtering, rate-limit retry decision
 *   handleRateLimitRetry      → same-candidate retry with MaxRetries + backoff
 *   filterVendorCandidates    → Authentication / VendorValidationError vendor exclusion
 *   createFailoverErrorResult → final failed ChatResult after exhaustion
 *   updatePromptRunWithFailoverSuccess / Failure → AIPromptRun attempt bookkeeping
 *
 * Only package boundaries are mocked: the AIEngine metadata catalog, credential lookup
 * (GetAIAPIKey + CredentialEngine), and the LLM driver itself — a scripted TestLLM that
 * extends the real BaseLLM, injected by stubbing ClassFactory.CreateInstance. (That stub
 * bypasses driver-class *resolution* by DriverClass string — the failover DECISION logic is
 * what's under test here, not the string→class lookup.) Error classification is NOT faked:
 * failed ChatResults carry errorInfo built by the real ErrorAnalyzer, mirroring what
 * GeminiLLM / OpenAILLM / AnthropicLLM etc. return.
 *
 * Historical bug this suite guards (the reason this file exists): provider drivers catch
 * errors internally and RETURN ChatResult{success:false} instead of throwing, so a failover
 * implementation that only catches exceptions never fails over on network errors, rate
 * limits, or provider outages. The `ChatResult{success:false}` tests below execute the real
 * fix at AIPromptRunner.executeModelWithFailover and fail if that check ever regresses.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock AIEngine catalog + credential gate (same harness as the model-selection
// and execute-e2e suites in this directory).
// ---------------------------------------------------------------------------
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
import type { ChatResult } from '@memberjunction/ai'; // real types — the mock only replaces GetAIAPIKey
import { TestLLM, makeFailedChatResult } from '@memberjunction/unit-testing';
import { buildRealisticCatalog, DEFAULT_CONFIGURED_DRIVERS, MODEL_TYPE, type AICatalog } from './__fixtures__/ai-metadata.fixtures';

// ---------------------------------------------------------------------------
// Scripted TestLLM (shared harness, extends the REAL BaseLLM) — stands in for a
// provider driver at the package boundary. It either THROWS (SDK-style failure)
// or RETURNS ChatResult{success:false} with errorInfo built by the real
// ErrorAnalyzer (driver-style failure — the historical bug class). Call
// recording (testLLM.CalledModels) proves candidate order.
// ---------------------------------------------------------------------------
const testLLM = new TestLLM();

// ---------------------------------------------------------------------------
// Direct-drive plumbing for executeModelWithFailover (same reach-the-protected-
// method pattern as AIPromptRunner.model-selection.test.ts). executeModel is NOT
// mocked — the real path runs down to the ClassFactory-registered TestLLM.
// ---------------------------------------------------------------------------
type ExecArgs = unknown[];
interface FailoverRunner { executeModelWithFailover: (...args: ExecArgs) => Promise<ChatResult> }

interface TestCandidate {
  model: { ID: string; Name: string };
  vendorId: string;
  vendorName: string;
  driverClass: string;
  apiName: string;
  supportsEffortLevel: boolean;
  effortLevel: undefined;
  isPreferredVendor: boolean;
  priority: number;
  source: string;
}

function candidate(modelId: string, driverClass: string, vendorId: string, vendorName: string, apiName: string, priority: number): TestCandidate {
  return {
    model: { ID: modelId, Name: `${vendorName} ${modelId}` },
    vendorId, vendorName, driverClass, apiName,
    supportsEffortLevel: false, effortLevel: undefined,
    isPreferredVendor: false, priority, source: 'prompt-model',
  };
}

/** Plain stand-in for the AIPromptRun entity fields the failover bookkeeping writes. */
interface FailoverPromptRunRecord {
  FailoverAttempts: number | null;
  FailoverErrors: string | null;
  FailoverDurations: string | null;
  TotalFailoverDuration: number | null;
  OriginalModelID: string;
  ModelID: string;
  VendorID: string | null;
}
interface RecordedFailoverError { model: string; vendor?: string; error: string; errorType: string }

function makePromptRunRecord(originalModelId: string, vendorId: string | null): FailoverPromptRunRecord {
  return {
    FailoverAttempts: 0, FailoverErrors: null, FailoverDurations: null, TotalFailoverDuration: null,
    OriginalModelID: originalModelId, ModelID: originalModelId, VendorID: vendorId,
  };
}

function makeFailoverPrompt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ID: 'prompt-fo', Name: 'Failover Prompt', Status: 'Active',
    SelectionStrategy: 'Default', AIModelTypeID: MODEL_TYPE.LLM,
    FailoverStrategy: 'NextBestModel',
    MaxRetries: 0, RetryDelayMS: 1, // keep any rate-limit backoff at 1ms — deterministic + fast
    ...overrides,
  };
}

async function runFailover(
  runner: AIPromptRunner,
  candidates: TestCandidate[],
  promptOverrides: Record<string, unknown> = {},
  promptRun?: FailoverPromptRunRecord,
): Promise<ChatResult> {
  const prompt = makeFailoverPrompt(promptOverrides);
  const first = candidates[0];
  // Arg order: model, renderedPrompt, prompt, params, vendorId, conversationMessages,
  // templateMessageRole, cancellationToken, allCandidates, promptRun, vendorDriverClass,
  // vendorApiName, vendorSupportsEffortLevel, modelEffortLevel, credentialAvailability
  return (runner as unknown as FailoverRunner).executeModelWithFailover(
    first.model, 'rendered prompt', prompt, { verbose: false }, first.vendorId,
    undefined, 'system', undefined, candidates, promptRun,
    first.driverClass, first.apiName, false, undefined,
  );
}

// ---------------------------------------------------------------------------
// ExecutePrompt-level harness (fake AIPromptRun provider, as in execute-e2e)
// ---------------------------------------------------------------------------
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
  GetEntityObject: vi.fn(async (entityName: string) => {
    // Assert the MJ:-prefixed name production actually uses. Against real metadata an unprefixed
    // 'AI Prompt Runs' throws "Entity ... not found"; a name-blind fake would hide that regression.
    if (entityName !== 'MJ: AI Prompt Runs') {
      throw new Error(`Unexpected entity '${entityName}' — expected 'MJ: AI Prompt Runs'`);
    }
    lastPromptRun = new FakePromptRun();
    return lastPromptRun;
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

function makeE2EPrompt(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ID: 'prompt-1', Name: 'Failover E2E Prompt', Status: 'Active',
    TemplateID: null, // bypass template rendering
    SelectionStrategy: 'Default', AIModelTypeID: MODEL_TYPE.LLM,
    OutputType: 'string', OutputExample: null, ValidationBehavior: 'Warn',
    MaxRetries: 0, ParallelizationMode: 'None', RequireSpecificModels: false,
    ...o,
  };
}

function makeE2EParams(prompt: Record<string, unknown>): unknown {
  return {
    prompt, contextUser: { ID: 'u1', Name: 'T' }, provider: fakeProvider,
    conversationMessages: [{ role: 'user', content: 'Hello' }], templateMessageRole: 'none', verbose: false,
  };
}

// Drivers used by the direct-drive candidates — all credentialed via the GetAIAPIKey mock.
const DIRECT_DRIVE_DRIVERS = ['AnthropicLLM', 'OpenAILLM', 'GroqLLM', 'DeepSeekLLM'];

let runner: AIPromptRunner;
beforeEach(() => {
  vi.restoreAllMocks();
  testLLM.Reset(); lastPromptRun = null;
  loadCatalog(buildRealisticCatalog(), [...DEFAULT_CONFIGURED_DRIVERS, ...DIRECT_DRIVE_DRIVERS]);
  vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined as never);
  vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => testLLM as never);
  runner = new AIPromptRunner();
});

// ===========================================================================
// (a) Failover triggered by a driver that THROWS (SDK-style failure)
// ===========================================================================
describe('executeModelWithFailover — driver throws (exception path)', () => {
  it('fails over to the next candidate in order and succeeds when the first driver throws a network error', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    testLLM.Script(
      { kind: 'throw', error: new Error('connect ECONNREFUSED 10.0.0.5:443') }, // → NetworkError, Retriable, canFailover
      { kind: 'succeed', content: 'recovered on second candidate' },
    );
    const pr = makePromptRunRecord(c1.model.ID, c1.vendorId);

    const result = await runFailover(runner, [c1, c2], {}, pr);

    expect(result.success).toBe(true);
    expect(result.data?.choices[0].message.content).toBe('recovered on second candidate');
    expect(testLLM.CalledModels).toEqual(['api-claude', 'api-gpt']); // candidate order respected
    expect(pr.FailoverAttempts).toBe(1);
    const errors = JSON.parse(pr.FailoverErrors ?? '[]') as RecordedFailoverError[];
    expect(errors).toHaveLength(1);
    expect(errors[0].errorType).toBe('NetworkError');
    expect(pr.ModelID).toBe(c2.model.ID);  // bookkeeping switched to the model that actually answered
    expect(pr.VendorID).toBe(c2.vendorId);
  });

  it('stops immediately (no failover) when the thrown error is Fatal and structural (InvalidRequest)', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    testLLM.Script({ kind: 'throw', error: new Error('Malformed JSON in request payload') }); // → InvalidRequest, Fatal
    const pr = makePromptRunRecord(c1.model.ID, c1.vendorId);

    const result = await runFailover(runner, [c1, c2], {}, pr);

    expect(result.success).toBe(false);
    expect(testLLM.CalledModels).toEqual(['api-claude']); // second candidate never attempted
    expect(result.statusText).toBe('Failover failed after 1 attempts');
    expect(result.errorMessage).toContain('Malformed JSON');
    expect(result.errorInfo?.errorType).toBe('InvalidRequest');
    expect(result.errorInfo?.canFailover).toBe(false);
    expect(pr.FailoverAttempts).toBe(1); // the fatal attempt is still recorded
  });
});

// ===========================================================================
// (b) Failover triggered by ChatResult{success:false} — THE HISTORICAL BUG CLASS.
// Drivers catch provider errors internally and RETURN a failed ChatResult with
// errorInfo instead of throwing; failover must trigger off result.success too.
// ===========================================================================
describe('executeModelWithFailover — ChatResult{success:false} (the historical bug class)', () => {
  it('fails over when the driver RETURNS a failed ChatResult with a failover-eligible errorInfo', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    testLLM.Script(
      { kind: 'fail', error: new Error('fetch failed: network socket disconnected') }, // → NetworkError via real ErrorAnalyzer
      { kind: 'succeed', content: 'success with fallback model' },
    );
    const pr = makePromptRunRecord(c1.model.ID, c1.vendorId);

    const result = await runFailover(runner, [c1, c2], {}, pr);

    expect(result.success).toBe(true);
    expect(result.data?.choices[0].message.content).toBe('success with fallback model');
    expect(testLLM.CalledModels).toEqual(['api-claude', 'api-gpt']);
    expect(pr.FailoverAttempts).toBe(1);
    const errors = JSON.parse(pr.FailoverErrors ?? '[]') as RecordedFailoverError[];
    expect(errors[0].errorType).toBe('NetworkError');
    expect(errors[0].error).toContain('network socket disconnected');
  });

  it('fails over on a returned ServiceUnavailable failure (provider outage)', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    testLLM.Script(
      { kind: 'fail', error: new Error('Service temporarily unavailable') }, // → ServiceUnavailable, Retriable
      { kind: 'succeed', content: 'back up on the alternate provider' },
    );

    const result = await runFailover(runner, [c1, c2]);

    expect(result.success).toBe(true);
    expect(testLLM.CalledModels).toEqual(['api-claude', 'api-gpt']);
  });
});

// ===========================================================================
// (c) Non-eligible errors do NOT fail over
// ===========================================================================
describe('executeModelWithFailover — non-eligible errors do not fail over', () => {
  it('returns a failed ChatResult as-is when errorInfo says canFailover=false (structural error)', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    // 'malformed json' → InvalidRequest, Fatal, canFailover=false via the real ErrorAnalyzer
    testLLM.Script({ kind: 'fail', error: new Error('Malformed JSON in request body') });
    const pr = makePromptRunRecord(c1.model.ID, c1.vendorId);

    const result = await runFailover(runner, [c1, c2], {}, pr);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Malformed JSON in request body');
    expect(testLLM.CalledModels).toEqual(['api-claude']); // no second attempt
    expect(pr.FailoverAttempts).toBe(0);             // not even recorded as a failover attempt
  });

  it('returns a failed ChatResult as-is when the driver supplies NO errorInfo (undiagnosed failure)', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    testLLM.Script({ kind: 'failResult', result: makeFailedChatResult({ errorMessage: 'provider exploded', omitData: true }) });

    const result = await runFailover(runner, [c1, c2]);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('provider exploded');
    expect(testLLM.CalledModels).toEqual(['api-claude']);
  });

  it('honors FailoverErrorScope: a RateLimit failure under NetworkOnly scope stops without failover', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    testLLM.Script(
      { kind: 'fail', error: new Error('Rate limit exceeded, too many requests') }, // → RateLimit, eligible in general
      { kind: 'succeed', content: 'should never be reached' },
    );
    const pr = makePromptRunRecord(c1.model.ID, c1.vendorId);

    const result = await runFailover(runner, [c1, c2], { FailoverErrorScope: 'NetworkOnly' }, pr);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Rate limit exceeded');
    expect(testLLM.CalledModels).toEqual(['api-claude']); // scope filter blocked the failover
    expect(pr.FailoverAttempts).toBe(1);             // the attempt itself is recorded
  });
});

// ===========================================================================
// (d) Candidate order + exhaustion
// ===========================================================================
describe('executeModelWithFailover — candidate order and exhaustion', () => {
  it('walks all candidates in order (mixed throw + failed-result) and returns a meaningful final error', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    const c3 = candidate('m-deepseek', 'DeepSeekLLM', 'v-deepseek', 'DeepSeek', 'api-deepseek', 80);
    testLLM.Script(
      { kind: 'throw', error: new Error('connect ECONNREFUSED 10.0.0.5:443') },     // exception path → NetworkError
      { kind: 'fail', error: new Error('Service temporarily unavailable') },        // result path → ServiceUnavailable
      { kind: 'fail', error: new Error('Model deepseek-v4 is overloaded') },        // result path → ModelError
    );
    const pr = makePromptRunRecord(c1.model.ID, c1.vendorId);

    const result = await runFailover(runner, [c1, c2, c3], {}, pr);

    expect(testLLM.CalledModels).toEqual(['api-claude', 'api-gpt', 'api-deepseek']); // strict priority order
    expect(result.success).toBe(false);
    expect(result.statusText).toBe('Failover failed after 3 attempts');
    expect(result.errorMessage).toBe('Model deepseek-v4 is overloaded'); // last error surfaces
    expect(result.errorInfo?.errorType).toBe('ModelError');

    // Attempt bookkeeping on the prompt run
    expect(pr.FailoverAttempts).toBe(3);
    const errors = JSON.parse(pr.FailoverErrors ?? '[]') as RecordedFailoverError[];
    expect(errors.map(e => e.errorType)).toEqual(['NetworkError', 'ServiceUnavailable', 'ModelError']);
    expect(errors.map(e => e.model)).toEqual(['m-claude', 'm-gpt', 'm-deepseek']);
    const durations = JSON.parse(pr.FailoverDurations ?? '[]') as number[];
    expect(durations).toHaveLength(3);
    expect(pr.TotalFailoverDuration).toBeGreaterThanOrEqual(0);
  });

  it('retries the SAME candidate on rate limit up to MaxRetries, then fails over', async () => {
    const c1 = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 'api-claude', 100);
    const c2 = candidate('m-gpt', 'OpenAILLM', 'v-openai', 'OpenAI', 'api-gpt', 90);
    testLLM.Script(
      { kind: 'fail', error: new Error('Rate limit exceeded, too many requests') }, // attempt 1 → retry same candidate
      { kind: 'fail', error: new Error('Rate limit exceeded, too many requests') }, // attempt 2 → retries exhausted
      { kind: 'succeed', content: 'served by the alternate vendor' },
    );
    const pr = makePromptRunRecord(c1.model.ID, c1.vendorId);

    const result = await runFailover(runner, [c1, c2], { MaxRetries: 1 }, pr);

    expect(result.success).toBe(true);
    expect(testLLM.CalledModels).toEqual(['api-claude', 'api-claude', 'api-gpt']); // same-candidate retry, then failover
    expect(pr.FailoverAttempts).toBe(2);
    const errors = JSON.parse(pr.FailoverErrors ?? '[]') as RecordedFailoverError[];
    expect(errors.every(e => e.errorType === 'RateLimit')).toBe(true);
  });
});

// ===========================================================================
// (e) Vendor-level errors exclude the whole vendor from the remaining candidates
// ===========================================================================
describe('executeModelWithFailover — vendor-level error filtering', () => {
  it('a VendorValidationError removes ALL remaining candidates of that vendor before continuing', async () => {
    const a1 = candidate('m-a1', 'OpenAILLM', 'v-acme', 'Acme', 'api-a1', 100);
    const a2 = candidate('m-a2', 'OpenAILLM', 'v-acme', 'Acme', 'api-a2', 95);
    const b1 = candidate('m-b1', 'AnthropicLLM', 'v-beta', 'Beta', 'api-b1', 90);
    const b2 = candidate('m-b2', 'AnthropicLLM', 'v-beta', 'Beta', 'api-b2', 85);
    // 'PartListUnion is required' → VendorValidationError (Retriable, canFailover) via real ErrorAnalyzer
    testLLM.Script(
      { kind: 'fail', error: new Error('PartListUnion is required') },
      { kind: 'succeed', content: 'answered by the other vendor' },
    );
    const pr = makePromptRunRecord(a1.model.ID, a1.vendorId);

    const result = await runFailover(runner, [a1, a2, b1, b2], {}, pr);

    expect(result.success).toBe(true);
    expect(testLLM.CalledModels).toHaveLength(2);
    expect(testLLM.CalledModels[0]).toBe('api-a1');
    // The second (and only other) call must be a Beta candidate — Acme's other model was excluded.
    expect(['api-b1', 'api-b2']).toContain(testLLM.CalledModels[1]);
    expect(testLLM.CalledModels).not.toContain('api-a2');
    expect(pr.FailoverAttempts).toBe(1);
  });
});

// ===========================================================================
// Full ExecutePrompt integration — the failover seam reached from the public API
// ===========================================================================
describe('ExecutePrompt — failover through the full pipeline', () => {
  it('recovers from a returned failed ChatResult when FailoverStrategy is set, recording the attempt', async () => {
    testLLM.Script(
      { kind: 'fail', error: new Error('fetch failed: network socket disconnected') },
      { kind: 'succeed', content: 'recovered after failover' },
    );
    const prompt = makeE2EPrompt({ FailoverStrategy: 'NextBestModel' });

    const result = await runner.ExecutePrompt(makeE2EParams(prompt) as never);

    expect(result.success).toBe(true);
    expect(result.result).toBe('recovered after failover');
    expect(testLLM.CalledModels).toHaveLength(2); // first candidate failed, second answered

    await runner.WaitForPendingPromptRunSaves();
    expect(lastPromptRun).toBeTruthy();
    expect(lastPromptRun!.FailoverAttempts).toBe(1);
    expect(lastPromptRun!.Status).toBe('Completed');
  });

  it('does NOT fail over when FailoverStrategy is unset (defaults to None), even for an eligible error', async () => {
    testLLM.Script(
      { kind: 'fail', error: new Error('fetch failed: network socket disconnected') },
      { kind: 'succeed', content: 'must never be reached' },
    );
    const prompt = makeE2EPrompt(); // no FailoverStrategy → getFailoverConfiguration → 'None'

    const result = await runner.ExecutePrompt(makeE2EParams(prompt) as never);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('network socket disconnected');
    expect(testLLM.CalledModels).toHaveLength(1); // single attempt, no failover
  });
});
