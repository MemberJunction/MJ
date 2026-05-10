import { BaseInfo } from "./baseInfo"
import { Metadata } from "./metadata"
import { RunViewParams } from "../views/runView"
import { BaseEntity } from "./baseEntity"
import { RowLevelSecurityFilterInfo, UserInfo, UserRoleInfo } from "./securityInfo"
import { TypeScriptTypeFromSQLType, SQLFullType, SQLMaxLength, FormatValue, CodeNameFromString } from "./util"
import { LogError } from "./logging"
import { CompositeKey } from "./compositeKey"
import { WarningManager, SafeJSONParse, UUIDsEqual } from "@memberjunction/global"

/**
 * Valid values for EntityField.ExtendedType.
 * Defines semantic meaning beyond the SQL data type (e.g., a string field that holds an email, URL, or geo address).
 */
export type EntityFieldExtendedType =
    | 'Code' | 'Email' | 'FaceTime' | 'Geo'
    | 'GeoLatitude' | 'GeoLongitude' | 'GeoCountry' | 'GeoStateProvince'
    | 'GeoCity' | 'GeoPostalCode' | 'GeoAddress'
    | 'MSTeams' | 'Other' | 'SIP' | 'SMS' | 'Skype' | 'Tel' | 'URL' | 'WhatsApp' | 'ZoomMtg';

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
    ID: string = null

    EntityID: string = null
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
/**
 * Metadata about relationships between entities including display preferences for the UI.
 * Defines foreign key relationships and how they should be represented in the user interface.
 */
export class EntityRelationshipInfo extends BaseInfo  {
    ID: string = null

    EntityID: string = null 
    Sequence: number = null
    RelatedEntityID: string = null
    BundleInAPI: boolean = null
    IncludeInParentAllQuery: boolean = null
    Type: string = null 
    EntityKeyField: string = null
    RelatedEntityJoinField: string = null
    JoinView: string = null 
    JoinEntityJoinField: string = null  
    JoinEntityInverseJoinField: string = null     
    DisplayInForm: boolean = null
    DisplayLocation: 'After Field Tabs' | 'Before Field Tabs' = 'After Field Tabs'
    DisplayName: string = null
    DisplayIconType: 'Related Entity Icon'| 'Custom' | 'None' = 'Related Entity Icon'
    DisplayIcon: string = null
    DisplayUserViewID: string = null
    DisplayComponentID: string = null
    DisplayComponentConfiguration: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    /**
    * * Field Name: AutoUpdateFromSchema
    * * Display Name: Auto Update From Schema
    * * SQL Data Type: bit
    * * Default Value: true
    * * Description: Indicates whether this relationship should be automatically updated by CodeGen. When set to 0, the record will not be modified by CodeGen. Defaults to true.
    */
    AutoUpdateFromSchema: boolean = true


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
    DisplayComponent: string = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

/**
 * Metadata about an organic key defined on an entity — a set of fields that constitute
 * a natural identifier for cross-system matching (e.g., email, phone, SSN).
 * Maps to the MJ: Entity Organic Keys metadata entity.
 */
export class EntityOrganicKeyInfo extends BaseInfo {
    ID: string = null
    EntityID: string = null
    Name: string = null
    Description: string | null = null
    MatchFieldNames: string = null
    NormalizationStrategy: 'LowerCaseTrim' | 'Trim' | 'ExactMatch' | 'Custom' = 'LowerCaseTrim'
    CustomNormalizationExpression: string | null = null
    AutoCreateRelatedViewOnForm: boolean = false
    Sequence: number = 0
    Status: 'Active' | 'Disabled' = 'Active'
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields from the database view
    Entity: string = null

    private _RelatedEntities: EntityOrganicKeyRelatedEntityInfo[] = []

    /**
     * Gets the related entities configured for this organic key.
     */
    get RelatedEntities(): EntityOrganicKeyRelatedEntityInfo[] {
        return this._RelatedEntities;
    }

    /**
     * Returns the match field names as a parsed array, trimmed.
     */
    get MatchFieldNamesArray(): string[] {
        return this.MatchFieldNames ? this.MatchFieldNames.split(',').map(f => f.trim()) : [];
    }

    constructor(initData: {EntityOrganicKeyRelatedEntities?: unknown[]; _RelatedEntities?: unknown[]; RelatedEntities?: unknown[]} & Record<string, unknown> = null) {
        super();
        if (initData) {
            this.copyInitData(initData);

            this._RelatedEntities = [];
            const re = initData.EntityOrganicKeyRelatedEntities || initData._RelatedEntities || initData.RelatedEntities;
            if (re && Array.isArray(re)) {
                // sort by sequence
                const sorted = [...re] as Record<string, unknown>[];
                sorted.sort((a, b) => {
                    const aSeq = (a.Sequence as number) ?? 999999;
                    const bSeq = (b.Sequence as number) ?? 999999;
                    return aSeq - bSeq;
                });
                for (const item of sorted) {
                    this._RelatedEntities.push(new EntityOrganicKeyRelatedEntityInfo(item));
                }
            }
        }
    }

}

/**
 * Metadata about a related entity that should appear on a form when viewing a record,
 * matched via a parent organic key. Supports both direct field matching and transitive
 * matching via a SQL view/table.
 * Maps to the MJ: Entity Organic Key Related Entities metadata entity.
 */
export class EntityOrganicKeyRelatedEntityInfo extends BaseInfo {
    ID: string = null
    EntityOrganicKeyID: string = null
    RelatedEntityID: string = null

    // Direct match
    RelatedEntityFieldNames: string | null = null

    // Transitive match
    TransitiveObjectName: string | null = null
    TransitiveObjectMatchFieldNames: string | null = null
    TransitiveObjectOutputFieldName: string | null = null
    RelatedEntityJoinFieldName: string | null = null

    // Display
    DisplayName: string | null = null
    DisplayLocation: 'After Field Tabs' | 'Before Field Tabs' = 'After Field Tabs'
    DisplayComponentID: string | null = null
    DisplayComponentConfiguration: string | null = null
    Sequence: number = 0

    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields from the database view
    EntityOrganicKey: string = null
    RelatedEntity: string = null

    /**
     * Whether this is a direct match (vs transitive).
     */
    get IsDirectMatch(): boolean {
        return this.RelatedEntityFieldNames != null;
    }

    /**
     * Whether this is a transitive match via a SQL view/table.
     */
    get IsTransitiveMatch(): boolean {
        return this.TransitiveObjectName != null;
    }

    /**
     * Returns the related entity field names as a parsed array, trimmed.
     * Only meaningful for direct matches.
     */
    get RelatedEntityFieldNamesArray(): string[] {
        return this.RelatedEntityFieldNames ? this.RelatedEntityFieldNames.split(',').map(f => f.trim()) : [];
    }

    /**
     * Returns the transitive object match field names as a parsed array, trimmed.
     * Only meaningful for transitive matches.
     */
    get TransitiveObjectMatchFieldNamesArray(): string[] {
        return this.TransitiveObjectMatchFieldNames ? this.TransitiveObjectMatchFieldNames.split(',').map(f => f.trim()) : [];
    }

    constructor(initData: Record<string, unknown> = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }

}

export const EntityPermissionType = {
    Read: 'Read',
    Create: 'Create',
    Update: 'Update',
    Delete: 'Delete',
} as const;

export type EntityPermissionType = typeof EntityPermissionType[keyof typeof EntityPermissionType];

/**
 * Distinguishes an additive grant from an explicit refusal on an EntityPermission row.
 * A matching Deny row overrides any Allow rows for the same action across all of the
 * user's roles. Default is 'Allow' to preserve backwards compatibility for rows
 * created before the Type column existed.
 */
export const EntityPermissionEffect = {
    Allow: 'Allow',
    Deny: 'Deny',
} as const;

export type EntityPermissionEffect = typeof EntityPermissionEffect[keyof typeof EntityPermissionEffect];


export class EntityUserPermissionInfo {
    ID: string = null

    Entity: EntityInfo;
    User: UserInfo;
    CanCreate: boolean;
    CanRead: boolean;
    CanUpdate: boolean;
    CanDelete: boolean;   
}

/**
 * Security settings for each entity.
 * Controls which roles can perform create, read, update, and delete operations.
 */
export class EntityPermissionInfo extends BaseInfo{
    ID: string = null

