import { BaseInfo } from "./baseInfo"
import { Metadata } from "./metadata"
import { RunViewParams } from "../views/runView"
import { BaseEntity } from "./baseEntity"
import { RowLevelSecurityFilterInfo, UserInfo, UserRoleInfo } from "./securityInfo"
import { TypeScriptTypeFromSQLType, SQLFullType, SQLMaxLength, FormatValue } from "./util"
import { LogError } from "./logging"
import { CompositeKey } from "./interfaces"

/**
 * The possible status values for a record change
 */
export const RecordChangeStatus = {
    Pending: 'Pending',
    Complete: 'Complete',
    Error: 'Error',
} as const;

export type RecordChangeStatus = typeof RecordChangeStatus[keyof typeof RecordChangeStatus];


/**
 * Record Change object has information on a change to a record in the Record Changes entity
 */
export class RecordChange extends BaseInfo {
    EntityID: number = null
    RecordID: any = null
    ChangedAt: Date = null
    ChangesJSON: string = null
    ChangesDescription: string = null
    FullRecordJSON: string = null
    Status: string = null
    
    get StatusValue(): RecordChangeStatus {
        return RecordChangeStatus[this.Status?.trim()]
    }

    get Changes(): any {
        return JSON.parse(this.ChangesJSON)
    }

    get FullRecord(): any {
        return JSON.parse(this.FullRecordJSON)
    }

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

/**
 * Information about the Entity Relationship between the Entity and the Related Entity - this class
 * maps to information in the Entity Relationships metadata entity.
 */
export class EntityRelationshipInfo extends BaseInfo  {
    EntityID: number = null 
    Sequence: number = null
    RelatedEntityID: number = null
    BundleInAPI: boolean = null
    IncludeInParentAllQuery: boolean = null
    Type: string = null 
    EntityKeyField: string = null
    RelatedEntityJoinField: string = null
    JoinView: string = null 
    JoinEntityJoinField: string = null  
    JoinEntityInverseJoinField: string = null     
    DisplayInForm: boolean = null
    DisplayName: string = null
    DisplayUserViewGUID: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    Entity: string = null 
    EntityBaseTable: string = null 
    EntityBaseView: string = null 
    RelatedEntity: string = null  
    RelatedEntityBaseTable: string = null 
    RelatedEntityBaseView: string = null 
    RelatedEntityCodeName: string = null
    RelatedEntityClassName: string = null
    RelatedEntityBaseTableCodeName: string = null
    DisplayUserViewName: string = null
    DisplayUserViewID: number = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

export const EntityPermissionType = {
    Read: 'Read',
    Create: 'Create',
    Update: 'Update',
    Delete: 'Delete',
} as const;

export type EntityPermissionType = typeof EntityPermissionType[keyof typeof EntityPermissionType];


export class EntityUserPermissionInfo {
    Entity: EntityInfo;
    User: UserInfo;
    CanCreate: boolean;
    CanRead: boolean;
    CanUpdate: boolean;
    CanDelete: boolean;   
}

export class EntityPermissionInfo extends BaseInfo{
    EntityID: number = null
    RoleName: string = null
    CanCreate: boolean = null
    CanRead: boolean = null
    CanUpdate: boolean = null
    CanDelete: boolean = null
    ReadRLSFilterID: number = null
    CreateRLSFilterID: number = null
    UpdateRLSFilterID: number = null
    DeleteRLSFilterID: number = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    Entity: string = null
    RoleSQLName: string = null
    ReadRLSFilter: string = null
    CreateRLSFilter: string = null
    UpdateRLSFilter: string = null
    DeleteRLSFilter: string = null

    get CreateRLSFilterObject(): RowLevelSecurityFilterInfo {
        return this.RLSFilter(EntityPermissionType.Create)
    }
    get ReadRLSFilterObject(): RowLevelSecurityFilterInfo {
        return this.RLSFilter(EntityPermissionType.Read)
    }
    get UpdateRLSFilterObject(): RowLevelSecurityFilterInfo {
        return this.RLSFilter(EntityPermissionType.Update)
    }
    get DeleteRLSFilterObject(): RowLevelSecurityFilterInfo {
        return this.RLSFilter(EntityPermissionType.Delete)
    }

