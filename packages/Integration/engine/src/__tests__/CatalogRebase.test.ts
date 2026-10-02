/**
 * A per-connection catalog row is a PROJECTION of (declared metadata + this connection's
 * discovery), not an accumulator. plan.md: a refresh "will use IO/IOF as the SOT before then
 * replacing what is in the respective CIO/CIOF, it will not do the changes on top of CIO/CIOF
 * since it is stale metadata".
 *
 * The failure this prevents: an open-app upgrade changes a declared APIPath or page size, and the
 * connection that already discovered once keeps its old value forever, because every subsequent
 * overlay starts from that stale row.
 */
import { describe, it, expect } from 'vitest';
import { SharedCatalogWriter, PerConnectionCatalogWriter } from '../CatalogWriter.js';
import {
  DECLARED_OWNED_OBJECT_COLUMNS,
  CATALOG_OBJECT_COLUMNS,
} from '@memberjunction/integration-engine-base';

const shared = () => new SharedCatalogWriter({} as never, 'int-1', {} as never);
const perConn = () => new PerConnectionCatalogWriter({} as never, 'ci-1', 'int-1', {} as never, new Date());

describe('the declared-owned column set', () => {
  it('excludes identity, per-connection state and discovery-owned lifecycle', () => {
    for (const c of ['ID', 'Name', 'IntegrationID', 'CompanyIntegrationID', 'IsSelected',
                     'Provenance', 'FirstSeenAt', 'Status', 'IsCustom', 'MetadataSource']) {
      expect(DECLARED_OWNED_OBJECT_COLUMNS).not.toContain(c);
    }
  });

  it('includes the connector-declared shape', () => {
    for (const c of ['APIPath', 'DefaultPageSize', 'PaginationType']) {
      expect(DECLARED_OWNED_OBJECT_COLUMNS).toContain(c);
    }
  });

  it('includes the three columns discovery may then override', () => {
    // rebased from the declaration FIRST, then overlaid if discovery reports a value
    for (const c of ['Description', 'DisplayName', 'IncrementalWatermarkField']) {
      expect(DECLARED_OWNED_OBJECT_COLUMNS).toContain(c);
    }
  });

  it('is a strict subset of the projected columns, so it cannot name a column that does not exist', () => {
    for (const c of DECLARED_OWNED_OBJECT_COLUMNS) expect(CATALOG_OBJECT_COLUMNS).toContain(c);
  });
});

describe('RebaseFromDeclared', () => {
  it('per-connection: overwrites a stale declared column from the declaration', () => {
    const row: Record<string, unknown> = { APIPath: '/v1/old', DefaultPageSize: 100, IsSelected: true };
    const declared: Record<string, unknown> = { APIPath: '/v2/new', DefaultPageSize: 500, IsSelected: false };
    const moved = perConn().RebaseFromDeclared(row as never, declared as never, 'object');
    expect(row.APIPath).toBe('/v2/new');
    expect(row.DefaultPageSize).toBe(500);
    expect(moved).toEqual(expect.arrayContaining(['APIPath', 'DefaultPageSize']));
  });

  it('per-connection: never touches this connection\'s own state', () => {
    const row: Record<string, unknown> = { IsSelected: true, Provenance: 'Sampled', Status: 'Active' };
    const declared: Record<string, unknown> = { IsSelected: false, Provenance: 'Declared', Status: 'Disabled' };
    perConn().RebaseFromDeclared(row as never, declared as never, 'object');
    expect(row.IsSelected).toBe(true);
    expect(row.Provenance).toBe('Sampled');
    expect(row.Status).toBe('Active');
  });

  it('per-connection: an object with no declared match is left alone', () => {
    const row: Record<string, unknown> = { APIPath: '/only/here' };
    expect(perConn().RebaseFromDeclared(row as never, null, 'object')).toEqual([]);
    expect(row.APIPath).toBe('/only/here');
  });

  it('per-connection: reports nothing moved when already equal, so the row stays clean', () => {
    const row: Record<string, unknown> = { APIPath: '/same' };
    expect(perConn().RebaseFromDeclared(row as never, { APIPath: '/same' } as never, 'object')).toEqual([]);
  });

  it('shared: no-op, because there the row IS the declaration', () => {
    const row: Record<string, unknown> = { APIPath: '/v1/old' };
    expect(shared().RebaseFromDeclared()).toEqual([]);
    expect(row.APIPath).toBe('/v1/old');
  });
});

