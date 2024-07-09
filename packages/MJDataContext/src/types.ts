import { BaseEntity, DataObjectRelatedEntityParam, EntityInfo, LogError, Metadata, KeyValuePair, QueryInfo, RunQuery, RunView, RunViewParams, UserInfo, CompositeKey } from "@memberjunction/core";
import { DataContextEntity, DataContextItemEntity, UserViewEntityExtended } from "@memberjunction/core-entities";
import { MJGlobal, RegisterClass } from "@memberjunction/global";

export class DataContextFieldInfo {
    Name!: string;
    Type!: string;
    Description?: string;
}

/**
 * Base class and the default implementation for the DataContextItem object, other implementations (sub-classes) can be registered as well with higher priorities to take over for this particular class.
 */
@RegisterClass(DataContextItem) 
export class DataContextItem {
    /**
     * The type of the item, either "view", "query", "full_entity", or "sql", or "single_record"
     */
    Type!: 'view' | 'query' | 'full_entity' | 'sql' | 'single_record';

    /**
     * The primary key of the single record in the system, only used if type = 'single_record'. If the Entity has a composite key, this will be a command separated list of the primary key values in order of their definition in the entity.
     */
    RecordID!: string;

    /**
     * EntityID - the ID of the entity in the system, only used if type = 'full_entity', 'view', or 'single_record' --- for type of 'query' or 'sql' this property is not used as results can come from any number of entities in combination
     */
    EntityID?: string;

    /**
     * ViewID - the ID of the view in the system, only used if type = 'view' 
     */
    ViewID?: string;

    /**
     * QueryID - the ID of the query in the system, only used if type = 'query'
     */
    QueryID?: string;

    /**
     * The name of the view, query, or entity in the system. Not used with type='single_record' or type='sql'  
     */
    RecordName!: string;

    /**
     * SQL - the SQL statement to execute, only used if type = 'sql'
     */
    SQL?: string;

    /**
     * The name of the entity in the system, only used if type = 'full_entity', 'view', or 'single_record' --- for type of 'query' or 'sql' this property is not used as results can come from any number of entities in combination
     */
    EntityName?: string;

    /*
    * The fields in the view, query, or entity
    */
    Fields: DataContextFieldInfo[] = [];    

    /**
     * This field can be used at run time to stash the record ID in the database of the Data Context Item, if it was already saved. For items that haven't/won't be saved, this property can be ignored.
     */
    DataContextItemID?: string;

    /**
     * ViewEntity - the object instantiated that contains the metadata for the UserView being used - only populated if the type is 'view', also this is NOT to be sent to/from the API server, it is a placeholder that can be used 
     *              within a given tier like in the MJAPI server or in the UI.
     */
    ViewEntity?: UserViewEntityExtended;

    /**
     * SingleRecord - the object instantiated that contains the data for the single record being used - only populated if the type is 'single_record' - also this is NOT to be sent to/from the API server, it is a placeholder that can be used in a given tier
     */
    SingleRecord?: BaseEntity;

    /**
     * Entity - the object that contains metadata for the entity being used, only populated if the type is 'full_entity' or 'view' - also this is NOT to be sent to/from the API server, it is a placeholder that can be used
     *          within a given tier like in the MJAPI server or in the UI.
     */
    Entity?: EntityInfo;

    /** Additional Description has any other information that might be useful for someone (or an LLM) intepreting the contents of this data item */
    AdditionalDescription?: string;

    /**
     * This property contains the loaded data for the DataContextItem, if it was loaded successfully. The data will be in the form of an array of objects, where each object is a row of data. 
     */
    public get Data(): any[] {
        return this._Data;
    }
    public set Data(value: any[]) {
        this._Data = value;
        this.DataLoaded = value !== null && value !== undefined;
        if (this.DataLoaded)
            this.DataLoadingError = null;
    }

    private _Data?: any[];

    /**
     * This property is set to true if the data has been loaded for this DataContextItem, and false if it has not been loaded or if there was an error loading the data.  
     */
    DataLoaded: boolean = false;
  
    /**
     * This property contains an error message if there was an error loading the data for this DataContextItem. If there was no error, this property will be null;
     */
    DataLoadingError?: string;


