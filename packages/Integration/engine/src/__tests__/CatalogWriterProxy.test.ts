import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CATALOG_FIELD_COLUMNS, CATALOG_OBJECT_COLUMNS } from '@memberjunction/integration-engine-base';
import { PerConnectionCatalogWriter, SharedCatalogWriter } from '../CatalogWriter.js';
import type { MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';

/**
 * These prove the one property the whole per-connection write path rests on: that a row handed to
 * the merge logic behaves like a typed entity whether or not a generated subclass exists.
 *
 * The two fakes below are the two real cases. `SubclasslessRow` is what a migration-registered
 * entity actually gives you — values in a bag, reachable only through Get/Set, no accessors.
 * `TypedRow` is what CodeGen generates — real accessors that delegate to Get/Set. The proxy must be
 * transparent over the second and supply the missing half of the first.
 */

class SubclasslessRow {
    public readonly values = new Map<string, unknown>();
    public saved = 0;
    /** Every column the real entity has. The wrap-time assertion checks this list. */
    public Fields: Array<{ Name: string }> = CATALOG_OBJECT_COLUMNS.map(Name => ({ Name }));
    /** Every column name Get was asked for, so a test can prove what did NOT reach it. */
    public readonly getCalls: string[] = [];
    public Get(c: string): unknown { this.getCalls.push(c); return this.values.get(c); }
    public Set(c: string, v: unknown): void { this.values.set(c, v); }
    public NewRecord(): void { /* no-op */ }
    public async Save(): Promise<boolean> { this.saved++; return true; }
    /** Reads a value through `this` — proves methods run against the real row, not the proxy. */
    public Describe(): string { return `${String(this.Get('Name'))}`; }
    /**
     * Touches a property that is not a column and not a member. A method BOUND to the real row
     * simply gets `undefined`. An UNBOUND one runs with `this` set to the proxy, so the same read
     * falls through the handler into `Get('__internal')` — which is how a proxy silently turns an
     * entity's own internal bookkeeping into a bogus column lookup.
     */
    public TouchInternal(): unknown { return (this as unknown as Record<string, unknown>).__internal; }
}

class TypedRow extends SubclasslessRow {
    public get Description(): unknown { return this.Get('Description'); }
    public set Description(v: unknown) { this.Set('Description', v); }
}

type Row = Record<string, unknown> & { Save(): Promise<boolean>; Describe(): string };

// The module keeps `proxyRow` private; exercise it exactly as production does, through a writer
// whose provider hands back our fake.
function writerOver(row: object, perConnection: boolean) {
    const md = { GetEntityObject: async () => row } as never;
    return perConnection
        ? new PerConnectionCatalogWriter(md, 'ci-1', 'int-1', {} as never, new Date(0))
        : new SharedCatalogWriter(md, 'int-1', {} as never);
}

test('assignment on a SUBCLASSLESS row reaches Set — the silent-loss bug', async () => {
    const raw = new SubclasslessRow();
    const row = (await writerOver(raw, true).NewObjectRow()) as unknown as Row;
    row.Name = 'Contacts';
    // Without the proxy this assertion fails: the value lands as an own property, the field bag
    // stays empty, and Save() reports success having written nothing.
    assert.equal(raw.values.get('Name'), 'Contacts');
});

test('the proxy is transparent over a TYPED row — the real accessor is used', async () => {
    const raw = new TypedRow();
    const row = (await writerOver(raw, false).NewObjectRow()) as unknown as Row;
    row.Description = 'hello';
    assert.equal(raw.values.get('Description'), 'hello');
    assert.equal(row.Description, 'hello');
});

test('methods run against the real row, never recursing through the proxy', async () => {
    const raw = new SubclasslessRow();
    const row = (await writerOver(raw, true).NewObjectRow()) as unknown as Row;
    row.Name = 'Orders';
    assert.equal(row.Describe(), 'Orders');
    assert.equal(await row.Save(), true);
    assert.equal(raw.saved, 1);
});

test('an entity method touching a non-column does not become a column lookup', async () => {
    const raw = new SubclasslessRow();
    const row = (await writerOver(raw, true).NewObjectRow()) as unknown as Row & { TouchInternal(): unknown };
    assert.equal(row.TouchInternal(), undefined);
    assert.ok(!raw.getCalls.includes('__internal'),
              'the method ran with `this` set to the proxy, so an internal read became a Get()');
});

test('the field aliases map the shared column names onto the per-connection ones', async () => {
    // The merge logic writes `field.IntegrationObjectID` and `field.RelatedIntegrationObjectID`
    // throughout. On the per-connection table those are view aliases; the real columns carry the
    // per-connection names. Without this mapping every parent link and every dependency edge would
    // be written to a column that does not exist.
    const raw = new SubclasslessRow();
    raw.Fields = CATALOG_FIELD_COLUMNS.map(Name => ({ Name }));
    const field = (await writerOver(raw, true).NewFieldRow()) as unknown as MJIntegrationObjectFieldEntity;
    field.IntegrationObjectID = 'obj-1';
    field.RelatedIntegrationObjectID = 'obj-2';
    assert.equal(raw.values.get('CompanyIntegrationObjectID'), 'obj-1');
    assert.equal(raw.values.get('RelatedCompanyIntegrationObjectID'), 'obj-2');
    assert.equal(raw.values.get('IntegrationObjectID'), undefined, 'wrote the alias, not the real column');
    // and the read side round-trips through the same alias
    assert.equal(field.IntegrationObjectID, 'obj-1');
});

test('the OBJECT entity keeps IntegrationObjectID as a real column, not an alias', async () => {
    // Same name, opposite meaning: on the object table it is the provenance link to the declared
    // row. Aliasing it there would silently redirect the provenance FK.
    const raw = new SubclasslessRow();
    const row = (await writerOver(raw, true).NewObjectRow()) as unknown as Row;
    row.IntegrationObjectID = 'declared-1';
    assert.equal(raw.values.get('IntegrationObjectID'), 'declared-1');
    assert.equal(raw.values.get('CompanyIntegrationObjectID'), undefined);
});

test('an unknown column throws on the per-connection catalog instead of silently vanishing', async () => {
    const raw = new SubclasslessRow();
    const row = (await writerOver(raw, true).NewObjectRow()) as unknown as Row;
    assert.throws(() => { row.NoSuchColumn = 1; }, /has no column 'NoSuchColumn'/);
    // and the message names the alias when one was applied, so the reader is not left hunting.
    // The parent column is dropped from an otherwise-complete field entity, which is the shape of
    // a real half-applied migration.
    const f = new SubclasslessRow();
    f.Fields = CATALOG_FIELD_COLUMNS.filter(c => c !== 'CompanyIntegrationObjectID').map(Name => ({ Name }));
    assert.rejects(
        () => writerOver(f, true).NewFieldRow(),
        /PER_CONNECTION_CATALOG_SCHEMA_MISMATCH|missing 1 required column\(s\): CompanyIntegrationObjectID/,
        'a half-applied migration must fail at wrap time, not at the first lost write');
});

test('the shared catalog is deliberately unguarded', async () => {
    // Its generated subclass makes a bad column name a compile error; a runtime guard there would
    // only add a way for existing behaviour to change.
    const raw = new TypedRow();
    const row = (await writerOver(raw, false).NewObjectRow()) as unknown as Row;
    assert.doesNotThrow(() => { row.AnythingAtAll = 1; });
});

test('StampNewObject writes the ownership columns and starts deselected', async () => {
    const raw = new SubclasslessRow();
    const w = writerOver(raw, true);
    const row = await w.NewObjectRow();
    w.StampNewObject(row, null, 'Sampled');
    assert.equal(raw.values.get('CompanyIntegrationID'), 'ci-1');
    assert.equal(raw.values.get('IntegrationObjectID'), null, 'null means: exists only for this connection');
    assert.equal(raw.values.get('Provenance'), 'Sampled');
    // Membership is not selection. A newly-discovered object joins the catalog deselected and is
    // still visible to schema introspection — which is the bug this column exists to fix.
    assert.equal(raw.values.get('IsSelected'), false);
});

test('the shared writer stamps only the integration id', async () => {
    const raw = new TypedRow();
    const w = writerOver(raw, false);
    const row = await w.NewObjectRow();
    w.StampNewObject(row, 'ignored', 'Declared');
    assert.equal(raw.values.get('IntegrationID'), 'int-1');
    assert.equal(raw.values.get('Provenance'), undefined, 'the shared catalog has no provenance column');
    assert.equal(raw.values.get('IsSelected'), undefined);
});
