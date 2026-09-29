import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
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
  public sequenceExpr(entityID: string): string {
    return this.applyTimeEntityFieldSequenceSQL(entityID);
  }
}

const ENTITY_ID = 'C70448F9-9792-41D7-A82C-784B66429D54';
const APPLY_TIME_SEQUENCE = `(SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = '${ENTITY_ID}')`;

function field(over: Record<string, unknown>): Record<string, unknown> {
  return {
    EntityID: ENTITY_ID,
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

/** A connection that records every query and whose transaction commits without a database. */
class RecordingConnection implements CodeGenConnection {
  public readonly Queries: string[] = [];
  public get Dialect(): SQLDialect {
    return new SQLServerDialect();
  }
  public async query(sql: string): Promise<CodeGenQueryResult> {
    this.Queries.push(sql);
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
      query: async (sql: string): Promise<CodeGenQueryResult> => this.query(sql),
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

/** The emitted value for a named column of the INSERT (the emitter annotates EntityID with a `-- Entity:` comment). */
function valueOf(sql: string, column: string): string {
  const cleaned = sql.replace(/--[^\n]*/g, '');
  const cols = cleaned.slice(cleaned.indexOf('(') + 1, cleaned.search(/\)\s*VALUES/i));
  const vals = cleaned.slice(cleaned.search(/VALUES\s*\(/i));
  const tuple = vals.slice(vals.indexOf('(') + 1, vals.lastIndexOf(')'));
  const idx = splitList(cols).findIndex((c) => c.replace(/[\[\]]/g, '') === column);
  if (idx === -1) throw new Error(`column ${column} not in INSERT`);
  return splitList(tuple)[idx];
}

describe('EntityField Sequence on insert', () => {
  const mm = new TestableManageMetadata();

  it('emits the apply-time MAX(Sequence)+1 expression scoped to the entity', () => {
    expect(mm.sequenceExpr(ENTITY_ID)).toBe(APPLY_TIME_SEQUENCE);
    expect(valueOf(mm.insertSQL('11111111-1111-1111-1111-111111111111', field({})), 'Sequence')).toBe(APPLY_TIME_SEQUENCE);
  });

  it('never emits a bare integer in the Sequence position, whatever the pending SELECT computed', () => {
    for (const over of [{ Sequence: 20 }, { Sequence: 100020 }, { SourceOrdinal: 3, Sequence: 3 }, { FieldName: 'Status', IsVirtual: false }]) {
      const seq = valueOf(mm.insertSQL('11111111-1111-1111-1111-111111111111', field(over)), 'Sequence');
      expect(seq).not.toMatch(/^\d+$/);
      expect(seq).toBe(APPLY_TIME_SEQUENCE);
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

  describe('createNewEntityFieldsFromSchema', () => {
    // LogSQLAndExecute refuses to run with SQL capture enabled and no log file open; there is no file here.
    let restoreSQLOutput: () => void;
    beforeAll(() => { restoreSQLOutput = SQLLogging.suppressOutputForTests(); });
    afterAll(() => restoreSQLOutput());

    it('sends the batch as INSERTs only — no park UPDATE — in one sequential round trip, in schema order', async () => {
      class Pending extends TestableManageMetadata {
        protected override async runQuery(_pool: CodeGenConnection, _sql: string): Promise<CodeGenQueryResult> {
          return {
            recordset: [
              field({ FieldName: 'HousingID', SourceOrdinal: 16, Sequence: 100016, IsVirtual: false }),
              field({ FieldName: 'Housing', SourceOrdinal: 17, Sequence: 100017, IsVirtual: true }),
            ],
          };
        }
        public async run(pool: CodeGenConnection): Promise<boolean> {
          return this.createNewEntityFieldsFromSchema(pool);
        }
      }
      const pool = new RecordingConnection();
      expect(await new Pending().run(pool)).toBe(true);
      // One chunk, one round trip: each INSERT's MAX() sees the one before it. Executing statements
      // concurrently would let two INSERTs read the same MAX and collide on the unique constraint.
      expect(pool.Queries).toHaveLength(1);
      const batch = pool.Queries[0];
      expect(batch).not.toMatch(/UPDATE\s+\[__mj\]\.\[EntityField\]/i);
      expect(batch).not.toContain('100000');
      expect(batch.match(/INSERT INTO \[__mj\]\.\[EntityField\]/g)).toHaveLength(2);
      expect(batch.indexOf("'HousingID'")).toBeLessThan(batch.indexOf("'Housing'"));
      expect(batch.split(APPLY_TIME_SEQUENCE)).toHaveLength(3);
    });
  });
});
