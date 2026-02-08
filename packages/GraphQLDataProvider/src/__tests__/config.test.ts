import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('@memberjunction/core', () => ({
  RunReport: vi.fn(),
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

vi.mock('../graphQLDataProvider', () => ({
  GraphQLDataProvider: vi.fn().mockImplementation(() => ({
    Config: vi.fn().mockResolvedValue(true),
  })),
  GraphQLProviderConfigData: vi.fn().mockImplementation(
    (token: string, url: string, wsurl: string) => ({
      Token: token,
      URL: url,
      WSURL: wsurl,
    })
  ),
}));

import { setupGraphQLClient } from '../config';
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

    const result = await setupGraphQLClient(config);
    expect(result).toBeDefined();
  });

  it('should call SetProvider', async () => {
    const config = new GraphQLProviderConfigData(
      'test-token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    await setupGraphQLClient(config);
    expect(SetProvider).toHaveBeenCalled();
  });

  it('should call StartupManager.Startup', async () => {
    const config = new GraphQLProviderConfigData(
      'test-token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    await setupGraphQLClient(config);
    expect(StartupManager.Instance.Startup).toHaveBeenCalled();
  });

  it('should raise LoggedIn event', async () => {
    const config = new GraphQLProviderConfigData(
      'test-token',
      'http://localhost:4000',
      'ws://localhost:4000',
      async () => 'token',
    );

    await setupGraphQLClient(config);
    expect(MJGlobal.Instance.RaiseEvent).toHaveBeenCalled();
  });
});
