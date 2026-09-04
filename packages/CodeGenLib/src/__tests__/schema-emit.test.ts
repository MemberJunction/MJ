import { describe, it, expect } from 'vitest';
import {
  buildSchemaBarrel,
  collectDirtySchemas,
  groupEntitiesBySchema,
  mapLimit,
  resolveDirtySchemasForEmit,
  selectOrphanedSchemaFiles,
  sanitizeSchemaFileName,
  schemaKey,
  schemaNameMatches,
  schemasToEmit,
} from '../Misc/schema-emit';

describe('schema-emit', () => {
  describe('schemaNameMatches', () => {
    it('matches exact names case-insensitively', () => {
      expect(schemaNameMatches('bsd_crm', 'BSD_CRM')).toBe(true);
      expect(schemaNameMatches('bsd_crm', 'bsd_billing')).toBe(false);
    });

    it('does not throw when the schema name is null or empty', () => {
      expect(schemaNameMatches('bsd_%', null as unknown as string)).toBe(false);
      expect(schemaNameMatches('bsd_%', undefined)).toBe(false);
      expect(sanitizeSchemaFileName(null)).toBe('schema');
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

    it('ignores null or empty dirty names instead of throwing', () => {
      const schemas = collectDirtySchemas(
        [{ Name: 'Customers', SchemaName: 'crm' }],
        [null as unknown as string, '', 'Customers'],
      );
      expect([...schemas]).toEqual(['crm']);
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

  describe('resolveDirtySchemasForEmit', () => {
    const entities = [
      { Name: 'Customers', SchemaName: 'crm' },
      { Name: 'Invoices', SchemaName: 'billing' },
    ];

    it('rebuilds every schema on --skipdb', () => {
      expect(resolveDirtySchemasForEmit(entities, ['Customers'], true, true)).toBe('all');
    });

    it('rebuilds every schema when dirtySchemaOnly is off', () => {
      expect(resolveDirtySchemasForEmit(entities, [], false, false)).toBe('all');
    });

    it('returns only schemas that contain a new/modified entity', () => {
      const dirty = resolveDirtySchemasForEmit(entities, ['Invoices'], false, true);
      expect(dirty).toBeInstanceOf(Set);
      expect([...(dirty as Set<string>)]).toEqual(['billing']);
    });

    it('returns an empty set when nothing is dirty on a full run', () => {
      const dirty = resolveDirtySchemasForEmit(entities, [], false, true);
      expect(dirty).toBeInstanceOf(Set);
      expect((dirty as Set<string>).size).toBe(0);
    });

    it('marks a deleted entity\'s schema dirty even though the entity is gone from metadata', () => {
      // The deleted entity is absent from `entities`, so a name-based signal could never
      // resolve its schema — only the name captured at deletion time can.
      expect(resolveDirtySchemasForEmit(entities, [], false, true, ['billing'])).toEqual(new Set(['billing']));
    });

    it('unions deleted schemas with new/modified entity schemas', () => {
      expect(resolveDirtySchemasForEmit(entities, ['Invoices'], false, true, ['retired']))
        .toEqual(new Set(['billing', 'retired']));
    });

    it('ignores blank deleted schema names', () => {
      expect(resolveDirtySchemasForEmit(entities, [], false, true, ['', '   '])).toEqual(new Set());
    });

    it('still rebuilds everything when dirtySchemaOnly is off, deletions included', () => {
      expect(resolveDirtySchemasForEmit(entities, [], false, false, ['billing'])).toBe('all');
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

  describe('selectOrphanedSchemaFiles', () => {
    it('keeps a file for every live schema, dirty or not', () => {
      const files = ['__mj.ts', 'crm.ts', 'billing.ts'];
      expect(selectOrphanedSchemaFiles(files, ['__mj', 'crm', 'billing'])).toEqual([]);
    });

    it('reports a file whose schema is gone', () => {
      const files = ['__mj.ts', 'retired.ts'];
      expect(selectOrphanedSchemaFiles(files, ['__mj'])).toEqual(['retired.ts']);
    });

    it('matches on the sanitized name, not the raw schema name', () => {
      const files = [`${sanitizeSchemaFileName('MJ_BizApps.Orders')}.ts`];
      expect(selectOrphanedSchemaFiles(files, ['MJ_BizApps.Orders'])).toEqual([]);
    });

    it('ignores non-TypeScript files so nothing unrelated is deleted', () => {
      expect(selectOrphanedSchemaFiles(['__mj.ts', 'README.md', '.gitignore'], ['__mj'])).toEqual([]);
    });

    it('treats an empty schema set as everything orphaned', () => {
      expect(selectOrphanedSchemaFiles(['a.ts', 'b.ts'], [])).toEqual(['a.ts', 'b.ts']);
    });
  });
});
