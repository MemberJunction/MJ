import { describe, it, expect } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
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

/** Split a parenthesised list on top-level commas, honoring quotes and nested parentheses. */
function splitList(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "'") quoted = !quoted;
    else if (!quoted && ch === '(') depth++;
    else if (!quoted && ch === ')') depth--;
    else if (!quoted && ch === ',' && depth === 0) {
      items.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  items.push(list.slice(start).trim());
  return items;
}

/** The emitted value for a named column of the INSERT. */
function valueOf(sql: string, column: string): string {
  const cleaned = sql.replace(/--[^\n]*/g, '');
  const cols = cleaned.slice(cleaned.indexOf('(') + 1, cleaned.search(/\)\s*VALUES/i));
  const vals = cleaned.slice(cleaned.search(/VALUES\s*\(/i));
  const tuple = vals.slice(vals.indexOf('(') + 1, vals.lastIndexOf(')'));
  const idx = splitList(cols).findIndex((c) => c.replace(/[\[\]]/g, '') === column);
  if (idx === -1) throw new Error(`column ${column} not in INSERT`);
  return splitList(tuple)[idx];
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

  it('DefaultInView honors IncludeFirstNFieldsAsDefaultInView by schema ordinal, not by the placeholder Sequence', () => {
    // Default setting is 5. A non-name, non-key field at ordinal 3 is in; one at ordinal 8 is out.
    const early = mm.insertSQL('11111111-1111-1111-1111-111111111111', field({ FieldName: 'Status', IsVirtual: false, SourceOrdinal: 3, Sequence: 100003 }));
    const late = mm.insertSQL('11111111-1111-1111-1111-111111111111', field({ FieldName: 'Notes', IsVirtual: false, SourceOrdinal: 8, Sequence: 100008 }));
    expect(valueOf(early, 'DefaultInView')).toBe('1');
    expect(valueOf(late, 'DefaultInView')).toBe('0');
  });

  it('the pending-fields SELECT orders by EntityID, Sequence on both platforms (emission order is schema order)', () => {
    // The apply-time expression is unique by construction; RELATIVE order among a batch of new fields
    // comes from emitting them in schema order and executing them sequentially. Drop this ORDER BY and
    // base columns can land after virtual ones until the renumber.
    expect(new SQLServerCodeGenProvider().getPendingEntityFieldsSQL('__mj')).toMatch(/ORDER BY\s+EntityID,\s*Sequence/i);
    expect(new PostgreSQLCodeGenProvider().getPendingEntityFieldsSQL('__mj')).toMatch(/ORDER BY\s+"EntityID",\s*"Sequence"/i);
  });

  it('does not park existing rows: the batch is INSERTs only, one apply-time expression each, in one sequential round trip', async () => {
    const statements: string[] = [];
    let batchCalls = 0;
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
        batchCalls++;
        statements.push(...batch);
        return undefined;
      }
      public async run(): Promise<boolean> {
        return this.createNewEntityFieldsFromSchema(new StubConnection());
      }
    }
    expect(await new Capturing().run()).toBe(true);
    // One chunk, one round trip, statements in emission order: each INSERT's MAX() sees the one before it.
    // Executing the chunk with Promise.all would let two INSERTs read the same MAX and collide.
    expect(batchCalls).toBe(1);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'HousingID'");
    expect(statements[1]).toContain("'Housing'");
    for (const stmt of statements) {
      expect(stmt).toMatch(/INSERT INTO \[__mj\]\.\[EntityField\]/);
      expect(stmt).not.toMatch(/UPDATE\s+\[__mj\]\.\[EntityField\]/i);
      expect(stmt).not.toContain('100000');
      expect(stmt).toContain('COALESCE(MAX([Sequence]), 0)');
    }
  });
});
