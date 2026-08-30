import { describe, it, expect } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';

class TestableManageMetadata extends ManageMetadataBase {
  public park(entityID: string): string {
    return this.parkEntityFieldSequencesSQL(entityID);
  }
  public insertSQL(id: string, field: Record<string, unknown>): string {
    return this.getPendingEntityFieldINSERTSQL(id, field);
  }
}

describe('EntityField Sequence on insert', () => {
  const mm = new TestableManageMetadata();

  it('parks existing sequences out of the catalog 1..N range before inserting at a real ordinal', () => {
    const sql = mm.park('C70448F9-9792-41D7-A82C-784B66429D54');
    expect(sql).toContain('Sequence') ;
    expect(sql).toContain('+ 100000');
    expect(sql).toContain('< 100000');
    expect(sql).toContain('C70448F9-9792-41D7-A82C-784B66429D54');
  });

  it('parks only when nothing on the entity is parked yet, so a second pass is a no-op', () => {
    // `Sequence < 100000` alone does not make the park idempotent. After the first park the
    // only rows left below the band are the ones that pass just INSERTED at their catalog
    // ordinals, so a second park lifts THOSE into the band — landing on the row the first
    // park moved from the same ordinal, and the migration dies on
    // UQ_EntityField_EntityID_Sequence with a duplicate at 100000+ordinal. An entity that
    // gains fields in both CodeGen passes (real columns in pass 1, the denormalized name
    // column a new foreign key introduces in pass 2) reaches exactly that state.
    const sql = mm.park('C70448F9-9792-41D7-A82C-784B66429D54');

    expect(sql).toMatch(/NOT\s+EXISTS/i);
    expect(sql).toContain('>= 100000');
  });

  it('inserts at SourceOrdinal, not MAX(Sequence)+N', () => {
    const sql = mm.insertSQL('11111111-1111-1111-1111-111111111111', {
      EntityID: 'C70448F9-9792-41D7-A82C-784B66429D54',
      EntityName: 'Organizations',
      FieldName: 'RootParentID',
      SourceOrdinal: 20,
      Sequence: 20,
      Description: null,
      Type: 'uniqueidentifier',
      Length: 16,
      Precision: 0,
      Scale: 0,
      AllowsNull: true,
      DefaultValue: null,
      AutoIncrement: false,
      AllowUpdateAPI: false,
      IsVirtual: true,
      IsComputed: false,
      RelatedEntityID: null,
      RelatedEntityFieldName: null,
      IsNameField: false,
    });
    expect(sql).not.toMatch(/MAX\s*\(\s*\[?Sequence\]?\s*\)/i);
    expect(sql).toContain("            20,");
    expect(sql).toContain("'RootParentID'");
  });
});