    public RLSFilter(type: EntityPermissionType): RowLevelSecurityFilterInfo {
        let fID: number = 0;

        switch (type) {
            case EntityPermissionType.Read:
                fID = this.ReadRLSFilterID;
                break;
            case EntityPermissionType.Create:
                fID = this.CreateRLSFilterID;
                break;
            case EntityPermissionType.Update:
                fID = this.UpdateRLSFilterID;
                break;
            case EntityPermissionType.Delete:
                fID = this.DeleteRLSFilterID;
                break;
        }
        if (fID > 0) 
            return Metadata.Provider.RowLevelSecurityFilters.find(f => f.ID === fID);
    }

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

export const EntityFieldTSType = {
    String: 'string',
    Number: 'number',
    Date: 'Date',
    Boolean: 'boolean',
} as const;

export type EntityFieldTSType = typeof EntityFieldTSType[keyof typeof EntityFieldTSType];

export const EntityFieldGraphQLType = {
    Int: 'Int',
    Float: 'Float',
    String: 'String',
    Boolean: 'Boolean',
    Timestamp: 'Timestamp',
} as const;

export type EntityFieldGraphQLType = typeof EntityFieldGraphQLType[keyof typeof EntityFieldGraphQLType];


export const EntityFieldValueListType = {
    None: 'None',
    List: 'List',
    ListOrUserEntry: 'ListOrUserEntry',
} as const;

export type EntityFieldValueListType = typeof EntityFieldValueListType[keyof typeof EntityFieldValueListType];


export class EntityFieldValueInfo extends BaseInfo {
    EntityID: number = null
    EntityFieldName: string = null
    Sequence: number = null
    Value: string = null
    Code: string = null
    Description: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

export const GeneratedFormSectionType = {
    Top: 'Top',
    Details: 'Details',
    Category: 'Category',
} as const;

export type GeneratedFormSectionType = typeof GeneratedFormSectionType[keyof typeof GeneratedFormSectionType];


/**
 * Field information within an entity - object models data from the Entity Fields entity in the metadata
 */
export class EntityFieldInfo extends BaseInfo {
    /**
     * Foreign key to the Entities entity.
     */
    EntityID: number = null
    /**
     * The sequence of the field within the entity, typically the intended display order
     */
    Sequence: number = null 
    Name: string = null 
    /**
     * Optional property that provides the display name for the field, if null, use the Name property.
     * The DisplayNameOrName() method is a helper function that does this for you with a single method call.
     */
    DisplayName: string = null 
    Description: string = null 
    /**
     * If true, the field is the primary key for the entity. There must be one primary key field per entity.
     */
    IsPrimaryKey: boolean = null
    /**
     * If true, the field is a unique key for the entity. There can be zero to many unique key fields per entity.
     */
    IsUnique: boolean = null
    Category: string = null
    Type: string = null
    Length: number = null 
    Precision: number = null 
    Scale: number = null 
    AllowsNull: boolean = null
    DefaultValue: string = null
    AutoIncrement: boolean = null
    ValueListType: string = null
    ExtendedType: string = null
    DefaultInView: boolean = null 
    ViewCellTemplate: string = null
    DefaultColumnWidth: number = null 
    AllowUpdateAPI: boolean = null
    AllowUpdateInView: boolean = null
    IncludeInUserSearchAPI: boolean = null
    FullTextSearchEnabled: boolean = false
    UserSearchParamFormatAPI: string = null
    IncludeInGeneratedForm: boolean = null
    GeneratedFormSection: string = null
    IsVirtual: boolean = null 
    IsNameField: boolean = null 
    RelatedEntityID: number = null
    RelatedEntityFieldName: string = null
    IncludeRelatedEntityNameFieldInBaseView: boolean = null
    RelatedEntityNameFieldMap: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null
    
    // virtual fields - returned by the database VIEW
    Entity: string = null 
    SchemaName: string = null
    BaseTable: string = null 
    BaseView: string = null 
    EntityCodeName: string = null
    EntityClassName: string = null
    RelatedEntity: string = null 
    RelatedEntitySchemaName: string = null 
    RelatedEntityBaseTable: string = null 
    RelatedEntityBaseView: string = null 
    RelatedEntityCodeName: string = null 
    RelatedEntityClassName: string = null 