    /**
     * Generated description of the item  which is dependent on the type of the item
     */
    get Description(): string {
        let ret: string = '';
        switch (this.Type) {
            case 'view':
                ret = `View: ${this.RecordName}, From Entity: ${this.EntityName}`;
                break;
            case 'query':
                ret = `Query: ${this.RecordName}`;
                break;
            case 'full_entity':
                ret = `Full Entity - All Records: ${this.EntityName}`;
                break;
            case 'sql':
                ret = `SQL Statement: ${this.RecordName}`;
                break;
            default:
                ret = `Unknown Type: ${this.Type}`;
                break;
        }
        if (this.AdditionalDescription && this.AdditionalDescription.length > 0) 
            ret += ` (More Info: ${this.AdditionalDescription})`;
        return ret;
    }
  
    /**
     * Create a new DataContextItem from a UserViewEntity class instance
     * @param viewEntity 
     */
    public static FromViewEntity(viewEntity: UserViewEntityExtended) {
        const instance = DataContext.CreateDataContextItem();
        // update our data from the viewEntity definition
        instance.Type= 'view';
        instance.ViewEntity = viewEntity;
        instance.Entity = viewEntity.ViewEntityInfo;
        instance.EntityName = viewEntity.ViewEntityInfo.Name;
        instance.ViewID = viewEntity.ID;
        instance.RecordName = viewEntity.Name;
        instance.Fields = viewEntity.ViewEntityInfo.Fields.map(f => {
            return {
                Name: f.Name,
                Type: f.Type,
                Description: f.Description
            }
        });
        return instance;
    }

    /**
     * Create a new DataContextItem from a BaseEntity class instance
     * @param singleRecord 
     * @returns 
     */
    public static FromSingleRecord(singleRecord: BaseEntity) {
        const instance = DataContext.CreateDataContextItem();
        instance.Type = 'single_record';
        instance.RecordID = singleRecord.PrimaryKey.ToString();
        instance.EntityID = singleRecord.EntityInfo.ID;
        instance.EntityName = singleRecord.EntityInfo.Name;
        instance.SingleRecord = singleRecord;
        return instance;
    }

    /**
     * Create a new DataContextItem from a QueryInfo class instance
     * @param query 
     * @returns 
     */
    public static FromQuery(query: QueryInfo) {
        const instance = DataContext.CreateDataContextItem();
        instance.Type = 'query';
        instance.QueryID = query.ID;
        instance.RecordName = query.Name;
        instance.Fields = query.Fields.map(f => {
            return {
                Name: f.Name,
                Type: f.SQLBaseType,
                Description: f.Description
            }
        });
        return instance;
    }
    
    /**
     * Create a new DataContextItem from a EntityInfo class instance
     * @param entity 
     * @returns 
     */
    public static FromFullEntity(entity: EntityInfo) {
        const instance = DataContext.CreateDataContextItem();
        instance.Type = 'full_entity';
        instance.EntityID = entity.ID;
        instance.EntityName = entity.Name;
        instance.Entity = entity;
        instance.RecordName = entity.Name;
        instance.Fields = entity.Fields.map(f => {
            return {
                Name: f.Name,
                Type: f.Type,
                Description: f.Description
            }
        });
        return instance;
    }

