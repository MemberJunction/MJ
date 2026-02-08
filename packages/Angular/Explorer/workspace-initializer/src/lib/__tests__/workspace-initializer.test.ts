/**
 * Tests for workspace-initializer package:
 * - WorkspaceInitError types
 * - WorkspaceInitializerService.classifyError
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular
vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
}));

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  Metadata: class {
    CurrentUser = { ID: 'user-1' };
  },
}));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  setupGraphQLClient: vi.fn(),
  GraphQLProviderConfigData: class {
    constructor(...args: unknown[]) {}
  },
}));

vi.mock('@memberjunction/ng-auth-services', () => ({
  MJAuthBase: class {
    classifyError = vi.fn(() => ({ type: 'UNKNOWN_ERROR', message: 'unknown' }));
    refreshToken = vi.fn();
    login = vi.fn(() => ({ subscribe: vi.fn() }));
  },
  StandardUserInfo: class {},
  AuthErrorType: {
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    NO_ACTIVE_SESSION: 'NO_ACTIVE_SESSION',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  },
}));

vi.mock('@memberjunction/ng-shared', () => ({
  SharedService: {
    RefreshData: vi.fn(),
  },
}));

vi.mock('@memberjunction/ng-explorer-core', () => ({
  StartupValidationService: class {
    validateSystemSetup = vi.fn();
    addNoRolesValidationIssue = vi.fn();
  },
}));

vi.mock('rxjs', async () => {
  const actual = await vi.importActual<typeof import('rxjs')>('rxjs');
  return actual;
});

// ======================= Workspace types =======================
describe('WorkspaceEnvironment / WorkspaceInitResult types', () => {
  it('should define type interfaces correctly', async () => {
    const types = await import('../models/workspace-types');
    // These are interfaces, we can just verify the module exports
    expect(types).toBeDefined();
  });
});

// ======================= WorkspaceInitializerService.classifyError =======================
describe('WorkspaceInitializerService.classifyError', () => {
  let service: InstanceType<typeof import('../services/workspace-initializer.service').WorkspaceInitializerService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/workspace-initializer.service');
    const { MJAuthBase } = await import('@memberjunction/ng-auth-services');
    const { StartupValidationService } = await import('@memberjunction/ng-explorer-core');
    service = new mod.WorkspaceInitializerService(
      new MJAuthBase() as never,
      new StartupValidationService() as never
    );
  });

  it('should classify no-roles GraphQL error', () => {
    const err = {
      response: {
        errors: [{ message: 'User does not have read permissions on User Roles' }]
      }
    };
    const result = service.classifyError(err);
    expect(result.type).toBe('no_roles');
    expect(result.shouldRetry).toBe(false);
  });

  it('should classify ResourceTypes error as no_roles', () => {
    const err = new Error("Cannot read properties of undefined (reading 'ResourceTypes')");
    const result = service.classifyError(err);
    expect(result.type).toBe('no_roles');
  });

  it('should classify access denied error', () => {
    const err = new Error("You don't have access to this application");
    const result = service.classifyError(err);
    expect(result.type).toBe('no_access');
    expect(result.shouldRetry).toBe(false);
  });

  it('should classify network errors', () => {
    const err = new Error('Failed to fetch data from network');
    const result = service.classifyError(err);
    expect(result.type).toBe('network');
    expect(result.shouldRetry).toBe(true);
  });

  it('should classify unknown errors as unknown', () => {
    const err = new Error('Something unexpected happened');
    const result = service.classifyError(err);
    expect(result.type).toBe('unknown');
    expect(result.shouldRetry).toBe(false);
  });

  it('should handle errors without message property gracefully', () => {
    // classifyError accesses err.message directly, so pass an object without message
    const result = service.classifyError({ someOtherProp: true });
    expect(result.type).toBe('unknown');
  });

  it('should handle errors without message', () => {
    const result = service.classifyError({});
    expect(result.type).toBe('unknown');
  });
});

// ======================= handleAuthRetry =======================
describe('WorkspaceInitializerService.handleAuthRetry', () => {
  let service: InstanceType<typeof import('../services/workspace-initializer.service').WorkspaceInitializerService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear localStorage mock
    const localStorageMock: Record<string, string> = {};
    (global as Record<string, unknown>).localStorage = {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { localStorageMock[key] = value; }),
      removeItem: vi.fn((key: string) => { delete localStorageMock[key]; }),
    };

    const mod = await import('../services/workspace-initializer.service');
    const { MJAuthBase } = await import('@memberjunction/ng-auth-services');
    const { StartupValidationService } = await import('@memberjunction/ng-explorer-core');
    service = new mod.WorkspaceInitializerService(
      new MJAuthBase() as never,
      new StartupValidationService() as never
    );
  });

  it('should return false for non-retryable errors', async () => {
    const result = await service.handleAuthRetry(
      { type: 'no_roles', message: 'No roles', userMessage: 'No roles', shouldRetry: false },
      '/dashboard'
    );
    expect(result).toBe(false);
  });
});