    // These are not in the database view and are added in code
    IsFloat: boolean
    _RelatedEntityTableAlias: string
    _RelatedEntityNameFieldIsVirtual: boolean
    _EntityFieldValues: EntityFieldValueInfo[];
    _RelatedEntityNameFieldMap: string

    get EntityFieldValues(): EntityFieldValueInfo[] {
        return this._EntityFieldValues;
    }

    /**
     * Returns the ValueListType using the EntityFieldValueListType enum.
     */
    get ValueListTypeEnum(): EntityFieldValueListType {
        if (this.ValueListType == null)
            return EntityFieldValueListType.None;
        else  {
            // iterate through list of possibilities from enum and compare lcase
            for (let enumMember in EntityFieldValueListType) {
                if (typeof EntityFieldValueListType[enumMember] === 'string' && 
                    enumMember.toLowerCase().trim() === this.ValueListType.toLowerCase().trim()) {
                    return EntityFieldValueListType[enumMember as keyof typeof EntityFieldValueListType];
                }
            }
        }
    }

    get GeneratedFormSectionType(): GeneratedFormSectionType {
        return GeneratedFormSectionType[this.GeneratedFormSection];
    }

    /**
     * Provides the TypeScript type for a given Entity Field. This is useful to map
     * a wide array of database types to a narrower set of TypeScript types.
     */
    get TSType(): EntityFieldTSType {
        switch (TypeScriptTypeFromSQLType(this.Type).toLowerCase()) {
            case "number":
                return EntityFieldTSType.Number
            case "boolean":
                return EntityFieldTSType.Boolean
            case "date":
                return EntityFieldTSType.Date
            default:
                return EntityFieldTSType.String
        }
    }

    get IsBinaryFieldType(): boolean {
        switch (this.Type.trim().toLowerCase()) {
            case 'binary':
            case 'varbinary':
            case 'image':
                return true;
            default:
                return false;
        }
    }

    /**
     * Returns true if the field type requires quotes around the value when used in a SQL statement
     */
    get NeedsQuotes(): boolean {
        switch (this.TSType) {
            case EntityFieldTSType.Number:
            case EntityFieldTSType.Boolean:
                return false;
            default:
                return true;
        }
    }

    /**
     * For fields in the database that have spaces in them, we need to replace the spaces with _ in order to create variables for stored procedures. This property returns a consistent CodeName you can use everywhere to refer to the field when generated variable names
     */
    private _codeName: string = null
    get CodeName(): string {
        // the code below replaces spaces with _ and stashes the result in a private variable so we only do this once
        if (this._codeName == null)
            this._codeName = this.Name.replace(/\s/g, "_");
    
        return this._codeName;
    }

    get GraphQLType(): EntityFieldGraphQLType {
        switch (TypeScriptTypeFromSQLType(this.Type).toLowerCase()) {
            case "number":
                // either an int or float if not an int
                switch (this.Type.toLowerCase().trim()) {
                    case "int": case "smallint": case "tinyint": case "bigint":
                        return EntityFieldGraphQLType.Int
                    default:
                        return EntityFieldGraphQLType.Float
                }
            case "boolean":
                return EntityFieldGraphQLType.Boolean
            case "date":
                return EntityFieldGraphQLType.Timestamp
            default:
                return EntityFieldGraphQLType.String
        }
    }

    /**
     * Returns a string with the full SQL data type that combines, as appropriate, Type, Length, Precision and Scale where these attributes are relevant to the Type
     */
    get SQLFullType(): string {
        return SQLFullType(this.Type, this.Length, this.Precision, this.Scale);
    }

    get MaxLength(): number {
        return SQLMaxLength(this.Type, this.Length);
    }

    get ReadOnly(): boolean {
        return this.IsVirtual || !this.AllowUpdateAPI || this.IsPrimaryKey || this.Type.toLowerCase() === 'uniqueidentifier';
    }