    /**
     * This method should only be called after this Item has been fully initialized. That can be done by calling LoadMetadata() on the DataContext object, 
     * or by calling the static methods FromViewEntity, FromSingleRecord, FromQuery, or FromFullEntity, or finally by manually setting the individual properties of the DataContextItem object.
     * A helper method, Load() at the DataContext level can be called to load the metadata and then all of the data for all items in the data context at once.
     * @param dataSource - the data source to use to execute the SQL statement - specified as an any type to allow for any type of data source to be used, but the actual implementation will be specific to the server side only. For client side use of this method, you can leave this as undefined and the Load will work so long as the Data Context Items you are loading are NOT of type 'sql'
     * @param forceRefresh - (defaults to false) if true, the data will be reloaded from the data source even if it is already loaded, if false, the data will only be loaded if it hasn't already been loaded
     * @param loadRelatedDataOnSingleRecords - (defaults to false) if true, related entity data will be loaded for single record items, if false, related entity data will not be loaded for single record items
     * @param maxRecordsPerRelationship - (defaults to 0) for the LoadData() portion of this routine --- if this param is set to a value greater than 0, the maximum number of records to load for each relationship will be limited to this value. Applies to single_record items only.
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     * @returns 
     */
    public async LoadData(dataSource: any, forceRefresh: boolean = false, loadRelatedDataOnSingleRecords: boolean = false, maxRecordsPerRelationship: number = 0, contextUser?: UserInfo): Promise<boolean> {
        try {
            if (this.Data && this.Data.length > 0 && !forceRefresh) // if we already have data and we aren't forcing a refresh, then we are done
                return true;
            else {
                switch (this.Type) {
                    case 'full_entity':
                        return this.LoadFromFullEntity(contextUser);
                    case 'view':
                        return this.LoadFromView(contextUser);
                    case 'single_record':
                        return this.LoadFromSingleRecord(contextUser, loadRelatedDataOnSingleRecords, maxRecordsPerRelationship);
                    case 'query':
                        return this.LoadFromQuery(contextUser);
                    case 'sql':
                        return this.LoadFromSQL(dataSource, contextUser);
                }    
            }
        }
        catch (e) {
            LogError(`Error in DataContextItem.Load: ${e && e.message ? e.message : ''}`);
            return false;
        }
    }

    /**
     * Loads the data context item data from a view. This method is called by the LoadData method if the type of the data context item is 'view'
     * @param contextUser 
     * @returns 
     */
    protected async LoadFromView(contextUser: UserInfo): Promise<boolean> {
        try {
            const rv = new RunView();
            const viewParams: RunViewParams = { IgnoreMaxRows: true }; // ignore max rows for both types
            viewParams.Fields = this.ViewEntity.ViewEntityInfo.Fields.map((f) => f.Name); // include all fields
            viewParams.ViewID = this.ViewID;
            const viewResult = await rv.RunView(viewParams, contextUser);
            if (viewResult && viewResult.Success) {
                this.Data = viewResult.Results;
                return true;
            }
            else {
                this.DataLoadingError = `Error running view. View Params: ${JSON.stringify(viewParams)}`;
                LogError(this.DataLoadingError);
                return false;
            }
        }
        catch (e) {
            LogError(`Error in DataContextItem.LoadFromView: ${e && e.message ? e.message : ''}`);
            return false;
        }
    }

    /**
     * Loads the data context item data from a full entity (meaning all rows in a given entity). This method is called by the LoadData method if the type of the data context item is 'full_entity'
     * @param contextUser 
     * @returns 
     */
    protected async LoadFromFullEntity(contextUser: UserInfo): Promise<boolean> {
        try {
            const md = new Metadata();
            const rv = new RunView();
            const viewParams: RunViewParams = { IgnoreMaxRows: true }; // ignore max rows for both types
            const e = md.Entities.find((e) => e.ID === this.EntityID);

            viewParams.EntityName = e.Name;
            const viewResult = await rv.RunView(viewParams, contextUser);
            if (viewResult && viewResult.Success) {
                this.Data = viewResult.Results;
                return true;
            }
            else {
                this.DataLoadingError = `Error running view. View Params: ${JSON.stringify(viewParams)}`;
                LogError(this.DataLoadingError);
                return false;
            }
        }
        catch (e) {
            LogError(`Error in DataContextItem.LoadFromFullEntity: ${e && e.message ? e.message : ''}`);
            return false;
        }
    }

