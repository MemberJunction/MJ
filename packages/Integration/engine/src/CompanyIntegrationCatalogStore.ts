import { BaseEntity, CompositeKey, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    CATALOG_FIELD_COLUMNS,
    CATALOG_OBJECT_COLUMNS,
    CompanyIntegrationCatalogSchemaMismatch,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
} from '@memberjunction/integration-engine-base';

/**
 * The ONLY write path to the per-connection catalog.
 *
 * These two entities have no generated subclass — deliberately, because generating one means
 * patching a file with thousands of classes in it, and the patch would have to be regenerated on
 * every upstream release. The consequence is a trap with no natural symptom:
 *
 *     const row = await md.GetEntityObject('MJ: Company Integration Objects', user);
 *     row.Name = 'Contacts';        // creates an own property on a plain object
 *     await row.Save();             // succeeds, writes nothing, reports success
 *
 * There is no accessor to intercept the assignment, so the value lands beside the entity's field
 * list instead of in it, the row saves clean, and the column keeps whatever it had. Nothing throws
 * and nothing logs. In a discovery that persists hundreds of rows this reads as a source that
 * returned less than expected.
 *
 * So this wrapper exists, and every write in the engine goes through it. `Set` refuses a column
 * name the entity does not have, which turns that silent no-op into an immediate, named error.
 */

type CatalogEntityName =
    | typeof ENTITY_COMPANY_INTEGRATION_OBJECTS
    | typeof ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS;

/** Entities whose column set has already been checked, so the check costs one pass per process. */
const verified = new Set<string>();

function requiredColumnsFor(entityName: CatalogEntityName): readonly string[] {
    return entityName === ENTITY_COMPANY_INTEGRATION_OBJECTS
        ? CATALOG_OBJECT_COLUMNS
        : CATALOG_FIELD_COLUMNS;
}

/**
 * Assert the loaded entity carries every column the engine writes.
 *
 * Checked against a real row rather than against metadata alone, because a row is what `Set` will
 * be called on. Runs once per entity per process: the alternative is a migration-shaped failure
 * appearing as scattered missing values hours later, in a run that reported success.
 *
 * The virtual view aliases are excluded — they exist on the row but are not writable, and
 * `AssertWritable` below is what keeps a write off them.
 */
function assertShape(entityName: CatalogEntityName, row: BaseEntity): void {
    if (verified.has(entityName)) return;
    const present = new Set((row.Fields ?? []).map(f => f.Name));
    const missing = requiredColumnsFor(entityName).filter(c => !present.has(c));
    if (missing.length > 0) throw new CompanyIntegrationCatalogSchemaMismatch(entityName, missing);
    verified.add(entityName);
}

/**
 * Columns the view exposes as aliases of a real column. Writing one would be accepted by the row
 * and dropped by the CRUD procedure, which has no parameter for it — the same silent loss this
 * class exists to prevent, one layer down.
 */
const VIRTUAL_COLUMNS = new Set([
    'IntegrationObjectID',
    'RelatedIntegrationObjectID',
    'RelatedIntegrationObject',
    'Integration',
    'IntegrationObject',
]);

/**
 * A per-connection catalog row, writable only through `Set`.
 *
 * Note `IntegrationObjectID` is virtual on the FIELD entity (a view alias) and REAL on the OBJECT
 * entity (the provenance foreign key). `Set` resolves that from the row's own field list rather
 * than from the name, so the object's provenance link stays writable and the field's alias does
 * not.
 */
export class CatalogRow {
    private constructor(
        private readonly entityName: CatalogEntityName,
        private readonly row: BaseEntity
    ) {}

    /** @internal */
    public static wrap(entityName: CatalogEntityName, row: BaseEntity): CatalogRow {
        assertShape(entityName, row);
        return new CatalogRow(entityName, row);
    }

    public get ID(): string {
        return this.row.Get('ID') as string;
    }

    /** The underlying row, for a caller that needs to enlist it in a transaction group. */
    public get Entity(): BaseEntity {
        return this.row;
    }

    public Get<T = unknown>(column: string): T {
        return this.row.Get(column) as T;
    }

    /**
     * Write one column.
     *
     * Throws on a column the entity does not have and on a view alias, because both would otherwise
     * be accepted and discarded. That is the whole point of this class: the failure is loud, at the
     * assignment, naming the column.
     */
    public Set(column: string, value: unknown): this {
        const field = (this.row.Fields ?? []).find(f => f.Name === column);
        if (!field) {
            throw new Error(
                `${this.entityName} has no column '${column}'. Assigning it would create a property `
                + `beside the entity's field list, and the row would save clean while writing nothing.`
            );
        }
        if (VIRTUAL_COLUMNS.has(column) && field.EntityFieldInfo?.IsVirtual === true) {
            throw new Error(
                `${this.entityName}.${column} is a view alias, not a stored column. The CRUD `
                + `procedure has no parameter for it, so this write would be silently dropped. `
                + `Write the real column instead.`
            );
        }
        this.row.Set(column, value);
        return this;
    }