    /**
     * Returns true if the field is a "special" field (see list below) and is handled inside the DB layer and should be ignored in validation by the BaseEntity architecture
     * Special fields are: CreatedAt, UpdatedAt, ID
     * Also, we skip validation if we have a field that is:
     *  - the primary key
     *  - a uniqueidentifier 
     *  - an autoincrement field
     *  - the field is virtual
     *  - the field is readonly
     */
    get SkipValidation(): boolean {
        const name: string = this.Name.toLowerCase().trim(); 

        return name === 'createdat' || 
               name === 'updatedat' || 
               this.IsPrimaryKey ||
               this.Type.trim().toLowerCase() === 'uniqueidentifier' ||
               this.AutoIncrement === true ||
               this.IsVirtual === true ||
               this.ReadOnly === true;
    }


    /**
     * Returns the DisplayName if it exists, otherwise returns the Name.
     */
    get DisplayNameOrName(): string {
        return this.DisplayName ? this.DisplayName : this.Name;
    }


    /**
     * Formats a value based on the parameters passed in. This is a wrapper utility method that already know the SQL type from the entity field definition and simply calls the generic FormatValue() function that is also exported by @memberjunction/core
     * @param value - Value to format
     * @param decimals Number of decimals to show, defaults to 2
     * @param currency Currency to use when formatting, defaults to USD
     * @param maxLength Maximum length of the string to return, if the formatted value is longer than this length then the string will be truncated and the trailingChars will be appended to the end of the string 
     * @param trailingChars Only used if maxLength is > 0 and the string being formatted is > maxLength, this is the string that will be appended to the end of the string to indicate that it was truncated, defaults to "..."
     * @returns either the original string value or a formatted version. If the format cannot be applied an an exception occurs it is captured and the error is put to the log, and the original value is returned
     */
    public FormatValue(value: any, 
                       decimals: number = 2, 
                       currency: string = 'USD', 
                       maxLength: number = 0, 
                       trailingChars: string = "..."): string {
        return FormatValue(this.Type, value, decimals, currency, maxLength, trailingChars);
    }

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);

            // do some special handling to create class instances instead of just data objects
            // copy the Entity Field Values
            this._EntityFieldValues = [];
            const efv = initData.EntityFieldValues || initData._EntityFieldValues;
            if (efv) {
                for (let j = 0; j < efv.length; j++) {
                    this._EntityFieldValues.push(new EntityFieldValueInfo(efv[j]));
                }
            }
        }
    }
}

/**
 * Primary Key Value object is used to pass in a primary key field/value pairs to BaseEntity.Load() and other methods that need to load a record by primary key
 */
export class KeyValuePair {
    FieldName: string
    Value: any
}

/**
 * Metadata about an entity
 */
export class EntityInfo extends BaseInfo {
    /**
     * Reserved for future use
     */
    public ParentID: number = null   
    /**
     * Unique name of the entity
     */
    public Name: string = null
    public Description: string  = null
    public BaseTable: string = null
    public BaseView: string = null
    public BaseViewGenerated: boolean = null
    SchemaName: string = null
    VirtualEntity: boolean = null
    TrackRecordChanges: boolean = null
    AuditRecordAccess: boolean = null
    AuditViewRuns: boolean = null
    IncludeInAPI: boolean = false
    AllowAllRowsAPI: boolean = false
    AllowUpdateAPI: boolean = false
    AllowCreateAPI: boolean = false
    AllowDeleteAPI: boolean = false
    CustomResolverAPI: boolean = false
    AllowUserSearchAPI: boolean = false
    FullTextSearchEnabled: boolean = false
    FullTextCatalog: string = null
    FullTextCatalogGenerated: boolean = true
    FullTextIndex: string = null
    FullTextIndexGenerated: boolean = true
    FullTextSearchFunction: string = null
    FullTextSearchFunctionGenerated: boolean = true
    UserViewMaxRows: number = null
    spCreate: string = null
    spUpdate: string = null
    spDelete: string = null
    spCreateGenerated: boolean = null
    spUpdateGenerated: boolean = null
    spDeleteGenerated: boolean = null
    CascadeDeletes: boolean = null
    UserFormGenerated: boolean = null
    EntityObjectSubclassName: string = null
    EntityObjectSubclassImport: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    /**
     * CodeName is a unique name that can be used for various programatic purposes, singular version of the entity name but modified from entity name in some cases to remove whitespace and prefix with _ in the event that the entity name begins with a number or other non-alpha character
     */
    CodeName: string = null
    ClassName: string = null
    BaseTableCodeName: string = null
    ParentEntity: number = null
    ParentBaseTable: string = null
    ParentBaseView: string = null 

