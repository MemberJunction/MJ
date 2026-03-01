import { BaseInfo } from "./baseInfo";
import { EntityInfo } from "./entityInfo";
import { Metadata } from "./metadata";
import { DatabasePlatform } from "./platformSQL";
import { PlatformVariantsJSON, ParsePlatformVariants, ResolvePlatformVariant } from "./platformVariants";
import { UserInfo } from "./securityInfo";
import { QueryCacheConfig } from "./QueryCacheConfig";
import { UUIDsEqual } from "@memberjunction/global";
import {
    IQueryInfoBase,
    IQueryFieldInfoBase,
    IQueryParameterInfoBase,
    IQueryEntityInfoBase,
    IQueryPermissionInfoBase
} from "./queryInfoInterfaces";

/**
 * Represents a SQL dialect (e.g., T-SQL, PostgreSQL) in the MemberJunction system.
 * Maps to the SQLDialect database table.
 */
export class SQLDialectInfo extends BaseInfo {
    /** Unique identifier for this SQL dialect */
    public ID: string = null
    /** Display name (e.g., 'T-SQL', 'PostgreSQL') */
    public Name: string = null
    /** Lowercase platform key matching DatabasePlatform type (e.g., 'sqlserver', 'postgresql') */
    public PlatformKey: string = null
    /** Database engine name (e.g., 'SQL Server', 'PostgreSQL') */
    public DatabaseName: string = null
    /** SQL language variant name (e.g., 'T-SQL', 'PL/pgSQL') */
    public LanguageName: string = null
    /** Primary vendor or organization */
    public VendorName: string = null
    /** URL to documentation or vendor website */
    public WebURL: string = null
    /** CSS class or icon reference for UI display */
    public Icon: string = null
    /** Detailed description */
    public Description: string = null
    /** Record creation timestamp */
    __mj_CreatedAt: Date = null
    /** Record last update timestamp */
    __mj_UpdatedAt: Date = null

    constructor(initData: unknown = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }
}

/**
 * Stores dialect-specific SQL for a query. Each record pairs a Query with a SQLDialect
 * and provides the SQL text written in that dialect.
 * Maps to the QuerySQL database table.
 */
export class QuerySQLInfo extends BaseInfo {
    /** Unique identifier */
    public ID: string = null
    /** Foreign key to the parent query */
    public QueryID: string = null
    /** Foreign key to the SQL dialect */
    public SQLDialectID: string = null
    /** The SQL query text in the specified dialect */
    public SQL: string = null
    /** Record creation timestamp */
    __mj_CreatedAt: Date = null
    /** Record last update timestamp */
    __mj_UpdatedAt: Date = null

    // virtual fields from view
    /** Query name from the related query */
    public Query: string = null
    /** SQL dialect name */
    public SQLDialect: string = null

    constructor(initData: unknown = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }

    /** Gets the parent query info */
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => UUIDsEqual(q.ID, this.QueryID));
    }

    /** Gets the SQL dialect info */
    get SQLDialectInfo(): SQLDialectInfo {
        return Metadata.Provider.SQLDialects.find(d => UUIDsEqual(d.ID, this.SQLDialectID));
    }
}

/**
 * Catalog of stored queries. This is useful for any arbitrary query that is known to be performant and correct and can be reused. 
 * Queries can be viewed/run by a user, used programatically via RunQuery, and also used by AI systems for improved reliability
 * instead of dynamically generated SQL. Queries can also improve security since they store the SQL instead of using dynamic SQL.
 */
