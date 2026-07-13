/**
 * Realistic AI-metadata fixtures for AIPromptRunner unit tests.
 *
 * These mirror the SHAPE and representative VALUES of the production seed data
 * (metadata/ai-vendors, ai-models, ai-model-types, ai-vendor-type-definitions,
 * ai-configurations) so model-selection tests exercise believable catalogs:
 * real driver-class strings (AnthropicLLM / OpenAILLM / GeminiLLM / GroqLLM…),
 * real API names, real PowerRanks, and the multi-vendor / multi-priority layout
 * (a model offered by its developer + several inference providers at different
 * priorities) that the selection logic actually has to navigate.
 *
 * The IDs match the real hardcoded seed UUIDs where they are fixed (vendor type
 * definitions, vendors, model types, configurations); model/prompt-model IDs are
 * stable test UUIDs.
 *
 * Pure data only — no vitest/mock coupling. A test wires these into a mock
 * AIEngine (see AIPromptRunner.model-selection.test.ts).
 */

// ---------------------------------------------------------------------------
// Fixed seed UUIDs (match production)
// ---------------------------------------------------------------------------
export const VENDOR_TYPE = {
  ModelDeveloper: '10DB468E-F2CE-475D-9F39-2DF2DE75D257',
  InferenceProvider: '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3',
} as const;

export const VENDOR = {
  OpenAI: 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
  Anthropic: 'DAA5CCEC-6A37-EF11-86D4-000D3A4E707E',
  Google: 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E',
  Groq: 'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E',
  Cerebras: '3EDA433E-F36B-1410-8DB6-00021F8B792E',
  AmazonBedrock: '59FA8F6E-F14C-4874-A69C-BAD794DDC3AA',
  VertexAI: 'E41E970D-7D38-45D9-BBFC-4013FF7C5860',
  DeepSeek: 'D13D6306-2098-44B8-AEFA-9CE3694335EC',
  xAI: '5483D98F-1F4E-40F4-91FC-EAA8EFDC90F1',
} as const;

export const MODEL_TYPE = {
  LLM: 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
  Embeddings: 'EAA5CCEC-6A37-EF11-86D4-000D3A4E707E',
} as const;

export const CONFIG = {
  Fast: '3A1C5A15-8DAA-44E5-A098-F20085E6C93F',
  Standard: 'A76B1550-A6D8-4491-9EF6-A38A8F660FBC',
  HighPower: 'B6B9D780-52B2-431B-93AB-AC83FEF78553',
} as const;

// Stable test model UUIDs (real models in prod, fixed IDs here for assertions)
export const MODEL = {
  ClaudeOpus45: '52B79053-6E59-44E9-B7D0-DA96C4EA3CF1',
  ClaudeSonnet45: '7D7C3623-34BC-4DE5-B940-EC09367CFB3E',
  ClaudeHaiku45: '0A1B2C3D-0000-0000-0000-00000000C001',
  GPT5: '0A1B2C3D-0000-0000-0000-00000000G001',
  GPT5Mini: '0A1B2C3D-0000-0000-0000-00000000G002',
  Gemini3Pro: 'B7267218-302B-4C09-9875-8DF06AAA1695',
  Gemini3Flash: '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45',
  Qwen3_32B: 'C496B988-4EA4-4D7E-A6DD-255F56D93933',
  Llama70B: '0A1B2C3D-0000-0000-0000-00000000L001',
  DeepSeekV4: 'DCDD6683-779F-4B03-89B5-746F95BB5293',
  GrokInactive: '8B309C04-F5DC-4619-BA5E-F7A3BD55A41B',
} as const;

// ---------------------------------------------------------------------------
// Lightweight fixture types (only the fields the runner reads)
// ---------------------------------------------------------------------------
export interface FxVendorType { ID: string; Name: string; }
export interface FxVendor { ID: string; Name: string; CredentialTypeID?: string | null; }
export interface FxModelType { ID: string; Name: string; }
export interface FxConfiguration { ID: string; Name: string; ParentID: string | null; Status?: string; }

export interface FxModelVendor {
  ID: string;
  ModelID: string;
  VendorID: string;
  Vendor: string;        // denormalized vendor name (view field)
  TypeID: string;        // Inference Provider vs Model Developer
  DriverClass: string | null;
  APIName: string | null;
  Priority: number;
  Status: 'Active' | 'Inactive';
  SupportsEffortLevel: boolean | null;
}

