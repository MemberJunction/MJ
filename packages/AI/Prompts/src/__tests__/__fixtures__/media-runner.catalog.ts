/**
 * Builds the model catalog the media runner tests run against: the realistic LLM catalog, plus one
 * media model type with the models and carrier prompt a test describes.
 */
import { BuildRealisticCatalog, MakeModel, MakeModelVendor, MakePromptModel, VENDOR_TYPE } from '@memberjunction/unit-testing';
import type { FxModel, FxModelVendor } from '@memberjunction/unit-testing';
import type { FakePrompt, MediaRunnerHarness } from './media-runner.harness';

export const USAGE_TYPE = {
  Tokens: 'B1A1C1D1-0000-4000-8000-000000000001',
  Seconds: 'B1A1C1D1-0000-4000-8000-000000000002',
  Characters: 'B1A1C1D1-0000-4000-8000-000000000003',
  Images: 'B1A1C1D1-0000-4000-8000-000000000004',
} as const;

/** One vendor of a media model: who serves it, through which driver, under which API name. */
export interface MediaVendorSpec {
  VendorID: string;
  Vendor: string;
  DriverClass: string;
  APIName: string | null;
  Priority: number;
}

/** One media model, and its priority in the carrier prompt's bindings. */
export interface MediaModelSpec {
  ID: string;
  Name: string;
  PowerRank: number;
  PromptPriority: number;
  Vendors: MediaVendorSpec[];
}

/** The media model type, the carrier prompt and the models it binds. */
export interface MediaCatalogSpec {
  ModelTypeID: string;
  ModelTypeName: string;
  PromptID: string;
  PromptName: string;
  FailoverStrategy: FakePrompt['FailoverStrategy'];
  Models: MediaModelSpec[];
}

function mediaModel(spec: MediaModelSpec, catalog: MediaCatalogSpec): FxModel {
  const vendors: FxModelVendor[] = spec.Vendors.map((v, i) => MakeModelVendor({
    ID: `mv-${spec.ID}-${i}`,
    ModelID: spec.ID,
    VendorID: v.VendorID,
    Vendor: v.Vendor,
    TypeID: VENDOR_TYPE.InferenceProvider,
    DriverClass: v.DriverClass,
    APIName: v.APIName,
    Priority: v.Priority,
  }));
  return MakeModel({
    ID: spec.ID,
    Name: spec.Name,
    AIModelTypeID: catalog.ModelTypeID,
    AIModelType: catalog.ModelTypeName,
    PowerRank: spec.PowerRank,
    ModelVendors: vendors,
  });
}

/** Loads the catalog into the harness, with every driver class the spec names configured with a key. */
export function LoadMediaCatalog(harness: MediaRunnerHarness, spec: MediaCatalogSpec): void {
  const base = BuildRealisticCatalog();
  const models = spec.Models.map(m => mediaModel(m, spec));
  const state = harness.State;
  state.VendorTypeDefinitions = base.vendorTypeDefinitions;
  state.Vendors = base.vendors;
  state.ModelTypes = [...base.modelTypes, { ID: spec.ModelTypeID, Name: spec.ModelTypeName }];
  state.Models = [...base.models, ...models];
  state.ModelVendors = [...base.modelVendors, ...models.flatMap(m => m.ModelVendors)];
  state.PromptModels = spec.Models.map(m => MakePromptModel({ PromptID: spec.PromptID, ModelID: m.ID, Priority: m.PromptPriority }));
  state.Prompts = [{
    ID: spec.PromptID,
    Name: spec.PromptName,
    Status: 'Active',
    TemplateID: `template-${spec.PromptID}`,
    AIModelTypeID: spec.ModelTypeID,
    SelectionStrategy: 'Specific',
    FailoverStrategy: spec.FailoverStrategy,
    RequireSpecificModels: true,
    MaxRetries: 0,
  }];
  state.ConfiguredDrivers = new Set(spec.Models.flatMap(m => m.Vendors.map(v => v.DriverClass)));
  state.UsageTypes = Object.entries(USAGE_TYPE).map(([Name, ID]) => ({ ID, Name }));
}

/** An active LLM from the realistic catalog, for the wrong-type tests. */
export function AnLLMModelID(harness: MediaRunnerHarness): string {
  const llm = harness.State.Models.find(m => m.AIModelType === 'LLM' && m.IsActive);
  if (!llm) {
    throw new Error('The realistic catalog has no active LLM');
  }
  return llm.ID;
}
