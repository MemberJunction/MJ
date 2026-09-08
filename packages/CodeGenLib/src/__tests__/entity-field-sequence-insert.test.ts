import { describe, it, expect } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import type { CodeGenConnection, CodeGenQueryResult, CodeGenTransaction } from '../Database/codeGenDatabaseProvider';

/**
 * Why the Sequence on a CodeGen EntityField INSERT must be an apply-time expression (#3670, #4202):
 * the INSERT is appended verbatim to a migration, and Flyway runs every versioned migration before
 * the repeatable renumber (R__RefreshMetadata). A literal — the catalog ordinal, or the
 * MAX+100000+ordinal placeholder — is only valid on the database CodeGen ran against; on a fresh
 * install a later migration touching the same entity collides on UQ_EntityField_EntityID_Sequence,
 * and the failure surfaces as an unrelated FK error further down. #4048 regressed the emitter to a
 * literal ordinal plus a +100000 "park" UPDATE; the park cannot be made safe across migrations,
 * because the rows it needs to move are in an unknown state on every database but the author's.
 */
class TestableManageMetadata extends ManageMetadataBase {
  public insertSQL(id: string, field: Record<string, unknown>): string {
    return this.getPendingEntityFieldINSERTSQL(id, field);
  }
}

function field(over: Record<string, unknown>): Record<string, unknown> {
  return {
    EntityID: 'C70448F9-9792-41D7-A82C-784B66429D54',
    EntityName: 'Organizations',
    FieldName: 'RootParentID',
    SourceOrdinal: 20,
    Sequence: 100020,
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
    ...over,
  };
}

/** A connection whose transaction commits and rolls back without a database. */
class StubConnection implements CodeGenConnection {
  public get Dialect(): SQLDialect {
    return new SQLServerDialect();
  }
  public async query(): Promise<CodeGenQueryResult> {
    return { recordset: [] };
  }
  public async queryWithParams(): Promise<CodeGenQueryResult> {
    return { recordset: [] };
  }
  public async executeStoredProcedure(): Promise<CodeGenQueryResult> {
    return { recordset: [] };
  }
  public async beginTransaction(): Promise<CodeGenTransaction> {
    return {
      query: async (): Promise<CodeGenQueryResult> => ({ recordset: [] }),
      commit: async (): Promise<void> => undefined,
      rollback: async (): Promise<void> => undefined,
    };
  }
}

/** The value in the Sequence position of the emitted INSERT (third column). */
function sequenceValue(sql: string): string {
  // The emitter annotates the EntityID value with a trailing `-- Entity: <name>` comment.
  const values = sql.slice(sql.search(/VALUES/i)).replace(/--[^\n]*/g, '');
  const m = values.match(/\(\s*'[^']*',\s*'[^']*',\s*([\s\S]*?),\s*'RootParentID'/);
  if (!m) throw new Error(`could not locate the Sequence value in:\n${sql}`);
  return m[1].trim();
}

describe('EntityField Sequence on insert', () => {
  const mm = new TestableManageMetadata();

  it('emits an apply-time MAX(Sequence) expression scoped to the entity, offset by the schema ordinal', () => {
    const sql = mm.insertSQL('11111111-1111-1111-1111-111111111111', field({}));
    const seq = sequenceValue(sql);
    expect(seq).toMatch(/^\(SELECT COALESCE\(MAX\(\[Sequence\]\), 0\) FROM \[__mj\]\.\[EntityField\] WHERE \[EntityID\] = 'C70448F9-9792-41D7-A82C-784B66429D54'\) \+ 20$/);
  });

  it('never emits a bare integer in the Sequence position, whatever the SELECT computed', () => {
    for (const over of [{ Sequence: 20 }, { Sequence: 100020 }, { SourceOrdinal: 3, Sequence: 3 }]) {
      const seq = sequenceValue(mm.insertSQL('11111111-1111-1111-1111-111111111111', field(over)));
      expect(seq).not.toMatch(/^\d+$/);
      expect(seq).toContain('MAX(');
    }
  });

  it('falls back to ordinal 1 when the source ordinal is missing or invalid', () => {
    for (const bad of [undefined, 0, -4, 'x']) {
      const seq = sequenceValue(mm.insertSQL('11111111-1111-1111-1111-111111111111', field({ SourceOrdinal: bad })));
      expect(seq.endsWith(') + 1')).toBe(true);
    }
  });

  it('does not park existing rows: the batch is INSERTs only, one apply-time expression each', async () => {
    const statements: string[] = [];
    class Capturing extends TestableManageMetadata {
      protected override async runQuery(_pool: CodeGenConnection, _sql: string): Promise<CodeGenQueryResult> {
        return {
          recordset: [
            field({ FieldName: 'HousingID', SourceOrdinal: 16, Sequence: 100016, IsVirtual: false }),
            field({ FieldName: 'Housing', SourceOrdinal: 17, Sequence: 100017, IsVirtual: true }),
          ],
        };
      }
      protected override async LogSQLBatchAndExecute(_pool: CodeGenConnection, batch: string[]): Promise<unknown> {
        statements.push(...batch);
        return undefined;
      }
      public async run(): Promise<boolean> {
        return this.createNewEntityFieldsFromSchema(new StubConnection());
      }
    }
    expect(await new Capturing().run()).toBe(true);
    expect(statements).toHaveLength(2);
    for (const stmt of statements) {
      expect(stmt).toMatch(/INSERT INTO \[__mj\]\.\[EntityField\]/);
      expect(stmt).not.toMatch(/UPDATE\s+\[__mj\]\.\[EntityField\]/i);
      expect(stmt).not.toContain('100000');
      expect(stmt).toContain('COALESCE(MAX([Sequence]), 0)');
    }
  });
});