export class QueryInfo extends BaseInfo implements IQueryInfoBase {
    /**
     * Unique identifier for the query record
     */
    public ID: string = null
    /**
     * Name of the query for display and reference
     */
    public Name: string = null
    /**
     * Detailed description of what the query does and what data it returns
     */
    public Description: string  = null
    /**
     * Foreign key reference to the Query Categories entity
     */
    public CategoryID: string = null
    /**
     * The actual SQL query text to execute, may include Nunjucks template parameters
     */
    public SQL: string = null
    /**
     * The original SQL before any optimization or modification, kept for reference and comparison
     */
    public OriginalSQL: string = null
    /**
     * User feedback on query accuracy, performance, or suggested improvements
     */
    public Feedback: string = null
    /**
     * Current status of the query in the approval workflow
     */
    public Status: 'Pending' | 'In-Review' | 'Approved' | 'Rejected' | 'Obsolete' = null
    /**
     * Value indicating the quality of the query, higher values mean better quality
     */
    public QualityRank: number = null
    /**
     * Automatically set to true when the SQL column contains Nunjucks template markers like {{paramName}}
     */
    public UsesTemplate: boolean = false
    /**
     * When true, all executions of this query will be logged to the Audit Log system for tracking and compliance
     */
    public AuditQueryRuns: boolean = false
    /**
     * When true, query results will be cached in memory with TTL expiration
     */
    public CacheEnabled: boolean = false
    /**
     * Time-to-live in minutes for cached query results. NULL uses default TTL.
     */
    public CacheTTLMinutes: number = null
    /**
     * Maximum number of cached result sets for this query. NULL uses default size limit.
     */
    public CacheMaxSize: number = null
    /**
     * SQL query that returns cache validation fingerprint data (MaxUpdatedAt, RowCount).
     * Used for smart cache refresh to determine if cached data is stale without fetching full results.
     * When provided, enables efficient server-side cache validation before sending full query results.
     *
     * The SQL should return exactly one row with two columns:
     * - MaxUpdatedAt: DATETIME - The maximum __mj_UpdatedAt timestamp from the underlying data
     * - RowCount: INT - The total number of rows that would be returned
     *
     * Example for a simple entity query:
     * ```sql
     * SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS RowCount FROM [schema].[EntityView]
     * ```
     *
     * For complex queries with filters/joins, the validation SQL should mirror the main query's
     * data scope but only return the fingerprint metrics.
     */
    public CacheValidationSQL: string = null
    /**
     * Date and time when this query record was created
     */
    __mj_CreatedAt: Date = null
    /**
     * Date and time when this query record was last updated
     */
    __mj_UpdatedAt: Date = null
    /**
     * Optional JSON-serialized embedding vector for the query, used for similarity search and query analysis
     */
    EmbeddingVector: string | null = null
    /**
     * The AI Model ID used to generate the embedding vector for this query. Required for vector similarity comparisons.
     */
    EmbeddingModelID: string | null = null
    /**
     * Foreign key to the SQL dialect this query's SQL column is written in.
     * Defaults to T-SQL for backward compatibility.
     */
    public SQLDialectID: string = null
    /**
     * JSON column containing platform-specific SQL variants for multi-database support.
     * Stores alternative SQL for platforms other than the default (typically SQL Server).
     * Parsed at runtime via GetPlatformSQL() and GetPlatformCacheValidationSQL().
     * @deprecated Use the QuerySQL child table via GetPlatformSQL() instead.
     */
    PlatformVariants: string | null = null

    // virtual fields - returned by the database VIEW
    /**
     * Category name from the related Query Categories entity
     */
    Category: string = null
    /**
     * The AI Model name used to generate the embedding vector
     */
    EmbeddingModel: string | null = null

    private _categoryPath: string | null = null;
    /**
     * Gets the full hierarchical path of this query's category (e.g., "/MJ/AI/Agents/").
     * This provides a unique filepath-like identifier for the category hierarchy.
     * Returns empty string if the query is not categorized.
     * @returns {string} The category path with leading and trailing slashes
     */
    get CategoryPath(): string {
        if (this._categoryPath === null) {
            this._categoryPath = this.buildCategoryPath();
        }
        return this._categoryPath;
    }

    private _cacheConfig: QueryCacheConfig | null = null;
    /**
     * Gets the cache configuration for this query.
     * If the query has no explicit cache config but category inheritance is enabled,
     * walks up the category tree to find inherited cache settings.
     * @returns {QueryCacheConfig | null} The cache configuration or null if caching is disabled
     */
    get CacheConfig(): QueryCacheConfig | null {
        // If we already built the config, return it
        if (this._cacheConfig !== null) {
            return this._cacheConfig;
        }

        // If caching is explicitly enabled on this query
        if (this.CacheEnabled) {
            this._cacheConfig = {
                enabled: true,
                ttlMinutes: this.CacheTTLMinutes || 60, // Default to 60 minutes
                maxCacheSize: this.CacheMaxSize || undefined,
                cacheKey: 'exact'
            };
            return this._cacheConfig;
        }

        // Check for inherited cache config from category
        if (this.CategoryInfo) {
            const inheritedConfig = this.getInheritedCacheConfig();
            if (inheritedConfig) {
                this._cacheConfig = inheritedConfig;
                return this._cacheConfig;
            }
        }

        // No caching configured
        this._cacheConfig = { enabled: false, ttlMinutes: 0 };
        return this._cacheConfig;
    }

