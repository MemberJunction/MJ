/**
 * MJ-CAT-17. A per-connection catalog starts EMPTY, so on a connection's first discovery every
 * declared object is "new" in that scope even though the connector declared it. The create path
 * used to build such a row from the sample alone: APIPath defaulted to the object NAME, no page
 * size, no watermark field, no declared keys. Observed on the sandbox 2026-09-11, first PheedLoop
 * sync: 27 objects, 27 HTTP 404s (`…/organization/…/Tags`), 0 rows.
 *
 * Now a declared match is SEEDED from the declaration and then overlaid exactly like a row that
 * already existed. These drive the two upserts through a real PerConnectionCatalogWriter over fake
 * rows, so what is asserted is the row the writer would have saved.
 */
import { describe, it, expect } from 'vitest';
import { PerConnectionCatalogWriter } from '../CatalogWriter.js';
import { IntegrationSchemaSync } from '../IntegrationSchemaSync.js';
import { CATALOG_OBJECT_COLUMNS, CATALOG_FIELD_COLUMNS } from '@memberjunction/integration-engine-base';

class FakeRow {
  public readonly values = new Map<string, unknown>();
  public saved = 0;
  public Fields: Array<{ Name: string }>;
  constructor(columns: readonly string[]) { this.Fields = columns.map(Name => ({ Name })); }
  public Get(c: string): unknown { return this.values.get(c); }
  public Set(c: string, v: unknown): void { this.values.set(c, v); }
  public NewRecord(): void { /* no-op */ }
  public async Save(): Promise<boolean> { this.saved++; this.values.set('ID', this.values.get('ID') ?? 'new-row-id'); return true; }
  public get LatestResult(): unknown { return undefined; }
}

const rows: FakeRow[] = [];
function writer(): PerConnectionCatalogWriter {
  const md = {
    GetEntityObject: async (entity: string) => {
      const r = new FakeRow(entity.includes('Field') ? CATALOG_FIELD_COLUMNS : CATALOG_OBJECT_COLUMNS);
      rows.push(r);
      return r;
    }
  } as never;
  return new PerConnectionCatalogWriter(md, 'ci-1', 'int-1', {} as never, new Date(0));
}

type Upserts = {
  UpsertObject: (...a: unknown[]) => Promise<{ ObjectID: string | null; Created: boolean; Updated: boolean }>;
  UpsertField: (...a: unknown[]) => Promise<{ Created: boolean; Updated: boolean }>;
};
const sync = IntegrationSchemaSync as unknown as Upserts;

const declaredObject = {
  ID: 'decl-obj-1', IntegrationID: 'int-1', Name: 'Tags', DisplayName: 'Tags', Description: 'Declared tags',
  APIPath: '/organization/{orgId}/tags', ResponseDataKey: 'results', DefaultPageSize: 200, SupportsPagination: true,
  PaginationType: 'PageNumber', SupportsIncrementalSync: true, IncrementalWatermarkField: 'updated_at',
  IsCustom: false, MetadataSource: 'Declared', Sequence: 12, Status: 'Active', Configuration: null,
};

describe('first discovery seeds a declared object from the declaration (MJ-CAT-17)', () => {
  it('a declared object with no per-connection row yet keeps its declared APIPath, paging and watermark', async () => {
    rows.length = 0;
    const srcObj = { ExternalName: 'Tags', ExternalLabel: 'Tags', Fields: [] };
    const r = await sync.UpsertObject(writer(), srcObj, [] /* nothing in this connection's scope */, declaredObject, false);
    expect(r.Created).toBe(true);
    const row = rows[0];
    expect(row.saved).toBe(1);
    expect(row.Get('APIPath')).toBe('/organization/{orgId}/tags');   // NOT 'Tags'
    expect(row.Get('DefaultPageSize')).toBe(200);
    expect(row.Get('PaginationType')).toBe('PageNumber');
    expect(row.Get('IncrementalWatermarkField')).toBe('updated_at');
    expect(row.Get('IsCustom')).toBe(false);
    expect(row.Get('MetadataSource')).toBe('Declared');
    expect(row.Get('Provenance')).toBe('Declared');
    expect(row.Get('IntegrationObjectID')).toBe('decl-obj-1');
    expect(row.Get('CompanyIntegrationID')).toBe('ci-1');
    expect(row.Get('Status')).toBe('Active');
  });

  it('an object with NO declared match still defaults APIPath to its name (unchanged behaviour)', async () => {
    rows.length = 0;
    const srcObj = { ExternalName: 'CustomThing', ExternalLabel: 'Custom Thing', Fields: [] };
    const r = await sync.UpsertObject(writer(), srcObj, [], null, false);
    expect(r.Created).toBe(true);
    expect(rows[0].Get('APIPath')).toBe('CustomThing');
    expect(rows[0].Get('IsCustom')).toBe(true);
    expect(rows[0].Get('MetadataSource')).toBe('Discovered');
  });

  it('a declared field with no per-connection row yet keeps its declared key flag and type', async () => {
    rows.length = 0;
    const declaredField = {
      ID: 'decl-fld-1', Name: 'id', DisplayName: 'ID', Type: 'nvarchar', Length: 64, AllowsNull: false,
      IsPrimaryKey: true, IsUniqueKey: true, IsReadOnly: true, IsRequired: true, Sequence: 1,
      IsCustom: false, MetadataSource: 'Declared', Status: 'Active', Configuration: null,
    };
    // The sample is silent on type and key — exactly what a REST sample of an id looks like.
    const srcField = { Name: 'id', Label: 'id', SourceType: undefined, IsPrimaryKey: undefined, IsRequired: false };
    const r = await sync.UpsertField(writer(), 'obj-1', srcField, [], undefined, /* objectHasDeclaredPK */ true, false, 'decl-fld-1', declaredField);
    expect(r.Created).toBe(true);
    const row = rows[0];
    expect(row.saved).toBe(1);
    expect(row.Get('IsPrimaryKey')).toBe(true);
    expect(row.Get('Type')).toBe('nvarchar');
    expect(row.Get('Length')).toBe(64);
    expect(row.Get('Provenance')).toBe('Declared');
    expect(row.Get('IntegrationObjectFieldID')).toBe('decl-fld-1');
    expect(row.Get('CompanyIntegrationObjectID')).toBe('obj-1');
  });
});
