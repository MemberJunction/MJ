import { BaseEntity, EntityField } from "./baseEntity";
import { EntityDependency, EntityFieldInfo, EntityInfo, KeyValuePair, RecordChange, RecordDependency, RecordMergeRequest, RecordMergeResult } from "./entityInfo";
import { ApplicationInfo } from "./applicationInfo";
import { RunViewParams } from "../views/runView";
import { AuditLogTypeInfo, AuthorizationInfo, RoleInfo, RowLevelSecurityFilterInfo, UserInfo } from "./securityInfo";
import { TransactionGroupBase } from "./transactionGroup";
import { RunReportParams } from "./runReport";
import { QueryCategoryInfo, QueryFieldInfo, QueryInfo, QueryPermissionInfo } from "./queryInfo";
import { RunQueryParams } from "./runQuery";

export class ProviderConfigDataBase {
    private _includeSchemas: string[] = [];
    private _excludeSchemas: string[] = [];
    private _MJCoreSchemaName: string = '__mj';
    private _data: any;
    public get Data(): any {
        return this._data;
    }
    public get IncludeSchemas(): string[] {
        return this._includeSchemas;
    }
    public get MJCoreSchemaName(): string {
        return this._MJCoreSchemaName;
    }
    public get ExcludeSchemas(): string[] {
        return this._excludeSchemas;
    }
    constructor(data: any, MJCoreScemaName: string = '__mj', includeSchemas?: string[], excludeSchemas?: string[]) {
        this._data = data;
        this._MJCoreSchemaName = MJCoreScemaName;
        if (includeSchemas)
            this._includeSchemas = includeSchemas;
        if (excludeSchemas)
            this._excludeSchemas = excludeSchemas;
    }
}

export class MetadataInfo {
    ID: number
    Type: string
    UpdatedAt: Date
}

export const ProviderType = {
    Database: 'Database',
    Network: 'Network',
} as const;

export type ProviderType = typeof ProviderType[keyof typeof ProviderType];

export class CompositeKey {

    KeyValuePairs: KeyValuePair[];

    constructor() {
        this.KeyValuePairs = [];
    }

    /** 
    * @returns a string representation of the primary key values in the format "FieldName=Value
    * @example "ID=1 AND Name=John"
    * @param useIsNull if true, will return "FieldName IS NULL" for any key value pair that has a null or undefined value
    */
    ToString(useIsNull?: boolean): string {
        return this.KeyValuePairs.map((keyValue: KeyValuePair) => {
            if(useIsNull && (keyValue.Value === null || keyValue.Value === undefined)){
                return `${keyValue.FieldName} IS NULL`;
            }

            return `${keyValue.FieldName}=${keyValue.Value}`;
        }).join(" AND ");
    }

    /**
    * @returns a copy of the KeyValuePairs array but with the Value properties as type string
    */
    ValuesAsString(): KeyValuePair[] {
        return this.KeyValuePairs.map((keyValue: KeyValuePair) => {
            return {
                FieldName: keyValue.FieldName,
                Value: keyValue.Value.toString()
            }
        });
    }

    /**
     * Utility function to return a copy of the CompositeKey with the Value properties as string
     * @returns a copy of the KeyValuePairs array but with the Value properties as string
     */
    GraphQLCopy(): CompositeKey {
        let copy = new CompositeKey();
        copy.KeyValuePairs = this.ValuesAsString();
        return copy;
    }

    /**
    * @returns the KeyValuePairs as a list of strings in the format "FieldName=Value"
    * @param delimiter the delimiter to use between the field name and value. Defaults to '='
    * @example ["ID=1", "Name=John"]
    */
    ToList(delimiter?: string): string[] {
        return this.KeyValuePairs.map((pk) => {
            return delimiter ? `${pk.FieldName}${delimiter}${pk.Value}` : `${pk.FieldName}=${pk.Value}`;
        });
    }

    /**
     * @returns the value of each key value pair in the format "Value1, Value2, Value3"
     * @param delimiter - the delimiter to use between the values. Defaults to ', '
     * @example "1, John"
     */
    Values(delimiter?: string): string {
        return this.KeyValuePairs.map((keyValue: KeyValuePair) => {
            return keyValue.Value;
        }).join(delimiter || ", ");
    }

