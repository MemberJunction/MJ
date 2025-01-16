import { BaseEntity } from "./baseEntity";
import { EntityDependency, EntityDocumentTypeInfo, EntityInfo, RecordDependency, RecordMergeRequest, RecordMergeResult } from "./entityInfo";
import { IMetadataProvider, ProviderConfigDataBase, MetadataInfo, ILocalStorageProvider, DatasetResultType, DatasetStatusResultType, DatasetItemFilterType, EntityRecordNameInput, EntityRecordNameResult, ProviderType, PotentialDuplicateRequest, PotentialDuplicateResponse } from "./interfaces";
import { ApplicationInfo } from "../generic/applicationInfo";
import { AuditLogTypeInfo, AuthorizationInfo, RoleInfo, RowLevelSecurityFilterInfo, UserInfo } from "./securityInfo";
import { TransactionGroupBase } from "./transactionGroup";
import { MJGlobal } from "@memberjunction/global";
import { LogError, LogStatus } from "./logging";
import { QueryCategoryInfo, QueryFieldInfo, QueryInfo, QueryPermissionInfo } from "./queryInfo";
import { LibraryInfo } from "./libraryInfo";
import { CompositeKey } from "./compositeKey";
import { ExplorerNavigationItem } from "./explorerNavigationItem";

/**
 * AllMetadata is used to pass all metadata around in a single object for convenience and type safety.
 */
export class AllMetadata {
    CurrentUser: UserInfo = null;

    // Arrays of Metadata below
    AllEntities: EntityInfo[] = [];
    AllApplications: ApplicationInfo[] = [];
    AllRoles: RoleInfo[] = [];
    AllRowLevelSecurityFilters: RowLevelSecurityFilterInfo[] = [];
    AllAuditLogTypes: AuditLogTypeInfo[] = [];
    AllAuthorizations: AuthorizationInfo[] = [];
    AllQueryCategories: QueryCategoryInfo[] = [];
    AllQueries: QueryInfo[] = [];
    AllQueryFields: QueryFieldInfo[] = [];
    AllQueryPermissions: QueryPermissionInfo[] = [];
    AllEntityDocumentTypes: EntityDocumentTypeInfo[] = [];
    AllLibraries: LibraryInfo[] = [];
    AllExplorerNavigationItems: ExplorerNavigationItem[] = [];

    // Create a new instance of AllMetadata from a simple object
    public static FromSimpleObject(data: any, md: IMetadataProvider): AllMetadata {
        try {
            const newObject = new AllMetadata();
            newObject.CurrentUser = data.CurrentUser ? new UserInfo(md, data.CurrentUser) : null;
            // we now have to loop through the AllMetadataArray and use that info to build the metadata object with proper strongly typed object instances
            for (let m of AllMetadataArrays) {
                if (data.hasOwnProperty(m.key)) {
                    newObject[m.key] = data[m.key].map((d: any) => new m.class(d, md));
                }
            }
            return newObject;
        }
        catch (e) {
            LogError(e);
        }
    }
}

/**
 * This is a list of all metadata classes that are used in the AllMetadata class. This is used to automatically determine the class type when deserializing the metadata and otherwise whenever we need to iterate through all of the elements.
 */
export const AllMetadataArrays = [
    { key: 'AllEntities', class: EntityInfo  },
    { key: 'AllApplications', class: ApplicationInfo  },
    { key: 'AllRoles', class: RoleInfo },
    { key: 'AllRowLevelSecurityFilters', class: RowLevelSecurityFilterInfo },
    { key: 'AllAuditLogTypes', class: AuditLogTypeInfo},
    { key: 'AllAuthorizations', class: AuthorizationInfo},
    { key: 'AllQueryCategories', class: QueryCategoryInfo},
    { key: 'AllQueries', class: QueryInfo },
    { key: 'AllQueryFields', class: QueryFieldInfo },
    { key: 'AllQueryPermissions', class: QueryPermissionInfo },
    { key: 'AllEntityDocumentTypes', class: EntityDocumentTypeInfo },
    { key: 'AllLibraries', class: LibraryInfo },
    { key: 'AllExplorerNavigationItems', class: ExplorerNavigationItem }
];


export abstract class ProviderBase implements IMetadataProvider {
    private _ConfigData: ProviderConfigDataBase;
    private _latestLocalMetadataTimestamps: MetadataInfo[];
    private _latestRemoteMetadataTimestamps: MetadataInfo[];
    private _localMetadata: AllMetadata = new AllMetadata();

