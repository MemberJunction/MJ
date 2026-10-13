import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateTenantPreRunViewHook, CreateTenantPreSaveHook } from '../multiTenancy/index.js';
import type { MultiTenancyConfig } from '../config.js';
import type { RunViewParams } from '@memberjunction/core';

// Mock @memberjunction/core Metadata for entity schema lookup.
// Use a class-based mock so `new Metadata().Entities` works reliably.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();

  class MockMetadata {
    Entities = [
      { Name: 'Customers', SchemaName: 'dbo' },
      { Name: 'Orders', SchemaName: 'dbo' },
      { Name: 'AI Models', SchemaName: '__mj' },
      { Name: 'Users', SchemaName: '__mj' },
    ];

    // The hook validates that the tenant column resolves to a real, stored
    // (non-virtual) field on the entity before interpolating it as an identifier.
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
        ],
      };
    }

    // QuoteFilterIdentifier reads the STATIC Metadata.Provider, matching a real
    // server (Metadata.Provider is a DatabaseProviderBase instance).
    static Provider = {
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
    tenantHeader: 'X-Tenant-ID',
    scopingStrategy: 'denylist',
    scopedEntities: [],
    autoExcludeCoreEntities: true,
    defaultTenantColumn: 'OrganizationID',
    entityColumnMappings: {},
    adminRoles: ['Admin', 'System'],
    writeProtection: 'strict',
    ...overrides,
  };
}

function makeUser(tenantId?: string, roles: string[] = []) {
  return {
    ID: 'user-1',
    TenantContext: tenantId ? { TenantID: tenantId, Source: 'header' as const } : undefined,
    UserRoles: roles.map(r => ({ Role: r, RoleID: `role-${r}`, UserID: 'user-1' })),
  } as Parameters<ReturnType<typeof CreateTenantPreRunViewHook>>[1];
}

