import { BaseEntity } from "./baseEntity";
import { EntityDependency, EntityInfo, RecordDependency, RecordMergeRequest, RecordMergeResult } from "./entityInfo";
import { IMetadataProvider, ProviderConfigDataBase, MetadataInfo, ILocalStorageProvider, DatasetResultType, DatasetStatusResultType, DatasetItemFilterType, EntityRecordNameInput, EntityRecordNameResult, ProviderType } from "./interfaces";
import { ApplicationInfo } from "../generic/applicationInfo";
import { AuditLogTypeInfo, AuthorizationInfo, RoleInfo, RowLevelSecurityFilterInfo, UserInfo, UserRoleInfo } from "./securityInfo";
import { TransactionGroupBase } from "./transactionGroup";
import { MJGlobal } from "@memberjunction/global";
import { LogError, LogStatus } from "./logging";
const _rootPath = '../'

// implement some generic functionality that all/many providers will need
export type AllMetadata = {
    AllEntities: EntityInfo[];
    AllApplications: ApplicationInfo[];
    CurrentUser: UserInfo;
    AllRoles: RoleInfo[];
    AllRowLevelSecurityFilters: RowLevelSecurityFilterInfo[];
    AllAuditLogTypes: AuditLogTypeInfo[];
    AllAuthorizations: AuthorizationInfo[];
}

export abstract class ProviderBase implements IMetadataProvider {
    private _ConfigData: ProviderConfigDataBase;
    private _latestLocalMetadataTimestamps: MetadataInfo[];
    private _latestRemoteMetadataTimestamps: MetadataInfo[];
    private _entities: EntityInfo[] = [];
    private _applications: ApplicationInfo[] = [];
    private _currentUser: UserInfo;
    private _roles: RoleInfo[] = [];
    private _rowLevelSecurityFilters: RowLevelSecurityFilterInfo[] = [];
    private _auditLogTypes: AuditLogTypeInfo[] = [];
    private _authorizations: AuthorizationInfo[] = [];
    private _refresh = false;

    /******** ABSTRACT SECTION ****************************************************************** */
    // Subclass can determine if we allow refresh at any given point in time
    // subclass should return FALSE if it is doing something that should STOP refreshes
    protected abstract AllowRefresh(): boolean;

    public abstract get ProviderType(): ProviderType;

