/**
 * Shared base interfaces for core query information.
 * These interfaces define the contract for query metadata that flows between
 * MemberJunction and external systems.
 *
 * Key design decisions:
 * - PascalCase property names for consistency with MJ conventions
 * - No timestamps or internal metadata that external systems typically don't need
 */

/**
 * Base interface for query field information.
 * Describes individual columns/fields returned by a query.
 */
export interface IQueryFieldInfoBase {
    /**
     * Unique identifier for this field record
     */
    ID: string;
    /**
     * Foreign key to the parent query
     */
    QueryID: string;
    /**
     * Name of the field as it appears in query results
     */
    Name: string;
    /**
     * Description of what this field represents
     */
    Description: string;
    /**
     * Display order of this field in query results
     */
    Sequence: number;
    /**
     * The base SQL type without parameters (e.g., "nvarchar", "decimal")
     */
    SQLBaseType: string;
    /**
     * The full SQL type including parameters (e.g., "nvarchar(100)", "decimal(18,2)")
     */
    SQLFullType: string;
    /**
     * Foreign key to the source entity this field comes from
     */
    SourceEntityID: string;
    /**
     * Name of the source entity
     */
    SourceEntity: string;
    /**
     * Name of the field in the source entity
     */
    SourceFieldName: string;
    /**
     * Whether this field is computed rather than directly selected
     */
    IsComputed: boolean;
    /**
     * Explanation of how this computed field is calculated
     */
    ComputationDescription: string;
    /**
     * Whether this field represents a summary/aggregate value
     */
    IsSummary: boolean;
    /**
     * Description of the summary calculation
     */
    SummaryDescription: string;
}

/**
 * Base interface for query parameter information.
 * Describes parameters that can be passed to parameterized queries.
 */
export interface IQueryParameterInfoBase {
    /**
     * Unique identifier for this parameter record
     */
    ID: string;
    /**
     * Foreign key to the parent query
     */
    QueryID: string;
    /**
     * The name of the parameter as it appears in the template (e.g., {{parameterName}})
     */
    Name: string;
    /**
     * Human-readable description of what this parameter is for
     */
    Description: string;
    /**
     * Data type of the parameter for validation and type casting
     */
    Type: string;
    /**
     * Whether this parameter must be provided when executing the query
     */
    IsRequired: boolean;
    /**
     * Default value to use when parameter is not provided
     */
    DefaultValue: string;
    /**
     * Example value demonstrating the proper format for this parameter
     */
    SampleValue: string;
    /**
     * JSON array of Nunjucks filter definitions for value transformation
     */
    ValidationFilters: string;
}

/**
 * Base interface for query entity information.
 * Tracks which MemberJunction entities are referenced by a query.
 */
export interface IQueryEntityInfoBase {
    /**
     * Unique identifier for this entity reference record
     */
    ID: string;
    /**
     * Foreign key to the parent query
     */
    QueryID: string;
    /**
     * Foreign key to the referenced entity
     */
    EntityID: string;
    /**
     * Name of the referenced entity
     */
    Entity: string;
}

/**
 * Base interface for query permission information.
 * Defines which roles can access/execute a query.
 */
export interface IQueryPermissionInfoBase {
    /**
     * Unique identifier for this permission record
     */
    ID: string;
    /**
     * Foreign key to the parent query
     */
    QueryID: string;
    /**
     * Foreign key to the role that has permission
     */
    RoleID: string;
    /**
     * Name of the role
     */
    Role: string;
}

/**
 * Base interface for query information shared between MJCore and external systems.
 * Contains the core metadata needed to understand and execute stored queries.
 */
export interface IQueryInfoBase {
    /**
     * Unique identifier for the query record
     */
    ID: string;
    /**
     * Name of the query for display and reference
     */
    Name: string;
    /**
     * Detailed description of what the query does and what data it returns
     */
    Description: string;
    /**
     * Foreign key reference to the Query Categories entity
     */
    CategoryID: string;
    /**
     * Category name from the related Query Categories entity
     */
    Category: string;
    /**
     * Full hierarchical path of the category (e.g., "/MJ/AI/Agents/")
     */
    CategoryPath: string;
    /**
     * The actual SQL query text to execute, may include Nunjucks template parameters
     */
    SQL: string;
    /**
     * Current status of the query in the approval workflow
     */
    Status: 'Pending' | 'In-Review' | 'Approved' | 'Rejected' | 'Obsolete';
    /**
     * Value indicating the quality of the query, higher values mean better quality
     */
    QualityRank: number;
    /**
     * When true, query results will be cached in memory with TTL expiration
     */
    CacheEnabled: boolean;
    /**
     * Time-to-live in minutes for cached query results. NULL uses default TTL.
     */
    CacheTTLMinutes: number | null;
    /**
     * Maximum number of cached result sets for this query. NULL uses default size limit.
     */
    CacheMaxSize: number | null;
    /**
     * SQL query that returns cache validation fingerprint data (MaxUpdatedAt, RowCount).
     * Used for smart cache refresh to determine if cached data is stale.
     */
    CacheValidationSQL: string | null;
    /**
     * Optional JSON-serialized embedding vector for similarity search
     */
    EmbeddingVector?: string | null;
    /**
     * The AI Model ID used to generate the embedding vector
     */
    EmbeddingModelID?: string | null;
    /**
     * The AI Model name used to generate the embedding vector
     */
    EmbeddingModelName?: string | null;
    /**
     * Field metadata for this query
     */
    Fields: IQueryFieldInfoBase[];
    /**
     * Parameter definitions for this parameterized query
     */
    Parameters: IQueryParameterInfoBase[];
    /**
     * Entities referenced by this query
     */
    Entities?: IQueryEntityInfoBase[];
}