    private _refresh = false;

    /******** ABSTRACT SECTION ****************************************************************** */
    // Subclass can determine if we allow refresh at any given point in time
    // subclass should return FALSE if it is doing something that should STOP refreshes
    /**
     * Determines if a refresh is currently allowed or not
     */
    protected abstract get AllowRefresh(): boolean;

    /**
     * Returns the provider type for the instance 
     */
    public abstract get ProviderType(): ProviderType;

    /**
     * For providers that have ProviderType==='Database', this property will return an object that represents the underlying database connection. For providers where 
     * ProviderType==='Network' this property will throw an exception.
     */
    public abstract get DatabaseConnection(): any;

    public abstract GetEntityRecordName(entityName: string, compositeKey: CompositeKey): Promise<string>;
    public abstract GetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]>;

    public abstract GetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey): Promise<boolean>;

    public abstract SetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey, isFavorite: boolean, contextUser: UserInfo): Promise<void>;
    /******** END - ABSTRACT SECTION ****************************************************************** */


    public async Config(data: ProviderConfigDataBase): Promise<boolean> {
        this._ConfigData = data;

        if (this._refresh || await this.CheckToSeeIfRefreshNeeded()) {
            // either a hard refresh flag was set within Refresh(), or LocalMetadata is Obsolete

            // first, make sure we reset the flag to false so that if another call to this function happens
            // while we are waiting for the async call to finish, we dont do it again
            this._refresh = false;  
            
            // start with fresh metadata
            this._localMetadata = new AllMetadata(); 

            this._cachedVisibleExplorerNavigationItems = null; // reset this so it gets rebuilt next time it is requested

            const start = new Date().getTime();
            const res = await this.GetAllMetadata();
            const end = new Date().getTime();
            LogStatus(`GetAllMetadata() took ${end - start} ms`);
            if (res) {
                this.UpdateLocalMetadata(res)
                this._latestLocalMetadataTimestamps = this._latestRemoteMetadataTimestamps // update this since we just used server to get all the stuff
                await this.SaveLocalMetadataToStorage();
            }
        }

        return true;
    }

    
    protected BuildDatasetFilterFromConfig(): DatasetItemFilterType[] {
        // setup the schema filters as needed
        const f: DatasetItemFilterType[] = [];

        // make sure that the MJ Core schema is always included if includeSchemas are provided because if the user doesn't include them stuff will break
        const includeSchemaList = this.ConfigData.IncludeSchemas  
        const excludeSchemaList = this.ConfigData.ExcludeSchemas  
        const mjcSchema = this.ConfigData.MJCoreSchemaName;

        // check to see if the MJ Core schema is already in the list, if not add it
        // TODO: The logic here doesn't match the comment above
        if (includeSchemaList && includeSchemaList.length > 0 && includeSchemaList.indexOf(mjcSchema) === -1) 
            includeSchemaList.push(mjcSchema)

        // check to make sure that if exclude schemas are provided, the list DOES NOT include the MJ Core schema, if it does, remove it
        if (excludeSchemaList && excludeSchemaList.length > 0 && excludeSchemaList.indexOf(mjcSchema) !== -1) {
            const index = excludeSchemaList.indexOf(mjcSchema);
            excludeSchemaList.splice(index, 1);
            LogStatus(`Removed MJ Core schema (${mjcSchema}) from ExcludeSchemas list because it is required for the API to function correctly`);
        }

        let schemaFilter: string = '';
        if (includeSchemaList && includeSchemaList.length > 0) {
            schemaFilter = 'SchemaName IN (' + includeSchemaList.map(s => `'${s}'`).join(',') + ')';
        }
        if (excludeSchemaList && excludeSchemaList.length > 0) {
            schemaFilter = (schemaFilter.length > 0  ? ' AND ' : '' ) + 'SchemaName NOT IN (' + excludeSchemaList.map(s => `'${s}'`).join(',') + ')';
        }
        if (schemaFilter.length > 0) {
            f.push({ ItemCode: 'Entities', Filter: schemaFilter });
            f.push({ ItemCode: 'EntityFields', Filter: schemaFilter });
        }
        return f;        
    }

    protected static _mjMetadataDatasetName: string = 'MJ_Metadata';
    protected async GetAllMetadata(): Promise<AllMetadata> {
        try {
            // we are now using datasets instead of the custom metadata to GraphQL to simplify GraphQL's work as it was very slow preivously
            //const start1 = new Date().getTime();
            const f = this.BuildDatasetFilterFromConfig();
            const d = await this.GetDatasetByName(ProviderBase._mjMetadataDatasetName, f.length > 0 ? f : null)

            if (d && d.Success) {
                // got the results, let's build our response in the format we need
                const simpleMetadata: any = {};
                for (let r of d.Results) {
                    simpleMetadata[r.Code] = r.Results
                }

                // Post Process Entities because there's some special handling of the sub-objects
                simpleMetadata.AllEntities = this.PostProcessEntityMetadata(simpleMetadata.Entities, simpleMetadata.EntityFields, simpleMetadata.EntityFieldValues, simpleMetadata.EntityPermissions, simpleMetadata.EntityRelationships, simpleMetadata.EntitySettings);

                // Post Process the Applications, because we want to handle the sub-objects properly.
                simpleMetadata.AllApplications = simpleMetadata.Applications.map((a: any) => {
                    a.ApplicationEntities = simpleMetadata.ApplicationEntities.filter((ae: any) => ae.ApplicationID === a.ID)
                    a.ApplicationSettings = simpleMetadata.ApplicationSettings.filter((as: any) => as.ApplicationID === a.ID)
                    return new ApplicationInfo(a, this);
                });

                // now we need to construct our return type. The way the return type works, which is an instance of AllMetadata, we have to 
                // construst each item so it contains an array of the correct type. This is because the AllMetadata class has an array of each type of metadata
                // rather than just plain JavaScript objects that we have in the allMetadata object.

                // build the base return type
                const returnMetadata: AllMetadata = new AllMetadata();
                returnMetadata.CurrentUser = await this.GetCurrentUser(); // set the current user
                // now iterate through the AllMetadataMapping array and construct the return type
                for (let m of AllMetadataArrays) {
                    let simpleKey = m.key;
                    if (!simpleMetadata.hasOwnProperty(simpleKey)) {
                        simpleKey = simpleKey.substring(3); // remove the All prefix
                    }
                    if (simpleMetadata.hasOwnProperty(simpleKey)) {
                        // at this point, only do this particular property if we have a match, it is either prefixed with All or not
                        // for example in our strongly typed AllMetadata class we have AllQueryCategories, but in the simple allMetadata object we have QueryCategories
                        // so we need to check for both which is what the above is doing.

                        // Build the array of the correct type and initialize with the simple object
                        returnMetadata[m.key] = simpleMetadata[simpleKey].map((d: any) => new m.class(d, this));
                    }
                }
                return returnMetadata;
            }
            else {
                LogError ('GetAllMetadata() - Error getting metadata from server' + (d ? ': ' + d.Status : ''));
            }
        }
        catch (e) {
            LogError(e);
        }
    }
    

    protected abstract GetCurrentUser(): Promise<UserInfo> 

    protected PostProcessEntityMetadata(entities: any[], fields: any[], fieldValues: any[], permissions: any[], relationships: any[], settings: any[]): any[] {
        const result: any[] = [];
        if (fieldValues && fieldValues.length > 0)
            for (let f of fields) {
                // populate the field values for each field, if we have them
                f.EntityFieldValues = fieldValues.filter(fv => fv.EntityFieldID === f.ID);
            }
            
        for (let e of entities) {
            e.EntityFields = fields.filter(f => f.EntityID === e.ID).sort((a, b) => a.Sequence - b.Sequence);
            e.EntityPermissions = permissions.filter(p => p.EntityID === e.ID);
            e.EntityRelationships = relationships.filter(r => r.EntityID === e.ID);
            e.EntitySettings = settings.filter(s => s.EntityID === e.ID);
            result.push(new EntityInfo(e));
        }
        return result;
    }

    get ConfigData(): ProviderConfigDataBase {
        return this._ConfigData;
    }

    public get Entities(): EntityInfo[] {
        return this._localMetadata.AllEntities;
    }
    public get Applications(): ApplicationInfo[] {
        return this._localMetadata.AllApplications;
    }
    public get CurrentUser(): UserInfo {
        return this._localMetadata.CurrentUser;
    }
    public get Roles(): RoleInfo[] {
        return this._localMetadata.AllRoles;
    }
    public get RowLevelSecurityFilters(): RowLevelSecurityFilterInfo[] {
        return this._localMetadata.AllRowLevelSecurityFilters;
    }
    public get AuditLogTypes(): AuditLogTypeInfo[] {
        return this._localMetadata.AllAuditLogTypes;
    }
    public get Authorizations(): AuthorizationInfo[] {
        return this._localMetadata.AllAuthorizations;
    }
    public get Queries(): QueryInfo[] {
        return this._localMetadata.AllQueries;
    }
    public get QueryCategories(): QueryCategoryInfo[] {
        return this._localMetadata.AllQueryCategories;
    }
    public get QueryFields(): QueryFieldInfo[] {
        return this._localMetadata.AllQueryFields;
    }
    public get QueryPermissions(): QueryPermissionInfo[] {
        return this._localMetadata.AllQueryPermissions;
    }
    public get Libraries(): LibraryInfo[] {
        return this._localMetadata.AllLibraries;
    }
    public get AllExplorerNavigationItems(): ExplorerNavigationItem[] {
        return this._localMetadata.AllExplorerNavigationItems;
    }
    private _cachedVisibleExplorerNavigationItems: ExplorerNavigationItem[] = null;
    public get VisibleExplorerNavigationItems(): ExplorerNavigationItem[] {
        // filter and sort once and cache
        if (!this._cachedVisibleExplorerNavigationItems)
            this._cachedVisibleExplorerNavigationItems = this._localMetadata.AllExplorerNavigationItems.filter(e => e.IsActive).sort((a, b) => a.Sequence - b.Sequence);
        return this._cachedVisibleExplorerNavigationItems;
    }

    public async Refresh(): Promise<boolean> {
        // do nothing here, but set a _refresh flag for next time things are requested
        if (this.AllowRefresh) {
            this._refresh = true;
            return this.Config(this._ConfigData);
        }
        else
            return true; // subclass is telling us not to do any refresh ops right now
    }

    public async CheckToSeeIfRefreshNeeded(): Promise<boolean> {
        if (this.AllowRefresh) {
            await this.RefreshRemoteMetadataTimestamps(); // get the latest timestamps from the server first
            await this.LoadLocalMetadataFromStorage(); // then, attempt to load before we check to see if it is obsolete
            return this.LocalMetadataObsolete()
        }
        else //subclass is telling us not to do any refresh ops right now
            return false;
    }

    public async RefreshIfNeeded(): Promise<boolean> {
        if (await this.CheckToSeeIfRefreshNeeded()) 
            return this.Refresh();
        else
            return true;
    }


    public async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser: UserInfo = null): Promise<T> {
        try {
            const entity: EntityInfo = this.Metadata.Entities.find(e => e.Name == entityName);
            if (entity) {
                // Use the MJGlobal Class Factory to do our object instantiation - we do NOT use metadata for this anymore, doesn't work well to have file paths with node dynamically at runtime
                // type reference registration by any module via MJ Global is the way to go as it is reliable across all platforms.
                try {
                    const newObject = MJGlobal.Instance.ClassFactory.CreateInstance<T>(BaseEntity, entityName, entity, this); 
                    await newObject.Config(contextUser);

                    return newObject;
                }
                catch (e) {
                    LogError(e)
                    throw new Error(`Entity ${entityName} could not be instantiated via MJGlobal Class Factory.  Make sure you have registered the class reference with MJGlobal.Instance.ClassFactory.Register(). ALSO, make sure you call LoadGeneratedEntities() from the GeneratedEntities project within your project as tree-shaking sometimes removes subclasses and could be causing this error!`);
                }
            }
            else
                throw new Error(`Entity ${entityName} not found in metadata`);
          } catch (ex) {
            LogError(ex);
            return null;
          }
    }

    /**
     * Returns a list of dependencies - records that are linked to the specified Entity/RecordID combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
     * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
     * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
     * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
     * @param entityName the name of the entity to check
     * @param KeyValuePairs the values of the primary key of the record to check
     */
    public abstract GetRecordDependencies(entityName: string, CompositeKey: CompositeKey): Promise<RecordDependency[]> 

    /**
     * Returns a list of record IDs that are possible duplicates of the specified record. 
     * 
     * @param params object containing many properties used in fetching records and determining which ones to return
     */
    public abstract GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse>

    /**
     * Returns a list of entity dependencies, basically metadata that tells you the links to this entity from all other entities.
     * @param entityName 
     * @returns 
     */
    public async GetEntityDependencies(entityName: string): Promise<EntityDependency[]> {
        // using our metadata, find all of the foreign keys that point to this entity
        // go through each entity and find all the fields that have a RelatedEntity = entityName
        try {
            const eName = entityName.trim().toLowerCase();
            const result: EntityDependency[] = [];
            for (let re of this.Entities) {
                const relatedFields = re.Fields.filter(f => f.RelatedEntity?.trim().toLowerCase() === eName);
                // we now have all the fields, so let's create the EntityDependency objects
                relatedFields.map(f => {
                    result.push({
                        EntityName: entityName,
                        RelatedEntityName: re.Name,
                        FieldName: f.Name
                    });
                });
            }

            return result;
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }


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
    public abstract MergeRecords(request: RecordMergeRequest): Promise<RecordMergeResult>  


    /**
     * Always retrieves data from the server - this method does NOT check cache. To use cached local values if available, call GetAndCacheDatasetByName() instead
     * @param datasetName 
     * @param itemFilters 
     */
    public abstract GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType>;
    /**
     * Retrieves the date status information for a dataset and all its items from the server. This method will match the datasetName and itemFilters to the server's dataset and item filters to determine a match
     * @param datasetName 
     * @param itemFilters 
     */
    public abstract GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetStatusResultType>;

    /**
     * Gets a database by name, if required, and caches it in a format available to the client (e.g. IndexedDB, LocalStorage, File, etc). The cache method is Provider specific
     * If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    public async GetAndCacheDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType> {
        // first see if we have anything in cache at all, no reason to check server dates if we dont
        if (await this.IsDatasetCached(datasetName, itemFilters)) {
            // compare the local version, if exists to the server version dates
            if (await this.IsDatasetCacheUpToDate(datasetName, itemFilters)) {
                // we're up to date, all we need to do is get the local cache and return it
                return this.GetCachedDataset(datasetName, itemFilters);
            }
            else {
                // we're out of date, so get the dataset from the server
                const dataset = await this.GetDatasetByName(datasetName, itemFilters);
                // cache it
                await this.CacheDataset(datasetName, itemFilters, dataset);

                return dataset;
            }
        }
        else {
            // get the dataset from the server
            const dataset = await this.GetDatasetByName(datasetName, itemFilters);
            // cache it
            await this.CacheDataset(datasetName, itemFilters, dataset);

            return dataset;
        }
    }


    /**
     * Returns the timestamp of the local cached version of a given datasetName or null if there is no local cache for the 
     * specified dataset
     * @param datasetName the name of the dataset to check
     * @param itemFilters optional filters to apply to the dataset
     */
    public async GetLocalDatasetTimestamp(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<Date> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            const dateKey = key + '_date';
            const val: string = await ls.getItem(dateKey);
            if (val) {
                return new Date(val);
            }
        }
    }

    /**
     * This routine checks to see if the local cache version of a given datasetName/itemFilters combination is up to date with the server or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async IsDatasetCacheUpToDate(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> {
        const localDate = await this.GetLocalDatasetTimestamp(datasetName, itemFilters);
        if (localDate) {
            // we have a local cached timestamp, so compare it to the server timestamp
            const status = await this.GetDatasetStatusByName(datasetName, itemFilters);
            if (status) {
                const serverTimestamp = status.LatestUpdateDate.getTime();
                if (localDate.getTime() >= serverTimestamp) {
                    // this situation means our local cache timestamp is >= the server timestamp, so we're most likely up to date
                    // in this situation, the last thing we check is for each entity, if the rowcount is the same as the server, if it is, we're good
                    // iterate through all of the entities and check the row counts
                    const localDataset = await this.GetCachedDataset(datasetName, itemFilters);
                    for (const eu of status.EntityUpdateDates) {
                        const localEntity = localDataset.Results.find(e => e.EntityID === eu.EntityID);
                        if (!localEntity || localEntity.Results.length !== eu.RowCount) {
                            // we either couldn't find the entity in the local cache or the row count is different, so we're out of date
                            // the RowCount being different picks up on DELETED rows. The UpdatedAt check which is handled above would pick up 
                            // on any new rows or updated rows. This approach makes sure we detect deleted rows and refresh the cache.
                            return false;
                        }
                    }
                    // if we get here that means that the row counts are the same for all entities and we're up to date
                    return true;
                }
                else {
                    // our local cache timestamp is < the server timestamp, so we're out of date
                    return false;                
                }
            }
            else {
                // we couldn't get the server status, so we're out of date
                return false;
            }
        }
        else {
            // we don't have a local cache timestamp, so we're out of date
            return false;
        }
    }

    /**
     * This routine gets the local cached version of a given datasetName/itemFilters combination, it does NOT check the server status first and does not fall back on the server if there isn't a local cache version of this dataset/itemFilters combination
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async GetCachedDataset(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            const val = await ls.getItem(key);
            if (val) {
                const dataset = JSON.parse(val);
                return dataset;
            }
        }
    }

    /**
     * Stores a dataset in the local cache. If itemFilters are provided, the combination of datasetName and the filters are used to build a key and determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     * @param dataset 
     */
    public async CacheDataset(datasetName: string, itemFilters: DatasetItemFilterType[], dataset: DatasetResultType): Promise<void> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            const val = JSON.stringify(dataset);
            await ls.setItem(key, val);
            const dateKey = key + '_date';
            const dateVal = dataset.LatestUpdateDate.toISOString();
            await ls.setItem(dateKey, dateVal);
        }
    }

    /**
     * Determines if a given datasetName/itemFilters combination is cached locally or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async IsDatasetCached(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            const val = await ls.getItem(key);
            return val !== null && val !== undefined;
        }
    }

    /**
     * Creates a key for the given datasetName and itemFilters combination
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public GetDatasetCacheKey(datasetName: string, itemFilters?: DatasetItemFilterType[]): string {
        return this.LocalStoragePrefix + ProviderBase.localStorageRootKey + this.InstanceConnectionString + '__DATASET__' + datasetName + this.ConvertItemFiltersToUniqueKey(itemFilters);
    }

    /**
     * This property is implemented by each sub-class of ProviderBase and is intended to return a unique string that identifies the instance of the provider for the connection it is making. For example
     * for network connections, the URL including a TCP port would be a good connection string, whereas on database connections the database host url/instance/port would be a good connection string.
     */
    public abstract get InstanceConnectionString(): string;

    protected ConvertItemFiltersToUniqueKey(itemFilters: DatasetItemFilterType[]): string {
        if (itemFilters) {
            const key = '{' + itemFilters.map(f => `"${f.ItemCode}":"${f.Filter}"`).join(',') + '}'; // this is a unique key for the item filters
            return key
        }
        else
            return '';
    }
 
    /**
     * If the specified datasetName is cached, this method will clear the cache. If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    public async ClearDatasetCache(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<void> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            await ls.remove(key);
            const dateKey = key + '_date';
            await ls.remove(dateKey);
        }
    }

    public abstract CreateTransactionGroup(): Promise<TransactionGroupBase>;

    get LatestRemoteMetadata(): MetadataInfo[] {
        return this._latestRemoteMetadataTimestamps
    }

    get LatestLocalMetadata(): MetadataInfo[] {
        return this._latestLocalMetadataTimestamps
    }

    protected async GetLatestMetadataUpdates(): Promise<MetadataInfo[]> {
        const f = this.BuildDatasetFilterFromConfig();
        const d = await this.GetDatasetStatusByName(ProviderBase._mjMetadataDatasetName, f.length > 0 ? f : null)
        if (d && d.Success) {
            const ret = d.EntityUpdateDates.map(e => {
                return {
                    ID: e.EntityID,
                    Type: e.EntityName,
                    UpdatedAt: e.UpdateDate,
                    RowCount: e.RowCount
                }
            });

            // combine the entityupdate dates with a single top level entry for the dataset itself
            ret.push({
                ID: "",
                Type: 'All Entity Metadata',
                UpdatedAt: d.LatestUpdateDate,
                RowCount: d.EntityUpdateDates.reduce((a, b) => a + b.RowCount, 0)
            })
            return ret;
        }
    }

    public async RefreshRemoteMetadataTimestamps(): Promise<boolean> {
        const mdTimeStamps = await this.GetLatestMetadataUpdates();  
        if (mdTimeStamps) {
            this._latestRemoteMetadataTimestamps = mdTimeStamps;
            return true;
        }
        else
            return false;
    }

    public LocalMetadataObsolete(type?: string): boolean {
        const mdLocal = this.LatestLocalMetadata
        const mdRemote = this.LatestRemoteMetadata

        if (!mdLocal || !mdRemote || !mdLocal.length || !mdRemote.length || mdLocal.length === 0 || mdRemote.length === 0)
            return true;
    
        for (let i = 0; i < mdRemote.length; ++i) {
            let bProcess: boolean = true;
            if (type && type.length > 0)
                bProcess = mdRemote[i].Type.toLowerCase().trim() === type.trim().toLowerCase()

            if (bProcess) {
                const l = mdLocal.find(md => md.Type.trim().toLowerCase() === mdRemote[i].Type.trim().toLowerCase())
                if (!l)
                    return true; // no match, obsolete in this case 
                else {
                    // we have a match, now test various things
                    if (!l.UpdatedAt && !mdRemote[i].UpdatedAt) { 
                        // both are null, so we're good
                        // do nothing, keep on truckin'
                        // console.log('TEST: both are null, so we\'re good')
                    }
                    else if ( l.UpdatedAt && mdRemote[i].UpdatedAt) {
                        // both are not null, so we need to compare them
                        const localTime = new Date(l.UpdatedAt);
                        const remoteTime = new Date(mdRemote[i].UpdatedAt);
                        if (localTime.getTime() !== remoteTime.getTime()) {
                            return true; // we can short circuit the entire rest of the function 
                                         // as one obsolete is good enough to obsolete the entire local metadata
                        }
                        else {
                            // here we have a match for the local and remote timestamps, so we need to check the row counts
                            // if the row counts are different, we're obsolete
                            if (l.RowCount !== mdRemote[i].RowCount) {
                                return true;
                            }
                        }
                    }
                    else 
                        return true; // one is null and the other is not, so we're obsolete without even comparing
                }
            }
        }

        // if we get here, we're not obsolete!!
        return false;
    }

    protected UpdateLocalMetadata(res: AllMetadata) {
        this._localMetadata = res;
    }

    abstract get LocalStorageProvider(): ILocalStorageProvider; // sub-class implements this based on whatever the local storage model is, different for browser vs. node

    protected async LoadLocalMetadataFromStorage() {
        try {
            const ls = this.LocalStorageProvider;
            if (ls) {
                // execution environment supports local storage, use it
                this._latestLocalMetadataTimestamps = JSON.parse(await ls.getItem(this.LocalStoragePrefix + ProviderBase.localStorageTimestampsKey))
                const temp = JSON.parse(await ls.getItem(this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey)); // we now have a simple object for all the metadata
                if (temp) {
                    // we have local metadata
                    const metadata = AllMetadata.FromSimpleObject(temp, this); // create a new object to start this up
                    this.UpdateLocalMetadata(metadata);
                }
            }
        }
        catch (e) {
            // some enviroments don't support local storage
        }
    }

    private static localStorageRootKey ='___MJCore_Metadata'
    private static localStorageTimestampsKey = this.localStorageRootKey + '_Timestamps'
    private static localStorageAllMetadataKey = this.localStorageRootKey + '_AllMetadata'

    private static localStorageKeys = [
        ProviderBase.localStorageTimestampsKey,
        ProviderBase.localStorageAllMetadataKey,
    ];

    /**
     * This property will return the prefix to use for local storage keys. This is useful if you have multiple instances of a provider running in the same environment
     * and you want to keep their local storage keys separate. The default implementation returns an empty string, but subclasses can override this to return a unique string
     * based on the connection or other distinct identifier.
     */
    protected get LocalStoragePrefix(): string {
        return "";
    }

    public async SaveLocalMetadataToStorage() {
        try {
            const ls = this.LocalStorageProvider;
            if (ls) {
                // execution environment supports local storage, use it
                await ls.setItem(this.LocalStoragePrefix + ProviderBase.localStorageTimestampsKey, JSON.stringify(this._latestLocalMetadataTimestamps))

                // now persist the AllMetadata object
                await ls.setItem(this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey, JSON.stringify(this._localMetadata))
            }
        }
        catch (e) {
            // some enviroments don't support local storage
            LogError(e)
        }
    }

    public async RemoveLocalMetadataFromStorage() {
        try {
            const ls = this.LocalStorageProvider;
            for (let i = 0; i < ProviderBase.localStorageKeys.length; i++) {
                await ls.remove(this.LocalStoragePrefix + ProviderBase.localStorageKeys[i])
            }
        }
        catch (e) {
            // some enviroments don't support local storage
            LogError(e)
        }
    }

    protected abstract get Metadata(): IMetadataProvider;
}