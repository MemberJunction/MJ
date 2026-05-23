/**
 * Postgres introspector. Used only by `mj baseline compare` when both sides
 * are PG (the verification leg of the PG roundtrip). The MSSQL introspector
 * is the source-of-truth for *building* baselines; this exists so we can
 * compare two PG DBs after `/pg-migrate` conversion.
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

export async function introspectPostgres(db: QueryRunner, progress: Progress = {}): Promise<SchemaSnapshot> {
  progress.onPhase?.('schemas');
  const schemas = await db.query<{ schema_name: string }>(`
    SELECT nspname AS schema_name
      FROM pg_namespace
     WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast')
       AND nspname NOT LIKE 'pg_temp_%'
       AND nspname NOT LIKE 'pg_toast_temp_%'
  `);

  progress.onPhase?.('tables');
  const tables = await readTables(db);

  progress.onPhase?.('views');
  const views = await readViews(db);

  progress.onPhase?.('routines');
  const { procedures, functions } = await readRoutines(db);

  progress.onPhase?.('triggers');
  const triggers = await readTriggers(db);

  progress.onPhase?.('sequences');
  const sequences = await readSequences(db);

  return {
    dialect: 'postgres',
    schemas: stableSortBy(schemas.map((s) => ({ name: s.schema_name })), (s) => s.name.toLowerCase()),
    tables: stableSortBy(tables, (t) => `${t.schema}.${t.name}`.toLowerCase()),
    views: stableSortBy(views, (v) => `${v.schema}.${v.name}`.toLowerCase()),
    procedures: stableSortBy(procedures, (r) => `${r.schema}.${r.name}`.toLowerCase()),
    functions: stableSortBy(functions, (r) => `${r.schema}.${r.name}`.toLowerCase()),
    triggers: stableSortBy(triggers, (t) => `${t.schema}.${t.name}`.toLowerCase()),
    sequences: stableSortBy(sequences, (s) => `${s.schema}.${s.name}`.toLowerCase()),
    // PG introspection of UDTs / extended-property analogs is future work — the
    // MSSQL → PG converter currently doesn't translate `sp_addextendedproperty`
    // or `CREATE TYPE AS TABLE`, so returning empty here keeps the snapshot
    // shape consistent without misrepresenting the source.
    userDefinedTypes: [],
    extendedProperties: [],
  };
}

async function readTables(db: QueryRunner): Promise<TableDef[]> {
  const tableRows = await db.query<{ schema_name: string; table_name: string; has_identity: boolean }>(`
    SELECT n.nspname AS schema_name, c.relname AS table_name,
           EXISTS (
             SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attidentity IN ('a','d')
           ) AS has_identity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname NOT IN ('pg_catalog','information_schema')
  `);

  const columnRows = await db.query<{
    schema_name: string; table_name: string; column_name: string; ordinal: number;
    data_type: string; is_nullable: boolean; is_identity: boolean; is_computed: boolean;
    computed_definition: string | null; default_definition: string | null; collation: string | null;
  }>(`
    SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
           a.attnum AS ordinal,
           format_type(a.atttypid, a.atttypmod) AS data_type,
           NOT a.attnotnull AS is_nullable,
           (a.attidentity IN ('a','d')) AS is_identity,
           a.attgenerated = 's' AS is_computed,
           pg_get_expr(adbin, ad.adrelid) AS computed_definition,
           pg_get_expr(adbin, ad.adrelid) AS default_definition,
           NULLIF(co.collname, 'default') AS collation
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
 LEFT JOIN pg_collation co ON co.oid = a.attcollation
     WHERE c.relkind = 'r'
       AND n.nspname NOT IN ('pg_catalog','information_schema')
  `);

  const constraintRows = await db.query<{
    schema_name: string; table_name: string; constraint_name: string;
    contype: string; condef: string; column_names: string[] | null;
  }>(`
    SELECT n.nspname AS schema_name, c.relname AS table_name, co.conname AS constraint_name,
           co.contype::text AS contype,
           pg_get_constraintdef(co.oid) AS condef,
           CASE WHEN array_length(co.conkey, 1) IS NOT NULL THEN
             ARRAY(
               SELECT a.attname FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attnum = ANY(co.conkey)
                ORDER BY array_position(co.conkey, a.attnum)
             )
           END AS column_names
      FROM pg_constraint co
      JOIN pg_class c ON c.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  `);

  const indexRows = await db.query<{
    schema_name: string; table_name: string; index_name: string;
    is_unique: boolean; column_names: string[]; definition: string;
  }>(`
    SELECT n.nspname AS schema_name, c.relname AS table_name, ic.relname AS index_name,
           ix.indisunique AS is_unique,
           ARRAY(
             SELECT a.attname FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attnum = ANY(ix.indkey::int[])
              ORDER BY array_position(ix.indkey::int[], a.attnum)
           ) AS column_names,
           pg_get_indexdef(ix.indexrelid) AS definition
      FROM pg_index ix
      JOIN pg_class c ON c.oid = ix.indrelid
      JOIN pg_class ic ON ic.oid = ix.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname NOT IN ('pg_catalog','information_schema')
       AND NOT ix.indisprimary
  `);

  const fkRows = await db.query<{
    schema_name: string; table_name: string; constraint_name: string;
    columns: string[]; ref_schema: string; ref_table: string; ref_columns: string[];
    on_delete: string; on_update: string;
  }>(`
    SELECT n.nspname AS schema_name, c.relname AS table_name, co.conname AS constraint_name,
           ARRAY(
             SELECT a.attname FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attnum = ANY(co.conkey)
              ORDER BY array_position(co.conkey, a.attnum)
           ) AS columns,
           rn.nspname AS ref_schema, rc.relname AS ref_table,
           ARRAY(
             SELECT a.attname FROM pg_attribute a
              WHERE a.attrelid = rc.oid AND a.attnum = ANY(co.confkey)
              ORDER BY array_position(co.confkey, a.attnum)
           ) AS ref_columns,
           co.confdeltype::text AS on_delete,
           co.confupdtype::text AS on_update
      FROM pg_constraint co
      JOIN pg_class c ON c.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class rc ON rc.oid = co.confrelid
      JOIN pg_namespace rn ON rn.oid = rc.relnamespace
     WHERE co.contype = 'f'
       AND n.nspname NOT IN ('pg_catalog','information_schema')
  `);

  const tables: TableDef[] = [];
  for (const t of tableRows) {
    const columns: ColumnDef[] = stableSortBy(
      columnRows.filter((c) => c.schema_name === t.schema_name && c.table_name === t.table_name),
      (c) => String(c.ordinal).padStart(6, '0'),
    ).map((c) => ({
      name: c.column_name,
      ordinal: c.ordinal,
      dataType: c.data_type,
      isNullable: c.is_nullable,
      isIdentity: c.is_identity,
      isComputed: c.is_computed,
      computedExpression: c.computed_definition ?? undefined,
      defaultExpression: c.default_definition ?? undefined,
      collation: c.collation ?? undefined,
    }));

    const myConstraints = constraintRows.filter(
      (r) => r.schema_name === t.schema_name && r.table_name === t.table_name,
    );

    const pkRow = myConstraints.find((r) => r.contype === 'p');
    const primaryKey: PrimaryKeyDef | undefined = pkRow && pkRow.column_names
      ? { name: pkRow.constraint_name, columns: pkRow.column_names, clustered: false }
      : undefined;

    const uniqueConstraints: UniqueConstraintDef[] = stableSortBy(
      myConstraints
        .filter((r) => r.contype === 'u' && r.column_names)
        .map((r) => ({ name: r.constraint_name, columns: r.column_names!, clustered: false })),
      (u) => u.name.toLowerCase(),
    );

    const checks: CheckConstraintDef[] = stableSortBy(
      myConstraints
        .filter((r) => r.contype === 'c')
        .map((r) => ({ name: r.constraint_name, expression: r.condef })),
      (c) => c.name.toLowerCase(),
    );

    const indexes: IndexDef[] = stableSortBy(
      indexRows
        .filter((r) => r.schema_name === t.schema_name && r.table_name === t.table_name)
        // Skip indexes that back unique/PK constraints (they appear as constraints already)
        .filter((r) => !myConstraints.some((c) => c.constraint_name === r.index_name))
        .map((r) => ({
          name: r.index_name,
          isUnique: r.is_unique,
          isClustered: false,
          columns: r.column_names,
          includes: [],
          filter: undefined,
        })),
      (i) => i.name.toLowerCase(),
    );

    const foreignKeys: ForeignKeyDef[] = stableSortBy(
      fkRows
        .filter((r) => r.schema_name === t.schema_name && r.table_name === t.table_name)
        .map((r) => ({
          name: r.constraint_name,
          columns: r.columns,
          referencedSchema: r.ref_schema,
          referencedTable: r.ref_table,
          referencedColumns: r.ref_columns,
          onDelete: pgActionToFlag(r.on_delete),
          onUpdate: pgActionToFlag(r.on_update),
        })),
      (f) => f.name.toLowerCase(),
    );

    tables.push({
      schema: t.schema_name,
      name: t.table_name,
      hasIdentity: t.has_identity,
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
  const rows = await db.query<{ schema_name: string; view_name: string; definition: string }>(`
    SELECT n.nspname AS schema_name, c.relname AS view_name,
           pg_get_viewdef(c.oid, true) AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('v','m')
       AND n.nspname NOT IN ('pg_catalog','information_schema')
  `);
  return rows.map((r) => ({ schema: r.schema_name, name: r.view_name, definition: r.definition }));
}

async function readRoutines(db: QueryRunner): Promise<{ procedures: RoutineDef[]; functions: RoutineDef[] }> {
  const rows = await db.query<{
    schema_name: string; routine_name: string; definition: string; prokind: string;
  }>(`
    SELECT n.nspname AS schema_name, p.proname AS routine_name,
           pg_get_functiondef(p.oid) AS definition,
           p.prokind::text AS prokind
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  `);
  const procedures: RoutineDef[] = [];
  const functions: RoutineDef[] = [];
  for (const r of rows) {
    const def = { schema: r.schema_name, name: r.routine_name, definition: r.definition };
    if (r.prokind === 'p') procedures.push({ ...def, kind: 'procedure' });
    else functions.push({ ...def, kind: 'function' });
  }
  return { procedures, functions };
}

async function readTriggers(db: QueryRunner): Promise<TriggerDef[]> {
  const rows = await db.query<{ schema_name: string; trigger_name: string; table_name: string; definition: string }>(`
    SELECT n.nspname AS schema_name, t.tgname AS trigger_name, c.relname AS table_name,
           pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal
       AND n.nspname NOT IN ('pg_catalog','information_schema')
  `);
  return rows.map((r) => ({
    schema: r.schema_name,
    name: r.trigger_name,
    table: r.table_name,
    definition: r.definition,
  }));
}

async function readSequences(db: QueryRunner): Promise<SequenceDef[]> {
  const rows = await db.query<{
    schema_name: string; seq_name: string; start_value: string; increment: string;
    min_value: string; max_value: string; cycle: boolean; last_value: string | null;
  }>(`
    SELECT n.nspname AS schema_name, c.relname AS seq_name,
           start_value::text, increment_by::text AS increment,
           min_value::text, max_value::text,
           cycle, last_value::text
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_sequences s ON s.schemaname = n.nspname AND s.sequencename = c.relname
     WHERE c.relkind = 'S'
       AND n.nspname NOT IN ('pg_catalog','information_schema')
  `);
  return rows.map((r) => ({
    schema: r.schema_name,
    name: r.seq_name,
    startValue: r.start_value,
    increment: r.increment,
    minValue: r.min_value ?? undefined,
    maxValue: r.max_value ?? undefined,
    cycle: r.cycle,
    currentValue: r.last_value ?? undefined,
  }));
}

function pgActionToFlag(code: string): ForeignKeyDef['onDelete'] {
  switch ((code || '').toLowerCase()) {
    case 'c': return 'CASCADE';
    case 'n': return 'SET_NULL';
    case 'd': return 'SET_DEFAULT';
    case 'a':
    case 'r':
    default:
      return 'NO_ACTION';
  }
}
