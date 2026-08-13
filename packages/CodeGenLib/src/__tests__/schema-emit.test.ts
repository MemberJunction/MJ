import { describe, it, expect } from 'vitest';
import {
  buildSchemaBarrel,
  collectDirtySchemas,
  groupEntitiesBySchema,
  mapLimit,
  sanitizeSchemaFileName,
  schemaNameMatches,
  schemasToEmit,
} from '../Misc/schema-emit';

describe('schema-emit', () => {
  describe('schemaNameMatches', () => {
    it('matches exact names case-insensitively', () => {
      expect(schemaNameMatches('bsd_crm', 'BSD_CRM')).toBe(true);
      expect(schemaNameMatches('bsd_crm', 'bsd_billing')).toBe(false);
    });

    it('treats % as the only wildcard and leaves underscores literal', () => {
      expect(schemaNameMatches('bsd_%', 'bsd_crm')).toBe(true);
      expect(schemaNameMatches('bsd_%', 'bsd_billing')).toBe(true);
      expect(schemaNameMatches('bsd_%', 'other_crm')).toBe(false);
      expect(schemaNameMatches('bsd_crm', 'bsdXcrm')).toBe(false);
    });
  });

  describe('sanitizeSchemaFileName', () => {
    it('keeps ordinary SQL schema names intact', () => {
      expect(sanitizeSchemaFileName('__mj')).toBe('__mj');
      expect(sanitizeSchemaFileName('bsd_crm')).toBe('bsd_crm');
    });

    it('replaces characters that are not safe in a file stem', () => {
      expect(sanitizeSchemaFileName('Sales.Analytics')).toBe('Sales_Analytics');
    });
  });

  describe('groupEntitiesBySchema', () => {
    it('groups by trimmed SchemaName and preserves input order', () => {
      const grouped = groupEntitiesBySchema([
        { SchemaName: 'crm', Name: 'A' },
        { SchemaName: ' billing ', Name: 'B' },
        { SchemaName: 'crm', Name: 'C' },
      ]);
      expect([...grouped.keys()]).toEqual(['crm', 'billing']);
      expect(grouped.get('crm')?.map((e) => e.Name)).toEqual(['A', 'C']);
    });
  });

  describe('collectDirtySchemas', () => {
    it('maps dirty entity names back to their schemas', () => {
      const schemas = collectDirtySchemas(
        [
          { Name: 'Customers', SchemaName: 'crm' },
          { Name: 'Invoices', SchemaName: 'billing' },
          { Name: 'Invoice Lines', SchemaName: 'billing' },
        ],
        ['invoices'],
      );
      expect([...schemas]).toEqual(['billing']);
    });

    it('returns an empty set when nothing is dirty', () => {
      expect(collectDirtySchemas([{ Name: 'Customers', SchemaName: 'crm' }], []).size).toBe(0);
    });
  });

  describe('schemasToEmit', () => {
    it('emits every schema when dirty is all', () => {
      expect(schemasToEmit(['crm', 'billing'], 'all', () => true)).toEqual(['crm', 'billing']);
    });

    it('always emits a schema whose file is missing', () => {
      const result = schemasToEmit(['crm', 'billing'], new Set(), (s) => s !== 'billing');
      expect(result).toEqual(['billing']);
    });

    it('emits only dirty schemas whose files already exist', () => {
      const result = schemasToEmit(['crm', 'billing'], new Set(['crm']), () => true);
      expect(result).toEqual(['crm']);
    });
  });

  describe('buildSchemaBarrel', () => {
    it('re-exports each schema file with a .js specifier, sorted', () => {
      const barrel = buildSchemaBarrel(['billing', 'crm'], 'entities', 'export const loadModule = () => {}\n\n');
      expect(barrel).toContain("export * from './entities/billing.js';");
      expect(barrel).toContain("export * from './entities/crm.js';");
      expect(barrel.indexOf('billing')).toBeLessThan(barrel.indexOf('crm'));
    });
  });

  describe('mapLimit', () => {
    it('preserves order and honors the concurrency cap', async () => {
      const seen: number[] = [];
      let live = 0;
      let maxLive = 0;
      const result = await mapLimit([1, 2, 3, 4], 2, async (n) => {
        live += 1;
        maxLive = Math.max(maxLive, live);
        seen.push(n);
        await Promise.resolve();
        live -= 1;
        return n * 10;
      });
      expect(result).toEqual([10, 20, 30, 40]);
      expect(maxLive).toBeLessThanOrEqual(2);
      expect(seen).toHaveLength(4);
    });
  });
});