    /**
     * Walks up the category hierarchy to find inherited cache configuration.
     * @returns {QueryCacheConfig | null} The inherited cache config or null if none found
     */
    private getInheritedCacheConfig(): QueryCacheConfig | null {
        let category = this.CategoryInfo;
        while (category) {
            if (category.DefaultCacheEnabled && category.CacheInheritanceEnabled) {
                return {
                    enabled: true,
                    ttlMinutes: category.DefaultCacheTTLMinutes || 60,
                    maxCacheSize: category.DefaultCacheMaxSize || undefined,
                    cacheKey: 'exact',
                    inheritFromCategory: true
                };
            }
            category = category.ParentCategoryInfo;
        }
        return null;
    }

    private _fields: QueryFieldInfo[] = null
    /**
     * Gets the field metadata for this query, including display names, data types, and formatting rules.
     * @returns {QueryFieldInfo[]} Array of field metadata for the query
     */
    public get Fields(): QueryFieldInfo[] {
        if (this._fields === null) {
            this._fields = Metadata.Provider.QueryFields.filter(f => f.QueryID === this.ID);
        }
        return this._fields;
    }

    /**
     * Gets the permissions that control access to this query, defining which users and roles can run it.
     * @returns {QueryPermissionInfo[]} Array of permission settings for the query
     */
    public get Permissions(): QueryPermissionInfo[] {
        return Metadata.Provider.QueryPermissions.filter(p => p.QueryID === this.ID);
    }

    private _parameters: QueryParameterInfo[] = null;
    /**
     * Gets the parameter definitions for this parameterized query if it uses Nunjucks templates.
     * Parameters include validation filters and metadata for type-safe query execution.
     * @returns {QueryParameterInfo[]} Array of parameter definitions for the query
     */
    public get Parameters(): QueryParameterInfo[] {
        if (this._parameters === null) {
            this._parameters = Metadata.Provider.QueryParameters.filter(p => p.QueryID === this.ID);
        }
        return this._parameters;
    }

