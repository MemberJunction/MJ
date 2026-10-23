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

const { runViewImpl } = vi.hoisted(() => ({
  runViewImpl: vi.fn(async (_params: unknown) => ({ Success: true, Results: [] as unknown[] })),
}));

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  LogStatusEx: vi.fn(),
  Metadata: class {
    CurrentUser = { ID: 'user-1' };
  },
  RunView: class {
    RunView(params: unknown) {
      return runViewImpl(params);
    }
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
      new StartupValidationService() as never,
      {} as never
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

  it('should classify a failed boot caused by the MJ: User Roles permission as no_roles (#4887)', () => {
    // SetupGraphQLClient rejects with the metadata download's failure appended to its own message.
    const err = new Error(
      'SetupGraphQLClient: no entity metadata was loaded from http://localhost:4000/ — the metadata download failed or returned nothing: ' +
      'User a@b.com does not have read permissions on MJ: User Roles'
    );
    const result = service.classifyError(err);
    expect(result.type).toBe('no_roles');
    expect(result.shouldRetry).toBe(false);
  });

  // An empty-graph boot now rejects in SetupGraphQLClient carrying the real cause, which the "MJ: User Roles" case above covers.

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
      {} as never,
      {} as never,
      {} as never
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

// ======================= Org brand bootstrap =======================
/**
 * `applyDefaultBrandTheme` is the only place that can END a brand overlay restored from
 * localStorage before bootstrap (ThemeService.RestorePersistedBrandOverlay). Without the clear,
 * a retired brand keeps painting forever on every browser that ever loaded it. The clear is
 * gated on the query succeeding, so a transient read failure never wipes a good cached brand.
 */
describe('WorkspaceInitializerService.applyDefaultBrandTheme', () => {
  type ThemeStub = {
    GetSelectedBrandThemeId: ReturnType<typeof vi.fn>;
    ClearBrandOverlay: ReturnType<typeof vi.fn>;
    RegisterBrandTheme: ReturnType<typeof vi.fn>;
    ApplyBrandOverlay: ReturnType<typeof vi.fn>;
  };
  let themeService: ThemeStub;
  let run: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    themeService = {
      GetSelectedBrandThemeId: vi.fn(() => null),
      ClearBrandOverlay: vi.fn(),
      RegisterBrandTheme: vi.fn(),
      ApplyBrandOverlay: vi.fn(async () => undefined),
    };
    const mod = await import('../services/workspace-initializer.service');
    const service = new mod.WorkspaceInitializerService({} as never, {} as never, themeService as never);
    run = () => (service as unknown as { applyDefaultBrandTheme(): Promise<void> }).applyDefaultBrandTheme();
  });

  it('clears a restored overlay when the query succeeds and the org has no active brand', async () => {
    runViewImpl.mockResolvedValue({ Success: true, Results: [] });
    await run();
    expect(themeService.ClearBrandOverlay).toHaveBeenCalledTimes(1);
    expect(themeService.ApplyBrandOverlay).not.toHaveBeenCalled();
  });

  it('leaves a restored overlay alone when the query FAILS (a transient error must not wipe the cached brand)', async () => {
    runViewImpl.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'offline' });
    await run();
    expect(themeService.ClearBrandOverlay).not.toHaveBeenCalled();
  });

  it('leaves a restored overlay alone when the query THROWS', async () => {
    runViewImpl.mockRejectedValue(new Error('boom'));
    await run();
    expect(themeService.ClearBrandOverlay).not.toHaveBeenCalled();
  });

  it('falls back from a vanished user selection to the org default, and clears only if that final query succeeds empty', async () => {
    themeService.GetSelectedBrandThemeId.mockReturnValue('gone');
    runViewImpl
      .mockResolvedValueOnce({ Success: true, Results: [] })   // the user's selection: gone
      .mockResolvedValueOnce({ Success: true, Results: [] });  // the org default: none
    await run();
    expect(runViewImpl).toHaveBeenCalledTimes(2);
    expect(themeService.ClearBrandOverlay).toHaveBeenCalledTimes(1);
  });

  it('applies the brand it finds and never clears', async () => {
    runViewImpl.mockResolvedValue({ Success: true, Results: [{ ID: 't1', Name: 'Acme', Seeds: '{}', Description: null, Overrides: null, CustomCSS: null, LightMarkURL: null, DarkMarkURL: null, WordmarkURL: null, MonochromeURL: null }] });
    await run();
    expect(themeService.RegisterBrandTheme).toHaveBeenCalledTimes(1);
    expect(themeService.ApplyBrandOverlay).toHaveBeenCalledWith('t1');
    expect(themeService.ClearBrandOverlay).not.toHaveBeenCalled();
  });
});
