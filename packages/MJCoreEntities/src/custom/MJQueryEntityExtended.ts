import { BaseEntity, UserInfo, QueryCacheConfig, IMetadataProvider, EntityInfo, FieldSecuritySQLGate, FieldSecurityViolation } from "@memberjunction/core";
import { IndexByUUID, RegisterClass, UUIDsEqual, SQLScreeningDialect } from "@memberjunction/global";
import {
    MJQueryEntity,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
    MJQueryEntityEntity,
    MJQueryPermissionEntity,
    MJQueryDependencyEntity,
    MJQueryCategoryEntity
} from "../generated/entity_subclasses";
import { QueryEngine } from "../engines/QueryEngine";
import type { DatabasePlatform } from "@memberjunction/core";

/** Options for {@link MJQueryEntityExtended.UserCanRunRenderedSQL}. */
export interface RenderedSQLCheckOptions {
    /**
     * The character offsets of the `*` of each projection star in the rendered SQL: a plain `*` or
     * `alias.*` select item whose columns reach the caller only as output columns. Such stars are
     * allowed; the denied columns they bring are dropped from the result by the caller.
     */
    ProjectionStarOffsets?: ReadonlySet<number>;
}

/** The result of {@link MJQueryEntityExtended.UserCanRunRenderedSQL}. */
export interface RenderedSQLCheckResult {
    /** Whether the user may run this rendering of the query. */
    canRun: boolean;
    /** Entities the SQL reads that the user may not read. Never shown to the user. */
    deniedEntities: string[];
    /** The field-level security finding behind a refusal, for logging. */
    fieldSecurityViolation?: FieldSecurityViolation;
    /**
     * True when the query may run but a projection star can bring a column the user is denied:
     * the caller must drop the denied columns from the rows before returning them.
     */
    needsColumnFiltering?: boolean;
}

/**
 * Extended query entity with child-relationship getters and business logic.
 * All child data reads through `QueryEngine`'s event-driven cache — always
 * fresh, no `provider.Refresh()` needed.
 *
 * Available on both client and server. Server-specific logic (embedding,
 * extraction pipeline, dialect conversion) lives in `MJQueryEntityServer`.
 */
@RegisterClass(BaseEntity, 'MJ: Queries')
export class MJQueryEntityExtended extends MJQueryEntity {

    // ─── Declared child collections (graph saves) ───────────────────────────────
    //
    // These three collections let a caller save a query together with child rows it declares
    // (hand-written parameters, fields and entity links) as ONE unit of work: the query row is
    // written first, then the declared children, inside one transaction. On the server,
    // `MJQueryEntityServer.Save` runs its extraction after `super.Save()` returns, so extraction
    // sees the declared children already written. On a client the whole graph travels to the server
    // and is saved there by the same code.
    //
    // They are NOT a read model: they start empty and load only on an explicit `Load()`. Reading a
    // query's current children goes through the cache-backed `QueryParameters`, `QueryFields` and
    // `QueryEntities` getters below. The companion names (`Parameters`, `Fields`, `Entities`) are
    // the keys metadata files use under `collections`; the properties carry a `Declared` prefix
    // because `BaseEntity.Fields` already names the entity's own field list.

    /** Parameters declared with this query in a graph save (companion name `Parameters`). */
    public readonly DeclaredParameters = this.DeclareRelatedRecords<MJQueryParameterEntity>({
        Name: 'Parameters',
        RelatedEntity: 'MJ: Query Parameters',
        RelatedEntityJoinField: 'QueryID',
        OrderBy: 'Name ASC',
        Load: 'explicit',
        Source: 'database',
        ReadOnly: false,
        OnRemove: 'delete',
    });

    /** Output fields declared with this query in a graph save (companion name `Fields`). */
    public readonly DeclaredFields = this.DeclareRelatedRecords<MJQueryFieldEntity>({
        Name: 'Fields',
        RelatedEntity: 'MJ: Query Fields',
        RelatedEntityJoinField: 'QueryID',
        OrderBy: 'Sequence ASC',
        Load: 'explicit',
        Source: 'database',
        ReadOnly: false,
        OnRemove: 'delete',
    });

    /** Entity links declared with this query in a graph save (companion name `Entities`). */
    public readonly DeclaredEntities = this.DeclareRelatedRecords<MJQueryEntityEntity>({
        Name: 'Entities',
        RelatedEntity: 'MJ: Query Entities',
        RelatedEntityJoinField: 'QueryID',
        Load: 'explicit',
        Source: 'database',
        ReadOnly: false,
        OnRemove: 'delete',
    });

    // ─── Child Relationship Getters (read-through from QueryEngine) ─────────────

    /** All field definitions for this query */
    public get QueryFields(): MJQueryFieldEntity[] {
        return QueryEngine.Instance.GetQueryFields(this.ID);
    }

