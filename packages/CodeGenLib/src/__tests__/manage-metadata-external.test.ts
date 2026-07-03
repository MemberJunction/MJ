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
  public wantFlags(makePrimaryKey: boolean, singleColumnPrimaryKey: boolean) {
    return this.resolvePrimaryKeyFlags(makePrimaryKey, singleColumnPrimaryKey);
  }
  public flagsChanged(
    current: { isPrimaryKey: boolean; isUnique: boolean },
    want: { wantPrimaryKey: boolean; wantUnique: boolean },
    makePrimaryKey: boolean,
    reconcile: boolean,
  ) {
    return this.primaryKeyFlagsChanged(current, want, makePrimaryKey, reconcile);
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

    it('clears FK dependents (EntityFieldValue) BEFORE deleting the EntityField rows', () => {
      const sql = mm.removeSQL('mj', existing, ['ID', 'Name']);
      const valueIdx = sql.indexOf('EntityFieldValue');
      expect(valueIdx).toBeGreaterThanOrEqual(0); // FK dependents cleared
      expect(valueIdx).toBeLessThan(sql.lastIndexOf("'ccc'")); // ...before the final EntityField delete
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

  describe('resolvePrimaryKeyFlags (composite-PK IsUnique, M4)', () => {
    it('a single-column PK is both primary key and unique', () => {
      expect(mm.wantFlags(true, true)).toEqual({ wantPrimaryKey: true, wantUnique: true });
    });
    it('a COMPOSITE-PK column is a primary key but NOT unique on its own (M4)', () => {
      expect(mm.wantFlags(true, false)).toEqual({ wantPrimaryKey: true, wantUnique: false });
    });
    it('a non-PK column is neither', () => {
      expect(mm.wantFlags(false, true)).toEqual({ wantPrimaryKey: false, wantUnique: false });
      expect(mm.wantFlags(false, false)).toEqual({ wantPrimaryKey: false, wantUnique: false });
    });
  });

  describe('primaryKeyFlagsChanged (H5 clear-then-set vs. no-churn)', () => {
    const singlePk = { wantPrimaryKey: true, wantUnique: true };
    const notPk = { wantPrimaryKey: false, wantUnique: false };
    const compositePk = { wantPrimaryKey: true, wantUnique: false };

    describe('reconcile mode (external — introspection authoritative)', () => {
      it('acquires a PK: not-PK column that should become PK → change', () => {
        expect(mm.flagsChanged({ isPrimaryKey: false, isUnique: false }, singlePk, true, true)).toBe(true);
      });
      it('CLEARS a stale PK: was PK but no longer should be → change (H5)', () => {
        expect(mm.flagsChanged({ isPrimaryKey: true, isUnique: true }, notPk, false, true)).toBe(true);
      });
      it('corrects a composite column wrongly left IsUnique=true by the old code → change (M4 backfill)', () => {
        expect(mm.flagsChanged({ isPrimaryKey: true, isUnique: true }, compositePk, true, true)).toBe(true);
      });
      it('no-op when the flags already match (no churn)', () => {
        expect(mm.flagsChanged({ isPrimaryKey: true, isUnique: true }, singlePk, true, true)).toBe(false);
        expect(mm.flagsChanged({ isPrimaryKey: true, isUnique: false }, compositePk, true, true)).toBe(false);
        expect(mm.flagsChanged({ isPrimaryKey: false, isUnique: false }, notPk, false, true)).toBe(false);
      });

      it('does NOT wipe IsUnique on an ordinary non-PK column (unique email etc. is left alone)', () => {
        // non-PK field that is unique for its own reason: wantPrimaryKey=false, and it is not currently a PK,
        // so IsUnique is not PK-related → must NOT be flagged for change (no forced IsUnique=0).
        expect(mm.flagsChanged({ isPrimaryKey: false, isUnique: true }, notPk, false, true)).toBe(false);
      });
    });

    describe('non-reconcile mode (virtual — one-time bootstrap, never clears)', () => {
      it('sets a PK only on acquisition', () => {
        expect(mm.flagsChanged({ isPrimaryKey: false, isUnique: false }, singlePk, true, false)).toBe(true);
      });
      it('NEVER clears an already-set PK, even when makePrimaryKey is false (protects configured PKs)', () => {
        expect(mm.flagsChanged({ isPrimaryKey: true, isUnique: true }, notPk, false, false)).toBe(false);
      });
      it('does not re-update a column that is already the PK (no churn)', () => {
        expect(mm.flagsChanged({ isPrimaryKey: true, isUnique: true }, singlePk, true, false)).toBe(false);
      });
    });
  });
});
