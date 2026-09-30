import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The entities every mocked provider instance reports; tests swap it to simulate an empty or loaded graph.
const mockProviderState = vi.hoisted(() => ({ entities: [{ Name: 'Stub Entity' }] as Array<{ Name: string }> }));

// Mock all dependencies
vi.mock('@memberjunction/core', () => ({
  BaseEntity: vi.fn(),
  Metadata: vi.fn(),
  RunView: vi.fn(),
  RunQuery: vi.fn(),
  SetProvider: vi.fn(),
  StartupManager: {
    Instance: {
      Startup: vi.fn().mockResolvedValue(true),
    },
  },
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: {
    Instance: {
      RaiseEvent: vi.fn(),
    },
  },
  MJEventType: { LoggedIn: 'LoggedIn' },
}));

vi.mock('../graphQLDataProvider', () => {
  class MockGraphQLDataProvider {
    Config = vi.fn().mockResolvedValue(true);
    preValidateAndRefresh = vi.fn().mockResolvedValue(undefined);
    backgroundValidateAndRefresh = vi.fn().mockResolvedValue(undefined);
    Connect = vi.fn().mockResolvedValue(undefined);
    Entities: Array<{ Name: string }> = mockProviderState.entities;
  }
  class MockGraphQLProviderConfigData {
    Token: string;
    URL: string;
    WSURL: string;
    constructor(token: string, url: string, wsurl: string) {
      this.Token = token;
      this.URL = url;
      this.WSURL = wsurl;
    }
  }
  return {
    GraphQLDataProvider: MockGraphQLDataProvider,
    GraphQLProviderConfigData: MockGraphQLProviderConfigData,
  };
});

import { SetupGraphQLClient, ConnectGraphQLClient } from '../config';
import { GraphQLProviderConfigData } from '../graphQLDataProvider';
import { SetProvider, StartupManager } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

describe('setupGraphQLClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new GraphQLDataProvider', async () => {
    const config = new GraphQLProviderConfigData(
      'test-token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    const result = await SetupGraphQLClient(config);
    expect(result).toBeDefined();
  });

  it('should call SetProvider', async () => {
    const config = new GraphQLProviderConfigData(
      'test-token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    await SetupGraphQLClient(config);
    expect(SetProvider).toHaveBeenCalled();
  });

  it('should call StartupManager.Startup', async () => {
    const config = new GraphQLProviderConfigData(
      'test-token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    await SetupGraphQLClient(config);
    expect(StartupManager.Instance.Startup).toHaveBeenCalled();
  });

  it('should raise LoggedIn event', async () => {
    const config = new GraphQLProviderConfigData(
      'test-token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    await SetupGraphQLClient(config);
    expect(MJGlobal.Instance.RaiseEvent).toHaveBeenCalled();
  });
});

describe('ConnectGraphQLClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProviderState.entities = []; // not booted yet
  });

  afterEach(() => {
    mockProviderState.entities = [{ Name: 'Stub Entity' }];
  });

  it('returns an already-booted provider without reconnecting it', async () => {
    mockProviderState.entities = [{ Name: 'Stub Entity' }];

    const provider = await ConnectGraphQLClient(new GraphQLProviderConfigData('t', 'http://localhost:4000', 'ws://localhost:4000'));

    expect(provider.Connect).not.toHaveBeenCalled();
    expect(SetProvider).not.toHaveBeenCalled();
  });

  it('registers the provider and connects without booting metadata or engines', async () => {
    const config = new GraphQLProviderConfigData('test-token', 'http://localhost:4000', 'ws://localhost:4000');

    const provider = await ConnectGraphQLClient(config);

    expect(SetProvider).toHaveBeenCalledWith(provider);
    expect(provider.Connect).toHaveBeenCalledWith(config);
    expect(provider.Config).not.toHaveBeenCalled();
    expect(provider.preValidateAndRefresh).not.toHaveBeenCalled();
    expect(MJGlobal.Instance.RaiseEvent).not.toHaveBeenCalled();
    expect(StartupManager.Instance.Startup).not.toHaveBeenCalled();
  });
});
