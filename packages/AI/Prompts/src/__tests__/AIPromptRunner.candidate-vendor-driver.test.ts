/**
 * Regression tests for AIPromptRunner.buildCandidatesFromSelectionInfo().
 *
 * Bug (live-confirmed in mj_5_41_0): a failover candidate was rebuilt with a vendorId from the
 * selected vendor (e.g. Google) but a driverClass belonging to a DIFFERENT vendor (OpenRouterLLM).
 * Root cause: the helper matched the vendor row with a bare VendorID `.find` — which can return
 * that vendor's Model-Developer row (DriverClass = NULL) — then fell back to `model.DriverClass`,
 * which `vwAIModels` computes from the highest-priority vendor (OpenRouter, Priority 50). The
 * resulting OpenRouterLLM client had no key and threw the OpenAI-SDK "OPENAI_API_KEY" error.
 *
 * These tests pin the corrected behavior: the candidate's driver must come from its OWN selected
 * inference vendor, never from the model-level (cross-vendor) default.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal hoisted mock of AIEngine — only IsInferenceProvider is exercised here.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const INFERENCE_TYPE = 'inference-provider-type-id';
  const DEVELOPER_TYPE = 'model-developer-type-id';
  return {
    INFERENCE_TYPE,
    DEVELOPER_TYPE,
    engine: {
      IsInferenceProvider: (mv: { TypeID?: string }) => mv?.TypeID === INFERENCE_TYPE,
    },
  };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, AIEngine: { Instance: h.engine } };
});

vi.mock('@memberjunction/credentials', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
  return {
    ...actual,
    CredentialEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), Credentials: [] } },
  };
});

import { AIPromptRunner } from '../AIPromptRunner';
import { AIModelSelectionInfo, MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { MJAIModelVendorEntity, MJAIVendorEntity } from '@memberjunction/core-entities';

// ---------------------------------------------------------------------------
// Fixtures mirroring the live Gemini 3.5 Flash row shape.
// ---------------------------------------------------------------------------
const MODEL_ID = 'C43229F6-4CC8-4838-9D04-03419A2DA191';
const GOOGLE_VENDOR_ID = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E';

type VendorRow = { VendorID: string; Vendor: string | null; DriverClass: string | null; APIName: string | null; Status: string; TypeID: string; Priority: number; SupportsEffortLevel: boolean | null };

function makeVendorRow(overrides: Partial<VendorRow>): MJAIModelVendorEntity {
  return {
    VendorID: GOOGLE_VENDOR_ID, Vendor: 'Google', DriverClass: null, APIName: null,
    Status: 'Active', TypeID: h.DEVELOPER_TYPE, Priority: 1, SupportsEffortLevel: null,
    ...overrides,
  } as unknown as MJAIModelVendorEntity;
}

/**
 * Builds a model whose view-computed DriverClass is the keyless top-priority vendor's driver
 * (OpenRouterLLM), with the supplied ModelVendors rows in the given order.
 */
function makeModel(modelVendors: MJAIModelVendorEntity[]): MJAIModelEntityExtended {
  return {
    ID: MODEL_ID,
    Name: 'Gemini 3.5 Flash',
    DriverClass: 'OpenRouterLLM',          // vwAIModels OUTER APPLY → highest-priority vendor (OpenRouter @50)
    APIName: 'google/gemini-3.5-flash',
    SupportsEffortLevel: false,
    ModelVendors: modelVendors,
  } as unknown as MJAIModelEntityExtended;
}

const googleVendor = { ID: GOOGLE_VENDOR_ID, Name: 'Google' } as unknown as MJAIVendorEntity;

function makeSelectionInfo(
  model: MJAIModelEntityExtended,
  vendor: MJAIVendorEntity | undefined,
  available = true,
): AIModelSelectionInfo {
  const info = new AIModelSelectionInfo();
  info.modelSelected = model;
  info.vendorSelected = vendor;
  info.selectionReason = 'test';
  info.fallbackUsed = false;
  info.selectionStrategy = 'Specific';
  info.modelsConsidered = [{ model, vendor, priority: 5, available }];
  return info;
}

type CandidateShape = { vendorId?: string; driverClass: string };
function buildCandidates(runner: AIPromptRunner, info: AIModelSelectionInfo): CandidateShape[] {
  return (runner as unknown as {
    buildCandidatesFromSelectionInfo(si: AIModelSelectionInfo): CandidateShape[];
  }).buildCandidatesFromSelectionInfo(info);
}