    /**
    * Utility function to compare the key primary key of this object to another sets to see if they are the same or not
    * @param kvPairs the primary key values to compare against
    * @returns true if the primary key values are the same, false if they are different
    */
    EqualsKey(kvPairs: KeyValuePair[]): boolean {
        if(!kvPairs || kvPairs.length === 0){
            return false;
        }

        if (kvPairs.length !== this.KeyValuePairs.length){
            return false;
        }

        for( const [index, kvPair] of kvPairs.entries()){
            const sourcekvPair = this.KeyValuePairs[index];
            if(kvPair.FieldName !== sourcekvPair.FieldName || kvPair.Value !== sourcekvPair.Value){
                return false;
            }
        }

        return true;
    }

    /**
    * Utility function to compare this composite key to another
    * @param compositeKey the composite key to compare against
    * @returns true if the primary key values are the same, false if they are different
    */
    Equals(compositeKey: CompositeKey): boolean {
        if(!compositeKey){
            return false;
        }

        return this.EqualsKey(compositeKey.KeyValuePairs);
    }

    LoadFromEntityFields(fields: EntityField[]): void {
        this.KeyValuePairs = fields.map((field) => {
            return {
                FieldName: field.Name,
                Value: field.Value
            }
        });
    }

    LoadFromEntityInfoAndRecord(entity: EntityInfo, entityRecord: any): void {
        this.KeyValuePairs = entity.PrimaryKeys.map((pk) => {
            return {
                FieldName: pk.Name,
                Value: entityRecord[pk.Name]
            }
        });
    }

    /**
     * Loads the KeyValuePairs from a list of strings in the format "FieldName=Value"
     * @param list - the list of strings to load from
     * @param delimiter - the delimiter to use between the field name and value. Defaults to '='
     */
    LoadFromList(list: string[], delimiter?: string): void {
        this.KeyValuePairs = list.map((pk: string) => {
            let keyValue = delimiter ? pk.split(delimiter) : pk.split("=");
            if(keyValue.length === 2){
                let keyValuePair: KeyValuePair = new KeyValuePair();
                keyValuePair.FieldName = keyValue[0];
                keyValuePair.Value = keyValue[1];
                return keyValuePair;
            }
            return;
        });
    }

    
    ToURLSegment(segment?: string): string {
        return this.KeyValuePairs.map((pk) => {
            return `${pk.FieldName}|${pk.Value}`;
        }).join(segment || "||");
    }

    LoadFromURLSegment(entity: EntityInfo, routeSegment: string, segment?: string): void {
        if (!routeSegment.includes('|')) {
          // If not, return a single element array with a default field name
          this.KeyValuePairs = [{ FieldName: entity.PrimaryKey.Name, Value: routeSegment }];
        }
        else {
          const parts = segment ? routeSegment.split(segment) : routeSegment.split('||');
          const pkVals: KeyValuePair[] = [];
          for (let p of parts) {
            const kv = p.split('|');
            pkVals.push({ FieldName: kv[0], Value: kv[1] });
          }

          this.KeyValuePairs = pkVals;
        }
    }
}

export class PotentialDuplicate extends CompositeKey {
    ProbabilityScore: number;
}

export class PotentialDuplicateRequest {
    /**
    * The ID of the entity the record belongs to
    **/
    EntityID: number;
    /**
    * The ID of the List entity to use
    **/
    ListID: number
    /**
     * The Primary Key values of each record
     * we're checking for duplicates
     */
    RecordIDs: CompositeKey[]; 
    /**
    * The ID of the entity document to use
    **/
    EntityDocumentID?: number;
    /**
    * The minimum score in order to consider a record a potential duplicate
    **/
    ProbabilityScore?: number;

    /**
    * Additional options to pass to the provider
    **/
    Options?: any;
}

export class PotentialDuplicateResult {
    EntityID: number;
    RecordCompositeKey: CompositeKey;
    Duplicates: PotentialDuplicate[];
    DuplicateRunDetailMatchRecordIDs: number[];
}

//Wrapper for the PotentialDuplicateResponse class that includes  additional properties
export class PotentialDuplicateResponse {
    Status: 'Inprogress' | 'Success' | 'Error';
    ErrorMessage?: string;
    PotentialDuplicateResult: PotentialDuplicateResult[];
}

export interface IEntityDataProvider {
    Config(configData: ProviderConfigDataBase): Promise<boolean>

    Load(entity: BaseEntity, CompositeKey: CompositeKey, EntityRelationshipsToLoad: string[], user: UserInfo) : Promise<{}>  

    Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions) : Promise<{}>  

    Delete(entity: BaseEntity, user: UserInfo) : Promise<boolean>

    GetRecordChanges(entityName: string, CompositeKey: CompositeKey): Promise<RecordChange[]>
}