    /**
     * Loads the data context item data from a query. This method is called by the LoadData method if the type of the data context item is 'query' 
     * @param contextUser 
     * @returns 
     */
    protected async LoadFromSingleRecord(contextUser: UserInfo, includeRelatedEntityData: boolean, maxRecordsPerRelationship: number): Promise<boolean> {
        try {
            const md = new Metadata();
            const record = await md.GetEntityObject(this.EntityName, contextUser);
            const pkeyVals: KeyValuePair[] = [];
            const ei = md.Entities.find((e) => e.ID === this.EntityID);
            const rawVals = this.RecordID.split(',');
            for (let i = 0; i < ei.PrimaryKeys.length; i++) {
                const pk = ei.PrimaryKeys[i];
                const v = rawVals[i];
                pkeyVals.push({FieldName: pk.Name, Value: v});
            }
            let compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs = pkeyVals;
            if (await record.InnerLoad(compositeKey)) {
                const dataObject = await record.GetDataObject({
                    includeRelatedEntityData: includeRelatedEntityData,
                    oldValues: false,
                    omitEmptyStrings: false,
                    omitNullValues: false,
                    relatedEntityList: includeRelatedEntityData ? this.buildRelatedEntityArray(maxRecordsPerRelationship) : [],
                    excludeFields: []
                });             

                this.Data = [dataObject]; // we always return an array of one object for single record loads

                return true;                    
            }
            else {
                this.DataLoadingError = `Error loading single record: ${this.RecordName}`;
                LogError(this.DataLoadingError);
                return false;
            }
        }
        catch (e) {
            this.DataLoadingError = `Error in DataContextItem.LoadFromSingleRecord: ${e && e.message ? e.message : ''}`;
            LogError(this.DataLoadingError);
            return false;
        }
    }

    protected buildRelatedEntityArray(maxRecords: number): DataObjectRelatedEntityParam[] {
        return this.Entity.RelatedEntities.map(re => {
            return { 
                relatedEntityName: re.RelatedEntity,
                maxRecords: maxRecords
            }
        })
    }


    /**
     * Loads the data context item data from a query. This method is called by the LoadData method if the type of the data context item is 'query' 
     * @param contextUser 
     * @returns 
     */
    protected async LoadFromQuery(contextUser: UserInfo): Promise<boolean> {
        try {
            const rq = new RunQuery();
            const queryResult = await rq.RunQuery({QueryID: this.QueryID}, contextUser);
            if (queryResult && queryResult.Success) {
                this.Data = queryResult.Results;

                return true;
            }
            else {
                this.DataLoadingError = `Error running query ${this.RecordName}`;
                LogError(this.DataLoadingError);
                return false;
            }    
        }
        catch (e) {
            this.DataLoadingError = `Error in DataContextItem.LoadFromQuery: ${e && e.message ? e.message : ''}`;
            LogError(this.DataLoadingError);
            return false;
        }
    }

    /**
     * Overrideable in sub-classes, the default implementation will throw an error because we don't have the ability to execute random SQL on the client side
     * @param dataSource - the data source to use to execute the SQL statement - specified as an any type to allow for any type of data source to be used, but the actual implementation will be specific to the server side only
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     */
    protected async LoadFromSQL(dataSource: any, contextUser: UserInfo): Promise<boolean> {
        throw new Error(`Not implemented in the base DataContextItem object. The server-side only sub-class of the DataContextItem object implements this method. 
                         Make sure you include @memberjunction/data-context-server in your project and use the DataContextItemServer class instead of DataContextItem. 
                         This happens automatically if you use the DataContext.Load() or DataContext.LoadMetadata() methods to load the data context.`);
    }
  
    /**
     * Validates that the Data property is set. Valid states include a zero length array, or an array with one or more elements. If the Data property is not set, this method will return false
     * @param ignoreFailedLoad - if true, we will not validate the data if the DataLoaded property is false, if false, we will validate the data regardless of the DataLoaded property
     * @returns 
     */
    public ValidateDataExists(ignoreFailedLoad: boolean = false): boolean {
        if (ignoreFailedLoad && !this.DataLoaded)
            return true;
        else
            return this.Data ? this.Data.length >= 0 : false; // can have 0 to many rows, just need to make sure we have a Data object to work with
    }

