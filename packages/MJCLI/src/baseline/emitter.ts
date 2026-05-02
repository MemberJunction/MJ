/**
 * Canonical T-SQL emitter.
 *
 * Produces a single, deterministic T-SQL script from a SchemaSnapshot plus
 * (optional) per-table data dumps. The output ordering is dependency-aware
 * and stable: identical input → byte-identical output.
 *
 * Order of emission:
 *   1. Header banner
 *   2. CREATE SCHEMA statements
 *   3. CREATE SEQUENCE statements
 *   4. CREATE TABLE statements (no FKs yet — those come later)
 *   5. Default constraints
 *   6. Check constraints
 *   7. Indexes (non-PK, non-unique-constraint)
 *   8. Data inserts (with SET IDENTITY_INSERT bookends)
 *   9. Reseed identity columns
 *  10. CREATE VIEW statements
 *  11. CREATE FUNCTION statements
 *  12. CREATE PROCEDURE statements
 *  13. CREATE TRIGGER statements
 *  14. ALTER TABLE ADD CONSTRAINT … FOREIGN KEY (last so order doesn't matter)
 */

import {
  formatTsqlValue,
  isoUtcSeconds,
  NL,
  quoteIdent,
  quoteString,
  stableSortBy,
} from './util';
import type {
  BaselineEmitOptions,
  ColumnDef,
  ForeignKeyDef,
  IndexDef,
  RoutineDef,
  SchemaSnapshot,
  SequenceDef,
  TableDataDump,
  TableDef,
  TriggerDef,
  ViewDef,
} from './types';

export interface EmitInput {
  snapshot: SchemaSnapshot;
  dataDumps: readonly TableDataDump[];
  options: BaselineEmitOptions;
}

export function emitBaselineTsql(input: EmitInput): string {
  if (input.snapshot.dialect !== 'mssql') {
    throw new Error('emitBaselineTsql requires an MSSQL snapshot');
  }
  const parts: string[] = [];
  parts.push(emitHeader(input.options));
  parts.push(emitSchemas(input.snapshot));
  parts.push(emitSequences(input.snapshot.sequences));
  parts.push(emitTables(input.snapshot.tables));
  parts.push(emitDefaults(input.snapshot.tables));
  parts.push(emitChecks(input.snapshot.tables));
  parts.push(emitIndexes(input.snapshot.tables));
  if (input.options.includeData) {
    parts.push(emitData(input.snapshot.tables, input.dataDumps, input.options.batchSize));
  }
  parts.push(emitViews(input.snapshot.views));
  parts.push(emitRoutines(input.snapshot.functions, 'function'));
  parts.push(emitRoutines(input.snapshot.procedures, 'procedure'));
  parts.push(emitTriggers(input.snapshot.triggers));
  parts.push(emitForeignKeys(input.snapshot.tables));
  parts.push(emitFooter());
  return parts.filter((p) => p.length > 0).join(NL + NL) + NL;
}

function emitHeader(options: BaselineEmitOptions): string {
  return [
    `-- ============================================================================`,
    `-- ${options.description}`,
    `-- Baseline version : v${options.baselineVersion}.X`,
    `-- Generated at     : ${isoUtcSeconds(options.generatedAtUtc)}`,
    `-- Generator        : @memberjunction/cli baseline build`,
    `-- ============================================================================`,
    `SET ANSI_NULLS ON;`,
    `SET QUOTED_IDENTIFIER ON;`,
    `SET NOCOUNT ON;`,
    `GO`,
  ].join(NL);
}

function emitFooter(): string {
  return `-- End of baseline.${NL}GO`;
}

function emitSchemas(snapshot: SchemaSnapshot): string {
  const schemas = stableSortBy(snapshot.schemas, (s) => s.name.toLowerCase());
  if (schemas.length === 0) return '';
  const lines: string[] = ['-- Schemas'];
  for (const schema of schemas) {
    if (schema.name.toLowerCase() === 'dbo') continue;
    lines.push(
      `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = ${quoteString(schema.name)})`,
    );
    lines.push(`    EXEC('CREATE SCHEMA ${quoteIdent(schema.name)}');`);
    lines.push(`GO`);
  }
  return lines.join(NL);
}

function emitSequences(sequences: readonly SequenceDef[]): string {
  if (sequences.length === 0) return '';
  const lines: string[] = ['-- Sequences'];
  for (const seq of sequences) {
    const min = seq.minValue ? ` MINVALUE ${seq.minValue}` : '';
    const max = seq.maxValue ? ` MAXVALUE ${seq.maxValue}` : '';
    const cycle = seq.cycle ? ' CYCLE' : ' NO CYCLE';
    lines.push(
      `CREATE SEQUENCE ${quoteIdent(seq.schema)}.${quoteIdent(seq.name)} ` +
      `AS BIGINT START WITH ${seq.startValue} INCREMENT BY ${seq.increment}${min}${max}${cycle};`,
    );
    lines.push(`GO`);
  }
  return lines.join(NL);
}