    EntityID: string = null
    RoleID: string = null
    /**
     * Allow (default) or Deny. Deny rows override matching Allow rows for the same action
     * during `EntityInfo.GetUserPermisions()` aggregation. Added in Phase 2b of the unified
     * permissions architecture; defaults to 'Allow' for backwards compatibility with rows
     * materialized before the column existed.
     */
    Type: string = 'Allow'
    CanCreate: boolean = null
    CanRead: boolean = null
    CanUpdate: boolean = null
    CanDelete: boolean = null
    ReadRLSFilterID: string = null
    CreateRLSFilterID: string = null
    UpdateRLSFilterID: string = null
    DeleteRLSFilterID: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    Entity: string = null
    Role: string = null
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
        let fID: string = "";

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
        if (fID && fID.length > 0) 
            return Metadata.Provider.RowLevelSecurityFilters.find(f => UUIDsEqual(f.ID, fID));  // global-provider-ok: stateless info class — proxies to global metadata
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


/**
 * Configuration for joining additional fields from a related entity into the base view.
 */
export interface RelatedEntityJoinFieldConfig {
    /**
     * Controls how this config interacts with default NameField behavior.
     * - "extend": Include the default NameField PLUS the specified fields (default)
     * - "override": ONLY include the specified fields, ignore NameField
     * - "disable": Don't join ANY fields from this related entity
     */
    mode?: 'extend' | 'override' | 'disable';

    /**
     * Fields to join from the related entity.
     * Ignored when mode is 'disable'.
     */
    fields?: RelatedEntityJoinField[];
}

/**
 * Individual field configuration for a related entity join.
 */
export interface RelatedEntityJoinField {
    /**
     * Name of the field on the related entity to join.
     */
    field: string;

    /**
     * Optional custom alias for the column in the view.
     * If not provided, auto-generated by the code generation process.
     */
    alias?: string;
}


/**
 * Defines allowed values for entity fields with value lists.
 * Supports dropdowns, validations, and data integrity constraints.
 */
export class EntityFieldValueInfo extends BaseInfo {
    ID: string = null

    EntityFieldID: string = null // EntityFieldID is a uniqueidentifier column
    Sequence: number = null
    Value: string = null
    Code: string = null
    Description: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }

