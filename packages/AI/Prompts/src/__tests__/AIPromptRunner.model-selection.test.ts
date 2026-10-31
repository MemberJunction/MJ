/**
 * Combinatorial model-selection tests for the REAL AIPromptRunner.selectModel().
 *
 * A mock AIEngine (wired from realistic production-shaped fixtures) + a controllable
 * credential gate (GetAIAPIKey) let these tests drive the actual selection logic across:
 *   - SelectionStrategy: Default / Specific / ByPower (+ PowerPreference, MinPowerRank)
 *   - Explicit model override + model-type compatibility + inactive-model exclusion
 *   - Preferred-vendor boosting
 *   - AIPromptModel associations, RequireSpecificModels, power-match fallback
 *   - Configuration inheritance chains
 *   - Credential availability gating + the short-circuit / forceFullModelEvaluation behavior
 *
 * Everything runs against the real private methods (reached via cast) so the tests catch
 * regressions in the runner itself — only the engine + credential + API-key boundaries are mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock state + a minimal AIEngine that mirrors the runner-facing contract.
// Built inside vi.hoisted so the mock factory (also hoisted) can reference it.
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
    vendorTypeDefinitions: [], vendors: [], modelTypes: [], configurations: [],
    models: [], modelVendors: [], promptModels: [], configuredDrivers: new Set(),
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
      if (!inf) {
        const dev = state.vendorTypeDefinitions.find(v => v.Name === 'Model Developer')?.ID;
        return !eq(mv?.TypeID, dev);
      }
      return eq(mv?.TypeID, inf);
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

import { AIPromptRunner } from '../AIPromptRunner';
import { ParallelExecutionCoordinator } from '../ParallelExecutionCoordinator';
import { MJGlobal } from '@memberjunction/global';
import {
  buildRealisticCatalog, DEFAULT_CONFIGURED_DRIVERS, MODEL, VENDOR, CONFIG, MODEL_TYPE,
  makePromptModel, makeModel, makeModelVendor, type AICatalog,
} from './__fixtures__/ai-metadata.fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type SelectModelResult = {
  model: { ID: string; Name: string } | null;
  vendorDriverClass?: string;
  vendorApiName?: string;
  selectionInfo?: {
    modelsConsidered: Array<{ model: { ID: string }; vendor?: { ID: string }; available: boolean; unavailableReason?: string; driverClass?: string }>;
    selectionReason: string;
    fallbackUsed: boolean;
  };
  allCandidates?: Array<{ model: { ID: string }; driverClass: string }>;
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

function makePrompt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ID: 'prompt-1', Name: 'Test Prompt', Status: 'Active',
    SelectionStrategy: 'Default', AIModelTypeID: MODEL_TYPE.LLM,
    MinPowerRank: null, PowerPreference: null, RequireSpecificModels: false,
    ...overrides,
  };
}

async function selectModel(
  runner: AIPromptRunner,
  prompt: Record<string, unknown>,
  opts: { explicitModelId?: string; configurationId?: string; vendorId?: string; forceFullModelEvaluation?: boolean } = {},
): Promise<SelectModelResult> {
  const params = { verbose: false, contextUser: undefined, forceFullModelEvaluation: opts.forceFullModelEvaluation };
  return (runner as unknown as {
    selectModel(p: unknown, e?: string, u?: unknown, c?: string, v?: string, params?: unknown): Promise<SelectModelResult>;
  }).selectModel(prompt, opts.explicitModelId, undefined, opts.configurationId, opts.vendorId, params);
}

let runner: AIPromptRunner;
let catalog: AICatalog;
beforeEach(() => {
  runner = new AIPromptRunner();
  catalog = buildRealisticCatalog();
  loadCatalog(catalog);
});

// ===========================================================================
describe('selectModel — Default strategy (no prompt models)', () => {
  it('selects the highest-PowerRank ACTIVE model of the type, excluding inactive models', async () => {
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    // Gemini 3 Pro (25) is inactive; highest active is Gemini 3 Flash (22).
    expect(r.model?.ID).toBe(MODEL.Gemini3Flash);
  });

  it('honors MinPowerRank (filters the pool below the floor)', async () => {
    // Floor at 21 leaves only Claude Opus (21) + Gemini Flash (22) active → Flash wins.
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default', MinPowerRank: 21 }));
    expect(r.model?.ID).toBe(MODEL.Gemini3Flash);
  });

  it('falls to the next model when the top model has no credentialed vendor', async () => {
    // Drop Gemini drivers → Flash unavailable → next highest active is Claude Opus (21).
    // Claude Opus is offered by Anthropic (AIModelVendor.Priority 1) and Bedrock (Priority 5);
    // createCandidatesForModel orders vendors by Priority DESC, so Bedrock is tried first.
    loadCatalog(catalog, DEFAULT_CONFIGURED_DRIVERS.filter(d => d !== 'GeminiLLM' && d !== 'VertexLLM'));
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    expect(r.model?.ID).toBe(MODEL.ClaudeOpus45);
    expect(r.vendorDriverClass).toBe('BedrockLLM'); // higher AIModelVendor.Priority wins
  });

  it('selects the lower-priority vendor when the higher-priority one is uncredentialed', async () => {
    // Same as above but also drop Bedrock → Claude Opus now resolves to Anthropic.
    loadCatalog(catalog, ['AnthropicLLM']);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    expect(r.model?.ID).toBe(MODEL.ClaudeOpus45);
    expect(r.vendorDriverClass).toBe('AnthropicLLM');
  });

  it('returns null model when NO driver has credentials', async () => {
    loadCatalog(catalog, []);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    expect(r.model).toBeNull();
  });
});

describe('selectModel — ByPower strategy', () => {
  it("PowerPreference 'Highest' selects the most powerful active model", async () => {
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'ByPower', PowerPreference: 'Highest' }));
    expect(r.model?.ID).toBe(MODEL.Gemini3Flash); // 22, since Gemini Pro 25 is inactive
  });

  it("PowerPreference 'Lowest' selects the least powerful active model", async () => {
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'ByPower', PowerPreference: 'Lowest' }));
    expect(r.model?.ID).toBe(MODEL.Llama70B); // 9 is the lowest active PowerRank
  });
});

describe('selectModel — explicit model override', () => {
  it('selects exactly the requested active model', async () => {
    const r = await selectModel(runner, makePrompt(), { explicitModelId: MODEL.ClaudeSonnet45 });
    expect(r.model?.ID).toBe(MODEL.ClaudeSonnet45);
    expect(r.vendorDriverClass).toBe('AnthropicLLM');
  });

  it('returns null when the explicit model is INACTIVE', async () => {
    const r = await selectModel(runner, makePrompt(), { explicitModelId: MODEL.GrokInactive });
    expect(r.model).toBeNull();
  });

  it('returns null when the explicit model is the wrong model type', async () => {
    const r = await selectModel(runner, makePrompt({ AIModelTypeID: MODEL_TYPE.Embeddings }), { explicitModelId: MODEL.GPT5 });
    expect(r.model).toBeNull();
  });
});

describe('selectModel — preferred vendor', () => {
  it('boosts the preferred vendor for a multi-vendor model', async () => {
    // Claude Opus is offered by Anthropic (1) and Bedrock (5). Prefer Bedrock.
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }), { explicitModelId: MODEL.ClaudeOpus45, vendorId: VENDOR.AmazonBedrock });
    expect(r.model?.ID).toBe(MODEL.ClaudeOpus45);
    expect(r.vendorDriverClass).toBe('BedrockLLM');
  });
});

describe('selectModel — Specific strategy + AIPromptModel', () => {
  it('selects from explicitly associated prompt models (specific vendor)', async () => {
    catalog.promptModels.push(makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.GPT5, VendorID: VENDOR.OpenAI, Priority: 10 }));
    loadCatalog(catalog);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Specific' }));
    expect(r.model?.ID).toBe(MODEL.GPT5);
    expect(r.vendorDriverClass).toBe('OpenAILLM');
  });

  it('Default strategy preserves AIPromptModel VendorID preference, EffortLevel, and PromptConfigurationObject', async () => {
    // ClaudeOpus45 is offered by Anthropic (Priority 1) and Bedrock (Priority 5).
    // When AIPromptModel specifies VendorID=Anthropic under SelectionStrategy='Default',
    // Anthropic is selected by substitution for its model (no priority boost) and carries EffortLevel + PromptConfigurationObject.
    const promptConfig = { temperature: 0.1 };
    catalog.promptModels.push({
      ...makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.ClaudeOpus45, VendorID: VENDOR.Anthropic, Priority: 10 }),
      EffortLevel: 25,
      PromptConfigurationObject: promptConfig,
    } as never);
    loadCatalog(catalog);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    expect(r.model?.ID).toBe(MODEL.ClaudeOpus45);
    expect(r.vendorDriverClass).toBe('AnthropicLLM');
    const winningCandidate = (r.allCandidates as Array<{
      model: { ID: string };
      driverClass: string;
      effortLevel?: number;
      promptModelConfiguration?: Record<string, unknown>;
    }>)?.find(c => c.model.ID === MODEL.ClaudeOpus45 && c.driverClass === 'AnthropicLLM');
    expect(winningCandidate?.effortLevel).toBe(25);
    expect(winningCandidate?.promptModelConfiguration).toEqual(promptConfig);
  });

  it('Default strategy: the caller\'s runtime vendor override beats the AIPromptModel VendorID', async () => {
    catalog.promptModels.push(
      makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.ClaudeOpus45, VendorID: VENDOR.Anthropic, Priority: 10 }),
    );
    loadCatalog(catalog);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }), { vendorId: VENDOR.AmazonBedrock });
    expect(r.model?.ID).toBe(MODEL.ClaudeOpus45);
    expect(r.vendorDriverClass).toBe('BedrockLLM');
  });

  it('Default strategy: a row naming a vendor gives its effort and configuration to that vendor only', async () => {
    catalog.promptModels.push({
      ...makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.ClaudeOpus45, VendorID: VENDOR.Anthropic, Priority: 10 }),
      EffortLevel: 25,
      PromptConfigurationObject: { temperature: 0.1 },
    } as never);
    loadCatalog(catalog);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }), { vendorId: VENDOR.Anthropic });
    const opus = (r.allCandidates as Array<{ model: { ID: string }; driverClass: string; isPreferredVendor: boolean; effortLevel?: number; promptModelConfiguration?: unknown }>)
      .filter(c => c.model.ID === MODEL.ClaudeOpus45);
    const preferred = opus.find(c => c.isPreferredVendor);
    expect(preferred?.driverClass).toBe('AnthropicLLM');
    expect(preferred?.effortLevel).toBe(25);
    expect(preferred?.promptModelConfiguration).toEqual({ temperature: 0.1 });
    const bedrock = opus.find(c => c.driverClass === 'BedrockLLM');
    expect(bedrock?.effortLevel).toBeUndefined();
    expect(bedrock?.promptModelConfiguration).toBeUndefined();
  });

  it('Default strategy: a row naming no vendor gives its effort and configuration to a vendorless model\'s own driver', async () => {
    const solo = makeModel({ ID: 'AA000000-0000-0000-0000-0000000000B1', Name: 'Solo', DriverClass: 'OpenAILLM', PowerRank: 99 });
    catalog.models.push(solo);
    catalog.promptModels.push({
      ...makePromptModel({ PromptID: 'prompt-1', ModelID: solo.ID, Priority: 10 }),
      EffortLevel: 40,
      PromptConfigurationObject: { temperature: 0.2 },
    } as never);
    loadCatalog(catalog);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    expect(r.model?.ID).toBe(solo.ID);
    const own = (r.allCandidates as Array<{ model: { ID: string }; effortLevel?: number; promptModelConfiguration?: unknown }>)
      .find(c => c.model.ID === solo.ID);
    expect(own?.effortLevel).toBe(40);
    expect(own?.promptModelConfiguration).toEqual({ temperature: 0.2 });
  });

  it('orders multiple prompt models by Priority (higher first)', async () => {
    catalog.promptModels.push(
      makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.GPT5Mini, VendorID: VENDOR.OpenAI, Priority: 1 }),
      makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.ClaudeOpus45, VendorID: VENDOR.Anthropic, Priority: 99 }),
    );
    loadCatalog(catalog);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Specific' }));
    expect(r.model?.ID).toBe(MODEL.ClaudeOpus45);
  });

  it('Specific + RequireSpecificModels with no prompt models: returns null model with a descriptive reason', async () => {
    // selectModel catches the internal "no candidates" throw and surfaces it via selectionInfo
    // rather than rejecting, so callers get a null model + actionable reason.
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Specific', RequireSpecificModels: true }));
    expect(r.model).toBeNull();
    expect(r.selectionInfo?.selectionReason).toMatch(/Specific/);
  });

  it('power-match fallback: when RequireSpecificModels=false and the specific model lacks creds, falls back to a similar-power model', async () => {
    // Configure ONLY Anthropic; the specific (OpenAI GPT-5) is uncredentialed → fall back.
    catalog.promptModels.push(makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.GPT5, VendorID: VENDOR.OpenAI, Priority: 10 }));
    loadCatalog(catalog, ['AnthropicLLM']);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Specific', RequireSpecificModels: false }));
    expect(r.model).not.toBeNull();
    expect(r.vendorDriverClass).toBe('AnthropicLLM'); // fell back to a credentialed Anthropic model
  });
});

// A prompt-model row names a vendor for its model. It must pick which of that model's vendors serves
// the prompt, never which model runs. The shape is the shipped Database Research prompt: aggregator
// vendors on top (OpenRouter 50, Fireworks 150), direct vendors at 0-2, rows Gemini/Google 15,
// Gemini/Vertex 14, GPT-OSS/Cerebras 10. Without aggregator keys `next` runs Gemini via Google.
describe('selectModel — Default strategy: a prompt-model row picks the vendor, never the model', () => {
  const V = { OpenRouter: 'AA000000-0000-0000-0000-0000000000F1', Fireworks: 'AA000000-0000-0000-0000-0000000000F2' };
  const M = { Gemini: 'AA000000-0000-0000-0000-0000000000A1', GptOss: 'AA000000-0000-0000-0000-0000000000A2' };
  const DIRECT = ['GeminiLLM', 'VertexLLM', 'CerebrasLLM', 'GroqLLM'];

  function loadDatabaseResearch(configuredDrivers: string[]): void {
    catalog.vendors.push({ ID: V.OpenRouter, Name: 'OpenRouter' }, { ID: V.Fireworks, Name: 'Fireworks.ai' });
    const mv = (ModelID: string, VendorID: string, Vendor: string, DriverClass: string, Priority: number) =>
      makeModelVendor({ ModelID, VendorID, Vendor, DriverClass, Priority });
    const gemini = makeModel({ ID: M.Gemini, Name: 'Gemini 3.8 Flash', PowerRank: 26, ModelVendors: [
      mv(M.Gemini, V.OpenRouter, 'OpenRouter', 'OpenRouterLLM', 50),
      mv(M.Gemini, VENDOR.Google, 'Google', 'GeminiLLM', 1),
      mv(M.Gemini, VENDOR.VertexAI, 'Vertex AI', 'VertexLLM', 0),
    ] });
    const oss = makeModel({ ID: M.GptOss, Name: 'GPT-OSS-120B', PowerRank: 14, ModelVendors: [
      mv(M.GptOss, V.Fireworks, 'Fireworks.ai', 'FireworksLLM', 150),
      mv(M.GptOss, VENDOR.Cerebras, 'Cerebras', 'CerebrasLLM', 2),
      mv(M.GptOss, VENDOR.Groq, 'Groq', 'GroqLLM', 1),
    ] });
    catalog.models.push(gemini, oss);
    catalog.modelVendors.push(...gemini.ModelVendors, ...oss.ModelVendors);
    catalog.promptModels.push(
      makePromptModel({ PromptID: 'prompt-1', ModelID: M.Gemini, VendorID: VENDOR.Google, Priority: 15 }),
      makePromptModel({ PromptID: 'prompt-1', ModelID: M.Gemini, VendorID: VENDOR.VertexAI, Priority: 14 }),
      makePromptModel({ PromptID: 'prompt-1', ModelID: M.GptOss, VendorID: VENDOR.Cerebras, Priority: 10 }),
    );
    loadCatalog(catalog, configuredDrivers);
  }

  it('with no aggregator key, runs the model next runs (Gemini via Google), not GPT-OSS via Cerebras', async () => {
    loadDatabaseResearch(DIRECT);
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    expect(r.model?.ID).toBe(M.Gemini);
    expect(r.vendorDriverClass).toBe('GeminiLLM');
    expect(r.selectionInfo?.fallbackUsed).toBe(true); // the top candidate (Fireworks) had no key
  });

  it('with the top vendor credentialed, the row vendor still serves the model next chose', async () => {
    loadDatabaseResearch([...DIRECT, 'OpenRouterLLM', 'FireworksLLM']); // next: GPT-OSS via Fireworks (5250)
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    expect(r.model?.ID).toBe(M.GptOss);
    expect(r.vendorDriverClass).toBe('CerebrasLLM');
    expect(r.selectionInfo?.fallbackUsed).toBe(false); // the row vendor serving next's pick is not a fallback
  });

  it('failover starts each model on its row vendor and reaches the models in next\'s order of first appearance', async () => {
    loadDatabaseResearch([...DIRECT, 'OpenRouterLLM']);
    const prompt = makePrompt({ SelectionStrategy: 'Default', FailoverStrategy: 'NextBestModel', FailoverMaxAttempts: 20 });
    const selection = await selectModel(runner, prompt);
    const calls: Array<{ model: string; driver: string }> = [];
    vi.spyOn(runner as unknown as { executeModel: (...a: unknown[]) => Promise<unknown> }, 'executeModel')
      .mockImplementation(async (...args: unknown[]) => {
        calls.push({ model: (args[0] as { ID: string }).ID, driver: args[8] as string });
        throw new Error('connect ECONNREFUSED 10.0.0.5:443');
      });
    const first = selection.allCandidates![0] as unknown as { model: unknown; vendorId: string; driverClass: string; apiName: string };
    await (runner as unknown as { executeModelWithFailover: (...a: unknown[]) => Promise<unknown> }).executeModelWithFailover(
      first.model, 'rendered prompt', prompt, { verbose: false }, first.vendorId,
      undefined, 'system', undefined, selection.allCandidates, undefined,
      first.driverClass, first.apiName, false, undefined,
    );
    const ours = calls.filter(c => c.model === M.Gemini || c.model === M.GptOss);
    expect(ours[0]).toEqual({ model: M.Gemini, driver: 'GeminiLLM' });
    expect([...new Set(ours.map(c => c.model))]).toEqual([M.Gemini, M.GptOss]);
    expect(ours.find(c => c.model === M.GptOss)?.driver).toBe('CerebrasLLM');
  });
});

// The one rule every runner selects by (BaseModelRunner.SelectCandidate): the first credentialed
// candidate decides the model, and that model's own row vendor serves it when it has a key.
describe('SelectCandidate — the row vendor serves the model the ranking picked, never another model', () => {
  type Fake = { model: { ID: string }; vendorId: string; driverClass: string; isPreferredVendor: boolean; isPromptModelVendor: boolean; priority: number; source: string };
  const c = (model: string, driver: string, opts: { row?: boolean; preferred?: boolean } = {}): Fake => ({
    model: { ID: model }, vendorId: `v-${driver}`, driverClass: driver,
    isPreferredVendor: !!opts.preferred, isPromptModelVendor: !!opts.row, priority: 0, source: 'prompt-model',
  });
  const pick = (candidates: Fake[], keyed: string[]): string | undefined =>
    (runner as unknown as { SelectCandidate(c: Fake[], has: (x: Fake) => boolean): { Candidate: Fake | null } })
      .SelectCandidate(candidates, x => keyed.includes(x.driverClass)).Candidate?.driverClass;

  it('swaps to the same model\'s row vendor, past another model\'s row vendor ranked in between', () => {
    expect(pick([c('A', 'A-top'), c('B', 'B-row', { row: true }), c('A', 'A-row', { row: true })], ['A-top', 'B-row', 'A-row'])).toBe('A-row');
  });

  it('never moves to another model: with the top keyless, the next model keeps its own vendor', () => {
    expect(pick([c('A', 'A-top'), c('B', 'B-1'), c('A', 'A-row', { row: true })], ['B-1', 'A-row'])).toBe('B-1');
  });

  it('keeps the first credentialed candidate when its row vendor has no key', () => {
    expect(pick([c('A', 'A-top'), c('A', 'A-row', { row: true })], ['A-top'])).toBe('A-top');
  });

  it('never swaps away from a runtime vendor override', () => {
    expect(pick([c('A', 'A-pref', { preferred: true }), c('A', 'A-row', { row: true })], ['A-pref', 'A-row'])).toBe('A-pref');
  });
});

describe('selectModel — configuration inheritance', () => {
  it('uses a prompt model scoped to a child config in the inheritance chain', async () => {
    // Fast -> parent Standard. Prompt model is registered on the PARENT (Standard).
    catalog.configurations = [
      { ID: CONFIG.Standard, Name: 'Standard', ParentID: null },
      { ID: CONFIG.Fast, Name: 'Fast', ParentID: CONFIG.Standard },
    ];
    catalog.promptModels.push(
      makePromptModel({ PromptID: 'prompt-1', ModelID: MODEL.ClaudeSonnet45, VendorID: VENDOR.Anthropic, ConfigurationID: CONFIG.Standard, Priority: 5 }),
    );
    loadCatalog(catalog);
    // Selecting under the CHILD config should still find the parent-scoped prompt model.
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Specific' }), { configurationId: CONFIG.Fast });
    expect(r.model?.ID).toBe(MODEL.ClaudeSonnet45);
  });
});

describe('selectModel — credential gating, short-circuit & forceFullModelEvaluation', () => {
  it('default: stops evaluating after the first credentialed candidate (rest marked not-evaluated)', async () => {
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    const considered = r.selectionInfo!.modelsConsidered;
    const notEvaluated = considered.filter(c => (c.unavailableReason ?? '').startsWith('Not evaluated'));
    const available = considered.filter(c => c.available);
    expect(available.length).toBe(1);          // exactly one winner probed
    expect(notEvaluated.length).toBeGreaterThan(0); // the tail was short-circuited
  });

  it('forceFullModelEvaluation: probes EVERY candidate (no not-evaluated entries)', async () => {
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }), { forceFullModelEvaluation: true });
    const considered = r.selectionInfo!.modelsConsidered;
    const notEvaluated = considered.filter(c => (c.unavailableReason ?? '').startsWith('Not evaluated'));
    expect(notEvaluated.length).toBe(0);
    // With all common drivers configured, more than one candidate is available.
    expect(considered.filter(c => c.available).length).toBeGreaterThan(1);
  });

  it('records the driver class on every considered row, probed and short-circuited alike', async () => {
    // The driver class is what makes a long candidate list readable: 101 rows over ONE class is
    // a key-delivery problem, 101 rows over twelve is a chain problem, and the message that an
    // operator reads (buildNoModelFoundMessage) can only say which if selection records it.
    //
    // BOTH push sites matter. The short-circuited tail is pushed from a different statement to
    // the probed candidates, and it is the tail that dominates a long list — miss it and the
    // count that gets reported is a handful of rows, not the 101 the operator is looking at.
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default' }));
    const considered = r.selectionInfo!.modelsConsidered;
    const notEvaluated = considered.filter(c => (c.unavailableReason ?? '').startsWith('Not evaluated'));

    expect(considered.length).toBeGreaterThan(1);
    expect(notEvaluated.length).toBeGreaterThan(0);
    expect(considered.every(c => typeof c.driverClass === 'string' && c.driverClass.length > 0)).toBe(true);
  });

  it('short-circuit still returns the correct first-available model when the top candidate is uncredentialed', async () => {
    loadCatalog(catalog, DEFAULT_CONFIGURED_DRIVERS.filter(d => d !== 'GeminiLLM' && d !== 'VertexLLM'));
    const r = await selectModel(runner, makePrompt({ SelectionStrategy: 'Default', forceFullModelEvaluation: false } as never));
    expect(r.model?.ID).toBe(MODEL.ClaudeOpus45);
  });
});

// ===========================================================================
// executeModelWithFailover must NOT fire a live request at a candidate that has
// no credentials configured. `allCandidates` is intentionally the FULL ordered
// list (see the DECISION note in selectModelWithAPIKeyTracked), so the top entry
// can be an uncredentialed vendor (e.g. Fireworks.ai / OpenRouter with no key).
// Attempting one yields a misleading "401 invalid API key", and because an
// Authentication error is fatal it would halt failover before any credentialed
// candidate is reached. The loop must skip uncredentialed candidates instead.
// Regression for the model-selection / hot-path optimization that surfaced this.
// ===========================================================================
describe('executeModelWithFailover — skips uncredentialed candidates', () => {
  type ExecArgs = unknown[];
  type FailoverRunner = {
    executeModel: (...args: ExecArgs) => Promise<{ success: boolean }>;
    executeModelWithFailover: (...args: ExecArgs) => Promise<{ success: boolean; errorMessage?: string }>;
  };

  function candidate(modelId: string, driverClass: string, vendorId: string, vendorName: string, priority: number) {
    return {
      model: { ID: modelId, Name: `${vendorName} ${modelId}` },
      vendorId, vendorName, driverClass, apiName: 'api-name',
      supportsEffortLevel: false, effortLevel: undefined,
      isPreferredVendor: false, priority, source: 'prompt-model',
    };
  }

  // Driver-class index in the executeModel(...) argument list (model, prompt, params,
  // vendorId, conv, role, token, DRIVERCLASS, apiName, ...).
  const DRIVER_CLASS_ARG = 8;

  async function runFailover(runner: AIPromptRunner, candidates: ReturnType<typeof candidate>[], configuredDrivers: string[]) {
    loadCatalog(catalog, configuredDrivers);
    const prompt = makePrompt({ FailoverStrategy: 'NextBestModel' });
    const first = candidates[0];
    return (runner as unknown as FailoverRunner).executeModelWithFailover(
      first.model, 'rendered prompt', prompt, { verbose: false }, first.vendorId,
      undefined, 'system', undefined, candidates, undefined,
      first.driverClass, first.apiName, false, undefined,
    );
  }

  it('skips the uncredentialed top candidate and executes the first credentialed one', async () => {
    const runner = new AIPromptRunner();
    const execSpy = vi.spyOn(runner as unknown as FailoverRunner, 'executeModel')
      .mockResolvedValue({ success: true });

    const candidates = [
      candidate('m-oss', 'FireworksLLM', 'v-fireworks', 'Fireworks.ai', 5300), // no creds → skipped
      candidate('m-gem', 'GeminiLLM', 'v-google', 'Google', 5251),             // credentialed → run
    ];
    const result = await runFailover(runner, candidates, ['GeminiLLM']);

    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy.mock.calls[0][DRIVER_CLASS_ARG]).toBe('GeminiLLM');
    expect(result.success).toBe(true);
  });

  it('never calls executeModel and returns an actionable error when no candidate has credentials', async () => {
    const runner = new AIPromptRunner();
    const execSpy = vi.spyOn(runner as unknown as FailoverRunner, 'executeModel')
      .mockResolvedValue({ success: true });

    const candidates = [
      candidate('m-oss', 'FireworksLLM', 'v-fireworks', 'Fireworks.ai', 5300),
      candidate('m-or', 'OpenRouterLLM', 'v-openrouter', 'OpenRouter', 5290),
    ];
    const result = await runFailover(runner, candidates, []); // nothing configured

    expect(execSpy).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('No API credentials configured');
  });
});

// ===========================================================================
// selectModel must EXPOSE the credential probes it performed (credentialAvailability)
// so the execution/failover layer can reuse them instead of recomputing
// HasCredentialsAvailable for candidates selection already walked. The map only
// covers the probed prefix + the selected candidate — the short-circuited tail is
// intentionally absent so failover still probes it lazily if it ever walks there.
// ===========================================================================
describe('selectModel — exposes credentialAvailability for reuse', () => {
  type FullSelect = SelectModelResult & {
    credentialAvailability?: Map<string, boolean>;
    allCandidates: Array<{ model: { ID: string }; driverClass: string; vendorId?: string }>;
  };
  const keyOf = (c: { driverClass: string; model: { ID: string }; vendorId?: string }) =>
    `${c.driverClass}:${c.model.ID}:${c.vendorId || 'default'}`;

  async function selectModelFull(prompt: Record<string, unknown>, opts: Parameters<typeof selectModel>[2] = {}): Promise<FullSelect> {
    return (await selectModel(runner, prompt, opts)) as unknown as FullSelect;
  }

  it('returns a Map covering only the probed prefix + selected candidate (tail short-circuited)', async () => {
    const r = await selectModelFull(makePrompt({ SelectionStrategy: 'Default' }));
    const map = r.credentialAvailability;
    expect(map).toBeInstanceOf(Map);
    // Top candidate (Gemini Flash) is credentialed by default → selected on the first probe,
    // so the map holds exactly that one entry and the rest of the list is short-circuited.
    expect(map!.size).toBe(1);
    expect(map!.size).toBeLessThan(r.allCandidates.length);
    const selected = r.allCandidates.find(c => c.model.ID === r.model!.ID && c.driverClass === r.vendorDriverClass)!;
    expect(map!.get(keyOf(selected))).toBe(true);
  });

  it('forceFullModelEvaluation probes AND caches every distinct candidate', async () => {
    const r = await selectModelFull(makePrompt({ SelectionStrategy: 'Default' }), { forceFullModelEvaluation: true });
    const map = r.credentialAvailability!;
    const distinctKeys = new Set(r.allCandidates.map(keyOf));
    expect(map.size).toBe(distinctKeys.size);
  });

  it('marks the uncredentialed prefix false and the selected candidate true', async () => {
    // Drop Gemini drivers → the top Gemini candidate(s) are uncredentialed; selection walks
    // down to the first credentialed candidate, probing (and caching) the rejected prefix.
    loadCatalog(catalog, DEFAULT_CONFIGURED_DRIVERS.filter(d => d !== 'GeminiLLM' && d !== 'VertexLLM'));
    const r = await selectModelFull(makePrompt({ SelectionStrategy: 'Default' }));
    const map = r.credentialAvailability!;
    const selected = r.allCandidates.find(c => c.model.ID === r.model!.ID && c.driverClass === r.vendorDriverClass)!;
    expect(map.get(keyOf(selected))).toBe(true);
    // At least one probed-but-rejected (false) entry exists for the dropped-Gemini prefix.
    expect([...map.values()].some(v => v === false)).toBe(true);
  });
});

// ===========================================================================
// executeModelWithFailover must REUSE the credential probes selection already did
// (threaded in via the credentialAvailability map) rather than recomputing
// HasCredentialsAvailable on the happy path. This is the perf re-optimization:
// selection and failover walk the same prefix, so failover should not re-probe it.
// The not-evaluated tail (absent from the seeded map) is still probed lazily only
// if a real failure forces failover to walk down to it.
// ===========================================================================
describe('executeModelWithFailover — reuses selection credential probes', () => {
  type ExecArgs = unknown[];
  type ReuseRunner = {
    executeModel: (...args: ExecArgs) => Promise<{ success: boolean; errorInfo?: unknown }>;
    executeModelWithFailover: (...args: ExecArgs) => Promise<{ success: boolean; errorMessage?: string }>;
    HasCredentialsAvailable: (...args: ExecArgs) => boolean;
  };

  function candidate(modelId: string, driverClass: string, vendorId: string, vendorName: string, priority: number) {
    return {
      model: { ID: modelId, Name: `${vendorName} ${modelId}` },
      vendorId, vendorName, driverClass, apiName: 'api-name',
      supportsEffortLevel: false, effortLevel: undefined,
      isPreferredVendor: false, priority, source: 'prompt-model',
    };
  }
  const keyOf = (c: ReturnType<typeof candidate>) => `${c.driverClass}:${c.model.ID}:${c.vendorId || 'default'}`;
  const DRIVER_CLASS_ARG = 8;

  async function runFailoverWithCreds(
    runner: AIPromptRunner,
    candidates: ReturnType<typeof candidate>[],
    configuredDrivers: string[],
    credentialAvailability?: Map<string, boolean>,
  ) {
    loadCatalog(catalog, configuredDrivers);
    const prompt = makePrompt({ FailoverStrategy: 'NextBestModel' });
    const first = candidates[0];
    return (runner as unknown as ReuseRunner).executeModelWithFailover(
      first.model, 'rendered prompt', prompt, { verbose: false }, first.vendorId,
      undefined, 'system', undefined, candidates, undefined,
      first.driverClass, first.apiName, false, undefined,
      credentialAvailability,
    );
  }

  it('does NOT re-probe credentials for a candidate selection already evaluated (happy path)', async () => {
    const runner = new AIPromptRunner();
    const credSpy = vi.spyOn(runner as unknown as ReuseRunner, 'HasCredentialsAvailable');
    const execSpy = vi.spyOn(runner as unknown as ReuseRunner, 'executeModel').mockResolvedValue({ success: true });

    const c = candidate('m-gem', 'GeminiLLM', 'v-google', 'Google', 5251);
    const cred = new Map<string, boolean>([[keyOf(c), true]]);
    const result = await runFailoverWithCreds(runner, [c], ['GeminiLLM'], cred);

    expect(credSpy).not.toHaveBeenCalled(); // seeded map answered it
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('treats the seeded map as authoritative — a seeded `true` runs even with NO drivers configured', async () => {
    const runner = new AIPromptRunner();
    const credSpy = vi.spyOn(runner as unknown as ReuseRunner, 'HasCredentialsAvailable');
    const execSpy = vi.spyOn(runner as unknown as ReuseRunner, 'executeModel').mockResolvedValue({ success: true });

    const c = candidate('m-gem', 'GeminiLLM', 'v-google', 'Google', 5251);
    const cred = new Map<string, boolean>([[keyOf(c), true]]);
    const result = await runFailoverWithCreds(runner, [c], [], cred); // nothing configured

    expect(credSpy).not.toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy.mock.calls[0][DRIVER_CLASS_ARG]).toBe('GeminiLLM');
    expect(result.success).toBe(true);
  });

  it('reuses a seeded `false` to skip the prefix without re-probing, landing on the seeded credentialed candidate', async () => {
    const runner = new AIPromptRunner();
    const credSpy = vi.spyOn(runner as unknown as ReuseRunner, 'HasCredentialsAvailable');
    const execSpy = vi.spyOn(runner as unknown as ReuseRunner, 'executeModel').mockResolvedValue({ success: true });

    const top = candidate('m-oss', 'FireworksLLM', 'v-fireworks', 'Fireworks.ai', 5300);
    const sel = candidate('m-gem', 'GeminiLLM', 'v-google', 'Google', 5251);
    const cred = new Map<string, boolean>([[keyOf(top), false], [keyOf(sel), true]]);
    const result = await runFailoverWithCreds(runner, [top, sel], [], cred);

    expect(credSpy).not.toHaveBeenCalled(); // both answered from the seeded map
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy.mock.calls[0][DRIVER_CLASS_ARG]).toBe('GeminiLLM');
    expect(result.success).toBe(true);
  });

  it('lazily probes ONLY the not-evaluated tail (absent from the seeded map) during a real failover', async () => {
    const runner = new AIPromptRunner();
    const credSpy = vi.spyOn(runner as unknown as ReuseRunner, 'HasCredentialsAvailable'); // calls through to real impl
    // First (seeded) candidate fails over-ably; the tail (lazily probed) then succeeds.
    const execSpy = vi.spyOn(runner as unknown as ReuseRunner, 'executeModel')
      .mockResolvedValueOnce({ success: false, errorInfo: { canFailover: true, errorType: 'ServiceError', severity: 'NonFatal' } })
      .mockResolvedValueOnce({ success: true });

    const sel = candidate('m-gem', 'GeminiLLM', 'v-google', 'Google', 5251);   // seeded true
    const tail = candidate('m-claude', 'AnthropicLLM', 'v-anthropic', 'Anthropic', 5100); // absent from map
    const cred = new Map<string, boolean>([[keyOf(sel), true]]); // tail intentionally omitted
    const result = await runFailoverWithCreds(runner, [sel, tail], ['AnthropicLLM'], cred);

    // Selection covered `sel`, so the only credential probe is the lazy one for the tail.
    expect(credSpy).toHaveBeenCalledTimes(1);
    expect(credSpy.mock.calls[0][0]).toBe('AnthropicLLM'); // driverClass arg of HasCredentialsAvailable
    expect(execSpy).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// The parallel coordinator is a SUBCLASS of AIPromptRunner so it REUSES the
// battle-tested executeModel (credentials, driver, ChatParams, prefill, media,
// streaming) instead of re-implementing it. These tests lock in that reuse so
// the two execution paths can never silently drift apart again.
// ===========================================================================
describe('ParallelExecutionCoordinator — reuses base execution path (no drift)', () => {
  type ExecArgs = unknown[];
  type CoordInternals = {
    executeModel: (...args: ExecArgs) => Promise<{ success: boolean; data?: unknown }>;
    executeSingleTask: (params: unknown, task: unknown, timeoutMS: number) => Promise<{ success: boolean }>;
    buildPerTaskParams: (params: unknown, task: unknown) => {
      additionalParameters?: Record<string, unknown>;
      onStreaming?: (chunk: { content: string; isComplete: boolean }) => void;
    };
  };

  function makeTask(overrides: Record<string, unknown> = {}) {
    return {
      taskId: 't1', prompt: makePrompt(), model: { ID: 'm1', Name: 'Model One', DriverClass: 'GeminiLLM', APIName: 'gemini' },
      renderedPrompt: 'hello', executionGroup: 0, priority: 0,
      vendorId: 'v-google', vendorDriverClass: 'GeminiLLM', vendorApiName: 'gemini',
      templateMessageRole: 'system', ...overrides,
    };
  }

  it('inherits executeModel/buildMessageArray from the base — does not redefine them', () => {
    const proto = ParallelExecutionCoordinator.prototype;
    // Own-property checks: if someone re-adds a duplicate implementation, these fail.
    expect(Object.prototype.hasOwnProperty.call(proto, 'executeModel')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(proto, 'buildMessageArray')).toBe(false);
    expect(new ParallelExecutionCoordinator()).toBeInstanceOf(AIPromptRunner);
  });

  it('is resolvable from the ClassFactory under the key the base uses', () => {
    const inst = MJGlobal.Instance.ClassFactory.CreateInstance(AIPromptRunner, 'ParallelExecutionCoordinator');
    expect(inst).toBeInstanceOf(ParallelExecutionCoordinator);
    expect(typeof (inst as unknown as CoordInternals & { executeTasksInParallel: unknown }).executeTasksInParallel).toBe('function');
  });

  it('executeSingleTask delegates the model call to the inherited executeModel with the task config', async () => {
    const coord = new ParallelExecutionCoordinator();
    const execSpy = vi.spyOn(coord as unknown as CoordInternals, 'executeModel')
      .mockResolvedValue({ success: true, data: { usage: {} } });

    const task = makeTask();
    const result = await (coord as unknown as CoordInternals).executeSingleTask({ verbose: false }, task, 30000);

    expect(execSpy).toHaveBeenCalledTimes(1);
    const args = execSpy.mock.calls[0];
    expect(args[0]).toBe(task.model);            // model
    expect(args[2]).toBe(task.prompt);           // prompt entity (not re-derived)
    expect(args[4]).toBe('v-google');            // vendorId
    expect(args[8]).toBe('GeminiLLM');           // vendorDriverClass (no model.DriverClass fallback)
    expect(args[9]).toBe('gemini');              // vendorApiName
    expect(result.success).toBe(true);
  });

  it('buildPerTaskParams clones (no shared mutation), merges model params, and bridges streaming', () => {
    const coord = new ParallelExecutionCoordinator();
    const shared = { additionalParameters: { temperature: 0.1 } } as Record<string, unknown>;
    const onContent = vi.fn();
    const task = makeTask({
      modelParameters: { topP: 0.9 },
      streamingConfig: { enabled: true, callbacks: { OnContent: onContent } },
    });

    const per = (coord as unknown as CoordInternals).buildPerTaskParams(shared, task);

    expect(per).not.toBe(shared);                                       // cloned, not the shared object
    expect(shared.additionalParameters).toEqual({ temperature: 0.1 }); // shared object untouched
    expect(per.additionalParameters).toEqual({ temperature: 0.1, topP: 0.9 }); // per-model merged in
    per.onStreaming?.({ content: 'tok', isComplete: false });
    expect(onContent).toHaveBeenCalledWith('tok', false);              // OnContent bridged via onStreaming
  });

  it('coalesces rapid streaming token chunks within the 35ms window and flushes immediately on completion (MJ-AI-9)', async () => {
    const runner = new AIPromptRunner();
    const receivedChunks: Array<{ content: string; isComplete: boolean; modelName?: string }> = [];

    type RunnerStreamingInternals = {
      executeModel: (
        model: unknown,
        renderedPrompt: string,
        prompt: unknown,
        params: Record<string, unknown>,
        vendorId: string | null,
        conversationMessages?: unknown[],
        templateMessageRole?: string,
        cancellationToken?: AbortSignal,
        vendorDriverClass?: string,
        vendorApiName?: string
      ) => Promise<unknown>;
      ResolveCredentialForExecution: () => Promise<string>;
      buildMessageArray: () => unknown[];
      runChatCompletionBounded: (llm: unknown, chatParams: { streamingCallbacks?: { OnContent?: (c: string, d: boolean) => void } }) => Promise<unknown>;
    };

    const internals = runner as unknown as RunnerStreamingInternals;
    vi.spyOn(internals, 'ResolveCredentialForExecution').mockResolvedValue('test-key');
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue({
      GetFileCapabilities: () => ({}),
      SupportsAssistantPrefill: false,
    } as never);
    vi.spyOn(internals, 'buildMessageArray').mockReturnValue([]);
    vi.spyOn(internals, 'runChatCompletionBounded').mockImplementation(async (_llm, chatParams) => {
      const onContent = chatParams.streamingCallbacks?.OnContent;
      // First chunk should emit immediately
      onContent?.('Hello', false);
      // Rapid subsequent chunks in same tick should be buffered and coalesced
      onContent?.(' ', false);
      onContent?.('world', false);
      onContent?.('!', true);
      return { success: true, data: { choices: [{ message: { content: 'Hello world!' } }], usage: {} } };
    });

    await internals.executeModel(
      { ID: 'm1', Name: 'Model One', DriverClass: 'OpenAILLM', APIName: 'gpt-4o' },
      'rendered',
      makePrompt(),
      { onStreaming: (c: { content: string; isComplete: boolean; modelName?: string }) => receivedChunks.push(c) },
      'v1',
      [],
      'system',
      undefined,
      'OpenAILLM',
      'gpt-4o'
    );

    // 4 rapid token emissions were coalesced into 2 callbacks: immediate first chunk + flushed completion chunk
    expect(receivedChunks).toEqual([
      { content: 'Hello', isComplete: false, modelName: 'Model One' },
      { content: ' world!', isComplete: true, modelName: 'Model One' },
    ]);
  });
});
