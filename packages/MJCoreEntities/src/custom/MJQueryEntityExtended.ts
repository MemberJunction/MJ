import { BaseEntity, UserInfo, QueryCacheConfig } from "@memberjunction/core";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
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
     * Checks if a user can run this query based on permissions.
     * Non-approved queries are allowed to execute (with a server-side warning)
     * to enable testing before formal approval.
     */
    public UserCanRun(user: UserInfo): boolean {
        return this.UserHasRunPermissions(user);
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