    /**
     * Creates a new DataContextItem object from a raw data object. This method will return a new DataContextItem object if the raw data was successfully converted, and will return null if the raw data was not successfully converted.
     * @param rawItem 
     * @returns 
     */
    public static FromRawItem(rawItem: any): DataContextItem {
        const item = DataContext.CreateDataContextItem();
        item.Type = rawItem.Type;
        item.RecordID = rawItem.RecordID;
        item.EntityID = rawItem.EntityID;
        item.ViewID = rawItem.ViewID;
        item.QueryID = rawItem.QueryID;
        item.SQL = rawItem.SQL;
        item.EntityName = rawItem.EntityName;
        item.RecordName = rawItem.RecordName;
        item.AdditionalDescription = rawItem.AdditionalDescription;
        item.DataContextItemID = rawItem.DataContextItemID;
        item._Data = rawItem._Data;
        item.DataLoaded = rawItem.DataLoaded;
        item.DataLoadingError = rawItem.DataLoadingError;
        if (rawItem.Fields && rawItem.Fields.length > 0) {
            item.Fields = rawItem.Fields.map((f: any) => {
                return {
                    Name: f.Name,
                    Type: f.Type,
                    Description: f.Description
                }
            });
        }

        return item;
    }
}

@RegisterClass(DataContext) // this is the base class and the default implementation for the DataContext object, other implementations can be registered as well with higher priorities
export class DataContext {
    /**
     * The ID of the data context in the system
     */
    ID!: string;

    /**
     * The object holding all the metadata for the data context - this only is in place automatically if you called the `LoadMetadata` method
     */
    DataContextEntity: DataContextEntity;

    /**
     * The items in the data context
     */
    Items: DataContextItem[] = [];
  
    /**
     * Simple validation method that determines if all of the items in the data context have data set. This doesn't mean the items have data in them as zero-length data is consider valid, it is checking to see if the Data property is set on each item or not
     * @param ignoreFailedLoadItems - if set to true, we will ignore individual items that have not been loaded due to loading errors and only validate the data exists in the items that have been loaded. If set to false, we will validate all items regardless of their load state
     * @returns 
     */
    public ValidateDataExists(ignoreFailedLoadItems: boolean = false): boolean {
        if (this.Items)
            return !this.Items.some(i => !i.ValidateDataExists(ignoreFailedLoadItems)); // if any data item is invalid, return false
        else    
            return false;
    }
  
