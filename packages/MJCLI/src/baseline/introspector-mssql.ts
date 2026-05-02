/**
 * MSSQL introspector.
 *
 * Returns a normalized SchemaSnapshot. All object bodies (views, procs,
 * functions, triggers) are pulled via OBJECT_DEFINITION() so they are
 * byte-faithful to what the database actually has — no AST round-trip.
 */

import type { QueryRunner } from './connection';
import { stableSortBy } from './util';
import type {
  CheckConstraintDef,
  ColumnDef,
  ForeignKeyDef,
  IndexDef,
  PrimaryKeyDef,
  RoutineDef,
  SchemaSnapshot,
  SequenceDef,
  TableDef,
  TriggerDef,
  UniqueConstraintDef,
  ViewDef,
} from './types';

interface Progress {
  onPhase?(phase: string, count?: number): void;
}

export async function introspectMssql(db: QueryRunner, progress: Progress = {}): Promise<SchemaSnapshot> {
  progress.onPhase?.('schemas');
  const schemas = await db.query<{ name: string }>(`
    SELECT s.name
      FROM sys.schemas s
     WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest', 'db_owner', 'db_accessadmin',
                          'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader',
                          'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
  `);

  progress.onPhase?.('tables');
  const tables = await readTables(db);

  progress.onPhase?.('views');
  const views = await readViews(db);

  progress.onPhase?.('routines');
  const procedures = await readRoutines(db, 'P');
  const functions = await readRoutines(db, 'FN_TF_IF');

  progress.onPhase?.('triggers');
  const triggers = await readTriggers(db);

  progress.onPhase?.('sequences');
  const sequences = await readSequences(db);

  return {
    dialect: 'mssql',
    schemas: stableSortBy(schemas, (s) => s.name.toLowerCase()),
    tables: stableSortBy(tables, (t) => `${t.schema}.${t.name}`.toLowerCase()),
    views: stableSortBy(views, (v) => `${v.schema}.${v.name}`.toLowerCase()),
    procedures: stableSortBy(procedures, (r) => `${r.schema}.${r.name}`.toLowerCase()),
    functions: stableSortBy(functions, (r) => `${r.schema}.${r.name}`.toLowerCase()),
    triggers: stableSortBy(triggers, (t) => `${t.schema}.${t.name}`.toLowerCase()),
    sequences: stableSortBy(sequences, (s) => `${s.schema}.${s.name}`.toLowerCase()),
  };
}