export interface FxModel {
  ID: string;
  Name: string;
  APIName: string | null;
  DriverClass: string | null;
  Vendor: string;        // denormalized developer name (view field)
  AIModelTypeID: string;
  AIModelType: string;   // denormalized type name (view field)
  PowerRank: number;
  IsActive: boolean;
  SupportsEffortLevel: boolean | null;
  ModelVendors: FxModelVendor[]; // populated by buildRealisticCatalog (engine does this at load)
}

export interface FxPromptModel {
  ID: string;
  PromptID: string;
  ModelID: string;
  VendorID: string | null;
  ConfigurationID: string | null;
  Priority: number;
  Status: 'Active' | 'Preview' | 'Inactive';
  EffortLevel: number | null;
}

export interface AICatalog {
  vendorTypeDefinitions: FxVendorType[];
  vendors: FxVendor[];
  modelTypes: FxModelType[];
  configurations: FxConfiguration[];
  models: FxModel[];
  modelVendors: FxModelVendor[];
  promptModels: FxPromptModel[];
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
let _mvSeq = 0;
export function makeModelVendor(p: Partial<FxModelVendor> & { ModelID: string; VendorID: string }): FxModelVendor {
  return {
    ID: p.ID ?? `mv-${++_mvSeq}`,
    Vendor: p.Vendor ?? 'UnknownVendor',
    TypeID: p.TypeID ?? VENDOR_TYPE.InferenceProvider,
    DriverClass: p.DriverClass ?? null,
    APIName: p.APIName ?? null,
    Priority: p.Priority ?? 0,
    Status: p.Status ?? 'Active',
    SupportsEffortLevel: p.SupportsEffortLevel ?? false,
    ModelID: p.ModelID,
    VendorID: p.VendorID,
  };
}

export function makeModel(p: Partial<FxModel> & { ID: string; Name: string }): FxModel {
  return {
    APIName: p.APIName ?? null,
    DriverClass: p.DriverClass ?? null,
    Vendor: p.Vendor ?? '',
    AIModelTypeID: p.AIModelTypeID ?? MODEL_TYPE.LLM,
    AIModelType: p.AIModelType ?? 'LLM',
    PowerRank: p.PowerRank ?? 0,
    IsActive: p.IsActive ?? true,
    SupportsEffortLevel: p.SupportsEffortLevel ?? false,
    ModelVendors: p.ModelVendors ?? [],
    ID: p.ID,
    Name: p.Name,
  };
}

export function makePromptModel(p: Partial<FxPromptModel> & { PromptID: string; ModelID: string }): FxPromptModel {
  return {
    ID: p.ID ?? `pm-${p.PromptID}-${p.ModelID}-${p.VendorID ?? 'any'}-${p.ConfigurationID ?? 'null'}`,
    VendorID: p.VendorID ?? null,
    ConfigurationID: p.ConfigurationID ?? null,
    Priority: p.Priority ?? 0,
    Status: p.Status ?? 'Active',
    EffortLevel: p.EffortLevel ?? null,
    PromptID: p.PromptID,
    ModelID: p.ModelID,
  };
}

/**
 * Builds a believable production-shaped catalog. Models carry their own
 * ModelVendors array (the real engine attaches this during AdditionalLoading).
 * `promptModels` starts empty — selection tests add the associations they need.
 */
export function buildRealisticCatalog(): AICatalog {
  const vendorTypeDefinitions: FxVendorType[] = [
    { ID: VENDOR_TYPE.ModelDeveloper, Name: 'Model Developer' },
    { ID: VENDOR_TYPE.InferenceProvider, Name: 'Inference Provider' },
  ];

  const vendors: FxVendor[] = [
    { ID: VENDOR.OpenAI, Name: 'OpenAI' },
    { ID: VENDOR.Anthropic, Name: 'Anthropic' },
    { ID: VENDOR.Google, Name: 'Google' },
    { ID: VENDOR.Groq, Name: 'Groq' },
    { ID: VENDOR.Cerebras, Name: 'Cerebras' },
    { ID: VENDOR.AmazonBedrock, Name: 'Amazon Bedrock' },
    { ID: VENDOR.VertexAI, Name: 'Vertex AI' },
    { ID: VENDOR.DeepSeek, Name: 'DeepSeek' },
    { ID: VENDOR.xAI, Name: 'x.ai' },
  ];

  const modelTypes: FxModelType[] = [
    { ID: MODEL_TYPE.LLM, Name: 'LLM' },
    { ID: MODEL_TYPE.Embeddings, Name: 'Embeddings' },
  ];

  // Independent configs by default (matches prod). Inheritance is layered by a
  // dedicated helper so tests opt into chains explicitly.
  const configurations: FxConfiguration[] = [
    { ID: CONFIG.Fast, Name: 'Fast', ParentID: null, Status: 'Active' },
    { ID: CONFIG.Standard, Name: 'Standard', ParentID: null, Status: 'Active' },
    { ID: CONFIG.HighPower, Name: 'High Power', ParentID: null, Status: 'Active' },
  ];

  // ---- Models + their vendor offerings ----
  const models: FxModel[] = [];
  const modelVendors: FxModelVendor[] = [];

  const add = (model: FxModel, vendors: FxModelVendor[]): void => {
    model.ModelVendors = vendors;
    models.push(model);
    modelVendors.push(...vendors);
  };

  // Claude 4.5 Opus — Anthropic (developer + inference) + Bedrock (inference, lower priority)
  add(
    makeModel({ ID: MODEL.ClaudeOpus45, Name: 'Claude 4.5 Opus', Vendor: 'Anthropic', PowerRank: 21, SupportsEffortLevel: true }),
    [
      makeModelVendor({ ModelID: MODEL.ClaudeOpus45, VendorID: VENDOR.Anthropic, Vendor: 'Anthropic', TypeID: VENDOR_TYPE.ModelDeveloper, Priority: 0 }),
      makeModelVendor({ ModelID: MODEL.ClaudeOpus45, VendorID: VENDOR.Anthropic, Vendor: 'Anthropic', DriverClass: 'AnthropicLLM', APIName: 'claude-opus-4-5-20251101', Priority: 1, SupportsEffortLevel: true }),
      makeModelVendor({ ModelID: MODEL.ClaudeOpus45, VendorID: VENDOR.AmazonBedrock, Vendor: 'Amazon Bedrock', DriverClass: 'BedrockLLM', APIName: 'anthropic.claude-opus-4-5-20251101-v1:0', Priority: 5, SupportsEffortLevel: true }),
    ],
  );

  // Claude 4.5 Sonnet — Anthropic inference only
  add(
    makeModel({ ID: MODEL.ClaudeSonnet45, Name: 'Claude 4.5 Sonnet', Vendor: 'Anthropic', PowerRank: 19, SupportsEffortLevel: true }),
    [
      makeModelVendor({ ModelID: MODEL.ClaudeSonnet45, VendorID: VENDOR.Anthropic, Vendor: 'Anthropic', DriverClass: 'AnthropicLLM', APIName: 'claude-sonnet-4-5-20250929', Priority: 1, SupportsEffortLevel: true }),
    ],
  );

  // Claude Haiku 4.5 — fast/cheap
  add(
    makeModel({ ID: MODEL.ClaudeHaiku45, Name: 'Claude Haiku 4.5', Vendor: 'Anthropic', PowerRank: 12, SupportsEffortLevel: true }),
    [
      makeModelVendor({ ModelID: MODEL.ClaudeHaiku45, VendorID: VENDOR.Anthropic, Vendor: 'Anthropic', DriverClass: 'AnthropicLLM', APIName: 'claude-haiku-4-5', Priority: 1, SupportsEffortLevel: true }),
    ],
  );

  // GPT-5 — OpenAI + Azure-ish (use OpenAI inference here)
  add(
    makeModel({ ID: MODEL.GPT5, Name: 'GPT-5', Vendor: 'OpenAI', PowerRank: 20, SupportsEffortLevel: true }),
    [
      makeModelVendor({ ModelID: MODEL.GPT5, VendorID: VENDOR.OpenAI, Vendor: 'OpenAI', DriverClass: 'OpenAILLM', APIName: 'gpt-5', Priority: 1, SupportsEffortLevel: true }),
    ],
  );

  // GPT-5 Mini
  add(
    makeModel({ ID: MODEL.GPT5Mini, Name: 'GPT-5 Mini', Vendor: 'OpenAI', PowerRank: 13 }),
    [
      makeModelVendor({ ModelID: MODEL.GPT5Mini, VendorID: VENDOR.OpenAI, Vendor: 'OpenAI', DriverClass: 'OpenAILLM', APIName: 'gpt-5-mini', Priority: 1 }),
    ],
  );

  // Gemini 3 Pro — INACTIVE model (should be excluded from selection)
  add(
    makeModel({ ID: MODEL.Gemini3Pro, Name: 'Gemini 3 Pro', Vendor: 'Google', PowerRank: 25, IsActive: false }),
    [
      makeModelVendor({ ModelID: MODEL.Gemini3Pro, VendorID: VENDOR.Google, Vendor: 'Google', DriverClass: 'GeminiLLM', APIName: 'gemini-3-pro', Priority: 1 }),
    ],
  );

  // Gemini 3 Flash — two inference providers (Google priority 1, Vertex priority 1) + developer rows
  add(
    makeModel({ ID: MODEL.Gemini3Flash, Name: 'Gemini 3 Flash', Vendor: 'Google', PowerRank: 22 }),
    [
      makeModelVendor({ ModelID: MODEL.Gemini3Flash, VendorID: VENDOR.Google, Vendor: 'Google', TypeID: VENDOR_TYPE.ModelDeveloper, Priority: 0 }),
      makeModelVendor({ ModelID: MODEL.Gemini3Flash, VendorID: VENDOR.Google, Vendor: 'Google', DriverClass: 'GeminiLLM', APIName: 'gemini-3-flash-preview', Priority: 2 }),
      makeModelVendor({ ModelID: MODEL.Gemini3Flash, VendorID: VENDOR.VertexAI, Vendor: 'Vertex AI', DriverClass: 'VertexLLM', APIName: 'gemini-3-flash-preview', Priority: 1 }),
    ],
  );

  // Qwen 3 32B — Groq (active, effort) + Cerebras (INACTIVE vendor row) + Alibaba developer
  add(
    makeModel({ ID: MODEL.Qwen3_32B, Name: 'Qwen 3 32B', Vendor: 'Alibaba Cloud', PowerRank: 11 }),
    [
      makeModelVendor({ ModelID: MODEL.Qwen3_32B, VendorID: VENDOR.Cerebras, Vendor: 'Cerebras', DriverClass: 'CerebrasLLM', APIName: 'qwen-3-32b', Priority: 0, Status: 'Inactive' }),
      makeModelVendor({ ModelID: MODEL.Qwen3_32B, VendorID: VENDOR.Groq, Vendor: 'Groq', DriverClass: 'GroqLLM', APIName: 'qwen/qwen3-32b', Priority: 1, SupportsEffortLevel: true }),
    ],
  );

  // Llama 70B on Groq
  add(
    makeModel({ ID: MODEL.Llama70B, Name: 'Llama 3 70B', Vendor: 'Groq', PowerRank: 9 }),
    [
      makeModelVendor({ ModelID: MODEL.Llama70B, VendorID: VENDOR.Groq, Vendor: 'Groq', DriverClass: 'GroqLLM', APIName: 'llama-3.3-70b', Priority: 1 }),
    ],
  );

  // DeepSeek V4
  add(
    makeModel({ ID: MODEL.DeepSeekV4, Name: 'DeepSeek V4 Pro', Vendor: 'DeepSeek', PowerRank: 15 }),
    [
      makeModelVendor({ ModelID: MODEL.DeepSeekV4, VendorID: VENDOR.DeepSeek, Vendor: 'DeepSeek', DriverClass: 'DeepSeekLLM', APIName: 'deepseek-v4-pro', Priority: 1 }),
    ],
  );

  // Grok 4 — INACTIVE model
  add(
    makeModel({ ID: MODEL.GrokInactive, Name: 'Grok 4', Vendor: 'x.ai', PowerRank: 19, IsActive: false }),
    [
      makeModelVendor({ ModelID: MODEL.GrokInactive, VendorID: VENDOR.xAI, Vendor: 'x.ai', DriverClass: 'xAILLM', APIName: 'grok-4-0709', Priority: 1 }),
    ],
  );

  return { vendorTypeDefinitions, vendors, modelTypes, configurations, models, modelVendors, promptModels: [] };
}

/** Driver classes that have valid credentials by default in tests (the common LLM providers). */
export const DEFAULT_CONFIGURED_DRIVERS = [
  'AnthropicLLM', 'OpenAILLM', 'GeminiLLM', 'VertexLLM', 'GroqLLM', 'BedrockLLM', 'DeepSeekLLM', 'CerebrasLLM', 'xAILLM',
];