function emitTables(tables: readonly TableDef[]): string {
  if (tables.length === 0) return '';
  const sections: string[] = ['-- Tables'];
  for (const t of tables) {
    sections.push(emitCreateTable(t));
  }
  return sections.join(NL + NL);
}

function emitCreateTable(t: TableDef): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${quoteIdent(t.schema)}.${quoteIdent(t.name)} (`);
  const columnLines: string[] = [];
  for (const c of t.columns) {
    columnLines.push('    ' + columnDefinition(c));
  }
  if (t.primaryKey) {
    const cluster = t.primaryKey.clustered ? 'CLUSTERED' : 'NONCLUSTERED';
    columnLines.push(
      `    CONSTRAINT ${quoteIdent(t.primaryKey.name)} PRIMARY KEY ${cluster} ` +
      `(${t.primaryKey.columns.map((n) => quoteIdent(n)).join(', ')})`,
    );
  }
  for (const u of t.uniqueConstraints) {
    const cluster = u.clustered ? 'CLUSTERED' : 'NONCLUSTERED';
    columnLines.push(
      `    CONSTRAINT ${quoteIdent(u.name)} UNIQUE ${cluster} ` +
      `(${u.columns.map((n) => quoteIdent(n)).join(', ')})`,
    );
  }
  lines.push(columnLines.join(',' + NL));
  lines.push(');');
  lines.push('GO');
  return lines.join(NL);
}

function columnDefinition(c: ColumnDef): string {
  if (c.isComputed && c.computedExpression) {
    const persisted = ''; // sys.computed_columns doesn't expose is_persisted in our query
    return `${quoteIdent(c.name)} AS (${c.computedExpression})${persisted}`;
  }
  const parts = [quoteIdent(c.name), c.dataType.toUpperCase()];
  if (c.collation && c.dataType.toLowerCase().includes('char')) {
    parts.push(`COLLATE ${c.collation}`);
  }
  if (c.isIdentity) parts.push('IDENTITY(1,1)');
  parts.push(c.isNullable ? 'NULL' : 'NOT NULL');
  return parts.join(' ');
}

function emitDefaults(tables: readonly TableDef[]): string {
  const stmts: string[] = [];
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.defaultExpression && !c.isComputed) {
        const constraintName = `DF_${t.name}_${c.name}`;
        stmts.push(
          `ALTER TABLE ${quoteIdent(t.schema)}.${quoteIdent(t.name)} ` +
          `ADD CONSTRAINT ${quoteIdent(constraintName)} DEFAULT ${c.defaultExpression} ` +
          `FOR ${quoteIdent(c.name)};`,
        );
        stmts.push('GO');
      }
    }
  }
  if (stmts.length === 0) return '';
  return ['-- Default constraints', ...stmts].join(NL);
}

function emitChecks(tables: readonly TableDef[]): string {
  const stmts: string[] = [];
  for (const t of tables) {
    for (const c of t.checks) {
      stmts.push(
        `ALTER TABLE ${quoteIdent(t.schema)}.${quoteIdent(t.name)} ` +
        `ADD CONSTRAINT ${quoteIdent(c.name)} CHECK ${c.expression};`,
      );
      stmts.push('GO');
    }
  }
  if (stmts.length === 0) return '';
  return ['-- Check constraints', ...stmts].join(NL);
}

function emitIndexes(tables: readonly TableDef[]): string {
  const stmts: string[] = [];
  for (const t of tables) {
    for (const idx of t.indexes) {
      stmts.push(emitCreateIndex(t, idx));
    }
  }
  if (stmts.length === 0) return '';
  return ['-- Indexes', ...stmts].join(NL);
}

function emitCreateIndex(t: TableDef, idx: IndexDef): string {
  const unique = idx.isUnique ? 'UNIQUE ' : '';
  const cluster = idx.isClustered ? 'CLUSTERED' : 'NONCLUSTERED';
  const cols = idx.columns.map((n) => quoteIdent(n)).join(', ');
  const incl = idx.includes.length ? ` INCLUDE (${idx.includes.map((n) => quoteIdent(n)).join(', ')})` : '';
  const filter = idx.filter ? ` WHERE ${idx.filter}` : '';
  return (
    `CREATE ${unique}${cluster} INDEX ${quoteIdent(idx.name)} ON ` +
    `${quoteIdent(t.schema)}.${quoteIdent(t.name)} (${cols})${incl}${filter};${NL}GO`
  );
}

function emitForeignKeys(tables: readonly TableDef[]): string {
  const stmts: string[] = [];
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      stmts.push(emitForeignKey(t, fk));
    }
  }
  if (stmts.length === 0) return '';
  return ['-- Foreign keys', ...stmts].join(NL);
}

function emitForeignKey(t: TableDef, fk: ForeignKeyDef): string {
  const cols = fk.columns.map((n) => quoteIdent(n)).join(', ');
  const refCols = fk.referencedColumns.map((n) => quoteIdent(n)).join(', ');
  const onDelete = fk.onDelete !== 'NO_ACTION' ? ` ON DELETE ${fk.onDelete.replace('_', ' ')}` : '';
  const onUpdate = fk.onUpdate !== 'NO_ACTION' ? ` ON UPDATE ${fk.onUpdate.replace('_', ' ')}` : '';
  return (
    `ALTER TABLE ${quoteIdent(t.schema)}.${quoteIdent(t.name)} ` +
    `ADD CONSTRAINT ${quoteIdent(fk.name)} FOREIGN KEY (${cols}) ` +
    `REFERENCES ${quoteIdent(fk.referencedSchema)}.${quoteIdent(fk.referencedTable)} (${refCols})` +
    `${onDelete}${onUpdate};${NL}GO`
  );
}

function emitData(
  tables: readonly TableDef[],
  dumps: readonly TableDataDump[],
  batchSize: number,
): string {
  const dumpByKey = new Map(dumps.map((d) => [`${d.schema}.${d.table}`.toLowerCase(), d]));
  const sections: string[] = ['-- Data'];
  for (const t of tables) {
    const dump = dumpByKey.get(`${t.schema}.${t.name}`.toLowerCase());
    if (!dump || dump.rows.length === 0) continue;
    sections.push(emitTableData(t, dump, batchSize));
  }
  return sections.join(NL + NL);
}

function emitTableData(table: TableDef, dump: TableDataDump, batchSize: number): string {
  const lines: string[] = [];
  const tableRef = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
  const colList = dump.columns.map((n) => quoteIdent(n)).join(', ');

  if (table.hasIdentity) {
    lines.push(`SET IDENTITY_INSERT ${tableRef} ON;`);
    lines.push('GO');
  }

  for (let i = 0; i < dump.rows.length; i += batchSize) {
    const batch = dump.rows.slice(i, i + batchSize);
    const valuesLines = batch.map((row) => '    (' + row.map(formatTsqlValue).join(', ') + ')');
    lines.push(`INSERT INTO ${tableRef} (${colList}) VALUES`);
    lines.push(valuesLines.join(',' + NL) + ';');
    lines.push('GO');
  }

  if (table.hasIdentity) {
    lines.push(`SET IDENTITY_INSERT ${tableRef} OFF;`);
    lines.push('GO');
    // Reseed to the maximum key so future inserts don't collide.
    const idCol = table.columns.find((c) => c.isIdentity);
    if (idCol) {
      lines.push(`DECLARE @max_${table.name.replace(/\W/g, '_')} BIGINT;`);
      lines.push(
        `SELECT @max_${table.name.replace(/\W/g, '_')} = MAX(${quoteIdent(idCol.name)}) FROM ${tableRef};`,
      );
      lines.push(
        `IF @max_${table.name.replace(/\W/g, '_')} IS NOT NULL ` +
        `DBCC CHECKIDENT (${quoteString(`${table.schema}.${table.name}`)}, RESEED, ` +
        `@max_${table.name.replace(/\W/g, '_')});`,
      );
      lines.push('GO');
    }
  }
  return lines.join(NL);
}

function emitViews(views: readonly ViewDef[]): string {
  if (views.length === 0) return '';
  const lines: string[] = ['-- Views'];
  for (const v of views) {
    if (!v.definition.trim()) continue;
    lines.push(v.definition.trim());
    lines.push('GO');
  }
  return lines.join(NL);
}

function emitRoutines(routines: readonly RoutineDef[], _kind: 'procedure' | 'function'): string {
  if (routines.length === 0) return '';
  const lines: string[] = [`-- ${routines[0].kind === 'procedure' ? 'Procedures' : 'Functions'}`];
  for (const r of routines) {
    if (!r.definition.trim()) continue;
    lines.push(r.definition.trim());
    lines.push('GO');
  }
  return lines.join(NL);
}

function emitTriggers(triggers: readonly TriggerDef[]): string {
  if (triggers.length === 0) return '';
  const lines: string[] = ['-- Triggers'];
  for (const t of triggers) {
    if (!t.definition.trim()) continue;
    lines.push(t.definition.trim());
    lines.push('GO');
  }
  return lines.join(NL);
}
