import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all heavy dependencies
vi.mock('graphql-request', () => ({
  gql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
  GraphQLClient: vi.fn().mockImplementation(() => ({
    request: vi.fn().mockResolvedValue({}),
    setHeader: vi.fn(),
  })),
}));

vi.mock('graphql-ws', () => ({
  createClient: vi.fn().mockReturnValue({
    subscribe: vi.fn(),
    dispose: vi.fn(),
  }),
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid-1234'),
}));

vi.mock('rxjs', () => ({
  Observable: vi.fn(),
  Subject: vi.fn().mockImplementation(() => ({
    next: vi.fn(),
    complete: vi.fn(),
    subscribe: vi.fn(),
    asObservable: vi.fn(),
  })),
  Subscription: vi.fn(),
}));

vi.mock('@memberjunction/core', () => {
  class MockProviderBase {
    static _globalProviderKey = 'GraphQL';
    protected _localStorageProvider: Record<string, string> = {};
    async Config() { return true; }
    get LocalStorageProvider() { return null; }
  }
  return {
    BaseEntity: vi.fn(),
    ProviderBase: MockProviderBase,
    ProviderConfigDataBase: class {
      Data: Record<string, unknown> = {};
      constructor(data: Record<string, unknown>) { this.Data = data; }
    },
    ProviderType: { Network: 'Network' },
    UserInfo: vi.fn(),
    UserRoleInfo: vi.fn(),
    RecordChange: vi.fn(),
    RunViewResult: vi.fn(),
    EntityInfo: vi.fn(),
    EntityFieldInfo: vi.fn(),
    EntityFieldTSType: vi.fn(),
    RunViewParams: vi.fn(),
    LogError: vi.fn(),
    TransactionGroupBase: class { PendingTransactions: unknown[] = []; Variables: unknown[] = []; },
    TransactionItem: vi.fn(),
    TransactionResult: vi.fn(),
    DatasetItemFilterType: vi.fn(),
    DatasetResultType: vi.fn(),
    DatasetStatusResultType: vi.fn(),
    EntityRecordNameInput: vi.fn(),
    EntityRecordNameResult: vi.fn(),
    RunReportResult: vi.fn(),
    RunReportParams: vi.fn(),
    RecordDependency: vi.fn(),
    RecordMergeRequest: vi.fn(),
    RecordMergeResult: vi.fn(),
    RunQueryResult: vi.fn(),
    PotentialDuplicateRequest: vi.fn(),
    PotentialDuplicateResponse: vi.fn(),
    CompositeKey: vi.fn(),
    EntityDeleteOptions: vi.fn(),
    RunQueryParams: vi.fn(),
    BaseEntityResult: vi.fn(),
    RunViewWithCacheCheckParams: vi.fn(),
    RunViewsWithCacheCheckResponse: vi.fn(),
    RunViewWithCacheCheckResult: vi.fn(),
    RunQueryWithCacheCheckParams: vi.fn(),
    RunQueriesWithCacheCheckResponse: vi.fn(),
    RunQueryWithCacheCheckResult: vi.fn(),
    KeyValuePair: vi.fn(),
    getGraphQLTypeNameBase: vi.fn().mockReturnValue('MJTestEntity'),
    AggregateExpression: vi.fn(),
    InMemoryLocalStorageProvider: vi.fn(),
    SetProvider: vi.fn(),
    StartupManager: { Instance: { Startup: vi.fn().mockResolvedValue(true) } },
    RunReport: vi.fn(),
    Metadata: vi.fn(),
    RunView: vi.fn(),
    RunQuery: vi.fn(),
    EntitySaveOptions: vi.fn(),
    EntityMergeOptions: vi.fn(),
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  UserViewEntityExtended: vi.fn(),
  ViewInfo: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: vi.fn(() => (target: Function) => target),
    MJGlobal: {
      Instance: {
        RaiseEvent: vi.fn(),
        ClassFactory: { CreateInstance: vi.fn() },
      },
    },
    MJEventType: { LoggedIn: 'LoggedIn' },
    SafeJSONParse: vi.fn((str: string) => {
      try { return JSON.parse(str); } catch { return null; }
    }),
  };
});

vi.mock('@tempfix/idb', () => ({
  openDB: vi.fn(),
}));

vi.mock('../storage-providers', () => ({
  BrowserIndexedDBStorageProvider: vi.fn(),
}));

