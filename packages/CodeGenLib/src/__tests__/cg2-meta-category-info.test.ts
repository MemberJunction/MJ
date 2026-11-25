/**
 * Field-category settings and the form-layout gate (manage-metadata.ts).
 *   - #5369: applyCategoryInfoSettings MERGES the LLM's categoryInfo into the stored
 *     FieldCategoryInfo / FieldCategoryIcons settings instead of replacing them, so categories the
 *     LLM was not shown keep their icon, description and IS-A inheritance markers.
 *   - #4831: NeedsFormLayoutGeneration lets an explicit backfill request (forceRegeneration.enabled,
 *     set by --force-advanced-gen) categorize fields whose Category is already blank.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executed = vi.hoisted(() => ({ statements: [] as string[] }));

vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async (_pool: unknown, sql: string) => { executed.statements.push(sql); return {}; }) },
}));

import { ManageMetadataBase } from '../Database/manage-metadata';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import type { FieldCategoryInfo } from '@memberjunction/core';

class TestableCategoryInfo extends ManageMetadataBase {
   /** setting Name → stored Value; absent means no row */
   public Stored = new Map<string, string>();
   protected get dialect(): SQLDialect { return new SQLServerDialect(); }
   protected qsql(sql: string): string { return sql; }
   protected async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
      for (const name of ['FieldCategoryInfo', 'FieldCategoryIcons']) {
         if (sql.includes(`'${name}'`)) {
            const value = this.Stored.get(name);
            return { recordset: value === undefined ? [] : [{ ID: `setting-${name}`, Value: value }] };
         }
      }
      return { recordset: [] };
   }
   public async Apply(info: Record<string, FieldCategoryInfo>): Promise<void> {
      await this.applyCategoryInfoSettings({} as CodeGenConnection, 'ENTITY-1', info);
   }
}

/** The JSON written by the captured UPDATE for a setting, parsed back. */
function writtenValue(settingName: string): Record<string, unknown> | null {
   const stmt = executed.statements.find(s => s.includes('UPDATE') && s.includes(`'${settingName}'`));
   if (!stmt) return null;
   const match = stmt.match(/SET \[Value\] = '([\s\S]*?)', \[__mj_UpdatedAt\]/);
   return match ? JSON.parse(match[1].replace(/''/g, "'")) : null;
}

const STORED_INFO: Record<string, FieldCategoryInfo> = {
   'Company Details': { icon: 'fa-building', description: 'Inherited company fields', inheritedFromEntityID: 'PARENT-1', inheritedFromEntityName: 'MJ: Companies' },
   'Rule Configuration': { icon: 'fa-sliders', description: 'How the rule behaves' },
};
const STORED_ICONS = { 'Company Details': 'fa-building', 'Rule Configuration': 'fa-sliders' };

beforeEach(() => {
   executed.statements = [];
});

describe('MergeFieldCategoryInfo (#5369)', () => {
   it('keeps stored categories, adds new ones, and updates only the categories the result describes', () => {
      const merged = ManageMetadataBase.MergeFieldCategoryInfo(STORED_INFO, {
         'Rule Configuration': { icon: 'fa-gear', description: 'Rule settings' },
         'Concession Limits': { icon: 'fa-percent', description: 'Limits' },
      });
      expect(Object.keys(merged).sort()).toEqual(['Company Details', 'Concession Limits', 'Rule Configuration']);
      expect(merged['Company Details']).toEqual(STORED_INFO['Company Details']);
      expect(merged['Rule Configuration']).toEqual({ icon: 'fa-gear', description: 'Rule settings' });
      expect(merged['Concession Limits']).toEqual({ icon: 'fa-percent', description: 'Limits' });
   });

   it('keeps IS-A inheritance markers when the result redescribes an inherited category', () => {
      const merged = ManageMetadataBase.MergeFieldCategoryInfo(STORED_INFO, {
         'Company Details': { icon: 'fa-align-left', description: 'Company' },
      });
      expect(merged['Company Details']).toEqual({
         icon: 'fa-align-left', description: 'Company', inheritedFromEntityID: 'PARENT-1', inheritedFromEntityName: 'MJ: Companies',
      });
   });

   it('does not let an undefined property erase a stored one', () => {
      const incoming = { 'Company Details': { icon: 'fa-x', description: 'd', inheritedFromEntityName: undefined } } as Record<string, FieldCategoryInfo>;
      const merged = ManageMetadataBase.MergeFieldCategoryInfo(STORED_INFO, incoming);
      expect(merged['Company Details'].inheritedFromEntityName).toBe('MJ: Companies');
   });

   it('modifies neither input', () => {
      const stored = JSON.parse(JSON.stringify(STORED_INFO)) as Record<string, FieldCategoryInfo>;
      const incoming: Record<string, FieldCategoryInfo> = { New: { icon: 'fa-n', description: 'n' } };
      ManageMetadataBase.MergeFieldCategoryInfo(stored, incoming);
      expect(stored).toEqual(STORED_INFO);
      expect(Object.keys(incoming)).toEqual(['New']);
   });
});

