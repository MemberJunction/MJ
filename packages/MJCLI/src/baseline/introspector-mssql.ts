/**
 * MSSQL introspector.
 *
 * Returns a normalized SchemaSnapshot. All object bodies (views, procs,
 * functions, triggers) are pulled via OBJECT_DEFINITION() so they are
 * byte-faithful to what the database actually has — no AST round-trip.
 */

import type { QueryRunner } from './connection';
import { isExcludedTable, stableSortBy } from './util';
import type {
  CheckConstraintDef,
  ColumnDef,
  ExtendedPropertyDef,
  ForeignKeyDef,
  IndexDef,
  PrimaryKeyDef,
  RoutineDef,
  SchemaSnapshot,
  SequenceDef,
  TableDef,
  TriggerDef,
  UniqueConstraintDef,
  UserDefinedTypeColumnDef,
  UserDefinedTypeDef,
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

  progress.onPhase?.('userDefinedTypes');
  const userDefinedTypes = await readUserDefinedTypes(db);

  progress.onPhase?.('extendedProperties');
  const extendedProperties = await readExtendedProperties(db);

  return {
    dialect: 'mssql',
    schemas: stableSortBy(schemas, (s) => s.name.toLowerCase()),
    tables: stableSortBy(tables, (t) => `${t.schema}.${t.name}`.toLowerCase()),
    views: stableSortBy(views, (v) => `${v.schema}.${v.name}`.toLowerCase()),
    procedures: stableSortBy(procedures, (r) => `${r.schema}.${r.name}`.toLowerCase()),
    functions: stableSortBy(functions, (r) => `${r.schema}.${r.name}`.toLowerCase()),
    triggers: stableSortBy(triggers, (t) => `${t.schema}.${t.name}`.toLowerCase()),
    sequences: stableSortBy(sequences, (s) => `${s.schema}.${s.name}`.toLowerCase()),
    userDefinedTypes: stableSortBy(userDefinedTypes, (u) => `${u.schema}.${u.name}`.toLowerCase()),
    extendedProperties: stableSortBy(
      extendedProperties,
      (p) => extPropSortKey(p),
    ),
  };
}

