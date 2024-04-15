import { BaseInfo } from "./baseInfo";
import { EntityInfo } from "./entityInfo";
import { Metadata } from "./metadata";

/**
 * Metadata about a single stored query in the database.
 */
export class QueryInfo extends BaseInfo {
    public Name: string = null
    public Description: string  = null
    public CategoryID: number = null
    public SQL: string = null
    public OriginalSQL: string = null
    public Feedback: string = null
    public Status: 'Pending' | 'In-Review' | 'Approved' | 'Rejected' | 'Obsolete' = null
    public QualityRank: number = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

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
    public Name: string = null
    public ParentID: number = null
    public Description: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

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
    QueryID: number = null
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
    SourceEntityID: number = null
    SourceFieldName: string = null
    IsComputed: boolean = null
    ComputationDescription: string = null
    IsSummary: boolean = null
    SummaryDescription: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

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
    public QueryID: number = null
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