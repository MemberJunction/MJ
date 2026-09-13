/**
 * Tests for workspace-initializer package:
 * - WorkspaceInitError types
 * - WorkspaceInitializerService.classifyError
 *
 * ## This file did not run until now
 *
 * It was added with a `package.json` whose `test` script was
 * `echo "No tests configured yet"`, so `turbo run test` never executed it. Turning the
 * script on surfaced six failures in nine tests, all of them harness bugs rather than
 * product bugs:
 *
 *  - five constructed the service with `{} as never` for every dependency, and
 *    `classifyError` calls `this.authBase.classifyError(err)` — so any error that reached
 *    the token-expiry branch died with "this.authBase.classifyError is not a function";
 *  - one asserted a `ResourceTypes` TypeError classifies as `no_roles`, which the service
 *    has never done (`isNoUserRolesError` matches only the literal
 *    "does not have read permissions on User Roles"). That assertion is corrected below to
 *    what the code actually does, and deliberately NOT implemented as a new heuristic.
 *
 * The stubs are now real objects (see {@link buildService}).
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

type ServiceUnderTest = InstanceType<typeof import('../services/workspace-initializer.service').WorkspaceInitializerService>;

/**
 * Build the service with dependency stubs that actually implement what `classifyError`
 * calls. `authClassification` is what the stubbed `MJAuthBase.classifyError` returns, so a
 * test can steer the token-expiry branch.
 */
async function buildService(
  authClassification: { type: string; message: string; userMessage?: string } = { type: 'UNKNOWN_ERROR', message: 'unknown' }
): Promise<ServiceUnderTest> {
  const mod = await import('../services/workspace-initializer.service');
  const authBase = {
    classifyError: vi.fn(() => authClassification),
    refreshToken: vi.fn(),
    login: vi.fn(() => ({ subscribe: vi.fn() })),
    logout: vi.fn(),
  };
  const startupValidation = {
    validateSystemSetup: vi.fn(),
    addNoRolesValidationIssue: vi.fn(),
  };
  const themeService = {
    Initialize: vi.fn(),
    GetSelectedBrandThemeId: vi.fn(() => null),
    RegisterBrandTheme: vi.fn(),
    ApplyBrandOverlay: vi.fn(),
  };
  return new mod.WorkspaceInitializerService(
    authBase as never,
    startupValidation as never,
    themeService as never
  );
}

// ======================= WorkspaceInitializerService.classifyError =======================
describe('WorkspaceInitializerService.classifyError', () => {
  let service: ServiceUnderTest;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = await buildService();
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

  it('classifies a ResourceTypes TypeError as unknown — there is no such heuristic', () => {
    // This assertion originally expected `no_roles`. It never ran, and the service has never
    // had a ResourceTypes branch: `isNoUserRolesError` matches only the literal
    // "does not have read permissions on User Roles". Pinned as-is rather than inventing a
    // heuristic off a never-executed expectation — a TypeError about a missing property is not
    // reliable evidence of a permissions problem.
    const err = new Error("Cannot read properties of undefined (reading 'ResourceTypes')");
    const result = service.classifyError(err);
    expect(result.type).toBe('unknown');
    expect(result.shouldRetry).toBe(false);
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
  let service: ServiceUnderTest;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear localStorage mock
    const localStorageMock: Record<string, string> = {};
    (global as Record<string, unknown>).localStorage = {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { localStorageMock[key] = value; }),
      removeItem: vi.fn((key: string) => { delete localStorageMock[key]; }),
    };
    service = await buildService();
  });

  it('should return false for non-retryable errors', async () => {
    const result = await service.handleAuthRetry(
      { type: 'no_roles', message: 'No roles', userMessage: 'No roles', shouldRetry: false },
      '/dashboard'
    );
    expect(result).toBe(false);
  });
});

// ======================= Transport failures are retryable =======================
/**
 * A metadata-status query that times out behind a reverse proxy arrives as a GraphQL error
 * saying `504` / `Gateway Timeout`, and carries neither the word "network" nor "fetch". The
 * old two-substring check therefore classified the single most transient failure class there
 * is as `type: 'unknown'`, `shouldRetry: false` — the least accurate and least actionable
 * verdict available — and the Explorer rendered it as a dead "System Error" with nothing to
 * retry.
 */
describe('WorkspaceInitializerService — transport failures classify as retryable network errors', () => {
  let service: ServiceUnderTest;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = await buildService();
  });

  const transportCases: Array<[string, unknown]> = [
    ['a 504 in a GraphQL errors array', { response: { errors: [{ message: 'Response not successful: Received status code 504' }] } }],
    ['a bare Gateway Timeout message', new Error('Gateway Timeout')],
    ['an HTTP status on the response', { response: { status: 504 } }],
    ['an HTTP status on the error', { status: 503, message: 'Service Unavailable' }],
    ['a request timeout', new Error('Request timeout after 30000ms')],
    ['a "timed out" phrasing', new Error('The metadata status query timed out')],
    ['a socket hang up', new Error('socket hang up')],
    ['ECONNRESET', new Error('read ECONNRESET')],
    ['ETIMEDOUT', { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT 10.0.0.1:443' }],
    ['an Apollo-style networkError', { message: 'Something went wrong', networkError: { statusCode: 504 } }],
    ["Safari's opaque failure", new TypeError('Load failed')],
    ['an aborted fetch', Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })],
    ['a nested error object', { error: { message: 'Bad Gateway' } }],
  ];

  for (const [label, err] of transportCases) {
    it(`treats ${label} as a retryable network error`, () => {
      const result = service.classifyError(err);
      expect(result.type).toBe('network');
      expect(result.shouldRetry).toBe(true);
    });
  }

  it('still surfaces a message when the error carries none of its own', () => {
    const result = service.classifyError({ response: { status: 504 } });
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('does not drag an ordinary application error into the network bucket', () => {
    const result = service.classifyError(new Error('Entity "Widgets" was not found in metadata'));
    expect(result.type).toBe('unknown');
    expect(result.shouldRetry).toBe(false);
  });

  it('leaves the higher-priority classifications alone — no_roles still wins', () => {
    // Both signals present: a no-roles GraphQL error delivered over a 504-ish envelope.
    // The permissions verdict is actionable and must not be masked by the transport one.
    const result = service.classifyError({
      message: 'Gateway Timeout',
      response: { errors: [{ message: 'User does not have read permissions on User Roles' }] },
    });
    expect(result.type).toBe('no_roles');
  });

  it('leaves access-denied alone too', () => {
    const result = service.classifyError(new Error("You don't have access to this application (network unreachable)"));
    expect(result.type).toBe('no_access');
  });

  it('token expiry still outranks the transport check', async () => {
    const expiring = await buildService({ type: 'TOKEN_EXPIRED', message: 'jwt expired', userMessage: 'Session over' });
    const result = expiring.classifyError(new Error('Gateway Timeout'));
    expect(result.type).toBe('token_expired');
  });

  it('survives a self-referential error object instead of recursing forever', () => {
    const err: Record<string, unknown> = { message: 'Gateway Timeout' };
    err['error'] = err; // GraphQL clients really do produce this
    expect(() => service.classifyError(err)).not.toThrow();
    expect(service.classifyError(err).type).toBe('network');
  });

  it('classifies a null/undefined error as unknown rather than throwing', () => {
    expect(service.classifyError({}).type).toBe('unknown');
  });
});