/** Canonical sort key for extended properties so output stays byte-deterministic. */
function extPropSortKey(p: ExtendedPropertyDef): string {
  return [
    p.schemaName.toLowerCase(),
    (p.level1Type || '').toLowerCase(),
    (p.level1Name || '').toLowerCase(),
    (p.level2Type || '').toLowerCase(),
    (p.level2Name || '').toLowerCase(),
    p.name.toLowerCase(),
  ].join('|');
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
    computed_definition: string | null; computed_is_persisted: number | null;
    default_definition: string | null; default_name: string | null;
    collation: string | null;
  }>(`
    SELECT s.name AS schema_name, t.name AS table_name, c.name AS column_name,
           c.column_id AS ordinal,
           ty.name AS data_type, c.max_length, c.precision, c.scale,
           c.is_nullable, c.is_identity, c.is_computed,
           cc.definition AS computed_definition,
           CAST(cc.is_persisted AS INT) AS computed_is_persisted,
           dc.definition AS default_definition,
           dc.name AS default_name,
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
    // Skip Skyway/Flyway's own bookkeeping table — the migrator creates it
    // automatically before running any migration, so emitting CREATE TABLE for
    // it in the baseline collides ("There is already an object named ...").
    // Filtering at the introspector level removes the table AND all of its
    // nested constraints/indexes/data from the snapshot in one pass.
    if (isExcludedTable(t.table_name)) continue;
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
      isComputedPersisted: c.computed_is_persisted == null ? undefined : !!c.computed_is_persisted,
      defaultExpression: c.default_definition ?? undefined,
      defaultConstraintName: c.default_name ?? undefined,
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
       AND t.name <> 'flyway_schema_history'   -- defensive: never emit triggers on the migrator's own table
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

async function readUserDefinedTypes(db: QueryRunner): Promise<UserDefinedTypeDef[]> {
  // Table types live in sys.table_types. We only support user-defined ones.
  // Note: tt.type_table_object_id is the synthetic object whose columns live in sys.columns.
  const typeRows = await db.query<{
    schema_name: string; type_name: string; type_table_object_id: number; is_memory_optimized: number;
  }>(`
    SELECT s.name AS schema_name,
           tt.name AS type_name,
           tt.type_table_object_id,
           CAST(tt.is_memory_optimized AS INT) AS is_memory_optimized
      FROM sys.table_types tt
      JOIN sys.schemas s ON s.schema_id = tt.schema_id
     WHERE tt.is_user_defined = 1
  `);
  if (typeRows.length === 0) return [];

  const columnRows = await db.query<{
    type_table_object_id: number; column_name: string; ordinal: number;
    data_type: string; max_length: number; precision: number; scale: number;
    is_nullable: number; collation: string | null;
  }>(`
    SELECT tt.type_table_object_id,
           c.name AS column_name,
           c.column_id AS ordinal,
           ty.name AS data_type, c.max_length, c.precision, c.scale,
           CAST(c.is_nullable AS INT) AS is_nullable,
           c.collation_name AS collation
      FROM sys.table_types tt
      JOIN sys.columns c ON c.object_id = tt.type_table_object_id
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
     WHERE tt.is_user_defined = 1
  `);

  // Read primary keys defined inline on table types. Distinct query because the
  // sys.indexes object_id matches type_table_object_id (not sys.tables).
  const pkRows = await db.query<{
    type_table_object_id: number; constraint_name: string;
    column_name: string; key_ordinal: number; is_clustered: number;
  }>(`
    SELECT tt.type_table_object_id, kc.name AS constraint_name,
           c.name AS column_name, ic.key_ordinal,
           CAST(CASE WHEN i.type = 1 THEN 1 ELSE 0 END AS INT) AS is_clustered
      FROM sys.table_types tt
      JOIN sys.key_constraints kc ON kc.parent_object_id = tt.type_table_object_id AND kc.type = 'PK'
      JOIN sys.indexes i ON i.object_id = kc.parent_object_id AND i.index_id = kc.unique_index_id
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
     WHERE tt.is_user_defined = 1
  `);

  const out: UserDefinedTypeDef[] = [];
  for (const t of typeRows) {
    const cols: UserDefinedTypeColumnDef[] = stableSortBy(
      columnRows.filter((c) => c.type_table_object_id === t.type_table_object_id),
      (c) => String(c.ordinal).padStart(6, '0'),
    ).map((c) => ({
      name: c.column_name,
      ordinal: c.ordinal,
      dataType: formatMssqlType(c),
      isNullable: !!c.is_nullable,
      collation: c.collation ?? undefined,
    }));

    const pkCols = pkRows.filter((r) => r.type_table_object_id === t.type_table_object_id);
    const primaryKey: PrimaryKeyDef | undefined = pkCols.length
      ? {
          name: pkCols[0].constraint_name,
          clustered: !!pkCols[0].is_clustered,
          columns: stableSortBy(pkCols, (r) => String(r.key_ordinal).padStart(6, '0')).map((r) => r.column_name),
        }
      : undefined;

    out.push({
      schema: t.schema_name,
      name: t.type_name,
      kind: 'table',
      isMemoryOptimized: !!t.is_memory_optimized,
      columns: cols,
      primaryKey,
    });
  }
  return out;
}

async function readExtendedProperties(db: QueryRunner): Promise<ExtendedPropertyDef[]> {
  // Three classes of extended properties matter for MJ:
  //   class=1 OBJECT_OR_COLUMN — table, view, proc, function, trigger, type, and any column thereof
  //   class=3 SCHEMA
  //   class=7 INDEX — rare in MJ but emit for completeness
  // Everything else (DB-level, assemblies, etc.) is skipped intentionally.
  //
  // For class=1 we have to look up the object's type (sys.objects.type) and
  // figure out the level1Type (TABLE/VIEW/PROCEDURE/FUNCTION/TYPE) plus the
  // optional level2 column. Table types route through sys.table_types since
  // their object_id matches type_table_object_id, not sys.objects.
  const rows = await db.query<{
    class_id: number;
    prop_name: string;
    prop_value: string | null;
    schema_name: string | null;
    level1_type: string | null;
    level1_name: string | null;
    level2_type: string | null;
    level2_name: string | null;
  }>(`
    -- class 1: object (or column)
    SELECT 1 AS class_id,
           ep.name AS prop_name,
           CAST(ep.value AS NVARCHAR(MAX)) AS prop_value,
           s.name AS schema_name,
           CASE
             WHEN o.type IN ('U') THEN 'TABLE'
             WHEN o.type IN ('V') THEN 'VIEW'
             WHEN o.type IN ('P') THEN 'PROCEDURE'
             WHEN o.type IN ('FN','TF','IF') THEN 'FUNCTION'
             WHEN o.type IN ('SO') THEN 'SEQUENCE'
             WHEN o.type IN ('TR') THEN NULL -- triggers get re-routed below to TABLE/TRIGGER
             ELSE NULL
           END AS level1_type,
           o.name AS level1_name,
           CASE WHEN ep.minor_id > 0 THEN 'COLUMN' ELSE NULL END AS level2_type,
           c.name AS level2_name
      FROM sys.extended_properties ep
      JOIN sys.objects o ON o.object_id = ep.major_id
      JOIN sys.schemas s ON s.schema_id = o.schema_id
 LEFT JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id AND ep.minor_id > 0
     WHERE ep.class = 1
       AND o.is_ms_shipped = 0
       AND o.type IN ('U','V','P','FN','TF','IF','SO')   -- triggers handled below

    UNION ALL

    -- class 1 (triggers): level1=TABLE (parent), level2=TRIGGER (the trigger itself)
    SELECT 1 AS class_id,
           ep.name AS prop_name,
           CAST(ep.value AS NVARCHAR(MAX)) AS prop_value,
           ps.name AS schema_name,
           'TABLE' AS level1_type,
           pt.name AS level1_name,
           'TRIGGER' AS level2_type,
           tr.name AS level2_name
      FROM sys.extended_properties ep
      JOIN sys.triggers tr ON tr.object_id = ep.major_id
      JOIN sys.tables pt ON pt.object_id = tr.parent_id
      JOIN sys.schemas ps ON ps.schema_id = pt.schema_id
     WHERE ep.class = 1
       AND tr.is_ms_shipped = 0

    UNION ALL

    -- class 1 (table types): level1=TYPE, level2 = COLUMN if applicable
    SELECT 1 AS class_id,
           ep.name AS prop_name,
           CAST(ep.value AS NVARCHAR(MAX)) AS prop_value,
           s.name AS schema_name,
           'TYPE' AS level1_type,
           tt.name AS level1_name,
           CASE WHEN ep.minor_id > 0 THEN 'COLUMN' ELSE NULL END AS level2_type,
           c.name AS level2_name
      FROM sys.extended_properties ep
      JOIN sys.table_types tt ON tt.type_table_object_id = ep.major_id
      JOIN sys.schemas s ON s.schema_id = tt.schema_id
 LEFT JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id AND ep.minor_id > 0
     WHERE ep.class = 1
       AND tt.is_user_defined = 1

    UNION ALL

    -- class 3: schema-level
    SELECT 3 AS class_id,
           ep.name AS prop_name,
           CAST(ep.value AS NVARCHAR(MAX)) AS prop_value,
           s.name AS schema_name,
           NULL AS level1_type,
           NULL AS level1_name,
           NULL AS level2_type,
           NULL AS level2_name
      FROM sys.extended_properties ep
      JOIN sys.schemas s ON s.schema_id = ep.major_id
     WHERE ep.class = 3
       AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest', 'db_owner', 'db_accessadmin',
                          'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader',
                          'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
  `);

  const out: ExtendedPropertyDef[] = [];
  for (const r of rows) {
    // Skip rows we couldn't classify (level1_type=NULL on class=1 means an
    // object kind we don't emit baselines for, e.g. CLR assemblies).
    if (r.class_id === 1 && !r.level1_type) continue;
    if (!r.schema_name) continue;
    // Mirror the table-level filter for any property attached to flyway_schema_history.
    if (r.level1_name && isExcludedTable(r.level1_name)) continue;
    out.push({
      name: r.prop_name,
      value: r.prop_value ?? '',
      schemaName: r.schema_name,
      level1Type: r.level1_type ?? undefined,
      level1Name: r.level1_name ?? undefined,
      level2Type: r.level2_type ?? undefined,
      level2Name: r.level2_name ?? undefined,
    });
  }
  return out;
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
