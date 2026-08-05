/**
 * Unit tests for the PURE FK-graph teardown planner (`buildEntityTeardownPlan`) and the atomic
 * batch wrapper (`buildTeardownBatchScript`).
 *
 * These validate the recursion / ordering / null-vs-delete logic the teardown relies on, without a
 * DB. The suite is PARAMETRIZED over both dialects (SQL Server + PostgreSQL) so we prove the SAME
 * walk emits correctly-quoted SQL on either backend (`[__mj].[X]` vs. `"__mj"."X"`). Real TS imports
 * (no `Function()` extraction) since the planner is a normal export.
 *
 * Polymorphic-key note: MJ's polymorphic tables (RecordChange, TaggedItem, …) carry a REAL
 * single-column FK on their `EntityID` discriminator, so the FK-graph reaches them here. A NOT-NULL
 * `EntityID` (e.g. RecordChange) is DELETEd; a nullable `EntityID` (e.g. AuditLog) is SET NULL and
 * the row survives — both are correct at teardown granularity. The FK-less `RecordID` string half
 * has no constraint and only dangles on single-record deletes, which is a separate spDelete concern.
 */
import { describe, it, expect } from 'vitest';
import { GetDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import { buildEntityTeardownPlan, buildTeardownBatchScript, buildRootDoomedPredicate, type FkEdge } from '../install/entity-teardown.js';

const dialects: Array<[string, SQLDialect]> = [
  ['SQLServer', GetDialect('sqlserver')],
  ['PostgreSQL', GetDialect('postgresql')],
];

const at = (s: string[], t: string): number => s.findIndex((x) => x.includes(t));

describe.each(dialects)('buildEntityTeardownPlan (pure FK-walk) [%s]', (_name, dialect) => {
  const q = (t: string): string => dialect.QuoteSchema('__mj', t);
  const col = (c: string): string => dialect.QuoteIdentifier(c);
  const ROOT = buildRootDoomedPredicate(dialect, 'x');

  it('NOT-NULL polymorphic dependent (RecordChange) is DELETEd, scoped by a nested subquery, before Entity before SchemaInfo', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'RecordChange', childCol: 'EntityID', childNullable: false },
    ];
    const { statements } = buildEntityTeardownPlan(edges, dialect, '__mj', ROOT);
    const rc = at(statements, `DELETE FROM ${q('RecordChange')}`);
    const ent = at(statements, `DELETE FROM ${q('Entity')} WHERE`);
    const si = at(statements, `DELETE FROM ${q('SchemaInfo')}`);
    expect(rc).toBeGreaterThan(-1);
    expect(rc).toBeLessThan(ent);
    expect(ent).toBeLessThan(si);
    expect(statements[rc]).toContain(`${col('EntityID')} IN (SELECT ${col('ID')} FROM ${q('Entity')} WHERE ${ROOT})`);
  });

  it('transitive NOT-NULL chain: grandchild deleted before child before Entity', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'A', childCol: 'EntityID', childNullable: false },
      { parentTable: 'A', parentRefCol: 'ID', childTable: 'B', childCol: 'AID', childNullable: false },
    ];
    const { statements } = buildEntityTeardownPlan(edges, dialect, '__mj', ROOT);
    expect(at(statements, `DELETE FROM ${q('B')}`)).toBeLessThan(at(statements, `DELETE FROM ${q('A')}`));
    expect(at(statements, `DELETE FROM ${q('A')}`)).toBeLessThan(at(statements, `DELETE FROM ${q('Entity')} WHERE`));
  });

  it('nullable link → SET NULL (row survives), and does NOT recurse into its children', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'Conversation', childCol: 'LinkedEntityID', childNullable: true },
      { parentTable: 'Conversation', parentRefCol: 'ID', childTable: 'ConversationDetail', childCol: 'ConversationID', childNullable: false },
    ];
    const { statements } = buildEntityTeardownPlan(edges, dialect, '__mj', ROOT);
    expect(statements.some((s) => s.includes(`UPDATE ${q('Conversation')} SET ${col('LinkedEntityID')} = NULL`))).toBe(true);
    expect(statements.some((s) => s.includes(q('ConversationDetail')))).toBe(false);
  });

  it('nullable polymorphic discriminator (AuditLog.EntityID) → SET NULL, row survives (safe orphan)', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'AuditLog', childCol: 'EntityID', childNullable: true },
    ];
    const { statements } = buildEntityTeardownPlan(edges, dialect, '__mj', ROOT);
    expect(statements.some((s) => s.includes(`UPDATE ${q('AuditLog')} SET ${col('EntityID')} = NULL`))).toBe(true);
    expect(statements.some((s) => s.startsWith(`DELETE FROM ${q('AuditLog')}`))).toBe(false);
  });

  it('self-ref nullable (Entity.ParentID) → SET NULL before the Entity delete; terminates', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'Entity', childCol: 'ParentID', childNullable: true },
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'RecordChange', childCol: 'EntityID', childNullable: false },
    ];
    const { statements } = buildEntityTeardownPlan(edges, dialect, '__mj', ROOT);
    const setNull = at(statements, `UPDATE ${q('Entity')} SET ${col('ParentID')} = NULL`);
    expect(setNull).toBeGreaterThan(-1);
    expect(setNull).toBeLessThan(at(statements, `DELETE FROM ${q('Entity')} WHERE`));
  });

  it('cross-table cycle A→B→A terminates and warns (no stack overflow)', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'A', childCol: 'EntityID', childNullable: false },
      { parentTable: 'A', parentRefCol: 'ID', childTable: 'B', childCol: 'AID', childNullable: false },
      { parentTable: 'B', parentRefCol: 'ID', childTable: 'A', childCol: 'BID', childNullable: false },
    ];
    const { statements, warnings } = buildEntityTeardownPlan(edges, dialect, '__mj', ROOT);
    expect(warnings.some((w) => w.toLowerCase().includes('cycle'))).toBe(true);
    // still terminates with the Entity + SchemaInfo deletes present
    expect(at(statements, `DELETE FROM ${q('Entity')} WHERE`)).toBeGreaterThan(-1);
    expect(at(statements, `DELETE FROM ${q('SchemaInfo')}`)).toBeGreaterThan(-1);
  });
});

