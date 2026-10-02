/**
 * Removing a TABLE means two different things depending on which catalog owns the row, and the
 * difference is deliberate (plan.md): a SHARED IntegrationObject is the declared floor every other
 * connection of that connector reads, so it is only DISABLED; a PER-CONNECTION row is nobody
 * else's, so "removed" means removed — "they just dont exist, its likely a cascade delete".
 *
 * A COLUMN is not a table, and the rule does not carry across. plan.md draws the line twice — "for
 * tables only, if its not there after discovery algorithm, just removes it" and "columns that are
 * in MJC already never get removed ... NEVER columns" — and everything.txt says why: "sometimes, a
 * column may be missing ... it doesnt automatically conclude the column no longer exist". A column
 * absent from a sample is absent from a SAMPLE. Deleting it throws away the observed width, the
 * provenance and the selection that only this connection knows, so a later sample that does see it
 * starts from nothing. Both catalogs therefore DISABLE a field, and only the table cascade deletes
 * one.
 *
 * The policy lives in the writer so the persist path never branches on a flag.
 *
 * `RunView` is stubbed at the module boundary because the writer constructs its own instance
 * rather than calling a method on the provider it is handed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Record<string, unknown[]> = {};

vi.mock('@memberjunction/core', async (orig) => {
  const actual = await orig<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: () => {},
    RunView: class {
      async RunView(p: { EntityName: string }) {
        return { Success: true, Results: rows[p.EntityName] ?? [] };
      }
    },
  };
});

const { SharedCatalogWriter, PerConnectionCatalogWriter } = await import('../CatalogWriter.js');
const { CATALOG_FIELD_COLUMNS, CATALOG_OBJECT_COLUMNS } =
  await import('@memberjunction/integration-engine-base');

const FIELDS = 'MJ: Company Integration Object Fields';

/** A row that satisfies the proxy's column guard and records what happened to it. */
function makeRow(cols: readonly string[], over: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(over));
  const r: Record<string, unknown> = {
    Fields: cols.map(Name => ({ Name })),
    Get: (c: string) => values.get(c),
    // Writes land in the map AND on the object: the real rows are proxied, so a column is
    // readable both as a property and through Get. A fake that only did one would let a
    // direct-property read (`row.ID`) pass here and fail in production, or vice versa.
    Set: (c: string, v: unknown) => { values.set(c, v); r[c] = v; },
    Save: vi.fn(async () => (over.saveOk === false ? false : true)),
    Delete: vi.fn(async () => true),
    values,
    ...over,
  };
  return r;
}

beforeEach(() => { for (const k of Object.keys(rows)) delete rows[k]; });

describe('shared catalog retires by disabling', () => {
  it('sets Disabled, saves, and reports it did not delete', async () => {
    const w = new SharedCatalogWriter({} as never, 'int-1', {} as never);
    const r = makeRow(CATALOG_OBJECT_COLUMNS, { ID: 'obj-1', Name: 'Widget', Status: 'Active' });
    const out = await w.RetireObject(r as never);
    expect(out).toEqual({ ok: true, deleted: false });
    expect(r.Status).toBe('Disabled');
    expect(r.Delete).not.toHaveBeenCalled();
  });
});

describe('per-connection catalog retires by deleting', () => {
  it('clears the inbound dependency edge, deletes children, then deletes the object', async () => {
    const edge = makeRow(CATALOG_FIELD_COLUMNS, { ID: 'f-x', RelatedCompanyIntegrationObjectID: 'obj-1' });
    const child = makeRow(CATALOG_FIELD_COLUMNS, { ID: 'f-1' });
    rows[FIELDS] = [edge, child];

    const w = new PerConnectionCatalogWriter({} as never, 'ci-1', 'int-1', {} as never, new Date());
    const target = makeRow(CATALOG_OBJECT_COLUMNS, { ID: 'obj-1', Name: 'Widget' });
    const out = await w.RetireObject(target as never);

    expect(out).toEqual({ ok: true, deleted: true });
    // the self-referencing FK must be cleared first, or the delete violates it and aborts the persist
    expect(edge.RelatedCompanyIntegrationObjectID).toBeNull();
    expect(edge.Save).toHaveBeenCalled();
    expect(target.Delete).toHaveBeenCalled();
  });

  it('refuses to delete the object when an inbound edge cannot be cleared', async () => {
    rows[FIELDS] = [makeRow(CATALOG_FIELD_COLUMNS, {
      ID: 'f-x', RelatedCompanyIntegrationObjectID: 'obj-1', saveOk: false,
    })];
    const w = new PerConnectionCatalogWriter({} as never, 'ci-1', 'int-1', {} as never, new Date());
    const target = makeRow(CATALOG_OBJECT_COLUMNS, { ID: 'obj-1', Name: 'Widget' });
    const out = await w.RetireObject(target as never);
    expect(out).toEqual({ ok: false, deleted: false });
    expect(target.Delete).not.toHaveBeenCalled();
  });

  it('DISABLES an absent field rather than deleting it', async () => {
    // The dictated exception to the delete rule. A column missing from one sample is not a column
    // that has gone; disabling reverses itself the moment discovery sees it again, and keeps the
    // width, provenance and selection that deleting would destroy.
    const w = new PerConnectionCatalogWriter({} as never, 'ci-1', 'int-1', {} as never, new Date());
    const f = makeRow(CATALOG_FIELD_COLUMNS, { ID: 'f-9', Status: 'Active' });
    const out = await w.RetireField(f as never);
    expect(out).toEqual({ ok: true, deleted: false });
    expect(f.Status).toBe('Disabled');
    expect(f.Delete).not.toHaveBeenCalled();
  });

  it('still deletes a field when its OBJECT is removed — that is the table cascade', async () => {
    const child = makeRow(CATALOG_FIELD_COLUMNS, { ID: 'f-1' });
    rows[FIELDS] = [child];
    const w = new PerConnectionCatalogWriter({} as never, 'ci-1', 'int-1', {} as never, new Date());
    const target = makeRow(CATALOG_OBJECT_COLUMNS, { ID: 'obj-1', Name: 'Widget' });
    await w.RetireObject(target as never);
    expect(child.Delete).toHaveBeenCalled();
  });
});