    private _entities: QueryEntityInfo[] = null;
    /**
     * Gets the entities that are involved in this query, tracking which MemberJunction entities are referenced.
     * @returns {QueryEntityInfo[]} Array of entities used by the query
     */
    public get Entities(): QueryEntityInfo[] {
        if (this._entities === null) {
            this._entities = Metadata.Provider.QueryEntities.filter(e => e.QueryID === this.ID);
        }
        return this._entities;
    }
    
    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);

            // do some special handling to create class instances instead of just data objects
            // copy the Entity Field Values
            const f = initData.Fields || initData._Fields;
            if (f) {
                this._fields = []; // only set to blank array on constructor if we have fields provided, otherwise leave blank because we can later lazy load in the Fields() accessor getter method!
                for (let j = 0; j < f.length; j++) {
                    this._fields.push(new QueryFieldInfo(f));
                }
            }
        }
    }

    /**
     * Gets the category information for this query, supporting hierarchical organization.
     * @returns {QueryCategoryInfo} The category this query belongs to, or undefined if not categorized
     */
    get CategoryInfo(): QueryCategoryInfo {
        return Metadata.Provider.QueryCategories.find(c => UUIDsEqual(c.ID, this.CategoryID));
    }

    /**
     * Builds the hierarchical category path by walking up the parent chain.
     * @returns {string} The category path (e.g., "/MJ/AI/Agents/") or empty string if uncategorized
     */
    private buildCategoryPath(): string {
        if (!this.CategoryID) return '';
        
        const pathSegments: string[] = [];
        let currentCategory = this.CategoryInfo;
        
        // Walk up the hierarchy to build the path
        while (currentCategory) {
            pathSegments.unshift(currentCategory.Name);
            currentCategory = currentCategory.ParentCategoryInfo;
        }
        
        return pathSegments.length > 0 ? `/${pathSegments.join('/')}/` : '';
    }

    /**
     * Checks if a user has permission to run this query based on their roles.
     * A user can run a query if:
     * 1. The query has no permissions defined (open to all)
     * 2. The user has at least one role that is granted permission
     * 
     * @param user The user to check permissions for
     * @returns true if the user has permission to run the query
     */
    public UserHasRunPermissions(user: UserInfo): boolean {
        const permissions = this.Permissions;
        
        // If no permissions are defined, the query is open to all
        if (!permissions || permissions.length === 0) {
            return true;
        }

        // Check if user has any of the required roles
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
     * Checks if a user can run this query, considering both permissions and query status.
     * A query can be run if:
     * 1. The user has permission to run it (via UserHasRunPermissions)
     * 2. The query status is 'Approved'
     * 
     * @param user The user to check
     * @returns true if the user can run the query right now
     */
    public UserCanRun(user: UserInfo): boolean {
        // First check permissions
        if (!this.UserHasRunPermissions(user)) {
            return false;
        }

        // Then check status - only approved queries can be run
        return this.Status === 'Approved';
    }

    private _parsedVariants: PlatformVariantsJSON | null | undefined = undefined;
    /**
     * Lazily parses and caches the PlatformVariants JSON.
     */
    private get ParsedVariants(): PlatformVariantsJSON | null {
        if (this._parsedVariants === undefined) {
            this._parsedVariants = ParsePlatformVariants(this.PlatformVariants);
        }
        return this._parsedVariants;
    }

    /**
     * Resolves the SQL for a given database platform.
     * Resolution order:
     *   1. QuerySQL child table entry matching this query + platform's dialect
     *   2. PlatformVariants JSON (legacy approach)
     *   3. Base SQL property (the query's primary SQL)
     * @param platform - The target database platform
     * @returns The appropriate SQL string for the platform
     */
    public GetPlatformSQL(platform: DatabasePlatform): string {
        // 1. Check QuerySQL child table entries (normalized approach)
        const querySqlEntry = this.resolveQuerySQLForPlatform(platform);
        if (querySqlEntry) return querySqlEntry;

        // 2. Check PlatformVariants JSON (legacy approach)
        const variant = ResolvePlatformVariant(this.ParsedVariants, 'SQL', platform);
        if (variant) return variant;

        // 3. Fall back to base SQL
        return this.SQL;
    }

    /**
     * Looks up a QuerySQL entry for this query matching the given platform.
     * Uses the SQLDialect table to map platform keys to dialect IDs.
     */
    private resolveQuerySQLForPlatform(platform: DatabasePlatform): string | null {
        const provider = Metadata.Provider;
        if (!provider || !provider.SQLDialects || !provider.QuerySQLs) return null;

        const dialect = provider.SQLDialects.find(d => d.PlatformKey === platform);
        if (!dialect) return null;

        const entry = provider.QuerySQLs.find(
            qs => qs.QueryID === this.ID && qs.SQLDialectID === dialect.ID
        );
        return entry?.SQL ?? null;
    }

    /**
     * Resolves CacheValidationSQL for a given database platform.
     * Checks PlatformVariants first; falls back to the base CacheValidationSQL property.
     * @param platform - The target database platform
     * @returns The appropriate CacheValidationSQL string, or null if none configured
     */
    public GetPlatformCacheValidationSQL(platform: DatabasePlatform): string | null {
        const variant = ResolvePlatformVariant(this.ParsedVariants, 'CacheValidationSQL', platform);
        return variant ?? this.CacheValidationSQL;
    }
}

/**
 * Organizes saved queries into categories for discovery and management, supporting folder-like organization of queries.
 */
