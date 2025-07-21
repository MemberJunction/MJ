import { BaseInfo } from "./baseInfo";
import { EntityInfo } from "./entityInfo";
import { Metadata } from "./metadata";

/**
 * Metadata about a single stored query in the database.
 */
export class QueryInfo extends BaseInfo {
    public ID: string = null
    public Name: string = null
    public Description: string  = null
    public CategoryID: string = null
    public SQL: string = null
    public OriginalSQL: string = null
    public Feedback: string = null
    public Status: 'Pending' | 'In-Review' | 'Approved' | 'Rejected' | 'Obsolete' = null
    public QualityRank: number = null
    public UsesTemplate: boolean = false
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    Category: string = null

    private _fields: QueryFieldInfo[] = null
    public get Fields(): QueryFieldInfo[] {
        if (this._fields === null) {
            this._fields = Metadata.Provider.QueryFields.filter(f => f.QueryID === this.ID);
        }
        return this._fields;
    }

    public get Permissions(): QueryPermissionInfo[] {
        return Metadata.Provider.QueryPermissions.filter(p => p.QueryID === this.ID);
    }

    private _parameters: QueryParameterInfo[] = null;
    public get Parameters(): QueryParameterInfo[] {
        if (this._parameters === null) {
            this._parameters = Metadata.Provider.QueryParameters.filter(p => p.QueryID === this.ID);
        }
        return this._parameters;
    }

    private _entities: QueryEntityInfo[] = null;
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

    get CategoryInfo(): QueryCategoryInfo {
        return Metadata.Provider.QueryCategories.find(c => c.ID === this.CategoryID);
    }
}

export class QueryCategoryInfo extends BaseInfo {
    public ID: string = null
    public Name: string = null
    public ParentID: string = null
    public Description: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    Parent: string = null

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }

    get ParentCategoryInfo(): QueryCategoryInfo {
        return Metadata.Provider.QueryCategories.find(c => c.ID === this.ParentID);
    }

    get Queries(): QueryInfo[] {
        return Metadata.Provider.Queries.filter(q => q.CategoryID === this.ID);
    }
}

export class QueryFieldInfo extends BaseInfo {
    Name: string = null
    QueryID: string = null
    Description: string = null
    Sequence: number = null
    /**
     * The base type, not including parameters, in SQL. For example this field would be nvarchar or decimal, and wouldn't include type parameters. The SQLFullType field provides that information.
     */
    SQLBaseType: string = null
    /**
     * The full SQL type for the field, for example datetime or nvarchar(10) etc.
     */
    SQLFullType: string = null
    SourceEntityID: string = null
    SourceFieldName: string = null
    IsComputed: boolean = null
    ComputationDescription: string = null
    IsSummary: boolean = null
    SummaryDescription: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    SourceEntity: string = null

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }

    get SourceEntityInfo(): EntityInfo {
        return Metadata.Provider.Entities.find(e => e.ID === this.SourceEntityID);
    }

    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => q.ID === this.ID);
    }
}


export class QueryPermissionInfo extends BaseInfo {
    public QueryID: string = null
    public RoleName: string = null

    // virtual fields - returned by the database VIEW
    Query: string = null

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }

    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => q.ID === this.QueryID);
    }
}

export class QueryEntityInfo extends BaseInfo {
    public QueryID: string = null
    public EntityID: string = null
    public Sequence: number = null
    public DetectionMethod: 'AI' | 'Manual' = 'Manual'
    public AutoDetectConfidenceScore: number = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null
    
    // virtual fields - returned by the database VIEW
    Query: string = null
    Entity: string = null
    
    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }
    
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => q.ID === this.QueryID);
    }
    
    get EntityInfo(): EntityInfo {
        return Metadata.Provider.Entities.find(e => e.ID === this.EntityID);
    }
}

export class QueryParameterInfo extends BaseInfo {
    public QueryID: string = null
    public Name: string = null
    public Type: 'string' | 'number' | 'date' | 'boolean' | 'array' = null
    public IsRequired: boolean = false
    public DefaultValue: string = null
    public Description: string = null
    public SampleValue: string = null
    public ValidationFilters: string = null
    public DetectionMethod: 'AI' | 'Manual' = 'Manual'
    public AutoDetectConfidenceScore: number = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null
    
    // virtual field from view
    Query: string = null
    
    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }
    
    get QueryInfo(): QueryInfo {
        return Metadata.Provider.Queries.find(q => q.ID === this.QueryID);
    }
    
    // Computed property for parsed filters
    get ParsedFilters(): any[] {
        try {
            return this.ValidationFilters ? JSON.parse(this.ValidationFilters) : [];
        } catch {
            return [];
        }
    }
}