    // These are not in the database view and are added in code
    private _Fields: EntityFieldInfo[] 
    private _RelatedEntities: EntityRelationshipInfo[]
    private _Permissions: EntityPermissionInfo[]
    _hasIdField: boolean = false
    _virtualCount: number = 0 
    _manyToManyCount: number = 0 
    _oneToManyCount: number = 0
    _floatCount: number = 0

    /**
     * Returns the primary key for the entity. For entities with a composite primary key, use the PrimaryKeys property which returns all. 
     * In the case of a composite primary key, the PrimaryKey property will return the first field in the sequence of the primary key fields.
     */
    get PrimaryKey(): EntityFieldInfo {
        return this.Fields.find((f) => f.IsPrimaryKey);
    }

    /**
     * Returns an array of all fields that are part of the primary key for the entity. If the entity has a single primary key, the array will have a single element.
     */
    get PrimaryKeys(): EntityFieldInfo[] {
        return this.Fields.filter((f) => f.IsPrimaryKey);
    }

    get UniqueKeys(): EntityFieldInfo[] {
        return this.Fields.filter((f) => f.IsUnique);
    }

    get ForeignKeys(): EntityFieldInfo[] {
        return this.Fields.filter((f) => f.RelatedEntityID > 0);
    }

    get Fields(): EntityFieldInfo[] {
        return this._Fields;
    }
    get RelatedEntities(): EntityRelationshipInfo[] {
        return this._RelatedEntities;
    }
    get Permissions(): EntityPermissionInfo[] {
        return this._Permissions;
    }

    /**
     * Returns the EntityField object for the Field that has IsNameField set to true. If multiple fields have IsNameField on, the function will return the first field (by sequence) that matches. 
     * If no fields match, if there is a field called "Name", that is returned. If there is no field called "Name", null is returned.
     */
    get NameField(): EntityFieldInfo | null {
        for (let j: number = 0; j < this.Fields.length; j++) {
            const ef: EntityFieldInfo = this.Fields[j];
            if (ef.IsNameField) 
                return ef;
        }
        // at this point, we return the first field called "Name" if it exists, and the below line will return NULL if we can't find a field called "Name"
        return this.Fields.find((f) => f.Name.toLowerCase() === 'name');
    }

    /**
     * Returns the Permissions for this entity for a given user, based on the roles the user is part of
     * @param user 
     * @returns 
     */
    public GetUserPermisions(user: UserInfo ): EntityUserPermissionInfo {
        try {
            const permissionList: EntityPermissionInfo[] =[];

            for (let j: number = 0; j < this.Permissions.length; j++) {
                const ep: EntityPermissionInfo = this.Permissions[j];
                const roleMatch: UserRoleInfo = user.UserRoles.find((r) => r.RoleName.trim().toLowerCase() === ep.RoleName.trim().toLowerCase())
                if (roleMatch) // user has this role
                    permissionList.push(ep)
            }
            // now that we have matched any number of EntityPermissions to the current user, aggregate the permissions
            const userPermission: EntityUserPermissionInfo = new EntityUserPermissionInfo();
            userPermission.CanCreate = false; userPermission.CanDelete = false; userPermission.CanRead = false; userPermission.CanUpdate = false;
            for (let j: number = 0; j < permissionList.length; j++) {
                const ep: EntityPermissionInfo = permissionList[j];
                userPermission.CanCreate = userPermission.CanCreate || ep.CanCreate;
                userPermission.CanRead = userPermission.CanRead || ep.CanRead;
                userPermission.CanUpdate = userPermission.CanUpdate || ep.CanUpdate;
                userPermission.CanDelete = userPermission.CanDelete || ep.CanDelete;
            }
            userPermission.Entity = this;
            userPermission.User = user;
    
            return userPermission;
        }
        catch (err) {
            console.log(err)
            return null;
        }
    }