export class EntitySaveOptions {
    IgnoreDirtyState: boolean = false;
    SkipEntityAIActions?: boolean = false;
}

export class EntityRecordNameInput  {
    EntityName: string;
    CompositeKey: CompositeKey;
}

export class EntityRecordNameResult  {
    Success: boolean;
    Status: string;
    CompositeKey: CompositeKey
    EntityName: string;
    RecordName?: string;
 }

export interface ILocalStorageProvider {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
}

export interface IMetadataProvider {
    get ProviderType(): ProviderType

    Config(configData: ProviderConfigDataBase): Promise<boolean>

    get Entities(): EntityInfo[]

    get Applications(): ApplicationInfo[]

    get CurrentUser(): UserInfo

    get Roles(): RoleInfo[]

    get RowLevelSecurityFilters(): RowLevelSecurityFilterInfo[]

    get AuditLogTypes(): AuditLogTypeInfo[]

    get Authorizations(): AuthorizationInfo[]

    get Queries(): QueryInfo[]

    get QueryFields(): QueryFieldInfo[]

    get QueryCategories(): QueryCategoryInfo[]

    get QueryPermissions(): QueryPermissionInfo[]

    get LatestRemoteMetadata(): MetadataInfo[]

    get LatestLocalMetadata(): MetadataInfo[]

    LocalMetadataObsolete(type?: string): boolean

    GetEntityObject<T extends BaseEntity>(entityName: string, contextUser: UserInfo): Promise<T>
    /**
     * Returns a list of dependencies - records that are linked to the specified Entity/RecordID combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
     * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
     * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
     * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
     * @param entityName the name of the entity to check
     * @param CompositeKey the compositeKey for the record to check
     */
    GetRecordDependencies(entityName: string, CompositeKey: CompositeKey): Promise<RecordDependency[]>  

    /**
     * Returns a list of record IDs that are possible duplicates of the specified record. 
     * 
     * @param params Object containing many properties used in fetching records and determining which ones to return
     */
    GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse>

    /**
     * Returns a list of entity dependencies, basically metadata that tells you the links to this entity from all other entities.
     * @param entityName 
     * @returns 
     */
    GetEntityDependencies(entityName: string): Promise<EntityDependency[]> 

    /**
     * This method will merge two or more records based on the request provided. The RecordMergeRequest type you pass in specifies the record that will survive the merge, the records to merge into the surviving record, and an optional field map that can update values in the surviving record, if desired. The process followed is:
     * 1. A transaction is started
     * 2. The surviving record is loaded and fields are updated from the field map, if provided, and the record is saved. If a FieldMap not provided within the request object, this step is skipped.
     * 3. For each of the records that will be merged INTO the surviving record, we call the GetEntityDependencies() method and get a list of all other records in the database are linked to the record to be deleted. We then go through each of those dependencies and update the link to point to the SurvivingRecordID and save the record.
     * 4. The record to be deleted is then deleted.
     * 5. The transaction is committed if all of the above steps are succesful, otherwise it is rolled back.
     * 
     * The return value from this method contains detailed information about the execution of the process. In addition, all attempted merges are logged in the RecordMergeLog and RecordMergeDeletionLog tables.
     * 
     * @param request 
     * @returns 
     */
    MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo): Promise<RecordMergeResult> 


    /**
     * Returns the Name of the specific recordId for a given entityName. This is done by 
     * looking for the IsNameField within the EntityFields collection for a given entity. 
     * If no IsNameField is found, but a field called "Name" exists, that value is returned. Otherwise null returned 
     * @param entityName 
     * @param CompositeKey 
     * @returns the name of the record
     */
    GetEntityRecordName(entityName: string, CompositeKey: CompositeKey): Promise<string>

    /**
     * Returns one or more record names using the same logic as GetEntityRecordName, but for multiple records at once - more efficient to use this method if you need to get multiple record names at once
     * @param info 
     * @returns an array of EntityRecordNameResult objects
     */
    GetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]>

    GetRecordFavoriteStatus(userId: number, entityName: string, CompositeKey: CompositeKey): Promise<boolean>

    SetRecordFavoriteStatus(userId: number, entityName: string, CompositeKey: CompositeKey, isFavorite: boolean, contextUser: UserInfo): Promise<void>

    CreateTransactionGroup(): Promise<TransactionGroupBase>

    Refresh(): Promise<boolean>

    RefreshIfNeeded(): Promise<boolean>

    IsRefreshNeeded(): Promise<boolean>

    get LocalStorageProvider(): ILocalStorageProvider

    RefreshRemoteMetadataTimestamps(): Promise<boolean>

    SaveLocalMetadataToStorage(): Promise<void>
    
    RemoveLocalMetadataFromStorage(): Promise<void>

    /**
     * Always retrieves data from the server - this method does NOT check cache. To use cached local values if available, call GetAndCacheDatasetByName() instead
     * @param datasetName 
     * @param itemFilters 
     */
    GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType>;
    /**
     * Retrieves the date status information for a dataset and all its items from the server. This method will match the datasetName and itemFilters to the server's dataset and item filters to determine a match
     * @param datasetName 
     * @param itemFilters 
     */
    GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetStatusResultType>;

    /**
     * Gets a database by name, if required, and caches it in a format available to the client (e.g. IndexedDB, LocalStorage, File, etc). The cache method is Provider specific
     * If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    GetAndCacheDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType>  

    /**
     * This routine checks to see if the local cache version of a given datasetName/itemFilters combination is up to date with the server or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    IsDatasetCacheUpToDate(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> 

    /**
     * This routine gets the local cached version of a given datasetName/itemFilters combination, it does NOT check the server status first. 
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    GetCachedDataset(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType> 

    /**
     * Stores a dataset in the local cache. If itemFilters are provided, the combination of datasetName and the filters are used to build a key and determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     * @param dataset 
     */
    CacheDataset(datasetName: string, itemFilters: DatasetItemFilterType[], dataset: DatasetResultType): Promise<void> 

    /**
     * Determines if a given datasetName/itemFilters combination is cached locally or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    IsDatasetCached(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> 

    /**
     * Creates a key for the given datasetName and itemFilters combination
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    GetDatasetCacheKey(datasetName: string, itemFilters?: DatasetItemFilterType[]): string 

    /**
     * If the specified datasetName is cached, this method will clear the cache. If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    ClearDatasetCache(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<void> 

    /**
     * Provides access the configuration object that was initially provided to configure the provider
     */
    get ConfigData(): ProviderConfigDataBase
}

