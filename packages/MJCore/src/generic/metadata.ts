import { DatasetItemFilterType, DatasetResultType, DatasetStatusResultType, EntityRecordNameInput, EntityRecordNameResult, EntityMergeOptions, ILocalStorageProvider, IMetadataProvider, PotentialDuplicateRequest, PotentialDuplicateResponse, ProviderConfigDataBase, ProviderType } from "./interfaces";
import { EntityDependency, EntityInfo, RecordDependency, RecordMergeRequest, RecordMergeResult } from "./entityInfo"
import { ApplicationInfo } from "./applicationInfo"
import { BaseEntity } from "./baseEntity"
import { AuditLogTypeInfo, AuthorizationInfo, RoleInfo, UserInfo } from "./securityInfo";
import { TransactionGroupBase } from "./transactionGroup";
import { MJGlobal } from "@memberjunction/global";
import { QueryCategoryInfo, QueryFieldInfo, QueryInfo, QueryPermissionInfo } from "./queryInfo";
import { LogError, LogStatus } from "./logging";
import { LibraryInfo } from "./libraryInfo";
import { CompositeKey } from "./compositeKey";
import { ExplorerNavigationItem } from "./explorerNavigationItem";
import { RunView } from "../views/runView";

/**
 * Class used to access a wide array of MemberJunction metadata, to instantiate derived classes of BaseEntity for record access and manipulation and more. This class uses a provider model where different providers transparently plug-in to implement the functionality needed based on where the code is running. The provider in use is generally not of any importance to users of the class and code can be written indepdenent of tier/provider.
 */
export class Metadata {
    private static _globalProviderKey: string = 'MJ_MetadataProvider';
    /**
     * When an application initializes, the Provider package that is being used for that application will handle setting the provider globally via this static property. 
     * This is done so that the provider can be accessed from anywhere in the application without having to pass it around. This pattern is used sparingly in MJ.
     */
    public static get Provider(): IMetadataProvider {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            return g[Metadata._globalProviderKey];
        else
            throw new Error('No global object store, so we cant get the static provider');
    }
    public static set Provider(value: IMetadataProvider) {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            g[Metadata._globalProviderKey] = value;
        else
            throw new Error('No global object store, so we cant set the static provider');
    }

    /**
     * Forces a refresh of all cached metadata.
     * @returns 
     */
    public async Refresh(providerToUse?: IMetadataProvider): Promise<boolean> {
        return await Metadata.Provider.Refresh(providerToUse);
    }

    public get ProviderType(): ProviderType {
        return Metadata.Provider.ProviderType;
    }
    
    public get Applications(): ApplicationInfo[] {
        return Metadata.Provider.Applications;
    }

    public get Entities(): EntityInfo[] {
        return Metadata.Provider.Entities;
    }

    /**
     * Helper method to find an entity by name in a case insensitive manner.  
     * @param entityName 
     */
     public EntityByName(entityName: string): EntityInfo {
        if (!entityName || typeof entityName !== 'string' || entityName.trim().length === 0) {
            throw new Error('EntityByName: entityName must be a non-empty string');
        }

        // Check if schema-qualified (e.g., "Committees.Artifact")
        if (entityName.includes('.')) {
            const parts = entityName.split('.');
            if (parts.length === 2) {
                const [schema, name] = parts;
                return this.Entities.find(e =>
                    e.SchemaName.toLowerCase().trim() === schema.toLowerCase().trim() &&
                    e.Name.toLowerCase().trim() === name.toLowerCase().trim()
                );
            }
        }

        // Legacy behavior: search by name only (backwards compatible)
        return this.Entities.find(e => e.Name.toLowerCase().trim() === entityName.toLowerCase().trim());
    }
    /**
     * Helper method to find an entity by ID
     * @param entityID 
     * @returns 
     */
    public EntityByID(entityID: string): EntityInfo {
        return this.Entities.find(e => e.ID === entityID);
    }

    public get Queries(): QueryInfo[] {
        return Metadata.Provider.Queries;
    }

