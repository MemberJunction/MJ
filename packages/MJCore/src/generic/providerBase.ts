import { BaseEntity } from "./baseEntity";
import { EntityDependency, EntityDocumentTypeInfo, EntityInfo, RecordDependency, RecordMergeRequest, RecordMergeResult } from "./entityInfo";
import { IMetadataProvider, ProviderConfigDataBase, MetadataInfo, ILocalStorageProvider, DatasetResultType, DatasetStatusResultType, DatasetItemFilterType, EntityRecordNameInput, EntityRecordNameResult, ProviderType, PotentialDuplicateRequest, PotentialDuplicateResponse, EntityMergeOptions, AllMetadata } from "./interfaces";
import { ApplicationInfo } from "../generic/applicationInfo";
import { AuditLogTypeInfo, AuthorizationInfo, RoleInfo, RowLevelSecurityFilterInfo, UserInfo } from "./securityInfo";
import { TransactionGroupBase } from "./transactionGroup";
import { MJGlobal, SafeJSONParse } from "@memberjunction/global";
import { LogError, LogStatus } from "./logging";
import { QueryCategoryInfo, QueryFieldInfo, QueryInfo, QueryPermissionInfo, QueryEntityInfo, QueryParameterInfo } from "./queryInfo";
import { LibraryInfo } from "./libraryInfo";
import { CompositeKey } from "./compositeKey";
import { ExplorerNavigationItem } from "./explorerNavigationItem";
import { Metadata } from "./metadata";



/**
 * Creates a new instance of AllMetadata from a simple object.
 * Handles deserialization and proper instantiation of all metadata classes.
 * @param data - The raw metadata object to convert
 * @param md - The metadata provider for context
 * @returns A fully populated AllMetadata instance with proper type instances
 */