export class QueryCategoryInfo extends BaseInfo {
    /**
     * Unique identifier for the query category
     */
    public ID: string = null
    /**
     * Name of the category for organizing queries
     */
    public Name: string = null
    /**
     * Foreign key to parent category for hierarchical organization
     */
    public ParentID: string = null
    /**
     * Description of what types of queries belong in this category
     */
    public Description: string = null
    /**
     * Default cache setting for queries in this category
     */
    public DefaultCacheEnabled: boolean = false
    /**
     * Default TTL in minutes for cached results of queries in this category
     */
    public DefaultCacheTTLMinutes: number = null
    /**
     * Default maximum cache size for queries in this category
     */
    public DefaultCacheMaxSize: number = null
    /**
     * When true, queries without cache config will inherit from this category
     */
    public CacheInheritanceEnabled: boolean = true
    /**
     * Date and time when this category was created
     */
    __mj_CreatedAt: Date = null
    /**
     * Date and time when this category was last updated
     */
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    /**
     * Parent category name from the related category
     */
    Parent: string = null

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }

    /**
     * Gets the parent category information for hierarchical category organization.
     * @returns {QueryCategoryInfo} The parent category, or undefined if this is a top-level category
     */
    get ParentCategoryInfo(): QueryCategoryInfo {
        return Metadata.Provider.QueryCategories.find(c => UUIDsEqual(c.ID, this.ParentID));
    }

    /**
     * Gets all queries that belong to this category.
     * @returns {QueryInfo[]} Array of queries in this category
     */
    get Queries(): QueryInfo[] {
        return Metadata.Provider.Queries.filter(q => q.CategoryID === this.ID);
    }
}

/**
 * Stores field-level metadata for queries including display names, data types, and formatting rules for result presentation.
 */
export class QueryFieldInfo extends BaseInfo implements IQueryFieldInfoBase {
    /**
     * Name of the field as it appears in query results
     */
    Name: string = null
    /**
     * Foreign key to the parent query
     */
    QueryID: string = null
    /**
     * Description of what this field represents
     */
    Description: string = null
    /**
     * Display order of this field in query results
     */
    Sequence: number = null
    /**
     * The base type, not including parameters, in SQL. For example this field would be nvarchar or decimal, and wouldn't include type parameters. The SQLFullType field provides that information.
     */
    SQLBaseType: string = null
    /**
     * The full SQL type for the field, for example datetime or nvarchar(10) etc.
     */
    SQLFullType: string = null
    /**
     * Foreign key to the source entity this field comes from
     */
    SourceEntityID: string = null
    /**
     * Name of the field in the source entity
     */
    SourceFieldName: string = null
    /**
     * Whether this field is computed rather than directly selected from a table
     */
    IsComputed: boolean = null
    /**
     * Explanation of how this computed field is calculated
     */
    ComputationDescription: string = null
    /**
     * Whether this field represents a summary/aggregate value
     */
    IsSummary: boolean = null
    /**
     * Description of the summary calculation
     */
    SummaryDescription: string = null
    /**
     * Date and time when this field was created
     */
    __mj_CreatedAt: Date = null
    /**
     * Date and time when this field was last updated
     */
    __mj_UpdatedAt: Date = null
    /**
     * How this field was detected: AI (automatic) or Manual (user-specified)
     */
    DetectionMethod: 'AI' | 'Manual' = 'Manual'
    /**
     * Confidence score (0.00-1.00) when AI detection was used for this field
     */
    AutoDetectConfidenceScore: number = null

    // virtual fields - returned by the database VIEW
    /**
     * Source entity name if field is from an entity
     */
    SourceEntity: string = null

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }

    /**
     * Gets the entity information for the source entity this field comes from.
     * @returns {EntityInfo} The source entity metadata, or undefined if not linked to an entity
     */
    get SourceEntityInfo(): EntityInfo {
        return Metadata.Provider.Entities.find(e => UUIDsEqual(e.ID, this.SourceEntityID));
    }

    /**
     * Gets the query information this field belongs to.
     * @returns {QueryInfo} The parent query metadata
     */
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => UUIDsEqual(q.ID, this.ID));
    }
}


/**
 * Controls access to queries by defining which users and roles can run specific queries.
 */
export class QueryPermissionInfo extends BaseInfo implements IQueryPermissionInfoBase {
    /**
     * Foreign key to the query this permission applies to
     */
    public QueryID: string = null
    /**
     * Foreign key to the role that has permission
     */
    public RoleID: string = null

    // virtual fields - returned by the database VIEW
    /**
     * Name of the role that has permission to run this query
     */
    public Role: string = null
    /**
     * Query name from the related query
     */
    public Query: string = null

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }

    /**
     * Gets the query information this permission applies to.
     * @returns {QueryInfo} The query metadata this permission controls
     */
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => UUIDsEqual(q.ID, this.QueryID));
    }
}