function createCandidates(runner: AIPromptRunner, model: MJAIModelEntityExtended, preferredVendorId?: string): CandidateShape[] {
  return (runner as unknown as {
    createCandidatesForModel(m: MJAIModelEntityExtended, basePriority: number, source: string, preferredVendorId?: string): CandidateShape[];
  }).createCandidatesForModel(model, 10, 'model-type', preferredVendorId);
}

let runner: AIPromptRunner;
beforeEach(() => {
  runner = new AIPromptRunner();
});

describe('buildCandidatesFromSelectionInfo — vendor/driver alignment', () => {
  it('uses the selected vendor\'s own inference driver even when its developer (NULL-driver) row sorts first', () => {
    // Order mirrors the live DB: Model-Developer row (NULL driver) precedes the inference row.
    const model = makeModel([
      makeVendorRow({ TypeID: h.DEVELOPER_TYPE, DriverClass: null }),
      makeVendorRow({ TypeID: h.INFERENCE_TYPE, DriverClass: 'GeminiLLM', APIName: 'gemini-3.5-flash', SupportsEffortLevel: false }),
    ]);

    const candidates = buildCandidates(runner, makeSelectionInfo(model, googleVendor));

    expect(candidates).toHaveLength(1);
    expect(candidates[0].vendorId).toBe(GOOGLE_VENDOR_ID);
    // The fix: GeminiLLM (the vendor's own driver), NOT the model-level OpenRouterLLM.
    expect(candidates[0].driverClass).toBe('GeminiLLM');
  });

  it('drops a candidate whose selected vendor has no usable inference driver (never grafts the model-level driver)', () => {
    // Vendor offers ONLY a developer row with a NULL driver — no inference driver to run.
    const model = makeModel([makeVendorRow({ TypeID: h.DEVELOPER_TYPE, DriverClass: null })]);

    const candidates = buildCandidates(runner, makeSelectionInfo(model, googleVendor));

    // Must NOT fall back to model.DriverClass (OpenRouterLLM) and pair it with vendorId=Google.
    expect(candidates).toHaveLength(0);
  });

  it('still falls back to the model-level driver when NO specific vendor was selected', () => {
    const model = makeModel([
      makeVendorRow({ TypeID: h.INFERENCE_TYPE, DriverClass: 'GeminiLLM', APIName: 'gemini-3.5-flash' }),
    ]);

    const candidates = buildCandidates(runner, makeSelectionInfo(model, undefined));

    expect(candidates).toHaveLength(1);
    expect(candidates[0].vendorId).toBeUndefined();
    expect(candidates[0].driverClass).toBe('OpenRouterLLM'); // model-level default is correct with no vendor
  });

  it('excludes candidates that the selector marked unavailable', () => {
    const model = makeModel([
      makeVendorRow({ TypeID: h.INFERENCE_TYPE, DriverClass: 'GeminiLLM', APIName: 'gemini-3.5-flash' }),
    ]);

    const candidates = buildCandidates(runner, makeSelectionInfo(model, googleVendor, /* available */ false));

    expect(candidates).toHaveLength(0);
  });
});

describe('createCandidatesForModel — vendor/driver alignment (selection-time builder)', () => {
  it('builds a candidate with the vendor\'s own driver', () => {
    const model = makeModel([
      makeVendorRow({ TypeID: h.INFERENCE_TYPE, DriverClass: 'GeminiLLM', APIName: 'gemini-3.5-flash', Priority: 1 }),
    ]);

    const candidates = createCandidates(runner, model);

    const google = candidates.find(c => c.vendorId === GOOGLE_VENDOR_ID);
    expect(google?.driverClass).toBe('GeminiLLM');
  });

  it('never pairs a vendorId with the model-level (cross-vendor) driver when that vendor\'s inference row has no driver', () => {
    // An inference row with a NULL driver must not become a candidate carrying vendorId=Google +
    // model.DriverClass (OpenRouterLLM). It is excluded; only the no-vendor model-level fallback
    // may use model.DriverClass.
    const model = makeModel([
      makeVendorRow({ TypeID: h.INFERENCE_TYPE, DriverClass: null, Priority: 1 }),
    ]);

    const candidates = createCandidates(runner, model);

    expect(candidates.find(c => c.vendorId === GOOGLE_VENDOR_ID)).toBeUndefined();
    // Any fallback candidate must be model-level (no vendorId) — never a vendor/driver mismatch.
    for (const c of candidates) {
      expect(c.vendorId).toBeUndefined();
    }
  });
});