async function readTables(db: QueryRunner): Promise<TableDef[]> {
  // Pull tables in one round-trip then enrich with columns/PKs/indexes/FKs/checks.
  const tableRows = await db.query<{ schema_name: string; table_name: string; has_identity: number }>(`
    SELECT s.name AS schema_name,
           t.name AS table_name,
           CAST(CASE WHEN EXISTS (
             SELECT 1 FROM sys.columns c WHERE c.object_id = t.object_id AND c.is_identity = 1
           ) THEN 1 ELSE 0 END AS INT) AS has_identity
      FROM sys.tables t
      JOIN sys.schemas s ON s.schema_id = t.schema_id
     WHERE t.is_ms_shipped = 0
  `);

  const columnRows = await db.query<{
    schema_name: string; table_name: string; column_name: string; ordinal: number;
    data_type: string; max_length: number; precision: number; scale: number;
    is_nullable: number; is_identity: number; is_computed: number;
    computed_definition: string | null; default_definition: string | null;
    collation: string | null;
  }>(`
    SELECT s.name AS schema_name, t.name AS table_name, c.name AS column_name,
           c.column_id AS ordinal,
           ty.name AS data_type, c.max_length, c.precision, c.scale,
           c.is_nullable, c.is_identity, c.is_computed,
           cc.definition AS computed_definition,
           dc.definition AS default_definition,
           c.collation_name AS collation
      FROM sys.tables t
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.columns c ON c.object_id = t.object_id
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
 LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
 LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
     WHERE t.is_ms_shipped = 0
  `);

  const pkRows = await db.query<{
    schema_name: string; table_name: string; constraint_name: string;
    column_name: string; key_ordinal: number; is_clustered: number; is_primary: number; is_unique: number;
  }>(`
    SELECT s.name AS schema_name, t.name AS table_name, kc.name AS constraint_name,
           c.name AS column_name, ic.key_ordinal,
           CAST(CASE WHEN i.type = 1 THEN 1 ELSE 0 END AS INT) AS is_clustered,
           CAST(kc.type_desc AS VARCHAR(64)) AS type_desc_raw,
           CAST(CASE WHEN kc.type = 'PK' THEN 1 ELSE 0 END AS INT) AS is_primary,
           CAST(CASE WHEN kc.type = 'UQ' THEN 1 ELSE 0 END AS INT) AS is_unique
      FROM sys.key_constraints kc
      JOIN sys.tables t ON t.object_id = kc.parent_object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.indexes i ON i.object_id = kc.parent_object_id AND i.index_id = kc.unique_index_id
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
     WHERE t.is_ms_shipped = 0
  `);

  const indexRows = await db.query<{
    schema_name: string; table_name: string; index_name: string;
    is_unique: number; is_clustered: number; is_constraint: number;
    column_name: string; key_ordinal: number; is_included: number; filter_definition: string | null;
  }>(`
    SELECT s.name AS schema_name, t.name AS table_name, i.name AS index_name,
           CAST(i.is_unique AS INT) AS is_unique,
           CAST(CASE WHEN i.type = 1 THEN 1 ELSE 0 END AS INT) AS is_clustered,
           CAST(CASE WHEN i.is_primary_key = 1 OR i.is_unique_constraint = 1 THEN 1 ELSE 0 END AS INT) AS is_constraint,
           c.name AS column_name, ic.key_ordinal,
           CAST(ic.is_included_column AS INT) AS is_included,
           i.filter_definition
      FROM sys.indexes i
      JOIN sys.tables t ON t.object_id = i.object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
     WHERE t.is_ms_shipped = 0 AND i.name IS NOT NULL
  `);

  const fkRows = await db.query<{
    schema_name: string; table_name: string; constraint_name: string;
    column_name: string; ref_schema: string; ref_table: string; ref_column: string;
    on_delete: string; on_update: string; key_index: number;
  }>(`
    SELECT ps.name AS schema_name, pt.name AS table_name, fk.name AS constraint_name,
           pc.name AS column_name,
           rs.name AS ref_schema, rt.name AS ref_table, rc.name AS ref_column,
           fk.delete_referential_action_desc AS on_delete,
           fk.update_referential_action_desc AS on_update,
           fkc.constraint_column_id AS key_index
      FROM sys.foreign_keys fk
      JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
      JOIN sys.schemas ps ON ps.schema_id = pt.schema_id
      JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
      JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
      JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
      JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
  `);

  const checkRows = await db.query<{ schema_name: string; table_name: string; constraint_name: string; definition: string }>(`
    SELECT s.name AS schema_name, t.name AS table_name, cc.name AS constraint_name, cc.definition
      FROM sys.check_constraints cc
      JOIN sys.tables t ON t.object_id = cc.parent_object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
     WHERE t.is_ms_shipped = 0
  `);

  const tables: TableDef[] = [];
  for (const t of tableRows) {
    const tableKey = `${t.schema_name}.${t.table_name}`;
    const columns: ColumnDef[] = stableSortBy(
      columnRows.filter((c) => c.schema_name === t.schema_name && c.table_name === t.table_name),
      (c) => String(c.ordinal).padStart(6, '0'),
    ).map((c) => ({
      name: c.column_name,
      ordinal: c.ordinal,
      dataType: formatMssqlType(c),
      isNullable: !!c.is_nullable,
      isIdentity: !!c.is_identity,
      isComputed: !!c.is_computed,
      computedExpression: c.computed_definition ?? undefined,
      defaultExpression: c.default_definition ?? undefined,
      collation: c.collation ?? undefined,
    }));

    const pkCols = pkRows.filter(
      (r) => r.schema_name === t.schema_name && r.table_name === t.table_name && r.is_primary === 1,
    );
    const primaryKey: PrimaryKeyDef | undefined = pkCols.length
      ? {
          name: pkCols[0].constraint_name,
          clustered: !!pkCols[0].is_clustered,
          columns: stableSortBy(pkCols, (r) => String(r.key_ordinal).padStart(6, '0')).map((r) => r.column_name),
        }
      : undefined;

    const uniqueGroups = groupBy(
      pkRows.filter(
        (r) => r.schema_name === t.schema_name && r.table_name === t.table_name && r.is_unique === 1,
      ),
      (r) => r.constraint_name,
    );
    const uniqueConstraints: UniqueConstraintDef[] = stableSortBy(
      [...uniqueGroups.entries()].map(([name, rows]) => ({
        name,
        clustered: !!rows[0].is_clustered,
        columns: stableSortBy(rows, (r) => String(r.key_ordinal).padStart(6, '0')).map((r) => r.column_name),
      })),
      (u) => u.name.toLowerCase(),
    );

    const indexGroups = groupBy(
      indexRows.filter(
        (r) => r.schema_name === t.schema_name && r.table_name === t.table_name && r.is_constraint === 0,
      ),
      (r) => r.index_name,
    );
    const indexes: IndexDef[] = stableSortBy(
      [...indexGroups.entries()].map(([name, rows]) => {
        const keyCols = stableSortBy(rows.filter((r) => r.is_included === 0), (r) => String(r.key_ordinal).padStart(6, '0'));
        const inclCols = rows.filter((r) => r.is_included === 1).map((r) => r.column_name);
        return {
          name,
          isUnique: !!rows[0].is_unique,
          isClustered: !!rows[0].is_clustered,
          columns: keyCols.map((r) => r.column_name),
          includes: stableSortBy(inclCols, (n) => n.toLowerCase()),
          filter: rows[0].filter_definition ?? undefined,
        };
      }),
      (i) => i.name.toLowerCase(),
    );

    const fkGroups = groupBy(
      fkRows.filter((r) => r.schema_name === t.schema_name && r.table_name === t.table_name),
      (r) => r.constraint_name,
    );
    const foreignKeys: ForeignKeyDef[] = stableSortBy(
      [...fkGroups.entries()].map(([name, rows]) => {
        const ordered = stableSortBy(rows, (r) => String(r.key_index).padStart(6, '0'));
        return {
          name,
          columns: ordered.map((r) => r.column_name),
          referencedSchema: ordered[0].ref_schema,
          referencedTable: ordered[0].ref_table,
          referencedColumns: ordered.map((r) => r.ref_column),
          onDelete: normalizeAction(ordered[0].on_delete),
          onUpdate: normalizeAction(ordered[0].on_update),
        };
      }),
      (f) => f.name.toLowerCase(),
    );

    const checks: CheckConstraintDef[] = stableSortBy(
      checkRows
        .filter((r) => r.schema_name === t.schema_name && r.table_name === t.table_name)
        .map((r) => ({ name: r.constraint_name, expression: r.definition })),
      (c) => c.name.toLowerCase(),
    );

    tables.push({
      schema: t.schema_name,
      name: t.table_name,
      hasIdentity: !!t.has_identity,
      columns,
      primaryKey,
      uniqueConstraints,
      indexes,
      foreignKeys,
      checks,
    });
  }
  return tables;
}

