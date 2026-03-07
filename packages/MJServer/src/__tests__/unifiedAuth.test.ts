/**
 * Tests for the unified auth middleware (createUnifiedAuthMiddleware).
 *
 * Verifies: OPTIONS passthrough, token handling, userPayload attachment,
 * 401 responses with proper error codes, and backward-compat properties.
 *
 * Because `createUnifiedAuthMiddleware` and `getUserPayload` live in the same
 * module (context.ts), vi.mock cannot intercept the intra-module call.
 * Instead we mock the LOWER-LEVEL dependencies that `getUserPayload` calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (available inside vi.mock factories) ─────────────────────
const {
  MockTokenExpiredError,
  mockGetReadOnlyDS,
  mockGetReadWriteDS,
  mockJwtDecode,
  mockJwtVerify,
  mockVerifyUserRecord,
  mockExtractUserInfo,
  mockGetValidationOptions,
  mockGetSigningKeys,
  mockGetByIssuer,
} = vi.hoisted(() => {
  class _MockTokenExpiredError extends Error {
    constructor(public expiryDate: Date) {
      super('Token expired');
      this.name = 'TokenExpiredError';
    }
  }

  return {
    MockTokenExpiredError: _MockTokenExpiredError,
    mockGetReadOnlyDS: vi.fn(),
    mockGetReadWriteDS: vi.fn(),
    mockJwtDecode: vi.fn(),
    mockJwtVerify: vi.fn(),
    mockVerifyUserRecord: vi.fn(),
    mockExtractUserInfo: vi.fn(),
    mockGetValidationOptions: vi.fn(),
    mockGetSigningKeys: vi.fn(),
    mockGetByIssuer: vi.fn(),
  };
});

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock('../util.js', () => ({
  GetReadOnlyDataSource: mockGetReadOnlyDS,
  GetReadWriteDataSource: mockGetReadWriteDS,
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    decode: mockJwtDecode,
    verify: mockJwtVerify,
  },
}));

vi.mock('../auth/index.js', () => ({
  getSigningKeys: mockGetSigningKeys,
  getSystemUser: vi.fn(),
  getValidationOptions: mockGetValidationOptions,
  verifyUserRecord: mockVerifyUserRecord,
  extractUserInfoFromPayload: mockExtractUserInfo,
  TokenExpiredError: MockTokenExpiredError,
}));

vi.mock('../cache.js', () => {
  const map = new Map<string, boolean>();
  return { authCache: map };
});

vi.mock('../config.js', () => ({
  configInfo: {
    baseUrl: 'http://localhost',
    graphqlPort: 4001,
    graphqlRootPath: '/',
    databaseSettings: { metadataCacheRefreshInterval: 0 },
  },
  userEmailMap: {},
  apiKey: 'test-api-key',
  mj_core_schema: '__mj',
}));

vi.mock('../auth/AuthProviderFactory.js', () => ({
  AuthProviderFactory: {
    getInstance: () => ({ getByIssuer: mockGetByIssuer }),
  },
}));

vi.mock('@memberjunction/api-keys', () => ({
  GetAPIKeyEngine: vi.fn(),
}));

import { createUnifiedAuthMiddleware } from '../context.js';
import type { Request, Response, NextFunction } from 'express';
import type { DataSourceInfo } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    headers: {},
    path: '/',
    url: '/',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

function makeMockRes(): Response & { _status: number; _json: Record<string, unknown> | null } {
  const res = {
    _status: 0,
    _json: null as Record<string, unknown> | null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      res._json = data;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _json: Record<string, unknown> | null };
}

const mockDataSources: DataSourceInfo[] = [];
const MOCK_POOL = {} as unknown as import('mssql').ConnectionPool;

const mockUserRecord = {
  ID: 'user-1',
  Name: 'Test User',
  Email: 'test@example.com',
  IsActive: true,
};

/** Configure lower-level mocks so getUserPayload succeeds for a bearer token */
function setupSuccessfulAuth() {
  mockGetReadOnlyDS.mockReturnValue(MOCK_POOL);
  mockGetReadWriteDS.mockReturnValue(MOCK_POOL);
  // Decode returns a valid, non-expired JWT payload
  mockJwtDecode.mockReturnValue({
    iss: 'https://test-issuer.com',
    sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  });
  // AuthProviderFactory finds the issuer
  mockGetByIssuer.mockReturnValue({ name: 'test' });
  // Validation options needed by verifyAsync
  mockGetValidationOptions.mockReturnValue({ audience: ['test-audience'] });
  // Signing keys callback
  mockGetSigningKeys.mockReturnValue((_header: unknown, cb: (err: Error | null, key: string) => void) => {
    cb(null, 'mock-key');
  });
  // jwt.verify calls the callback successfully
  mockJwtVerify.mockImplementation(
    (_token: string, _keyFn: unknown, _options: unknown, callback: (err: Error | null, decoded: unknown) => void) => {
      callback(null, { iss: 'https://test-issuer.com', sub: 'user-1' });
    }
  );
  // User info extraction
  mockExtractUserInfo.mockReturnValue({
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    preferredUsername: 'test@example.com',
  });
  // User record verification
  mockVerifyUserRecord.mockResolvedValue(mockUserRecord);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createUnifiedAuthMiddleware', () => {
  let middleware: ReturnType<typeof createUnifiedAuthMiddleware>;

  beforeEach(() => {
    vi.clearAllMocks();
    middleware = createUnifiedAuthMiddleware(mockDataSources);
  });

  describe('OPTIONS passthrough', () => {
    it('should call next() without auth for OPTIONS requests', async () => {
      const req = makeMockReq({ method: 'OPTIONS' });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockJwtDecode).not.toHaveBeenCalled();
      expect(res._status).toBe(0); // no status set
    });

    it('should not attach userPayload for OPTIONS requests', async () => {
      const req = makeMockReq({ method: 'OPTIONS' });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(req.userPayload).toBeUndefined();
    });
  });

  describe('Successful authentication', () => {
    beforeEach(() => {
      setupSuccessfulAuth();
    });

    it('should attach userPayload to req on successful auth', async () => {
      const req = makeMockReq({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.userPayload).toBeDefined();
      expect(req.userPayload!.email).toBe('test@example.com');
      expect(req.userPayload!.userRecord).toBe(mockUserRecord);
    });

    it('should set req.user for backward compatibility', async () => {
      const req = makeMockReq({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      const reqRecord = req as unknown as Record<string, unknown>;
      expect(reqRecord['user']).toBeDefined();
      expect((reqRecord['user'] as { email: string }).email).toBe('test@example.com');
    });

    it('should set req.mjUser to the userRecord', async () => {
      const req = makeMockReq({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      const reqRecord = req as unknown as Record<string, unknown>;
      expect(reqRecord['mjUser']).toBe(mockUserRecord);
    });
  });

  describe('Authentication failures', () => {
    it('should return 401 when no authorization header is provided', async () => {
      mockGetReadOnlyDS.mockReturnValue(MOCK_POOL);
      mockGetReadWriteDS.mockReturnValue(MOCK_POOL);
      // No auth header → empty bearer token → empty token after strip → "Missing token"
      const req = makeMockReq({ headers: {} });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Authentication failed' });
    });

    it('should return 401 with JWT_EXPIRED code for expired tokens', async () => {
      mockGetReadOnlyDS.mockReturnValue(MOCK_POOL);
      mockGetReadWriteDS.mockReturnValue(MOCK_POOL);
      // jwt.decode returns a payload with expired timestamp
      mockJwtDecode.mockReturnValue({
        iss: 'https://test-issuer.com',
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });

      const req = makeMockReq({
        headers: { authorization: 'Bearer expired-token' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
      expect(res._json).toEqual({
        errors: [{
          message: 'Token expired',
          extensions: { code: 'JWT_EXPIRED' }
        }]
      });
    });

    it('should return 401 when jwt.decode returns null (corrupt token)', async () => {
      mockGetReadOnlyDS.mockReturnValue(MOCK_POOL);
      mockGetReadWriteDS.mockReturnValue(MOCK_POOL);
      mockJwtDecode.mockReturnValue(null);

      const req = makeMockReq({
        headers: { authorization: 'Bearer corrupt-token' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Authentication failed' });
    });

    it('should return 401 when verifyUserRecord returns null', async () => {
      mockGetReadOnlyDS.mockReturnValue(MOCK_POOL);
      mockGetReadWriteDS.mockReturnValue(MOCK_POOL);
      mockJwtDecode.mockReturnValue({
        iss: 'https://test-issuer.com',
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockGetByIssuer.mockReturnValue({ name: 'test' });
      mockGetValidationOptions.mockReturnValue({ audience: ['test-audience'] });
      mockGetSigningKeys.mockReturnValue(
        (_h: unknown, cb: (err: Error | null, key: string) => void) => cb(null, 'key')
      );
      mockJwtVerify.mockImplementation(
        (_t: string, _k: unknown, _o: unknown, cb: (err: Error | null, d: unknown) => void) => {
          cb(null, { iss: 'https://test-issuer.com' });
        }
      );
      mockExtractUserInfo.mockReturnValue({ email: 'unknown@example.com' });
      mockVerifyUserRecord.mockResolvedValue(null); // user not found

      const req = makeMockReq({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
    });

    it('should not call next() on auth failure', async () => {
      mockGetReadOnlyDS.mockReturnValue(MOCK_POOL);
      mockGetReadWriteDS.mockReturnValue(MOCK_POOL);
      mockJwtDecode.mockReturnValue(null); // invalid token

      const req = makeMockReq({
        headers: { authorization: 'Bearer bad-token' },
      });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('HTTP method handling', () => {
    beforeEach(() => {
      setupSuccessfulAuth();
    });

    it('should authenticate GET requests', async () => {
      const req = makeMockReq({ method: 'GET', headers: { authorization: 'Bearer tok' } });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should authenticate POST requests', async () => {
      const req = makeMockReq({ method: 'POST', headers: { authorization: 'Bearer tok' } });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should authenticate PUT requests', async () => {
      const req = makeMockReq({ method: 'PUT', headers: { authorization: 'Bearer tok' } });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should authenticate DELETE requests', async () => {
      const req = makeMockReq({ method: 'DELETE', headers: { authorization: 'Bearer tok' } });
      const res = makeMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
