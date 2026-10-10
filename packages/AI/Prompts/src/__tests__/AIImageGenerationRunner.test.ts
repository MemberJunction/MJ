import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { MJAIUsageTypeEntity } from '@memberjunction/core-entities';
import {
  BaseImageGenerator,
  ImageEditParams,
  ImageGenerationParams,
  ImageGenerationResult,
  ImageModelInfo,
  ImageVariationParams,
  GeneratedImage,
  ModelUsage,
} from '@memberjunction/ai';
import {
  BuildRealisticCatalog,
  MakeModel,
  MakeModelVendor,
  MODEL_TYPE,
  VENDOR,
  VENDOR_TYPE,
} from '@memberjunction/unit-testing';
import { AIImageGenerationRunner } from '../image/AIImageGenerationRunner';
import type { AIImageEditRunParams, AIImageGenerationRunParams } from '../image/image-runner.types';
import type { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

// ---------------------------------------------------------------------------
// Hoisted mock state and AIEngine mock (the shape AIDecisionRunner.test.ts uses)
// ---------------------------------------------------------------------------
const IMAGE_MODEL_TYPE_ID = 'E9A5CCEC-6A37-EF11-86D4-000D3A4E707E';

const h = vi.hoisted(() => {
  const norm = (s: unknown): string => (s == null ? '' : String(s).trim().toLowerCase());
  const eq = (a: unknown, b: unknown): boolean => norm(a) === norm(b);

  type CredentialBinding = { BindingType: string; TargetID: string; CredentialID: string; Priority: number };
  type Credential = {
    ID: string;
    Name: string;
    IsActive: boolean;
    IsDefault: boolean;
    CredentialTypeID: string;
    ExpiresAt: Date | null;
  };

  type State = {
    vendorTypeDefinitions: Array<{ ID: string; Name: string }>;
    vendors: Array<{ ID: string; Name: string; CredentialTypeID?: string | null }>;
    modelTypes: Array<{ ID: string; Name: string }>;
    configurations: Array<{ ID: string; Name: string; ParentID: string | null }>;
    models: Array<Record<string, unknown>>;
    modelVendors: Array<Record<string, unknown>>;
    promptModels: Array<Record<string, unknown>>;
    prompts: Array<Record<string, unknown>>;
    configuredDrivers: Set<string>;
    credentialBindings: CredentialBinding[];
    credentials: Credential[];
  };

  const state: State = {
    vendorTypeDefinitions: [],
    vendors: [],
    modelTypes: [],
    configurations: [],
    models: [],
    modelVendors: [],
    promptModels: [],
    prompts: [],
    configuredDrivers: new Set(),
    credentialBindings: [],
    credentials: [],
  };

  const bindingsFor = (bindingType: string, targetId: string): CredentialBinding[] =>
    state.credentialBindings.filter(b => b.BindingType === bindingType && eq(b.TargetID, targetId));

  const groupBy = (rows: Array<Record<string, unknown>>, key: string): Map<string, Array<Record<string, unknown>>> => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const k = norm(row[key]);
      (map.get(k) ?? map.set(k, []).get(k)!).push(row);
    }
    return map;
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
    IsInferenceProvider(mv: { TypeID?: string }) {
      const inf = state.vendorTypeDefinitions.find(v => v.Name === 'Inference Provider')?.ID;
      return inf ? eq(mv?.TypeID, inf) : true;
    },
    get ModelsByID() { return new Map(state.models.map(m => [norm(m.ID), m])); },
    get VendorsByID() { return new Map(state.vendors.map(v => [norm(v.ID), v])); },
    get ModelTypesByID() { return new Map(state.modelTypes.map(t => [norm(t.ID), t])); },
    get ConfigurationsByID() { return new Map(state.configurations.map(c => [norm(c.ID), c])); },
    get ModelVendorsByModelID() { return groupBy(state.modelVendors, 'ModelID'); },
    get PromptModelsByPromptID() { return groupBy(state.promptModels, 'PromptID'); },
    GetConfigurationChain() { return []; },
    GetEffectiveModelConfiguration() { return undefined; },
    HasCredentialBindings(bindingType: string, targetId: string) { return bindingsFor(bindingType, targetId).length > 0; },
    GetCredentialBindingsForTarget(bindingType: string, targetId: string) { return bindingsFor(bindingType, targetId); },
  };

  return {
    state,
    engine,
    logStatus: vi.fn(),
    // The base resolves keys through GetAIAPIKey(driverClass, apiKeys): a caller's key for the class
    // first, then the "environment" key for configured drivers.
    getApiKey: (driverClass: string, apiKeys?: Array<{ driverClass: string; apiKey: string }>): string =>
      apiKeys?.find(k => k.driverClass === driverClass)?.apiKey ?? (state.configuredDrivers.has(driverClass) ? 'env-api-key' : ''),
  };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, AIEngine: { Instance: h.engine } };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, LogStatus: h.logStatus };
});