/**
 * Tracks which entities are involved in a given query. The Queries table stores SQL and descriptions for stored queries
 * that can be executed and serve as examples for AI.
 */
export class QueryEntityInfo extends BaseInfo implements IQueryEntityInfoBase {
    /**
     * References the ID of the query in the Queries table
     */
    public QueryID: string = null
    /**
     * References the ID of the entity in the Entities table
     */
    public EntityID: string = null
    /**
     * How this entity association was detected: AI (automatic) or Manual (user-specified)
     */
    public DetectionMethod: 'AI' | 'Manual' = 'Manual'
    /**
     * Confidence score (0.00-1.00) when AI detection was used
     */
    public AutoDetectConfidenceScore: number = null
    /**
     * Date and time when this association was created
     */
    __mj_CreatedAt: Date = null
    /**
     * Date and time when this association was last updated
     */
    __mj_UpdatedAt: Date = null
    
    // virtual fields - returned by the database VIEW
    /**
     * Query name from the related query
     */
    Query: string = null
    /**
     * Entity name from the related entity
     */
    Entity: string = null
    
    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }
    
    /**
     * Gets the query information this entity relationship belongs to.
     * @returns {QueryInfo} The parent query metadata
     */
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => UUIDsEqual(q.ID, this.QueryID));
    }

    /**
     * Gets the entity information for the entity involved in this query.
     * @returns {EntityInfo} The entity metadata
     */
    get EntityInfo(): EntityInfo {
        return Metadata.Provider.Entities.find(e => UUIDsEqual(e.ID, this.EntityID));
    }
}

/**
 * Stores parameter definitions for parameterized queries that use Nunjucks templates. Each parameter represents a dynamic value 
 * that can be passed when executing the query. Parameters are automatically extracted from the query template by the MJQueryEntityServer 
 * using LLM analysis, or can be manually defined. The combination of parameter metadata and validation filters creates a 
 * self-documenting, type-safe query execution system.
 */
export class QueryParameterInfo extends BaseInfo implements IQueryParameterInfoBase {
    /**
     * Foreign key to the query this parameter belongs to
     */
    public QueryID: string = null
    /**
     * The name of the parameter as it appears in the Nunjucks template (e.g., {{parameterName}})
     */
    public Name: string = null
    /**
     * Data type of the parameter for validation and type casting
     */
    public Type: 'string' | 'number' | 'date' | 'boolean' | 'array' = null
    /**
     * Whether this parameter must be provided when executing the query
     */
    public IsRequired: boolean = false
    /**
     * Default value to use when parameter is not provided
     */
    public DefaultValue: string = null
    /**
     * Human-readable description of what this parameter is for
     */
    public Description: string = null
    /**
     * Example value demonstrating the proper format for this parameter
     */
    public SampleValue: string = null
    /**
     * JSON array of Nunjucks filter definitions for value transformation
     */
    public ValidationFilters: string = null
    /**
     * How this parameter was detected: AI (automatic) or Manual (user-specified)
     */
    public DetectionMethod: 'AI' | 'Manual' = 'Manual'
    /**
     * Confidence score (0.00-1.00) when AI detection was used
     */
    public AutoDetectConfidenceScore: number = null
    /**
     * Date and time when this parameter was created
     */
    __mj_CreatedAt: Date = null
    /**
     * Date and time when this parameter was last updated
     */
    __mj_UpdatedAt: Date = null
    
    // virtual field from view
    /**
     * Query name from the related query
     */
    Query: string = null
    
    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }
    
    /**
     * Gets the query information this parameter belongs to.
     * @returns {QueryInfo} The parent query metadata
     */
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => UUIDsEqual(q.ID, this.QueryID));
    }
    
    /**
     * Gets the parsed validation filters for this parameter.
     * Parses the JSON string of filter definitions into an array of filter objects.
     * @returns {any[]} Array of parsed filter definitions, or empty array if parsing fails
     */
    get ParsedFilters(): any[] {
        try {
            return this.ValidationFilters ? JSON.parse(this.ValidationFilters) : [];
        } catch {
            return [];
        }
    }
}