async function readViews(db: QueryRunner): Promise<ViewDef[]> {
  const rows = await db.query<{ schema_name: string; view_name: string; definition: string | null }>(`
    SELECT s.name AS schema_name, v.name AS view_name,
           OBJECT_DEFINITION(v.object_id) AS definition
      FROM sys.views v
      JOIN sys.schemas s ON s.schema_id = v.schema_id
     WHERE v.is_ms_shipped = 0
  `);
  return rows.map((r) => ({ schema: r.schema_name, name: r.view_name, definition: r.definition ?? '' }));
}

async function readRoutines(db: QueryRunner, kind: 'P' | 'FN_TF_IF'): Promise<RoutineDef[]> {
  const typePredicate = kind === 'P' ? `o.type = 'P'` : `o.type IN ('FN','TF','IF')`;
  const rows = await db.query<{ schema_name: string; object_name: string; definition: string | null; routine_kind: string }>(`
    SELECT s.name AS schema_name, o.name AS object_name,
           OBJECT_DEFINITION(o.object_id) AS definition,
           CAST(o.type AS VARCHAR(8)) AS routine_kind
      FROM sys.objects o
      JOIN sys.schemas s ON s.schema_id = o.schema_id
     WHERE ${typePredicate}
       AND o.is_ms_shipped = 0
  `);
  return rows.map((r) => ({
    schema: r.schema_name,
    name: r.object_name,
    definition: r.definition ?? '',
    kind: kind === 'P' ? 'procedure' : 'function',
  }));
}

