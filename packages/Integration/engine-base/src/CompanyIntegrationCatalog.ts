import type { BaseEntity } from '@memberjunction/core';
import type { MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';

/**
 * The per-connection catalog: read-side types, column contract, and projection.
 *
 * Every connector and every engine read site names an IntegrationObject's properties directly —
 * `io.Name` appears 241 times across the connectors repository, `io.Fields` 93, `io.APIPath` 52.
 * A row loaded for an entity with no registered subclass is a plain `BaseEntity`: it carries its
 * values in `Fields` and exposes them through `Get()`, and every one of those property reads is
 * `undefined`. So the cache cannot hand connectors the entity rows themselves.
 *
 * It hands them PROJECTIONS instead — plain objects carrying exactly the property surface the read
 * sites use. That is not a new idea here: `IntegrationEngineBase.SeedForTesting` already seeds the
 * shared catalog with "plain objects shaped like the entity (property reads only)" for the same
 * reason, and the replay tiers exercise metadata-driven connectors through them.
 *
 * Writes are the other half and do NOT come through here — they go through the store in
 * `@memberjunction/integration-engine`, which holds real entity rows and uses `Get()`/`Set()`
 * exclusively. Assigning `row.Name = x` on a subclass-less `BaseEntity` silently creates an own
 * property, `Save()` sends nothing, and the write is lost with no error anywhere.
 */

export const ENTITY_COMPANY_INTEGRATION_OBJECTS = 'MJ: Company Integration Objects';
export const ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS = 'MJ: Company Integration Object Fields';

/**
 * Columns the object projection reads. The first 43 are IntegrationObject's own, copied verbatim so
 * a per-connection row answers every question a shared row answers; the rest are what per-connection
 * rows add. `IntegrationID` is deliberately among the first group and denormalised onto the table:
 * connectors read it off the object, and a join per read would be the wrong trade.
 */
export const CATALOG_OBJECT_COLUMNS = [
    'ID', 'IntegrationID', 'Name', 'DisplayName', 'Description', 'Category', 'APIPath',
    'ResponseDataKey', 'DefaultPageSize', 'SupportsPagination', 'PaginationType',
    'SupportsIncrementalSync', 'SupportsWrite', 'DefaultQueryParams', 'Configuration', 'Sequence',
    'Status', 'WriteAPIPath', 'WriteMethod', 'DeleteMethod', 'IsCustom', 'CreateAPIPath',
    'CreateMethod', 'CreateBodyShape', 'CreateBodyKey', 'CreateIDLocation', 'UpdateAPIPath',
    'UpdateMethod', 'UpdateBodyShape', 'UpdateBodyKey', 'UpdateIDLocation', 'DeleteAPIPath',
    'DeleteIDLocation', 'IncrementalWatermarkField', 'MetadataSource', 'SupportsCreate',
    'SupportsUpdate', 'SupportsDelete', 'SyncStrategy', 'ContentHashApplicable', 'StableOrderingKey',
    'CompanyIntegrationID', 'IntegrationObjectID', 'Provenance', 'ProvenanceDetail', 'IsSelected',
    'SelectedAt', 'FirstSeenAt', 'LastSeenAt', 'LastSampledAt',
] as const;

/**
 * Columns the field projection reads. These are all REAL columns on the per-connection field
 * table — the legacy names `IntegrationObjectID` / `RelatedIntegrationObjectID` are NOT here and
 * must not be: they are derived in `projectCatalogFields` (see FIELD_READ_ALIASES).
 *
 * They are derived in TypeScript rather than aliased in the base view because the view is
 * CodeGen-generated: a hand-added alias column would be silently dropped the next time CodeGen
 * regenerates it, and the loss would only surface as a schema-mismatch throw much later.
 */
export const CATALOG_FIELD_COLUMNS = [
    'ID', 'Name', 'DisplayName', 'Description', 'Category', 'Type', 'Length', 'Precision', 'Scale',
    'AllowsNull', 'DefaultValue', 'IsPrimaryKey', 'IsUniqueKey', 'IsReadOnly', 'IsRequired',
    'RelatedIntegrationObjectFieldName', 'Sequence', 'Configuration', 'Status', 'IsCustom',
    'MetadataSource', 'CompanyIntegrationObjectID', 'RelatedCompanyIntegrationObjectID',
    'IntegrationObjectFieldID', 'Provenance', 'ProvenanceDetail', 'IsSelected', 'SelectedAt',
    'FirstSeenAt', 'LastSeenAt', 'LastSampledAt', 'ObservedMaxLength',
] as const;

/**
 * Legacy read names mapped onto their per-connection columns.
 *
 * A connector resolving a dependency edge reads `f.RelatedIntegrationObjectID` and matches it
 * against its sibling objects (e.g. Rhythm, PathLMS). Deriving these keeps that code working
 * unchanged while the value it gets is the per-connection id.
 */
const FIELD_READ_ALIASES: ReadonlyArray<readonly [alias: string, source: string]> = [
    ['IntegrationObjectID', 'CompanyIntegrationObjectID'],
    ['RelatedIntegrationObjectID', 'RelatedCompanyIntegrationObjectID'],
] as const;

/**
 * Columns whose value the CONNECTOR declares (metadata/ folder), as opposed to columns the
 * connection owns or discovery decides.
 *
 * plan.md requires that a schema refresh treat IO/IOF as the source of truth and REPLACE what is
 * in CIO/CIOF rather than layering on it: "it will use IO/IOF as the SOT before then replacing
 * what is in the respective CIO/CIOF, it will not do the changes on top of CIO/CIOF since it is
 * stale metadata". Without that, an open-app upgrade that changes a declared APIPath or page size
 * would never reach a connection that had already discovered once — the stale per-connection value
 * would win every subsequent overlay.
 *
 * Derived by SUBTRACTION so it cannot drift when a column is added: anything not explicitly
 * identity, per-connection state, or discovery-owned lifecycle is connector-declared.
 * Description / DisplayName / IncrementalWatermarkField are deliberately IN this set — they are
 * rebased from the declaration and then discovery overlays them if it reports a value, which is
 * exactly the documented precedence.
 */
const NOT_DECLARED_OWNED = new Set<string>([
    // identity and linkage
    'ID', 'IntegrationID', 'Name',
    'CompanyIntegrationID', 'IntegrationObjectID',
    'CompanyIntegrationObjectID', 'RelatedCompanyIntegrationObjectID', 'IntegrationObjectFieldID',
    // per-connection state
    'Provenance', 'ProvenanceDetail', 'IsSelected', 'SelectedAt',
    'FirstSeenAt', 'LastSeenAt', 'LastSampledAt', 'ObservedMaxLength',
    // decided by discovery, not declared
    'Status', 'IsCustom', 'MetadataSource',
]);

export const DECLARED_OWNED_OBJECT_COLUMNS: readonly string[] =
    CATALOG_OBJECT_COLUMNS.filter(c => !NOT_DECLARED_OWNED.has(c));

export const DECLARED_OWNED_FIELD_COLUMNS: readonly string[] =
    CATALOG_FIELD_COLUMNS.filter(c => !NOT_DECLARED_OWNED.has(c));

/** Where a per-connection row's shape came from. */
export type CatalogProvenance = 'Declared' | 'Endpoint' | 'Sampled';

/**
 * A per-connection object as read sites see it: every IntegrationObject property, plus the
 * per-connection additions. Structurally assignable to `MJIntegrationObjectEntity` for the property
 * reads connectors perform, which is what makes the swap invisible to them.
 */
export type CompanyIntegrationObjectRow = Pick<
    MJIntegrationObjectEntity,
    'ID' | 'IntegrationID' | 'Name' | 'DisplayName' | 'Description' | 'Category' | 'APIPath'
    | 'ResponseDataKey' | 'DefaultPageSize' | 'SupportsPagination' | 'PaginationType'
    | 'SupportsIncrementalSync' | 'SupportsWrite' | 'DefaultQueryParams' | 'Configuration'
    | 'Sequence' | 'Status' | 'WriteAPIPath' | 'WriteMethod' | 'DeleteMethod' | 'IsCustom'
    | 'CreateAPIPath' | 'CreateMethod' | 'CreateBodyShape' | 'CreateBodyKey' | 'CreateIDLocation'
    | 'UpdateAPIPath' | 'UpdateMethod' | 'UpdateBodyShape' | 'UpdateBodyKey' | 'UpdateIDLocation'
    | 'DeleteAPIPath' | 'DeleteIDLocation' | 'IncrementalWatermarkField' | 'MetadataSource'
    | 'SupportsCreate' | 'SupportsUpdate' | 'SupportsDelete' | 'SyncStrategy'
    | 'ContentHashApplicable' | 'StableOrderingKey'
> & {
    /** The connection this row belongs to. The axis the whole design exists for. */
    CompanyIntegrationID: string;
    /** The declared row this was matched to, or null when the object exists only for this connection. */
    IntegrationObjectID: string | null;
    Provenance: CatalogProvenance;
    /** Per-attribute merge log the persist already computes and currently discards. */
    ProvenanceDetail: string | null;
    /**
     * Catalog membership and sync selection are separate axes. Conflating them is what made a
     * newly-discovered object arrive `Disabled` and therefore vanish from schema introspection, key
     * inference and migration — the customer saw it in the picker, selected it, and got nothing.
     */
    IsSelected: boolean;
    SelectedAt: Date | null;
    FirstSeenAt: Date | null;
    LastSeenAt: Date | null;
    LastSampledAt: Date | null;
};

/**
 * A per-connection field as read sites see it. `IntegrationObjectID` and
 * `RelatedIntegrationObjectID` carry per-connection ids through the view aliases.
 */
export type CompanyIntegrationObjectFieldRow = Pick<
    MJIntegrationObjectFieldEntity,
    'ID' | 'IntegrationObjectID' | 'Name' | 'DisplayName' | 'Description' | 'Category' | 'Type'
    | 'Length' | 'Precision' | 'Scale' | 'AllowsNull' | 'DefaultValue' | 'IsPrimaryKey'
    | 'IsUniqueKey' | 'IsReadOnly' | 'IsRequired' | 'RelatedIntegrationObjectID'
    | 'RelatedIntegrationObjectFieldName' | 'Sequence' | 'Configuration' | 'Status' | 'IsCustom'
    | 'MetadataSource'
> & {
    CompanyIntegrationObjectID: string;
    RelatedCompanyIntegrationObjectID: string | null;
    IntegrationObjectFieldID: string | null;
    Provenance: CatalogProvenance;
    ProvenanceDetail: string | null;
    IsSelected: boolean;
    SelectedAt: Date | null;
    FirstSeenAt: Date | null;
    LastSeenAt: Date | null;
    LastSampledAt: Date | null;
    /**
     * The raw sampled maximum, kept apart from `Length`, which carries the padded width the DDL
     * uses. Without both, a width complaint cannot be told from a padding complaint.
     */
    ObservedMaxLength: number | null;
};

/**
 * Thrown when the loaded entity is missing columns this code requires — the migration is absent or
 * an older version of it ran. Failing here names the problem; letting it through would produce rows
 * whose per-connection columns are all `undefined`, which reads downstream as "no selection, no
 * provenance, never seen" and is indistinguishable from a legitimately empty catalog.
 */
export class CompanyIntegrationCatalogSchemaMismatch extends Error {
    public readonly Code = 'PER_CONNECTION_CATALOG_SCHEMA_MISMATCH';
    constructor(entityName: string, missing: string[]) {
        super(
            `${entityName} is missing ${missing.length} required column(s): ${missing.join(', ')}. `
            + `The per-connection catalog migration has not been applied to this database, or the `
            + `applied version predates these columns.`
        );
        this.name = 'CompanyIntegrationCatalogSchemaMismatch';
    }
}

/** Names present on a loaded row, whether the value is set or not. */
function fieldNamesOf(row: BaseEntity): Set<string> {
    return new Set((row.Fields ?? []).map(f => f.Name));
}

/**
 * Verify a loaded row carries every column we read. Called once per array load — the cost is one
 * pass over one row's field list, and the alternative is a silent wrong answer.
 */
export function assertCatalogColumns(entityName: string, row: BaseEntity, required: readonly string[]): void {
    const present = fieldNamesOf(row);
    const missing = required.filter(c => !present.has(c));
    if (missing.length > 0) throw new CompanyIntegrationCatalogSchemaMismatch(entityName, missing);
}

function project<T>(row: BaseEntity, columns: readonly string[]): T {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c] = row.Get(c);
    return out as T;
}

