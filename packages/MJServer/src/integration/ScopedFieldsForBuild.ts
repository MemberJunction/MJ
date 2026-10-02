/**
 * The FIELD rows a schema build materializes, for a connection with its own catalog.
 *
 * A schema build (ApplySchema, ApplyAll, ApplyAllBatch, the connector build, schema evolution)
 * reconstructs the source schema from persisted catalog rows and hands it to SchemaBuilder. It used
 * to read each object's fields from the engine's in-memory catalog. Once a connection's field rows
 * are no longer held resident — they are warmed per object on demand, and the only site that warms
 * them is the sync loop — that read answers `[]` for every object of the connection, and an object
 * with no fields materializes nothing. Observed on a per-connection catalog (364 objects, 7,230
 * active fields): the apply logged "Reusing 364 persisted IOs", then ran a migration with an empty
 * table list in 4 ms — no CREATE, no ALTER, no error.
 *
 * So the build reads the connection's field rows itself: one read per {@link SCOPED_FIELDS_CHUNK}
 * objects, plain rows, bypassing the query cache (an answer cached before discovery's persist is the
 * empty set), and without the row cap (one object can carry thousands of fields). A failed read
 * THROWS: an empty answer here is exactly what produced the zero-table apply.
 *
 * Outside a per-connection scope — or for a connection without its own catalog — this returns
 * `null`, and the build reads the shared catalog from memory exactly as before.
 */
import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import {
    IntegrationEngineBase,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
    type CompanyIntegrationObjectFieldRow,
} from '@memberjunction/integration-engine-base';
import { CurrentCatalogCI } from '@memberjunction/integration-engine';

/** What a schema build reads off a field row. The shared entity and the per-connection row both satisfy it. */
export type BuildFieldRow = Pick<
    MJIntegrationObjectFieldEntity,
    'Name' | 'DisplayName' | 'Description' | 'Type' | 'IsRequired' | 'AllowsNull' | 'Length' | 'Precision'
    | 'Scale' | 'DefaultValue' | 'IsPrimaryKey' | 'IsUniqueKey' | 'IsReadOnly' | 'RelatedIntegrationObjectID' | 'Status'
>;

/** A connection's field rows, keyed by lower-cased per-connection object id. */
export type ScopedBuildFields = Map<string, CompanyIntegrationObjectFieldRow[]>;

/** Objects per read. Each read is one `IN (…)` list, so this bounds the filter's length. */
export const SCOPED_FIELDS_CHUNK = 200;

/** A per-connection field row as the database returns it — before the legacy read names are derived. */
type StoredFieldRow = Omit<CompanyIntegrationObjectFieldRow, 'IntegrationObjectID' | 'RelatedIntegrationObjectID'>;

/**
 * Loads the field rows of the connection in catalog scope for a schema build, or returns `null`
 * when the build should read the shared catalog (no scope, or no per-connection catalog).
 *
 * @throws PER_CONNECTION_FIELDS_UNREADABLE when a read fails — never an empty answer.
 */
export async function LoadScopedFieldsForBuild(integrationID: string, user: UserInfo): Promise<ScopedBuildFields | null> {
    const ciID = CurrentCatalogCI();
    if (!ciID) return null;
    const engine = IntegrationEngineBase.Instance;
    if (!engine.HasCompanyIntegrationCatalog(ciID)) return null;

    const objects = engine.GetActiveIntegrationObjects(integrationID);
    const byObject: ScopedBuildFields = new Map();
    const rv = new RunView();
    for (let i = 0; i < objects.length; i += SCOPED_FIELDS_CHUNK) {
        const chunk = objects.slice(i, i + SCOPED_FIELDS_CHUNK);
        const ids = chunk.map(o => `'${String(o.ID).replace(/'/g, "''")}'`).join(',');
        const res = await rv.RunView<StoredFieldRow>({
            EntityName: ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
            ExtraFilter: `CompanyIntegrationObjectID IN (${ids})`,
            ResultType: 'simple',
            BypassCache: true,
            IgnoreMaxRows: true,
        }, user);
        if (!res?.Success) {
            throw new Error(
                `PER_CONNECTION_FIELDS_UNREADABLE: could not read the field rows of connection ${ciID} ` +
                `(objects ${i + 1}-${i + chunk.length} of ${objects.length}): ${res?.ErrorMessage ?? 'unknown error'}. ` +
                `Refusing to build a schema from an empty field list.`
            );
        }
        for (const row of res.Results ?? []) addRow(byObject, row);
    }
    const rowCount = [...byObject.values()].reduce((n, rows) => n + rows.length, 0);
    console.log(`[LoadScopedFieldsForBuild] connection ${ciID}: ${rowCount} field rows for ${byObject.size} of ${objects.length} active objects`);
    return byObject;
}

/**
 * The fields a build reads for one object: the connection's rows when they were loaded, the
 * engine's catalog otherwise. With loaded rows the engine is not consulted at all, so a cold
 * per-connection field cache cannot empty the build.
 */
export function FieldsForBuild(objectID: string, scoped: ScopedBuildFields | null | undefined, engine: IntegrationEngineBase): BuildFieldRow[] {
    if (scoped) return scoped.get(String(objectID).trim().toLowerCase()) ?? [];
    return engine.GetIntegrationObjectFields(objectID);
}

/**
 * Files one stored row under its object, deriving the two legacy names the build reads
 * (`IntegrationObjectID`, `RelatedIntegrationObjectID`) exactly as the engine's projection does.
 */
function addRow(byObject: ScopedBuildFields, row: StoredFieldRow): void {
    const key = String(row.CompanyIntegrationObjectID).trim().toLowerCase();
    const projected: CompanyIntegrationObjectFieldRow = {
        ...row,
        IntegrationObjectID: row.CompanyIntegrationObjectID,
        RelatedIntegrationObjectID: row.RelatedCompanyIntegrationObjectID ?? null,
    };
    const bucket = byObject.get(key);
    if (bucket) bucket.push(projected);
    else byObject.set(key, [projected]);
}