    /**
     * Return a simple object that will have a property for each item in our Items array. We will name each item sequentially as data_item_1, data_item_2, etc, using the itemPrefix parameter
     * @param itemPrefix defaults to 'data_item_' and can be set to anything desired
     * @param includeFailedLoadItems - if true, we will include items that have not been loaded due to loading errors in the output object, if false, we will only include items that have been loaded successfully
     * @returns 
     */
    public ConvertToSimpleObject(itemPrefix: string = 'data_item_', includeFailedLoadItems: boolean = false): any {
        const ret: any = {};
        const items = includeFailedLoadItems ? this.Items : this.Items.filter(i => i.DataLoaded);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            ret[`${itemPrefix}${i}`] = item.Data;
        }
        return ret;
    }
  
    /**
     * Return a string that contains a type definition for a simple object for this data context. The object will have a property for each item in our Items array. We will name each item sequentially as data_item_1, data_item_2, etc, using the itemPrefix parameter
     * @param itemPrefix defaults to 'data_item_' and can be set to anything desired
     * @param includeFailedLoadItems - if true, we will include items that have not been loaded due to loading errors in the output object, if false, we will only include items that have been loaded successfully
     * @returns 
     */
    public CreateSimpleObjectTypeDefinition(itemPrefix: string = 'data_item_', includeFailedLoadItems: boolean = false): string {
        let sOutput: string = "";
        const items = includeFailedLoadItems ? this.Items : this.Items.filter(i => i.DataLoaded);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            sOutput += `${itemPrefix}${i}: []; // ${item.Description}\n`;
        }
        return `{${sOutput}}`;
    }

    /**
     * This method will load ONLY the metadata for the data context and data context items associated with the data context. This method will not load any data for the data context items. This method will return a promise that will resolve to true if the metadata was loaded successfully, and false if it was not.
     * @param DataContextID - the ID of the data context to load
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     */
    public async LoadMetadata(DataContextID: string, contextUser?: UserInfo): Promise<boolean> {
        try {
            if (!DataContextID || DataContextID.length === 0)
                throw new Error(`Data Context ID not set or invalid`);

            const md = new Metadata();
            const rv = new RunView();
            const dciEntityInfo = md.Entities.find((e) => e.Name === 'Data Context Items');
            if (!dciEntityInfo)
              throw new Error(`Data Context Items entity not found`);
        
            this.DataContextEntity = await md.GetEntityObject<DataContextEntity>('Data Contexts', contextUser);
            await this.DataContextEntity.Load(DataContextID);
            this.ID = this.DataContextEntity.ID; // do it this way to make sure it loaded properly
            if (!this.ID)
                throw new Error(`Data Context ID: ${DataContextID} not found`);

            const result = await rv.RunView({EntityName: 'Data Context Items', IgnoreMaxRows: true, ExtraFilter: `DataContextID = ${DataContextID}`}, contextUser);
            if (!result || !result.Success) 
              throw new Error(`Error running view to retrieve data context items for data context ID: ${DataContextID}`);
            else { 
                const items = result.Results;
                for (let i = 0; i < items.length; i++) {
                    const r = <DataContextItemEntity>items[i];
                    const item = this.AddDataContextItem();
                    item.DataContextItemID = r.ID;
                    item.Type = <"view" | "query" | "full_entity" | "sql" | "single_record">r.Type;
                    switch (item.Type) {
                        case 'full_entity':
                            item.EntityID = r.EntityID;  
                            break;
                        case 'single_record':
                            item.RecordID = r.RecordID;  
                            item.EntityID = r.EntityID;  
                            break;
                        case 'query':
                            item.QueryID = r.QueryID; // map the QueryID in our database to the RecordID field in the object model for runtime use
                            const q = md.Queries.find((q) => q.ID === item.QueryID);
                            item.RecordName = q?.Name;
                            item.SQL = q.SQL;
                            break;
                        case 'sql':
                            item.SQL = r.SQL;  
                            break;
                        case 'view':
                            item.ViewID = r.ViewID;
                            item.EntityID = r.EntityID; // attempt to get this from the database, often will be null though
                            if (item.ViewID) {
                                const v = await md.GetEntityObject<UserViewEntityExtended>('User Views', contextUser);
                                await v.Load(item.ViewID);
                                item.RecordName = v.Name;
                                item.EntityID = v.ViewEntityInfo.ID; // if we get here, we overwrite whateer we had above because we have the actual view metadata.
                                item.ViewEntity = v;
                                item.SQL =  `SELECT * FROM ${v.ViewEntityInfo.SchemaName}.${v.ViewEntityInfo.BaseView}${v.WhereClause && v.WhereClause.length > 0 ? ' WHERE ' + v.WhereClause : ''}`;
                            }
                            break;
                    }
                    if (item.EntityID) {
                        item.Entity = md.Entities.find((e) => e.ID === item.EntityID);
                        item.EntityName = item.Entity.Name;
                        item.Fields = this.MapEntityFieldsToDataContextFields(item.Entity);
                        if (item.Type === 'full_entity')
                            item.RecordName = item.EntityName;
                    }
                    if (r.DataJSON && r.DataJSON.length > 0) {
                        item.Data = JSON.parse(r.DataJSON);
                    }
                }
            }
            return true;
        }
        catch (ex) {
            LogError(`Error in DataContext.LoadMetadata: ${ex && ex.message ? ex.message : ''}`);
            return false;
        }
    }

    protected MapEntityFieldsToDataContextFields(entity: EntityInfo): DataContextFieldInfo[] {
        return entity.Fields.map(f => {
            return {
                Name: f.Name,
                Type: f.Type,
                Description: f.Description
            }
        });
    }

    /**
     * Saves the data context items to the database. For each data context item, if it has an existing ID in the database, that database record will be updated. 
     * For data context items that don't have an ID (meaning they've not yet been saved), a new record will be created in the database.
     * This method will return a promise that will resolve to true if the data was saved successfully, and false if it was not.
     * IMPORTANT: This method will not save if the ID property of the object is not set to a valid value.
     * @param contextUser - optional, the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     * @param persistItemData - optional, if true, the data for each item will be saved to the database, if false, the data will not be saved to the database. The default is false.
     * @returns 
     */
    public async SaveItems(contextUser?: UserInfo, persistItemData: boolean = false): Promise<boolean> {
        try {
            if (!this.ID || this.ID.length === 0)
                throw new Error(`Data Context ID not set or invalid`);

            const md = new Metadata();
            for (const item of this.Items) {
                const dciEntity = <DataContextItemEntity>await md.GetEntityObject('Data Context Items', contextUser);
                if (item.DataContextItemID && item.DataContextItemID.length > 0) 
                  await dciEntity.Load(item.DataContextItemID);
                else
                  dciEntity.NewRecord();
                dciEntity.DataContextID = this.ID;
                dciEntity.Type = item.Type;
                switch (item.Type) {
                  case 'full_entity':
                  case 'single_record':
                    const e = item.Entity || md.Entities.find((e) => e.Name === item.EntityName);
                    dciEntity.EntityID = e.ID;
                    if (item.Type === 'single_record')
                      dciEntity.RecordID = item.RecordID;
                    break;
                  case 'view':
                    dciEntity.ViewID = item.ViewID;  
                    break;
                  case 'query':
                    dciEntity.QueryID = item.QueryID;  
                    break;
                  case 'sql':
                    dciEntity.SQL = item.SQL;  
                    break;
                }
                if (persistItemData && item.Data && item.Data.length > 0 )
                    dciEntity.DataJSON = JSON.stringify(item.Data); 
                else
                    dciEntity.DataJSON = null; //JSON.stringify(item.Data); 

                if (await dciEntity.Save()) {
                    item.DataContextItemID = dciEntity.ID;
                }
            }          
        }   
        catch (e) {
            LogError(`Error in DataContext.SaveItems: ${e && e.message ? e.message : ''}`);
            return false;
        }
    }

    /**
     * This method will create a new DataContextItem object and add it to the data context. This method will return the newly created DataContextItem object.
     * @returns 
     */
    public AddDataContextItem(): DataContextItem {
        // get a new data context item. Using class factory instead of directly instantiating the class so that we can use the class factory 
        // to override the default class with a custom class if another package registers a higher priority sub-class than our default impleemtnation - for example - server side implementations...
        const item = DataContext.CreateDataContextItem();
        this.Items.push(item);
        return item;
    }

    /**
     * This method will create a new DataContextItem object. This method is used internally by the AddDataContextItem method, but can also be called directly if you need to create a DataContextItem object for some other purpose. 
     * NOTE: this method does NOT add the newly created DataContextItem to the data context, you must do that yourself if you use this method directly.
     */
    public static CreateDataContextItem(): DataContextItem {
        const item = <DataContextItem>MJGlobal.Instance.ClassFactory.CreateInstance(DataContextItem); 
        return item;
    }

    /**
     * This method will load the data for the data context items associated with the data context. This method must be called ONLY after LoadMetadata(). This method will return a promise that will resolve to true if the data was loaded successfully, and false if it was not.
     * @param dataSource - the data source to use to execute the SQL statement - specified as an any type to allow for any type of data source to be used, but the actual implementation will be specific to the server side only
     * @param forceRefresh - (defaults to false) if true, the data will be reloaded from the data source even if it is already loaded, if false, the data will only be loaded if it hasn't already been loaded
     * @param loadRelatedDataOnSingleRecords - (defaults to false) if true, related entity data will be loaded for single record items, if false, related entity data will not be loaded for single record items
     * @param maxRecordsPerRelationship - (defaults to 0) for the LoadData() portion of this routine --- if this param is set to a value greater than 0, the maximum number of records to load for each relationship will be limited to this value. Applies to single_record items only.
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     */
    public async LoadData(dataSource: any, forceRefresh: boolean = false, loadRelatedDataOnSingleRecords: boolean = false, maxRecordsPerRelationship: number = 0, contextUser?: UserInfo): Promise<boolean> {
        try {
            if (!this.ID || this.ID.length === 0)
                throw new Error(`Data Context ID not set or invalid`);

            let bSuccess: boolean = true;
            let promises: Promise<boolean>[] = this.Items.map(async (item) => {
                return await item.LoadData(dataSource, forceRefresh, loadRelatedDataOnSingleRecords, maxRecordsPerRelationship, contextUser);
            });
            const results: boolean[] = await Promise.all(promises);
            for(const result of results){
                if (!result){
                    bSuccess = false;
                }
            }

            return bSuccess;
        }
        catch (e) {
            LogError(`Error in DataContext.LoadData: ${e && e.message ? e.message : ''}`);
            return false;
        }
    }

    /**
     * This method will load both the metadata and the data for the data context items associated with the data context. This method will return a promise that will resolve to true if the data was loaded successfully, and false if it was not.
     * @param DataContextID - the ID of the data context to load
     * @param dataSource - the data source to use to execute the SQL statement - specified as an any type to allow for any type of data source to be used, but the actual implementation will be specific to the server side only
     * @param forceRefresh - (defaults to false) for the LoadData() portion of this routine --- if this param is set to true, the data will be reloaded from the data source even if it is already loaded, if false, the data will only be loaded if it hasn't already been loaded
     * @param loadRelatedDataOnSingleRecords - (defaults to false) for the LoadData() portion of this routine --- if this param is set to true, related entity data will be loaded for single record items, if false, related entity data will not be loaded for single record items
     * @param maxRecordsPerRelationship - (defaults to 0) for the LoadData() portion of this routine --- if this param is set to a value greater than 0, the maximum number of records to load for each relationship will be limited to this value. Applies to single_record items only.
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     * @returns 
     */
    public async Load(DataContextID: string, dataSource: any, forceRefresh: boolean = false, loadRelatedDataOnSingleRecords: boolean = false, maxRecordsPerRelationship: number = 0, contextUser?: UserInfo): Promise<boolean> {
        // load the metadata and THEN the data afterwards
        return await this.LoadMetadata(DataContextID, contextUser) && await this.LoadData(dataSource, forceRefresh, loadRelatedDataOnSingleRecords, maxRecordsPerRelationship, contextUser);
    }

    /**
     * Utility method to create a new DataContext object from a raw data object. This method will return a promise that will resolve to a new DataContext object if the raw data was successfully converted, and will reject if the raw data was not successfully converted.
     * @param rawData 
     */
    public static async FromRawData(rawData: any): Promise<DataContext> {
        const newContext = new DataContext();
        if (rawData) {
            newContext.ID = rawData.ID;
            if (rawData.Items && rawData.Items.length > 0) {
                for (const rawItem of rawData.Items) {
                    const item = DataContextItem.FromRawItem(rawItem); 
                    if (item)
                        newContext.Items.push(item);
                }
            }
        }
        return newContext;
    }

    /**
     * This method will clone the data context and all of its items. This method will return a promise that will resolve to a new DataContext object if the cloning was successful, and will reject if the cloning was not successful.
     * @param context 
     */
    public static async Clone(context: DataContext, includeData: boolean = false, contextUser: UserInfo = undefined): Promise<DataContext> {
        try {
            const md = new Metadata();

            // first, clone the data context itself at the top level
            const currentContext = await md.GetEntityObject<DataContextEntity>('Data Contexts', contextUser);
            await currentContext.Load(context.ID);

            const newContext = await md.GetEntityObject<DataContextEntity>('Data Contexts', contextUser);
            newContext.NewRecord();
            newContext.CopyFrom(currentContext, false);
            if (await newContext.Save()) {
                // we've saved our new data context, now we need to save all of the items
                for (let item of context.Items) {
                    const currentItem = await md.GetEntityObject<DataContextItemEntity>('Data Context Items', contextUser);
                    await currentItem.Load(item.DataContextItemID);

                    const newItem = await md.GetEntityObject<DataContextItemEntity>('Data Context Items', contextUser); 
                    newItem.NewRecord();

                    newItem.CopyFrom(currentItem, false);
                    newItem.DataContextID = newContext.ID; // overwrite the data context ID with the new data context ID
                    if (!includeData)
                        newItem.DataJSON = null; // if we aren't including the data, we need to clear it out

                    if (!await newItem.Save()) {
                        throw new Error(`Error saving new data context item`);
                    }
                }
                // if we get here we've succeeded, so return the new data context
                const newContextObject = new DataContext();
                await newContextObject.LoadMetadata(newContext.ID, contextUser);
                return newContextObject;
            }
            else {
                throw new Error(`Error saving new data context`);
            }
        }
        catch (e) {
            LogError(`Error in DataContext.Clone: ${e && e.message ? e.message : ''}`);
            return null;
        }
    }
}   
  