    /** Set several columns. Skips `undefined` so a caller can pass a sparse patch. */
    public SetMany(values: Record<string, unknown>): this {
        for (const [k, v] of Object.entries(values)) if (v !== undefined) this.Set(k, v);
        return this;
    }

    public async Save(): Promise<boolean> {
        return await this.row.Save();
    }

    public async Delete(): Promise<boolean> {
        return await this.row.Delete();
    }

    /** The row's own error text after a failed Save, for logging. */
    public get LastError(): string {
        return this.row.LatestResult?.Message ?? '';
    }
}

/** Reads and writes for the per-connection catalog. */
export class CompanyIntegrationCatalogStore {
    constructor(private readonly contextUser: UserInfo) {}

    private async newRow(entityName: CatalogEntityName): Promise<CatalogRow> {
        const md = new Metadata();
        const row = await md.GetEntityObject<BaseEntity>(entityName, this.contextUser);
        if (!row) {
            throw new CompanyIntegrationCatalogSchemaMismatch(entityName, ['<entity not registered>']);
        }
        row.NewRecord();
        return CatalogRow.wrap(entityName, row);
    }

    public NewObject(): Promise<CatalogRow> {
        return this.newRow(ENTITY_COMPANY_INTEGRATION_OBJECTS);
    }

    public NewField(): Promise<CatalogRow> {
        return this.newRow(ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS);
    }

    private async loadRow(entityName: CatalogEntityName, id: string): Promise<CatalogRow | null> {
        const md = new Metadata();
        const row = await md.GetEntityObject<BaseEntity>(entityName, this.contextUser);
        if (!row) return null;
        // `Load(id)` is a GENERATED-subclass convenience. These entities have none, so the entry
        // point is the base one — the same call the existing shared-catalog code makes.
        const loaded = await row.InnerLoad(CompositeKey.FromID(id));
        return loaded ? CatalogRow.wrap(entityName, row) : null;
    }

    public LoadObject(id: string): Promise<CatalogRow | null> {
        return this.loadRow(ENTITY_COMPANY_INTEGRATION_OBJECTS, id);
    }

    public LoadField(id: string): Promise<CatalogRow | null> {
        return this.loadRow(ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, id);
    }

    /**
     * Read straight from the database rather than the engine cache.
     *
     * Used by the write path, which must see rows another pass of the same run just persisted. The
     * engine cache is refreshed between passes, not within one.
     */
    private async runView(entityName: CatalogEntityName, filter: string): Promise<BaseEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<BaseEntity>(
            { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object' },
            this.contextUser
        );
        return result?.Success ? (result.Results ?? []) : [];
    }

    /**
     * Every object row for a connection, INCLUDING disabled ones.
     *
     * Disabled rows are load-bearing here: the overlay reactivates an object that reappeared rather
     * than inserting a second one, and the unique constraint on (connection, name) means matching
     * active rows only would turn a reappearance into a constraint violation.
     */
    public async ObjectsForConnection(companyIntegrationID: string): Promise<CatalogRow[]> {
        const rows = await this.runView(
            ENTITY_COMPANY_INTEGRATION_OBJECTS,
            `CompanyIntegrationID = '${companyIntegrationID}'`
        );
        return rows.map(r => CatalogRow.wrap(ENTITY_COMPANY_INTEGRATION_OBJECTS, r));
    }

    /** Every field row for one object, including disabled ones, for the same reason. */
    public async FieldsForObject(companyIntegrationObjectID: string): Promise<CatalogRow[]> {
        const rows = await this.runView(
            ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
            `CompanyIntegrationObjectID = '${companyIntegrationObjectID}'`
        );
        return rows.map(r => CatalogRow.wrap(ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, r));
    }

    /** Whether this connection has a per-connection catalog at all. Cheap existence check. */
    public async HasCatalog(companyIntegrationID: string): Promise<boolean> {
        const rv = new RunView();
        const result = await rv.RunView(
            {
                EntityName: ENTITY_COMPANY_INTEGRATION_OBJECTS,
                ExtraFilter: `CompanyIntegrationID = '${companyIntegrationID}'`,
                ResultType: 'count_only',
            },
            this.contextUser
        );
        return (result?.TotalRowCount ?? 0) > 0;
    }
}
