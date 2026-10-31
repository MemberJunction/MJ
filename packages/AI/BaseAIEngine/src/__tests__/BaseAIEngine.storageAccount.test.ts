/**
 * AIEngineBase.ResolveAgentStorageAccountID — the golden path for "which storage account do this agent's
 * files go to?". Pins the resolution chain (override → agent → category tree → agent type → system
 * fallback) and the once-per-agent warning when the system fallback had to choose among several
 * active accounts. The fallback's own ordering rules are covered by FileStorageEngineBase's tests in
 * MJCoreEntities; here FileStorageEngineBase.ResolveDefaultAccount is stubbed.
 * Module mocks mirror BaseAIEngine.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  logStatus: vi.fn(),
  resolveDefaultAccount: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    RegisterClass: () => () => {},
  };
});

vi.mock('@memberjunction/templates-base-types', () => ({
  TemplateEngineBase: {
    Instance: { Config: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock('@memberjunction/core', () => {
  // Lightweight BaseEngine stub that stores properties directly
  class MockBaseEngine {
    protected _loaded = false;
    private _contextUser: unknown = null;
    private _isPermissionConstrained = false;
    get Loaded() {
      return this._loaded;
    }
    get ContextUser() {
      return this._contextUser;
    }
    get IsPermissionConstrained() {
      return this._isPermissionConstrained;
    }
    protected GetConfigData<E>(propertyName: string): E[] {
      // Mirrors real BaseEngine.GetConfigData — returns the backing field array
      return ((this as Record<string, unknown>)[propertyName] as E[]) ?? [];
    }
    async Load(_params: unknown[], _provider?: unknown, _forceRefresh?: boolean, contextUser?: unknown) {
      this._contextUser = contextUser;
      this._loaded = true;
    }
    static _instance: unknown = undefined;
    static getInstance<U>(): U {
      if (!this._instance) {
        this._instance = new this();
      }
      return this._instance as U;
    }
  }
  return {
    BaseEngine: MockBaseEngine,
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    LogError: vi.fn(),
    LogStatus: storageMocks.logStatus,
    Metadata: class {
      GetEntityObject = vi.fn();
      // The conditional realtime-registry datasets probe Metadata.Provider.EntityByName
      // before registering (clean-install CodeGen bootstrap guard). Default: the
      // channels entity exists, so the dataset registers in tests.
      static Provider = {
        EntityByName: (name: string) => (name === 'MJ: AI Agent Channels' || name === 'MJ: AI Agent Co Agents' ? { Name: name } : undefined),
      };
    },
    RunView: class {
      RunView = vi.fn();
    },
    UserInfo: class {
      ID = 'u1';
      Name = 'T';
    },
    RegisterForStartup: () => () => {},
    IStartupSink: class {},
  };
});

vi.mock('@memberjunction/core-entities', () => {
  const cls = () =>
    class {
      ID = '';
      Name = '';
    };
  return {
    ArtifactMetadataEngine: {
      Instance: { ArtifactTypes: [], Config: vi.fn().mockResolvedValue(undefined) },
    },
    MJAIActionEntity: cls(),
    MJAIAgentActionEntity: cls(),
    MJAIAgentNoteEntity: cls(),
    MJAIAgentNoteTypeEntity: cls(),
    MJAIModelActionEntity: cls(),
    MJAIPromptModelEntity: cls(),
    MJAIPromptTypeEntity: cls(),
    MJAIResultCacheEntity: cls(),
    MJAIVendorTypeDefinitionEntity: cls(),
    MJArtifactTypeEntity: cls(),
    MJEntityAIActionEntity: cls(),
    MJVectorDatabaseEntity: cls(),
    MJAIAgentPromptEntity: cls(),
    MJAIAgentTypeEntity: cls(),
    MJAIVendorEntity: cls(),
    MJAIModelVendorEntity: cls(),
    MJAIModelTypeEntity: cls(),
    MJAIModelCostEntity: cls(),
    MJAIModelPriceTypeEntity: cls(),
    MJAIModelPriceUnitTypeEntity: cls(),
    MJAIConfigurationEntity: cls(),
    MJAIConfigurationParamEntity: cls(),
    MJAIAgentStepEntity: cls(),
    MJAIAgentStepPathEntity: cls(),
    MJAIAgentRelationshipEntity: cls(),
    MJAIAgentPermissionEntity: cls(),
    MJAIAgentDataSourceEntity: cls(),
    MJAIAgentConfigurationEntity: cls(),
    MJAIAgentExampleEntity: cls(),
    MJAICredentialBindingEntity: cls(),
    MJAIModalityEntity: cls(),
    MJAIAgentModalityEntity: cls(),
    MJAIModelModalityEntity: cls(),
    MJAIPersonaEntity: cls(),
    MJAIPersonaVendorEntity: cls(),
    MJAIModelPersonaEntity: cls(),
    MJAIAgentPersonaEntity: cls(),
    MJCredentialEntity: cls(),
    MJAIAgentEntity: cls(),
    FileStorageEngineBase: { Instance: { ResolveDefaultAccount: storageMocks.resolveDefaultAccount } },
  };
});

vi.mock('@memberjunction/ai-core-plus', () => ({
  MJAIPromptEntityExtended: class {
    ID = '';
    Name = '';
    CategoryID = '';
  },
  MJAIPromptCategoryEntityExtended: class {
    ID = '';
    Name = '';
    Prompts: unknown[] = [];
  },
  MJAIModelEntityExtended: class {
    ID = '';
    Name = '';
    AIModelType = '';
    AIModelTypeID = '';
    Vendor = '';
    PowerRank = 0;
    IsActive = true;
    InheritTypeModalities = true;
    ModelVendors: unknown[] = [];
  },
  MJAIAgentEntityExtended: class {
    ID = '';
    Name = '';
    Status = 'Active';
    ParentID: string | null = null;
    OwnerUserID = '';
    Actions: unknown[] = [];
    Notes: unknown[] = [];
  },
}));

vi.mock('../AIAgentPermissionHelper', () => ({
  AIAgentPermissionHelper: {
    HasPermission: vi.fn().mockResolvedValue(true),
    GetEffectivePermissions: vi.fn().mockResolvedValue({
      canView: true,
      canRun: true,
      canEdit: true,
      canDelete: true,
      isOwner: true,
    }),
    GetAccessibleAgents: vi.fn().mockResolvedValue([]),
    ClearCache: vi.fn(),
    RefreshCache: vi.fn().mockResolvedValue(undefined),
  },
  EffectiveAgentPermissions: class {},
}));

import { AIEngineBase } from '../BaseAIEngine';

const DROPBOX_ID = '636E204B-12CB-4D67-A861-09DA9C825BA3';
const BOX_ID = 'F3000001-0000-4000-8000-000000000002';
const CONFIGURED_ID = 'AAAAAAAA-0000-4000-8000-000000000001';

type AgentArg = Parameters<AIEngineBase['ResolveAgentStorageAccountID']>[0];

function agent(overrides: Partial<AgentArg> = {}): AgentArg {
  return { ID: 'agent-1', Name: 'Skip', TypeID: null, CategoryID: null, DefaultStorageAccountID: null, ...overrides } as AgentArg;
}

function candidate(id: string, name: string, providerName: string) {
  return { account: { ID: id, Name: name }, provider: { Name: providerName, IsActive: true } };
}

/** Two active accounts, Dropbox chosen — the ambiguous fallback. */
function ambiguous() {
  const candidates = [candidate(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox'), candidate(BOX_ID, 'Collaboration Box', 'Box.com')];
  return { Chosen: candidates[0], Candidates: candidates, Ambiguous: true };
}

function set(field: string, value: unknown): void {
  (AIEngineBase.Instance as unknown as Record<string, unknown>)[field] = value;
}

describe('AIEngineBase.ResolveAgentStorageAccountID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AIEngineBase as unknown as { _instance: unknown })._instance = undefined;
    set('_agentTypes', []);
    set('_agentCategories', []);
    storageMocks.resolveDefaultAccount.mockReturnValue(ambiguous());
  });

  it('a runtime override wins outright', () => {
    expect(AIEngineBase.Instance.ResolveAgentStorageAccountID(agent({ DefaultStorageAccountID: 'agent-acct' }), CONFIGURED_ID)).toBe(CONFIGURED_ID);
    expect(storageMocks.resolveDefaultAccount).not.toHaveBeenCalled();
  });

  it('uses the agent-level default before anything else', () => {
    expect(AIEngineBase.Instance.ResolveAgentStorageAccountID(agent({ DefaultStorageAccountID: CONFIGURED_ID }))).toBe(CONFIGURED_ID);
    expect(storageMocks.logStatus).not.toHaveBeenCalled();
  });

  it('walks up the category tree to the first category with a default', () => {
    set('_agentCategories', [
      { ID: 'cat-child', Name: 'Child', ParentID: 'cat-parent', DefaultStorageAccountID: null },
      { ID: 'cat-parent', Name: 'Parent', ParentID: null, DefaultStorageAccountID: CONFIGURED_ID },
    ]);
    expect(AIEngineBase.Instance.ResolveAgentStorageAccountID(agent({ CategoryID: 'cat-child' }))).toBe(CONFIGURED_ID);
  });

  it('survives a category cycle and falls through to the next level', () => {
    set('_agentCategories', [
      { ID: 'cat-a', Name: 'A', ParentID: 'cat-b', DefaultStorageAccountID: null },
      { ID: 'cat-b', Name: 'B', ParentID: 'cat-a', DefaultStorageAccountID: null },
    ]);
    expect(AIEngineBase.Instance.ResolveAgentStorageAccountID(agent({ CategoryID: 'cat-a' }))).toBe(DROPBOX_ID);
  });

  it('uses the agent type default when agent and category have none', () => {
    set('_agentTypes', [{ ID: 'type-loop', Name: 'Loop', DefaultStorageAccountID: CONFIGURED_ID }]);
    expect(AIEngineBase.Instance.ResolveAgentStorageAccountID(agent({ TypeID: 'type-loop' }))).toBe(CONFIGURED_ID);
    expect(storageMocks.logStatus).not.toHaveBeenCalled();
  });

  it('falls back to the system choice instead of throwing when several accounts are active', () => {
    expect(AIEngineBase.Instance.ResolveAgentStorageAccountID(agent())).toBe(DROPBOX_ID);
  });

  it('warns naming every candidate, the choice, the agent/category/type, and where to set a default', () => {
    set('_agentTypes', [{ ID: 'type-loop', Name: 'Loop', DefaultStorageAccountID: null }]);
    set('_agentCategories', [{ ID: 'cat-a', Name: 'Assistant', ParentID: null, DefaultStorageAccountID: null }]);
    AIEngineBase.Instance.ResolveAgentStorageAccountID(agent({ TypeID: 'type-loop', CategoryID: 'cat-a' }));
    expect(storageMocks.logStatus).toHaveBeenCalledTimes(1);
    const message = String(storageMocks.logStatus.mock.calls[0][0]);
    expect(message).toContain("'More Cheese Dropbox' (Dropbox)");
    expect(message).toContain("'Collaboration Box' (Box.com)");
    expect(message).toContain("Using 'More Cheese Dropbox'");
    expect(message).toContain("agent 'Skip'");
    expect(message).toContain("category 'Assistant'");
    expect(message).toContain("agent type 'Loop'");
    expect(message).toContain('DefaultStorageAccountID');
  });

  it('warns once per agent per process, not on every run', () => {
    const engine = AIEngineBase.Instance;
    engine.ResolveAgentStorageAccountID(agent());
    engine.ResolveAgentStorageAccountID(agent());
    engine.ResolveAgentStorageAccountID(agent({ ID: 'agent-2', Name: 'Sage' }));
    expect(storageMocks.logStatus).toHaveBeenCalledTimes(2);
  });

  it('does not warn when the fallback had a single account', () => {
    const only = candidate(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox');
    storageMocks.resolveDefaultAccount.mockReturnValue({ Chosen: only, Candidates: [only], Ambiguous: false });
    expect(AIEngineBase.Instance.ResolveAgentStorageAccountID(agent())).toBe(DROPBOX_ID);
    expect(storageMocks.logStatus).not.toHaveBeenCalled();
  });

  it('returns null when no account is active', () => {
    storageMocks.resolveDefaultAccount.mockReturnValue({ Chosen: null, Candidates: [], Ambiguous: false });
    expect(AIEngineBase.Instance.ResolveAgentStorageAccountID(agent())).toBeNull();
  });
});