    /**
     * Returns a plain object suitable for JSON serialization.
     * Called automatically by JSON.stringify().
     */
    toJSON(): { Value: string; Code: string } {
        return {
            Value: this.Value,
            Code: this.Code,
        };
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
/**
 * List of all fields within each entity with metadata about each field.
 * Includes data types, relationships, defaults, and UI display preferences.
 */
export class EntityFieldInfo extends BaseInfo {
    ID: string = null

    /**
     * Foreign key to the Entities entity.
     */
    EntityID: string = null
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
     * Indicates this field is a soft primary key (metadata-defined, not a database constraint).
     * The view ORs this with IsPrimaryKey, so existing code checking IsPrimaryKey works automatically.
     */
    IsSoftPrimaryKey: boolean = null
    /**
     * Indicates this field is a soft foreign key (metadata-defined, not a database constraint).
     * When set to 1, RelatedEntityID and RelatedEntityFieldName are preserved and not overwritten by CodeGen schema sync.
     */
    IsSoftForeignKey: boolean = null
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
    ExtendedType: EntityFieldExtendedType | null = null
    DefaultInView: boolean = null 
    ViewCellTemplate: string = null
    DefaultColumnWidth: number = null 
    AllowUpdateAPI: boolean = null
    AllowUpdateInView: boolean = null
    IncludeInUserSearchAPI: boolean = null
    FullTextSearchEnabled: boolean = false
    UserSearchParamFormatAPI: string = null
    /**
     * Search predicate controlling how user-search queries match against this field
     * in the LIKE-based search path used when the entity does not have FullTextSearchEnabled.
     * Valid values: 'BeginsWith' | 'Contains' | 'EndsWith' | 'Exact'. Default 'Contains'.
     * Honored by GenericDatabaseProvider.createViewUserSearchSQL.
     */
    UserSearchPredicateAPI: string = null
    IncludeInGeneratedForm: boolean = null
    GeneratedFormSection: string = null
    IsVirtual: boolean = null
    /**
     * When true, this field is a SQL Server computed column or PostgreSQL generated column —
     * physically present in the base table but read-only at the SQL layer. Distinct from
     * IsVirtual, which is also set to 1 for these fields (because they are read-only at the
     * API layer) but is additionally set for view-only columns that don't exist in the base
     * table at all (e.g., joined name lookups in the base view). Use the combination to
     * disambiguate:
     *   IsVirtual=0, IsComputed=0 → regular base-table column (writable)
     *   IsVirtual=1, IsComputed=0 → view-only column (no physical storage)
     *   IsVirtual=1, IsComputed=1 → computed/generated column (physical, read-only in SQL)
     * Only relevant downstream consumer that branches on this is base-view JOIN target
     * selection in CodeGen — when an FK's related Name Field is IsComputed=1, the join
     * targets the related entity's base table (not its view).
     */
    IsComputed: boolean = null
    IsNameField: boolean = null
    RelatedEntityID: string = null
    RelatedEntityFieldName: string = null
    IncludeRelatedEntityNameFieldInBaseView: boolean = null
    RelatedEntityNameFieldMap: string = null
    /**
     * JSON configuration for additional fields to join from the related entity.
     * Parsed from the RelatedEntityJoinFields column.
     */
    RelatedEntityJoinFields: string = null
    /**
     * The name of the TypeScript interface/type for this JSON field.
     * When set, CodeGen will emit a strongly-typed getter/setter using this type
     * instead of the default string getter/setter.
     */
    JSONType: string = null;
    /**
     * If true, the field holds a JSON array of JSONType items.
     * The getter returns JSONType[] | null and the setter accepts JSONType[] | null.
     */
    JSONTypeIsArray: boolean = false;
    /**
     * Raw TypeScript code emitted by CodeGen above the entity class definition.
     * Typically contains the interface/type definition referenced by JSONType.
     * Can include imports, multiple types, or any valid TypeScript.
     */
    JSONTypeDefinition: string = null;

    RelatedEntityDisplayType: 'Search' | 'Dropdown' = null
    EntityIDFieldName: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    /**
    * * Field Name: ScopeDefault
    * * Display Name: Scope Default
    * * SQL Data Type: nvarchar(100)
    * * Description: A comma-delimited string indicating the default scope for field visibility. Options include Users, Admins, AI, and All. Defaults to All when NULL. This is used for a simple method of filtering field defaults for visibility, not security enforcement.
    */
    ScopeDefault: string | null = null; 

    /**
    * * Field Name: AutoUpdateRelatedEntityInfo
    * * Display Name: Auto Update Related Entity Info
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates whether the related entity information should be automatically updated from the database schema. When set to 0, relationships not part of the database schema can be manually defined at the application and AI agent level. Defaults to 1.
    */
    AutoUpdateRelatedEntityInfo: boolean = true 

    /**
    * * Field Name: ValuesToPackWithSchema
    * * Display Name: Values To Pack With Schema
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Auto
    * * Value List Type: List
    * * Possible Values 
    *   * Auto
    *   * None
    *   * All
    * * Description: Determines whether values for the field should be included when the schema is packed. Options: Auto (include manually set or auto-derived values), None (exclude all values), All (include all distinct values from the table). Defaults to Auto.
    */
    ValuesToPackWithSchema: 'Auto' | 'None' | 'All' = 'Auto';

    /**
     * * Field Name: GeneratedValidationFunctionName
     * * Display Name: Generated Validation Function Name
     * * SQL Data Type: nvarchar(255)
     * * Default Value: null
     * * Description: Contains the name of the generated field validation function, if it exists, null otherwise.
     */
    GeneratedValidationFunctionName: string | null = null;

    /**
     * * Field Name: GeneratedValidationFunctionDescription
     * * Display Name: Generated Validation Function Description
     * * SQL Data Type: nvarchar(max)
     * * Default Value: null
     * * Description: Contains a description for business users of what the validation function for this field does, if it exists.
     */
    GeneratedValidationFunctionDescription: string | null = null;

    /**
     * * Field Name: GeneratedValidationFunctionCode
     * * Display Name: Generated Validation Function Code
     * * SQL Data Type: nvarchar(max)
     * * Default Value: null
     * * Description: Contains the generated code for the field validation function, if it exists, null otherwise.
     */
    GeneratedValidationFunctionCode: string | null = null;

    /**
     * * Field Name: GeneratedValidationFunctionCheckConstraint
     * * Display Name: Generated Validation Function Check Constraint
     * * SQL Data Type: nvarchar(max)
     * * Default Value: null
     * * Description: If a generated validation function was generated previously, this stores the text from the source CHECK constraint in the database. This is stored so that regeneration of the validation function will only occur when the source CHECK constraint changes.
     */
    GeneratedValidationFunctionCheckConstraint: string | null = null;


    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(25)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values
    *   * Active
    *   * Deprecated
    *   * Disabled
    * * Description: Current status of the entity field - Active fields are available for use, Deprecated fields are discouraged but still functional, Disabled fields are not available for use
    */
    Status: 'Active' | 'Deprecated' | 'Disabled' = 'Active';

    /**
    * * Field Name: CodeType
    * * Display Name: Code Type
    * * SQL Data Type: nvarchar(50)
    * * Default Value: null
    * * Value List Type: List
    * * Possible Values: CSS, HTML, JavaScript, Other, SQL, TypeScript
    * * Description: The type of code associated with this field. Only used when the ExtendedType field is set to 'Code'
    */
    CodeType: 'CSS' | 'HTML' | 'JavaScript' | 'Other' | 'SQL' | 'TypeScript' | null = null;

    /**
    * * Field Name: AutoUpdateIsNameField
    * * Display Name: Auto Update Is Name Field
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 1, allows system/LLM to auto-update IsNameField; when 0, user has locked this field
    */
    AutoUpdateIsNameField: boolean = true;

    /**
    * * Field Name: AutoUpdateDefaultInView
    * * Display Name: Auto Update Default In View
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 1, allows system/LLM to auto-update DefaultInView; when 0, user has locked this field
    */
    AutoUpdateDefaultInView: boolean = true;

    /**
    * * Field Name: AutoUpdateCategory
    * * Display Name: Auto Update Category
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 1, allows system/LLM to auto-update Category; when 0, user has locked this field
    */
    AutoUpdateCategory: boolean = true;

    /**
    * * Field Name: AutoUpdateExtendedType
    * * Display Name: Auto Update Extended Type
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 1, allows CodeGen to auto-suggest and apply ExtendedType values (GeoLatitude, GeoLongitude, etc.); when 0, user has locked this field
    */
    AutoUpdateExtendedType: boolean = true;

    /**
    * * Field Name: AutoUpdateDisplayName
    * * Display Name: Auto Update Display Name
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 1, allows system/LLM to auto-update DisplayName during CodeGen; when 0, user has locked this field
    */
    AutoUpdateDisplayName: boolean = true;

    /**
    * * Field Name: AutoUpdateIncludeInUserSearchAPI
    * * Display Name: Auto Update Include In User Search API
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 1, allows system/LLM to auto-update IncludeInUserSearchAPI during CodeGen; when 0, user has locked this field
    */
    AutoUpdateIncludeInUserSearchAPI: boolean = true;

    // ========================================================================
    // ENCRYPTION FIELDS
    // These fields control field-level encryption for sensitive data at rest
    // ========================================================================

    /**
     * When true, this field will be encrypted at rest using the specified EncryptionKeyID.
     * Encrypted fields:
     * - Cannot be indexed or searched effectively
     * - Are automatically encrypted on save and decrypted on load
     * - Store data in the format: $ENC$<keyId>$<algorithm>$<iv>$<ciphertext>[$<authTag>]
     *
     * @default false
     */
    Encrypt: boolean = false;

    /**
     * References the encryption key to use when Encrypt is true.
     * Must point to an active record in the "MJ: Encryption Keys" entity.
     * Required if Encrypt is true.
     */
    EncryptionKeyID: string | null = null;

    /**
     * Controls whether encrypted fields are decrypted when returned via API.
     *
     * When true:
     * - Field value is decrypted before returning to client
     * - Use for PII that authorized users should see
     *
     * When false:
     * - Behavior depends on SendEncryptedValue
     * - Use for secrets like API keys that should never leave the server
     *
     * @default false (secure by default)
     */
    AllowDecryptInAPI: boolean = false;

    /**
     * When AllowDecryptInAPI is false, controls what value is returned to clients.
     *
     * When true:
     * - Send the encrypted ciphertext ($ENC$...)
     * - Client knows field is encrypted but can't decrypt
     *
     * When false:
     * - Send NULL instead of the encrypted value
     * - Most secure option - client doesn't even see encrypted data
     *
     * @default false (most secure)
     */
    SendEncryptedValue: boolean = false;


    // virtual fields - returned by the database VIEW
    FieldCodeName: string =  null
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
    /**
     * Mirror of `IsComputed` on the related entity's Name Field. Tracked alongside
     * `_RelatedEntityNameFieldIsVirtual` so that base-view JOIN-target selection can
     * prefer the related entity's base table when the Name Field is a SQL computed/
     * generated column (physically present in the base table even though IsVirtual=1).
     */
    _RelatedEntityNameFieldIsComputed: boolean
    private _rawEntityFieldValues: Record<string, unknown>[] | null = null;
    private _entityFieldValuesConstructed = false;
    _EntityFieldValues: EntityFieldValueInfo[];
    _RelatedEntityNameFieldMap: string
    /**
     * Collection of all joined field mappings from the related entity.
     */
    _RelatedEntityJoinFieldMappings: Array<{
        sourceField: string;
        alias: string;
        isVirtual: boolean;
        isComputed: boolean;
    }>;

    /**
     * Cached parsed RelatedEntityJoinFieldsConfig to avoid repeated JSON.parse calls.
     * Lazy-initialized on first access.
     */
    private _relatedEntityJoinFieldsParsed: RelatedEntityJoinFieldConfig | null = undefined;

    /**
     * Flag to track if RelatedEntityJoinFieldsConfig parsing failed to avoid repeated parse attempts on bad JSON.
     */
    private _relatedEntityJoinFieldsFailedParsing: boolean = false;

    /**
     * JSON configuration for additional fields to join from the related entity.
     * Parsed from the RelatedEntityJoinFields column. Uses lazy initialization and caching
     * to avoid repeated JSON.parse calls. If parsing fails, it won't be attempted again.
     */
    get RelatedEntityJoinFieldsConfig(): RelatedEntityJoinFieldConfig | null {
        // If parsing already failed, don't try again
        if (this._relatedEntityJoinFieldsFailedParsing) {
            return null;
        }

        // If no RelatedEntityJoinFields data, return null
        if (!this.RelatedEntityJoinFields) {
            return null;
        }

        // If already parsed and cached, return cached value
        if (this._relatedEntityJoinFieldsParsed !== undefined) {
            return this._relatedEntityJoinFieldsParsed;
        }

        // Parse and cache the configuration
        const parsed = SafeJSONParse<RelatedEntityJoinFieldConfig>(this.RelatedEntityJoinFields, false);
        if (parsed === null) {
            // Parsing failed - mark as failed so we don't try again
            this._relatedEntityJoinFieldsFailedParsing = true;
            return null;
        }

        // Successfully parsed - cache and return
        this._relatedEntityJoinFieldsParsed = parsed;
        return parsed;
    }

    get EntityFieldValues(): EntityFieldValueInfo[] {
        if (!this._entityFieldValuesConstructed && this._rawEntityFieldValues) {
            this._EntityFieldValues = this._rawEntityFieldValues.map(v => new EntityFieldValueInfo(v));
            this._rawEntityFieldValues = null; // free raw data
            this._entityFieldValuesConstructed = true;
        }
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

    /**
     * Returns true if the field type is a binary type such as binary, varbinary, or image.
     */
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
     * Returns the Unicode prefix (N) if the field type requires it, otherwise returns an empty string.
     */
    get UnicodePrefix(): string {
        if (this.RequiredUnicodePrefix) {
            return 'N';
        }
        else {
            return '';
        }   
    }

    /**
     * Returns true if the field type requires a Unicode prefix (N) when used in a SQL statement.
     */
    get RequiredUnicodePrefix(): boolean {
        switch (this.Type.trim().toLowerCase()) {
            case 'nchar':
            case 'nvarchar':
            case 'ntext':
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
     * For fields in the database that have characters invalid for SQL identifiers in them, we need to replace those characters with _ in order to create variables for stored procedures. 
     * This property returns a consistent CodeName you can use everywhere to refer to the field when generated variable names
     */
    private _codeName: string = null
    get CodeName(): string {
        if (this._codeName === null) {
            this._codeName = CodeNameFromString(this.Name);
        }

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
        // Note: IsVirtual is intentionally NOT checked here. For IS-A (table-per-type) inheritance,
        // parent entity fields on child entities are marked IsVirtual=1 (they don't exist in the
        // child's base table) but ARE editable via the parent save chain. The AllowUpdateAPI flag
        // already correctly distinguishes editable IS-A parent fields (AllowUpdateAPI=1) from
        // truly read-only virtual fields like joined display names (AllowUpdateAPI=0).
        return !this.AllowUpdateAPI ||
               this.IsPrimaryKey ||
               this.IsSpecialDateField;
    }

    /**
     * Helper method that returns true if the field is one of the special reserved MJ date fields for tracking CreatedAt and UpdatedAt timestamps as well as the DeletedAt timestamp used for entities that
     * have DeleteType=Soft. This is only used when the entity has TrackRecordChanges=1 or for entities where DeleteType=Soft
     */
    get IsSpecialDateField(): boolean {
        return this.IsCreatedAtField || this.IsUpdatedAtField || this.IsDeletedAtField;
    }

    /**
     * Returns true if the field is the CreatedAt field, a special field that is used to track the creation date of a record. This is only used when the entity has TrackRecordChanges=1
     */
    get IsCreatedAtField(): boolean {
        return this.Name.trim().toLowerCase() === EntityInfo.CreatedAtFieldName.trim().toLowerCase();
    }
    /**
     * Returns true if the field is the UpdatedAt field, a special field that is used to track the last update date of a record. This is only used when the entity has TrackRecordChanges=1
     */
    get IsUpdatedAtField(): boolean {
        return this.Name.trim().toLowerCase() === EntityInfo.UpdatedAtFieldName.trim().toLowerCase();
    }

    /**
     * Returns true if the field is the DeletedAt field, a special field that is used to track the deletion date of a record. This is only used when the entity has DeleteType=Soft
     */
    get IsDeletedAtField(): boolean {
        return this.Name.trim().toLowerCase() === EntityInfo.DeletedAtFieldName.trim().toLowerCase();
    }

    /**
     * Returns true if the field is a uniqueidentifier in the database.
     */
    get IsUniqueIdentifier(): boolean {
        return this.Type.trim().toLowerCase() === 'uniqueidentifier';
    }    

    /**
     * Returns true if the field has a default value set
     */
    get HasDefaultValue(): boolean {
        return this.DefaultValue && this.DefaultValue.trim().length > 0
    }

    /**
     * Returns true when the field's `spUpdate` / `spCreate` procedure
     * exposes a `<Param>_Clear` companion parameter — i.e. the field is
     * nullable and has a non-NULL database default.
     *
     * Codegen emits the companion so a caller can disambiguate
     * "leave unchanged / apply default" (omit the parameter) from
     * "explicitly set this column to NULL" (`<Param>_Clear = 1`).
     * Without it, the SP body's `ISNULL(@Param, [Col])` merge silently
     * substitutes the existing value or default, and a literal NULL
     * could never be persisted.
     *
     * Save-time callers in the data providers use this to decide whether
     * to also emit the `_Clear` companion parameter when the entity
     * intentionally sets such a field to NULL. Stays in sync with
     * `CodeGenLib`'s `needsClearCompanion`.
     *
     * Note: relies on `DefaultValue` already being normalized by
     * `ExtractActualDefaultValue` at populate time — that helper strips
     * the DB's wrapping parens and converts a literal `NULL` default to
     * JS `null`. So if `HasDefaultValue` is true, the default is
     * guaranteed to be non-NULL.
     */
    get NeedsClearCompanion(): boolean {
        return this.AllowsNull;
    }

    /**
     * Returns true if the field is a "special" field (see list below) and is handled inside the DB layer and should be ignored in validation by the BaseEntity architecture
     * Also, we skip validation if we have a field that is:
     *  - the primary key
     *  - an autoincrement field
     *  - the field is virtual
     *  - the field is readonly
     *  - the field is a special date field
     */
    get SkipValidation(): boolean {
        const name: string = this.Name.toLowerCase().trim(); 

        return this.IsSpecialDateField ||
               this.IsPrimaryKey ||
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

            // Lazy-construct EntityFieldValueInfo objects — stash raw data now,
            // construct typed instances on first access via the getter.
            // This eliminates ~36,000 object constructions during startup deserialization.
            const efv = initData.EntityFieldValues || initData._EntityFieldValues;
            if (efv && efv.length > 0) {
                this._rawEntityFieldValues = efv;
                this._entityFieldValuesConstructed = false;
                this._EntityFieldValues = []; // placeholder until getter is called
            } else {
                this._EntityFieldValues = [];
                this._entityFieldValuesConstructed = true;
            }
        }
    }



    /**
     * This static factory method is used to check to see if the entity field in question is active or not
     * If it is not active, it will throw an exception or log a warning depending on the status of the entity field being
     * either Deprecated or Disabled.
     * @param entityField - the EntityFieldInfo object to check the status of 
     * @param callerName - the name of the caller that is calling this method, used for logging purposes such as EntityField::constructor as an example.
     */
    public static AssertEntityFieldActiveStatus(entityField: EntityFieldInfo, callerName: string) {
        if (!entityField) {
            throw new Error(`Entity must be provided to call AssertEntityFieldActiveStatus. Caller: ${callerName}`);
        }
        if (entityField.Status === 'Active') {
            return; // no need to check further, the field is active
        }

        if (entityField.Status?.trim().toLowerCase() === 'deprecated') {
            // Record deprecation warning - will be batched and displayed after debounce period
            WarningManager.Instance.RecordFieldDeprecationWarning(
                entityField.Entity,
                entityField.Name,
                callerName
            );
        }
        else if (entityField.Status?.trim().toLowerCase() === 'disabled') {
            // console.error and throw the exception
            const exceptionString = `${callerName}: Entity Field ${entityField.Entity}.${entityField.Name} is disabled and cannot be used.`;
            LogError(exceptionString);
            throw new Error(exceptionString);
        }
    }    

    /**
     * Readonly array of SQL date/time functions that return the current date/time.
     * Includes both SQL Server and PostgreSQL variants.
     */
    private static readonly SQL_CURRENT_DATE_FUNCTIONS: readonly string[] = [
        'getdate()',
        'getutcdate()',
        'sysdatetimeoffset()',
        'current_timestamp',
        'sysdatetime()',
        'sysutcdatetime()',
        'now()',
        'clock_timestamp()',
        'statement_timestamp()',
        'transaction_timestamp()'
    ] as const;

    /**
     * Checks if a default value is a SQL Server function that returns the current date/time
     * @param defaultValue - The default value to check
     * @returns true if the default value is a SQL current date/time function, false otherwise
     */
    public static IsDefaultValueSQLCurrentDateFunction(defaultValue: string | null | undefined): boolean {
        if (!defaultValue) {
            return false;
        }

        // Trim and lowercase the value for comparison
        const normalizedValue = defaultValue.trim().toLowerCase();
        
        // Check if the normalized value contains any of our known current date functions
        // Using includes() because the value might be wrapped in parentheses like (getdate())
        return EntityFieldInfo.SQL_CURRENT_DATE_FUNCTIONS.some(func => 
            normalizedValue.includes(func)
        );
    }
}



/**
 * Entity Document Type Info object has information about the document types that exist across all entities. When Entity Documents are created they are associated with a document type.
 */
/**
 * Defines types of documents that can be generated from entity data.
 * Supports various output formats for entity records.
 */
export class EntityDocumentTypeInfo extends BaseInfo {
    ID: string = null

    Name: string = null
    Description: string = null  
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    constructor (initData: any = null) {
        super()
        this.copyInitData(initData)
    }
}
 

/**
 * Metadata about a single field category: its icon and description.
 * Optionally indicates that the category contains fields inherited from an IS-A parent entity.
 */
export type FieldCategoryInfo = {
    /** Font Awesome icon class (e.g. "fa-solid fa-chart-line") */
    icon: string;
    /** Human-readable description of what this category contains */
    description: string;
    /** If set, this category contains fields inherited from an IS-A parent entity */
    inheritedFromEntityID?: string;
    /** Display name of the parent entity (for UI badges like "Inherited from Products") */
    inheritedFromEntityName?: string;
}

/**
 * Settings allow you to store key/value pairs of information that can be used to configure the behavior of the entity.
 */
/**
 * Stores entity-specific configuration settings.
 * Allows customization of how entities function within the system.
 */
export class EntitySettingInfo extends BaseInfo {   
    ID: string = null
    EntityID: string = null
    Name: string = null
    Value: string = null
    Comments: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    constructor (initData: any = null) {
        super()
        this.copyInitData(initData)
    }

}


/**
 * Catalog of all entities across all schemas.
 * Contains comprehensive metadata about each entity including its database mappings, security settings, and UI preferences.
 */
export class EntityInfo extends BaseInfo {
    /**
     * Unique identifier for the entity
     */
    public ID: string = null

    /**
     * Reserved for future use - parent entity for hierarchical relationships
     */
    public ParentID: string = null   
    /**
     * Unique name of the entity used throughout the system
     */
    public Name: string = null
    /**
     * Optional display name for the entity. If not provided, the entity Name will be used for display purposes.
     */
    public DisplayName: string = null
    /**
     * Optional suffix appended to entity names for display purposes
     */
    public NameSuffix: string = null
    /**
     * Detailed description of the entity's purpose and contents
     */
    public Description: string  = null
    /**
    * * Field Name: AutoUpdateDescription
    * * Display Name: Auto Update Description
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 1 (default), whenever a description is modified in the underlying view (first choice) or table (second choice), the Description column in the entity definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.
    */
    public AutoUpdateDescription: boolean = true
    /**
     * The underlying database table name this entity maps to
     */
    public BaseTable: string = null
    /**
     * The database view used as a "wrapper" for accessing this entity's data
     */
    public BaseView: string = null
    /**
     * Whether the base view is generated by CodeGen (true) or manually created (false)
     */
    public BaseViewGenerated: boolean = null
    /**
     * Database schema that contains this entity's table and view
     */
    SchemaName: string = null
    /**
     * If true, this is a virtual entity not backed by a physical database table
     */
    VirtualEntity: boolean = null
    /**
     * Whether to track all changes to records in the RecordChange table
     */
    TrackRecordChanges: boolean = null
    /**
     * When false (default), child types are disjoint — a record can only be one child type at a time.
     * When true, a record can simultaneously exist as multiple child types
     * (e.g., a Person can be both a Member and a Volunteer).
     * This flag is set on the **parent** entity and controls whether its children are exclusive.
     */
    AllowMultipleSubtypes: boolean = false
    /**
     * Whether to audit when users access records from this entity
     */
    AuditRecordAccess: boolean = null
    /**
     * Whether to audit when views are run against this entity
     */
    AuditViewRuns: boolean = null
    /**
     * When true (default), the server-side RunView cache will store and return cached results
     * for this entity, trusting that all mutations flow through BaseEntity.Save() which fires
     * cache invalidation events. Set to false for entities whose rows are created as side-effects
     * of other operations via raw SQL (e.g., Record Changes created by spCreateRecordChange_Internal),
     * since those inserts bypass BaseEntity and never trigger cache invalidation.
     */
    TrustServerCacheCompletely: boolean = true
    /**
     * Controls whether this entity participates in server-side and client-side
     * caching at all. When false (default for non-__mj entities), the entire
     * cache code path is short-circuited: no PreRunView cache check, no
     * auto-cache storage, no HandleBaseEntityEvent fingerprint scan, no
     * client-side IndexedDB cache. Zero overhead on hot save/query paths.
     */
    AllowCaching: boolean = false
    /**
     * Whether this entity is available through the GraphQL API
     */
    IncludeInAPI: boolean = false
    /**
     * If true, allows querying all rows without pagination limits via API
     */
    AllowAllRowsAPI: boolean = false
    /**
     * Global flag controlling whether records can be updated via API
     */
    AllowUpdateAPI: boolean = false
    /**
     * Global flag controlling whether records can be created via API
     */
    AllowCreateAPI: boolean = false
    /**
     * Global flag controlling whether records can be deleted via API
     */
    AllowDeleteAPI: boolean = false
    /**
     * If true, uses a custom resolver for GraphQL operations instead of standard CRUD
     */
    CustomResolverAPI: boolean = false
    /**
     * Whether users can search this entity through the search API
     */
    AllowUserSearchAPI: boolean = false
    /**
     * Whether full-text search is enabled for this entity
     */
    FullTextSearchEnabled: boolean = false
    /**
     * Name of the SQL Server full-text catalog used for searching
     */
    FullTextCatalog: string = null
    /**
     * Whether the full-text catalog is generated by CodeGen
     */
    FullTextCatalogGenerated: boolean = true
    /**
     * Name of the full-text index on this entity
     */
    FullTextIndex: string = null
    /**
     * Whether the full-text index is generated by CodeGen
     */
    FullTextIndexGenerated: boolean = true
    /**
     * Name of the function used for full-text searching
     */
    FullTextSearchFunction: string = null
    /**
     * Whether the full-text search function is generated by CodeGen
     */
    FullTextSearchFunctionGenerated: boolean = true
    /**
     * When true, this entity supports geocoding — CodeGen generates geo-aware subclass code,
     * adds __mj_Latitude/__mj_Longitude virtual fields to the base view, and the UI shows
     * a map view toggle. Auto-set by CodeGen when LLM detects geo-capable fields.
     */
    SupportsGeoCoding: boolean = false
    /**
     * When true (default), CodeGen can automatically set SupportsGeoCoding based on
     * LLM analysis of entity fields. Set to false to lock the value.
     */
    AutoUpdateSupportsGeoCoding: boolean = true
    /**
     * Maximum number of rows to return in user views to prevent performance issues
     */
    UserViewMaxRows: number = null
    /**
     * Name of the stored procedure for creating records
     */
    spCreate: string = null
    /**
     * Name of the stored procedure for updating records
     */
    spUpdate: string = null
    /**
     * Name of the stored procedure for deleting records
     */
    spDelete: string = null
    /**
     * Whether the create stored procedure is generated by CodeGen
     */
    spCreateGenerated: boolean = null
    /**
     * Whether the update stored procedure is generated by CodeGen
     */
    spUpdateGenerated: boolean = null
    /**
     * Whether the delete stored procedure is generated by CodeGen
     */
    spDeleteGenerated: boolean = null
    /**
     * Whether to automatically delete related records when a parent is deleted
     */
    CascadeDeletes: boolean = null
    /**
     * Type of delete operation: Hard (physical delete) or Soft (mark as deleted)
     */
    DeleteType: 'Hard' | 'Soft' = 'Hard'
    /**
     * Whether records in this entity can be merged together
     */
    AllowRecordMerge: boolean = null
    /**
     * Name of the stored procedure used for matching/duplicate detection
     */
    spMatch: string = null
    /**
     * Default display type for relationships: Search (type-ahead) or Dropdown
     */
    RelationshipDefaultDisplayType: 'Search' | 'Dropdown' = null
    /**
     * Whether the user form for this entity is generated by CodeGen
     */
    UserFormGenerated: boolean = null
    /**
     * Name of the TypeScript subclass for this entity if custom behavior is needed
     */
    EntityObjectSubclassName: string = null
    /**
     * Import statement for the entity's TypeScript subclass
     */
    EntityObjectSubclassImport: string = null
    /**
     * Field name that contains the preferred communication method (email, phone, etc.)
     */
    PreferredCommunicationField: string = null
    /**
     * CSS class or icon identifier for displaying this entity in the UI
     */
    Icon: string = null
    /**
     * Date and time when this entity was created
     */
    __mj_CreatedAt: Date = null
    /**
     * Date and time when this entity was last updated
     */
    __mj_UpdatedAt: Date = null

    /**
    * * Field Name: ScopeDefault
    * * Display Name: Scope Default
    * * SQL Data Type: nvarchar(100)
    * * Description: Optional, comma-delimited string indicating the default scope for entity visibility. Options include Users, Admins, AI, and All. Defaults to All when NULL. This is used for simple defaults for filtering entity visibility, not security enforcement.
    */
    ScopeDefault: string | null = null; 

    /**
    * * Field Name: RowsToPackWithSchema
    * * Display Name: Rows To Pack With Schema
    * * SQL Data Type: nvarchar(20)
    * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * None
    *   * Sample
    *   * All
    * * Description: Determines how entity rows should be packaged for external use. Options include None, Sample, and All. Defaults to None.
    */
    RowsToPackWithSchema: 'None' | 'Sample' | 'All' = 'None';
   
    /**
    * * Field Name: RowsToPackSampleMethod
    * * Display Name: Rows To Pack Sample Method
    * * SQL Data Type: nvarchar(20)
    * * Default Value: random
    * * Value List Type: List
    * * Possible Values 
    *   * random
    *   * top n
    *   * bottom n
    * * Description: Defines the sampling method for row packing when RowsToPackWithSchema is set to Sample. Options include random, top n, and bottom n. Defaults to random.
    */
    RowsToPackSampleMethod: 'random' | 'top n' | 'bottom n' = 'random'; 

    /**
    * * Field Name: RowsToPackSampleCount
    * * Display Name: Rows To Pack Sample Count
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: The number of rows to pack when RowsToPackWithSchema is set to Sample, based on the designated sampling method. Defaults to 0.
    */
    RowsToPackSampleCount: number = 0; 

    /**
    * * Field Name: RowsToPackSampleOrder
    * * Display Name: Rows To Pack Sample Order
    * * SQL Data Type: nvarchar(MAX)
    * * Description: An optional ORDER BY clause for row packing when RowsToPackWithSchema is set to Sample. Allows custom ordering for selected entity data when using top n and bottom n.
    */
    RowsToPackSampleOrder: string | null = null; 


    /**
    * * Field Name: AutoRowCountFrequency
    * * Display Name: Auto Row Count Frequency
    * * SQL Data Type: int
    * * Description: Frequency in hours for automatically performing row counts on this entity. If NULL, automatic row counting is disabled. If greater than 0, schedules recurring SELECT COUNT(*) queries at the specified interval.
    */
    AutoRowCountFrequency: number | null = null;

    /**
    * * Field Name: RowCount
    * * Display Name: Row Count
    * * SQL Data Type: bigint
    * * Description: Cached row count for this entity, populated by automatic row count processes when AutoRowCountFrequency is configured.
    */
    RowCount: number | null = null;

    /**
    * * Field Name: RowCountRunAt
    * * Display Name: Row Count Run At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp indicating when the last automatic row count was performed for this entity.
    */
    RowCountRunAt: Date | null = null;

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(25)
    * * Default Value: Active
    * * Description: Status of the entity. Active: fully functional; Deprecated: functional but generates console warnings when used; Disabled: not available for use even though metadata and physical table remain.
    */
    Status: 'Active' | 'Deprecated' | 'Disabled' = 'Active';



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
    private _Settings: EntitySettingInfo[]
    private _FieldCategories: Record<string, FieldCategoryInfo> | null = null
    private _OrganicKeys: EntityOrganicKeyInfo[] = []
    _hasIdField: boolean = false
    _virtualCount: number = 0
    _manyToManyCount: number = 0
    _oneToManyCount: number = 0
    _floatCount: number = 0

    /**
     * Returns the primary key field for the entity. For entities with a composite primary key, use the PrimaryKeys property which returns all.
     * In the case of a composite primary key, the PrimaryKey property will return the first field in the sequence of the primary key fields.
     */
    get FirstPrimaryKey(): EntityFieldInfo {
        return this.Fields.find((f) => f.IsPrimaryKey);
    }

    /**
     * Returns an array of all fields that are part of the primary key for the entity. If the entity has a single primary key, the array will have a single element.
     */
    get PrimaryKeys(): EntityFieldInfo[] {
        return this.Fields.filter((f) => f.IsPrimaryKey);
    }

    /**
     * Returns an array of all fields that have unique constraints on them.
     * @returns {EntityFieldInfo[]} Array of fields with unique constraints
     */
    get UniqueKeys(): EntityFieldInfo[] {
        return this.Fields.filter((f) => f.IsUnique);
    }

    /**
     * Returns an array of all fields that are foreign keys to other entities.
     * @returns {EntityFieldInfo[]} Array of foreign key fields
     */
    get ForeignKeys(): EntityFieldInfo[] {
        return this.Fields.filter((f) => f.RelatedEntityID && f.RelatedEntityID.length > 0);
    }

    /**
     * Returns an array of all fields that are configured for encryption.
     * These fields will be automatically encrypted at rest and decrypted on load.
     * @returns {EntityFieldInfo[]} Array of encrypted fields
     */
    get EncryptedFields(): EntityFieldInfo[] {
        return this.Fields.filter((f) => f.Encrypt);
    }

    /**
     * Gets all fields for this entity with their complete metadata.
     * @returns {EntityFieldInfo[]} Array of all entity fields
     */
    get Fields(): EntityFieldInfo[] {
        return this._Fields;
    }
    /**
     * Gets all relationships where other entities reference this entity.
     * @returns {EntityRelationshipInfo[]} Array of entity relationships
     */
    get RelatedEntities(): EntityRelationshipInfo[] {
        return this._RelatedEntities;
    }
    /**
     * Gets the security permissions for this entity by role.
     * @returns {EntityPermissionInfo[]} Array of permission settings
     */
    get Permissions(): EntityPermissionInfo[] {
        return this._Permissions;
    }
    /**
     * Gets custom configuration settings for this entity.
     * @returns {EntitySettingInfo[]} Array of entity-specific settings
     */
    get Settings(): EntitySettingInfo[] {
        return this._Settings;
    }

    /**
     * Gets the parsed FieldCategoryInfo map for this entity, keyed by category name.
     * Auto-populated from the 'FieldCategoryInfo' EntitySetting (with legacy 'FieldCategoryIcons' fallback)
     * during EntityInfo construction. Returns null if no category info is configured.
     */
    get FieldCategories(): Record<string, FieldCategoryInfo> | null {
        return this._FieldCategories;
    }

    /**
     * Gets the organic keys defined on this entity. Organic keys enable cross-entity
     * relationships based on shared business data (email, phone, SSN, etc.) rather than
     * foreign key references. Only active organic keys are included.
     * @returns {EntityOrganicKeyInfo[]} Array of organic key definitions with their related entities
     */
    get OrganicKeys(): EntityOrganicKeyInfo[] {
        return this._OrganicKeys;
    }

    private static __createdAtFieldName = '__mj_CreatedAt';
    private static __updatedAtFieldName = '__mj_UpdatedAt';
    private static __deletedAtFieldName = '__mj_DeletedAt';
    /**
     * Returns the name of the special reserved field that is used to store the CreatedAt timestamp across all of MJ. This is only used when an entity has TrackRecordChanges turned on
     */
    public static get CreatedAtFieldName(): string {
        return EntityInfo.__createdAtFieldName;
    }
    /**
     * Returns the name of the special reserved field that is used to store the UpdatedAt timestamp across all of MJ. This is only used when an entity has TrackRecordChanges turned on
     */
    public static get UpdatedAtFieldName(): string {
        return EntityInfo.__updatedAtFieldName;
    }
    /**
     * Returns the name of the special reserved field that is used to store the DeletedAt timestamp across all of MJ. This is only used when an entity has DeleteType=Soft
     */
    public static get DeletedAtFieldName(): string {
        return EntityInfo.__deletedAtFieldName;
    }

    /**
     * This static factory method is used to check to see if the entity in question is active or not
     * If it is not active, it will throw an exception or log a warning depending on the status of the entity being
     * either Deprecated or Disabled.
     * @param entity - the EntityInfo object to check the status of 
     * @param callerName - the name of the caller that is calling this method, used for logging purposes such as BaseEntity::constructor as an example.
     */
    public static AssertEntityActiveStatus(entity: EntityInfo, callerName: string) {
        if (!entity) {
            throw new Error(`Entity must be provided to call AssertEntityActiveStatus. Caller: ${callerName}`);
        }
        if (entity.Status?.trim().toLowerCase() === 'deprecated') {
            // Record deprecation warning - will be batched and displayed after debounce period
            WarningManager.Instance.RecordEntityDeprecationWarning(
                entity.Name,
                callerName
            );
        }
        else if (entity.Status?.trim().toLowerCase() === 'disabled') {
            // console.error and throw the exception
            const exceptionString = `${callerName}: Entity ${entity.Name} is disabled and cannot be used.`;
            LogError(exceptionString);
            throw new Error(exceptionString);
        }
    }

    /**
     * @returns The BaseTable but with spaces inbetween capital letters
     * */
    get BaseTableDisplayName(): string {
        return this.BaseTable.replace(/([A-Z])/g, ' $1').trim();
    }

    /**
     * Returns the DisplayName if it exists, otherwise returns the Name.
     */
    get DisplayNameOrName(): string {
        return this.DisplayName ? this.DisplayName : this.Name;
    }

    /**
     * Returns the EntityField object for the Field that has IsNameField set to true. If multiple fields have IsNameField on, the function will return the first field (by sequence) that matches. 
     * If no fields match, if there is a field called "Name", that is returned. If there is no field called "Name", null is returned.
     */
    get NameField(): EntityFieldInfo | null {
      // Multiple fields can have IsNameField=true (e.g. Entity has both `Name`
      // and `DisplayName` marked). Without a deterministic preference, the
      // pick depends on `this.Fields` insertion order — which differs between
      // SQL Server (where `Name` happens to come first) and PostgreSQL (where
      // `DisplayName` does). Codegen builds JOIN aliases off NameField, so
      // the divergence produces views like `vwDatasetItems` that SELECT the
      // wrong column on PG (`DisplayName AS "Entity"` instead of
      // `Name AS "Entity"`), and downstream consumers like
      // TemplateEngineBase.GetDatasetByName then look up `"Templates"`
      // (the DisplayName) instead of `"MJ: Templates"` (the actual Name) and
      // crash with `Entity Templates not found in metadata`.
      //
      // Resolution rule: when more than one field claims IsNameField, prefer
      // the one literally named `Name`. Falls back to the first IsNameField
      // match (preserves prior behavior when there's no `Name` field), then
      // to a field named `Name` even without IsNameField set (legacy default).
      const candidates = this.Fields.filter((f) => f.IsNameField);
      if (candidates.length > 1) {
        const literalName = candidates.find((f) => f.Name?.trim().toLowerCase() === 'name');
        if (literalName) return literalName;
      }
      if (candidates.length > 0) return candidates[0];
      return this.Fields.find((f) => f.Name?.trim().toLowerCase() === 'name') ?? null;
    }

    /**************************************************************************
     * IS-A Type Relationship Computed Properties
     *
     * These properties support the IS-A (parent/child type) inheritance model
     * where child entities share their parent's primary key and inherit all
     * parent fields. Example: Meeting IS-A Product, Webinar IS-A Meeting.
     **************************************************************************/

    /**
     * Returns the parent EntityInfo for IS-A type inheritance, or null if this entity
     * has no parent type. Uses the existing ParentID column on the Entity table.
     * Example: For "Meetings" entity with ParentID pointing to "Products", returns the Products EntityInfo.
     */
    get ParentEntityInfo(): EntityInfo | null {
        if (!this.ParentID) return null;
        const p = Metadata.Provider;  // global-provider-ok: stateless info class — proxies to global metadata
        if (p?.EntityByID) {
            return p.EntityByID(this.ParentID) ?? null;
        }
        return p?.Entities?.find(e => UUIDsEqual(e.ID, this.ParentID)) ?? null;
    }

    /**
     * Returns all child entities that have their ParentID set to this entity's ID.
     * These represent IS-A type specializations of this entity.
     * Example: For "Products" entity, might return [Meetings, Publications].
     *
     * When `AllowMultipleSubtypes` is true on this entity, multiple children can
     * coexist for the same parent record (overlapping subtypes). When false (default),
     * only one child type is allowed per parent record (disjoint subtypes).
     */
    get ChildEntities(): EntityInfo[] {
        return Metadata.Provider?.Entities?.filter(e => UUIDsEqual(e.ParentID, this.ID)) ?? [];  // global-provider-ok: stateless info class — proxies to global metadata
    }

    /**
     * Convenience alias: returns true when this entity is a parent type that allows
     * overlapping (non-disjoint) subtypes. Equivalent to checking both
     * `IsParentType` and `AllowMultipleSubtypes`.
     */
    get HasOverlappingSubtypes(): boolean {
        return this.IsParentType && this.AllowMultipleSubtypes;
    }

    // Cache for ParentChain to avoid repeated walks
    private _parentChainCache: EntityInfo[] | null = null;

    /**
     * Walks the IS-A chain upward from this entity to the root, returning all parent entities.
     * Does NOT include this entity itself.
     * Example: For Webinars (IS-A Meetings IS-A Products), returns [Meetings, Products].
     * Results are cached after first computation for performance.
     */
    get ParentChain(): EntityInfo[] {
        if (this._parentChainCache !== null) return this._parentChainCache;

        const chain: EntityInfo[] = [];
        let current = this.ParentEntityInfo;
        const visited = new Set<string>(); // circular reference protection
        while (current) {
            if (visited.has(current.ID)) break; // prevent infinite loop
            visited.add(current.ID);
            chain.push(current);
            current = current.ParentEntityInfo;
        }
        this._parentChainCache = chain;
        return chain;
    }

    /**
     * Returns true if this entity is a child type in an IS-A relationship (has a parent entity).
     */
    get IsChildType(): boolean {
        return this.ParentID != null;
    }

    /**
     * Returns true if this entity is a parent type in an IS-A relationship (has child entities).
     */
    get IsParentType(): boolean {
        return this.ChildEntities.length > 0;
    }

    /**
     * Returns all fields from all parent entities in the IS-A chain, excluding primary keys,
     * virtual fields, and timestamp fields (__mj_ prefixed). These represent the inherited
     * fields that should be available on child entities.
     */
    get AllParentFields(): EntityFieldInfo[] {
        const fields: EntityFieldInfo[] = [];
        for (const parent of this.ParentChain) {
            fields.push(...parent.Fields.filter(
                f => !f.IsPrimaryKey && !f.Name.startsWith('__mj_') && !f.IsVirtual
            ));
        }
        return fields;
    }

    // Cache for ParentEntityFieldNames
    private _parentEntityFieldNamesCache: Set<string> | null = null;

    /**
     * Returns a cached Set of field names that belong to parent entities in the IS-A chain,
     * including the shared primary key(s). Used for efficient field routing in
     * BaseEntity.Set/Get/SetMany/Hydrate operations.
     * The Set enables O(1) lookup to determine if a field should be routed to the parent entity.
     *
     * Note: AllParentFields excludes PKs (they aren't "inherited data" fields), but the
     * routing set must include them so that SetMany and Hydrate can forward the shared
     * IS-A primary key to parent entities.
     */
    get ParentEntityFieldNames(): Set<string> {
        if (this._parentEntityFieldNamesCache !== null) return this._parentEntityFieldNamesCache;

        const names = this.AllParentFields.map(f => f.Name);

        // Add shared PK names from the immediate parent — these are excluded from
        // AllParentFields but must be routed so parent entities receive their identity.
        const parentEntity = this.ParentEntityInfo;
        if (parentEntity) {
            for (const pk of parentEntity.PrimaryKeys) {
                if (!names.includes(pk.Name)) {
                    names.push(pk.Name);
                }
            }
        }

        this._parentEntityFieldNamesCache = new Set(names);
        return this._parentEntityFieldNamesCache;
    }

    /**
     * Returns the Permissions for this entity for a given user, based on the roles the user is part of.
     *
     * Allow rows are OR-aggregated across all of the user's matching roles; any single
     * Allow on an action yields permission for that action. Deny rows from any matching
     * role then *subtract* from the aggregated Allow set — so a Deny on `CanDelete`
     * overrides a Delete grant that the user otherwise has from another role. This lets
     * administrators carve out specific role exclusions without restructuring the Allow
     * hierarchy. Rows with a missing/unknown Type default to Allow for backwards
     * compatibility with data written before the Type column existed (Phase 2b).
     */
    public GetUserPermisions(user: UserInfo ): EntityUserPermissionInfo {
        try {
            const permissionList: EntityPermissionInfo[] =[];

            for (let j: number = 0; j < this.Permissions.length; j++) {
                const ep: EntityPermissionInfo = this.Permissions[j];
                const roleMatch: UserRoleInfo = user.UserRoles?.find((r) => UUIDsEqual(r.RoleID, ep.RoleID))
                if (roleMatch) // user has this role
                    permissionList.push(ep)
            }

            // Aggregate Allow and Deny separately, then subtract Deny from Allow per action.
            const allow = { CanCreate: false, CanRead: false, CanUpdate: false, CanDelete: false };
            const deny = { CanCreate: false, CanRead: false, CanUpdate: false, CanDelete: false };
            for (const ep of permissionList) {
                const isDeny = (ep.Type || 'Allow').trim().toLowerCase() === 'deny';
                const bucket = isDeny ? deny : allow;
                bucket.CanCreate = bucket.CanCreate || !!ep.CanCreate;
                bucket.CanRead   = bucket.CanRead   || !!ep.CanRead;
                bucket.CanUpdate = bucket.CanUpdate || !!ep.CanUpdate;
                bucket.CanDelete = bucket.CanDelete || !!ep.CanDelete;
            }

            const userPermission: EntityUserPermissionInfo = new EntityUserPermissionInfo();
            userPermission.CanCreate = allow.CanCreate && !deny.CanCreate;
            userPermission.CanRead   = allow.CanRead   && !deny.CanRead;
            userPermission.CanUpdate = allow.CanUpdate && !deny.CanUpdate;
            userPermission.CanDelete = allow.CanDelete && !deny.CanDelete;
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
            const roleMatch: UserRoleInfo = user.UserRoles?.find((r) => UUIDsEqual(r.RoleID, ep.RoleID))
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
            const roleMatch: UserRoleInfo = user.UserRoles?.find((r) => UUIDsEqual(r.RoleID, ep.RoleID))
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
                    const existingMatch: RowLevelSecurityFilterInfo = rlsList.find((r) => UUIDsEqual(r.ID, matchObject.ID));
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
            // currently we only support a single value for FOREIGN KEYS, so we can just grab the first value in the primary key
            const firstKey = record.FirstPrimaryKey;
            keyValue = firstKey.Value;
            //When creating a new record, the keyValue is null and the quotes are not needed
            quotes = keyValue && firstKey.NeedsQuotes ? "'" : '';
        }
        if (relationship.Type.trim().toLowerCase() === 'one to many') {
            // one to many
            params.ExtraFilter = `[${relationship.RelatedEntityJoinField}] = ${quotes}${keyValue}${quotes}`;
        }
        else {
            // many to many
            params.ExtraFilter = `[${relationship.RelatedEntityJoinField}] IN (SELECT [${relationship.JoinEntityInverseJoinField}] FROM [${relationship.JoinView}] WHERE [${relationship.JoinEntityJoinField}] = ${quotes}${keyValue}${quotes})`;
        }

        if (filter && filter.length > 0) 
            params.ExtraFilter = `(${params.ExtraFilter}) AND (${filter})`; // caller provided their own filter, so AND it in with the relationship filter we have here

        if (relationship.DisplayUserViewID && relationship.DisplayUserViewID.length > 0) {
            // we have been given a specific view to run, use it
            params.ViewID = relationship.DisplayUserViewID;  
        }
        else {
            // no view specified, so specify the entity instead
            params.EntityName = relationship.RelatedEntity;
        }

        if (maxRecords && maxRecords > 0)   
            params.MaxRows = maxRecords;

        return params;
    }
    
    /**
     * Builds a simple javascript object that will pre-populate a new record in the related entity with values that link back to the specified record. 
     * This is useful, for example, when creating a new contact from an account, we want to pre-populate the account ID in the new contact record
     */
    public static BuildRelationshipNewRecordValues(record: BaseEntity, relationship: EntityRelationshipInfo): any {
        // we want to build a simple javascript object that will pre-populate a new record in the related entity with values that link
        // abck to the current record. This is useful for example when creating a new contact from an account, we want to pre-populate the
        // account ID in the new contact record
        const obj: any = {};
        if (record && relationship) {
            const keyField = relationship.EntityKeyField && relationship.EntityKeyField.trim().length > 0 ? relationship.EntityKeyField : record.FirstPrimaryKey.Name;
            obj[relationship.RelatedEntityJoinField] = record.Get(keyField);
        }
        return obj;
    }

    /**
     * Returns a RunViewParams object configured to query the related entity matched via an organic key.
     * Supports both direct field matching and transitive matching via SQL views/tables.
     * @param record - The current record whose organic key values will be used for matching
     * @param organicKeyRelatedEntity - The organic key related entity configuration
     * @param organicKey - The parent organic key definition
     * @param filter - Optional additional SQL filter to AND with the organic key filter
     * @param maxRecords - Optional max rows to return
     * @returns RunViewParams ready to pass to RunView
     */
    public static BuildOrganicKeyViewParams(
        record: BaseEntity,
        organicKeyRelatedEntity: EntityOrganicKeyRelatedEntityInfo,
        organicKey: EntityOrganicKeyInfo,
        filter?: string,
        maxRecords?: number
    ): RunViewParams {
        const params: RunViewParams = {};
        const matchFields = organicKey.MatchFieldNamesArray;

        if (organicKeyRelatedEntity.IsTransitiveMatch) {
            params.ExtraFilter = EntityInfo.BuildTransitiveOrganicKeyFilter(record, organicKeyRelatedEntity, organicKey, matchFields);
        } else {
            params.ExtraFilter = EntityInfo.BuildDirectOrganicKeyFilter(record, organicKeyRelatedEntity, organicKey, matchFields);
        }

        if (filter && filter.length > 0) {
            params.ExtraFilter = `(${params.ExtraFilter}) AND (${filter})`;
        }

        params.EntityName = organicKeyRelatedEntity.RelatedEntity;

        if (maxRecords && maxRecords > 0) {
            params.MaxRows = maxRecords;
        }

        return params;
    }

    /**
     * Builds an ExtraFilter for direct organic key matching (field-to-field comparison).
     */
    private static BuildDirectOrganicKeyFilter(
        record: BaseEntity,
        relatedEntity: EntityOrganicKeyRelatedEntityInfo,
        organicKey: EntityOrganicKeyInfo,
        matchFields: string[]
    ): string {
        const relatedFields = relatedEntity.RelatedEntityFieldNamesArray;
        const conditions: string[] = [];

        for (let i = 0; i < matchFields.length; i++) {
            const value = record.Get(matchFields[i]);
            if (value == null) {
                // NULL values can't match — return a filter that yields no results
                return '1=0';
            }
            const relatedField = relatedFields[i] || matchFields[i];
            const escapedValue = String(value).replace(/'/g, "''");
            conditions.push(EntityInfo.WrapWithNormalization(
                `[${relatedField}]`, organicKey, escapedValue
            ));
        }

        return conditions.join(' AND ');
    }

    /**
     * Builds an ExtraFilter for transitive organic key matching (via SQL view/table subquery).
     */
    private static BuildTransitiveOrganicKeyFilter(
        record: BaseEntity,
        relatedEntity: EntityOrganicKeyRelatedEntityInfo,
        organicKey: EntityOrganicKeyInfo,
        matchFields: string[]
    ): string {
        const transitiveMatchFields = relatedEntity.TransitiveObjectMatchFieldNamesArray;
        const conditions: string[] = [];

        for (let i = 0; i < matchFields.length; i++) {
            const value = record.Get(matchFields[i]);
            if (value == null) {
                return '1=0';
            }
            const transitiveField = transitiveMatchFields[i] || matchFields[i];
            const escapedValue = String(value).replace(/'/g, "''");
            conditions.push(EntityInfo.WrapWithNormalization(
                `[${transitiveField}]`, organicKey, escapedValue
            ));
        }

        // TransitiveObjectName is schema-qualified (e.g. "mailchimp.vwBridge") — bracket each part separately
        const transitiveObject = relatedEntity.TransitiveObjectName!.split('.').map(p => `[${p}]`).join('.');
        return `[${relatedEntity.RelatedEntityJoinFieldName}] IN (SELECT [${relatedEntity.TransitiveObjectOutputFieldName}] FROM ${transitiveObject} WHERE ${conditions.join(' AND ')})`;
    }

    /**
     * Wraps a field expression and a literal value with the appropriate normalization
     * based on the organic key's NormalizationStrategy.
     * Returns a SQL comparison expression like: LOWER(LTRIM(RTRIM([Field]))) = LOWER(LTRIM(RTRIM('value')))
     */
    private static WrapWithNormalization(
        fieldExpression: string,
        organicKey: EntityOrganicKeyInfo,
        escapedValue: string
    ): string {
        switch (organicKey.NormalizationStrategy) {
            case 'LowerCaseTrim':
                return `LOWER(LTRIM(RTRIM(${fieldExpression}))) = LOWER(LTRIM(RTRIM('${escapedValue}')))`;
            case 'Trim':
                return `LTRIM(RTRIM(${fieldExpression})) = LTRIM(RTRIM('${escapedValue}'))`;
            case 'ExactMatch':
                return `${fieldExpression} = '${escapedValue}'`;
            case 'Custom': {
                const expr = organicKey.CustomNormalizationExpression;
                if (!expr) {
                    // Fall back to exact match if no custom expression defined
                    return `${fieldExpression} = '${escapedValue}'`;
                }
                const normalizedField = expr.replace(/\{\{FieldName\}\}/g, fieldExpression);
                const normalizedValue = expr.replace(/\{\{FieldName\}\}/g, `'${escapedValue}'`);
                return `${normalizedField} = ${normalizedValue}`;
            }
            default:
                return `${fieldExpression} = '${escapedValue}'`;
        }
    }


    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);

            // do some special handling to create class instances instead of just data objects
            // copy the Entity Fields (accept EntityFields, _Fields, or Fields as input names)
            this._Fields = [];
            const ef = initData.EntityFields || initData._Fields || initData.Fields;
            if (ef) {
                for (let j = 0; j < ef.length; j++) {
                    this._Fields.push(new EntityFieldInfo(ef[j]));
                }
            }

            // copy the Entity Permissions
            this._Permissions = [];
            const ep = initData.EntityPermissions || initData._Permissions || initData.Permissions;
            if (ep) {
                for (let j = 0; j < ep.length; j++) {
                    this._Permissions.push(new EntityPermissionInfo(ep[j]));
                }
            }

            // copy the Entity settings
            this._Settings = [];
            const es = initData.EntitySettings || initData._Settings || initData.Settings;
            if (es) {
                es.map((s) => this._Settings.push(new EntitySettingInfo(s)));
            }

            // auto-populate FieldCategories from the FieldCategoryInfo setting
            this._FieldCategories = this.parseFieldCategoriesFromSettings();

            // copy the Related Entities (accept EntityRelationships, _RelatedEntities, or RelatedEntities as input names)
            this._RelatedEntities = [];
            const er = initData.EntityRelationships || initData._RelatedEntities || initData.RelatedEntities;
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

            // copy the Organic Keys (sorted by sequence inside EntityOrganicKeyInfo constructor)
            this._OrganicKeys = [];
            const ok = initData.EntityOrganicKeys || initData._OrganicKeys || initData.OrganicKeys;
            if (ok && Array.isArray(ok)) {
                for (const item of ok) {
                    this._OrganicKeys.push(new EntityOrganicKeyInfo(item));
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

    /**
     * Parses FieldCategoryInfo from EntitySettings, with legacy FieldCategoryIcons fallback.
     * Called once during construction so the result is cached on _FieldCategories.
     */
    private parseFieldCategoriesFromSettings(): Record<string, FieldCategoryInfo> | null {
        if (!this._Settings || this._Settings.length === 0) {
            return null;
        }

        // Try new format first
        const infoSetting = this._Settings.find(s => s.Name === 'FieldCategoryInfo');
        if (infoSetting?.Value) {
            const parsed = SafeJSONParse<Record<string, FieldCategoryInfo>>(infoSetting.Value, false);
            if (parsed) {
                return parsed;
            }
        }

        // Fallback to legacy FieldCategoryIcons format (icon-only map)
        const iconSetting = this._Settings.find(s => s.Name === 'FieldCategoryIcons');
        if (iconSetting?.Value) {
            const icons = SafeJSONParse<Record<string, string>>(iconSetting.Value, false);
            if (icons) {
                const result: Record<string, FieldCategoryInfo> = {};
                for (const [category, icon] of Object.entries(icons)) {
                    result[category] = { icon, description: '' };
                }
                return result;
            }
        }

        return null;
    }
}

// Re-export validation types from @memberjunction/global for backward compatibility
export { ValidationErrorType, ValidationErrorInfo, ValidationResult } from '@memberjunction/global';

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
     * The value of the primary key field in the parent record. MemberJunction supports composite(multi-field) primary keys. However, foreign keys only support links to single-valued primary keys in their linked entity.
     */
    PrimaryKey: CompositeKey
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
    RecordMergeLogID: string | null
    /**
     * The details of the merge operation, including the status of each record that was merged
     */
    RecordStatus: RecordMergeDetailResult[]
    /**
     * The original merge request that was passed in
     */
    Request: RecordMergeRequest
}