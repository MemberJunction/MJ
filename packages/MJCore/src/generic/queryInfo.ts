import { BaseInfo } from "./baseInfo";
import { EntityInfo } from "./entityInfo";
import { Metadata } from "./metadata";

/**
 * Catalog of stored queries. This is useful for any arbitrary query that is known to be performant and correct and can be reused. 
 * Queries can be viewed/run by a user, used programatically via RunQuery, and also used by AI systems for improved reliability 
 * instead of dynamically generated SQL. Queries can also improve security since they store the SQL instead of using dynamic SQL.
 */
export class QueryInfo extends BaseInfo {
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
     * Date and time when this query record was created
     */
    __mj_CreatedAt: Date = null
    /**
     * Date and time when this query record was last updated
     */
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    /**
     * Category name from the related Query Categories entity
     */
    Category: string = null

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
            this._fields = [];
            const f = initData.Fields || initData._Fields;
            if (f) {
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
        return Metadata.Provider.QueryCategories.find(c => c.ID === this.CategoryID);
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
        return Metadata.Provider.QueryCategories.find(c => c.ID === this.ParentID);
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
export class QueryFieldInfo extends BaseInfo {
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
        return Metadata.Provider.Entities.find(e => e.ID === this.SourceEntityID);
    }

    /**
     * Gets the query information this field belongs to.
     * @returns {QueryInfo} The parent query metadata
     */
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => q.ID === this.ID);
    }
}


/**
 * Controls access to queries by defining which users and roles can run specific queries.
 */
export class QueryPermissionInfo extends BaseInfo {
    /**
     * Foreign key to the query this permission applies to
     */
    public QueryID: string = null
    /**
     * Name of the role that has permission to run this query
     */
    public RoleName: string = null

    // virtual fields - returned by the database VIEW
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
     * Gets the query information this permission applies to.
     * @returns {QueryInfo} The query metadata this permission controls
     */
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => q.ID === this.QueryID);
    }
}

/**
 * Tracks which entities are involved in a given query. The Queries table stores SQL and descriptions for stored queries 
 * that can be executed and serve as examples for AI.
 */
export class QueryEntityInfo extends BaseInfo {
    /**
     * References the ID of the query in the Queries table
     */
    public QueryID: string = null
    /**
     * References the ID of the entity in the Entities table
     */
    public EntityID: string = null
    /**
     * Order sequence for multiple entities in a query
     */
    public Sequence: number = null
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
        return Metadata.Provider.Queries.find(q => q.ID === this.QueryID);
    }
    
    /**
     * Gets the entity information for the entity involved in this query.
     * @returns {EntityInfo} The entity metadata
     */
    get EntityInfo(): EntityInfo {
        return Metadata.Provider.Entities.find(e => e.ID === this.EntityID);
    }
}

/**
 * Stores parameter definitions for parameterized queries that use Nunjucks templates. Each parameter represents a dynamic value 
 * that can be passed when executing the query. Parameters are automatically extracted from the query template by the QueryEntityServer 
 * using LLM analysis, or can be manually defined. The combination of parameter metadata and validation filters creates a 
 * self-documenting, type-safe query execution system.
 */
export class QueryParameterInfo extends BaseInfo {
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
        return Metadata.Provider.Queries.find(q => q.ID === this.QueryID);
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