    /**
     * Determines if a given user, for a given permission type, is exempt from RowLevelSecurity or not
     * @param user 
     * @param type 
     * @returns 
     */
    public UserExemptFromRowLevelSecurity(user: UserInfo, type: EntityPermissionType): boolean {
        for (let j: number = 0; j < this.Permissions.length; j++) {
            const ep: EntityPermissionInfo = this.Permissions[j];
            const roleMatch: UserRoleInfo = user.UserRoles.find((r) => r.RoleName.trim().toLowerCase() === ep.RoleName.trim().toLowerCase())
            if (roleMatch) { // user has this role 
                switch (type) {
                    case EntityPermissionType.Create:
                        if (!ep.CreateRLSFilterID)
                            return true;
                        break;
                    case EntityPermissionType.Read:
                        if (!ep.ReadRLSFilterID)
                            return true;
                        break;
                    case EntityPermissionType.Update:
                        if (!ep.UpdateRLSFilterID)
                            return true;
                        break;
                    case EntityPermissionType.Delete:
                        if (!ep.DeleteRLSFilterID)
                            return true;
                        break;
                }

            }
        }
        return false; // if we get here, the user is NOT exempt from RLS for this Permission Type
    }
    
    /**
     * Returns RLS security info attributes for a given user and permission type
     * @param user 
     * @param type 
     * @returns 
     */
    public GetUserRowLevelSecurityInfo(user: UserInfo, type: EntityPermissionType): RowLevelSecurityFilterInfo[] {
        const rlsList: RowLevelSecurityFilterInfo[] = [];
        for (let j: number = 0; j < this.Permissions.length; j++) {
            const ep: EntityPermissionInfo = this.Permissions[j];
            const roleMatch: UserRoleInfo = user.UserRoles.find((r) => r.RoleName.trim().toLowerCase() === ep.RoleName.trim().toLowerCase())
            if (roleMatch) { // user has this role
                let matchObject: RowLevelSecurityFilterInfo = null;
                switch (type) {
                    case EntityPermissionType.Create:
                        if (ep.CreateRLSFilterID)
                            matchObject = ep.CreateRLSFilterObject;
                        break;
                    case EntityPermissionType.Read:
                        if (ep.ReadRLSFilterID)
                            matchObject = ep.ReadRLSFilterObject;
                        break;
                    case EntityPermissionType.Update:
                        if (ep.UpdateRLSFilterID)
                            matchObject = ep.UpdateRLSFilterObject;
                        break;
                    case EntityPermissionType.Delete:
                        if (ep.DeleteRLSFilterID)
                            matchObject = ep.DeleteRLSFilterObject;
                        break;
                }
                if (matchObject) {
                    // we have a match, so add it to the list if it isn't already there
                    const existingMatch: RowLevelSecurityFilterInfo = rlsList.find((r) => r.ID === matchObject.ID);
                    if (!existingMatch)
                        rlsList.push(matchObject);
                }
            }
        }
        return rlsList;
    }

    /**
     * Generates a where clause for SQL filtering for a given entity for a given user and permission type. If there is no RLS for a given entity or the user is exempt from RLS for the entity, a blank string is returned.
     * @param user 
     * @param type 
     * @param returnPrefix 
     * @returns 
     */
    public GetUserRowLevelSecurityWhereClause(user: UserInfo, type: EntityPermissionType, returnPrefix: string): string {
        const userRLS = this.GetUserRowLevelSecurityInfo(user, type);
        if (userRLS && userRLS.length > 0) {
            // userRLS has all of the objects that apply to this user. The user is NOT exempt from RLS, so we need to OR together all of the RLS object filters
            let sRLSSQL: string = '';
            userRLS.forEach((rls) => {
                if (sRLSSQL.length > 0)
                sRLSSQL += ' OR ';
                sRLSSQL += `(${rls.MarkupFilterText(user)})`;
            });
            return sRLSSQL.length > 0 ? `${returnPrefix && returnPrefix.length > 0 ? returnPrefix + ' ' : ''}${sRLSSQL}` : '';
        }
        else
            return '';
    }

