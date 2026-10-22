import { describe, it, expect, vi } from 'vitest';
import type { EntityInfo, EntityFieldInfo, IMetadataProvider } from '@memberjunction/core';
import {
  CanonicalizeColumnFields,
  ComputeFieldsList,
  ResolvePolymorphicTargetEntity,
  BuildPolymorphicCompositeKey,
  PolymorphicCacheKey,
  BatchResolvePolymorphicRecordNames
} from '../lib/utils/record.util';
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
    const fields = ComputeFieldsList(entity(), null, ['Status']);
    expect(fields).toContain('Status');
  });

  it('is ADDITIVE — host columns never replace the PK / name / default fields', () => {
    const fields = ComputeFieldsList(entity(), null, ['Status']);
    expect(fields).toEqual(expect.arrayContaining(['ID', 'Name', 'Status', '__mj_CreatedAt', '__mj_UpdatedAt']));
  });

  it('normalizes casing to the ENTITY spelling so the field is not requested twice', () => {
    // A page may write `field: 'name'`; the entity says 'Name'. The Set is case-sensitive and the
    // name field is added from metadata as 'Name', so keeping the host's casing yields BOTH.
    const fields = ComputeFieldsList(entity(), null, ['name', 'sTaTuS']);

    expect(fields).toContain('Name');
    expect(fields).not.toContain('name');
    expect(fields).toContain('Status');
    expect(fields).not.toContain('sTaTuS');
    expect(fields.filter((f) => f.toLowerCase() === 'name')).toHaveLength(1);
  });

  it('drops a host column that matches no field, so a stale name cannot reach the query', () => {
    const fields = ComputeFieldsList(entity(), null, ['NoSuchColumn']);
    expect(fields).not.toContain('NoSuchColumn');
    expect(fields).toContain('ID');
  });

  it('adds host columns ON TOP of a grid state rather than being overridden by it', () => {
    // The grid state decides the default fetch; the host's list is a superset of it.
    const gridState = { columnSettings: [{ Name: 'Name', hidden: false }] } as unknown as ViewGridState;
    const fields = ComputeFieldsList(entity(), gridState, ['Memo']);

    expect(fields).toContain('Name');
    expect(fields).toContain('Memo');
  });

  it('agrees with canonicalizeColumnFields, so the fetched key and the rendered key match', () => {
    // The assertion that was missing when this went wrong: the name we SELECT and the name the
    // column definition addresses the row by have to be the same string. Rows are keyed from entity
    // metadata, so a column left on the host's spelling renders "—" in every cell.
    const declared = [{ field: 'name' }, { field: 'sTaTuS' }];
    const columns = CanonicalizeColumnFields(entity(), declared);
    const fetched = ComputeFieldsList(entity(), null, declared.map((c) => c.field));

    for (const col of columns) {
      expect(fetched).toContain(col.field);
    }
  });

  it('is unchanged when no host columns are supplied', () => {
    const withNull = ComputeFieldsList(entity(), null, null);
    const withEmpty = ComputeFieldsList(entity(), null, []);
    const withNothing = ComputeFieldsList(entity(), null);

    expect(withEmpty).toEqual(withNull);
    expect(withNothing).toEqual(withNull);
    expect(withNull).not.toContain('Status');
  });
});

describe('canonicalizeColumnFields', () => {
  it('rewrites a differently-cased field to the entity spelling', () => {
    const [name, status] = CanonicalizeColumnFields(entity(), [{ field: 'name' }, { field: 'sTaTuS' }]);
    expect(name.field).toBe('Name');
    expect(status.field).toBe('Status');
  });

  it('preserves every other property on the column', () => {
    const [col] = CanonicalizeColumnFields(entity(), [
      { field: 'name', title: 'Custom title', width: 'auto' as const, maxWidth: 400, visible: false },
    ]);
    expect(col).toEqual({ field: 'Name', title: 'Custom title', width: 'auto', maxWidth: 400, visible: false });
  });

  it('returns already-correct columns BY REFERENCE so a no-op is detectable', () => {
    const input = [{ field: 'Name' }, { field: 'Status' }];
    const out = CanonicalizeColumnFields(entity(), input);
    expect(out[0]).toBe(input[0]);
    expect(out[1]).toBe(input[1]);
  });

  it('never mutates the caller\'s array or objects', () => {
    const input = [{ field: 'name' }];
    const out = CanonicalizeColumnFields(entity(), input);
    expect(input[0].field).toBe('name');
    expect(out[0]).not.toBe(input[0]);
  });

  it('leaves an unknown field alone for the existing validation to reject', () => {
    const [col] = CanonicalizeColumnFields(entity(), [{ field: 'NoSuchColumn' }]);
    expect(col.field).toBe('NoSuchColumn');
  });
});