async function readTriggers(db: QueryRunner): Promise<TriggerDef[]> {
  const rows = await db.query<{ schema_name: string; trigger_name: string; table_name: string; definition: string | null }>(`
    SELECT s.name AS schema_name, tr.name AS trigger_name, t.name AS table_name,
           OBJECT_DEFINITION(tr.object_id) AS definition
      FROM sys.triggers tr
      JOIN sys.tables t ON t.object_id = tr.parent_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
     WHERE tr.is_ms_shipped = 0
  `);
  return rows.map((r) => ({
    schema: r.schema_name,
    name: r.trigger_name,
    table: r.table_name,
    definition: r.definition ?? '',
  }));
}

async function readSequences(db: QueryRunner): Promise<SequenceDef[]> {
  const rows = await db.query<{
    schema_name: string; seq_name: string; start_value: string; increment: string;
    minimum_value: string; maximum_value: string; is_cycling: number; current_value: string;
  }>(`
    SELECT s.name AS schema_name, sq.name AS seq_name,
           CAST(sq.start_value AS NVARCHAR(64)) AS start_value,
           CAST(sq.increment AS NVARCHAR(64)) AS increment,
           CAST(sq.minimum_value AS NVARCHAR(64)) AS minimum_value,
           CAST(sq.maximum_value AS NVARCHAR(64)) AS maximum_value,
           CAST(sq.is_cycling AS INT) AS is_cycling,
           CAST(sq.current_value AS NVARCHAR(64)) AS current_value
      FROM sys.sequences sq
      JOIN sys.schemas s ON s.schema_id = sq.schema_id
  `);
  return rows.map((r) => ({
    schema: r.schema_name,
    name: r.seq_name,
    startValue: r.start_value,
    increment: r.increment,
    minValue: r.minimum_value ?? undefined,
    maxValue: r.maximum_value ?? undefined,
    cycle: !!r.is_cycling,
    currentValue: r.current_value ?? undefined,
  }));
}

function formatMssqlType(c: {
  data_type: string; max_length: number; precision: number; scale: number;
}): string {
  const type = c.data_type.toLowerCase();
  switch (type) {
    case 'nvarchar':
    case 'nchar': {
      const length = c.max_length === -1 ? 'max' : String(c.max_length / 2);
      return `${type}(${length})`;
    }
    case 'varchar':
    case 'char':
    case 'binary':
    case 'varbinary': {
      const length = c.max_length === -1 ? 'max' : String(c.max_length);
      return `${type}(${length})`;
    }
    case 'decimal':
    case 'numeric':
      return `${type}(${c.precision},${c.scale})`;
    case 'datetime2':
    case 'datetimeoffset':
    case 'time':
      return `${type}(${c.scale})`;
    case 'float':
      return c.precision === 53 ? 'float' : `float(${c.precision})`;
    default:
      return type;
  }
}

function normalizeAction(raw: string): ForeignKeyDef['onDelete'] {
  const r = (raw || '').toUpperCase().replace(/_/g, '');
  if (r.includes('CASCADE')) return 'CASCADE';
  if (r.includes('SETNULL')) return 'SET_NULL';
  if (r.includes('SETDEFAULT')) return 'SET_DEFAULT';
  return 'NO_ACTION';
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
