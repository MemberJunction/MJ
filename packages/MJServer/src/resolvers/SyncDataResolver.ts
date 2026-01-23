import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { BaseEntity, CompositeKey, EntityDeleteOptions, EntitySaveOptions, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { CompositeKeyInputType, CompositeKeyOutputType } from '../generic/KeyInputOutputTypes.js';
import { DatasetItemEntity } from '@memberjunction/core-entities';



/**
 * This type defines the possible list of actions that can be taken in syncing data: Create, Update, CreateOrUpdate, Delete, or DeleteWithFilter
 * DeleteWithFilter is where you specify a valid SQL expression that can be used in a where clause to get a list of records in a given entity to delete
 * this can be used to ensure cleaning out data from a subset of a given table.
 */
export enum SyncDataActionType {
    Create = "Create",
    Update = "Update",
    CreateOrUpdate = "CreateOrUpdate",
    Delete = "Delete",
    DeleteWithFilter = "DeleteWithFilter"
  }
  
  registerEnumType(SyncDataActionType, {
    name: "SyncDataActionType", // GraphQL Enum Name
    description: "Specifies the type of action to be taken in syncing, Create, Update, CreateOrUpdate, Delete" // Description,
  });
  

  @InputType() 
  export class ActionItemInputType {
      @Field(() => String)
      EntityName!: string;
  
      @Field(() => CompositeKeyInputType, {nullable: true})
      PrimaryKey?: CompositeKeyInputType;
  
      @Field(() => CompositeKeyInputType, {nullable: true})
      AlternateKey?: CompositeKeyInputType;
  
      @Field(() => SyncDataActionType) 
      Type!: SyncDataActionType;
  
      /**
       * This field is a JSON representation of the field values of the entity to be created or updated. It is used for all ActionTypes except for 
       */
      @Field(() => String, {nullable: true})
      RecordJSON?: string;
  
      /**
       * This field is only provided when the Action Type is DeleteWithFilter. It is a valid SQL expression that can be used in a where clause to get a list of records in a given entity to delete
       */
      @Field(() => String, {nullable: true})
      DeleteFilter?: string;
  }
  
  
@ObjectType()
export class ActionItemOutputType {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String)
    ErrorMessage: string;

    @Field(() => String)
    EntityName!: string;

    @Field(() => CompositeKeyOutputType, {nullable: true})
    PrimaryKey?: CompositeKeyOutputType;

    @Field(() => CompositeKeyOutputType, {nullable: true})
    AlternateKey?: CompositeKeyOutputType;

    @Field(() => SyncDataActionType) 
    Type!: SyncDataActionType;

    /**
     * This field is a JSON representation of the field values of the entity to be created or updated. It is used for all ActionTypes except for 
     */
    @Field(() => String, {nullable: true})
    RecordJSON?: string;

    /**
     * This field is only provided when the Action Type is DeleteWithFilter. It is a valid SQL expression that can be used in a where clause to get a list of records in a given entity to delete
     */
    @Field(() => String, {nullable: true})
    DeleteFilter?: string;
}

@ObjectType()
export class SyncDataResultType {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => [ActionItemOutputType])
  Results: ActionItemOutputType[] = [];
}


const __metadata_DatasetItems: string[] = [];

export class SyncDataResolver {
    /**
     * This mutation will sync the specified items with the existing system. Items will be processed in order and the results of each operation will be returned in the Results array within the return value.
     * @param items - an array of ActionItemInputType objects that specify the action to be taken on the specified entity with the specified primary key and the JSON representation of the field values. 
     */
    @RequireSystemUser()
    @Mutation(() => SyncDataResultType)
    async SyncData(
    @Arg('items', () => [ActionItemInputType] ) items: ActionItemInputType[],
    @Ctx() context: AppContext
    ) {
        try { 
            // iterate through the items 
            const md = new Metadata();
            const results: ActionItemOutputType[] = [];
            for (const item of items) {
                results.push(await this.SyncSingleItem(item, context, md, context.userPayload)); 
            }

            if (await this.DoSyncItemsAffectMetadata(context.userPayload.userRecord, items)) {
                await md.Refresh(); // force refesh the metadata which will cause a reload from the DB
            }

            const overallSuccess = !results.some((r) => !r.Success); // if any element in the array of results has a Success value of false, then the overall success is false
            return { Success: overallSuccess, Results: results };
        } 
        catch (err) {
            LogError(err);
            throw new Error('SyncDataResolver::SyncData --- Error Syncing Data\n\n' + err);
        }
    }

