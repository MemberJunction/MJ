import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';
import { EntityInfo } from '@memberjunction/core';
import { SQLLogging } from '../../Misc/sql_logging';

class TestableManageMetadata extends ManageMetadataBase {
   public async callDetectAndSetGeoCodingSupport(
      pool: CodeGenConnection,
      entity: EntityInfo
   ): Promise<void> {
      return this.detectAndSetGeoCodingSupport(pool, entity);
   }

   public getMethodArity(): number {
      return this.detectAndSetGeoCodingSupport.length;
   }
}

type QueryResolver = (sql: string) => Record<string, unknown>[];

function createMockConnection(resolver: QueryResolver, executedSql: string[]): CodeGenConnection {
   return {
      query: async (sql: string): Promise<CodeGenQueryResult> => {
         executedSql.push(sql);
         const recordset = resolver(sql);
         return { recordset } as CodeGenQueryResult;
      },
      queryWithParams: async (sql: string): Promise<CodeGenQueryResult> => {
         executedSql.push(sql);
         const recordset = resolver(sql);
         return { recordset } as CodeGenQueryResult;
      },
      beginTransaction: async () => ({
         commit: async () => {},
         rollback: async () => {},
      }),
   };
}

describe('T12 — Geo Coding Support from Persisted State (C2, §3.4)', () => {
   const mm = new TestableManageMetadata();

   let restoreSQLOutput: () => void;
   beforeAll(() => {
      restoreSQLOutput = SQLLogging.suppressOutputForTests();
   });
   afterAll(() => {
      restoreSQLOutput();
   });

   beforeEach(() => {
      ManageMetadataBase.clearFieldTracking();
   });

   it('(1) when DB query returns GeoFieldCount = 1, sets SupportsGeoCoding = 1 and enqueues view regen', async () => {
      const executedSql: string[] = [];
      const pool = createMockConnection((sql: string) => {
         if (sql.includes('AutoUpdateSupportsGeoCoding')) {
            return [{ AutoUpdateSupportsGeoCoding: true, SupportsGeoCoding: false }];
         }
         if (sql.includes('GeoFieldCount')) {
            return [{ GeoFieldCount: 1 }];
         }
         return [];
      }, executedSql);

      const entity = new EntityInfo({ ID: 'entity-geo-1', Name: 'LocationTest' });
      await mm.callDetectAndSetGeoCodingSupport(pool, entity);

      const updateStmts = executedSql.filter(s => s.includes('UPDATE') && s.includes('SupportsGeoCoding'));
      expect(updateStmts.length).toBe(1);
      expect(updateStmts[0]).toContain('[SupportsGeoCoding] = 1');
      expect(updateStmts[0]).toContain('entity-geo-1');

      // Verify enqueued for view regen
      const regenEntities = ManageMetadataBase.EntitiesRequiringViewRegen;
      expect(regenEntities.some(r => r.EntityName === 'LocationTest' && r.Reason === 'Geocoding')).toBe(true);
   });

   it('(2) when DB query returns GeoFieldCount = 0, does NOT set SupportsGeoCoding', async () => {
      const executedSql: string[] = [];
      const pool = createMockConnection((sql: string) => {
         if (sql.includes('AutoUpdateSupportsGeoCoding')) {
            return [{ AutoUpdateSupportsGeoCoding: true, SupportsGeoCoding: false }];
         }
         if (sql.includes('GeoFieldCount')) {
            return [{ GeoFieldCount: 0 }];
         }
         return [];
      }, executedSql);

      const entity = new EntityInfo({ ID: 'entity-geo-2', Name: 'NoGeoEntity' });
      await mm.callDetectAndSetGeoCodingSupport(pool, entity);

      const updateStmts = executedSql.filter(s => s.includes('UPDATE') && s.includes('SupportsGeoCoding'));
      expect(updateStmts.length).toBe(0);
   });

   it('(3) when AutoUpdateSupportsGeoCoding = false, no-ops without querying GeoFieldCount', async () => {
      const executedSql: string[] = [];
      let queriedGeoFieldCount = false;

      const pool = createMockConnection((sql: string) => {
         if (sql.includes('AutoUpdateSupportsGeoCoding')) {
            return [{ AutoUpdateSupportsGeoCoding: false, SupportsGeoCoding: false }];
         }
         if (sql.includes('GeoFieldCount')) {
            queriedGeoFieldCount = true;
            return [{ GeoFieldCount: 5 }];
         }
         return [];
      }, executedSql);

      const entity = new EntityInfo({ ID: 'entity-geo-3', Name: 'LockedGeoEntity' });
      await mm.callDetectAndSetGeoCodingSupport(pool, entity);

      expect(queriedGeoFieldCount).toBe(false);
      const updateStmts = executedSql.filter(s => s.includes('UPDATE') && s.includes('SupportsGeoCoding'));
      expect(updateStmts.length).toBe(0);
   });

   it('(4) signature accepts exactly 2 parameters (pool, entity) and drops fieldCategories', () => {
      expect(mm.getMethodArity()).toBe(2);
   });
});