    /** All parameter definitions for this query */
    public get QueryParameters(): MJQueryParameterEntity[] {
        return QueryEngine.Instance.GetQueryParameters(this.ID);
    }

    /** All entity associations for this query */
    public get QueryEntities(): MJQueryEntityEntity[] {
        return QueryEngine.Instance.QueryEntities.filter(e => UUIDsEqual(e.QueryID, this.ID));
    }

    /** All permission records for this query */
    public get QueryPermissions(): MJQueryPermissionEntity[] {
        return QueryEngine.Instance.GetQueryPermissions(this.ID);
    }

    /** All composition dependency records (queries this query references via {{query:"..."}} syntax) */
    public get QueryDependencies(): MJQueryDependencyEntity[] {
        return QueryEngine.Instance.Dependencies.filter(d => UUIDsEqual(d.QueryID, this.ID));
    }

    /** Queries that depend on (reference) this query via {{query:"..."}} syntax */
    public get QueryDependents(): MJQueryDependencyEntity[] {
        return QueryEngine.Instance.Dependencies.filter(d => UUIDsEqual(d.DependsOnQueryID, this.ID));
    }

    // ─── Category Navigation ────────────────────────────────────────────────────

    /** Gets the category entity for this query, or undefined if uncategorized */
    public get CategoryEntity(): MJQueryCategoryEntity | undefined {
        if (!this.CategoryID) return undefined;
        return QueryEngine.Instance.Categories.find(c => UUIDsEqual(c.ID, this.CategoryID));
    }

    private _categoryPath: string | null = null;

    /**
     * Gets the full hierarchical path of this query's category (e.g., "Ground-Truth-Queries/Sales").
     * Returns empty string if the query is not categorized.
     */
    public get CategoryPath(): string {
        if (this._categoryPath === null) {
            this._categoryPath = this.BuildCategoryPath(this.CategoryID);
        }
        return this._categoryPath;
    }

    /**
     * Builds a category path string from a CategoryID by walking up the category hierarchy.
     */
    public BuildCategoryPath(categoryID: string): string {
        if (!categoryID) return '';

        const categories = QueryEngine.Instance.Categories;
        const segments: string[] = [];
        let currentID: string | null = categoryID;

        while (currentID) {
            const cat = categories.find(c => UUIDsEqual(c.ID, currentID!));
            if (!cat) break;
            segments.unshift(cat.Name);
            currentID = cat.ParentID;
        }

        return segments.join('/');
    }

    // ─── Permission Checks ──────────────────────────────────────────────────────

