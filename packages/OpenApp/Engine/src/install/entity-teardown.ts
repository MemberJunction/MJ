/**
 * FK-graph cascade teardown for an Open App's MJ (`__mj`) entity metadata.
 *
 * When an app is removed (or its schema is reset), every `__mj` row that FK-depends on the
 * app's `Entity` rows must be cleared BEFORE the entities themselves — otherwise the base-table
 * FKs (which are NO ACTION, not CASCADE) block the delete. The naive entity-layer approach
 * (RunView + per-row `Delete()`) UNDER-deletes: RunView reads base VIEWS (e.g. `vwRecordChanges`
 * INNER JOINs to `[User]`/`[Entity]`), so rows whose join is orphaned are invisible while the
 * base-TABLE FK still enforces them. This module instead enumerates the LIVE FK graph from
 * `sys.foreign_keys` and clears every one of `Entity`'s dependents — deepest-first, set-based,
 * in ONE atomic transaction.
 *
 * **SQL Server only.** The `sys.foreign_keys` catalog query, bracket-quoting, and
 * `SET XACT_ABORT ON` transaction wrapper are SQL-Server-specific. PostgreSQL keeps the existing
 * entity-layer teardown path (see `RemoveAppEntityMetadata` in `install-orchestrator.ts`).
 */
import type { DatabaseProviderBase } from '@memberjunction/core';
import type { AppInstallCallbacks } from '../types/open-app-types.js';
import { EscapeSqlString } from './schema-manager.js';

/**
 * A single-column foreign key within the MJ core schema: `childTable.childCol` references
 * `parentTable.parentRefCol`. `childNullable` is whether the child column allows NULL (which
 * decides SET NULL vs. DELETE during the walk).
 */
export interface FkEdge {
  parentTable: string;
  parentRefCol: string;
  childTable: string;
  childCol: string;
  childNullable: boolean;
}

/**
 * A single planned teardown operation: either DELETE the dependent rows, or SET NULL the
 * nullable FK column (unlinking the dependent so a shared row survives).
 */
export interface TeardownPlanItem {
  op: 'delete' | 'setnull';
  table: string;
  col: string | null;
  where: string;
}

/**
 * The result of {@link buildEntityTeardownPlan}: the executable `statements` (in dependency
 * order), the structured `plan` (for a dry-run report), and any `warnings` (e.g. FK cycles).
 */
export interface TeardownPlan {
  statements: string[];
  plan: TeardownPlanItem[];
  warnings: string[];
}

/**
 * Builds the FULL FK-dependent teardown for the doomed `Entity` rows, deepest-first. PURE — no DB.
 *
 * Recursively clears all of `Entity`'s FK-dependents via set-based DELETE (NOT-NULL FK → the row
 * can't exist without the entity → delete + recurse into ITS dependents) or UPDATE … SET NULL
 * (nullable FK → the row stands alone → unlink, no recursion, so shared objects like
 * Conversation/User survive). Then the `Entity` rows, then `SchemaInfo`. Each level is scoped by
 * a nested subquery rooted at the doomed entities. Self-refs (nullable → unlink; NOT NULL →
 * covered by the table's own set-delete) and cross-table cycles (path guard) are handled.
 *
 * @param fkEdges the single-column FK edges of the MJ core schema (from {@link EnumerateMjEntityFkGraph})
 * @param mjSchema the MJ core schema name (e.g. `__mj`), used for bracket-quoting `[mjSchema].[table]`
 * @param rootDoomedPredicate the predicate selecting the doomed `Entity` rows (e.g. `[SchemaName] = 'x'`)
 */
