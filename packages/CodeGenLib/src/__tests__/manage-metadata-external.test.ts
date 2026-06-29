import { describe, it, expect, beforeEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';

/**
 * Tests for the External Data Sources field-sync DATA-LOSS guards in `manageSingleExternalEntity`.
 * These two helpers are the destructive-risk core: a permission-limited / transient / partial
 * remote introspection must NOT be read as "the entity now has no fields" and wipe every
 * EntityField. The helpers build SQL strings / return decisions only (no DB), so no provider or
 * config is needed — same test seam as the smart-field-identification guardrail tests.
 */
class TestableManageMetadata extends ManageMetadataBase {
  public isSyncable(obj: { Columns?: unknown[] } | null | undefined): boolean {
    return this.externalObjectIsSyncable(obj);
  }
  public removeSQL(schema: string, existing: Array<{ ID: string; Name: string }>, introspected: string[]): string {
    return this.buildExternalFieldRemoveSQL(schema, existing, introspected);
  }
}

describe('External-entity field sync — data-loss guards', () => {
  let mm: TestableManageMetadata;
  beforeEach(() => {
    mm = new TestableManageMetadata();
  });

  describe('externalObjectIsSyncable (the zero-column guard)', () => {
    it('is false for a missing object', () => {
      expect(mm.isSyncable(null)).toBe(false);
      expect(mm.isSyncable(undefined)).toBe(false);
    });
    it('is false for an object with zero / missing columns (permission-limited or transient introspection)', () => {
      expect(mm.isSyncable({ Columns: [] })).toBe(false);
      expect(mm.isSyncable({})).toBe(false);
    });
    it('is true only when the object actually has columns', () => {
      expect(mm.isSyncable({ Columns: [{ Name: 'id' }] })).toBe(true);
    });
  });

  describe('buildExternalFieldRemoveSQL', () => {
    const existing = [
      { ID: 'aaa', Name: 'ID' },
      { ID: 'bbb', Name: 'Name' },
      { ID: 'ccc', Name: 'Email' },
    ];

    it('removes nothing when every existing field is still present (case-insensitive)', () => {
      expect(mm.removeSQL('mj', existing, ['id', 'name', 'email'])).toBe('');
    });

    it('removes only the fields absent from the introspected set', () => {
      const sql = mm.removeSQL('mj', existing, ['ID', 'Name']); // Email dropped remotely
      expect(sql).toContain('DELETE FROM');
      expect(sql).toContain("'ccc'");
      expect(sql).not.toContain("'aaa'");
      expect(sql).not.toContain("'bbb'");
    });

    it('would remove ALL fields given an empty introspection — exactly the wipe that externalObjectIsSyncable prevents', () => {
      const sql = mm.removeSQL('mj', existing, []);
      expect(sql).toContain("'aaa'");
      expect(sql).toContain("'bbb'");
      expect(sql).toContain("'ccc'");
      // ...which is why the guard short-circuits this path before it can run:
      expect(mm.isSyncable({ Columns: [] })).toBe(false);
    });
  });
});