vi.mock('@memberjunction/ai', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    GetAIAPIKey: (d: string, keys?: Array<{ driverClass: string; apiKey: string }>) => h.getApiKey(d, keys),
  };
});

// A credential resolves to `{ apiKey: '<its name>-value' }`, which the base passes to the driver as JSON.
vi.mock('@memberjunction/credentials', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
  return {
    ...actual,
    CredentialEngine: {
      Instance: {
        Config: vi.fn().mockResolvedValue(undefined),
        get Credentials() { return h.state.credentials; },
        getCredentialById: (id: string) => h.state.credentials.find(c => c.ID === id) ?? null,
        // The runner asks the engine whether a credential is still usable rather than comparing
        // ExpiresAt itself; a credential with no ExpiresAt (or one in the future) is usable.
        GetExpirationStatus: (c: { ExpiresAt: Date | null }) => {
          const expired = c.ExpiresAt != null && new Date(c.ExpiresAt).getTime() < Date.now();
          return {
            status: expired ? 'expired' : 'valid',
            expiresAt: c.ExpiresAt ?? null,
            msUntilExpiration: null,
            daysUntilExpiration: null,
            withinGrace: false,
            usable: !expired,
          };
        },
        getCredential: async (name: string) => ({ values: { apiKey: `${name}-value` } }),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// A controllable image driver
// ---------------------------------------------------------------------------
/** Bytes that must never reach the run row. */
const IMAGE_BYTES_BASE64 = 'SECRET-IMAGE-BYTES-BASE64';
const SOURCE_IMAGE_BASE64 = 'SECRET-SOURCE-IMAGE-BASE64';
const MASK_BASE64 = 'SECRET-MASK-BASE64';

/** A successful result carrying `count` images, with their bytes. */
function ImagesResult(count: number, usage?: ModelUsage): ImageGenerationResult {
  const result = new ImageGenerationResult(true, new Date(), new Date());
  result.images = Array.from({ length: count }, (_, i): GeneratedImage => ({
    data: Buffer.from(IMAGE_BYTES_BASE64),
    base64: IMAGE_BYTES_BASE64,
    format: 'png',
    width: 1024,
    height: 768,
    index: i,
  }));
  result.revisedPrompt = 'A revised prompt';
  result.usage = usage;
  return result;
}

/** A failed result the failover loop may move past. */
function RetriableFailure(message: string): ImageGenerationResult {
  const failed = new ImageGenerationResult(false, new Date(), new Date());
  failed.errorMessage = message;
  failed.errorInfo = { errorType: 'ServiceUnavailable', severity: 'Retriable', canFailover: true };
  return failed;
}

class MockImageDriver extends BaseImageGenerator {
  public GenerateCalls: ImageGenerationParams[] = [];
  public EditCalls: ImageEditParams[] = [];
  /** Decides the result per call from the model API name the runner passed. */
  public Respond: (model: string) => ImageGenerationResult = () => ImagesResult(2);

  constructor() {
    super('test-key');
  }

  public async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    this.GenerateCalls.push(params);
    return this.Respond(params.model ?? '');
  }

  public async EditImage(params: ImageEditParams): Promise<ImageGenerationResult> {
    this.EditCalls.push(params);
    return this.Respond(params.model ?? '');
  }

  public async CreateVariation(_params: ImageVariationParams): Promise<ImageGenerationResult> {
    throw new Error('not used');
  }

  public async GetModels(): Promise<ImageModelInfo[]> {
    return [];
  }

  public async GetSupportedMethods(): Promise<string[]> {
    return ['GenerateImage', 'EditImage'];
  }
}

// ---------------------------------------------------------------------------
// Fake prompt run & provider
// ---------------------------------------------------------------------------
let prSeq = 0;
class FakePromptRun {
  public ID = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public SaveCount = 0;
  [k: string]: unknown;

  public NewRecord(): boolean {
    this.ID = `pr-${++prSeq}`;
    return true;
  }

  public async Save(): Promise<boolean> {
    this.SaveCount++;
    return true;
  }
}

let lastPromptRun: FakePromptRun | null = null;
const fakeProvider = {
  GetEntityObject: vi.fn(async (entityName: string) => {
    if (entityName.includes('AI Prompt Runs')) {
      lastPromptRun = new FakePromptRun();
      return lastPromptRun;
    }
    return null;
  }),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('AIImageGenerationRunner', () => {
  const DRIVER = 'TestImageDriver';
  const PRIMARY_ID = 'image-model-primary';
  const SECONDARY_ID = 'image-model-secondary';
  const PROMPT_ID = 'image-prompt-001';
  const IMAGES_USAGE_TYPE_ID = 'D16F94D1-6200-4A4B-934C-FD827E337E4D';
  const contextUser = { ID: 'user-1', Name: 'Test User' } as UserInfo;

  let runner: AIImageGenerationRunner;
  let driver: MockImageDriver;

  function imageModel(id: string, name: string, apiName: string, vendorId: string, vendorName: string, powerRank: number): Record<string, unknown> {
    const vendor = MakeModelVendor({
      ID: `mv-${id}`, ModelID: id, VendorID: vendorId, Vendor: vendorName, TypeID: VENDOR_TYPE.InferenceProvider,
      DriverClass: DRIVER, APIName: apiName, Priority: 1,
    });
    return {
      ...MakeModel({ ID: id, Name: name, AIModelTypeID: IMAGE_MODEL_TYPE_ID, AIModelType: 'Image Generator', PowerRank: powerRank, ModelVendors: [vendor] }),
    };
  }

  function setupCatalog(): void {
    const catalog = BuildRealisticCatalog();
    h.state.vendorTypeDefinitions = catalog.vendorTypeDefinitions;
    h.state.vendors = catalog.vendors;
    h.state.modelTypes = [...catalog.modelTypes, { ID: IMAGE_MODEL_TYPE_ID, Name: 'Image Generator' }];
    h.state.configurations = catalog.configurations;
    const primary = imageModel(PRIMARY_ID, 'Primary Image Model', 'primary-image-v1', VENDOR.OpenAI, 'OpenAI', 19);
    const secondary = imageModel(SECONDARY_ID, 'Secondary Image Model', 'secondary-image-v1', VENDOR.Google, 'Google', 10);
    // Copied into plain objects: the fixture interfaces have no index signature to widen to a record.
    h.state.models = [...catalog.models.map(m => ({ ...m })), primary, secondary];
    h.state.modelVendors = [
      ...catalog.modelVendors.map(mv => ({ ...mv })),
      ...(primary.ModelVendors as Array<Record<string, unknown>>),
      ...(secondary.ModelVendors as Array<Record<string, unknown>>),
    ];
    h.state.promptModels = [
      { ID: 'pm-1', PromptID: PROMPT_ID, ModelID: PRIMARY_ID, VendorID: VENDOR.OpenAI, Priority: 10, Status: 'Active', ConfigurationID: null },
      { ID: 'pm-2', PromptID: PROMPT_ID, ModelID: SECONDARY_ID, VendorID: VENDOR.Google, Priority: 5, Status: 'Active', ConfigurationID: null },
    ];
    h.state.prompts = [{
      ID: PROMPT_ID,
      Name: 'Default Image Generation',
      Status: 'Active',
      TemplateID: 'tmpl-image-001',
      SelectionStrategy: 'Specific',
      AIModelTypeID: IMAGE_MODEL_TYPE_ID,
      RequireSpecificModels: true,
      FailoverStrategy: 'NextBestModel',
      MaxRetries: 0,
    }];
    h.state.configuredDrivers = new Set([DRIVER]);
    h.state.credentialBindings = [];
    h.state.credentials = [];
  }

  function generationParams(overrides: Partial<AIImageGenerationRunParams> = {}): AIImageGenerationRunParams {
    return { prompt: 'A lighthouse at dusk', n: 2, size: '1024x1024', ContextUser: contextUser, ...overrides };
  }

  function editParams(overrides: Partial<AIImageEditRunParams> = {}): AIImageEditRunParams {
    return {
      prompt: 'Make it a watercolour', image: SOURCE_IMAGE_BASE64, mask: MASK_BASE64, n: 1, ContextUser: contextUser, ...overrides,
    };
  }

  /** Every string the run row holds, for the no-bytes check. */
  function rowStrings(): string {
    return Object.values(lastPromptRun ?? {}).filter((v): v is string => typeof v === 'string').join('\n');
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    setupCatalog();
    lastPromptRun = null;
    driver = new MockImageDriver();
    vi.spyOn(AIEngineBase.Instance, 'EnsureLoaded').mockResolvedValue(undefined);
    vi.spyOn(AIEngineBase.Instance, 'UsageTypes', 'get').mockReturnValue(
      [{ ID: IMAGES_USAGE_TYPE_ID, Name: 'Images' }] as unknown as MJAIUsageTypeEntity[]
    );
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(
      (_baseClass: unknown, driverClass: string | null = null) => (driverClass === DRIVER ? driver : null)
    );
    runner = new AIImageGenerationRunner();
    runner.Provider = fakeProvider as unknown as IMetadataProvider;
  });

  describe('RunImageGeneration', () => {
    it('generates on the top-priority model and records the run', async () => {
      const result = await runner.RunImageGeneration(generationParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(result.Success).toBe(true);
      expect(result.ImageResult?.images).toHaveLength(2);
      expect(result.ModelID).toBe(PRIMARY_ID);
      expect(result.ModelName).toBe('Primary Image Model');
      expect(result.DriverClass).toBe(DRIVER);
      expect(result.PromptRunID).toBe(lastPromptRun?.ID);
      expect(result.ExecutionTimeMS).toBeGreaterThanOrEqual(0);

      expect(driver.GenerateCalls).toHaveLength(1);
      const sent = driver.GenerateCalls[0];
      expect(sent.model).toBe('primary-image-v1');
      expect(sent.prompt).toBe('A lighthouse at dusk');
      expect(sent.n).toBe(2);
      expect(sent.size).toBe('1024x1024');
      // The driver never sees the runner's own fields.
      expect(Object.keys(sent)).not.toContain('ContextUser');
      expect(Object.keys(sent)).not.toContain('APIKeys');

      expect(lastPromptRun?.PromptID).toBe(PROMPT_ID);
      expect(lastPromptRun?.Success).toBe(true);
      expect(lastPromptRun?.Status).toBe('Completed');
      expect(JSON.parse(String(lastPromptRun?.Messages))).toEqual({ Operation: 'Generate', Prompt: 'A lighthouse at dusk', ImageCount: 2 });
      expect(JSON.parse(String(lastPromptRun?.Result))).toEqual({
        ImageCount: 2,
        Images: [{ Width: 1024, Height: 768, Format: 'png' }, { Width: 1024, Height: 768, Format: 'png' }],
        RevisedPrompt: 'A revised prompt',
      });
    });

    it('with no usage from the driver, records the images returned as Images output units, so Per Image pricing applies; it sets no cost itself', async () => {
      driver.Respond = () => ImagesResult(3);

      await runner.RunImageGeneration(generationParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(lastPromptRun?.UsageTypeID).toBe(IMAGES_USAGE_TYPE_ID);
      expect(lastPromptRun?.OutputUnitsUsed).toBe(3);
      expect(lastPromptRun?.InputUnitsUsed).toBe(0);
      expect(lastPromptRun?.TokensUsed).toBeUndefined();
      expect(lastPromptRun?.Cost).toBeUndefined();
    });

    it('a call that returns no images records no usage', async () => {
      driver.Respond = () => ImagesResult(0);

      await runner.RunImageGeneration(generationParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(lastPromptRun?.UsageTypeID).toBeUndefined();
      expect(lastPromptRun?.OutputUnitsUsed).toBeUndefined();
    });

    it("the driver's own units are recorded as reported, not replaced by the image count", async () => {
      driver.Respond = () => ImagesResult(2, ModelUsage.ForMedia('Images', 1, 4));

      await runner.RunImageGeneration(generationParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(lastPromptRun?.UsageTypeID).toBe(IMAGES_USAGE_TYPE_ID);
      expect(lastPromptRun?.InputUnitsUsed).toBe(1);
      expect(lastPromptRun?.OutputUnitsUsed).toBe(4);
      expect(lastPromptRun?.Cost).toBeUndefined();
    });

    it("a driver that reports tokens keeps its own measure: no image count is added", async () => {
      driver.Respond = () => ImagesResult(2, new ModelUsage(120, 4000));

      await runner.RunImageGeneration(generationParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(lastPromptRun?.TokensPrompt).toBe(120);
      expect(lastPromptRun?.TokensCompletion).toBe(4000);
      expect(lastPromptRun?.UsageTypeID).toBeUndefined();
      expect(lastPromptRun?.OutputUnitsUsed).toBeUndefined();
    });

    it('records the parent run and the agent run', async () => {
      await runner.RunImageGeneration(generationParams({ ParentRunID: 'parent-run-1', AgentRunID: 'agent-run-1' }));
      await runner.WaitForPendingPromptRunSaves();

      expect(lastPromptRun?.ParentID).toBe('parent-run-1');
      expect(JSON.parse(String(lastPromptRun?.Messages)).AgentRunID).toBe('agent-run-1');
    });

    it('records the agent as AgentID, and hands the row ID to OnPromptRunCreated before the model call', async () => {
      const createdBeforeCall: Array<{ ID: string; DriverCalls: number }> = [];
      const onCreated = (promptRunId: string): void => {
        createdBeforeCall.push({ ID: promptRunId, DriverCalls: driver.GenerateCalls.length });
      };

      const result = await runner.RunImageGeneration(generationParams({ AgentID: 'agent-1', OnPromptRunCreated: onCreated }));
      await runner.WaitForPendingPromptRunSaves();

      expect(lastPromptRun?.AgentID).toBe('agent-1');
      expect(createdBeforeCall).toEqual([{ ID: result.PromptRunID, DriverCalls: 0 }]);
      expect(Object.keys(driver.GenerateCalls[0])).not.toContain('AgentID');
      expect(Object.keys(driver.GenerateCalls[0])).not.toContain('OnPromptRunCreated');
    });

    it('rejects an empty prompt without throwing or creating a run', async () => {
      const result = await runner.RunImageGeneration(generationParams({ prompt: '  ' }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/prompt text is required/i);
      expect(lastPromptRun).toBeNull();
    });

    it('fails clearly when the default carrier prompt is missing', async () => {
      h.state.prompts = [];

      const result = await runner.RunImageGeneration(generationParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/'Default Image Generation' prompt was not found/);
      expect(driver.GenerateCalls).toHaveLength(0);
    });

    it('uses the prompt named by PromptID instead of the default', async () => {
      h.state.prompts[0].Name = 'Some Other Image Prompt';

      const result = await runner.RunImageGeneration(generationParams({ PromptID: PROMPT_ID }));

      expect(result.Success).toBe(true);
      expect(lastPromptRun?.PromptID).toBe(PROMPT_ID);
    });
  });

  describe('RunImageEdit', () => {
    it('edits through the driver with the source image and mask', async () => {
      const result = await runner.RunImageEdit(editParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(result.Success).toBe(true);
      expect(driver.EditCalls).toHaveLength(1);
      expect(driver.GenerateCalls).toHaveLength(0);
      const sent = driver.EditCalls[0];
      expect(sent.model).toBe('primary-image-v1');
      expect(sent.image).toBe(SOURCE_IMAGE_BASE64);
      expect(sent.mask).toBe(MASK_BASE64);
      expect(JSON.parse(String(lastPromptRun?.Messages))).toEqual({ Operation: 'Edit', Prompt: 'Make it a watercolour', ImageCount: 1 });
      expect(lastPromptRun?.Status).toBe('Completed');
    });

    it('rejects an edit with no source image', async () => {
      const result = await runner.RunImageEdit(editParams({ image: '' }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/source image is required/i);
      expect(driver.EditCalls).toHaveLength(0);
    });
  });

  it('never stores image bytes, the source image or the mask in the run row', async () => {
    await runner.RunImageGeneration(generationParams());
    await runner.WaitForPendingPromptRunSaves();
    const generationRow = rowStrings();

    await runner.RunImageEdit(editParams());
    await runner.WaitForPendingPromptRunSaves();
    const editRow = rowStrings();

    for (const row of [generationRow, editRow]) {
      expect(row).not.toContain(IMAGE_BYTES_BASE64);
      expect(row).not.toContain(SOURCE_IMAGE_BASE64);
      expect(row).not.toContain(MASK_BASE64);
    }
  });

  it('ModelID pins the model, over the prompt bindings', async () => {
    const result = await runner.RunImageGeneration(generationParams({ ModelID: SECONDARY_ID }));

    expect(result.Success).toBe(true);
    expect(result.ModelID).toBe(SECONDARY_ID);
    expect(driver.GenerateCalls.map(c => c.model)).toEqual(['secondary-image-v1']);
  });

  it('a ModelID of another model type is refused', async () => {
    const llm = h.state.models.find(m => m.AIModelTypeID === MODEL_TYPE.LLM && m.IsActive);

    const result = await runner.RunImageGeneration(generationParams({ ModelID: String(llm?.ID) }));

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toMatch(/this runner requires "Image Generator"/);
    expect(driver.GenerateCalls).toHaveLength(0);
  });

  describe('failover', () => {
    it('fails over after a Retriable failure, and the result names the model that answered', async () => {
      driver.Respond = (model) => (model === 'primary-image-v1' ? RetriableFailure('503 upstream unavailable') : ImagesResult(1));

      const result = await runner.RunImageGeneration(generationParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(driver.GenerateCalls.map(c => c.model)).toEqual(['primary-image-v1', 'secondary-image-v1']);
      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(SECONDARY_ID);
      expect(result.ModelName).toBe('Secondary Image Model');
      expect(lastPromptRun?.ModelID).toBe(SECONDARY_ID);
      expect(lastPromptRun?.FailoverAttempts).toBe(1);
    });

    it("the runner's own per-candidate failure is Retriable, so it fails over too", async () => {
      // The primary's driver class is not registered; the secondary's is.
      const primary = h.state.models.find(m => m.ID === PRIMARY_ID);
      (primary?.ModelVendors as Array<Record<string, unknown>>)[0].DriverClass = 'UnregisteredImageDriver';
      h.state.configuredDrivers.add('UnregisteredImageDriver');

      const result = await runner.RunImageGeneration(generationParams());

      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(SECONDARY_ID);
      expect(result.DriverClass).toBe(DRIVER);
    });

    it("a driver that throws gets the vendor's error classification, not a generic one", async () => {
      h.state.prompts[0].FailoverStrategy = 'None';
      driver.Respond = () => {
        throw Object.assign(new Error('Your request was rejected by the safety system'), { status: 400 });
      };

      const result = await runner.RunImageGeneration(generationParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('Your request was rejected by the safety system');
      expect(result.ImageResult?.errorInfo).toMatchObject({
        errorType: 'InvalidRequest',
        severity: 'Fatal',
        httpStatusCode: 400,
        context: { provider: 'OpenAI' },
      });
    });

    it('a thrown fatal error stops failover, and a thrown retriable one fails over', async () => {
      driver.Respond = (model) => {
        if (model === 'primary-image-v1') {
          throw Object.assign(new Error('Your request was rejected by the safety system'), { status: 400 });
        }
        return ImagesResult(1);
      };
      const fatal = await runner.RunImageGeneration(generationParams());
      const fatalCalls = driver.GenerateCalls.map(c => c.model);

      driver.GenerateCalls = [];
      driver.Respond = (model) => {
        if (model === 'primary-image-v1') {
          throw Object.assign(new Error('503 Service Unavailable'), { status: 503 });
        }
        return ImagesResult(1);
      };
      const retriable = await runner.RunImageGeneration(generationParams());

      expect(fatal.Success).toBe(false);
      expect(fatalCalls).toEqual(['primary-image-v1']);
      expect(retriable.Success).toBe(true);
      expect(retriable.ModelID).toBe(SECONDARY_ID);
      expect(driver.GenerateCalls.map(c => c.model)).toEqual(['primary-image-v1', 'secondary-image-v1']);
    });

    it('returns the last failure when every candidate fails', async () => {
      driver.Respond = () => RetriableFailure('503 upstream unavailable');

      const result = await runner.RunImageGeneration(generationParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('503 upstream unavailable');
      expect(lastPromptRun?.Success).toBe(false);
      expect(lastPromptRun?.Status).toBe('Failed');
    });
  });

  describe('credentials', () => {
    it('fails without a run when no candidate has a credential', async () => {
      h.state.configuredDrivers.clear();

      const result = await runner.RunImageGeneration(generationParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/No Image Generator model has credentials available/);
      expect(driver.GenerateCalls).toHaveLength(0);
      expect(lastPromptRun).toBeNull();
    });

    it('passes CredentialScope through to the base runner params', () => {
      // Dropped here, a RuntimeOnly image run would gate and resolve credentials as 'Any' and spend platform keys.
      const prompt = { ID: 'image-prompt', Name: 'Image Prompt' } as unknown as MJAIPromptEntityExtended;
      const build = (runner as unknown as {
        buildPromptParams(params: AIImageGenerationRunParams, prompt: MJAIPromptEntityExtended): AIPromptParams;
      }).buildPromptParams.bind(runner);
      const apiKeys = [{ driverClass: DRIVER, apiKey: 'caller-key' }];

      const scoped = build(generationParams({ APIKeys: apiKeys, CredentialScope: 'RuntimeOnly' }), prompt);
      expect(scoped.CredentialScope).toBe('RuntimeOnly');
      expect(scoped.apiKeys).toBe(apiKeys);
      expect(scoped.prompt).toBe(prompt);

      expect(build(generationParams(), prompt).CredentialScope).toBeUndefined();
    });

    it('passes APIKeys through as the base runner apiKeys', async () => {
      h.state.configuredDrivers.clear();

      const result = await runner.RunImageGeneration(generationParams({ APIKeys: [{ driverClass: DRIVER, apiKey: 'caller-key' }] }));

      expect(result.Success).toBe(true);
      expect(MJGlobal.Instance.ClassFactory.CreateInstance).toHaveBeenCalledWith(BaseImageGenerator, DRIVER, 'caller-key');
    });

    const API_KEY_TYPE_ID = 'credential-type-api-key';
    const orgCredential = { ID: 'cred-org-openai', Name: 'Org OpenAI Key', IsActive: true, CredentialTypeID: API_KEY_TYPE_ID, ExpiresAt: null };

    it.each([
      {
        source: 'a Vendor credential binding',
        arrange: (): void => {
          h.state.credentials = [{ ...orgCredential, IsDefault: false }];
          h.state.credentialBindings = [{ BindingType: 'Vendor', TargetID: VENDOR.OpenAI, CredentialID: orgCredential.ID, Priority: 1 }];
        },
      },
      {
        source: "a default credential of the vendor's credential type",
        arrange: (): void => {
          h.state.credentials = [{ ...orgCredential, IsDefault: true }];
          const openAI = h.state.vendors.find(v => v.ID === VENDOR.OpenAI);
          if (openAI) {
            openAI.CredentialTypeID = API_KEY_TYPE_ID;
          }
        },
      },
    ])("$source wins over the caller's APIKeys, as it does for chat prompts", async ({ arrange }) => {
      arrange();

      const result = await runner.RunImageGeneration(generationParams({ APIKeys: [{ driverClass: DRIVER, apiKey: 'caller-key' }] }));

      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(PRIMARY_ID);
      expect(MJGlobal.Instance.ClassFactory.CreateInstance).toHaveBeenCalledWith(
        BaseImageGenerator, DRIVER, JSON.stringify({ apiKey: 'Org OpenAI Key-value' })
      );
      expect(MJGlobal.Instance.ClassFactory.CreateInstance).not.toHaveBeenCalledWith(BaseImageGenerator, DRIVER, 'caller-key');
    });
  });

  it('an exception after the run row is created finalizes the row as failed', async () => {
    h.state.prompts[0].FailoverStrategy = 'None';
    vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockImplementation(() => {
      throw new Error('factory exploded');
    });

    const result = await runner.RunImageGeneration(generationParams());
    await runner.WaitForPendingPromptRunSaves();

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBe('factory exploded');
    expect(result.PromptRunID).toBe(lastPromptRun?.ID);
    expect(lastPromptRun?.Success).toBe(false);
    expect(lastPromptRun?.Status).toBe('Failed');
    expect(lastPromptRun?.ErrorMessage).toBe('factory exploded');
  });
});