export function buildEntityTeardownPlan(fkEdges: FkEdge[], mjSchema: string, rootDoomedPredicate: string): TeardownPlan {
  const byParent = new Map<string, FkEdge[]>();
  for (const e of fkEdges) {
    if (!byParent.has(e.parentTable)) byParent.set(e.parentTable, []);
    byParent.get(e.parentTable)!.push(e);
  }
  const statements: string[] = [];
  const plan: TeardownPlanItem[] = [];
  const warnings: string[] = [];
  const emitted = new Set<string>();
  const q = (t: string): string => `[${mjSchema}].[${t}]`;
  const push = (sql: string, op: 'delete' | 'setnull', table: string, col: string | null, where: string): void => {
    if (emitted.has(sql)) return;
    emitted.add(sql);
    statements.push(sql);
    plan.push({ op, table, col, where });
  };
  const walk = (parentTable: string, parentDoomed: string, path: Set<string>): void => {
    const children = byParent.get(parentTable) ?? [];
    for (const c of children) {
      const where = `[${c.childCol}] IN (SELECT [${c.parentRefCol}] FROM ${q(parentTable)} WHERE ${parentDoomed})`;
      const setNull = `UPDATE ${q(c.childTable)} SET [${c.childCol}] = NULL WHERE ${where}`;
      const del = `DELETE FROM ${q(c.childTable)} WHERE ${where}`;
      if (c.childTable === parentTable) {
        if (c.childNullable) push(setNull, 'setnull', c.childTable, c.childCol, where);
        continue; // self-ref; NOT NULL covered by the table's own set-delete
      }
      if (path.has(c.childTable)) {
        warnings.push(`FK cycle at ${c.childTable} via ${parentTable}.${c.childCol} — cleared edge without recursing`);
        if (c.childNullable) push(setNull, 'setnull', c.childTable, c.childCol, where);
        else push(del, 'delete', c.childTable, c.childCol, where);
        continue;
      }
      if (c.childNullable) {
        push(setNull, 'setnull', c.childTable, c.childCol, where); // row survives -> no recursion
      } else {
        const next = new Set(path);
        next.add(c.childTable);
        walk(c.childTable, where, next); // grandchildren first
        push(del, 'delete', c.childTable, c.childCol, where);
      }
    }
  };
  walk('Entity', rootDoomedPredicate, new Set<string>(['Entity']));
  push(`DELETE FROM ${q('Entity')} WHERE ${rootDoomedPredicate}`, 'delete', 'Entity', null, rootDoomedPredicate);
  push(`DELETE FROM ${q('SchemaInfo')} WHERE ${rootDoomedPredicate}`, 'delete', 'SchemaInfo', null, rootDoomedPredicate);
  return { statements, plan, warnings };
}

/**
 * Enumerates every SINGLE-column FK within the MJ core schema (parent + child both in `mjSchema`).
 *
 * Composite FKs (a constraint spanning >1 column) are excluded and warned — `Entity` references
 * are all single-column, so this is safe. Runs the exact `sys.foreign_keys` catalog query and is
 * therefore SQL-Server-specific.
 */
export async function EnumerateMjEntityFkGraph(
  dbProvider: DatabaseProviderBase,
  mjSchema: string,
  callbacks?: AppInstallCallbacks,
): Promise<FkEdge[]> {
  const s = EscapeSqlString(mjSchema);
  const sql =
    'SELECT rt.name AS parentTable, rc.name AS parentRefCol, pt.name AS childTable, ' +
    'pc.name AS childCol, pc.is_nullable AS childNullable, fk.name AS fkName, ' +
    '(SELECT COUNT(*) FROM sys.foreign_key_columns x WHERE x.constraint_object_id = fk.object_id) AS colCount ' +
    'FROM sys.foreign_keys fk ' +
    'JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id ' +
    'JOIN sys.objects rt ON rt.object_id = fk.referenced_object_id ' +
    'JOIN sys.schemas rs ON rs.schema_id = rt.schema_id ' +
    'JOIN sys.columns rc ON rc.object_id = fk.referenced_object_id AND rc.column_id = fkc.referenced_column_id ' +
    'JOIN sys.objects pt ON pt.object_id = fk.parent_object_id ' +
    'JOIN sys.schemas ps ON ps.schema_id = pt.schema_id ' +
    'JOIN sys.columns pc ON pc.object_id = fk.parent_object_id AND pc.column_id = fkc.parent_column_id ' +
    `WHERE rs.name = '${s}' AND ps.name = '${s}'`;
  const rows = await dbProvider.ExecuteSQL<Record<string, unknown>>(sql);
  const edges: FkEdge[] = [];
  const composite = new Set<string>();
  for (const r of rows ?? []) {
    if (Number(r.colCount) !== 1) {
      composite.add(`${String(r.fkName)} (${String(r.childTable)})`);
      continue;
    }
    edges.push({
      parentTable: String(r.parentTable),
      parentRefCol: String(r.parentRefCol),
      childTable: String(r.childTable),
      childCol: String(r.childCol),
      childNullable: r.childNullable === true || r.childNullable === 1,
    });
  }
  if (composite.size) {
    callbacks?.OnWarn?.(
      'Metadata',
      `Skipped composite FK(s) (handle manually if any reference Entity): ${[...composite].join(', ')}`,
    );
  }
  return edges;
}

