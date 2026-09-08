import { describe, it, expect } from 'vitest';
import {
  buildRealisticCatalog,
  makeModel,
  makeModelVendor,
  makePromptModel,
  CONFIG,
  DEFAULT_CONFIGURED_DRIVERS,
  MODEL,
  MODEL_TYPE,
  VENDOR,
  VENDOR_TYPE,
} from '../ai/catalog-fixtures';

describe('buildRealisticCatalog', () => {
  it('builds the full production-shaped catalog sections', () => {
    const catalog = buildRealisticCatalog();
    expect(catalog.vendorTypeDefinitions).toHaveLength(2);
    expect(catalog.vendors).toHaveLength(9);
    expect(catalog.modelTypes).toHaveLength(2);
    expect(catalog.configurations).toHaveLength(3);
    expect(catalog.models).toHaveLength(11);
    expect(catalog.promptModels).toHaveLength(0); // tests add the associations they need
  });

  it('every model carries its own ModelVendors array, and the flat list is their union', () => {
    const catalog = buildRealisticCatalog();
    const fromModels = catalog.models.flatMap((m) => m.ModelVendors);
    expect(catalog.modelVendors).toHaveLength(fromModels.length);
    for (const mv of fromModels) {
      expect(catalog.modelVendors).toContain(mv);
      expect(mv.ModelID).toBeTruthy();
      expect(mv.VendorID).toBeTruthy();
    }
  });

  it('model-vendor rows reference catalog vendors and vendor types', () => {
    const catalog = buildRealisticCatalog();
    const vendorIds = new Set(catalog.vendors.map((v) => v.ID));
    const typeIds = new Set(catalog.vendorTypeDefinitions.map((t) => t.ID));
    for (const mv of catalog.modelVendors) {
      expect(vendorIds.has(mv.VendorID)).toBe(true);
      expect(typeIds.has(mv.TypeID)).toBe(true);
    }
  });

  it('inference-provider rows carry real driver-class strings covered by DEFAULT_CONFIGURED_DRIVERS', () => {
    const catalog = buildRealisticCatalog();
    const inferenceRows = catalog.modelVendors.filter((mv) => mv.TypeID === VENDOR_TYPE.InferenceProvider);
    for (const mv of inferenceRows) {
      expect(mv.DriverClass).toBeTruthy();
      expect(DEFAULT_CONFIGURED_DRIVERS).toContain(mv.DriverClass);
      expect(mv.APIName).toBeTruthy();
    }
    // developer rows have no driver — they are never executed
    const developerRows = catalog.modelVendors.filter((mv) => mv.TypeID === VENDOR_TYPE.ModelDeveloper);
    expect(developerRows.length).toBeGreaterThan(0);
    for (const mv of developerRows) {
      expect(mv.DriverClass).toBeNull();
    }
  });

  it('includes the selection edge cases: inactive models and an inactive vendor row', () => {
    const catalog = buildRealisticCatalog();
    const inactiveModels = catalog.models.filter((m) => !m.IsActive).map((m) => m.ID);
    expect(inactiveModels).toContain(MODEL.Gemini3Pro);
    expect(inactiveModels).toContain(MODEL.GrokInactive);
    const inactiveVendorRows = catalog.modelVendors.filter((mv) => mv.Status === 'Inactive');
    expect(inactiveVendorRows).toHaveLength(1);
    expect(inactiveVendorRows[0].ModelID).toBe(MODEL.Qwen3_32B);
  });

  it('models the multi-vendor / multi-priority layout (Claude Opus: Anthropic dev+inference, Bedrock alternate)', () => {
    const catalog = buildRealisticCatalog();
    const opus = catalog.models.find((m) => m.ID === MODEL.ClaudeOpus45);
    expect(opus?.ModelVendors).toHaveLength(3);
    const bedrock = opus?.ModelVendors.find((mv) => mv.VendorID === VENDOR.AmazonBedrock);
    expect(bedrock?.DriverClass).toBe('BedrockLLM');
    expect(bedrock?.Priority).toBe(5);
  });

  it('returns a fresh, independent catalog per call (mutations do not leak between tests)', () => {
    const a = buildRealisticCatalog();
    const b = buildRealisticCatalog();
    expect(a.models).not.toBe(b.models);
    a.models.pop();
    expect(b.models).toHaveLength(11);
  });

  it('exposes the fixed production seed UUIDs', () => {
    expect(VENDOR.Anthropic).toBe('DAA5CCEC-6A37-EF11-86D4-000D3A4E707E');
    expect(MODEL_TYPE.LLM).toBe('E8A5CCEC-6A37-EF11-86D4-000D3A4E707E');
    expect(VENDOR_TYPE.InferenceProvider).toBe('5B043EC3-1FF2-4730-B5D2-7CFDA50979B3');
    expect(CONFIG.Standard).toBe('A76B1550-A6D8-4491-9EF6-A38A8F660FBC');
  });
});

describe('builders', () => {
  it('makeModel defaults to an active LLM with empty vendors', () => {
    const model = makeModel({ ID: 'm-1', Name: 'Custom Model' });
    expect(model.IsActive).toBe(true);
    expect(model.AIModelTypeID).toBe(MODEL_TYPE.LLM);
    expect(model.AIModelType).toBe('LLM');
    expect(model.ModelVendors).toEqual([]);
    expect(model.PowerRank).toBe(0);
  });

  it('makeModelVendor defaults to an active inference-provider row and assigns unique IDs', () => {
    const a = makeModelVendor({ ModelID: 'm-1', VendorID: VENDOR.OpenAI });
    const b = makeModelVendor({ ModelID: 'm-1', VendorID: VENDOR.OpenAI });
    expect(a.TypeID).toBe(VENDOR_TYPE.InferenceProvider);
    expect(a.Status).toBe('Active');
    expect(a.ID).not.toBe(b.ID);
  });

  it('makePromptModel defaults to an active association with a deterministic composite ID', () => {
    const pm = makePromptModel({ PromptID: 'p-1', ModelID: 'm-1' });
    expect(pm.Status).toBe('Active');
    expect(pm.Priority).toBe(0);
    expect(pm.VendorID).toBeNull();
    expect(pm.ConfigurationID).toBeNull();
    expect(pm.ID).toBe('pm-p-1-m-1-any-null');
  });
});