describe('buildRootDoomedPredicate — dialect-quoted, case-insensitive', () => {
  it('SQL Server brackets the column and lowercases both sides', () => {
    expect(buildRootDoomedPredicate(GetDialect('sqlserver'), 'app_x')).toBe("LOWER([SchemaName]) = LOWER('app_x')");
  });
  it('PostgreSQL double-quotes the column and lowercases both sides (folded-identifier match)', () => {
    expect(buildRootDoomedPredicate(GetDialect('postgresql'), 'app_x')).toBe('LOWER("SchemaName") = LOWER(\'app_x\')');
  });
  it('matches regardless of case — the manifest casing finds the PG-folded Entity rows', () => {
    expect(buildRootDoomedPredicate(GetDialect('postgresql'), '__mj_BizAppsTasks')).toBe('LOWER("SchemaName") = LOWER(\'__mj_BizAppsTasks\')');
  });
  it("escapes a single-quote in the schema name (no injection)", () => {
    expect(buildRootDoomedPredicate(GetDialect('sqlserver'), "a'b")).toBe("LOWER([SchemaName]) = LOWER('a''b')");
  });
});

describe('buildTeardownBatchScript — per-dialect atomic wrapper', () => {
  it('empty statement list → empty script (no-op)', () => {
    expect(buildTeardownBatchScript(GetDialect('sqlserver'), [])).toBe('');
    expect(buildTeardownBatchScript(GetDialect('postgresql'), [])).toBe('');
  });
  it('SQL Server wraps with SET pragmas + BEGIN/COMMIT TRANSACTION', () => {
    const s = buildTeardownBatchScript(GetDialect('sqlserver'), ['DELETE FROM [__mj].[A] WHERE 1=1']);
    expect(s).toContain('SET QUOTED_IDENTIFIER ON;');
    expect(s).toContain('SET ANSI_NULLS ON;');
    expect(s).toContain('SET XACT_ABORT ON;');
    expect(s).toContain('BEGIN TRANSACTION;');
    expect(s).toContain('COMMIT TRANSACTION;');
  });
  it('PostgreSQL wraps with plain BEGIN/COMMIT and NO SQL-Server pragmas', () => {
    const s = buildTeardownBatchScript(GetDialect('postgresql'), ['DELETE FROM "__mj"."A" WHERE 1=1']);
    expect(s.startsWith('BEGIN;')).toBe(true);
    expect(s.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(s).not.toContain('QUOTED_IDENTIFIER');
    expect(s).not.toContain('XACT_ABORT');
  });
});