/**
 * Dry-run: COUNTs each planned op's target rows (read-only) and emits ONE concise progress line
 * summarizing what the destructive batch will clear — a safety net that surfaces any surprising
 * target before {@link ExecTeardownBatch} runs. A per-count failure is folded into the summary
 * line; it never throws.
 */
export async function ReportTeardownPlan(
  dbProvider: DatabaseProviderBase,
  mjSchema: string,
  plan: TeardownPlanItem[],
  callbacks?: AppInstallCallbacks,
): Promise<void> {
  let total = 0;
  const lines: string[] = [];
  for (const p of plan) {
    try {
      const rows = await dbProvider.ExecuteSQL<Record<string, unknown>>(
        `SELECT COUNT(*) AS n FROM [${mjSchema}].[${p.table}] WHERE ${p.where}`,
      );
      const n = rows && rows[0] ? Number(rows[0].n) : 0;
      if (n > 0) {
        total += n;
        lines.push(`${p.op} ${p.table}${p.col ? `.${p.col}` : ''} x${n}`);
      }
    } catch (e: unknown) {
      lines.push(`(count failed for ${p.table}: ${e instanceof Error ? e.message : String(e)})`);
    }
  }
  callbacks?.OnProgress?.(
    'Metadata',
    `Teardown plan: ${lines.length ? lines.join('; ') : 'nothing to clear'} (total ${total} row(s))`,
  );
}

/**
 * Executes all teardown statements as ONE batch inside a single transaction.
 *
 * `SET QUOTED_IDENTIFIER ON` / `SET ANSI_NULLS ON` are required because some tables have filtered
 * / computed-column indexes or indexed views, against which an UPDATE (SET NULL) or DELETE fails
 * (Msg 1934) if those options are OFF — so we set them explicitly rather than depend on the
 * driver's connection defaults. `SET XACT_ABORT ON` makes any failure roll the whole batch back
 * (all-or-nothing atomicity). No-op on an empty statement list.
 */
export async function ExecTeardownBatch(dbProvider: DatabaseProviderBase, statements: string[]): Promise<void> {
  if (!statements || !statements.length) return;
  const script =
    'SET QUOTED_IDENTIFIER ON;\nSET ANSI_NULLS ON;\nSET XACT_ABORT ON;\nBEGIN TRANSACTION;\n' +
    statements.join(';\n') +
    ';\nCOMMIT TRANSACTION;';
  await dbProvider.ExecuteSQL<Record<string, unknown>>(script);
}

/**
 * Orchestrates the full FK-graph teardown for the doomed entities of a schema:
 * enumerate the live FK graph → build the plan → surface any warnings → dry-run report →
 * execute the atomic batch. SQL Server only.
 */
export async function RunFkGraphTeardown(
  dbProvider: DatabaseProviderBase,
  mjSchema: string,
  rootDoomedPredicate: string,
  callbacks?: AppInstallCallbacks,
): Promise<void> {
  const fkEdges = await EnumerateMjEntityFkGraph(dbProvider, mjSchema, callbacks);
  const planned = buildEntityTeardownPlan(fkEdges, mjSchema, rootDoomedPredicate);
  for (const w of planned.warnings) callbacks?.OnWarn?.('Metadata', `Teardown: ${w}`);
  await ReportTeardownPlan(dbProvider, mjSchema, planned.plan, callbacks);
  await ExecTeardownBatch(dbProvider, planned.statements);
}
