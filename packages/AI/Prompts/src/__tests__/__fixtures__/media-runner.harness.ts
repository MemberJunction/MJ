/**
 * Shared fakes for the media runner tests (text-to-speech, speech-to-text, video).
 *
 * The test files' `vi.mock` factories load this module with `vi.importActual`, so it must import
 * nothing a test mocks: it imports only types. The fakes read one mutable state object, reset per
 * test with {@link MediaRunnerHarness.Reset}.
 */
import type { FxModel, FxModelVendor, FxPromptModel, FxVendor } from '@memberjunction/unit-testing';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

/** The prompt fields the runners read. Value-list fields are typed from the entity so they cannot drift. */
export interface FakePrompt {
  ID: string;
  Name: string;
  Status: MJAIPromptEntityExtended['Status'];
  TemplateID: string;
  AIModelTypeID: string | null;
  SelectionStrategy: MJAIPromptEntityExtended['SelectionStrategy'];
  FailoverStrategy: MJAIPromptEntityExtended['FailoverStrategy'];
  RequireSpecificModels: boolean;
  MaxRetries: number;
}

/** The `MJ: AI Prompt Runs` fields the tests read back. */
export interface RecordedRun {
  ID: string;
  PromptID?: string;
  ModelID?: string;
  VendorID?: string;
  AgentID?: string;
  ParentID?: string;
  Status?: string;
  Success?: boolean;
  Messages?: string;
  Result?: string;
  ErrorMessage?: string;
  TokensUsed?: number;
  UsageTypeID?: string | null;
  InputUnitsUsed?: number | null;
  OutputUnitsUsed?: number | null;
  Cost?: number;
  FailoverAttempts?: number;
  SaveCount: number;
}

/** A named row: a vendor type, a model type or a usage type. */
interface NamedRow {
  ID: string;
  Name: string;
}

/** Everything the fakes serve. */
export interface MediaHarnessState {
  vendorTypeDefinitions: NamedRow[];
  vendors: FxVendor[];
  modelTypes: NamedRow[];
  models: FxModel[];
  modelVendors: FxModelVendor[];
  promptModels: FxPromptModel[];
  prompts: FakePrompt[];
  /** Driver classes with an "environment" key. */
  configuredDrivers: Set<string>;
  usageTypes: NamedRow[];
  /** Every run row created, in order. */
  runs: RecordedRun[];
}

function emptyState(): MediaHarnessState {
  return {
    vendorTypeDefinitions: [],
    vendors: [],
    modelTypes: [],
    models: [],
    modelVendors: [],
    promptModels: [],
    prompts: [],
    configuredDrivers: new Set<string>(),
    usageTypes: [],
    runs: [],
  };
}

const norm = (s: string | null | undefined): string => (s == null ? '' : s.trim().toLowerCase());

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = norm(key(row));
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return map;
}

/** Stands in for an `MJ: AI Prompt Runs` entity; the base runner sets more fields than these at runtime. */
class FakePromptRun implements RecordedRun {
  private static seq = 0;
  public ID = '';
  public SaveCount = 0;
  public LatestResult: { CompleteMessage: string } | null = null;

  constructor(private readonly state: () => MediaHarnessState) {}

  public NewRecord(): boolean {
    this.ID = `media-run-${++FakePromptRun.seq}`;
    this.state().runs.push(this);
    return true;
  }

  public async Save(): Promise<boolean> {
    this.SaveCount++;
    return true;
  }
}

/** A key the harness's `GetAIAPIKey` stand-in accepts. */
interface ApiKeyEntry {
  driverClass: string;
  apiKey: string;
}

/** The fakes the test files install through `vi.mock`. */
export class MediaRunnerHarness {
  public State: MediaHarnessState = emptyState();

  /** Stands in for `AIEngine.Instance`. */
  public readonly Engine = this.createEngine();

  /** Stands in for `AIEngineBase.Instance`, which the usage recording reads. */
  public readonly EngineBase = this.createEngineBase();

  /** Stands in for `Metadata.Provider`: every run row comes from here. */
  public readonly Provider = {
    GetEntityObject: async (entityName: string): Promise<FakePromptRun | null> =>
      entityName === 'MJ: AI Prompt Runs' ? new FakePromptRun(() => this.State) : null,
  };

  /** Stands in for `CredentialEngine.Instance`: no credentials, so keys come from `GetAPIKey`. */
  public readonly CredentialEngine = {
    Config: async (): Promise<void> => undefined,
    Credentials: [],
    getCredentialById: (): null => null,
    getCredential: async (): Promise<{ values: Record<string, string> }> => ({ values: {} }),
  };

  /** Stands in for `GetAIAPIKey`: the caller's key for the driver class, else the "environment" key. */
  public GetAPIKey(driverClass: string, apiKeys?: ApiKeyEntry[]): string {
    const callerKey = apiKeys?.find(k => k.driverClass === driverClass)?.apiKey;
    return callerKey ?? (this.State.configuredDrivers.has(driverClass) ? 'env-api-key' : '');
  }

  /** Clears the state for the next test. */
  public Reset(): void {
    this.State = emptyState();
  }

  /** The last run row created. */
  public get LastRun(): RecordedRun | undefined {
    return this.State.runs[this.State.runs.length - 1];
  }

  private createEngine() {
    const state = (): MediaHarnessState => this.State;
    return {
      Config: async (): Promise<void> => undefined,
      get VendorTypeDefinitions() { return state().vendorTypeDefinitions; },
      get Vendors() { return state().vendors; },
      get ModelTypes() { return state().modelTypes; },
      get Configurations() { return []; },
      get Models() { return state().models; },
      get ModelVendors() { return state().modelVendors; },
      get PromptModels() { return state().promptModels; },
      get Prompts() { return state().prompts; },
      IsInferenceProvider(mv: { TypeID?: string }): boolean {
        const inference = state().vendorTypeDefinitions.find(v => v.Name === 'Inference Provider')?.ID;
        return inference ? norm(mv?.TypeID) === norm(inference) : true;
      },
      get ModelsByID() { return new Map(state().models.map(m => [norm(m.ID), m])); },
      get VendorsByID() { return new Map(state().vendors.map(v => [norm(v.ID), v])); },
      get ModelTypesByID() { return new Map(state().modelTypes.map(t => [norm(t.ID), t])); },
      get ModelVendorsByModelID() { return groupBy(state().modelVendors, mv => mv.ModelID); },
      get PromptModelsByPromptID() { return groupBy(state().promptModels, pm => pm.PromptID); },
      GetConfigurationChain(): never[] { return []; },
      GetEffectiveModelConfiguration(): undefined { return undefined; },
      HasCredentialBindings(): boolean { return false; },
      GetCredentialBindingsForTarget(): never[] { return []; },
    };
  }

  private createEngineBase() {
    const state = (): MediaHarnessState => this.State;
    return {
      get UsageTypes() { return state().usageTypes; },
    };
  }
}

/** The one harness every mock factory and test in a file share. */
export const MediaHarness = new MediaRunnerHarness();