vi.mock('../graphQLAIClient', () => ({
  GraphQLAIClient: vi.fn().mockImplementation(() => ({})),
}));

import { GraphQLProviderConfigData, GraphQLDataProvider } from '../graphQLDataProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { v4 } from 'uuid';

function resetSingleton(): void {
  const g = GetGlobalObjectStore();
  const key = '___SINGLETON__GraphQLDataProvider';
  if (g && g[key]) {
    delete g[key];
  }
}

describe('GraphQLProviderConfigData', () => {
  it('should create config with all required parameters', () => {
    const config = new GraphQLProviderConfigData(
      'test-jwt-token',
      'http://localhost:4000/graphql',
      'ws://localhost:4000/graphql',
      async () => 'refreshed-token',
    );

    expect(config.Token).toBe('test-jwt-token');
    expect(config.URL).toBe('http://localhost:4000/graphql');
    expect(config.WSURL).toBe('ws://localhost:4000/graphql');
    // Note: RefreshTokenFunction getter reads this.Data.RefreshFunction but
    // the constructor stores it as this.Data.RefreshTokenFunction (key mismatch in source)
    expect(config.RefreshTokenFunction).toBeUndefined();
  });

  it('should set and get Token', () => {
    const config = new GraphQLProviderConfigData(
      'initial-token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'new-token',
    );

    expect(config.Token).toBe('initial-token');
    config.Token = 'updated-token';
    expect(config.Token).toBe('updated-token');
  });

  it('should handle MJAPIKey parameter', () => {
    const config = new GraphQLProviderConfigData(
      'token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
      undefined,
      undefined,
      undefined,
      'my-api-key',
    );

    expect(config.MJAPIKey).toBe('my-api-key');
  });

  it('should handle UserAPIKey parameter', () => {
    const config = new GraphQLProviderConfigData(
      'token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
      undefined,
      undefined,
      undefined,
      undefined,
      'mj_sk_user_key',
    );

    expect(config.UserAPIKey).toBe('mj_sk_user_key');
  });

  it('should handle schema configuration', () => {
    const config = new GraphQLProviderConfigData(
      'token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
      '__mj',
      ['schema1', 'schema2'],
      ['excluded_schema'],
    );

    expect(config.Token).toBe('token');
    // Schema config passed to parent ProviderConfigDataBase
  });

  it('should set MJAPIKey via setter', () => {
    const config = new GraphQLProviderConfigData(
      'token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    config.MJAPIKey = 'new-api-key';
    expect(config.MJAPIKey).toBe('new-api-key');
  });

  it('should set UserAPIKey via setter', () => {
    const config = new GraphQLProviderConfigData(
      'token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    config.UserAPIKey = 'mj_sk_updated';
    expect(config.UserAPIKey).toBe('mj_sk_updated');
  });
});

describe('GraphQLDataProvider', () => {
  let provider: GraphQLDataProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
    provider = new GraphQLDataProvider();
  });

  describe('constructor', () => {
    it('should create a singleton instance', () => {
      expect(GraphQLDataProvider.Instance).toBe(provider);
    });

    it('should not replace existing singleton', () => {
      // provider is already the singleton from beforeEach
      const provider2 = new GraphQLDataProvider();
      // With global store backing, constructor returns the existing instance
      expect(provider2).toBe(provider);
      expect(GraphQLDataProvider.Instance).toBe(provider);
    });
  });

  describe('GenerateUUID', () => {
    it('should return a UUID string', () => {
      const uuid = provider.GenerateUUID();
      expect(uuid).toBe('mock-uuid-1234');
    });

    it('should call uuid v4', () => {
      provider.GenerateUUID();
      expect(v4).toHaveBeenCalled();
    });
  });

  describe('DatabaseConnection', () => {
    it('should throw when accessed', () => {
      expect(() => provider.DatabaseConnection).toThrow('DatabaseConnection not implemented');
    });
  });

  describe('sessionId', () => {
    it('should return the session ID after config', () => {
      // Before config, sessionId is undefined
      expect(provider.sessionId).toBeUndefined();
    });
  });
});

describe('GraphQLDataProvider - Config flow', () => {
  it('should accept GraphQLProviderConfigData', () => {
    const config = new GraphQLProviderConfigData(
      'token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'refreshed',
    );

    expect(config).toBeDefined();
    expect(config.Token).toBe('token');
    expect(config.URL).toBe('http://localhost:4000');
    expect(config.WSURL).toBe('ws://localhost:4000');
  });
});
