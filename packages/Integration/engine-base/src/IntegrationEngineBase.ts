import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, IMetadataProvider, UserInfo, RegisterForStartup } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type {
    MJIntegrationEntity,
    MJIntegrationSourceTypeEntity,
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJCompanyIntegrationSyncWatermarkEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import {
    CATALOG_FIELD_COLUMNS,
    CATALOG_OBJECT_COLUMNS,
    CompanyIntegrationObjectFieldRow,
    CompanyIntegrationObjectRow,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
    asReadOnlyField,
    asReadOnlyObject,
    projectCatalogFields,
    projectCatalogObjects,
} from './CompanyIntegrationCatalog.js';

/**
 * How a catalog read was answered. Returned alongside the rows so a caller — and a support
 * transcript — can tell a per-connection answer from the shared fallback without inferring it.
 */
export type CatalogSource = 'PerConnection' | 'Shared';

/** The resolved catalog for one connection. */
export interface ResolvedCompanyIntegrationCatalog {
    Objects: MJIntegrationObjectEntity[];
    FieldsByObjectID: Map<string, MJIntegrationObjectFieldEntity[]>;
    Source: CatalogSource;
    /** Count of per-connection objects by provenance. Empty when `Source` is `Shared`. */
    Provenance: { Declared: number; Endpoint: number; Sampled: number };
}

/**
 * IntegrationEngineBase provides cached metadata for the MJ integration subsystem.
 *
 * It extends BaseEngine to load and auto-refresh all integration-related entities
 * (Integrations, CompanyIntegrations, EntityMaps, FieldMaps, Watermarks, SourceTypes).
 *
 * This class is safe to use in both client (Angular) and server contexts.
 * For server-side orchestration (sync execution), use the full IntegrationEngine
 * from @memberjunction/integration-engine which wraps this base via composition.
 */
@RegisterForStartup()
export class IntegrationEngineBase extends BaseEngine<IntegrationEngineBase> {
    // ── Cached entity arrays ──────────────────────────────────────────
    private _integrations: MJIntegrationEntity[] = [];
    private _sourceTypes: MJIntegrationSourceTypeEntity[] = [];
    private _companyIntegrations: MJCompanyIntegrationEntity[] = [];
    private _entityMaps: MJCompanyIntegrationEntityMapEntity[] = [];
    private _fieldMaps: MJCompanyIntegrationFieldMapEntity[] = [];
    private _watermarks: MJCompanyIntegrationSyncWatermarkEntity[] = [];
    private _integrationObjects: MJIntegrationObjectEntity[] = [];
    private _integrationObjectFields: MJIntegrationObjectFieldEntity[] = [];
    /**
     * Lazily-built objectID → fields index backing {@link GetIntegrationObjectFields}, together
     * with the array it was built from. Identity comparison is the invalidation: the load
     * machinery and `SeedForTesting` both REPLACE `_integrationObjectFields` rather than mutating
     * it, so a different array means a stale index and it is rebuilt on the next read.
     */
    private _fieldsByObjectID: Map<string, MJIntegrationObjectFieldEntity[]> = new Map();
    private _fieldsByObjectIDSource: MJIntegrationObjectFieldEntity[] | null = null;
    /**
     * Second invalidation source for the field index. The index spans both field arrays, so
     * keying it on the shared array alone would leave it stale whenever only the per-connection
     * array reloaded — which is precisely what a discovery does.
     */
    private _fieldsByObjectIDScopedSource: CompanyIntegrationObjectFieldRow[] | null = null;

    /**
     * Per-connection catalog rows, loaded as plain `BaseEntity` because no generated subclass
     * exists for these entities — see CompanyIntegrationCatalog.ts. They are projected on first
     * read and the projections are what every read site receives.
     */
    private _companyIntegrationObjects: BaseEntity[] = [];
    private _companyIntegrationObjectFields: BaseEntity[] = [];

    /**
     * Lazily-built projections, invalidated exactly the way the field index is: by the identity of
     * the array they were built from. Every load path replaces these arrays rather than mutating
     * them, so a new array is a new projection with no invalidation hook to forget — which matters
     * because `RefreshCatalog` bypasses `AdditionalLoading` and would otherwise leave them stale.
     */
    private _cioProjected: CompanyIntegrationObjectRow[] | null = null;
    private _cioProjectedSource: BaseEntity[] | null = null;
    private _ciofProjected: CompanyIntegrationObjectFieldRow[] | null = null;
    private _ciofProjectedSource: BaseEntity[] | null = null;

    // ── BaseEngine Config ─────────────────────────────────────────────

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const params: Array<Partial<BaseEnginePropertyConfig>> = [
            {
                PropertyName: '_integrations',
                EntityName: 'MJ: Integrations',
                CacheLocal: true,
            },
            {
                PropertyName: '_sourceTypes',
                EntityName: 'MJ: Integration Source Types',
                CacheLocal: true,
            },
            {
                PropertyName: '_companyIntegrations',
                EntityName: 'MJ: Company Integrations',
                CacheLocal: true,
            },
            {
                PropertyName: '_entityMaps',
                EntityName: 'MJ: Company Integration Entity Maps',
                CacheLocal: true,
            },
            {
                PropertyName: '_fieldMaps',
                EntityName: 'MJ: Company Integration Field Maps',
                CacheLocal: true,
            },
            {
                PropertyName: '_watermarks',
                EntityName: 'MJ: Company Integration Sync Watermarks',
                CacheLocal: true,
            },
            {
                PropertyName: '_integrationObjects',
                EntityName: 'MJ: Integration Objects',
                CacheLocal: true,
            },
            {
                PropertyName: '_integrationObjectFields',
                EntityName: 'MJ: Integration Object Fields',
                CacheLocal: true,
            },
        ];

        // The per-connection catalog is loaded ONLY when its entities are actually registered.
        //
        // This is not defensive tidiness — without it the engine cannot start on a workspace that
        // has the code but not the migration. A configured dataset whose entity does not exist
        // fails its RunView; BaseEngine treats an unknown entity as readable ("let the normal
        // not-found handling apply"), so the failure is classified TRANSIENT, the property is left
        // `loadedSuccessfully: false`, and every Config()/EnsureLoaded() retries it forever. The
        // whole integration engine would sit permanently not-loaded, and the symptom would point
        // at the network rather than at a missing table.
        //
        // Being conditional also removes an ordering constraint from the rollout: the patch is safe
        // to deploy before the migration, and safe on a workspace that never receives it — those
        // read the shared catalog exactly as they do today, which is the default anyway.
        const md = provider ?? this.ProviderToUse;
        const registered = (name: string): boolean => {
            try {
                return !!md?.EntityByName(name);
            } catch {
                return false;
            }
        };
        if (registered(ENTITY_COMPANY_INTEGRATION_OBJECTS) && registered(ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS)) {
            params.push(
                { PropertyName: '_companyIntegrationObjects', EntityName: ENTITY_COMPANY_INTEGRATION_OBJECTS, CacheLocal: true },
                { PropertyName: '_companyIntegrationObjectFields', EntityName: ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, CacheLocal: true },
            );
        }

        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    /**
     * Re-read ONLY the IntegrationObject/IntegrationObjectField datasets, straight from the
     * database. `RefreshItem` will not do here: it reloads through the local dataset cache —
     * which is the very thing that goes stale when the catalog is edited by direct SQL, a
     * sproc-based sync push, or another process (BaseEngine's auto-refresh only sees
     * IN-PROCESS BaseEntity saves). Replacing the arrays is also what invalidates the memoised
     * views: the per-object field index and the connectors' GetCachedFields memo both key on
     * ARRAY IDENTITY, so they rebuild lazily on first read after the swap.
     */
    public async RefreshCatalog(contextUser?: UserInfo): Promise<void> {
        // All FOUR arrays, not just the shared pair. The two-pass discovery heal re-reads the
        // catalog mid-run and overlays what the first pass persisted; if the per-connection arrays
        // were left stale the second pass would overlay against rows that no longer exist and the
        // heal would silently regress for every per-connection row.
        // The per-connection pair is absent from Configs on a workspace without the migration —
        // the `if (cfg)` below is what makes that a no-op rather than a crash.
        for (const prop of [
            '_integrationObjects',
            '_integrationObjectFields',
            '_companyIntegrationObjects',
            '_companyIntegrationObjectFields',
        ]) {
            const cfg = this.Configs.find(c => c.PropertyName === prop);
            if (cfg) await this.LoadSingleConfig(cfg, (contextUser ?? this.ContextUser) as UserInfo, /*bypassCache*/ true);
        }
    }

    /**
     * After all entities are loaded, wire up cross-references so callers
     * can navigate the object graph without extra lookups.
     */
    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // Nothing to wire up yet — the getter helpers below handle
        // filtering on-demand. If we add extended entity classes with
        // child arrays (like AIEngineBase does with agent.Actions), we
        // would populate them here.
    }

    // ── Offline-replay seeding (v2 test harness) ─────────────────────

    /**
     * OFFLINE-REPLAY SEEDING (v2 — ARCHITECTURE_REFACTOR.md; test harnesses ONLY).
     *
     * Populates the engine cache from in-memory rows WITHOUT a database/provider, so the
     * credential-free replay tiers (T2/T3/T5/T6/T12) can exercise METADATA-DRIVEN connectors —
     * those whose `DiscoverObjects`/`FetchChanges`/capability getters resolve IOs from this
     * cache — exactly as they run in production. Without this, every metadata-driven connector
     * silently no-ops in the mock tiers (discovers 0 objects / throws on GetCachedObject), which
     * is one of the reasons the GrowthZone build's mock tiers proved so little (the v1
     * harness-reality gap; see the GZ PROBLEMS_LOG + the ORCID "T3-blind-to-Declared" class).
     *
     * Rows are plain objects shaped like the entity (property reads only — the replay tiers
     * never `.Save()` cache rows). NEVER call from production code paths.
     */
    public SeedForTesting(seed: {
        Integrations?: Array<Partial<MJIntegrationEntity>>;
        IntegrationObjects?: Array<Partial<MJIntegrationObjectEntity>>;
        IntegrationObjectFields?: Array<Partial<MJIntegrationObjectFieldEntity>>;
        CompanyIntegrations?: Array<Partial<MJCompanyIntegrationEntity>>;
        EntityMaps?: Array<Partial<MJCompanyIntegrationEntityMapEntity>>;
        FieldMaps?: Array<Partial<MJCompanyIntegrationFieldMapEntity>>;
        /**
         * Per-connection catalog rows, as LOADED rows rather than projections — they go through
         * `projectCatalogObjects`/`projectCatalogFields` exactly as the real load does, so a seed
         * that omits a required column fails the same way production would.
         */
        CompanyIntegrationObjects?: BaseEntity[];
        CompanyIntegrationObjectFields?: BaseEntity[];
    }): void {
        if (seed.Integrations) this._integrations = seed.Integrations as MJIntegrationEntity[];
        if (seed.IntegrationObjects) this._integrationObjects = seed.IntegrationObjects as MJIntegrationObjectEntity[];
        if (seed.IntegrationObjectFields) this._integrationObjectFields = seed.IntegrationObjectFields as MJIntegrationObjectFieldEntity[];
        if (seed.CompanyIntegrations) this._companyIntegrations = seed.CompanyIntegrations as MJCompanyIntegrationEntity[];
        if (seed.EntityMaps) this._entityMaps = seed.EntityMaps as MJCompanyIntegrationEntityMapEntity[];
        if (seed.FieldMaps) this._fieldMaps = seed.FieldMaps as MJCompanyIntegrationFieldMapEntity[];
        if (seed.CompanyIntegrationObjects) this._companyIntegrationObjects = seed.CompanyIntegrationObjects;
        if (seed.CompanyIntegrationObjectFields) this._companyIntegrationObjectFields = seed.CompanyIntegrationObjectFields;
    }

    // ── Public Accessors ──────────────────────────────────────────────

    /** All Integration definitions (e.g. YourMembership, HubSpot). */
    public get Integrations(): MJIntegrationEntity[] {
        return this._integrations;
    }

    /** All Integration Source Type definitions. */
    public get SourceTypes(): MJIntegrationSourceTypeEntity[] {
        return this._sourceTypes;
    }

    /** All CompanyIntegration records (company + integration + credentials). */
    public get CompanyIntegrations(): MJCompanyIntegrationEntity[] {
        return this._companyIntegrations;
    }

    /** All entity-level mapping configurations. */
    public get EntityMaps(): MJCompanyIntegrationEntityMapEntity[] {
        return this._entityMaps;
    }

    /** All field-level mapping configurations. */
    public get FieldMaps(): MJCompanyIntegrationFieldMapEntity[] {
        return this._fieldMaps;
    }

    /** All sync watermark records. */
    public get Watermarks(): MJCompanyIntegrationSyncWatermarkEntity[] {
        return this._watermarks;
    }

    /** All integration object definitions (external objects/endpoints per integration). */
    public get IntegrationObjects(): MJIntegrationObjectEntity[] {
        return this._integrationObjects;
    }

    /** All integration object field definitions. */
    public get IntegrationObjectFields(): MJIntegrationObjectFieldEntity[] {
        return this._integrationObjectFields;
    }

    // ── Convenience Lookup Methods ────────────────────────────────────

    /** Get a specific Integration by ID. */
    public GetIntegrationByID(integrationID: string): MJIntegrationEntity | undefined {
        return this._integrations.find(i => UUIDsEqual(i.ID, integrationID));
    }

    /** Get a specific Integration by name (case-insensitive). */
    public GetIntegrationByName(name: string): MJIntegrationEntity | undefined {
        const lower = name.trim().toLowerCase();
        return this._integrations.find(i => i.Name.trim().toLowerCase() === lower);
    }

    /** Get a specific CompanyIntegration by ID. */
    public GetCompanyIntegrationByID(companyIntegrationID: string): MJCompanyIntegrationEntity | undefined {
        return this._companyIntegrations.find(ci => UUIDsEqual(ci.ID, companyIntegrationID));
    }

    /** Get all CompanyIntegrations for a given Integration ID. */
    public GetCompanyIntegrationsByIntegrationID(integrationID: string): MJCompanyIntegrationEntity[] {
        return this._companyIntegrations.filter(ci => UUIDsEqual(ci.IntegrationID, integrationID));
    }

    /** Get all entity maps for a given CompanyIntegration ID. */
    public GetEntityMapsForCompanyIntegration(companyIntegrationID: string): MJCompanyIntegrationEntityMapEntity[] {
        return this._entityMaps.filter(em => UUIDsEqual(em.CompanyIntegrationID, companyIntegrationID));
    }

    /** Get all field maps for a given EntityMap ID. */
    public GetFieldMapsForEntityMap(entityMapID: string): MJCompanyIntegrationFieldMapEntity[] {
        return this._fieldMaps.filter(fm => UUIDsEqual(fm.EntityMapID, entityMapID));
    }

    /** Get the watermark for a given EntityMap ID and direction. */
    public GetWatermark(entityMapID: string, direction: 'Pull' | 'Push'): MJCompanyIntegrationSyncWatermarkEntity | undefined {
        return this._watermarks.find(
            w => UUIDsEqual(w.EntityMapID, entityMapID) && w.Direction === direction
        );
    }

    /** Get all enabled entity maps for a CompanyIntegration, sorted by Priority. */
    public GetEnabledEntityMaps(companyIntegrationID: string): MJCompanyIntegrationEntityMapEntity[] {
        return this.GetEntityMapsForCompanyIntegration(companyIntegrationID)
            .filter(em => em.SyncEnabled && em.Status === 'Active')
            .sort((a, b) => a.Priority - b.Priority);
    }

    /**
     * Get the Integration record associated with a CompanyIntegration.
     * Useful for resolving the connector class name, etc.
     */
    public GetIntegrationForCompanyIntegration(companyIntegrationID: string): MJIntegrationEntity | undefined {
        const ci = this.GetCompanyIntegrationByID(companyIntegrationID);
        if (!ci) return undefined;
        return this.GetIntegrationByID(ci.IntegrationID);
    }

    // ── Integration Object Lookups ──────────────────────────────────

    /**
     * Get all IntegrationObjects for a given Integration ID.
     *
     * SCOPE-AWARE. When a connection is in scope AND has a per-connection catalog, this answers
     * from that catalog; otherwise it answers exactly as it always has. The scoping lives HERE, on
     * the existing getters, rather than at the call sites — which is the only version that reaches
     * the connectors in the separate Integrations repository. Two of them call these getters
     * directly rather than going through the REST base, so a new method name would have left them
     * reading the shared catalog forever while every other path was per-connection.
     */
    public GetIntegrationObjectsByIntegrationID(integrationID: string): MJIntegrationObjectEntity[] {
        const scoped = this.scopedObjects();
        if (scoped) return scoped;
        return this._integrationObjects.filter(o => UUIDsEqual(o.IntegrationID, integrationID));
    }

    /**
     * The connection in scope's objects, or undefined when there is no scope or no per-connection
     * catalog for it. One place, so every getter below scopes identically.
     */
    private scopedObjects(): MJIntegrationObjectEntity[] | undefined {
        const ciID = IntegrationEngineBase.currentScope();
        if (!ciID || !this.HasCompanyIntegrationCatalog(ciID)) return undefined;
        return this.GetCompanyIntegrationObjects(ciID);
    }

    /** Get a specific IntegrationObject by integration ID and object name. SCOPE-AWARE. */
    public GetIntegrationObject(integrationID: string, objectName: string): MJIntegrationObjectEntity | undefined {
        const scoped = this.scopedObjects();
        // Once a connection HAS a per-connection catalog, a missing name means the object genuinely
        // is not in this connection's catalog. Falling back to the shared one there would resurrect
        // an object the connection does not have.
        if (scoped) return scoped.find(o => o.Name === objectName);
        return this._integrationObjects.find(
            o => UUIDsEqual(o.IntegrationID, integrationID) && o.Name === objectName
        );
    }

    /**
     * Get a specific IntegrationObject by its ID, from EITHER catalog.
     *
     * Id-polymorphic for exactly the reason `GetIntegrationObjectFields` is: object ids are UUIDs
     * from two disjoint tables and cannot collide, so the id itself says which catalog the caller
     * meant, and a caller holding an id needs no scope to resolve it. The field side was made
     * polymorphic and this one was not, which left a hole precisely where the two sides meet — a
     * parent object resolved through a per-connection FK edge.
     *
     * The hole, measured on the sandbox 2026-09-12: a connector's nested fetch resolves a child's
     * parent to a per-connection object id (`RelatedCompanyIntegrationObjectID`, surfaced on the
     * per-connection field as `RelatedIntegrationObjectID`), then asks for that object by id here.
     * The shared-only lookup returned undefined and `LoadParentIDs` threw
     * "Parent IntegrationObject not found: <id>" for EVERY child object — twenty of PheedLoop's
     * twenty-seven — so each of them fetched nothing while the run still reported success: 330 rows
     * where the same connector had synced about sixteen hundred. A parent that cannot be resolved
     * is the one case where an over-broad shared answer is not available as a fallback, because the
     * id is not in the shared table at all.
     *
     * Shared first, so a shared id costs exactly the scan it always did.
     */
    public GetIntegrationObjectByID(objectID: string): MJIntegrationObjectEntity | undefined {
        const shared = this._integrationObjects.find(o => UUIDsEqual(o.ID, objectID));
        if (shared) return shared;
        return this.GetCompanyIntegrationObjectByID(objectID);
    }

    /**
     * Get all fields for a given IntegrationObject ID.
     *
     * Backed by a lazily-built index. The unindexed form was a full scan of EVERY
     * IntegrationObjectField in the process, and this is called on per-record paths — a connector's
     * `RawToExternalRecord`/`TransformRecord` resolves an object's fields for every record it
     * transforms. On a catalog of 364 objects that scan, plus the generated `IntegrationObjectID`
     * getter it invokes per element, measured ~46% of process CPU in a live profile.
     *
     * The index is keyed on the identity of `_integrationObjectFields`, which the engine replaces
     * wholesale on load/refresh (and `SeedForTesting` replaces directly) — so a new array is a new
     * index automatically, with no invalidation hook to forget.
     *
     * Still returns a fresh array per call, so callers may sort or splice the result exactly as
     * before.
     */
    public GetIntegrationObjectFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        // Preserve the null/undefined semantics of the original UUIDsEqual comparison (both-null
        // matches) without giving the index a magic key — this path is vanishingly rare.
        if (objectID == null) {
            return this._integrationObjectFields.filter(f => UUIDsEqual(f.IntegrationObjectID, objectID));
        }

        // The index spans BOTH field arrays, so this one method answers for a shared object id and
        // a per-connection one alike. That is what lets the field side need no scope at all: object
        // ids are UUIDs from disjoint tables and cannot collide, so the id itself says which
        // catalog the caller meant. Every read site that resolves fields from an object it already
        // holds therefore needs no change.
        const projectedFields = this.CompanyIntegrationObjectFields;
        if (
            this._fieldsByObjectIDSource !== this._integrationObjectFields ||
            this._fieldsByObjectIDScopedSource !== projectedFields
        ) {
            const index = new Map<string, MJIntegrationObjectFieldEntity[]>();
            const add = (key: string | null | undefined, field: MJIntegrationObjectFieldEntity) => {
                if (key == null) return;
                // Normalised the same way UUIDsEqual compares, so SQL Server's uppercase and
                // PostgreSQL's lowercase land on the same bucket.
                const k = key.trim().toLowerCase();
                const bucket = index.get(k);
                if (bucket) bucket.push(field);
                else index.set(k, [field]);
            };
            for (const field of this._integrationObjectFields) add(field.IntegrationObjectID, field);
            // The per-connection view aliases CompanyIntegrationObjectID as IntegrationObjectID, so
            // both arrays key on the same property name and the loop body is identical.
            for (const field of projectedFields) add(field.IntegrationObjectID, asReadOnlyField(field));
            this._fieldsByObjectID = index;
            this._fieldsByObjectIDSource = this._integrationObjectFields;
            this._fieldsByObjectIDScopedSource = projectedFields;
        }

        return this._fieldsByObjectID.get(objectID.trim().toLowerCase())?.slice() ?? [];
    }

    /** Get active IntegrationObjects for an integration, sorted by Sequence. SCOPE-AWARE. */
    public GetActiveIntegrationObjects(integrationID: string): MJIntegrationObjectEntity[] {
        return this.GetIntegrationObjectsByIntegrationID(integrationID)
            .filter(o => o.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence);
    }

    /**
     * SHARED objects, ignoring any scope.
     *
     * Two callers need this and both would be WRONG with the scoped answer. The declared floor a
     * discovery overlays onto is by definition the shared, curated definition — reading the
     * per-connection rows there would make a discovery overlay its own previous output and lose
     * the link back to the declared row. And the Shared branch of
     * {@link ResolveCompanyIntegrationCatalog} was explicitly asked not to read per-connection rows.
     */
    public GetSharedIntegrationObjects(integrationID: string): MJIntegrationObjectEntity[] {
        return this._integrationObjects.filter(o => UUIDsEqual(o.IntegrationID, integrationID));
    }

    /** See {@link GetSharedIntegrationObjects}. Active only, sorted by Sequence. */
    public GetActiveSharedIntegrationObjects(integrationID: string): MJIntegrationObjectEntity[] {
        return this._integrationObjects
            .filter(o => UUIDsEqual(o.IntegrationID, integrationID) && o.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence);
    }

    /**
     * Builds a topologically-sorted processing order for integration objects
     * based on FK relationships between objects (RelatedIntegrationObjectID on fields).
     * Objects with no dependencies come first; objects depending on others come after their parents.
     *
     * @param integrationID - The integration to build the DAG for
     * @returns Objects sorted in dependency order (parents before children)
     */
    public GetObjectsInDependencyOrder(integrationID: string): MJIntegrationObjectEntity[] {
        // SCOPE-AWARE. Two connections of one connector can legitimately disagree about the shape
        // of this graph, because each edge is a field pointing at an object in the SAME catalog.
        const ciID = IntegrationEngineBase.currentScope();
        if (ciID && this.HasCompanyIntegrationCatalog(ciID)) {
            return this.GetCompanyIntegrationObjectsInDependencyOrder(ciID);
        }
        const objects = this.GetActiveIntegrationObjects(integrationID);
        const objectMap = new Map(objects.map(o => [o.ID.toUpperCase(), o]));

        // Build adjacency: object → set of object IDs it depends on
        const deps = new Map<string, Set<string>>();
        for (const obj of objects) {
            const key = obj.ID.toUpperCase();
            deps.set(key, new Set());
        }

        for (const field of this._integrationObjectFields) {
            if (!field.RelatedIntegrationObjectID) continue;
            const parentKey = field.IntegrationObjectID.toUpperCase();
            const depKey = field.RelatedIntegrationObjectID.toUpperCase();
            // Only track deps for objects in this integration
            if (deps.has(parentKey) && objectMap.has(depKey) && parentKey !== depKey) {
                deps.get(parentKey)!.add(depKey);
            }
        }

        // Kahn's algorithm for topological sort
        return this.topologicalSort(objects, deps);
    }

    /**
     * Kahn's algorithm: iteratively remove nodes with no remaining dependencies.
     */
    private topologicalSort(
        objects: MJIntegrationObjectEntity[],
        deps: Map<string, Set<string>>
    ): MJIntegrationObjectEntity[] {
        const sorted: MJIntegrationObjectEntity[] = [];
        const objectMap = new Map(objects.map(o => [o.ID.toUpperCase(), o]));
        const remaining = new Map(deps);

        while (remaining.size > 0) {
            // Find all objects with no remaining dependencies
            const ready: string[] = [];
            for (const [key, depSet] of remaining) {
                if (depSet.size === 0) ready.push(key);
            }

            if (ready.length === 0) {
                // Circular dependency — add remaining objects in Sequence order
                const leftover = [...remaining.keys()]
                    .map(k => objectMap.get(k)!)
                    .filter(Boolean)
                    .sort((a, b) => a.Sequence - b.Sequence);
                sorted.push(...leftover);
                break;
            }

            // Sort ready nodes by Sequence for stable ordering
            ready.sort((a, b) => {
                const objA = objectMap.get(a);
                const objB = objectMap.get(b);
                return (objA?.Sequence ?? 0) - (objB?.Sequence ?? 0);
            });

            for (const key of ready) {
                const obj = objectMap.get(key);
                if (obj) sorted.push(obj);
                remaining.delete(key);
                // Remove this object from other objects' dependency sets
                for (const depSet of remaining.values()) {
                    depSet.delete(key);
                }
            }
        }

        return sorted;
    }

    // ── Per-connection catalog ──────────────────────────────────────

    /**
     * Resolves the connection whose catalog a read belongs to, when one is in scope.
     *
     * Dependency inversion, deliberately: the scope itself is `AsyncLocalStorage`, which is a Node
     * built-in this package must not import — it is loaded into the Angular client too. So the
     * server package installs a resolver here at module load and the client never sets one, leaving
     * every read on the shared catalog exactly as before.
     *
     * Same shape as the custom-column promoter registration the server already installs.
     */
    public static CatalogScopeResolver: (() => string | undefined) | undefined = undefined;

    private static currentScope(): string | undefined {
        try {
            return IntegrationEngineBase.CatalogScopeResolver?.();
        } catch {
            // A scope lookup must never be able to fail a read. Falling back to the shared catalog
            // is the pre-existing behaviour, and it is the safe direction: a shared answer where a
            // per-connection one was wanted is over-broad, never wrong about what exists.
            return undefined;
        }
    }

    /** Per-connection objects, projected for reading. See CompanyIntegrationCatalog.ts. */
    private get CompanyIntegrationObjects(): CompanyIntegrationObjectRow[] {
        if (this._cioProjectedSource !== this._companyIntegrationObjects || this._cioProjected === null) {
            this._cioProjected = projectCatalogObjects(this._companyIntegrationObjects);
            this._cioProjectedSource = this._companyIntegrationObjects;
        }
        return this._cioProjected;
    }

    /** Per-connection fields, projected for reading. */
    private get CompanyIntegrationObjectFields(): CompanyIntegrationObjectFieldRow[] {
        if (this._ciofProjectedSource !== this._companyIntegrationObjectFields || this._ciofProjected === null) {
            this._ciofProjected = projectCatalogFields(this._companyIntegrationObjectFields);
            this._ciofProjectedSource = this._companyIntegrationObjectFields;
        }
        return this._ciofProjected;
    }

    /** Does this connection have a per-connection catalog at all? */
    public HasCompanyIntegrationCatalog(companyIntegrationID: string): boolean {
        return this.CompanyIntegrationObjects.some(o => UUIDsEqual(o.CompanyIntegrationID, companyIntegrationID));
    }

    /** All per-connection objects for a connection. */
    public GetCompanyIntegrationObjects(companyIntegrationID: string): MJIntegrationObjectEntity[] {
        return this.CompanyIntegrationObjects
            .filter(o => UUIDsEqual(o.CompanyIntegrationID, companyIntegrationID))
            .map(asReadOnlyObject);
    }

    /**
     * One per-connection object by name.
     *
     * Matches rows of EVERY status, `Disabled` included, because the overlay reactivates a
     * previously-absent object rather than inserting a second one — the unique constraint on
     * (connection, name) is what makes that necessary and what makes a name-match on active rows
     * only a constraint violation waiting to happen.
     */
    public GetCompanyIntegrationObject(companyIntegrationID: string, objectName: string): MJIntegrationObjectEntity | undefined {
        const row = this.CompanyIntegrationObjects.find(
            o => UUIDsEqual(o.CompanyIntegrationID, companyIntegrationID) && o.Name === objectName
        );
        return row ? asReadOnlyObject(row) : undefined;
    }

    /** One per-connection object by its own id. */
    public GetCompanyIntegrationObjectByID(objectID: string): MJIntegrationObjectEntity | undefined {
        const row = this.CompanyIntegrationObjects.find(o => UUIDsEqual(o.ID, objectID));
        return row ? asReadOnlyObject(row) : undefined;
    }

    /** Active per-connection objects, sorted by Sequence. Mirrors GetActiveIntegrationObjects. */
    public GetActiveCompanyIntegrationObjects(companyIntegrationID: string): MJIntegrationObjectEntity[] {
        return this.CompanyIntegrationObjects
            .filter(o => UUIDsEqual(o.CompanyIntegrationID, companyIntegrationID) && o.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence)
            .map(asReadOnlyObject);
    }

    /**
     * Per-connection dependency order. Same Kahn sort and same Sequence-order fallback on a cycle
     * as the shared version, over this connection's own edges: a field's
     * RelatedCompanyIntegrationObjectID points at an object belonging to the same connection, so
     * two connections of one connector can legitimately disagree about the shape of the graph.
     */
    public GetCompanyIntegrationObjectsInDependencyOrder(companyIntegrationID: string): MJIntegrationObjectEntity[] {
        const objects = this.GetActiveCompanyIntegrationObjects(companyIntegrationID);
        const objectMap = new Map(objects.map(o => [o.ID.toUpperCase(), o]));

        const deps = new Map<string, Set<string>>();
        for (const obj of objects) deps.set(obj.ID.toUpperCase(), new Set());

        for (const field of this.CompanyIntegrationObjectFields) {
            if (!field.RelatedCompanyIntegrationObjectID) continue;
            const parentKey = field.CompanyIntegrationObjectID.toUpperCase();
            const depKey = field.RelatedCompanyIntegrationObjectID.toUpperCase();
            if (deps.has(parentKey) && objectMap.has(depKey) && parentKey !== depKey) {
                deps.get(parentKey)!.add(depKey);
            }
        }

        return this.topologicalSort(objects, deps);
    }

    /**
     * THE CUTOVER SEAM. Every read that wants "this connection's catalog" comes through here, and
     * this is the one place that decides whether that means the per-connection tables or the shared
     * ones.
     *
     * With `preferPerConnection` false — the default at deploy — the answer is byte-for-byte what
     * the shared catalog returns today, so the tables can exist, be backfilled and be verified
     * against production traffic before anything reads them.
     *
     * @param opts.preferPerConnection  Read per-connection rows when they exist.
     * @param opts.requirePerConnection Refuse rather than fall back. Set it wherever a silent
     *   shared answer would be indistinguishable from success — a shared answer carries objects
     *   this connection never discovered and omits the ones only it has, and a sync would run on it
     *   reporting no error at all.
     */
    public ResolveCompanyIntegrationCatalog(
        companyIntegrationID: string,
        opts?: { preferPerConnection?: boolean; requirePerConnection?: boolean }
    ): ResolvedCompanyIntegrationCatalog {
        const wantPerConnection = opts?.preferPerConnection === true || opts?.requirePerConnection === true;
        const have = wantPerConnection && this.HasCompanyIntegrationCatalog(companyIntegrationID);

        if (opts?.requirePerConnection === true && !have) {
            throw new Error(
                `PER_CONNECTION_CATALOG_MISSING: connection ${companyIntegrationID} is configured for the `
                + `per-connection catalog but has no rows in ${ENTITY_COMPANY_INTEGRATION_OBJECTS}. `
                + `Run the catalog backfill for this connection, or set its catalog source back to shared. `
                + `Refusing rather than reading the shared catalog, which would silently sync a different `
                + `set of objects and report success.`
            );
        }

        const fieldsByObjectID = new Map<string, MJIntegrationObjectFieldEntity[]>();

        if (!have) {
            const ci = this.GetCompanyIntegrationByID(companyIntegrationID);
            const objects = ci ? this.GetActiveSharedIntegrationObjects(ci.IntegrationID) : [];
            for (const o of objects) fieldsByObjectID.set(o.ID, this.GetIntegrationObjectFields(o.ID));
            return {
                Objects: objects,
                FieldsByObjectID: fieldsByObjectID,
                Source: 'Shared',
                Provenance: { Declared: 0, Endpoint: 0, Sampled: 0 },
            };
        }

        const rows = this.CompanyIntegrationObjects
            .filter(o => UUIDsEqual(o.CompanyIntegrationID, companyIntegrationID) && o.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence);
        const provenance = { Declared: 0, Endpoint: 0, Sampled: 0 };
        for (const r of rows) {
            if (r.Provenance === 'Declared' || r.Provenance === 'Endpoint' || r.Provenance === 'Sampled') {
                provenance[r.Provenance]++;
            }
        }
        const objects = rows.map(asReadOnlyObject);
        for (const o of objects) fieldsByObjectID.set(o.ID, this.GetIntegrationObjectFields(o.ID));

        return { Objects: objects, FieldsByObjectID: fieldsByObjectID, Source: 'PerConnection', Provenance: provenance };
    }





    // ── Singleton ─────────────────────────────────────────────────────

    public static get Instance(): IntegrationEngineBase {
        return super.getInstance<IntegrationEngineBase>();
    }
}