    /**
     * Returns a RunViewParams object that is setup to filter the related entity for the provided record
     * @param record 
     * @param relationship 
     * @param filter 
     * @returns 
     */
    public static BuildRelationshipViewParams(record: BaseEntity, relationship: EntityRelationshipInfo, filter?: string, maxRecords?: number): RunViewParams {
        const params: RunViewParams = {}
        let quotes: string = '';
        let keyValue: string = '';
        if (relationship.EntityKeyField && relationship.EntityKeyField.length > 0) {
            keyValue = record.Get(relationship.EntityKeyField);
            quotes = record.EntityInfo.Fields.find((f) => f.Name.trim().toLowerCase() === relationship.EntityKeyField.trim().toLowerCase()).NeedsQuotes ? "'" : '';
        }
        else {
            keyValue = record.PrimaryKey.Value;
            quotes = record.PrimaryKey.NeedsQuotes ? "'" : '';
        }
        if (relationship.Type.trim().toLowerCase() === 'one to many') {
            // one to many
            params.ExtraFilter = relationship.RelatedEntityJoinField + ' = ' + quotes + keyValue + quotes;
        }
        else {
            // many to many
            params.ExtraFilter = `${relationship.RelatedEntityJoinField} IN (SELECT ${relationship.JoinEntityInverseJoinField} FROM ${relationship.JoinView} WHERE ${relationship.JoinEntityJoinField} = ${quotes}${keyValue}${quotes})`;
        }

        if (filter && filter.length > 0) 
            params.ExtraFilter = `(${params.ExtraFilter}) AND (${filter})`; // caller provided their own filter, so AND it in with the relationship filter we have here

        if (relationship.DisplayUserViewGUID && relationship.DisplayUserViewGUID.length > 0) {
            // we have been given a specific view to run, use it
            params.ViewID = relationship.DisplayUserViewID; // virtual field - the durable key is the GUID, but the base view for entityrelationship brings in view name and ID
        }
        else {
            // no view specified, so specify the entity instead
            params.EntityName = relationship.RelatedEntity;
        }

        if (maxRecords && maxRecords > 0)   
            params.MaxRows = maxRecords;

        return params;
    }
    


    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);

            // do some special handling to create class instances instead of just data objects
            // copy the Entity Fields
            this._Fields = [];
            const ef = initData.EntityFields || initData._Fields;
            if (ef) {
                for (let j = 0; j < ef.length; j++) {
                    this._Fields.push(new EntityFieldInfo(ef[j]));
                }
            }

            // copy the Entity Permissions
            this._Permissions = [];
            const ep = initData.EntityPermissions || initData._Permissions;
            if (ep) {
                for (let j = 0; j < ep.length; j++) {
                    this._Permissions.push(new EntityPermissionInfo(ep[j]));
                }
            }

            // copy the Related Entities
            this._RelatedEntities = [];
            const er = initData.EntityRelationships || initData._RelatedEntities;
            if (er) {
                // check to see if ANY of the records in the er array have a non-null or non-zero sequence value. The reason is 
                // if we have any sequence values populated we want to sort by that sequence, and we want to consider null to be a high number
                // so that it sorts to the end of the list
                let bHasSequence: boolean = false;
                for (const j of er) {
                    if (j.Sequence !== null && j.Sequence !== undefined && j.Sequence !== 0) {
                        bHasSequence = true;
                        break;
                    }
                }
                if (bHasSequence) {
                    // sort by sequence if we have any populated sequence values
                    er.sort((a, b) => {
                        const aSeq = a.Sequence !== null && a.Sequence !== undefined ? a.Sequence : 999999;
                        const bSeq = b.Sequence !== null && b.Sequence !== undefined ? b.Sequence : 999999;
                        return aSeq - bSeq
                    }); 
                }

                // now that we have prepared the er array by sorting it, if needed, let's load up the related entities
                for (let j = 0; j < er.length; j++) {
                    this._RelatedEntities.push(new EntityRelationshipInfo(er[j]));
                }
            }

            this.prepareSpecialFields();
        }
    }

    private prepareSpecialFields() {
        try {
            let virtualCount: number = 0;
            let manyToManyCount: number = 0;
            let oneToManyCount: number = 0;
            let floatCount: number = 0;
            let hasIdField: boolean = false;
            
            for (let j:number = 0; j < this.Fields.length; ++j) {
                const f = this.Fields[j]
                if (f.Name.trim().toUpperCase() === 'ID')
                    hasIdField = true;
    
                virtualCount += f.IsVirtual ? 1 : 0;
                floatCount += f.IsFloat ? 1 : 0;
            }
            this._hasIdField = hasIdField
            this._floatCount = floatCount;
            this._virtualCount = virtualCount;
    
            // now see if there are any relationships and count the one to many and many to many
            for (let j:number = 0; j < this.RelatedEntities.length; ++j) {
                const r = this.RelatedEntities[j];
                                   
                if (r.Type.trim().toUpperCase() === 'ONE TO MANY')
                    oneToManyCount++;
                else    
                    manyToManyCount++;
            }
                
            this._manyToManyCount = manyToManyCount;
            this._oneToManyCount = oneToManyCount;
        }
        catch (e) {
            LogError(e);
        }
    }
}