    protected async GetLowercaseMetadataEntitiesList(user: UserInfo, forceRefresh: boolean = false): Promise<string[]> {
        if (forceRefresh || __metadata_DatasetItems.length === 0) {
            const rv = new RunView(); // cache this, veyr simple - should use an engine for this stuff later
            const result = await rv.RunView<DatasetItemEntity>({
                EntityName: "Dataset Items",
                ExtraFilter: "Dataset = 'MJ_Metadata'",
            }, user)
            if (result && result.Success) {
                __metadata_DatasetItems.length = 0;
                __metadata_DatasetItems.push(...result.Results.map((r) => {
                    return r.Entity.trim().toLowerCase();
                }));
            }    
        }
        // now return the list of entities
        return __metadata_DatasetItems;
    }

    protected async DoSyncItemsAffectMetadata(user: UserInfo, items: ActionItemInputType[]): Promise<boolean> {
        // check to see if any of the items affect any of these entities:
        const entitiesToCheck = await this.GetLowercaseMetadataEntitiesList(user, false);
        for (const item of items) {
            if (entitiesToCheck.find(e => e === item.EntityName.trim().toLowerCase()) ) {
                return true;
            }
        }
        return false; // didn't find any
    }

    protected async SyncSingleItem(item: ActionItemInputType, context: AppContext, md: Metadata, userPayload: UserPayload): Promise<ActionItemOutputType> {
        const result = new ActionItemOutputType();
        result.AlternateKey = item.AlternateKey;
        result.PrimaryKey = item.PrimaryKey;
        result.DeleteFilter = item.DeleteFilter;
        result.EntityName = item.EntityName;
        result.RecordJSON = item.RecordJSON;
        result.Type = item.Type;
        result.Success = false;
        result.ErrorMessage = '';
        try {
            const e = md.Entities.find((e) => e.Name === item.EntityName);
            if (e) {
                const pk = item.PrimaryKey ? new CompositeKey(item.PrimaryKey.KeyValuePairs) : null;
                const ak = item.AlternateKey ? new CompositeKey(item.AlternateKey.KeyValuePairs) : null;
                const entityObject = item.Type === SyncDataActionType.DeleteWithFilter ? null : await md.GetEntityObject(e.Name, context.userPayload.userRecord);
                const fieldValues = item.RecordJSON ? JSON.parse(item.RecordJSON) : {};
                switch (item.Type) {
                    case SyncDataActionType.Create:
                        await this.SyncSingleItemCreate(entityObject, fieldValues, result, userPayload);
                        break;
                    case SyncDataActionType.Update:
                        await this.SyncSingleItemUpdate(entityObject, pk, ak, fieldValues, result, userPayload);
                        break;
                    case SyncDataActionType.CreateOrUpdate:
                        // in this case we attempt to load the item first, if it is not possible to load the item, then we create it
                        await this.SyncSingleItemCreateOrUpdate(entityObject, pk, ak, fieldValues, result, userPayload);
                        break;
                    case SyncDataActionType.Delete:
                        await this.SyncSingleItemDelete(entityObject, pk, ak, result, userPayload);
                        break;
                    case SyncDataActionType.DeleteWithFilter:
                        await this.SyncSingleItemDeleteWithFilter(item.EntityName, item.DeleteFilter, result, context.userPayload.userRecord, userPayload);
                        break;
                    default:
                        throw new Error('Invalid SyncDataActionType');
                }
            } else {
                throw new Error('Entity not found');
            }
        } 
        catch (err) {
            result.ErrorMessage = typeof err === 'string' ? err : (err as any).message;
            LogError(err);
        }
        finally {
            return result;
        }
    }