    /**
     * Checks if a user has permission to run this query based on their roles.
     * A user can run a query if:
     * 1. The query has no permissions defined (open to all)
     * 2. The user has at least one role that is granted permission
     */
    public UserHasRunPermissions(user: UserInfo): boolean {
        const permissions = this.QueryPermissions;

        if (!permissions || permissions.length === 0) {
            return true;
        }

        if (user && user.UserRoles) {
            for (const userRole of user.UserRoles) {
                if (permissions.some(p => p.Role.trim().toLowerCase() === userRole.Role.trim().toLowerCase())) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Checks whether a user can run this query, considering query-level permissions,
     * entity-level read permissions, and composition dependencies (recursive).
     *
     * Permission logic:
     * 1. Check query-level run permissions (role-based)
     * 2. If the query has explicit Query Permissions, those take precedence for this
     *    query AND its composition dependencies (stored-procedure semantics)
     * 3. If no explicit Query Permissions, check entity read permissions for all
     *    referenced entities via the Query Entities bridge
     * 4. Recursively check all composition dependencies ({{query:"..."}})
     *
     * @param user The user to check permissions for
     * @param _visited Internal — tracks visited query IDs to prevent infinite loops in cyclic dependencies
     * @returns Object with canRun boolean and list of denied entity names
     */
    public UserCanRun(user: UserInfo, _visited?: Set<string>): { canRun: boolean; deniedEntities: string[] } {
        // Cycle guard
        const visited = _visited ?? new Set<string>();
        if (visited.has(this.ID)) {
            return { canRun: true, deniedEntities: [] };
        }
        visited.add(this.ID);

        // Step 1: Check query-level run permissions
        if (!this.UserHasRunPermissions(user)) {
            return { canRun: false, deniedEntities: [] };
        }

        const deniedEntities: string[] = [];
        const queryEntities = this.QueryEntities;
        const md = this.ProviderToUse as unknown as IMetadataProvider;

        // Step 1b: Any referenced AlternateBaseView that is disabled or missing cannot execute
        // regardless of whether the query has explicit QueryPermissions (stored-procedure semantics
        // do not re-enable a disabled SQL view whose SELECT grant was revoked).
        if (queryEntities && queryEntities.length > 0) {
            for (const qe of queryEntities) {
                if (!qe.AlternateBaseViewID) continue;
                const entityInfo = md.EntityByID(qe.EntityID);
                if (!entityInfo) continue;
                const abv = IndexByUUID(entityInfo.AlternateBaseViews ?? []).Get(qe.AlternateBaseViewID);
                if (!abv || !abv.IsUsable) {
                    const label = abv?.Name ?? qe.AlternateBaseView ?? qe.AlternateBaseViewID;
                    deniedEntities.push(`${entityInfo.Name} (AlternateBaseView '${label}' is unavailable)`);
                }
            }
            if (deniedEntities.length > 0) {
                return { canRun: false, deniedEntities };
            }
        }

        // Step 2: Explicit Query Permissions override entity checks for this query
        // and all its dependencies (stored-procedure semantics)
        const permissions = this.QueryPermissions;
        if (permissions && permissions.length > 0) {
            return { canRun: true, deniedEntities: [] };
        }

        // Step 3: No explicit permissions — check entity read access
        if (queryEntities && queryEntities.length > 0) {
            for (const qe of queryEntities) {
                const entityInfo = md.EntityByID(qe.EntityID);
                if (!entityInfo) continue;  // Stale reference — skip

                const perms = entityInfo.GetUserPermisions(user);
                if (!perms || !perms.CanRead) {
                    deniedEntities.push(entityInfo.Name);
                }
            }
        }

        // Step 4: Recursively check composition dependencies
        const dependencies = this.QueryDependencies;
        if (dependencies && dependencies.length > 0) {
            const allQueries = QueryEngine.Instance.Queries;
            for (const dep of dependencies) {
                const depQuery = allQueries.find(q => UUIDsEqual(q.ID, dep.DependsOnQueryID));
                if (!depQuery) continue;  // Dependency not found — skip

                const depResult = depQuery.UserCanRun(user, visited);
                if (!depResult.canRun) {
                    return { canRun: false, deniedEntities: [...deniedEntities, ...depResult.deniedEntities] };
                }
                deniedEntities.push(...depResult.deniedEntities);
            }
        }

        return { canRun: deniedEntities.length === 0, deniedEntities };
    }

    /**
     * SECURITY — the run-time half of {@link UserCanRun}: the checks that need the SQL a run will
     * actually execute, after composition and template rendering. Call it with that SQL in addition
     * to {@link UserCanRun}, never instead of it.
     *
     * 1. A query with `MJ: Query Permissions` rows is authorized by its role list alone: a user who
     *    holds one of those roles may run it whatever it reads (definer's rights, like an EXECUTE
     *    grant on a stored procedure), and one who holds none may not. Field-level security does
     *    not apply to it.
     * 2. Otherwise every entity whose base view or base table the SQL reads as a relation must be
     *    readable by the user ({@link FieldSecuritySQLGate.RelationEntities}). These come from the
     *    SQL, so a query whose `QueryEntities` rows are missing or stale is still checked. SQL that
     *    cannot be read is refused for a user who cannot read every entity in the catalog.
     * 3. The SQL must not name a field the user is denied anywhere: the select list, WHERE, JOIN,
     *    GROUP BY, ORDER BY or HAVING, inside expressions and aggregates, through a CTE. A
     *    whole-row construct (`DISTINCT *`, set operations, `FOR JSON`, `row_to_json`, `NATURAL
     *    JOIN`, …) over an entity the user is denied a field on, and SQL that cannot be read, are
     *    refused too ({@link FieldSecuritySQLGate.FindViolation}). So is a relation that is not a
     *    CTE or a catalog entity's base view or base table, whose reads cannot be checked. A user
     *    denied no field on any entity is not scanned.
     * 4. A plain `*` or `alias.*` that a structural reading of the statement has shown reaches the
     *    caller only as output columns (`options.ProjectionStarOffsets`) is not refused. The result
     *    then reports `needsColumnFiltering` when the user is denied a field on an entity the SQL
     *    reads: the caller must run the query and drop the denied columns from its rows.
     *
     * The result never names a denied field, so a refusal says only that the query cannot be run.
     * `QueryFields` metadata plays no part: it is documentation, not a security source.
     *
     * @param user The user the query runs for
     * @param renderedSQL The SQL the run will execute
     * @param catalog Every entity the executing provider knows
     * @param dialect The database dialect the SQL runs under
     * @param options The projection stars of `renderedSQL`, when the caller has read them
     */
    public UserCanRunRenderedSQL(
        user: UserInfo,
        renderedSQL: string,
        catalog: readonly EntityInfo[],
        dialect: SQLScreeningDialect,
        options?: RenderedSQLCheckOptions,
    ): RenderedSQLCheckResult {
        const permissions = this.QueryPermissions;
        if (permissions && permissions.length > 0) {
            return { canRun: this.UserHasRunPermissions(user), deniedEntities: [] };
        }
        const read = FieldSecuritySQLGate.RelationEntities(renderedSQL, catalog, dialect);
        if (read === null && catalog.some(e => !e.GetUserPermisions(user)?.CanRead)) {
            const unreadable: FieldSecurityViolation = { Kind: 'Unresolvable', Reference: 'the SQL could not be read', Entity: null };
            return { canRun: false, deniedEntities: [], fieldSecurityViolation: unreadable };
        }
        const deniedEntities = (read ?? []).filter(e => !e.GetUserPermisions(user)?.CanRead).map(e => e.Name);
        if (deniedEntities.length > 0) {
            return { canRun: false, deniedEntities };
        }
        const readEntities = [...this.declaredEntities(catalog), ...(read ?? [])];
        const stars = options?.ProjectionStarOffsets;
        const violation = FieldSecuritySQLGate.FindViolation(renderedSQL, {
            User: user,
            Dialect: dialect,
            Catalog: catalog,
            ReadEntities: readEntities,
            RefuseUnknownRelations: true,
            ProjectionStarOffsets: stars,
        });
        if (violation) {
            return { canRun: false, deniedEntities: [], fieldSecurityViolation: violation };
        }
        const needsColumnFiltering = !!stars && stars.size > 0 && FieldSecuritySQLGate.UserCarriesDenials(readEntities, user);
        return { canRun: true, deniedEntities: [], needsColumnFiltering };
    }

    /** The catalog entities this query's `QueryEntities` rows name; stale rows are left out. */
    private declaredEntities(catalog: readonly EntityInfo[]): EntityInfo[] {
        const queryEntities = this.QueryEntities ?? [];
        if (queryEntities.length === 0) return [];
        const byID = IndexByUUID(catalog);
        const declared: EntityInfo[] = [];
        for (const qe of queryEntities) {
            const entity = byID.Get(qe.EntityID);
            if (entity) declared.push(entity);
        }
        return declared;
    }

    // ─── Status Checks ──────────────────────────────────────────────────────────

    /** Whether this query has been formally approved for production use */
    public get IsApproved(): boolean {
        return this.Status === 'Approved';
    }

    /**
     * Whether this query can be referenced by other queries via composition syntax.
     * A query is composable only when both Reusable=true and Status='Approved'.
     */
    public get IsComposable(): boolean {
        return this.Reusable && this.IsApproved;
    }

    // ─── Platform SQL Resolution ────────────────────────────────────────────────

    /**
     * Resolves the SQL for a given database platform.
     * Resolution order:
     *   1. QuerySQL child table entry matching this query + platform's dialect
     *   2. Base SQL property (the query's primary SQL)
     */
    public GetPlatformSQL(platform: DatabasePlatform): string {
        const qe = QueryEngine.Instance;

        const dialect = qe.SQLDialects.find(d => d.PlatformKey === platform);
        if (dialect) {
            const entry = qe.QuerySQLs.find(
                qs => UUIDsEqual(qs.QueryID, this.ID) && UUIDsEqual(qs.SQLDialectID, dialect.ID)
            );
            if (entry?.SQL) return entry.SQL;
        }

        return this.SQL;
    }

    // ─── Cache Configuration ────────────────────────────────────────────────────

    private _cacheConfig: QueryCacheConfig | null = null;

    /**
     * Gets the cache configuration for this query.
     * If the query has no explicit cache config but category inheritance is enabled,
     * walks up the category tree to find inherited cache settings.
     */
    public get CacheConfig(): QueryCacheConfig {
        if (this._cacheConfig !== null) {
            return this._cacheConfig;
        }

        if (this.CacheEnabled) {
            this._cacheConfig = {
                enabled: true,
                ttlMinutes: this.CacheTTLMinutes || 60,
                maxCacheSize: this.CacheMaxSize || undefined,
                cacheKey: 'exact'
            };
            return this._cacheConfig;
        }

        const inherited = this.getInheritedCacheConfig();
        if (inherited) {
            this._cacheConfig = inherited;
            return this._cacheConfig;
        }

        this._cacheConfig = { enabled: false, ttlMinutes: 0 };
        return this._cacheConfig;
    }

    private getInheritedCacheConfig(): QueryCacheConfig | null {
        const categories = QueryEngine.Instance.Categories;
        let catID = this.CategoryID;

        while (catID) {
            const cat = categories.find(c => UUIDsEqual(c.ID, catID!));
            if (!cat) break;

            if (cat.DefaultCacheEnabled && cat.CacheInheritanceEnabled) {
                return {
                    enabled: true,
                    ttlMinutes: cat.DefaultCacheTTLMinutes || 60,
                    maxCacheSize: cat.DefaultCacheMaxSize || undefined,
                    cacheKey: 'exact',
                    inheritFromCategory: true
                };
            }
            catID = cat.ParentID;
        }
        return null;
    }
}