describe('Multi-Tenancy Hooks', () => {
  describe('createTenantPreRunViewHook', () => {
    it('should inject tenant filter for scoped entity', () => {
      const hook = CreateTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant-abc');

      const result = hook(params, user);
      expect((result as RunViewParams).ExtraFilter).toBe("[OrganizationID] = 'tenant-abc'");
    });

    it('should AND with existing filter', () => {
      const hook = CreateTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: "Status = 'Active'" } as RunViewParams;
      const user = makeUser('tenant-abc');

      const result = hook(params, user);
      expect((result as RunViewParams).ExtraFilter).toBe(
        "(Status = 'Active') AND [OrganizationID] = 'tenant-abc'"
      );
    });

    it('should skip core __mj entities when autoExcludeCoreEntities is true', () => {
      const hook = CreateTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'AI Models', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant-abc');

      const result = hook(params, user);
      expect((result as RunViewParams).ExtraFilter).toBe('');
    });

    it('should not filter when user has no TenantContext', () => {
      const hook = CreateTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser(undefined);

      const result = hook(params, user);
      expect((result as RunViewParams).ExtraFilter).toBe('');
    });

    it('should bypass filtering for admin users', () => {
      const hook = CreateTenantPreRunViewHook(makeConfig());
      const params = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant-abc', ['Admin']);

      const result = hook(params, user);
      expect((result as RunViewParams).ExtraFilter).toBe('');
    });

    it('should use entity column mapping override', () => {
      const hook = CreateTenantPreRunViewHook(makeConfig({
        entityColumnMappings: { 'Orders': 'TenantID' },
      }));
      const params = { EntityName: 'Orders', ExtraFilter: '' } as RunViewParams;
      const user = makeUser('tenant-xyz');

      const result = hook(params, user);
      expect((result as RunViewParams).ExtraFilter).toBe("[TenantID] = 'tenant-xyz'");
    });

    it('should respect allowlist scoping strategy', () => {
      const hook = CreateTenantPreRunViewHook(makeConfig({
        scopingStrategy: 'allowlist',
        scopedEntities: ['Customers'],
      }));
      const user = makeUser('tenant-abc');

      // Customers is in the allowlist → should be filtered
      const params1 = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const result1 = hook(params1, user);
      expect((result1 as RunViewParams).ExtraFilter).toContain('OrganizationID');

      // Orders is NOT in the allowlist → should NOT be filtered
      const params2 = { EntityName: 'Orders', ExtraFilter: '' } as RunViewParams;
      const result2 = hook(params2, user);
      expect((result2 as RunViewParams).ExtraFilter).toBe('');
    });

    it('should respect denylist scoping strategy', () => {
      const hook = CreateTenantPreRunViewHook(makeConfig({
        scopingStrategy: 'denylist',
        scopedEntities: ['Orders'],
      }));
      const user = makeUser('tenant-abc');

      // Orders is in the denylist → should NOT be filtered
      const params1 = { EntityName: 'Orders', ExtraFilter: '' } as RunViewParams;
      const result1 = hook(params1, user);
      expect((result1 as RunViewParams).ExtraFilter).toBe('');

      // Customers is NOT in the denylist → should be filtered
      const params2 = { EntityName: 'Customers', ExtraFilter: '' } as RunViewParams;
      const result2 = hook(params2, user);
      expect((result2 as RunViewParams).ExtraFilter).toContain('OrganizationID');
    });
  });

  describe('createTenantPreSaveHook', () => {
    function makeEntity(entityName: string, tenantValue: string | null, isSaved: boolean) {
      return {
        EntityInfo: { Name: entityName },
        IsSaved: isSaved,
        Get: vi.fn((col: string) => col === 'OrganizationID' ? tenantValue : null),
        Set: vi.fn(),
      } as unknown as Parameters<ReturnType<typeof CreateTenantPreSaveHook>>[0];
    }

    it('should allow save when tenant matches', () => {
      const hook = CreateTenantPreSaveHook(makeConfig());
      const entity = makeEntity('Customers', 'tenant-abc', true);
      const user = makeUser('tenant-abc');

      const result = hook(entity, user);
      expect(result).toBe(true);
    });

    it('should reject save in strict mode when tenant mismatches', () => {
      const hook = CreateTenantPreSaveHook(makeConfig());
      const entity = makeEntity('Customers', 'tenant-other', true);
      const user = makeUser('tenant-abc');

      const result = hook(entity, user);
      expect(typeof result).toBe('string');
      expect(result).toContain('Save rejected');
    });

    it('should warn but allow in log mode when tenant mismatches', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const hook = CreateTenantPreSaveHook(makeConfig({ writeProtection: 'log' }));
      const entity = makeEntity('Customers', 'tenant-other', true);
      const user = makeUser('tenant-abc');

      const result = hook(entity, user);
      expect(result).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[MultiTenancy]'));
      warnSpy.mockRestore();
    });

    it('should allow when writeProtection is off', () => {
      const hook = CreateTenantPreSaveHook(makeConfig({ writeProtection: 'off' }));
      const entity = makeEntity('Customers', 'tenant-other', true);
      const user = makeUser('tenant-abc');

      const result = hook(entity, user);
      expect(result).toBe(true);
    });

    it('should auto-assign tenant for new records without tenant value', () => {
      const hook = CreateTenantPreSaveHook(makeConfig());
      const entity = makeEntity('Customers', null, false);
      const user = makeUser('tenant-abc');

      const result = hook(entity, user);
      expect(result).toBe(true);
      expect(entity.Set).toHaveBeenCalledWith('OrganizationID', 'tenant-abc');
    });

    it('should bypass validation for admin users', () => {
      const hook = CreateTenantPreSaveHook(makeConfig());
      const entity = makeEntity('Customers', 'tenant-other', true);
      const user = makeUser('tenant-abc', ['Admin']);

      const result = hook(entity, user);
      expect(result).toBe(true);
    });

    it('should skip core __mj entities', () => {
      const hook = CreateTenantPreSaveHook(makeConfig());
      const entity = makeEntity('AI Models', 'any-tenant', true);
      const user = makeUser('tenant-abc');

      const result = hook(entity, user);
      expect(result).toBe(true);
    });
  });
});