    protected async SyncSingleItemDeleteWithFilter(entityName: string, filter: string, result: ActionItemOutputType, user: UserInfo, userPayload: UserPayload) {
        try {
            // here we will iterate through the result of a RunView on the entityname/filter and delete each matching record
            let overallSuccess: boolean = true;
            let combinedErrorMessage: string = "";
            const rv = new RunView();
            const data = await rv.RunView<BaseEntity>({
                EntityName: entityName,
                ExtraFilter: filter,
                ResultType: 'entity_object'
            }, user);
            if (data && data.Success) {
                for (const entityObject of data.Results) {
                    if (!await entityObject.Delete()) {
                        overallSuccess = false;
                        combinedErrorMessage += 'Failed to delete the item :' + entityObject.LatestResult.CompleteMessage + '\n';
                    }
                }
                result.Success = overallSuccess
                if (!overallSuccess) {
                    result.ErrorMessage = combinedErrorMessage
                }
            }
            else {
                result.Success = false;
                result.ErrorMessage = 'Failed to run the view to get the list of items to delete for entity: ' + entityName + ' with filter: ' + filter + '\n';
            }
        }
        catch (e) {
            result.ErrorMessage = typeof e === 'string' ? e : (e as any).message;
        }
    }

    protected async LoadFromAlternateKey(entityName: string, alternateKey: CompositeKey, user: UserInfo): Promise<BaseEntity> {
        try {
            // no primary key provided, attempt to look up the primary key based on the 
            const rv = new RunView();
            const md = new Metadata();
            const entity = md.EntityByName(entityName);
            const r = await rv.RunView<BaseEntity>({
                EntityName: entityName,
                ExtraFilter: alternateKey.KeyValuePairs.map((kvp) => {
                    const fieldInfo = entity.Fields.find((f) => f.Name === kvp.FieldName);
                    const quotes = fieldInfo.NeedsQuotes ? "'" : '';
                    return `${kvp.FieldName} = ${quotes}${kvp.Value}${quotes}`;
                }).join(' AND '),
                ResultType: 'entity_object'
            }, user);
            if (r && r.Success && r.Results.length === 1) {
                return r.Results[0];
            }
            else {
                //LogError (`Failed to load the item with alternate key: ${alternateKey.KeyValuePairs.map((kvp) => `${kvp.FieldName} = ${kvp.Value}`).join(' AND ')}. Result: ${r.Success} and ${r.Results?.length} items returned`);
                return null;
            }
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }

    protected async SyncSingleItemCreateOrUpdate(entityObject: BaseEntity, pk: CompositeKey, ak: CompositeKey, fieldValues: any, result: ActionItemOutputType, userPayload: UserPayload) {
        if (!pk || pk.KeyValuePairs.length === 0) {
            // no primary key try to load from alt key
            const altKeyResult = await this.LoadFromAlternateKey(entityObject.EntityInfo.Name, ak, entityObject.ContextCurrentUser);
            if (!altKeyResult) {
                // no record found, create a new one
                await this.SyncSingleItemCreate(entityObject, fieldValues, result, userPayload);
            }
            else {
                await this.InnerSyncSingleItemUpdate(altKeyResult, fieldValues, result, userPayload);
            }
        }
        else {
            // have a primary key do the usual load
            if (await entityObject.InnerLoad(pk)) {
                await this.InnerSyncSingleItemUpdate(entityObject, fieldValues, result, userPayload);
            }
            else {
                await this.SyncSingleItemCreate(entityObject, fieldValues, result, userPayload);
            }    
        }
    }

    protected async SyncSingleItemDelete(entityObject: BaseEntity, pk: CompositeKey, ak: CompositeKey, result: ActionItemOutputType, userPayload: UserPayload) {
        if (!pk || pk.KeyValuePairs.length === 0) {
            const altKeyResult = await this.LoadFromAlternateKey(entityObject.EntityInfo.Name, ak, entityObject.ContextCurrentUser);
            if (!altKeyResult) {
                result.ErrorMessage = 'Failed to load the item, it is possible the record with the specified primary key does not exist';
            }
            else {
                // pass back the full record as it was JUST BEFORE the delete, often quite useful on the other end
                result.RecordJSON = await altKeyResult.GetDataObjectJSON({
                    includeRelatedEntityData: false,
                    excludeFields: [],
                    omitEmptyStrings: false,
                    relatedEntityList: [],
                    omitNullValues: false,
                    oldValues: false
                });
                if (await altKeyResult.Delete()) {
                    result.Success = true;
                }
                else {
                    result.ErrorMessage = 'Failed to delete the item :' + entityObject.LatestResult.CompleteMessage;
                }
            }
        }
        else if (await entityObject.InnerLoad(pk)) {
            // pass back the full record as it was JUST BEFORE the delete, often quite useful on the other end
            result.RecordJSON = await entityObject.GetDataObjectJSON({
                includeRelatedEntityData: false,
                excludeFields: [],
                omitEmptyStrings: false,
                relatedEntityList: [],
                omitNullValues: false,
                oldValues: false
            });
            if (await entityObject.Delete()) {
                result.Success = true;
            }
            else {
                result.ErrorMessage = 'Failed to delete the item :' + entityObject.LatestResult.CompleteMessage;
            }
        }
        else {
            result.ErrorMessage = 'Failed to load the item, it is possible the record with the specified primary key does not exist';
        }
    }

    protected async SyncSingleItemCreate(entityObject: BaseEntity, fieldValues: any, result: ActionItemOutputType, userPayload: UserPayload) {
        // make sure we strip out the primary key from fieldValues before we pass it in because otherwise it will appear to be an existing record to the BaseEntity
        const noPKValues = {...fieldValues};
        entityObject.EntityInfo.PrimaryKeys.forEach((pk) => {
            delete noPKValues[pk.Name];
        });
        entityObject.SetMany(noPKValues);
        if (await entityObject.Save()) {
            result.Success = true;
            result.PrimaryKey = new CompositeKey(entityObject.PrimaryKeys.map((pk) => ({FieldName: pk.Name, Value: pk.Value})));
            // pass back the full record AFTER the sync, that's often quite useful on the other end
            result.RecordJSON = await entityObject.GetDataObjectJSON({
                includeRelatedEntityData: false,
                excludeFields: [],
                omitEmptyStrings: false,
                relatedEntityList: [],
                omitNullValues: false,
                oldValues: false
            });
        }
        else {
            result.ErrorMessage = 'Failed to create the item :' + entityObject.LatestResult.CompleteMessage;
        }
    }

    protected async SyncSingleItemUpdate(entityObject: BaseEntity, pk: CompositeKey, ak: CompositeKey, fieldValues: any, result: ActionItemOutputType, userPayload: UserPayload) {
        if (!pk || pk.KeyValuePairs.length === 0) {
            // no pk, attempt to load by alt key
            const altKeyResult = await this.LoadFromAlternateKey(entityObject.EntityInfo.Name, ak, entityObject.ContextCurrentUser);
            if (!altKeyResult) {
                // no record found, create a new one
                result.ErrorMessage = 'Failed to load the item, it is possible the record with the specified alternate key does not exist';
            }
            else {
                await this.InnerSyncSingleItemUpdate(altKeyResult, fieldValues, result, userPayload);
            }
        }
        else if (await entityObject.InnerLoad(pk)) {
            await this.InnerSyncSingleItemUpdate(entityObject, fieldValues, result, userPayload);
        }
        else {
            // failed to load the item
            result.ErrorMessage = 'Failed to load the item, it is possible the record with the specified primary key does not exist';
        }
    }

    protected async InnerSyncSingleItemUpdate(entityObject: BaseEntity, fieldValues: any, result: ActionItemOutputType, userPayload: UserPayload) {
        entityObject.SetMany(fieldValues);
        if (await entityObject.Save()) {
            result.Success = true;
            if (!result.PrimaryKey || result.PrimaryKey.KeyValuePairs.length === 0) {
                result.PrimaryKey = new CompositeKey(entityObject.PrimaryKeys.map((pk) => ({FieldName: pk.Name, Value: pk.Value})));
            }
            // pass back the full record AFTER the sync, that's often quite useful on the other end
            result.RecordJSON = await entityObject.GetDataObjectJSON({
                includeRelatedEntityData: false,
                excludeFields: [],
                omitEmptyStrings: false,
                relatedEntityList: [],
                omitNullValues: false,
                oldValues: false
            });
        }
        else {
            result.ErrorMessage = 'Failed to update the item :' + entityObject.LatestResult.CompleteMessage;
        }
    }
}
 