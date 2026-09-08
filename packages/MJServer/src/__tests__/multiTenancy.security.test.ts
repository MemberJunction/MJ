/**
 * Security edge-case tests for multi-tenancy hooks.
 *
 * Tests SQL injection attempts in tenant IDs, boundary conditions,
 * and scoping strategy edge cases that go beyond the happy-path tests
 * in multiTenancy.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createTenantPreRunViewHook,
  createTenantPreSaveHook,
  createTenantMiddleware,
  IsValidTenantId,
  attachTenantContext,
} from '../multiTenancy/index.js';
import type { MultiTenancyConfig } from '../config.js';
import { Metadata } from '@memberjunction/core';
import type { RunViewParams, UserInfo, TenantContext } from '@memberjunction/core';

// Mock @memberjunction/core Metadata for entity schema lookup.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();

  class MockMetadata {
    Entities = [
      { Name: 'Customers', SchemaName: 'dbo' },
      { Name: 'Orders', SchemaName: 'dbo' },
      { Name: 'Users', SchemaName: '__mj' },
    ];

    // The hook validates that the tenant column resolves to a real, stored
    // (non-virtual) field before interpolating it as an identifier.
    EntityByName(name: string) {
      const entity = this.Entities.find(
        e => e.Name.trim().toLowerCase() === name.trim().toLowerCase()
      );
      if (!entity) return undefined;
      return {
        ...entity,
        Fields: [
          { Name: 'OrganizationID', IsVirtual: false },
          { Name: 'TenantID', IsVirtual: false },
          // A view-only column: must be REJECTED as a tenant column target
          { Name: 'OrganizationName', IsVirtual: true },
        ],
      };
    }

    // QuoteFilterIdentifier reads the STATIC Metadata.Provider, matching a real
    // server (Metadata.Provider is a DatabaseProviderBase instance). Tests that need
    // to exercise the no-provider-available fail-closed path override this locally.
    static Provider: { QuoteIdentifier: (name: string) => string } | undefined = {
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

// ─── SQL Injection in Tenant IDs ────────────────────────────────────────────

describe('Multi-Tenancy Security Edge Cases', () => {
  describe('SQL injection in tenant ID', () => {
    it('should escape quotes so an injection attempt stays INSIDE the string literal', () => {
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser("' OR 1=1 --");

      const result = hook(params, user) as RunViewParams;

      // The single quote is doubled at predicate construction, so the payload
      // cannot terminate the literal and rewrite the WHERE clause. (The header
      // boundary rejects this value outright via IsValidTenantId; this is the
      // defense-in-depth layer for TenantContext attached from other sources.)
      expect(result.ExtraFilter).toBe("[OrganizationID] = ''' OR 1=1 --'");
    });

    it('should escape quotes in a UNION attack payload', () => {
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser("' UNION SELECT * FROM Users --");

      const result = hook(params, user) as RunViewParams;
      // Leading quote doubled → the UNION text is inert literal content
      expect(result.ExtraFilter).toBe("[OrganizationID] = ''' UNION SELECT * FROM Users --'");
    });

    it('should escape quotes in a stacked-statement payload', () => {
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser("abc'; DROP TABLE Customers; --");

      const result = hook(params, user) as RunViewParams;
      expect(result.ExtraFilter).toBe("[OrganizationID] = 'abc''; DROP TABLE Customers; --'");
    });
  });

  // ─── Boundary validation: IsValidTenantId ───────────────────────────────

  describe('IsValidTenantId', () => {
    it('rejects a quote-based SQL injection payload', () => {
      expect(IsValidTenantId("x' OR '1'='1")).toBe(false);
    });

    it('rejects the empty string', () => {
      expect(IsValidTenantId('')).toBe(false);
    });

    it('rejects a 129-character string (max is 128)', () => {
      expect(IsValidTenantId('a'.repeat(129))).toBe(false);
    });

    it('accepts a 128-character string (boundary)', () => {
      expect(IsValidTenantId('a'.repeat(128))).toBe(true);
    });

    it('rejects whitespace, semicolons, and comparison operators', () => {
      expect(IsValidTenantId('tenant 1')).toBe(false);
      expect(IsValidTenantId('a;b')).toBe(false);
      expect(IsValidTenantId("1'='1")).toBe(false);
      expect(IsValidTenantId('a=b')).toBe(false);
    });

    it('accepts a standard GUID', () => {
      expect(IsValidTenantId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('accepts conservative identifiers with underscore, dot, and hyphen', () => {
      expect(IsValidTenantId('tenant_1.a-b')).toBe(true);
    });

    it('KNOWN GAP: accepts consecutive hyphens (SQL line-comment token) because GUIDs need hyphens', () => {
      // 'a--b' passes the character allowlist. This is safe today only because
      // every consumer interpolates the value inside a quote-escaped string
      // literal, where '--' is inert. If a future consumer places the tenant id
      // outside a quoted literal, this becomes a comment-injection vector —
      // flagged here so a tightening of the pattern flips this assertion.
      expect(IsValidTenantId('a--b')).toBe(true);
    });
  });

  // ─── attachTenantContext validation ─────────────────────────────────────

  describe('attachTenantContext', () => {
    function makePlainUser(): UserInfo {
      return { ID: 'user-1' } as unknown as UserInfo;
    }

    it('throws on an invalid tenant id instead of attaching it', () => {
      const user = makePlainUser();
      expect(() => attachTenantContext(user, "x' OR '1'='1", 'header')).toThrow(/Invalid tenant identifier/);
      expect(user.TenantContext).toBeUndefined();
    });

    it('throws on empty and oversized tenant ids', () => {
      const user = makePlainUser();
      expect(() => attachTenantContext(user, '', 'custom')).toThrow(/Invalid tenant identifier/);
      expect(() => attachTenantContext(user, 'a'.repeat(129), 'custom')).toThrow(/Invalid tenant identifier/);
    });

    it('attaches a valid tenant id with the given source', () => {
      const user = makePlainUser();
      attachTenantContext(user, 'tenant_1.a-b', 'linkedEntity');
      expect(user.TenantContext).toEqual<TenantContext>({ TenantID: 'tenant_1.a-b', Source: 'linkedEntity' });
    });
  });

  // ─── Tenant column resolution (identifier position) ─────────────────────

  describe('tenant column must resolve to a stored field', () => {
    it('produces an escaped-value predicate with a quoted identifier for a valid setup', () => {
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser("t'1"); // legal only via non-header sources; must still be escaped

      const result = hook(params, user) as RunViewParams;
      expect(result.ExtraFilter).toBe("[OrganizationID] = 't''1'");
    });

    it('throws when the configured tenant column does not exist on the entity', () => {
      const hook = createTenantPreRunViewHook(makeConfig({ defaultTenantColumn: 'NoSuchColumn' }));
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant-1');

      expect(() => hook(params, user)).toThrow(/does not resolve to a stored field/);
    });

    it('throws when the tenant column resolves only to a VIRTUAL field', () => {
      const hook = createTenantPreRunViewHook(makeConfig({ defaultTenantColumn: 'OrganizationName' }));
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant-1');

      expect(() => hook(params, user)).toThrow(/does not resolve to a stored field/);
    });

    it('throws when an entityColumnMappings override points at a nonexistent column', () => {
      const hook = createTenantPreRunViewHook(makeConfig({
        entityColumnMappings: { 'Customers': "Bad]Column" },
      }));
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant-1');

      expect(() => hook(params, user)).toThrow(/does not resolve to a stored field/);
    });

    it('throws (fails closed) rather than falling back to hardcoded bracket quoting when no provider is available', () => {
      const savedProvider = Metadata.Provider;
      // @ts-expect-error — simulating the no-provider-available case
      Metadata.Provider = undefined;
      try {
        const hook = createTenantPreRunViewHook(makeConfig());
        const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
        const user = makeUser('tenant-1');

        // A silent bracket-quoting fallback would produce invalid SQL on PostgreSQL
        // without ever surfacing an error — refusing to build the query at all is the
        // correct fail-closed behavior for a security-relevant identifier quote.
        expect(() => hook(params, user)).toThrow(/no database provider available to quote/);
      } finally {
        Metadata.Provider = savedProvider;
      }
    });
  });

  // ─── Tenant ID boundary values ──────────────────────────────────────────

  describe('Tenant ID boundary values', () => {
    it('should not filter when tenant ID is empty string (falsy)', () => {
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      // Empty string is falsy → makeUser sets TenantContext = undefined
      // This matches createTenantMiddleware behavior: `if (tenantId)` skips empty strings
      const user = makeUser('');

      const result = hook(params, user) as RunViewParams;
      expect(result.ExtraFilter).toBe(''); // no filter applied
    });

    it('should handle very long tenant ID', () => {
      const longId = 'a'.repeat(1000);
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser(longId);

      const result = hook(params, user) as RunViewParams;
      expect(result.ExtraFilter).toContain(longId);
    });

    it('should handle UUID tenant ID (standard format)', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser(uuid);

      const result = hook(params, user) as RunViewParams;
      expect(result.ExtraFilter).toBe(`[OrganizationID] = '${uuid}'`);
    });

    it('should handle tenant ID with special characters', () => {
      const hook = createTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant<script>alert(1)</script>');

      const result = hook(params, user) as RunViewParams;
      expect(result.ExtraFilter).toContain('<script>');
    });
  });

  // ─── Admin role matching edge cases ────────────────────────────────────

  describe('Admin role matching', () => {
    it('should be case-insensitive for admin role matching', () => {
      const hook = createTenantPreRunViewHook(makeConfig({ adminRoles: ['Admin'] }));
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;

      // User role is 'admin' (lowercase), config has 'Admin'
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

    it('should handle whitespace in entity names', () => {
      const hook = createTenantPreRunViewHook(makeConfig({
        scopingStrategy: 'allowlist',
        scopedEntities: [' Customers '],
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

  // ─── Tenant middleware edge cases ─────────────────────────────────────

  describe('createTenantMiddleware', () => {
    it('should skip tenant resolution when no userPayload on request', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const req = { headers: { 'x-tenant-id': 'tenant-1' } } as unknown as Parameters<typeof middleware>[0];
      const res = {} as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should attach TenantContext to a CLONED userRecord when userPayload and header are present', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1' } as Record<string, unknown>;
      const userPayload = { userRecord, email: 'test@test.com', sessionId: 's1' };
      const req = {
        headers: { 'x-tenant-id': 'tenant-abc' },
        userPayload,
      } as unknown as Parameters<typeof middleware>[0];
      const res = {} as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      // Clone-before-stamp: the SHARED cached record must never be mutated —
      // stamping it in place leaks one session's tenant to concurrent sessions.
      expect(userRecord['TenantContext']).toBeUndefined();
      const stamped = userPayload.userRecord as unknown as UserInfo;
      expect(stamped).not.toBe(userRecord);
      expect(stamped.ID).toBe('u1');
      expect(stamped.TenantContext).toEqual({
        TenantID: 'tenant-abc',
        Source: 'header',
      });
    });

    it('should reject an invalid tenant header with 400 and never attach or continue', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1' } as Record<string, unknown>;
      const userPayload = { userRecord, email: 'test@test.com', sessionId: 's1' };
      const req = {
        headers: { 'x-tenant-id': "x' OR '1'='1" },
        userPayload,
      } as unknown as Parameters<typeof middleware>[0];
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const res = { status } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      // Reject the REQUEST — never degrade to an unscoped (fail-open) session
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid tenant identifier' });
      expect(next).not.toHaveBeenCalled();
      expect(userPayload.userRecord).toBe(userRecord);
      expect(userRecord['TenantContext']).toBeUndefined();
    });

    it('should handle case-insensitive header name', () => {
      const middleware = createTenantMiddleware(makeConfig({ tenantHeader: 'X-Tenant-ID' }));
      const userRecord = { ID: 'u1' } as Record<string, unknown>;
      const userPayload = { userRecord, email: 'test@test.com', sessionId: 's1' };
      const req = {
        // Express normalizes headers to lowercase
        headers: { 'x-tenant-id': 'tenant-xyz' },
        userPayload,
      } as unknown as Parameters<typeof middleware>[0];
      const res = {} as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect((userPayload.userRecord as unknown as UserInfo).TenantContext).toEqual({
        TenantID: 'tenant-xyz',
        Source: 'header',
      });
    });

    it('should not set TenantContext when header is missing', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1' } as Record<string, unknown>;
      const req = {
        headers: {},
        userPayload: { userRecord, email: 'test@test.com', sessionId: 's1' },
      } as unknown as Parameters<typeof middleware>[0];
      const res = {} as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(userRecord['TenantContext']).toBeUndefined();
    });

    it('should reject a repeated header (array value) with 400 rather than guessing which value applies', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const userRecord = { ID: 'u1' } as Record<string, unknown>;
      const userPayload = { userRecord, email: 'test@test.com', sessionId: 's1' };
      const req = {
        // Express delivers a repeated header as string[]
        headers: { 'x-tenant-id': ['tenant-A', 'tenant-B'] },
        userPayload,
      } as unknown as Parameters<typeof middleware>[0];
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const res = { status } as unknown as Parameters<typeof middleware>[1];
      const next = vi.fn();

      middleware(req, res, next);

      expect(status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(userPayload.userRecord).toBe(userRecord);
      expect(userRecord['TenantContext']).toBeUndefined();
    });

    it('two concurrent requests for the same shared user with different headers do not cross-contaminate', () => {
      const middleware = createTenantMiddleware(makeConfig());
      const sharedUserRecord = { ID: 'u1', UserRoles: [] } as unknown as Record<string, unknown>;

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
      expect((sharedUserRecord as unknown as UserInfo).TenantContext).toBeUndefined();
    });
  });

  // ─── PreSave security edge cases ──────────────────────────────────────

  describe('PreSave security', () => {
    function makeEntity(entityName: string, tenantValue: string | null, isSaved: boolean) {
      return {
        EntityInfo: { Name: entityName },
        IsSaved: isSaved,
        Get: vi.fn((col: string) => col === 'OrganizationID' ? tenantValue : null),
        Set: vi.fn(),
      } as unknown as Parameters<ReturnType<typeof createTenantPreSaveHook>>[0];
    }

    it('should reject save with SQL injection in entity tenant column', () => {
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