/**
 * Result of a RunView() execution
 */
export type RunViewResult = {
    /**
     * Was the view run successful or not
     */
    Success: boolean;
    /**
     * The array of records returned by the view, only valid if Success is true
     */
    Results: any[];
    /**
     * The newly created UserViews.ID value - only provided if RunViewParams.SaveViewResults=true
     */
    UserViewRunID?: number;
    /**
     * Number of rows returned in the Results[] array
     */
    RowCount: number;
    /**
     * Total number of rows that match the view criteria, not just the number returned in the Results[] array
     * This number will only be different when the view is configured to have a UserViewMaxRows value and the criteria of the view in question
     * has more than that # of rows. Otherwise it will be the same value as RowCount.
     */
    TotalRowCount: number;
    /**
     * Time elapsed in executing the view (in milliseconds)
     */
    ExecutionTime: number;
    /**
     * If Success is false, this will contain a message describing the error condition.
     */
    ErrorMessage: string;
}

export interface IRunViewProvider {
    Config(configData: ProviderConfigDataBase): Promise<boolean>

    RunView(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult>
}

export type RunQueryResult = {
    QueryID: number;
    Success: boolean;
    Results: any[];
    RowCount: number;
    ExecutionTime: number;
    ErrorMessage: string;
}

export interface IRunQueryProvider {
    Config(configData: ProviderConfigDataBase): Promise<boolean>

    RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult>
}

export type RunReportResult = {
    ReportID: number;
    Success: boolean;
    Results: any[];
    RowCount: number;
    ExecutionTime: number;
    ErrorMessage: string;
}

export interface IRunReportProvider {
    Config(configData: ProviderConfigDataBase): Promise<boolean>

    RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult>
}

export type DatasetResultType = {
    DatasetID: number;
    DatasetName: string;
    Success: boolean;
    Status: string;
    LatestUpdateDate: Date;
    Results: DatasetItemResultType[];
}

export type DatasetItemResultType = {
    Code: string;
    EntityName: string;
    EntityID: number;
    Results: any[];
}

export type DatasetItemFilterType = {
    ItemCode: string;
    Filter: string;
}

export type DatasetStatusResultType = {
    DatasetID: number;
    DatasetName: string;
    Success: boolean;
    Status: string;
    LatestUpdateDate: Date;
    EntityUpdateDates: DatasetStatusEntityUpdateDateType[];
 }

export type DatasetStatusEntityUpdateDateType = {
    EntityName: string;
    EntityID: number;
    UpdateDate: Date;
}   