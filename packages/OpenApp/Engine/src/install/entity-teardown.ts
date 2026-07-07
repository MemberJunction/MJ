/**
 * FK-graph cascade teardown for an Open App's MJ (`__mj`) entity metadata.
 *
 * When an app is removed (or its schema is reset), every `__mj` row that FK-depends on the
 * app's `Entity` rows must be cleared BEFORE the entities themselves — otherwise the base-table
 * FKs (which are NO ACTION, not CASCADE) block the delete. The naive entity-layer approach
 * (RunView + per-row `Delete()`) UNDER-deletes: RunView reads base VIEWS (e.g. `vwRecordChanges`
 * INNER JOINs to `[User]`/`[Entity]`), so rows whose join is orphaned are invisible while the
 * base-TABLE FK still enforces them. This module instead enumerates the LIVE FK graph and clears
 * every one of `Entity`'s dependents — deepest-first, set-based, in ONE atomic transaction.
 *
 * **Dialect-neutral (SQL Server + PostgreSQL).** The FK-graph catalog query and identifier
 * quoting come from the provider's {@link SQLDialect} (`ForeignKeyGraphSQL` / `QuoteSchema` /
 * `QuoteIdentifier`), so the same walk runs on either backend. Only the atomic-batch session
 * preamble (SQL Server `SET …` pragmas vs. PostgreSQL `BEGIN`/`COMMIT`) is branched per platform,
 * because there is no dialect API for session setup. Callers that pass NO provider still get the
 * legacy entity-layer path (see `RemoveAppEntityMetadata` in `install-orchestrator.ts`).
 */
import type { DatabaseProviderBase } from '@memberjunction/core';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import type { AppInstallCallbacks } from '../types/open-app-types.js';

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
 * @param dialect the provider's {@link SQLDialect}, used to quote identifiers (`[x]` vs. `"x"`)
 * @param mjSchema the MJ core schema name (e.g. `__mj`)
 * @param rootDoomedPredicate the predicate selecting the doomed `Entity` rows (already dialect-quoted)
 */
