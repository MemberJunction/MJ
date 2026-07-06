/**
 * Unit tests for the PURE FK-graph teardown planner (`buildEntityTeardownPlan`).
 *
 * These validate the recursion/ordering/null-vs-delete logic the SQL-Server teardown relies on,
 * without a DB. A real TS import (no `Function()` extraction) since the planner is a normal export.
 */
import { describe, it, expect } from 'vitest';
import { buildEntityTeardownPlan, type FkEdge } from '../install/entity-teardown.js';

const ROOT = "[SchemaName] = 'x'";
const at = (s: string[], t: string): number => s.findIndex((x) => x.includes(t));

describe('buildEntityTeardownPlan (pure FK-walk)', () => {
  it('NOT-NULL dependent is DELETEd, scoped by a nested subquery, ordered before Entity before SchemaInfo', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'RecordChange', childCol: 'EntityID', childNullable: false },
    ];
    const { statements } = buildEntityTeardownPlan(edges, '__mj', ROOT);
    const rc = at(statements, 'DELETE FROM [__mj].[RecordChange]');
    const ent = at(statements, 'DELETE FROM [__mj].[Entity] WHERE');
    const si = at(statements, 'DELETE FROM [__mj].[SchemaInfo]');
    expect(rc).toBeGreaterThan(-1);
    expect(rc).toBeLessThan(ent);
    expect(ent).toBeLessThan(si);
    expect(statements[rc]).toContain("[EntityID] IN (SELECT [ID] FROM [__mj].[Entity] WHERE [SchemaName] = 'x')");
  });

  it('transitive NOT-NULL chain: grandchild deleted before child before Entity', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'A', childCol: 'EntityID', childNullable: false },
      { parentTable: 'A', parentRefCol: 'ID', childTable: 'B', childCol: 'AID', childNullable: false },
    ];
    const { statements } = buildEntityTeardownPlan(edges, '__mj', ROOT);
    expect(at(statements, 'DELETE FROM [__mj].[B]')).toBeLessThan(at(statements, 'DELETE FROM [__mj].[A]'));
    expect(at(statements, 'DELETE FROM [__mj].[A]')).toBeLessThan(at(statements, 'DELETE FROM [__mj].[Entity] WHERE'));
  });

  it('nullable link → SET NULL (row survives), and does NOT recurse into its children', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'Conversation', childCol: 'LinkedEntityID', childNullable: true },
      { parentTable: 'Conversation', parentRefCol: 'ID', childTable: 'ConversationDetail', childCol: 'ConversationID', childNullable: false },
    ];
    const { statements } = buildEntityTeardownPlan(edges, '__mj', ROOT);
    expect(statements.some((s) => s.includes('UPDATE [__mj].[Conversation] SET [LinkedEntityID] = NULL'))).toBe(true);
    expect(statements.some((s) => s.includes('[__mj].[ConversationDetail]'))).toBe(false);
  });

  it('self-ref nullable (Entity.ParentID) → SET NULL before the Entity delete; terminates', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'Entity', childCol: 'ParentID', childNullable: true },
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'RecordChange', childCol: 'EntityID', childNullable: false },
    ];
    const { statements } = buildEntityTeardownPlan(edges, '__mj', ROOT);
    const setNull = at(statements, 'UPDATE [__mj].[Entity] SET [ParentID] = NULL');
    expect(setNull).toBeGreaterThan(-1);
    expect(setNull).toBeLessThan(at(statements, 'DELETE FROM [__mj].[Entity] WHERE'));
  });

  it('cross-table cycle A→B→A terminates and warns (no stack overflow)', () => {
    const edges: FkEdge[] = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'A', childCol: 'EntityID', childNullable: false },
      { parentTable: 'A', parentRefCol: 'ID', childTable: 'B', childCol: 'AID', childNullable: false },
      { parentTable: 'B', parentRefCol: 'ID', childTable: 'A', childCol: 'BID', childNullable: false },
    ];
    const { statements, warnings } = buildEntityTeardownPlan(edges, '__mj', ROOT);
    expect(warnings.some((w) => w.toLowerCase().includes('cycle'))).toBe(true);
    // still terminates with the Entity + SchemaInfo deletes present
    expect(at(statements, 'DELETE FROM [__mj].[Entity] WHERE')).toBeGreaterThan(-1);
    expect(at(statements, 'DELETE FROM [__mj].[SchemaInfo]')).toBeGreaterThan(-1);
  });
});