    public get QueryFields(): QueryFieldInfo[] {
        return Metadata.Provider.QueryFields;
    }

    public get QueryCategories(): QueryCategoryInfo[] {
        return Metadata.Provider.QueryCategories;
    }

    public get QueryPermissions(): QueryPermissionInfo[] {
        return Metadata.Provider.QueryPermissions;
    }

    /**
     * Returns the current user, if known. In some execution environments, mainly on server tiers like in a node.js environment, there won't be a "current user" known to Metadata since the Metadata instance is shared across all requests. In this situation you should determine the current user from the server context where you get the user payload and find the user from the UserCache.
     */
    public get CurrentUser(): UserInfo {
        return Metadata.Provider.CurrentUser;
    }

    public get Roles(): RoleInfo[] {
        return Metadata.Provider.Roles;
    }

    public get AuditLogTypes(): AuditLogTypeInfo[] {
        return Metadata.Provider.AuditLogTypes;
    }

    public get Authorizations(): AuthorizationInfo[] {
        return Metadata.Provider.Authorizations;
    }

    public get Libraries(): LibraryInfo[] {
        return Metadata.Provider.Libraries;
    }

    /**
     * Returns all of the ExplorerNavigationItems that are visible to the user, sorted by Sequence. Filtered by the IsActive bit.
     */
    public get VisibleExplorerNavigationItems(): ExplorerNavigationItem[] {
        return Metadata.Provider.VisibleExplorerNavigationItems;
    }

    /**
     * Returns all of the ExplorerNavigationItems, including those that are not visible. This is useful for admin tools and other places where you need to see all of the navigation items, not just the ones that are visible to the user.
     */
    public get AllExplorerNavigationItems(): ExplorerNavigationItem[] {
        return Metadata.Provider.AllExplorerNavigationItems;
    }

    /**
     * Helper function to return an Entity Name from a given Entity ID.
     * @param entityName 
     * @returns 
     */
    public EntityIDFromName(entityName: string): string {
        let entity = this.Entities.find(e => e.Name == entityName);
        if (entity != null)
            return entity.ID;
        else
            throw new Error(`Entity ${entityName} not found`);
    }

    /**
     * Helper function to return an Entity Name from an Entity ID
     * @param entityID 
     * @returns 
     */
    public EntityNameFromID(entityID: string): string {
        let entity = this.Entities.find(e => e.ID == entityID);
        if(entity){
            return entity.Name;
        }
        else{
            LogError(`Entity ID: ${entityID} not found`);
            return null;
        }
    }

    /**
     * Helper function to return an EntityInfo from an Entity ID
     * @param entityID
     */
    public EntityFromEntityID(entityID: string): EntityInfo | null {
        let entity = this.Entities.find(e => e.ID == entityID);
        if(entity){
            return entity;
        }
        else{
            LogError(`Entity ID: ${entityID} not found`);
            return null;
        }
    }

    /**
     * Returns true if the combination of userId/entityName/KeyValuePairs has a favorite status on (meaning the user has marked the record as a "favorite" for easy access)
     * @param userId 
     * @param entityName 
     * @param primaryKey 
     * @returns 
     */
    public async GetRecordFavoriteStatus(userId: string, entityName: string, primaryKey: CompositeKey, contextUser?: UserInfo): Promise<boolean> {
        return await Metadata.Provider.GetRecordFavoriteStatus(userId, entityName, primaryKey, contextUser);
    }

