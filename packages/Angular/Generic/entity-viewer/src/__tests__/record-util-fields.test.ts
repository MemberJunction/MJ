import { describe, it, expect } from 'vitest';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { canonicalizeColumnFields, computeFieldsList } from '../lib/utils/record.util';
import type { ViewGridState } from '../lib/types';

/**
 * Coverage for `computeFieldsList`'s host-column argument — the SELECT list behind a page that
 * hands the grid an explicit `[Columns]`.
 *
 * The contract has three edges worth pinning, because each fails SILENTLY: a host column whose
 * data was never fetched renders as an empty cell (looks like missing data), a host name whose
 * casing differs from the entity's duplicates the column in the query, and a name that matches no
 * field at all would otherwise reach SQL.
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

/** ID (pk) · Name (name field, DefaultInView) · Status · Memo — none of them geo, no geocoding. */
function entity(): EntityInfo {
  const id = field({ Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' });
  const name = field({ Name: 'Name', IsNameField: true, DefaultInView: true });
  const status = field({ Name: 'Status' });
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

describe('computeFieldsList — host columns', () => {
  it('fetches a host column that DefaultInView would not have included', () => {
    // Status is not DefaultInView; without the host argument the page's Status column renders
    // every cell empty.
    const fields = computeFieldsList(entity(), null, ['Status']);
    expect(fields).toContain('Status');
  });

  it('is ADDITIVE — host columns never replace the PK / name / default fields', () => {
    const fields = computeFieldsList(entity(), null, ['Status']);
    expect(fields).toEqual(expect.arrayContaining(['ID', 'Name', 'Status', '__mj_CreatedAt', '__mj_UpdatedAt']));
  });

  it('normalizes casing to the ENTITY spelling so the field is not requested twice', () => {
    // A page may write `field: 'name'`; the entity says 'Name'. The Set is case-sensitive and the
    // name field is added from metadata as 'Name', so keeping the host's casing yields BOTH.
    const fields = computeFieldsList(entity(), null, ['name', 'sTaTuS']);

    expect(fields).toContain('Name');
    expect(fields).not.toContain('name');
    expect(fields).toContain('Status');
    expect(fields).not.toContain('sTaTuS');
    expect(fields.filter((f) => f.toLowerCase() === 'name')).toHaveLength(1);
  });

  it('drops a host column that matches no field, so a stale name cannot reach the query', () => {
    const fields = computeFieldsList(entity(), null, ['NoSuchColumn']);
    expect(fields).not.toContain('NoSuchColumn');
    expect(fields).toContain('ID');
  });

  it('adds host columns ON TOP of a grid state rather than being overridden by it', () => {
    // The grid state decides the default fetch; the host's list is a superset of it.
    const gridState = { columnSettings: [{ Name: 'Name', hidden: false }] } as unknown as ViewGridState;
    const fields = computeFieldsList(entity(), gridState, ['Memo']);

    expect(fields).toContain('Name');
    expect(fields).toContain('Memo');
  });

  it('agrees with canonicalizeColumnFields, so the fetched key and the rendered key match', () => {
    // The assertion that was missing when this went wrong: the name we SELECT and the name the
    // column definition addresses the row by have to be the same string. Rows are keyed from entity
    // metadata, so a column left on the host's spelling renders "—" in every cell.
    const declared = [{ field: 'name' }, { field: 'sTaTuS' }];
    const columns = canonicalizeColumnFields(entity(), declared);
    const fetched = computeFieldsList(entity(), null, declared.map((c) => c.field));

    for (const col of columns) {
      expect(fetched).toContain(col.field);
    }
  });

  it('is unchanged when no host columns are supplied', () => {
    const withNull = computeFieldsList(entity(), null, null);
    const withEmpty = computeFieldsList(entity(), null, []);
    const withNothing = computeFieldsList(entity(), null);

    expect(withEmpty).toEqual(withNull);
    expect(withNothing).toEqual(withNull);
    expect(withNull).not.toContain('Status');
  });
});

describe('canonicalizeColumnFields', () => {
  it('rewrites a differently-cased field to the entity spelling', () => {
    const [name, status] = canonicalizeColumnFields(entity(), [{ field: 'name' }, { field: 'sTaTuS' }]);
    expect(name.field).toBe('Name');
    expect(status.field).toBe('Status');
  });

  it('preserves every other property on the column', () => {
    const [col] = canonicalizeColumnFields(entity(), [
      { field: 'name', title: 'Custom title', width: 'auto' as const, maxWidth: 400, visible: false },
    ]);
    expect(col).toEqual({ field: 'Name', title: 'Custom title', width: 'auto', maxWidth: 400, visible: false });
  });

  it('returns already-correct columns BY REFERENCE so a no-op is detectable', () => {
    const input = [{ field: 'Name' }, { field: 'Status' }];
    const out = canonicalizeColumnFields(entity(), input);
    expect(out[0]).toBe(input[0]);
    expect(out[1]).toBe(input[1]);
  });

  it('never mutates the caller\'s array or objects', () => {
    const input = [{ field: 'name' }];
    const out = canonicalizeColumnFields(entity(), input);
    expect(input[0].field).toBe('name');
    expect(out[0]).not.toBe(input[0]);
  });

  it('leaves an unknown field alone for the existing validation to reject', () => {
    const [col] = canonicalizeColumnFields(entity(), [{ field: 'NoSuchColumn' }]);
    expect(col.field).toBe('NoSuchColumn');
  });
});