describe('AIEngineBase.ResolveAgentStorageAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AIEngineBase as unknown as { _instance: unknown })._instance = undefined;
    set('_agentTypes', []);
    set('_agentCategories', []);
    storageMocks.resolveDefaultAccount.mockReturnValue(ambiguous());
  });

  it('reports Source = Override when a runtime override is supplied', () => {
    expect(AIEngineBase.Instance.ResolveAgentStorageAccount(agent({ DefaultStorageAccountID: 'agent-acct' }), CONFIGURED_ID)).toEqual({
      AccountID: CONFIGURED_ID,
      Source: 'Override',
      Ambiguous: false,
    });
    expect(storageMocks.resolveDefaultAccount).not.toHaveBeenCalled();
  });

  it('reports Source = Agent when the agent itself defines DefaultStorageAccountID', () => {
    expect(AIEngineBase.Instance.ResolveAgentStorageAccount(agent({ DefaultStorageAccountID: CONFIGURED_ID }))).toEqual({
      AccountID: CONFIGURED_ID,
      Source: 'Agent',
      Ambiguous: false,
    });
  });

  it('reports Source = Category when an ancestor category defines DefaultStorageAccountID', () => {
    set('_agentCategories', [
      { ID: 'cat-child', Name: 'Child', ParentID: 'cat-parent', DefaultStorageAccountID: null },
      { ID: 'cat-parent', Name: 'Parent', ParentID: null, DefaultStorageAccountID: CONFIGURED_ID },
    ]);
    expect(AIEngineBase.Instance.ResolveAgentStorageAccount(agent({ CategoryID: 'cat-child' }))).toEqual({
      AccountID: CONFIGURED_ID,
      Source: 'Category',
      Ambiguous: false,
    });
  });

  it('reports Source = AgentType when the agent type defines DefaultStorageAccountID', () => {
    set('_agentTypes', [{ ID: 'type-loop', Name: 'Loop', DefaultStorageAccountID: CONFIGURED_ID }]);
    expect(AIEngineBase.Instance.ResolveAgentStorageAccount(agent({ TypeID: 'type-loop' }))).toEqual({
      AccountID: CONFIGURED_ID,
      Source: 'AgentType',
      Ambiguous: false,
    });
  });

  it('reports Source = Fallback with Ambiguous = false when a single active account is chosen', () => {
    const only = candidate(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox');
    storageMocks.resolveDefaultAccount.mockReturnValue({ Chosen: only, Candidates: [only], Ambiguous: false });
    expect(AIEngineBase.Instance.ResolveAgentStorageAccount(agent())).toEqual({
      AccountID: DROPBOX_ID,
      Source: 'Fallback',
      Ambiguous: false,
    });
  });

  it('reports Source = Fallback with Ambiguous = true when multiple active accounts exist', () => {
    expect(AIEngineBase.Instance.ResolveAgentStorageAccount(agent())).toEqual({
      AccountID: DROPBOX_ID,
      Source: 'Fallback',
      Ambiguous: true,
    });
  });

  it('reports Source = None with AccountID = null when no account is active', () => {
    storageMocks.resolveDefaultAccount.mockReturnValue({ Chosen: null, Candidates: [], Ambiguous: false });
    expect(AIEngineBase.Instance.ResolveAgentStorageAccount(agent())).toEqual({
      AccountID: null,
      Source: 'None',
      Ambiguous: false,
    });
  });
});