describe('applyCategoryInfoSettings merges with the stored settings (#5369)', () => {
   it('writes the merged map, not only the new category, to both settings', async () => {
      const mm = new TestableCategoryInfo();
      mm.Stored.set('FieldCategoryInfo', JSON.stringify(STORED_INFO));
      mm.Stored.set('FieldCategoryIcons', JSON.stringify(STORED_ICONS));

      await mm.Apply({ 'Concession Limits': { icon: 'fa-percent', description: 'Limits' } });

      expect(executed.statements).toHaveLength(2);
      const info = writtenValue('FieldCategoryInfo');
      expect(info).toEqual({ ...STORED_INFO, 'Concession Limits': { icon: 'fa-percent', description: 'Limits' } });
      expect(writtenValue('FieldCategoryIcons')).toEqual({ ...STORED_ICONS, 'Concession Limits': 'fa-percent' });
   });

   it('writes nothing when the result only repeats what is stored', async () => {
      const mm = new TestableCategoryInfo();
      mm.Stored.set('FieldCategoryInfo', JSON.stringify(STORED_INFO));
      mm.Stored.set('FieldCategoryIcons', JSON.stringify(STORED_ICONS));

      await mm.Apply({ 'Rule Configuration': { icon: 'fa-sliders', description: 'How the rule behaves' } });

      expect(executed.statements).toHaveLength(0);
   });

   it('keeps a category only the legacy icons setting knows', async () => {
      const mm = new TestableCategoryInfo();
      mm.Stored.set('FieldCategoryInfo', JSON.stringify(STORED_INFO));
      mm.Stored.set('FieldCategoryIcons', JSON.stringify({ ...STORED_ICONS, Legacy: 'fa-old' }));

      await mm.Apply({ 'Concession Limits': { icon: 'fa-percent', description: 'Limits' } });

      expect(writtenValue('FieldCategoryIcons')).toEqual({ ...STORED_ICONS, Legacy: 'fa-old', 'Concession Limits': 'fa-percent' });
   });

   it('overwrites an unreadable stored value with the incoming map', async () => {
      const mm = new TestableCategoryInfo();
      mm.Stored.set('FieldCategoryInfo', '{not json');
      mm.Stored.set('FieldCategoryIcons', '[1,2]');

      await mm.Apply({ General: { icon: 'fa-user', description: 'General' } });

      expect(writtenValue('FieldCategoryInfo')).toEqual({ General: { icon: 'fa-user', description: 'General' } });
      expect(writtenValue('FieldCategoryIcons')).toEqual({ General: 'fa-user' });
   });

   it('still INSERTs both settings when none are stored', async () => {
      const mm = new TestableCategoryInfo();
      await mm.Apply({ General: { icon: 'fa-user', description: 'General' } });
      expect(executed.statements).toHaveLength(2);
      expect(executed.statements.every(s => s.includes('INSERT INTO'))).toBe(true);
   });
});

describe('ParseStoredSettingObject', () => {
   it('returns objects and rejects everything else', () => {
      expect(ManageMetadataBase.ParseStoredSettingObject<Record<string, string>>('{"a":"b"}')).toEqual({ a: 'b' });
      expect(ManageMetadataBase.ParseStoredSettingObject<Record<string, string>>({ a: 'b' })).toEqual({ a: 'b' });
      expect(ManageMetadataBase.ParseStoredSettingObject('[1]')).toBeNull();
      expect(ManageMetadataBase.ParseStoredSettingObject('"x"')).toBeNull();
      expect(ManageMetadataBase.ParseStoredSettingObject('null')).toBeNull();
      expect(ManageMetadataBase.ParseStoredSettingObject('{bad')).toBeNull();
   });
});

describe('NeedsFormLayoutGeneration (#4831)', () => {
   const base = { HasChangeEvent: false, HasReopenedFields: false, HasBlankCategories: false, BackfillRequested: false };

   it('does not run for blank categories without a change event or a backfill request (no loop)', () => {
      expect(ManageMetadataBase.NeedsFormLayoutGeneration({ ...base, HasBlankCategories: true })).toBe(false);
   });

   it('runs for blank categories when a backfill is requested, with no change event', () => {
      expect(ManageMetadataBase.NeedsFormLayoutGeneration({ ...base, HasBlankCategories: true, BackfillRequested: true })).toBe(true);
   });

   it('a backfill request alone does not run when there is nothing blank', () => {
      expect(ManageMetadataBase.NeedsFormLayoutGeneration({ ...base, BackfillRequested: true })).toBe(false);
   });

   it('keeps the event-driven behavior', () => {
      expect(ManageMetadataBase.NeedsFormLayoutGeneration({ ...base, HasChangeEvent: true, HasBlankCategories: true })).toBe(true);
      expect(ManageMetadataBase.NeedsFormLayoutGeneration({ ...base, HasChangeEvent: true, HasReopenedFields: true })).toBe(true);
      expect(ManageMetadataBase.NeedsFormLayoutGeneration({ ...base, HasChangeEvent: true })).toBe(false);
   });
});