/**
 * Project loaded object rows for the read path. Validates the column set against the FIRST row
 * only: every row in the array is the same entity, so one is proof, and an empty array proves
 * nothing and needs no check — a connection with no catalog rows is the ordinary pre-discovery
 * state, not a schema problem.
 */
export function projectCatalogObjects(rows: BaseEntity[]): CompanyIntegrationObjectRow[] {
    if (rows.length > 0) {
        assertCatalogColumns(ENTITY_COMPANY_INTEGRATION_OBJECTS, rows[0], CATALOG_OBJECT_COLUMNS);
    }
    return rows.map(r => project<CompanyIntegrationObjectRow>(r, CATALOG_OBJECT_COLUMNS));
}

/** Project loaded field rows for the read path. Same validation rule as the object projection. */
export function projectCatalogFields(rows: BaseEntity[]): CompanyIntegrationObjectFieldRow[] {
    if (rows.length > 0) {
        assertCatalogColumns(ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, rows[0], CATALOG_FIELD_COLUMNS);
    }
    return rows.map(r => {
        const projected = project<Record<string, unknown>>(r, CATALOG_FIELD_COLUMNS);
        for (const [alias, source] of FIELD_READ_ALIASES) projected[alias] = projected[source];
        return projected as unknown as CompanyIntegrationObjectFieldRow;
    });
}

/**
 * Present a projection to code typed against the shared catalog entities.
 *
 * The two casts below are the ONLY place this narrowing happens, deliberately, so the reasoning
 * sits in one auditable spot. A projection carries every property the read sites touch and none of
 * `BaseEntity`'s behaviour — no `Save()`, no `Fields`, no dirty tracking. That is safe here and
 * nowhere else, because reads are all this cache serves: the per-connection write path holds real
 * entity rows and never receives one of these.
 *
 * Calling `.Save()` on the result would throw at runtime rather than corrupt anything, which is the
 * failure mode to want if this contract is ever broken.
 */
export function asReadOnlyObject(row: CompanyIntegrationObjectRow): MJIntegrationObjectEntity {
    return row as unknown as MJIntegrationObjectEntity;
}

/** See {@link asReadOnlyObject}. */
export function asReadOnlyField(row: CompanyIntegrationObjectFieldRow): MJIntegrationObjectFieldEntity {
    return row as unknown as MJIntegrationObjectFieldEntity;
}
