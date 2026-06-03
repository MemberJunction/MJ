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
 *  10. CREATE USER / CREATE ROLE (database principals — required before any GRANT)
 *  11. CREATE TYPE … AS TABLE (UDTs — before functions/procs that take TVPs)
 *  12. CREATE FUNCTION statements (before views — MJ views reference UDFs)
 *  13. CREATE VIEW statements
 *  14. CREATE PROCEDURE statements
 *  15. CREATE TRIGGER statements
 *  16. ALTER TABLE ADD CONSTRAINT … FOREIGN KEY (last so order doesn't matter)
 *  17. ALTER ROLE … ADD MEMBER (role memberships — requires both principals to exist)
 *  18. GRANT/DENY permissions (last so every grantee + every target object exists)
 *  19. EXEC sp_addextendedproperty calls (after every object that can carry them)
 */

import {
  formatTsqlValue,
  isoUtcSeconds,
  NL,
  quoteIdent,
  quoteString,
  stableSortBy,
  topoSortRoutinesByDefinition,
} from './util';
import type {
  BaselineEmitOptions,
  ColumnDef,
  DatabasePrincipalDef,
  ExtendedPropertyDef,
  ForeignKeyDef,
  IndexDef,
  PermissionDef,
  RoleMembershipDef,
  RoutineDef,
  SchemaSnapshot,
  SequenceDef,
  TableDataDump,
  TableDef,
  TriggerDef,
  UserDefinedTypeDef,
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
  // Principals (users + custom roles) come right after schemas so they exist
  // before any GRANT statement, and so AUTHORIZATION clauses on objects (if
  // any) can resolve. They're also independent of every other object kind, so
  // moving them early has no ordering risk.
  parts.push(emitPrincipals(input.snapshot.principals));
  parts.push(emitSequences(input.snapshot.sequences));
  parts.push(emitTables(input.snapshot.tables));
  parts.push(emitDefaults(input.snapshot.tables));
  parts.push(emitChecks(input.snapshot.tables));
  parts.push(emitIndexes(input.snapshot.tables));
  if (input.options.includeData) {
    parts.push(emitData(input.snapshot.tables, input.dataDumps, input.options.batchSize));
  }
  // UDTs (table types) BEFORE any routine: procs/functions accept these as TVPs
  // and MSSQL needs the type to exist at create time.
  parts.push(emitUserDefinedTypes(input.snapshot.userDefinedTypes));
  // Functions before views: MJ views frequently reference scalar/table UDFs
  // (e.g. vwActionCategories → fnActionCategoryParentID_GetRootID). MSSQL does
  // NOT defer name resolution for view bodies, so the function must already
  // exist when the view is created.
  //
  // Within each category we also topo-sort by inferred body references because
  // views can reference other views, functions can reference other functions,
  // etc. Cycles fall back to qname order so output stays deterministic.
  parts.push(emitRoutines(topoSortRoutinesByDefinition(input.snapshot.functions), 'function'));
  parts.push(emitViews(topoSortRoutinesByDefinition(input.snapshot.views)));
  parts.push(emitRoutines(topoSortRoutinesByDefinition(input.snapshot.procedures), 'procedure'));
  parts.push(emitTriggers(topoSortRoutinesByDefinition(input.snapshot.triggers)));
  parts.push(emitForeignKeys(input.snapshot.tables));
  // Role memberships come AFTER principals + all objects exist. ALTER ROLE
  // requires both the role and the member principal to be present.
  parts.push(emitRoleMemberships(input.snapshot.roleMemberships));
  // Permissions come last among real DDL: GRANT validates that both the
  // grantee principal AND the target object (table/view/proc/etc.) exist.
  parts.push(emitPermissions(input.snapshot.permissions));
  // Extended properties LAST: every object they reference must already exist,
  // since sp_addextendedproperty validates the target.
  parts.push(emitExtendedProperties(input.snapshot.extendedProperties));
  parts.push(emitFooter());
  return parts.filter((p) => p.length > 0).join(NL + NL) + NL;
}

function emitHeader(options: BaselineEmitOptions): string {
  return [
    `-- ============================================================================`,
    `-- ${options.description}`,
    `-- Baseline version : v${options.baselineVersion}.x`,
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
    // sys.computed_columns.is_persisted is captured in the introspector now;
    // emit PERSISTED so the target column has the same plan/index eligibility.
    const persisted = c.isComputedPersisted ? ' PERSISTED' : '';
    // The introspector hands us the body inside parens already? No — `cc.definition`
    // returns the body WITHOUT outer parens for some shapes. Wrap defensively.
    const body = c.computedExpression.trim();
    const wrapped = body.startsWith('(') && body.endsWith(')') ? body : `(${body})`;
    return `${quoteIdent(c.name)} AS ${wrapped}${persisted}`;
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
        // Use the original constraint name if the introspector captured it
        // (it should, for every default — `sys.default_constraints.name`).
        // Fall back to the synthetic format only for hand-built test fixtures.
        const constraintName = c.defaultConstraintName ?? `DF_${t.schema}_${t.name}_${c.name}`;
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
  // The trailing `GO` after the section header is REQUIRED: MSSQL stores the
  // entire batch text (including leading comments) in OBJECT_DEFINITION(), so
  // without this the first view's body would contain `-- Views\n` as a prefix
  // and the comparator would flag a body-mismatch against the source DB whose
  // V-stack-created view body has no such prefix.
  const lines: string[] = ['-- Views', 'GO'];
  for (const v of views) {
    if (!v.definition.trim()) continue;
    lines.push(v.definition.trim());
    lines.push('GO');
  }
  return lines.join(NL);
}

function emitRoutines(routines: readonly RoutineDef[], _kind: 'procedure' | 'function'): string {
  if (routines.length === 0) return '';
  // Same comment-leak fix as emitViews — see comment there.
  const lines: string[] = [`-- ${routines[0].kind === 'procedure' ? 'Procedures' : 'Functions'}`, 'GO'];
  for (const r of routines) {
    if (!r.definition.trim()) continue;
    lines.push(r.definition.trim());
    lines.push('GO');
  }
  return lines.join(NL);
}

function emitTriggers(triggers: readonly TriggerDef[]): string {
  if (triggers.length === 0) return '';
  // Same comment-leak fix as emitViews — see comment there.
  const lines: string[] = ['-- Triggers', 'GO'];
  for (const t of triggers) {
    if (!t.definition.trim()) continue;
    lines.push(t.definition.trim());
    lines.push('GO');
  }
  return lines.join(NL);
}

function emitUserDefinedTypes(types: readonly UserDefinedTypeDef[]): string {
  if (types.length === 0) return '';
  const lines: string[] = ['-- User-defined types (table types)'];
  for (const t of stableSortBy(types, (u) => `${u.schema}.${u.name}`.toLowerCase())) {
    if (t.isMemoryOptimized) {
      // MEMORY_OPTIMIZED table types require a hash/range index in their body.
      // MJ doesn't use them today; if that changes we'll need to capture the
      // bucket-count + index columns and emit the proper WITH (...) clause.
      throw new Error(
        `User-defined type ${t.schema}.${t.name} is MEMORY_OPTIMIZED — emitter has no path for that yet.`,
      );
    }
    const colLines: string[] = [];
    for (const c of t.columns) {
      const parts = [quoteIdent(c.name), c.dataType.toUpperCase()];
      // CREATE TYPE AS TABLE accepts COLLATE only on char-family columns, same as CREATE TABLE.
      if (c.collation && /char|text/.test(c.dataType.toLowerCase())) {
        parts.push(`COLLATE ${c.collation}`);
      }
      parts.push(c.isNullable ? 'NULL' : 'NOT NULL');
      colLines.push('    ' + parts.join(' '));
    }
    if (t.primaryKey) {
      // Table types can't have a named PK constraint — the name is auto-generated
      // by MSSQL. Use the inline `PRIMARY KEY (...)` clause.
      const cluster = t.primaryKey.clustered ? 'CLUSTERED' : 'NONCLUSTERED';
      colLines.push(
        `    PRIMARY KEY ${cluster} (${t.primaryKey.columns.map((n) => quoteIdent(n)).join(', ')})`,
      );
    }
    lines.push(`CREATE TYPE ${quoteIdent(t.schema)}.${quoteIdent(t.name)} AS TABLE (`);
    lines.push(colLines.join(',' + NL));
    lines.push(');');
    lines.push('GO');
  }
  return lines.join(NL);
}

/**
 * Emit `sp_addextendedproperty` calls. MJ uses these for MS_Description on
 * schemas, tables, columns, views, procs, functions, and triggers. The level0
 * is always SCHEMA; level1/level2 distinguish the target's kind and depth.
 *
 * We don't use `IF NOT EXISTS … sp_updateextendedproperty` style guards — the
 * baseline applies to an empty DB by contract, so a straight `sp_addextendedproperty`
 * is the right call.
 */
function emitExtendedProperties(props: readonly ExtendedPropertyDef[]): string {
  if (props.length === 0) return '';
  const lines: string[] = ['-- Extended properties (descriptions etc.)'];
  for (const p of props) {
    const args: string[] = [
      `@name = ${quoteString(p.name)}`,
      `@value = ${quoteString(p.value)}`,
      `@level0type = N'SCHEMA', @level0name = ${quoteString(p.schemaName)}`,
    ];
    if (p.level1Type) {
      args.push(
        `@level1type = N'${p.level1Type}', @level1name = ${quoteString(p.level1Name ?? '')}`,
      );
    }
    if (p.level2Type) {
      args.push(
        `@level2type = N'${p.level2Type}', @level2name = ${quoteString(p.level2Name ?? '')}`,
      );
    }
    lines.push(`EXEC sp_addextendedproperty ${args.join(', ')};`);
    lines.push('GO');
  }
  return lines.join(NL);
}

/**
 * Emit CREATE USER + CREATE ROLE statements.
 *
 * Mirrors the v5.0 baseline's pattern exactly:
 *   - SQL users use the EngineEdition-aware conditional: on Azure SQL DB
 *     (EngineEdition=5) create as contained user; otherwise check the server
 *     login and create FOR LOGIN if it exists, WITHOUT LOGIN otherwise.
 *   - Roles use `IF DATABASE_PRINCIPAL_ID(...) IS NULL CREATE ROLE …
 *     AUTHORIZATION [db_securityadmin]` so the owner matches what the source
 *     DB has (where MJ's cdp_* roles are owned by db_securityadmin).
 *
 * Order within the section: roles first (so users can be members at creation
 * if any future migration wanted to do that — currently the data shows none),
 * then users.
 */
function emitPrincipals(principals: readonly DatabasePrincipalDef[]): string {
  if (principals.length === 0) return '';
  const lines: string[] = ['-- Database principals (users + custom roles)', 'GO'];

  const roles = principals.filter((p) => p.kind === 'database_role' || p.kind === 'application_role');
  const users = principals.filter((p) => p.kind !== 'database_role' && p.kind !== 'application_role');

  for (const r of stableSortBy(roles, (p) => p.name.toLowerCase())) {
    const authClause = r.owner ? ` AUTHORIZATION ${quoteIdent(r.owner)}` : '';
    lines.push(`IF DATABASE_PRINCIPAL_ID(${quoteString(r.name)}) IS NULL`);
    lines.push(`    EXEC('CREATE ROLE ${quoteIdent(r.name)}${authClause}');`);
    lines.push('GO');
  }

  for (const u of stableSortBy(users, (p) => p.name.toLowerCase())) {
    // Windows / AAD users have a different `CREATE USER` syntax (no FOR LOGIN);
    // emit them straight if the principal isn't already in the DB.
    if (u.kind === 'windows_user' || u.kind === 'aad_user' || u.kind === 'aad_group') {
      lines.push(`IF DATABASE_PRINCIPAL_ID(${quoteString(u.name)}) IS NULL`);
      lines.push(`    EXEC('CREATE USER ${quoteIdent(u.name)} FROM EXTERNAL PROVIDER');`);
      lines.push('GO');
      continue;
    }
    // SQL users: mirror v5.0's conditional FOR LOGIN / WITHOUT LOGIN pattern.
    // Wrapped in `IF DATABASE_PRINCIPAL_ID(...) IS NULL` so the whole block
    // is idempotent when the baseline is re-applied (e.g. for diagnostics).
    lines.push(`IF DATABASE_PRINCIPAL_ID(${quoteString(u.name)}) IS NULL`);
    lines.push('BEGIN');
    lines.push(`    DECLARE @login_exists_${safeSuffix(u.name)} BIT = 0;`);
    // On Azure SQL DB (EngineEdition=5) there are no server logins, so treat the login as
    // present (the contained-user path below). Otherwise probe master.sys.server_principals —
    // but via sp_executesql so the cross-database reference is COMPILED only when the ELSE
    // branch actually runs. Azure SQL compiles the entire batch up front, so a *static*
    // master.sys.* reference fails to compile there even though this runtime EngineEdition
    // guard would skip it. Deferring it into a dynamic statement keeps it out of the batch's
    // compile pass, and it is never compiled on Azure SQL because the ELSE branch is dead there.
    lines.push(`    IF SERVERPROPERTY('EngineEdition') = 5`);
    lines.push(`        SET @login_exists_${safeSuffix(u.name)} = 1;`);
    lines.push('    ELSE');
    lines.push('        EXEC sp_executesql');
    lines.push(`            N'IF EXISTS (SELECT 1 FROM master.sys.server_principals WHERE name = @n) SET @e = 1',`);
    lines.push(`            N'@n NVARCHAR(128), @e BIT OUTPUT',`);
    lines.push(`            @n = ${quoteString(u.name)}, @e = @login_exists_${safeSuffix(u.name)} OUTPUT;`);
    lines.push(`    IF @login_exists_${safeSuffix(u.name)} = 1`);
    lines.push(`        EXEC('CREATE USER ${quoteIdent(u.name)} FOR LOGIN ${quoteIdent(u.name)}');`);
    lines.push('    ELSE');
    lines.push(`        EXEC('CREATE USER ${quoteIdent(u.name)} WITHOUT LOGIN');`);
    lines.push('END');
    lines.push('GO');
  }

  return lines.join(NL);
}

/** Safe identifier suffix for variable names embedded inside an IF block. */
function safeSuffix(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Emit ALTER ROLE … ADD MEMBER statements, each guarded by IS_ROLEMEMBER so
 * the baseline is safe to re-apply (and tolerant of orderings where Skyway
 * itself may have created a partial state on retry).
 */
function emitRoleMemberships(memberships: readonly RoleMembershipDef[]): string {
  if (memberships.length === 0) return '';
  const lines: string[] = ['-- Role memberships', 'GO'];
  for (const m of stableSortBy(memberships, (x) => `${x.role}|${x.member}`.toLowerCase())) {
    lines.push(`IF IS_ROLEMEMBER(${quoteString(m.role)}, ${quoteString(m.member)}) = 0`);
    lines.push(`    ALTER ROLE ${quoteIdent(m.role)} ADD MEMBER ${quoteIdent(m.member)};`);
    lines.push('GO');
  }
  return lines.join(NL);
}

/**
 * Emit GRANT/DENY statements. Class-specific syntax:
 *   DATABASE: GRANT <perm> TO [grantee]
 *   SCHEMA:   GRANT <perm> ON SCHEMA::[schema] TO [grantee]
 *   OBJECT:   GRANT <perm> ON [schema].[object] TO [grantee]            (most common)
 *             GRANT <perm> ([column]) ON [schema].[object] TO [grantee] (column-level)
 *   TYPE:     GRANT <perm> ON TYPE::[schema].[type] TO [grantee]
 *
 * GRANT is idempotent in SQL Server (repeated GRANTs are no-ops on permission rows),
 * so we don't need IF guards. WITH GRANT OPTION is appended for `GRANT_WITH_GRANT_OPTION`.
 */
function emitPermissions(perms: readonly PermissionDef[]): string {
  if (perms.length === 0) return '';
  const lines: string[] = ['-- Permissions', 'GO'];
  for (const p of perms) {
    lines.push(formatPermission(p) + ';');
    lines.push('GO');
  }
  return lines.join(NL);
}

function formatPermission(p: PermissionDef): string {
  const verb =
    p.state === 'DENY' ? 'DENY' :
    p.state === 'REVOKE' ? 'REVOKE' : 'GRANT';
  const tail =
    p.state === 'GRANT_WITH_GRANT_OPTION' ? ' WITH GRANT OPTION' : '';

  const grantee = quoteIdent(p.grantee);
  const perm = p.permission;
  const colClause = p.targetColumn ? ` (${quoteIdent(p.targetColumn)})` : '';

  switch (p.targetClass) {
    case 'database':
      return `${verb} ${perm} TO ${grantee}${tail}`;
    case 'schema':
      return `${verb} ${perm} ON SCHEMA::${quoteIdent(p.targetSchema!)} TO ${grantee}${tail}`;
    case 'type':
      return `${verb} ${perm} ON TYPE::${quoteIdent(p.targetSchema!)}.${quoteIdent(p.targetType!)} TO ${grantee}${tail}`;
    case 'object':
    default:
      return (
        `${verb} ${perm}${colClause} ON ${quoteIdent(p.targetSchema!)}.${quoteIdent(p.targetObject!)} ` +
        `TO ${grantee}${tail}`
      );
  }
}