    /**
     * Returns an array of records representing the list of changes made to a record. This functionality only works
     * if an entity has TrackRecordChanges = 1, which is the default for most entities. If TrackRecordChanges = 0, this method will return an empty array.
     * 
     * This method is defined in the @memberjunction/core package, which is lower level in the dependency 
     * hierarchy than the @memberjunction/core-entities package where the RecordChangeEntity class is defined.
     * For this reason, we are not using the RecordChangeEntity class here, but rather returning a generic type T.
     * When you call this method, you can specify the type T to be the RecordChangeEntity class or any other class that matches the structure of the record changes.
     * For example:
     * ```typescript
     * const md = new Metadata();
     * const changes: RecordChangeEntity[] = await md.GetRecordChanges<RecordChangeEntity>('MyEntity', myPrimaryKey);
     * ```
     * @param entityName 
     * @param primaryKey 
     * @param contextUser 
     * @returns 
     */
    public async GetRecordChanges<T>(entityName: string, primaryKey: CompositeKey, contextUser?: UserInfo): Promise<Array<T>> {
        try {
            const e = this.EntityByName(entityName);
            if (!e) {
                throw new Error(`Entity ${entityName} not found`);
            }
            if (!e.TrackRecordChanges) {
                LogStatus(`GetRecordChanges called for entity ${entityName} with primary key ${primaryKey.ToConcatenatedString()} but TrackRecordChanges is not enabled, returning empty array.`);
                return []; // Return empty array if TrackRecordChanges is not enabled
            }
            const rv = new RunView();
            const result = await rv.RunView<T>({
                EntityName: "Record Changes",
                ExtraFilter: `Entity='${entityName}' AND RecordID='${primaryKey.ToConcatenatedString()}'`,
                OrderBy: "ChangedAt DESC"
            }, contextUser);
            if (result.Success) {
                return result.Results;
            }
        }
        catch (e) {
            LogError(`GetRecordChanges failed for entityName: ${entityName} and primaryKey: ${primaryKey}. Error: ${e.message}`);
            throw e;
        }
    }

    /**
     * Sets the favorite status for a given user for a specific entityName/KeyValuePairs
     * @param userId 
     * @param entityName 
     * @param primaryKey
     * @param isFavorite 
     * @param contextUser 
     */
    public async SetRecordFavoriteStatus(userId: string, entityName: string, primaryKey: CompositeKey, isFavorite: boolean, contextUser: UserInfo = null) {
        await Metadata.Provider.SetRecordFavoriteStatus(userId, entityName, primaryKey, isFavorite, contextUser);
    }

    /**
     * Returns a list of dependencies - records that are linked to the specified Entity/Primary Key Value combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
     * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
     * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
     * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
     * @param entityName the name of the entity to check
     * @param primaryKey the primary key value to check
     */
    public async GetRecordDependencies(entityName: string, primaryKey: CompositeKey): Promise<RecordDependency[]> { 
        return await Metadata.Provider.GetRecordDependencies(entityName, primaryKey);
    }

    /**
     * Returns a list of record IDs that are possible duplicates of the specified record. 
     * 
     * @param params object containing many properties used in fetching records and determining which ones to return
     */
    public async GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {
        return await Metadata.Provider.GetRecordDuplicates(params, contextUser);
    }

    /**
     * Returns a list of entity dependencies, basically metadata that tells you the links to this entity from all other entities.
     * @param entityName 
     * @returns 
     */
    public async GetEntityDependencies(entityName: string): Promise<EntityDependency[]> {
        return await Metadata.Provider.GetEntityDependencies(entityName);
    }

