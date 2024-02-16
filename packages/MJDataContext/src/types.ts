import { BaseEntity, EntityInfo, LogError, Metadata, PrimaryKeyValue, QueryInfo, RunQuery, RunView, RunViewParams, UserInfo } from "@memberjunction/core";
import { DataContextEntity, DataContextItemEntity, UserViewEntityExtended } from "@memberjunction/core-entities";
import { MJGlobal, RegisterClass } from "@memberjunction/global";

export class DataContextFieldInfo {
    Name!: string;
    Type!: string;
    Description?: string;
}

@RegisterClass(DataContextItem) // this is the base class and the default implementation for the DataContextItem object, other implementations can be registered as well with higher priorities
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
    EntityID?: number;

    /**
     * ViewID - the ID of the view in the system, only used if type = 'view' 
     */
    ViewID?: number;

    /**
     * QueryID - the ID of the query in the system, only used if type = 'query'
     */
    QueryID?: number;

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
    DataContextItemID?: number;

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
    Data?: any[];
  

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
        instance.RecordID = singleRecord.PrimaryKey.Value;
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
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     * @returns 
     */
    public async LoadData(dataSource: any, forceRefresh: boolean = false, contextUser?: UserInfo): Promise<boolean> {
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
                        return this.LoadFromSingleRecord(contextUser);
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
                LogError(`Error running view. View Params: ${JSON.stringify(viewParams)}`);
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
                LogError(`Error running view. View Params: ${JSON.stringify(viewParams)}`);
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
    protected async LoadFromSingleRecord(contextUser: UserInfo): Promise<boolean> {
        try {
            const md = new Metadata();
            const record = await md.GetEntityObject(this.EntityName, contextUser);
            const pkeyVals: PrimaryKeyValue[] = [];
            const ei = md.Entities.find((e) => e.ID === this.EntityID);
            const rawVals = this.RecordID.split(',');
            for (let i = 0; i < ei.PrimaryKeys.length; i++) {
                const pk = ei.PrimaryKeys[i];
                const v = rawVals[i];
                pkeyVals.push({FieldName: pk.Name, Value: v});
            }
            if (await record.InnerLoad(pkeyVals)) {
                this.Data = await record.GetDataObject({
                    includeRelatedEntityData: false,
                    oldValues: false,
                    omitEmptyStrings: false,
                    omitNullValues: false,
                    relatedEntityList: [],
                    excludeFields: []
                });             
        
                return true;                    
            }
            else {
                LogError(`Error loading single record: ${this.RecordName}`);
                return false;
            }
        }
        catch (e) {
            LogError(`Error in DataContextItem.LoadFromSingleRecord: ${e && e.message ? e.message : ''}`);
            return false;
        }
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
                LogError(`Error running query ${this.RecordName}`);
                return false;
            }    
        }
        catch (e) {
            LogError(`Error in DataContextItem.LoadFromQuery: ${e && e.message ? e.message : ''}`);
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
     * @returns 
     */
    public ValidateDataExists(): boolean {
        return this.Data ? this.Data.length >= 0 : false; // can have 0 to many rows, just need to make sure we have a Data object to work with
    }
}

@RegisterClass(DataContext) // this is the base class and the default implementation for the DataContext object, other implementations can be registered as well with higher priorities
export class DataContext {
    /**
     * The ID of the data context in the system
     */
    ID!: number;

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
     * @returns 
     */
    public ValidateDataExists(): boolean {
        if (this.Items)
            return !this.Items.some(i => !i.ValidateDataExists()); // if any data item is invalid, return false
        else    
            return false;
    }
  
    /**
     * Return a simple object that will have a property for each item in our Items array. We will name each item sequentially as data_item_1, data_item_2, etc, using the itemPrefix parameter
     * @param itemPrefix defaults to 'data_item_' and can be set to anything desired
     * @returns 
     */
    public ConvertToSimpleObject(itemPrefix: string = 'data_item_'): any {
        // 
        const ret: any = {};
        for (let i = 0; i < this.Items.length; i++) {
            ret[`${itemPrefix}${i}`] = this.Items[i].Data;
        }
        return ret;
    }
  
    /**
     * Return a string that contains a type definition for a simple object for this data context. The object will have a property for each item in our Items array. We will name each item sequentially as data_item_1, data_item_2, etc, using the itemPrefix parameter
     * @param itemPrefix defaults to 'data_item_' and can be set to anything desired
     * @returns 
     */
    public CreateSimpleObjectTypeDefinition(itemPrefix: string = 'data_item_'): string {
        let sOutput: string = "";
        for (let i = 0; i < this.Items.length; i++) {
            const item = this.Items[i];
            sOutput += `${itemPrefix}${i}: []; // ${item.Description}\n`;
        }
        return `{${sOutput}}`;
    }

    /**
     * This method will load ONLY the metadata for the data context and data context items associated with the data context. This method will not load any data for the data context items. This method will return a promise that will resolve to true if the metadata was loaded successfully, and false if it was not.
     * @param DataContextID - the ID of the data context to load
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     */
    public async LoadMetadata(DataContextID: number, contextUser?: UserInfo): Promise<boolean> {
        try {
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
                            break;
                        case 'sql':
                            item.SQL = r.SQL;  
                            break;
                        case 'view':
                            item.ViewID = r.ViewID;
                            item.EntityID = r.EntityID;
                            if (item.ViewID) {
                                const v = await md.GetEntityObject<UserViewEntityExtended>('User Views', contextUser);
                                await v.Load(item.ViewID);
                                item.RecordName = v.Name;
                                item.ViewEntity = v;
                            }
                            break;
                    }
                    if (item.EntityID) {
                        item.Entity = md.Entities.find((e) => e.ID === item.EntityID);
                        item.EntityName = item.Entity.Name;
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
            if (!this.ID || this.ID <= 0)
                throw new Error(`Data Context ID not set or invalid`);

            const md = new Metadata();
            for (const item of this.Items) {
                const dciEntity = <DataContextItemEntity>await md.GetEntityObject('Data Context Items', contextUser);
                if (item.DataContextItemID > 0) 
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
                await dciEntity.Save();
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
     * This method will load the data for the data context items associated with the data context. This method must be called ONLY after the . This method will return a promise that will resolve to true if the data was loaded successfully, and false if it was not.
     * @param dataSource - the data source to use to execute the SQL statement - specified as an any type to allow for any type of data source to be used, but the actual implementation will be specific to the server side only
     * @param forceRefresh - (defaults to false) if true, the data will be reloaded from the data source even if it is already loaded, if false, the data will only be loaded if it hasn't already been loaded
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     */
    public async LoadData(dataSource: any, forceRefresh: boolean = false, contextUser?: UserInfo): Promise<boolean> {
        try {
            for (const item of this.Items) {
                if (!await item.LoadData(dataSource, forceRefresh, contextUser))
                    return false;
            }
            return true;
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
     * @param contextUser - the user that is requesting the data context (only required on server side operations, or if you want a different user's permissions to be used for the data context load)
     * @returns 
     */
    public async Load(DataContextID: number, dataSource: any, forceRefresh: boolean = false, contextUser?: UserInfo): Promise<boolean> {
        // load the metadata and THEN the data afterwards
        return await this.LoadMetadata(DataContextID, contextUser) && await this.LoadData(dataSource, forceRefresh, contextUser);
    }
}   
  