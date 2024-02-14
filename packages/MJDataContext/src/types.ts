import { BaseEntity, EntityInfo, QueryInfo } from "@memberjunction/core";
import { UserViewEntityExtended } from "@memberjunction/core-entities";

export class DataContextFieldInfo {
    Name!: string;
    Type!: string;
    Description?: string;
}

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
        const instance = new DataContextItem();
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
        const instance = new DataContextItem();
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
        const instance = new DataContextItem();
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
        const instance = new DataContextItem();
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


  
    Data?: any[];
  
    /**
     * Validates that the Data property is set. Valid states include a zero length array, or an array with one or more elements. If the Data property is not set, this method will return false
     * @returns 
     */
    public ValidateDataExists(): boolean {
        return this.Data ? this.Data.length >= 0 : false; // can have 0 to many rows, just need to make sure we have a Data object to work with
    }
}

export class DataContext {
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
}   
  