    /**
     * This method will merge two or more records based on the request provided. The RecordMergeRequest type you pass in specifies the record that will survive the merge, the records to merge into the surviving record, and an optional field map that can update values in the surviving record, if desired. The process followed is:
     * 1. The surviving record is loaded and fields are updated from the field map, if provided, and the record is saved. If a FieldMap not provided within the request object, this step is skipped.
     * 2. For each of the records that will be merged INTO the surviving record, we call the GetEntityDependencies() method and get a list of all other records in the database are linked to the record to be deleted. We then go through each of those dependencies and update the link to point to the SurvivingRecordKeyValuePair and save the record.
     * 3. The record to be deleted is then deleted.
     * 
     * The return value from this method contains detailed information about the execution of the process. In addition, all attempted merges are logged in the RecordMergeLog and RecordMergeDeletionLog tables.
     * 
     * IMPORTANT NOTE: This functionality ASSUMES that you are calling BEGIN TRANS and COMMIT TRANS/ROLLBACK TRANS outside of the work being done inside if you are on the database server side (not on the client side). The reason is that many API servers that use this object infrastructure have transaction wrappers for each individual API request
     * so we are not doing BEGIN/COMMIT/ROLLBACK within this functionality. If you are using this on the client side, you don't need to do anything extra, the server side, however, must wrap this with begin/commit/rollback statements to the database server.
     * If you're using MJAPI/MJServer this is done for you automatically.
     * 
     * @param request 
     * @returns 
     */
    public async MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo, options?: EntityMergeOptions): Promise<RecordMergeResult> {
        const e = this.EntityByName(request.EntityName);
        if (e.AllowRecordMerge)
            return await Metadata.Provider.MergeRecords(request, contextUser, options);
        else
            throw new Error(`Entity ${request.EntityName} does not allow record merging, check the AllowRecordMerge property in the entity metadata`);
    }

    /**
     * Creates a new instance of a BaseEntity subclass for the specified entity and automatically calls NewRecord() to initialize it.
     * This method uses the MJGlobal ClassFactory to instantiate the correct subclass based on registered entity types.
     * For entities with non-auto-increment uniqueidentifier primary keys, a UUID will be automatically generated.
     * 
     * @param entityName - The name of the entity to create (e.g., "Users", "Customers", "Orders")
     * @param contextUser - Optional user context for server-side operations. Client-side code can typically omit this.
     *                      Can be a UserInfo instance or an object with matching shape (ID, Name, Email, UserRoles)
     * @returns Promise resolving to a strongly-typed entity instance ready for data entry
     * 
     * @example
     * // Create a new customer record
     * const customer = await metadata.GetEntityObject<CustomerEntity>('Customers');
     * customer.Name = 'Acme Corp';
     * await customer.Save();
     * 
     * @example
     * // Server-side with context user
     * const order = await metadata.GetEntityObject<OrderEntity>('Orders', contextUser);
     * order.CustomerID = customerId;
     * await order.Save();
     */
    public async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
    
    /**
     * Creates a new instance of a BaseEntity subclass and loads an existing record using the provided composite key.
     * This overload combines entity instantiation with record loading in a single call for convenience.
     * 
     * @param entityName - The name of the entity to create (e.g., "Users", "Customers", "Orders")
     * @param loadKey - CompositeKey containing the primary key value(s) to load. Use static helper methods:
     *                  - CompositeKey.FromID(id) for single "ID" primary keys
     *                  - CompositeKey.FromKeyValuePair(field, value) for single named primary keys
     *                  - CompositeKey.FromKeyValuePairs([...]) for composite primary keys
     * @param contextUser - Optional user context for server-side operations
     * @returns Promise resolving to the entity instance with the specified record loaded
     * @throws Error if the entity name is invalid or the record cannot be found
     * 
     * @example
     * // Load by ID (most common case)
     * const customer = await metadata.GetEntityObject<CustomerEntity>('Customers', CompositeKey.FromID(customerId));
     * 
     * @example
     * // Load by named field
     * const user = await metadata.GetEntityObject<UserEntity>('Users', CompositeKey.FromKeyValuePair('Email', 'user@example.com'));
     * 
     * @example
     * // Load with composite key
     * const orderItem = await metadata.GetEntityObject<OrderItemEntity>('OrderItems', 
     *   CompositeKey.FromKeyValuePairs([
     *     { FieldName: 'OrderID', Value: orderId },
     *     { FieldName: 'ProductID', Value: productId }
     *   ])
     * );
     */
    public async GetEntityObject<T extends BaseEntity>(entityName: string, loadKey: CompositeKey, contextUser?: UserInfo): Promise<T>;
    public async GetEntityObject<T extends BaseEntity>(
        entityName: string, 
        loadKeyOrContextUser?: CompositeKey | UserInfo,
        contextUser?: UserInfo
    ): Promise<T> {
        // validate that entityName is not null, undefined and IS a string > 0 length
        if (!entityName || typeof entityName !== 'string' || entityName.trim().length === 0) {
            throw new Error('GetEntityObject: entityName must be a non-empty string');
        }

        // Determine which overload was called
        let actualLoadKey: CompositeKey | undefined;
        let actualContextUser: UserInfo | undefined;
        
        if (loadKeyOrContextUser instanceof CompositeKey) {
            // Second overload: entityName, loadKey, contextUser
            actualLoadKey = loadKeyOrContextUser;
            actualContextUser = contextUser;
        } else if (contextUser !== undefined) {
            // Second overload with null/undefined loadKey: entityName, null/undefined, contextUser
            actualLoadKey = undefined;
            actualContextUser = contextUser;
        } else {
            // First overload: entityName, contextUser
            actualContextUser = loadKeyOrContextUser as UserInfo;
        }

        // validate that contextUser is either null/undefined or a UserInfo object
        if (actualContextUser) {
            // contextUser has been specified. We need to make sure the shape of the object
            // is correct to allow objects that are not true instances of UserInfo but have the
            // same shape - e.g. duck typing
            if (!(actualContextUser instanceof UserInfo)) {
                const u = actualContextUser as any;
                if (u && u.ID && u.Name && u.Email && u.UserRoles) {
                    // we have a UserInfo-like object, so we can use it
                    actualContextUser = new UserInfo(Metadata.Provider, u);
                }
                else {
                    throw new Error('GetEntityObject: contextUser must be null/undefined, a UserInfo instance, or an object that has the same shape as UserInfo, notably having the following properties: ID, Name, Email, and UserRoles');
                }
            }
        }
        
        return await Metadata.Provider.GetEntityObject(entityName, actualLoadKey, actualContextUser);
    }

    /**
     * Returns the Name of the specific KeyValuePairs for a given entityName. This is done by 
     * looking for the IsNameField within the EntityFields collection for a given entity. 
     * If no IsNameField is found, but a field called "Name" exists, that value is returned. Otherwise null returned 
     * @param entityName 
     * @param primaryKey
     * @returns the name of the record
     */
    public async GetEntityRecordName(entityName: string, primaryKey: CompositeKey, contextUser?: UserInfo): Promise<string> {
        let result = primaryKey.Validate();
        if(!result.IsValid){
            throw new Error(result.ErrorMessage);
        }
        
        return await Metadata.Provider.GetEntityRecordName(entityName, primaryKey, contextUser);
    }

    /**
     * Returns one or more record names using the same logic as GetEntityRecordName, but for multiple records at once - more efficient to use this method if you need to get multiple record names at once
     * @param info 
     * @returns an array of EntityRecordNameResult objects
     */
    public async GetEntityRecordNames(info: EntityRecordNameInput[], contextUser?: UserInfo): Promise<EntityRecordNameResult[]> {
        // valiate to make sure we don't have any null primary keys being sent in
        for (let i = 0; i < info.length; i++) {
            if (!info[i].CompositeKey.KeyValuePairs || info[i].CompositeKey.KeyValuePairs.length == 0) {
                throw new Error('GetEntityRecordNames: KeyValuePairs cannot be null or empty. It is for item ' + i.toString() + ' in the input array.');
            }
            else {
                // check each primary key value to make sure it's not null
                for (let j = 0; j < info[i].CompositeKey.KeyValuePairs.length; j++) {
                    if (!info[i].CompositeKey.KeyValuePairs[j] || !info[i].CompositeKey.KeyValuePairs[j].Value) {
                        throw new Error('GetEntityRecordNames: KeyValuePairs cannot contain null values. FieldName: ' + info[i].CompositeKey.KeyValuePairs[j]?.FieldName);
                    }
                }
            }

        }
        return await Metadata.Provider.GetEntityRecordNames(info, contextUser);          
    }

    /**
     * Creates a new TransactionGroup which can be used to bundle multiple database changes for BaseEntity derived classes to be processed as a single database transaction
     * @returns 
     */
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        return await Metadata.Provider.CreateTransactionGroup();
    }

    /**
     * Saves all the in-memory metadata to be updated in the local persistent storage method (which varies by provider). This generally shouldn't need to be called externally but is available to force an update to local storage as desired.
     */
    public async SaveLocalMetadataToStorage() {
        await Metadata.Provider.SaveLocalMetadataToStorage();
    }

    /**
     * Removes all the metadata from the local persistent storage method (which varies by provider). This generally shouldn't need to be called externally but is available to force an complete removal of local metadata in storage.
     * NOTE: this does not remove Datasets, for removing datasets, use ClearDatasetCache()
     */
    public async RemoveLocalMetadataFromStorage() {
        await Metadata.Provider.RemoveLocalMetadataFromStorage();
    }

    /**
     * Returns the local storage provider. This is used to store metadata locally on the client.
     * @returns - the local storage provider
     * @remarks - Use this for storing any type of data on the client. The Provider implements the storage mechanism which is persistent whenever possible, but in some cases purely in memory if local persistence is not available. Keep in mind that you must ensure that keys are unique so prefix all of your keys with something unique to avoid collisions.
     */
    public get LocalStorageProvider(): ILocalStorageProvider {
        return Metadata.Provider.LocalStorageProvider;
    }

    /**
     * Retrieves the date status information for a dataset and all its items from the server. This method will match the datasetName and itemFilters to the server's dataset and item filters to determine a match
     * @param datasetName 
     * @param itemFilters 
     */
    public async GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider): Promise<DatasetStatusResultType> {
        return Metadata.Provider.GetDatasetStatusByName(datasetName, itemFilters, contextUser, providerToUse);
    }
    /**
     * Always retrieves data from the server - this method does NOT check cache. To use cached local values if available, call GetAndCacheDatasetByName() instead
     * @param datasetName 
     * @param itemFilters 
     */
    public async GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider): Promise<DatasetResultType> {
        return Metadata.Provider.GetDatasetByName(datasetName, itemFilters, contextUser, providerToUse);
    }

    /**
     * Gets a dataset by name, if required, and caches it in a format available to the client (e.g. IndexedDB, LocalStorage, File, etc). The cache method is Provider specific
     * If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    public async GetAndCacheDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo): Promise<DatasetResultType>  {
        return Metadata.Provider.GetAndCacheDatasetByName(datasetName, itemFilters, contextUser);
    }

    /**
     * This routine checks to see if the local cache version of a given datasetName/itemFilters combination is up to date with the server or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async IsDatasetCacheUpToDate(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> {
        return Metadata.Provider.IsDatasetCacheUpToDate(datasetName, itemFilters);
    }

    /**
     * This routine gets the local cached version of a given datasetName/itemFilters combination, it does NOT check the server status first. 
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async GetCachedDataset(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType> {
        return Metadata.Provider.GetCachedDataset(datasetName, itemFilters);
    }

    /**
     * Stores a dataset in the local cache. If itemFilters are provided, the combination of datasetName and the filters are used to build a key and determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     * @param dataset 
     */
    public async CacheDataset(datasetName: string, itemFilters: DatasetItemFilterType[], dataset: DatasetResultType): Promise<void> {
        return Metadata.Provider.CacheDataset(datasetName, itemFilters, dataset);
    }

    /**
     * Determines if a given datasetName/itemFilters combination is cached locally or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async IsDatasetCached(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> {
        return Metadata.Provider.IsDatasetCached(datasetName, itemFilters);
    }

    /**
     * Creates a key for the given datasetName and itemFilters combination
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public GetDatasetCacheKey(datasetName: string, itemFilters?: DatasetItemFilterType[]): string {
        return Metadata.Provider.GetDatasetCacheKey(datasetName, itemFilters);
    }

    /**
     * If the specified datasetName is cached, this method will clear the cache. If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    public async ClearDatasetCache(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<void> {
        return Metadata.Provider.ClearDatasetCache(datasetName, itemFilters);
    }

    /**
     * Provides access the configuration object that was initially provided to configure the provider
     */
    get ConfigData(): ProviderConfigDataBase {
        return Metadata.Provider.ConfigData;
    }

}