    public abstract GetEntityRecordName(entityName: string, recordId: number): Promise<string>;
    public abstract GetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]>;

    public abstract GetRecordFavoriteStatus(userId: number, entityName: string, recordId: number): Promise<boolean>;

    public abstract SetRecordFavoriteStatus(userId: number, entityName: string, recordId: number, isFavorite: boolean, contextUser: UserInfo): Promise<void>;
    /******** END - ABSTRACT SECTION ****************************************************************** */


    public async Config(data: ProviderConfigDataBase): Promise<boolean> {
        this._ConfigData = data;
        this._entities = []; // make sure to clear the array first - we could get this from a hard refresh
        this._applications = []; // make sure to clear the array first - we could get this from a hard refresh

        if (this._refresh || await this.IsRefreshNeeded()) {
            // either a hard refresh flag was set within Refresh(), or LocalMetadata is Obsolete

            // first, make sure we reset the flag to false so that if another call to this function happens
            // while we are waiting for the async call to finish, we dont do it again
            this._refresh = false;  

            const start = new Date().getTime();
            const res = await this.GetAllMetadata();
            const end = new Date().getTime();
            LogStatus(`GetAllMetadata() took ${end - start} ms`);
            if (res) {
                this.UpdateLocalMetadata(res)
                this._latestLocalMetadataTimestamps = this._latestRemoteMetadataTimestamps // update this since we just used server to get all the stuff
                this.SaveLocalMetadataToStorage();
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
            //const end1 = new Date().getTime();
            //LogStatus(`GetAllMetadata - GetDatasetByName took ${end1 - start1}ms`)

            //const start2 = new Date().getTime();
            const u = await this.GetCurrentUser()
            //const end2 = new Date().getTime();
            //LogStatus(`GetAllMetadata - GetCurrentUser took ${end2 - start2}ms`)

            if (d && d.Success) {
                // got the results, let's build our response in the format we need
                const allMetadata: any = {};
                for (let r of d.Results) {
                    allMetadata[r.Code] = r.Results
                }
                // update the entities to include the fields, permissions and relationships
                allMetadata.AllEntities = this.PostProcessEntityMetadata(allMetadata.Entities, allMetadata.EntityFields, allMetadata.EntityFieldValues, allMetadata.EntityPermissions, allMetadata.EntityRelationships);
                // update the applications to include applicationentities
                allMetadata.AllApplications = allMetadata.Applications.map((a: any) => {
                    a.ApplicationEntities = allMetadata.ApplicationEntities.filter((ae: any) => ae.ApplicationName.trim().toLowerCase() === a.Name.trim().toLowerCase())
                    return new ApplicationInfo(this, a);
                });

                return {
                    AllEntities: allMetadata.AllEntities,
                    AllApplications: allMetadata.AllApplications,
                    AllRoles: allMetadata.Roles.map((r: any) => new RoleInfo(r)),
                    CurrentUser: u,
                    AllRowLevelSecurityFilters: allMetadata.RowLevelSecurityFilters.map((r: any) => new RowLevelSecurityFilterInfo(r)),
                    AllAuditLogTypes: allMetadata.AuditLogTypes.map((a: any) => new AuditLogTypeInfo(a)),
                    AllAuthorizations: allMetadata.Authorizations.map((a: any) => new AuthorizationInfo(a))
                }
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

    protected PostProcessEntityMetadata(entities: any[], fields: any[], fieldValues: any[], permissions: any[], relationships: any[]): any[] {
        const result: any[] = [];
        if (fieldValues && fieldValues.length > 0)
            for (let f of fields) {
                // populate the field values for each field, if we have them
                f.EntityFieldValues = fieldValues.filter(fv => fv.EntityID === f.EntityID && fv.EntityFieldName.trim().toLowerCase() === f.Name.trim().toLowerCase());
            }
            
        for (let e of entities) {
            e.EntityFields = fields.filter(f => f.EntityID === e.ID).sort((a, b) => a.Sequence - b.Sequence);
            e.EntityPermissions = permissions.filter(p => p.EntityID === e.ID);
            e.EntityRelationships = relationships.filter(r => r.EntityID === e.ID);
            result.push(new EntityInfo(e));
        }
        return result;
    }

    get ConfigData(): ProviderConfigDataBase {
        return this._ConfigData;
    }

    public get Entities(): EntityInfo[] {
        return this._entities;
    }
    public get Applications(): ApplicationInfo[] {
        return this._applications;
    }
    public get CurrentUser(): UserInfo {
        return this._currentUser;
    }
    public get Roles(): RoleInfo[] {
        return this._roles;
    }
    public get RowLevelSecurityFilters(): RowLevelSecurityFilterInfo[] {
        return this._rowLevelSecurityFilters;
    }
    public get AuditLogTypes(): AuditLogTypeInfo[] {
        return this._auditLogTypes;
    }
    public get Authorizations(): AuthorizationInfo[] {
        return this._authorizations;
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

    public async IsRefreshNeeded(): Promise<boolean> {
        if (this.AllowRefresh) {
            await this.RefreshRemoteMetadataTimestamps(); // get the latest timestamps from the server first
            await this.LoadLocalMetadataFromStorage(); // then, attempt to load before we check to see if it is obsolete
            return this.LocalMetadataObsolete()
        }
        else //subclass is telling us not to do any refresh ops right now
            return false;
    }

    public async RefreshIfNeeded(): Promise<boolean> {
        if (await this.IsRefreshNeeded()) 
            return this.Refresh();
        else
            return true;
    }


    public async GetEntityObject(entityName: string, contextUser: UserInfo = null): Promise<BaseEntity> {
        try {
            const entity: EntityInfo = this.Metadata.Entities.find(e => e.Name == entityName);
            if (entity) {
                // Use the MJGlobal Class Factory to do our object instantiation - we do NOT use metadata for this anymore, doesn't work well to have file paths with node dynamically at runtime
                // type reference registration by any module via MJ Global is the way to go as it is reliable across all platforms.

                try {
                    const newObject = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEntity>(BaseEntity, entityName, entity) 
                    if (contextUser)
                        newObject.ContextCurrentUser = contextUser;

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
     * @param recordId the recordId to check
     */
    public abstract GetRecordDependencies(entityName: string, recordId: number): Promise<RecordDependency[]> 

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
     * This routine checks to see if the local cache version of a given datasetName/itemFilters combination is up to date with the server or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async IsDatasetCacheUpToDate(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            const dateKey = key + '_date';
            const val: string = await ls.getItem(dateKey);
            if (val) {
                // we have a local cached timestamp, so compare it to the server timestamp
                const status = await this.GetDatasetStatusByName(datasetName, itemFilters);
                if (status) {
                    const serverTimestamp = status.LatestUpdateDate.getTime();
                    const localTimestamp = new Date(val);
                    return localTimestamp.getTime() >= serverTimestamp;
                }
                else {
                    return false;
                }
            }
            else {
                return false;
            }
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
        return ProviderBase.localStorageRootKey + '__DATASET__' + datasetName + this.ConvertItemFiltersToUniqueKey(itemFilters);
    }

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
                    UpdatedAt: e.UpdateDate
                }
            });

            // combine the entityupdate dates with a single top level entry for the dataset itself
            ret.push({
                ID: -1,
                Type: 'All Entity Metadata',
                UpdatedAt: d.LatestUpdateDate
            })
            return ret;
        }
    }

    public async RefreshRemoteMetadataTimestamps(): Promise<boolean> {
        const mdTimeStamps = await this.GetLatestMetadataUpdates(); // sub-class implements this 
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
        if (res.AllEntities) {
            this._entities = [];
            for (let i = 0; i < res.AllEntities.length; i++) {
                this._entities.push(new EntityInfo(res.AllEntities[i]));
            }
        }

        if (res.AllApplications) {
            this._applications = [];
            for (let i = 0; i < res.AllApplications.length; i++) {
                const a = new ApplicationInfo(this, res.AllApplications[i])
                this._applications.push(a);
            }
        }

        if (res.AllRoles) {
            this._roles = [];
            for (let i = 0; i < res.AllRoles.length; i++) {
                const r = new RoleInfo(res.AllRoles[i])
                this._roles.push(r);
            }
        }

        if (res.AllRowLevelSecurityFilters) {
            this._rowLevelSecurityFilters = [];
            for (let i = 0; i < res.AllRowLevelSecurityFilters.length; i++) {
                const rls = new RowLevelSecurityFilterInfo(res.AllRowLevelSecurityFilters[i])
                this._rowLevelSecurityFilters.push(rls);
            }
        }

        if (res.AllAuditLogTypes) {
            this._auditLogTypes = [];
            for (let i = 0; i < res.AllAuditLogTypes.length; i++) {
                const alt = new AuditLogTypeInfo(res.AllAuditLogTypes[i])
                this._auditLogTypes.push(alt);
            }
        }

        if (res.AllAuthorizations) {
            this._authorizations = [];
            for (let i = 0; i < res.AllAuthorizations.length; i++) {
                const ai = new AuthorizationInfo(this, res.AllAuthorizations[i])
                this._authorizations.push(ai);
            }
        }

        if (res.CurrentUser)
            this._currentUser = new UserInfo(this, res.CurrentUser);

    }

    abstract get LocalStorageProvider(): ILocalStorageProvider; // sub-class implements this based on whatever the local storage model is, different for browser vs. node

    protected async LoadLocalMetadataFromStorage() {
        try {
            const ls = this.LocalStorageProvider;
            if (ls) {
                // execution environment supports local storage, use it
                this._latestLocalMetadataTimestamps = JSON.parse(await ls.getItem(ProviderBase.localStorageTimestampsKey))
                const e = JSON.parse(await ls.getItem(ProviderBase.localStorageEntitiesKey))
                const a = JSON.parse(await ls.getItem(ProviderBase.localStorageApplicationsKey))
                const cu = JSON.parse(await ls.getItem(ProviderBase.localStorageCurrentUserKey))
                const r = JSON.parse(await ls.getItem(ProviderBase.localStorageRolesKey))
                const rls = JSON.parse(await ls.getItem(ProviderBase.localStorageRowLevelSecurityFiltersKey))
                const alt = JSON.parse(await ls.getItem(ProviderBase.localStorageAuditLogTypesKey))
                const ai = JSON.parse(await ls.getItem(ProviderBase.localStorageAuthorizationsKey))
                this.UpdateLocalMetadata({ 
                                            AllEntities: e, 
                                            AllApplications: a, 
                                            CurrentUser: cu, 
                                            AllRoles: r, 
                                            AllRowLevelSecurityFilters: rls,
                                            AllAuditLogTypes: alt,
                                            AllAuthorizations: ai
                                        })
            }
        }
        catch (e) {
            // some enviroments don't support local storage
        }
    }

    private static localStorageRootKey ='___MJCore_Metadata'
    private static localStorageTimestampsKey = this.localStorageRootKey + '_Timestamps'
    private static localStorageEntitiesKey = this.localStorageRootKey + '_Entities'
    private static localStorageApplicationsKey = this.localStorageRootKey + '_Applications'
    private static localStorageCurrentUserKey = this.localStorageRootKey + '_CurrentUser'
    private static localStorageRolesKey = this.localStorageRootKey + '_Roles'
    private static localStorageRowLevelSecurityFiltersKey = this.localStorageRootKey + '_RowLevelSecurityFilters'
    private static localStorageAuditLogTypesKey = this.localStorageRootKey + '_AuditLogTypes'
    private static localStorageAuthorizationsKey = this.localStorageRootKey + '_Authorizations'
    private static localStorageKeys = [
        ProviderBase.localStorageTimestampsKey,
        ProviderBase.localStorageEntitiesKey,
        ProviderBase.localStorageApplicationsKey,
        ProviderBase.localStorageCurrentUserKey,
        ProviderBase.localStorageRolesKey,
        ProviderBase.localStorageRowLevelSecurityFiltersKey,
        ProviderBase.localStorageAuditLogTypesKey,
        ProviderBase.localStorageAuthorizationsKey
    ];
    public async SaveLocalMetadataToStorage() {
        try {
            const ls = this.LocalStorageProvider;
            if (ls) {
                // execution environment supports local storage, use it
                await ls.setItem(ProviderBase.localStorageTimestampsKey, JSON.stringify(this._latestLocalMetadataTimestamps))
                await ls.setItem(ProviderBase.localStorageEntitiesKey, JSON.stringify(this._entities))
                await ls.setItem(ProviderBase.localStorageApplicationsKey, JSON.stringify(this._applications))
                await ls.setItem(ProviderBase.localStorageCurrentUserKey, JSON.stringify(this._currentUser))
                await ls.setItem(ProviderBase.localStorageRolesKey, JSON.stringify(this._roles))
                await ls.setItem(ProviderBase.localStorageRowLevelSecurityFiltersKey, JSON.stringify(this._rowLevelSecurityFilters))
                await ls.setItem(ProviderBase.localStorageAuditLogTypesKey, JSON.stringify(this._auditLogTypes))
                await ls.setItem(ProviderBase.localStorageAuthorizationsKey, JSON.stringify(this._authorizations))
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
                await ls.remove(ProviderBase.localStorageKeys[i])
            }
        }
        catch (e) {
            // some enviroments don't support local storage
            LogError(e)
        }
    }


    protected abstract get Metadata(): IMetadataProvider;
}