/**
 * MJ-CAT-21 — the same rule, for FIELDS, on a row that already exists.
 *
 * Objects were rebased on every refresh; fields were rebased only when the row was CREATED. So a
 * connector release that changed a declared field's type, width or key flags reached connections
 * that had never seen the field, and silently skipped every connection that already had it.
 *
 * The live case: PheedLoop 1.4.6 added `eventCode` to the Attendees primary key. Connections that
 * had already discovered `eventCode` from the source kept a one-column key while the declaration
 * said two — with no error, because from the persist's point of view nothing had changed.
 */
describe('AdoptDeclaration — an existing field row matched to a declaration', () => {
  const declaredField = () =>
    ({ ID: 'df-1', Name: 'eventCode', Type: 'nvarchar', Length: 100, IsPrimaryKey: true,
       IsUniqueKey: false, IsCustom: false, MetadataSource: 'Metadata' }) as never;

  it('carries the declared key flag onto a row discovery had created', () => {
    const row = { ID: 'cf-9', Name: 'eventCode', Type: 'nvarchar', Length: 64, IsPrimaryKey: false,
                  IsCustom: true, MetadataSource: 'Discovered', Provenance: 'Sampled',
                  IntegrationObjectFieldID: null } as never as Record<string, unknown>;
    const moved = perConn().AdoptDeclaration(row as never, declaredField(), 'field');
    expect(row.IsPrimaryKey).toBe(true);
    expect(moved).toContain('IsPrimaryKey');
  });

  it('stops calling the row Discovered — without this the PK decider demotes it again', () => {
    // decidePKPromotion reads MetadataSource === 'Discovered' to rule that a declared key cannot
    // include this field. A rebase that left it alone would set IsPrimaryKey and lose it again
    // three statements later, which is the whole reason this is not just RebaseFromDeclared.
    const row = { ID: 'cf-9', Name: 'eventCode', IsPrimaryKey: false, IsCustom: true,
                  MetadataSource: 'Discovered', Provenance: 'Sampled',
                  IntegrationObjectFieldID: null } as never as Record<string, unknown>;
    perConn().AdoptDeclaration(row as never, declaredField(), 'field');
    expect(row.MetadataSource).not.toBe('Discovered');
    expect(row.Provenance).toBe('Declared');
    expect(row.IsCustom).toBe(false);
    expect(row.IntegrationObjectFieldID).toBe('df-1');
  });

  it('does not deselect the field or forget when it was first seen', () => {
    // StampNewField clears IsSelected and resets FirstSeenAt. Reusing it here would deselect a
    // table the customer had chosen.
    const first = new Date('2026-01-01T00:00:00Z');
    const row = { ID: 'cf-9', Name: 'eventCode', IsPrimaryKey: false, MetadataSource: 'Discovered',
                  IsSelected: true, FirstSeenAt: first } as never as Record<string, unknown>;
    perConn().AdoptDeclaration(row as never, declaredField(), 'field');
    expect(row.IsSelected).toBe(true);
    expect(row.FirstSeenAt).toBe(first);
  });

  it('is a no-op with no declaration — a connection-only field has nothing to adopt', () => {
    const row = { ID: 'cf-9', Name: 'custom_thing', IsPrimaryKey: false,
                  MetadataSource: 'Discovered' } as never as Record<string, unknown>;
    expect(perConn().AdoptDeclaration(row as never, null, 'field')).toEqual([]);
    expect(row.MetadataSource).toBe('Discovered');
  });

  it('is a no-op on the shared catalog, where the row IS the declaration', () => {
    expect(shared().AdoptDeclaration()).toEqual([]);
  });
});
