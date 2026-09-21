import { describe, it, expect } from 'vitest';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { computeFieldsList } from '../lib/utils/record.util';
import type { ViewGridState } from '../lib/types';

/**
 * `computeFieldsList`'s GRID-STATE branch — the SELECT list behind a saved view.
 *
 * The host-column branch a few lines above already resolves every name against the entity and adds
 * the ENTITY's spelling, with a comment explaining why: the list is interpolated into the GraphQL
 * selection set, GraphQL field names are case SENSITIVE, and an unknown field fails the WHOLE view
 * with zero rows rather than producing one odd column. The grid-state branch did not keep that
 * promise, so a stale cross-entity `[GridState]` asked the new entity for the old entity's fields.
 *
 * `GraphQLDataProvider.getViewRunTimeFieldList()` passes `params.Fields` straight through, and its
 * own comment records both halves of this: a bad name "makes the grid RunView query fail with
 * Cannot query field ...", and the view-definition branch deliberately drops fields that are no
 * longer part of an entity "rather than letting the whole view blow up".
 *
 * Validating here is safe because nothing MJ produces internally can be invalid:
 * `buildCurrentGridState()` resolves every captured `colId` against entity metadata and skips what
 * does not resolve (which is also why the row-number and filler columns never appear). Only an
 * externally supplied `[GridState]` can carry a foreign name.
 *
 * See MemberJunction/MJ#4655.
 */

function field(partial: Partial<EntityFieldInfo>): EntityFieldInfo {
  return {
    Sequence: 0,
    IsPrimaryKey: false,
    IsNameField: false,
    DefaultInView: false,
    Length: 100,
    EntityFieldValues: [],
    DisplayNameOrName: partial.Name ?? '',
    ...partial,
  } as unknown as EntityFieldInfo;
}

/** ID (pk) · Name (name field, DefaultInView) · Status (DefaultInView) · Memo */
function entity(): EntityInfo {
  const id = field({ Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' });
  const name = field({ Name: 'Name', IsNameField: true, DefaultInView: true });
  const status = field({ Name: 'Status', DefaultInView: true });
  const memo = field({ Name: 'Memo', Length: -1 });
  return {
    ID: 'E1',
    Name: 'Test Entity',
    Fields: [id, name, status, memo],
    PrimaryKeys: [id],
    NameField: name,
    SupportsGeoCoding: false,
  } as unknown as EntityInfo;
}

function stateOf(...names: string[]): ViewGridState {
  return {
    columnSettings: names.map((Name) => ({ Name, hidden: false })),
  } as unknown as ViewGridState;
}

describe('computeFieldsList — grid-state columns', () => {
  it('drops a name that matches no field, so a stale state cannot reach the query', () => {
    const fields = computeFieldsList(entity(), stateOf('Name', 'OrderTotal'));

    expect(fields).not.toContain('OrderTotal');
    expect(fields).toContain('Name');
  });

  it("adds the ENTITY's spelling, not the saved one — GraphQL is case sensitive", () => {
    const fields = computeFieldsList(entity(), stateOf('sTaTuS'));

    expect(fields).toContain('Status');
    expect(fields).not.toContain('sTaTuS');
    expect(fields.filter((f) => f.toLowerCase() === 'status')).toHaveLength(1);
  });

  it('falls back to DefaultInView when NO saved name resolves', () => {
    // The state belongs to another entity entirely. Post-#4244 the grid renders this entity's own
    // DefaultInView columns, so the fetch has to agree — otherwise every one of those columns
    // renders an empty cell, which reads as missing data rather than a stale-state problem.
    const fields = computeFieldsList(entity(), stateOf('OrderNumber', 'OrderTotal', 'CustomerName'));

    expect(fields).toContain('Name');
    expect(fields).toContain('Status');
    expect(fields).not.toContain('OrderNumber');
  });

  it('does NOT fall back when at least one saved name resolves', () => {
    // A partial match is a real preference — a saved view whose entity lost a field. Widening it to
    // DefaultInView would silently re-add columns the user had removed.
    const fields = computeFieldsList(entity(), stateOf('Memo', 'FieldTheSchemaDropped'));

    expect(fields).toContain('Memo');
    expect(fields).not.toContain('Status');
    expect(fields).not.toContain('FieldTheSchemaDropped');
  });

  it('still skips hidden columns, and a hidden-only state falls back', () => {
    const hiddenOnly = {
      columnSettings: [{ Name: 'Memo', hidden: true }],
    } as unknown as ViewGridState;

    const fields = computeFieldsList(entity(), hiddenOnly);

    expect(fields).not.toContain('Memo');
    expect(fields).toContain('Status');
  });

  it('keeps the primary key and name field regardless', () => {
    const fields = computeFieldsList(entity(), stateOf('OrderTotal'));

    expect(fields).toContain('ID');
    expect(fields).toContain('Name');
  });

  it('leaves a fully valid saved view exactly as it was', () => {
    // The normal path must not move: only the named columns, no DefaultInView widening.
    const fields = computeFieldsList(entity(), stateOf('Memo'));

    expect(fields).toContain('Memo');
    expect(fields).not.toContain('Status');
  });
});