export const ValidationErrorType = {
    Failure: 'Failure',
    Warning: 'Warning',
} as const;

export type ValidationErrorType = typeof ValidationErrorType[keyof typeof ValidationErrorType];


/**
 * Information about a single validation error
 */
export class ValidationErrorInfo {
    Source: string
    Message: string
    Value: string
    Type: ValidationErrorType

    constructor(Source: string, Message: string, Value: string, Type: ValidationErrorType = ValidationErrorType.Failure) {
        this.Source = Source;
        this.Message = Message;
        this.Value = Value;
        this.Type = Type;
    }
}

/**
 * The result of a validation check 
 */
export class ValidationResult {
    Success: boolean
    Errors: ValidationErrorInfo[] = []
}

/**
 * Information about the link between two entities
 */
export class EntityDependency {
    /**
     * The name of the entity that is the "parent" in the relationship
     */
    EntityName: string
    /**
     * The name of the entity that is the "child" in the relationship
     */
    RelatedEntityName: string
    /**
     * The name of the field in the related entity that is the foreign key field back to the primary key of the "parent" entity
     */
    FieldName: string
}

/**
 * Information about the link between two records
 */
export class RecordDependency {
    /**
     * The name of the entity that is the "parent" in the relationship
     */
    EntityName: string
    /**
     * The name of the entity that is the "child" in the relationship
     */
    RelatedEntityName: string
    /**
     * The name of the field in the related entity that is the foreign key field back to the primary key of the "parent" entity
     */
    FieldName: string
    /**
     * The value of the primary key field in the parent record. At present, MemberJunction supports composite(multi-field) primary keys. However, foreign keys only support links to single-valued primary keys in their linked entity.
     */
    CompositeKey: CompositeKey
}

/**
 * Information about a merge request including the entity, the surviving record and the records to merge into the surviving record. Additionally, there is an optional field map that can be used to override field values in the surviving record to values specified.
 */
export class RecordMergeRequest {
    /**
     * The name of the entity to merge records for
     */
    EntityName: string
    /**
     * The composite key for the surviving record
     */
    SurvivingRecordCompositeKey: CompositeKey;
    /**
     * The composite key(s) for the record(s) to merge into the surviving record
     */
    RecordsToMerge: CompositeKey[];
    /**
     * If you want to keep the values in the fields of the surviving record as they are, leave this blank. If you want to override the values in the surviving record with other values, specify the values you would like for each field in this array of objects. Each object has two properties, FieldName and Value. The FieldName is the name of the field to set and the Value is the value to set in it.
     */
    FieldMap?: {FieldName: string, Value: any}[]
}

/**
 * The result of a merge request for a single record
 */
export class RecordMergeDetailResult {
    /**
     * The primary key value(s) for a record that was merged
     */
    CompositeKey: CompositeKey
    /**
     * True if the merge for this specific record was successful, false if not
     */
    Success: boolean
    /**
     * Deletion Log ID for the specific record that was merged
     */
    RecordMergeDeletionLogID: number | null
    /**
     * Status message, if any, for the specific record that was merged
     */
    Message?: string
}

/**
 * The result of a merge request
 */
export class RecordMergeResult {
    /**
     * True if the merge was successful, false if not
     */
    Success: boolean
    /**
     * Status message on the overall operation
     */
    OverallStatus: string
    /**
     * The ID of the log record for the merge operation
     */
    RecordMergeLogID: number | null
    /**
     * The details of the merge operation, including the status of each record that was merged
     */
    RecordStatus: RecordMergeDetailResult[]
    /**
     * The original merge request that was passed in
     */
    Request: RecordMergeRequest
}