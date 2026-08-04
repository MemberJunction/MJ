/**
 * Security edge-case tests for multi-tenancy hooks (WS2).
 *
 * Covers injection attempts in the tenant header, boundary conditions on the
 * validated tenant-id pattern, session-isolation (clone-before-mutate), and
 * scoping-strategy edge cases that go beyond the happy-path tests in
 * multiTenancy.test.ts. Prior to WS2, `createTenantPreRunViewHook` string-built
 * `[${tenantColumn}] = '${tenantId}'` with no validation or escaping, and
 * `createTenantMiddleware` mutated the (possibly shared `UserCache`) userRecord
 * in place — see plan §4.1/§4.2. These tests assert the fixed behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createTenantPreRunViewHook,
  createTenantPreSaveHook,
  createTenantMiddleware,
  attachTenantContext,
  TenantContextValidationError,
} from '../multiTenancy/index.js';
import type { MultiTenancyConfig } from '../config.js';
import type { RunViewParams, UserInfo } from '@memberjunction/core';

// Mock @memberjunction/core Metadata for entity schema lookup, matching the shape
// buildTenantFilterClause needs: instance `.Entities` (isEntityScoped) and a static
// `.Provider` exposing `EntityByName` + `QuoteIdentifier`.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();

  const ENTITIES = [
    { Name: 'Customers', SchemaName: 'dbo', Fields: [{ Name: 'OrganizationID', IsVirtual: false }] },
    { Name: 'Orders', SchemaName: 'dbo', Fields: [{ Name: 'OrganizationID', IsVirtual: false }] },
    { Name: 'Users', SchemaName: '__mj', Fields: [{ Name: 'OrganizationID', IsVirtual: false }] },
  ];

  class MockMetadata {
    Entities = ENTITIES;
    static Provider = {
      EntityByName: (name: string) => ENTITIES.find(e => e.Name.trim().toLowerCase() === name.trim().toLowerCase()),
      QuoteIdentifier: (name: string) => `[${name}]`,
    };
  }

  return {
    ...actual,
    Metadata: MockMetadata,
  };
});

function makeConfig(overrides: Partial<MultiTenancyConfig> = {}): MultiTenancyConfig {
  return {
    enabled: true,
    contextSource: 'header',
    tenantHeader: 'x-tenant-id',
    scopingStrategy: 'denylist',
    scopedEntities: [],
    autoExcludeCoreEntities: true,
    defaultTenantColumn: 'OrganizationID',
    entityColumnMappings: {},
    adminRoles: ['Admin'],
    writeProtection: 'strict',
    ...overrides,
  };
}

type MockUser = Parameters<ReturnType<typeof createTenantPreRunViewHook>>[1];

function makeUser(tenantId?: string, roles: string[] = []): MockUser {
  return {
    ID: 'user-1',
    TenantContext: tenantId ? { TenantID: tenantId, Source: 'header' as const } : undefined,
    UserRoles: roles.map(r => ({ Role: r, RoleID: `role-${r}`, UserID: 'user-1' })),
  } as MockUser;
}

// ─── attachTenantContext boundary validation (fix (1)) ─────────────────────

describe('Multi-Tenancy Security (WS2)', () => {
  describe('attachTenantContext boundary validation', () => {
    it('accepts a plain identifier', () => {
      const user = {} as UserInfo;
      expect(() => attachTenantContext(user, 'tenant-abc_123.x', 'header')).not.toThrow();
      expect(user.TenantContext).toEqual({ TenantID: 'tenant-abc_123.x', Source: 'header' });
    });

    it('accepts a standard UUID', () => {
      const user = {} as UserInfo;
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      attachTenantContext(user, uuid, 'header');
      expect(user.TenantContext).toEqual({ TenantID: uuid, Source: 'header' });
    });

    it("rejects a SQL injection attempt (contains ', space, =) and leaves TenantContext unset", () => {
      const user = {} as UserInfo;
      expect(() => attachTenantContext(user, "' OR 1=1 --", 'header')).toThrow(TenantContextValidationError);
      expect(user.TenantContext).toBeUndefined();
    });

    it('rejects a value containing a semicolon statement terminator', () => {
      const user = {} as UserInfo;
      expect(() => attachTenantContext(user, "abc'; DROP TABLE Customers; --", 'header')).toThrow(TenantContextValidationError);
      expect(user.TenantContext).toBeUndefined();
    });

    it('rejects a value with HTML/script-like characters', () => {
      const user = {} as UserInfo;
      expect(() => attachTenantContext(user, 'tenant<script>alert(1)</script>', 'header')).toThrow(TenantContextValidationError);
    });

    it('rejects an oversized value (> 128 chars)', () => {
      const user = {} as UserInfo;
      const longId = 'a'.repeat(1000);
      expect(() => attachTenantContext(user, longId, 'header')).toThrow(TenantContextValidationError);
      expect(user.TenantContext).toBeUndefined();
    });

    it('rejects an empty string', () => {
      const user = {} as UserInfo;
      expect(() => attachTenantContext(user, '', 'header')).toThrow(TenantContextValidationError);
    });

    it('validates regardless of source (linkedEntity / custom), not just header', () => {
      const user = {} as UserInfo;
      expect(() => attachTenantContext(user, "' OR 1=1 --", 'linkedEntity')).toThrow(TenantContextValidationError);
      expect(() => attachTenantContext(user, "' OR 1=1 --", 'custom')).toThrow(TenantContextValidationError);
    });
  });

  // ─── createTenantMiddleware: fail-closed on malformed header, clone-before-mutate ───

  describe('createTenantMiddleware', () => {
    it('should skip tenant resolution when no userPayload on request', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const req = { headers: { 'x-tenant-id': 'tenant-1' } } as unknown as Parameters<typeof middleware>[0];
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should attach TenantContext to a CLONE, never mutating the shared userRecord in place', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1', UserRoles: [] } as unknown as UserInfo;
      const userPayload: { userRecord: UserInfo } = { userRecord };
      const req = {
        headers: { 'x-tenant-id': 'tenant-abc' },
        userPayload: { ...userPayload, email: 'test@test.com', sessionId: 's1' },
      } as unknown as Parameters<typeof middleware>[0];
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      // The ORIGINAL shared instance must be untouched.
      expect((userRecord as UserInfo).TenantContext).toBeUndefined();
      // The payload's userRecord must have been swapped for a clone carrying TenantContext.
      const sessionUser = (req as unknown as { userPayload: { userRecord: UserInfo } }).userPayload.userRecord;
      expect(sessionUser).not.toBe(userRecord);
      expect(sessionUser.TenantContext).toEqual({ TenantID: 'tenant-abc', Source: 'header' });
    });

    it('two concurrent requests for the same shared user with different headers do not cross-contaminate', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const sharedUserRecord = { ID: 'u1', UserRoles: [] } as unknown as UserInfo;

      const reqA = {
        headers: { 'x-tenant-id': 'tenant-A' },
        userPayload: { userRecord: sharedUserRecord, email: 'a@test.com', sessionId: 'sA' },
      } as unknown as Parameters<typeof middleware>[0];
      const reqB = {
        headers: { 'x-tenant-id': 'tenant-B' },
        userPayload: { userRecord: sharedUserRecord, email: 'b@test.com', sessionId: 'sB' },
      } as unknown as Parameters<typeof middleware>[0];
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<typeof middleware>[1];

      middleware(reqA, res, vi.fn());
      middleware(reqB, res, vi.fn());

      const userA = (reqA as unknown as { userPayload: { userRecord: UserInfo } }).userPayload.userRecord;
      const userB = (reqB as unknown as { userPayload: { userRecord: UserInfo } }).userPayload.userRecord;
      expect(userA.TenantContext?.TenantID).toBe('tenant-A');
      expect(userB.TenantContext?.TenantID).toBe('tenant-B');
      expect((sharedUserRecord as UserInfo).TenantContext).toBeUndefined();
    });

    it('rejects a malformed header with 400 and never degrades to an unscoped session', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1', UserRoles: [] } as unknown as UserInfo;
      const req = {
        headers: { 'x-tenant-id': "' OR 1=1 --" },
        userPayload: { userRecord, email: 'test@test.com', sessionId: 's1' },
      } as unknown as Parameters<typeof middleware>[0];
      const status = vi.fn().mockReturnThis();
      const json = vi.fn();
      const res = { status, json } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
      // Never falls through with an unscoped (TenantContext-less) session either.
      expect((req as unknown as { userPayload: { userRecord: UserInfo } }).userPayload.userRecord.TenantContext).toBeUndefined();
    });

    it('rejects an oversized header with 400', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1', UserRoles: [] } as unknown as UserInfo;
      const req = {
        headers: { 'x-tenant-id': 'a'.repeat(1000) },
        userPayload: { userRecord, email: 'test@test.com', sessionId: 's1' },
      } as unknown as Parameters<typeof middleware>[0];
      const status = vi.fn().mockReturnThis();
      const json = vi.fn();
      const res = { status, json } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a repeated header (array value) with 400 rather than guessing which value applies', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1', UserRoles: [] } as unknown as UserInfo;
      const req = {
        headers: { 'x-tenant-id': ['tenant-a', 'tenant-b'] },
        userPayload: { userRecord, email: 'test@test.com', sessionId: 's1' },
      } as unknown as Parameters<typeof middleware>[0];
      const status = vi.fn().mockReturnThis();
      const json = vi.fn();
      const res = { status, json } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive header name (Express lower-cases at parse time)', () => {
      const middleware = createTenantMiddleware(makeConfig({ tenantHeader: 'X-Tenant-ID' }));
      const userRecord = { ID: 'u1', UserRoles: [] } as unknown as UserInfo;
      const req = {
        headers: { 'x-tenant-id': 'tenant-xyz' },
        userPayload: { userRecord, email: 'test@test.com', sessionId: 's1' },
      } as unknown as Parameters<typeof middleware>[0];
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      const sessionUser = (req as unknown as { userPayload: { userRecord: UserInfo } }).userPayload.userRecord;
      expect(sessionUser.TenantContext).toEqual({ TenantID: 'tenant-xyz', Source: 'header' });
    });

    it('should not set TenantContext when header is missing, and does not clone unnecessarily', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1', UserRoles: [] } as unknown as UserInfo;
      const req = {
        headers: {},
        userPayload: { userRecord, email: 'test@test.com', sessionId: 's1' },
      } as unknown as Parameters<typeof middleware>[0];
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      const finalUserRecord = (req as unknown as { userPayload: { userRecord: UserInfo } }).userPayload.userRecord;
      expect(finalUserRecord).toBe(userRecord); // untouched, no clone needed
      expect(finalUserRecord.TenantContext).toBeUndefined();
    });
  });

  // ─── createTenantPreRunViewHook: escaping + real-column resolution + QuoteIdentifier ───

  describe('createTenantPreRunViewHook — injection-safe predicate construction', () => {
    it('escapes an embedded single quote in the tenant id (defense in depth beyond the boundary check)', () => {
      // TenantContext is set directly here (bypassing attachTenantContext) to exercise the
      // hook's OWN escaping — defense in depth per plan §4.1 fix (2): a future caller reaching
      // TenantContext from a non-header source must not be able to reintroduce the hole.
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = { ID: 'u1', TenantContext: { TenantID: "abc' OR '1'='1", Source: 'header' as const }, UserRoles: [] } as MockUser;

      const result = hook(params, user) as RunViewParams;

      expect(result.ExtraFilter).toBe("[OrganizationID] = 'abc'' OR ''1''=''1'");
      expect(result.ExtraFilter).not.toContain("= 'abc' OR '1'='1'");
    });

    it('produces a quoted, escaped predicate — no raw OR/UNION/semicolon structure survives', () => {
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = { ID: 'u1', TenantContext: { TenantID: "' UNION SELECT * FROM Users --", Source: 'header' as const }, UserRoles: [] } as MockUser;

      const result = hook(params, user) as RunViewParams;

      // The whole thing is one quoted string literal — verify structurally, not just substring.
      expect(result.ExtraFilter).toMatch(/^\[OrganizationID\] = '[^']*(?:''[^']*)*'$/);
    });

    it('should not filter when tenant ID is empty string (falsy)', () => {
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('');

      const result = hook(params, user) as RunViewParams;
      expect(result.ExtraFilter).toBe(''); // no filter applied
    });

    it('should handle UUID tenant ID (standard format)', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser(uuid);

      const result = hook(params, user) as RunViewParams;
      expect(result.ExtraFilter).toBe(`[OrganizationID] = '${uuid}'`);
    });

    it('throws (fails closed) when the tenant column is not a real, non-virtual field on the entity', () => {
      const hook = createTenantPreRunViewHook(makeConfig({
        entityColumnMappings: { 'Customers': 'DoesNotExist' },
      }));
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant-1');

      expect(() => hook(params, user)).toThrow(/does not resolve to a real, non-virtual field/);
    });

    // ─── Admin role matching edge cases ────────────────────────────────────

    describe('Admin role matching', () => {
      it('should be case-insensitive for admin role matching', () => {
        const hook = createTenantPreRunViewHook(makeConfig({ adminRoles: ['Admin'] }));
        const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;

        const user = makeUser('tenant-1', ['admin']);
        const result = hook(params, user) as RunViewParams;
        expect(result.ExtraFilter).toBe(''); // bypassed
      });

      it('should handle whitespace in role names', () => {
        const hook = createTenantPreRunViewHook(makeConfig({ adminRoles: [' Admin '] }));
        const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;

        const user = makeUser('tenant-1', ['Admin']);
        const result = hook(params, user) as RunViewParams;
        expect(result.ExtraFilter).toBe(''); // bypassed due to trim
      });

      it('should not bypass for non-admin roles', () => {
        const hook = createTenantPreRunViewHook(makeConfig({ adminRoles: ['Admin'] }));
        const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;

        const user = makeUser('tenant-1', ['User', 'Editor']);
        const result = hook(params, user) as RunViewParams;
        expect(result.ExtraFilter).toContain('OrganizationID');
      });

      it('should handle user with empty roles array', () => {
        const hook = createTenantPreRunViewHook(makeConfig());
        const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;

        const user = makeUser('tenant-1', []);
        const result = hook(params, user) as RunViewParams;
        expect(result.ExtraFilter).toContain('OrganizationID'); // not an admin
      });
    });

    // ─── Entity name matching edge cases ──────────────────────────────────

    describe('Entity name matching', () => {
      it('should be case-insensitive for entity names in allowlist', () => {
        const hook = createTenantPreRunViewHook(makeConfig({
          scopingStrategy: 'allowlist',
          scopedEntities: ['customers'],
        }));
        const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
        const user = makeUser('tenant-1');

        const result = hook(params, user) as RunViewParams;
        expect(result.ExtraFilter).toContain('OrganizationID');
      });

      it('should not filter when EntityName is missing from params', () => {
        const hook = createTenantPreRunViewHook(makeConfig());
        const params = { ExtraFilter: '' } as RunViewParams;
        const user = makeUser('tenant-1');

        const result = hook(params, user) as RunViewParams;
        expect(result.ExtraFilter).toBe('');
      });
    });
  });

  // ─── PreSave security edge cases (§4.3 — no change needed, confirm only) ───

  describe('PreSave security (§4.3 — unchanged, confirmed correct)', () => {
    function makeEntity(entityName: string, tenantValue: string | null, isSaved: boolean) {
      return {
        EntityInfo: { Name: entityName },
        IsSaved: isSaved,
        Get: vi.fn((col: string) => col === 'OrganizationID' ? tenantValue : null),
        Set: vi.fn(),
      } as unknown as Parameters<ReturnType<typeof createTenantPreSaveHook>>[0];
    }

    it('should reject save when the entity tenant column does not match the session TenantContext', () => {
      const hook = createTenantPreSaveHook(makeConfig());
      const entity = makeEntity('Customers', "' OR 1=1 --", true);
      const user = makeUser('tenant-abc');

      const result = hook(entity, user);
      expect(typeof result).toBe('string');
      expect(result).toContain('Save rejected');
    });

    it('should auto-assign tenant for new record even when entity has no EntityInfo', () => {
      const hook = createTenantPreSaveHook(makeConfig());
      const entity = {
        EntityInfo: undefined,
        IsSaved: false,
        Get: vi.fn(() => null),
        Set: vi.fn(),
      } as unknown as Parameters<ReturnType<typeof createTenantPreSaveHook>>[0];
      const user = makeUser('tenant-abc');

      // No EntityInfo → no entity name → not scoped → allow
      const result = hook(entity, user);
      expect(result).toBe(true);
    });

    it('should handle null contextUser gracefully', () => {
      const hook = createTenantPreSaveHook(makeConfig());
      const entity = makeEntity('Customers', 'tenant-abc', true);

      const result = hook(entity, undefined);
      expect(result).toBe(true); // no context = no validation
    });
  });
});