export function MetadataFromSimpleObject(data: any, md: IMetadataProvider): AllMetadata {
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

/**
 * This is a list of all metadata classes that are used in the AllMetadata class.
 * Used to automatically determine the class type when deserializing the metadata and
 * for iterating through all metadata collections.
 * Each entry maps a property key to its corresponding class constructor.
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
    { key: 'AllQueryEntities', class: QueryEntityInfo },
    { key: 'AllQueryParameters', class: QueryParameterInfo },
    { key: 'AllEntityDocumentTypes', class: EntityDocumentTypeInfo },
    { key: 'AllLibraries', class: LibraryInfo },
    { key: 'AllExplorerNavigationItems', class: ExplorerNavigationItem }
];


/**
 * Base class for all metadata providers in MemberJunction.
 * Implements common functionality for metadata caching, refresh, and dataset management.
 * Subclasses must implement abstract methods for provider-specific operations.
 */
export abstract class ProviderBase implements IMetadataProvider {
    private _ConfigData: ProviderConfigDataBase;
    private _latestLocalMetadataTimestamps: MetadataInfo[];
    private _latestRemoteMetadataTimestamps: MetadataInfo[];
    private _localMetadata: AllMetadata = new AllMetadata();

    private _refresh = false;

    /******** ABSTRACT SECTION ****************************************************************** */
    /**
     * Determines if a refresh is currently allowed or not.
     * Subclasses should return FALSE if they are performing operations that should prevent refreshes.
     * This helps avoid metadata refreshes during critical operations.
     */
    protected abstract get AllowRefresh(): boolean;

    /**
     * Returns the provider type for the instance.
     * Identifies whether this is a Database or Network provider.
     */
    public abstract get ProviderType(): ProviderType;

    /**
     * For providers that have ProviderType==='Database', this property will return an object that represents the underlying database connection.
     * For providers where ProviderType==='Network' this property will throw an exception.
     * The type of object returned is provider-specific (e.g., SQL connection pool).
     */
    public abstract get DatabaseConnection(): any;

    /**
     * Gets the display name for a single entity record.
     * Uses the entity's IsNameField or falls back to 'Name' field if available.
     * @param entityName - The name of the entity
     * @param compositeKey - The primary key value(s) for the record
     * @param contextUser - Optional user context for permissions
     * @returns The display name of the record or null if not found
     */
    public abstract GetEntityRecordName(entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo): Promise<string>;
    
    /**
     * Gets display names for multiple entity records in a single operation.
     * More efficient than multiple GetEntityRecordName calls.
     * @param info - Array of entity/key pairs to lookup
     * @param contextUser - Optional user context for permissions
     * @returns Array of results with names and status for each requested record
     */
    public abstract GetEntityRecordNames(info: EntityRecordNameInput[], contextUser?: UserInfo): Promise<EntityRecordNameResult[]>;

    /**
     * Checks if a specific record is marked as a favorite by the user.
     * @param userId - The ID of the user to check
     * @param entityName - The name of the entity
     * @param CompositeKey - The primary key value(s) for the record
     * @param contextUser - Optional user context for permissions
     * @returns True if the record is a favorite, false otherwise
     */
    public abstract GetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey, contextUser?: UserInfo): Promise<boolean>;

    /**
     * Sets or removes a record's favorite status for a user.
     * @param userId - The ID of the user
     * @param entityName - The name of the entity
     * @param CompositeKey - The primary key value(s) for the record
     * @param isFavorite - True to mark as favorite, false to remove
     * @param contextUser - User context for permissions (required)
     */
    public abstract SetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey, isFavorite: boolean, contextUser: UserInfo): Promise<void>;
    /******** END - ABSTRACT SECTION ****************************************************************** */


    /**
     * Returns the currently loaded local metadata from within the instance
     */
    public get AllMetadata(): AllMetadata {
        return this._localMetadata;
    }

    /**
     * Configures the provider with the specified configuration data.
     * Handles metadata refresh if needed and initializes the provider.
     * @param data - Configuration including schema filters and connection info
     * @returns True if configuration was successful
     */
    public async Config(data: ProviderConfigDataBase): Promise<boolean> {
        this._ConfigData = data;

        // first, let's check to see if we have an existing Metadata.Provider registered, if so
        // unless our data.IgnoreExistingMetadata is set to true, we will not refresh the metadata
        if (Metadata.Provider && !data.IgnoreExistingMetadata) {
            // we have an existing globally registered provider AND we are not
            // requested to ignore the existing metadata, so we will not refresh it
            if (this.CopyMetadataFromGlobalProvider()) {
                return true; // we're done, if we fail here, we keep going and do normal logic
            }
        }

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

    /**
     * Copies metadata from the global provider to the local instance.
     * This is used to ensure that the local instance has the latest metadata
     * information available without having to reload it from the server.
     */
    protected CopyMetadataFromGlobalProvider(): boolean {
        try {
            if (Metadata.Provider && Metadata.Provider !== this && Metadata.Provider.AllMetadata) { 
                this._localMetadata = Metadata.Provider.AllMetadata
                return true;
            }
            return false;
        }
        catch (e) {
            LogError(`Failed to copy metadata from global provider: ${e.message}`);
            return false; // if we fail to copy the metadata, we will return false
        }
    }

    /**
     * Builds dataset filters based on the provider configuration.
     * Ensures MJ Core schema is always included and never excluded.
     * @returns Array of filters to apply when loading metadata
     */
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
    
    /**
     * Retrieves all metadata from the server and constructs typed instances.
     * Uses the MJ_Metadata dataset for efficient bulk loading.
     * @returns Complete metadata collection with all relationships
     */
    protected async GetAllMetadata(): Promise<AllMetadata> {
        try {
            // we are now using datasets instead of the custom metadata to GraphQL to simplify GraphQL's work as it was very slow preivously
            //const start1 = new Date().getTime();
            const f = this.BuildDatasetFilterFromConfig();

            // Get the dataset and cache it for anyone else who wants to use it
            const d = await this.GetDatasetByName(ProviderBase._mjMetadataDatasetName, f.length > 0 ? f : null);            
            if (d && d.Success) {
                // cache the dataset for anyone who wants to use it
                await this.CacheDataset(ProviderBase._mjMetadataDatasetName, f.length > 0 ? f : null, d);

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
    

    /**
     * Gets the current user information from the provider.
     * Must be implemented by subclasses to return user-specific data.
     * @returns Current user information including roles and permissions
     */
    protected abstract GetCurrentUser(): Promise<UserInfo> 

    /**
     * Post-processes entity metadata to establish relationships between entities and their child objects.
     * Links fields, permissions, relationships, and settings to their parent entities.
     * @param entities - Array of entity metadata
     * @param fields - Array of entity field metadata
     * @param fieldValues - Array of entity field value metadata
     * @param permissions - Array of entity permission metadata
     * @param relationships - Array of entity relationship metadata
     * @param settings - Array of entity settings metadata
     * @returns Processed array of EntityInfo instances with all relationships established
     */
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

    /**
     * Gets the configuration data that was provided to the provider.
     * @returns The provider configuration including schema filters
     */
    get ConfigData(): ProviderConfigDataBase {
        return this._ConfigData;
    }

    /**
     * Gets all entity metadata in the system.
     * @returns Array of EntityInfo objects representing all entities
     */
    public get Entities(): EntityInfo[] {
        return this._localMetadata.AllEntities;
    }
    /**
     * Gets all application metadata in the system.
     * @returns Array of ApplicationInfo objects representing all applications
     */
    public get Applications(): ApplicationInfo[] {
        return this._localMetadata.AllApplications;
    }
    /**
     * Gets the current user's information including roles and permissions.
     * @returns UserInfo object for the authenticated user
     */
    public get CurrentUser(): UserInfo {
        return this._localMetadata.CurrentUser;
    }
    /**
     * Gets all security roles defined in the system.
     * @returns Array of RoleInfo objects representing all roles
     */
    public get Roles(): RoleInfo[] {
        return this._localMetadata.AllRoles;
    }
    /**
     * Gets all row-level security filters defined in the system.
     * @returns Array of RowLevelSecurityFilterInfo objects for data access control
     */
    public get RowLevelSecurityFilters(): RowLevelSecurityFilterInfo[] {
        return this._localMetadata.AllRowLevelSecurityFilters;
    }
    /**
     * Gets all audit log types defined for tracking system activities.
     * @returns Array of AuditLogTypeInfo objects
     */
    public get AuditLogTypes(): AuditLogTypeInfo[] {
        return this._localMetadata.AllAuditLogTypes;
    }
    /**
     * Gets all authorization definitions in the system.
     * @returns Array of AuthorizationInfo objects defining permissions
     */
    public get Authorizations(): AuthorizationInfo[] {
        return this._localMetadata.AllAuthorizations;
    }
    /**
     * Gets all saved queries in the system.
     * @returns Array of QueryInfo objects representing stored queries
     */
    public get Queries(): QueryInfo[] {
        return this._localMetadata.AllQueries;
    }
    /**
     * Gets all query category definitions.
     * @returns Array of QueryCategoryInfo objects for query organization
     */
    public get QueryCategories(): QueryCategoryInfo[] {
        return this._localMetadata.AllQueryCategories;
    }
    /**
     * Gets all query field definitions.
     * @returns Array of QueryFieldInfo objects defining query result columns
     */
    public get QueryFields(): QueryFieldInfo[] {
        return this._localMetadata.AllQueryFields;
    }
    /**
     * Gets all query permission assignments.
     * @returns Array of QueryPermissionInfo objects defining query access
     */
    public get QueryPermissions(): QueryPermissionInfo[] {
        return this._localMetadata.AllQueryPermissions;
    }
    /**
     * Gets all query entity associations.
     * @returns Array of QueryEntityInfo objects linking queries to entities
     */
    public get QueryEntities(): QueryEntityInfo[] {
        return this._localMetadata.AllQueryEntities;
    }
    /**
     * Gets all query parameter definitions.
     * @returns Array of QueryParameterInfo objects for parameterized queries
     */
    public get QueryParameters(): QueryParameterInfo[] {
        return this._localMetadata.AllQueryParameters;
    }
    /**
     * Gets all library definitions in the system.
     * @returns Array of LibraryInfo objects representing code libraries
     */
    public get Libraries(): LibraryInfo[] {
        return this._localMetadata.AllLibraries;
    }
    /**
     * Gets all explorer navigation items including inactive ones.
     * @returns Array of all ExplorerNavigationItem objects
     */
    public get AllExplorerNavigationItems(): ExplorerNavigationItem[] {
        return this._localMetadata.AllExplorerNavigationItems;
    }
    private _cachedVisibleExplorerNavigationItems: ExplorerNavigationItem[] = null;
    /**
     * Gets only active explorer navigation items sorted by sequence.
     * Results are cached for performance.
     * @returns Array of active ExplorerNavigationItem objects
     */
    public get VisibleExplorerNavigationItems(): ExplorerNavigationItem[] {
        // filter and sort once and cache
        if (!this._cachedVisibleExplorerNavigationItems)
            this._cachedVisibleExplorerNavigationItems = this._localMetadata.AllExplorerNavigationItems.filter(e => e.IsActive).sort((a, b) => a.Sequence - b.Sequence);
        return this._cachedVisibleExplorerNavigationItems;
    }

    /**
     * Refreshes all metadata from the server.
     * Respects the AllowRefresh flag from subclasses.
     * @returns True if refresh was initiated or allowed
     */
    public async Refresh(): Promise<boolean> {
        // do nothing here, but set a _refresh flag for next time things are requested
        if (this.AllowRefresh) {
            this._refresh = true;
            return this.Config(this._ConfigData);
        }
        else
            return true; // subclass is telling us not to do any refresh ops right now
    }

    /**
     * Checks if local metadata is out of date and needs refreshing.
     * Compares local timestamps with server timestamps.
     * @returns True if refresh is needed, false otherwise
     */
    public async CheckToSeeIfRefreshNeeded(): Promise<boolean> {
        if (this.AllowRefresh) {
            await this.RefreshRemoteMetadataTimestamps(); // get the latest timestamps from the server first
            await this.LoadLocalMetadataFromStorage(); // then, attempt to load before we check to see if it is obsolete
            return this.LocalMetadataObsolete()
        }
        else //subclass is telling us not to do any refresh ops right now
            return false;
    }

    /**
     * Refreshes metadata only if needed based on timestamp comparison.
     * Combines check and refresh into a single operation.
     * @returns True if refresh was successful or not needed
     */
    public async RefreshIfNeeded(): Promise<boolean> {
        if (await this.CheckToSeeIfRefreshNeeded()) 
            return this.Refresh();
        else
            return true;
    }


    /**
     * Creates a new instance of a BaseEntity subclass for the specified entity and automatically calls NewRecord() to initialize it.
     * This method serves as the core implementation for entity instantiation in the MemberJunction framework.
     * 
     * @param entityName - The name of the entity to create (must exist in metadata)
     * @param contextUser - Optional user context for permissions and audit tracking
     * @returns Promise resolving to the newly created entity instance with NewRecord() called
     * @throws Error if entity name is not found in metadata or if instantiation fails
     */
    public async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
    
    /**
     * Creates a new instance of a BaseEntity subclass and loads an existing record using the provided key.
     * This overload provides a convenient way to instantiate and load in a single operation.
     * 
     * @param entityName - The name of the entity to create (must exist in metadata)
     * @param loadKey - CompositeKey containing the primary key value(s) for the record to load
     * @param contextUser - Optional user context for permissions and audit tracking
     * @returns Promise resolving to the entity instance with the specified record loaded
     * @throws Error if entity name is not found, instantiation fails, or record cannot be loaded
     */
    public async GetEntityObject<T extends BaseEntity>(entityName: string, loadKey: CompositeKey, contextUser?: UserInfo): Promise<T>;
    
    public async GetEntityObject<T extends BaseEntity>(
        entityName: string, 
        loadKeyOrContextUser?: CompositeKey | UserInfo,
        contextUser?: UserInfo
    ): Promise<T> {
        try {
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

            const entity: EntityInfo = this.Metadata.Entities.find(e => e.Name == entityName);
            if (entity) {
                // Use the MJGlobal Class Factory to do our object instantiation - we do NOT use metadata for this anymore, doesn't work well to have file paths with node dynamically at runtime
                // type reference registration by any module via MJ Global is the way to go as it is reliable across all platforms.
                try {
                    const newObject = MJGlobal.Instance.ClassFactory.CreateInstance<T>(BaseEntity, entityName, entity, this); 
                    await newObject.Config(actualContextUser);
                    
                    if (actualLoadKey) {
                        // Load existing record
                        const loadResult = await newObject.InnerLoad(actualLoadKey);
                        if (!loadResult) {
                            throw new Error(`Failed to load ${entityName} with key: ${actualLoadKey.ToString()}`);
                        }
                    } else {
                        // whenever we create a new object we want it to start
                        // out as a new record, so we call NewRecord() on it
                        newObject.NewRecord();
                    }

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
    public abstract GetRecordDependencies(entityName: string, CompositeKey: CompositeKey, contextUser?: UserInfo): Promise<RecordDependency[]> 

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
    public abstract MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo, options?: EntityMergeOptions): Promise<RecordMergeResult>  


    /**
     * Always retrieves data from the server - this method does NOT check cache. To use cached local values if available, call GetAndCacheDatasetByName() instead
     * @param datasetName 
     * @param itemFilters 
     */
    public abstract GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo): Promise<DatasetResultType>;
    /**
     * Retrieves the date status information for a dataset and all its items from the server. This method will match the datasetName and itemFilters to the server's dataset and item filters to determine a match
     * @param datasetName 
     * @param itemFilters 
     */
    public abstract GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo): Promise<DatasetStatusResultType>;

    /**
     * Gets a database by name, if required, and caches it in a format available to the client (e.g. IndexedDB, LocalStorage, File, etc). The cache method is Provider specific
     * If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    public async GetAndCacheDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo): Promise<DatasetResultType> {
        // first see if we have anything in cache at all, no reason to check server dates if we dont
        if (await this.IsDatasetCached(datasetName, itemFilters)) {
            // compare the local version, if exists to the server version dates
            if (await this.IsDatasetCacheUpToDate(datasetName, itemFilters)) {
                // we're up to date, all we need to do is get the local cache and return it
                return this.GetCachedDataset(datasetName, itemFilters);
            }
            else {
                // we're out of date, so get the dataset from the server
                const dataset = await this.GetDatasetByName(datasetName, itemFilters, contextUser);
                // cache it
                await this.CacheDataset(datasetName, itemFilters, dataset);

                return dataset;
            }
        }
        else {
            // get the dataset from the server
            const dataset = await this.GetDatasetByName(datasetName, itemFilters, contextUser);
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
            const val: string = await ls.GetItem(dateKey);
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
            const val = await ls.GetItem(key);
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
            await ls.SetItem(key, val);
            const dateKey = key + '_date';
            const dateVal = dataset.LatestUpdateDate.toISOString();
            await ls.SetItem(dateKey, dateVal);
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
            const val = await ls.GetItem(key);
            return val !== null && val !== undefined;
        }
    }

    /**
     * Creates a unique key for the given datasetName and itemFilters combination coupled with the instance connection string to ensure uniqueness when 2+ connections exist
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public GetDatasetCacheKey(datasetName: string, itemFilters?: DatasetItemFilterType[]): string {
        return this.LocalStoragePrefix + ProviderBase.localStorageRootKey + this.InstanceConnectionString + '__DATASET__' + datasetName + this.ConvertItemFiltersToUniqueKey(itemFilters);
    }

    /**
     * This property is implemented by each sub-class of ProviderBase and is intended to return a unique string that identifies the instance of the provider for the connection it is making.
     * For example: for network connections, the URL including a TCP port would be a good connection string, whereas on database connections the database host url/instance/port would be a good connection string.
     * This is used as part of cache keys to ensure different connections don't share cached data.
     */
    public abstract get InstanceConnectionString(): string;

    /**
     * Converts dataset item filters into a unique string key for caching.
     * @param itemFilters - Array of filters to convert
     * @returns JSON-formatted string representing the filters
     */
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
            await ls.Remove(key);
            const dateKey = key + '_date';
            await ls.Remove(dateKey);
        }
    }

    /**
     * Creates a new transaction group for managing database transactions.
     * Must be implemented by subclasses to provide transaction support.
     * @returns A new transaction group instance
     */
    public abstract CreateTransactionGroup(): Promise<TransactionGroupBase>;

    /**
     * Gets the latest metadata timestamps from the remote server.
     * Used to determine if local cache is out of date.
     * @returns Array of metadata timestamp information
     */
    get LatestRemoteMetadata(): MetadataInfo[] {
        return this._latestRemoteMetadataTimestamps
    }

    /**
     * Gets the latest metadata timestamps from local cache.
     * Used for comparison with remote timestamps.
     * @returns Array of locally cached metadata timestamps
     */
    get LatestLocalMetadata(): MetadataInfo[] {
        return this._latestLocalMetadataTimestamps
    }

    /**
     * Retrieves the latest metadata update timestamps from the server.
     * @returns Array of metadata update information
     */
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

    /**
     * Refreshes the remote metadata timestamps from the server.
     * Updates the internal cache of remote timestamps.
     * @returns True if timestamps were successfully refreshed
     */
    public async RefreshRemoteMetadataTimestamps(): Promise<boolean> {
        const mdTimeStamps = await this.GetLatestMetadataUpdates();  
        if (mdTimeStamps) {
            this._latestRemoteMetadataTimestamps = mdTimeStamps;
            return true;
        }
        else
            return false;
    }

    /**
     * Checks if local metadata is obsolete compared to remote metadata.
     * Compares timestamps and row counts to detect changes.
     * @param type - Optional specific metadata type to check
     * @returns True if local metadata is out of date
     */
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

    /**
     * Updates the local metadata cache with new data.
     * @param res - The new metadata to store locally
     */
    protected UpdateLocalMetadata(res: AllMetadata) {
        this._localMetadata = res;
    }

    /**
     * Gets the local storage provider implementation.
     * Must be implemented by subclasses to provide environment-specific storage.
     * @returns Local storage provider instance
     */
    abstract get LocalStorageProvider(): ILocalStorageProvider;

    /**
     * Loads metadata from local storage if available.
     * Deserializes and reconstructs typed metadata objects.
     */
    protected async LoadLocalMetadataFromStorage() {
        try {
            const ls = this.LocalStorageProvider;
            if (ls) {
                // execution environment supports local storage, use it
                this._latestLocalMetadataTimestamps = JSON.parse(await ls.GetItem(this.LocalStoragePrefix + ProviderBase.localStorageTimestampsKey))
                const temp = JSON.parse(await ls.GetItem(this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey)); // we now have a simple object for all the metadata
                if (temp) {
                    // we have local metadata
                    LogStatus('Metadata loaded from local storage')
                    const metadata = MetadataFromSimpleObject(temp, this); // create a new object to start this up
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

    /**
     * Saves current metadata to local storage for caching.
     * Serializes both timestamps and full metadata collections.
     */
    public async SaveLocalMetadataToStorage() {
        try {
            const ls = this.LocalStorageProvider;
            if (ls) {
                // execution environment supports local storage, use it
                await ls.SetItem(this.LocalStoragePrefix + ProviderBase.localStorageTimestampsKey, JSON.stringify(this._latestLocalMetadataTimestamps))

                // now persist the AllMetadata object
                await ls.SetItem(this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey, JSON.stringify(this._localMetadata))
            }
        }
        catch (e) {
            // some enviroments don't support local storage
            LogError(e)
        }
    }

    /**
     * Removes all cached metadata from local storage.
     * Clears both timestamps and metadata collections.
     */
    public async RemoveLocalMetadataFromStorage() {
        try {
            const ls = this.LocalStorageProvider;
            for (let i = 0; i < ProviderBase.localStorageKeys.length; i++) {
                await ls.Remove(this.LocalStoragePrefix + ProviderBase.localStorageKeys[i])
            }
        }
        catch (e) {
            // some enviroments don't support local storage
            LogError(e)
        }
    }

    /**
     * Gets the metadata provider instance.
     * Must be implemented by subclasses to provide access to metadata.
     * @returns The metadata provider instance
     */
    protected abstract get Metadata(): IMetadataProvider;
}