export function buildEntityTeardownPlan(
  fkEdges: FkEdge[],
  dialect: SQLDialect,
  mjSchema: string,
  rootDoomedPredicate: string,
): TeardownPlan {
  const byParent = new Map<string, FkEdge[]>();
  for (const e of fkEdges) {
    if (!byParent.has(e.parentTable)) byParent.set(e.parentTable, []);
    byParent.get(e.parentTable)!.push(e);
  }
  const statements: string[] = [];
  const plan: TeardownPlanItem[] = [];
  const warnings: string[] = [];
  const emitted = new Set<string>();
  const q = (t: string): string => dialect.QuoteSchema(mjSchema, t);
  const col = (c: string): string => dialect.QuoteIdentifier(c);
  const push = (sql: string, op: 'delete' | 'setnull', table: string, colName: string | null, where: string): void => {
    if (emitted.has(sql)) return;
    emitted.add(sql);
    statements.push(sql);
    plan.push({ op, table, col: colName, where });
  };
  const walk = (parentTable: string, parentDoomed: string, path: Set<string>): void => {
    const children = byParent.get(parentTable) ?? [];
    for (const c of children) {
      const where = `${col(c.childCol)} IN (SELECT ${col(c.parentRefCol)} FROM ${q(parentTable)} WHERE ${parentDoomed})`;
      const setNull = `UPDATE ${q(c.childTable)} SET ${col(c.childCol)} = NULL WHERE ${where}`;
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
 * Builds the dialect-quoted predicate that selects the doomed `Entity` rows for `appSchema`
 * (`SchemaName = '<appSchema>'`). Shared by the caller (to seed the walk root) and used verbatim
 * as `rootDoomedPredicate`. Kept here so the quoting stays owned by this module + the dialect.
 */
export function buildRootDoomedPredicate(dialect: SQLDialect, appSchema: string): string {
  return `${dialect.QuoteIdentifier('SchemaName')} = ${dialect.QuoteStringLiteral(appSchema)}`;
}

/**
 * Enumerates every SINGLE-column FK within the MJ core schema (parent + child both in `mjSchema`).
 *
 * Composite FKs (a constraint spanning >1 column) are excluded and warned — `Entity` references
 * are all single-column, so this is safe. The catalog query comes from the provider's dialect
 * ({@link SQLDialect.ForeignKeyGraphSQL}), so this works on both SQL Server and PostgreSQL; the
 * normalized row shape (`parentTable, parentRefCol, childTable, childCol, childNullable, fkName,
 * colCount`) is identical across dialects.
 *
 * LIMITATION: the query filters BOTH ends to `mjSchema`, so a FK from a table in ANOTHER schema
 * into `mjSchema.Entity` is not enumerated. Such a cross-schema dependent would still FK-block the
 * final `Entity` delete → clean `XACT_ABORT`/transaction rollback, removal reported as failed
 * (nothing partially deleted). Accepted as rare; documented so the next person who hits it knows why.
 */
export async function EnumerateMjEntityFkGraph(
  dbProvider: DatabaseProviderBase,
  mjSchema: string,
  callbacks?: AppInstallCallbacks,
): Promise<FkEdge[]> {
  const sql = dbProvider.Dialect.ForeignKeyGraphSQL(mjSchema);
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
  dialect: SQLDialect,
  mjSchema: string,
  plan: TeardownPlanItem[],
  callbacks?: AppInstallCallbacks,
): Promise<void> {
  let total = 0;
  const lines: string[] = [];
  for (const p of plan) {
    try {
      const rows = await dbProvider.ExecuteSQL<Record<string, unknown>>(
        `SELECT COUNT(*) AS n FROM ${dialect.QuoteSchema(mjSchema, p.table)} WHERE ${p.where}`,
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
 * Wraps the teardown statements in ONE atomic transaction for the given dialect. PURE (no DB).
 *
 * The platform-specific session/transaction setup is owned by the dialect
 * ({@link SQLDialect.AtomicBatchScript}) — SQL Server emits `SET QUOTED_IDENTIFIER/ANSI_NULLS/XACT_ABORT`
 * + `BEGIN/COMMIT TRANSACTION`; PostgreSQL emits plain `BEGIN … COMMIT`. This thin wrapper stays for
 * the pure-function test seam. Returns an empty string for an empty statement list.
 */
export function buildTeardownBatchScript(dialect: SQLDialect, statements: string[]): string {
  return dialect.AtomicBatchScript(statements);
}

/**
 * Executes all teardown statements as ONE batch inside a single transaction, using the dialect's
 * session/transaction wrapper ({@link buildTeardownBatchScript}). No-op on an empty statement list.
 */
export async function ExecTeardownBatch(
  dbProvider: DatabaseProviderBase,
  dialect: SQLDialect,
  statements: string[],
): Promise<void> {
  const script = buildTeardownBatchScript(dialect, statements);
  if (!script) return;
  await dbProvider.ExecuteSQL<Record<string, unknown>>(script);
}

/**
 * Orchestrates the full FK-graph teardown for the doomed entities of a schema:
 * enumerate the live FK graph → build the plan → surface any warnings → dry-run report →
 * execute the atomic batch. Runs on SQL Server or PostgreSQL (dialect-driven).
 *
 * WARNING: this executes raw set-based SQL and deliberately does NOT go through the `BaseEntity`
 * pipeline — so it writes no RecordChange audit rows, fires no `*EntityServer` delete hooks, and
 * fires no BaseEntity events, which means provider/`BaseEngine` metadata caches are NOT invalidated.
 * That is correct for `mj app remove` (the CLI process exits immediately after), but a caller that
 * invokes this inside a long-running process (e.g. MJAPI) must refresh metadata afterward or its
 * cached entity metadata will be stale.
 */
export async function RunFkGraphTeardown(
  dbProvider: DatabaseProviderBase,
  mjSchema: string,
  rootDoomedPredicate: string,
  callbacks?: AppInstallCallbacks,
): Promise<void> {
  const dialect = dbProvider.Dialect;
  const fkEdges = await EnumerateMjEntityFkGraph(dbProvider, mjSchema, callbacks);
  const planned = buildEntityTeardownPlan(fkEdges, dialect, mjSchema, rootDoomedPredicate);
  for (const w of planned.warnings) callbacks?.OnWarn?.('Metadata', `Teardown: ${w}`);
  await ReportTeardownPlan(dbProvider, dialect, mjSchema, planned.plan, callbacks);
  await ExecTeardownBatch(dbProvider, dialect, planned.statements);
}
