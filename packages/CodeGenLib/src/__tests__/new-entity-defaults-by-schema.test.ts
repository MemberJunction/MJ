/**
 * Per-schema creation-time entity flags (newEntityDefaults.DefaultsBySchema).
 *
 * The motivating case is an integration mirror schema: its entities receive high-volume synced
 * data, and the platform defaults — TrackRecordChanges on, and the geo auto-detect pass flipping
 * SupportsGeoCoding on for address-like columns — charge every write a per-record side trip.
 * These tests pin the INSERT that createNewEntityInsertSQL emits: a schema listed in
 * DefaultsBySchema gets its flags at creation (including AutoUpdateSupportsGeoCoding=false,
 * which the auto-detect pass treats as a lock, so the shield is permanent), while every other
 * schema's INSERT is byte-for-byte what it was before the feature existed.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));

const newEntityDefaults: Record<string, unknown> = vi.hoisted(() => ({
   TrackRecordChanges: true,
   AuditRecordAccess: undefined,
   AuditViewRuns: undefined,
   AllowAllRowsAPI: undefined,
   AllowCreateAPI: undefined,
   AllowUpdateAPI: undefined,
   AllowDeleteAPI: undefined,
   AllowUserSearchAPI: undefined,
   UserViewMaxRows: undefined,
   AllowCaching: false,
   AllowCachingBySchema: [],
   SupportsGeoCoding: undefined,
   AutoUpdateSupportsGeoCoding: undefined,
   DefaultsBySchema: [
      { SchemaName: 'netsuite', TrackRecordChanges: false, SupportsGeoCoding: false, AutoUpdateSupportsGeoCoding: false },
      { SchemaName: '${mj_core_schema}', TrackRecordChanges: true },
   ],
}));

vi.mock('../Config/config', () => ({
   configInfo: { newEntityDefaults },
   currentWorkingDirectory: '/tmp',
   getSettingValue: vi.fn(),
   mj_core_schema: () => '__mj',
   dbPlatform: () => 'sqlserver',
   outputDir: '/tmp',
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logMessage: vi.fn(), logStatus: vi.fn() }));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
vi.mock('../Misc/sql_logging', () => ({ SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) } }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';

class TestableInsert extends ManageMetadataBase {
   constructor(private readonly _dialect: SQLDialect) { super(); }
   protected get dialect(): SQLDialect { return this._dialect; }
   public buildInsert(schemaName: string, tableName: string): string {
      return this.createNewEntityInsertSQL(
         '11111111-1111-1111-1111-111111111111',
         tableName,
         { SchemaName: schemaName, TableName: tableName, EntityDescription: null },
         '',
         null,
      );
   }
}

describe('createNewEntityInsertSQL — per-schema creation flags', () => {
   it('a mirror schema gets all three flags false at creation (SQL Server literals)', () => {
      const sql = new TestableInsert(new SQLServerDialect()).buildInsert('netsuite', 'customer');
      expect(sql).toContain('[TrackRecordChanges]');
      expect(sql).toContain('[SupportsGeoCoding]');
      expect(sql).toContain('[AutoUpdateSupportsGeoCoding]');
      // Column order in the list is TrackRecordChanges, SupportsGeoCoding,
      // AutoUpdateSupportsGeoCoding — the value list carries 0, 0, 0 in the same positions.
      const valuesSection = sql.slice(sql.indexOf('VALUES'));
      const zeros = valuesSection.match(/,\s*0\b/g) ?? [];
      expect(zeros.length).toBeGreaterThanOrEqual(3);
   });

   it('a mirror schema gets the flags on PostgreSQL too, with boolean literals', () => {
      const sql = new TestableInsert(new PostgreSQLDialect()).buildInsert('netsuite', 'customer');
      expect(sql).toContain('"SupportsGeoCoding"');
      expect(sql).toContain('"AutoUpdateSupportsGeoCoding"');
      expect(sql.slice(sql.indexOf('VALUES'))).toContain('false');
   });

   it('an unlisted schema is untouched: global TrackRecordChanges applies, geo columns are OMITTED', () => {
      const sql = new TestableInsert(new SQLServerDialect()).buildInsert('crm', 'Account');
      expect(sql).toContain('[TrackRecordChanges]'); // global default (true) still emitted
      expect(sql).not.toContain('SupportsGeoCoding'); // unset globally → column omitted, DB default applies
      expect(sql).not.toContain('AutoUpdateSupportsGeoCoding');
   });

   it('a per-schema entry only overrides the flags it names', () => {
      // ${mj_core_schema} expands to __mj; its entry sets ONLY TrackRecordChanges.
      const sql = new TestableInsert(new SQLServerDialect()).buildInsert('__mj', 'SomeTable');
      expect(sql).toContain('[TrackRecordChanges]');
      expect(sql).not.toContain('SupportsGeoCoding'); // not named → global (unset) → omitted
   });
});