describe('polymorphic foreign key utilities (EntityField.EntityIDFieldName)', () => {
  function polymorphicHostEntity(): EntityInfo {
    const id = field({ Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' });
    const entityId = field({
      Name: 'EntityID',
      RelatedEntityID: 'E_ENTITIES',
      RelatedEntity: 'MJ: Entities',
      RelatedEntityNameFieldMap: 'Entity',
      DefaultInView: false,
    });
    const entityNameVirtual = field({
      Name: 'Entity',
      IsVirtual: true,
      DefaultInView: false,
    });
    const recordId = field({
      Name: 'RecordID',
      EntityIDFieldName: 'EntityID',
      DefaultInView: true,
    });
    const unlinkedRecordId = field({
      Name: 'LegacyRecordID',
      DefaultInView: true,
    });
    return {
      ID: 'E_TASK_LINKS',
      Name: 'Task Links',
      Fields: [id, entityId, entityNameVirtual, recordId, unlinkedRecordId],
      PrimaryKeys: [id],
      SupportsGeoCoding: false,
    } as unknown as EntityInfo;
  }

  it('auto-includes companion EntityIDFieldName and its mapped virtual name column in ComputeFieldsList', () => {
    const host = polymorphicHostEntity();
    const gridState = { columnSettings: [{ Name: 'RecordID', hidden: false }] } as unknown as ViewGridState;
    const fields = ComputeFieldsList(host, gridState);

    expect(fields).toContain('RecordID');
    expect(fields).toContain('EntityID');
    expect(fields).toContain('Entity');
  });

  it('resolves target EntityInfo only when EntityField.EntityIDFieldName is populated (no heuristics)', () => {
    const host = polymorphicHostEntity();
    const recordIdField = host.Fields.find(f => f.Name === 'RecordID')!;
    const unlinkedField = host.Fields.find(f => f.Name === 'LegacyRecordID')!;
    const contactsEntity = {
      ID: 'E_CONTACTS',
      Name: 'Contacts',
      FirstPrimaryKey: field({ Name: 'ID', IsPrimaryKey: true }),
    } as unknown as EntityInfo;

    const provider = {
      EntityByID: (id: string) => (id === 'E_CONTACTS' ? contactsEntity : undefined),
      EntityByName: (name: string) => (name === 'Contacts' ? contactsEntity : undefined),
    } as unknown as IMetadataProvider;

    const row = { EntityID: 'E_CONTACTS', RecordID: 'C-100', LegacyRecordID: 'C-100' };
    expect(ResolvePolymorphicTargetEntity(row, recordIdField, provider)).toBe(contactsEntity);
    expect(ResolvePolymorphicTargetEntity(row, unlinkedField, provider)).toBeUndefined();
  });

  it('batch-resolves polymorphic record names in a single GetEntityRecordNames call', async () => {
    const host = polymorphicHostEntity();
    const contactsEntity = {
      ID: 'E_CONTACTS',
      Name: 'Contacts',
      FirstPrimaryKey: field({ Name: 'ID', IsPrimaryKey: true }),
    } as unknown as EntityInfo;

    const getEntityRecordNames = vi.fn().mockImplementation(async (inputs) =>
      inputs.map((inp: { EntityName: string; CompositeKey: { KeyValuePairs: Array<{ Value: string }> } }) => ({
        EntityName: inp.EntityName,
        CompositeKey: inp.CompositeKey,
        Success: true,
        RecordName: inp.CompositeKey.KeyValuePairs[0].Value === '44FA6C2D' ? 'Henri Dubois' : 'Amith Nagarajan',
      })),
    );

    const provider = {
      EntityByID: (id: string) => (id === 'E_CONTACTS' ? contactsEntity : undefined),
      EntityByName: () => undefined,
      GetEntityRecordNames: getEntityRecordNames,
    } as unknown as IMetadataProvider;

    const rows = [
      { EntityID: 'E_CONTACTS', RecordID: '44FA6C2D' },
      { EntityID: 'E_CONTACTS', RecordID: '44FA6C2D' }, // duplicate should be deduplicated
      { EntityID: 'E_CONTACTS', RecordID: '99BB1122' },
    ];

    const cache = await BatchResolvePolymorphicRecordNames(rows, host, provider);
    expect(getEntityRecordNames).toHaveBeenCalledTimes(1);
    expect(getEntityRecordNames.mock.calls[0][0]).toHaveLength(2);

    const key1 = BuildPolymorphicCompositeKey('44FA6C2D', contactsEntity)!;
    expect(cache.get(PolymorphicCacheKey('Contacts', key1))).toBe('Henri Dubois');
  });
});
