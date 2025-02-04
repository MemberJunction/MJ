import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType } from 'type-graphql';
import { AppContext } from '../types.js';
import { BaseEntity, CompositeKey, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { CompositeKeyInputType } from '../generic/KeyInputOutputTypes.js';



@ObjectType()
export class ActionItemOutputType {
    input: ActionItemInputType;
    success: boolean;
    errorMessage: string;
}

@ObjectType()
export class SyncDataResultType {
  @Field(() => Boolean)
  Success: boolean;

  Results: ActionItemOutputType[] = [];
}

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

@InputType()
export class ActionItemInputType {
    @Field(() => String)
    EntityName!: string;

    @Field(() => CompositeKeyInputType)
    PrimaryKey!: CompositeKeyInputType;

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
                results.push(await this.SyncSingleItem(item, context, md)); 
            }

            const overallSuccess = results.some((r) => !r.success);
            return { Success: overallSuccess, Results: results };
        } 
        catch (err) {
            LogError(err);
            throw new Error('SyncDataResolver::SyncData --- Error Syncing Data\n\n' + err);
        }
    }

    protected async SyncSingleItem(item: ActionItemInputType, context: AppContext, md: Metadata): Promise<ActionItemOutputType> {
        const result = new ActionItemOutputType();
        result.input = item;
        result.success = false;
        result.errorMessage = '';
        try {
            const e = md.Entities.find((e) => e.Name === item.EntityName);
            if (e) {
                const pk = new CompositeKey(item.PrimaryKey.KeyValuePairs);
                const entityObject = item.Type === SyncDataActionType.DeleteWithFilter ? null : await md.GetEntityObject(e.Name, context.userPayload.userRecord);
                const fieldValues = item.RecordJSON ? JSON.parse(item.RecordJSON) : {};
                switch (item.Type) {
                    case SyncDataActionType.Create:
                        await this.SyncSingleItemCreate(entityObject, fieldValues, result);
                        break;
                    case SyncDataActionType.Update:
                        await this.SyncSingleItemUpdate(entityObject, pk, fieldValues, result);
                        break;
                    case SyncDataActionType.CreateOrUpdate:
                        // in this case we attempt to load the item first, if it is not possible to load the item, then we create it
                        await this.SyncSingleItemCreateOrUpdate(entityObject, pk, fieldValues, result);
                        break;
                    case SyncDataActionType.Delete:
                        await this.SyncSingleItemDelete(entityObject, pk, result);
                        break;
                    case SyncDataActionType.DeleteWithFilter:
                        await this.SyncSingleItemDeleteWithFilter(item.EntityName, item.DeleteFilter, result, context.userPayload.userRecord);
                        break;
                    default:
                        throw new Error('Invalid SyncDataActionType');
                }
                result.success = true;
            } else {
                throw new Error('Entity not found');
            }
        } 
        catch (err) {
            result.errorMessage = typeof err === 'string' ? err : (err as any).message;
            LogError(err);
        }
        finally {
            return result;
        }
    }


    protected async SyncSingleItemDeleteWithFilter(entityName: string, filter: string, result: ActionItemOutputType, user: UserInfo) {
        try {
            // here we will iterate through the result of a RunView on the entityname/filter and delete each matching record
            let overallSuccess: boolean = true;
            let combinedErrorMessage: string = "";
            const rv = new RunView();
            const result = await rv.RunView<BaseEntity>({
                EntityName: entityName,
                ExtraFilter: filter,
                ResultType: 'entity_object'
            }, user);
            if (result && result.Success) {
                for (const entityObject of result.Results) {
                    if (!await entityObject.Delete()) {
                        overallSuccess = false;
                        combinedErrorMessage += 'Failed to delete the item :' + entityObject.LatestResult.Message + '\n';
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
            result.errorMessage = typeof e === 'string' ? e : (e as any).message;
        }
    }

    protected async SyncSingleItemCreateOrUpdate(entityObject: BaseEntity, pk: CompositeKey, fieldValues: any, result: ActionItemOutputType) {
        if (await entityObject.InnerLoad(pk)) {
            await this.InnerSyncSingleItemUpdate(entityObject, pk, fieldValues, result);
        }
        else {
            await this.SyncSingleItemCreate(entityObject, fieldValues, result);
        }
    }

    protected async SyncSingleItemDelete(entityObject: BaseEntity, pk: CompositeKey, result: ActionItemOutputType) {
        if (await entityObject.InnerLoad(pk)) {
            if (await entityObject.Delete()) {
                result.success = true;
            }
            else {
                result.errorMessage = 'Failed to delete the item :' + entityObject.LatestResult.Message;
            }
        }
        else {
            result.errorMessage = 'Failed to load the item, it is possible the record with the specified primary key does not exist';
        }
    }

    protected async SyncSingleItemCreate(entityObject: BaseEntity, fieldValues: any, result: ActionItemOutputType) {
        entityObject.NewRecord();
        entityObject.SetMany(fieldValues);
        if (await entityObject.Save()) {
            result.success = true;
        }
        else {
            result.errorMessage = 'Failed to create the item :' + entityObject.LatestResult.Message;
        }
    }

    protected async SyncSingleItemUpdate(entityObject: BaseEntity, pk: CompositeKey, fieldValues: any, result: ActionItemOutputType) {
        // attempt to load by pkey
        if (await entityObject.InnerLoad(pk)) {
            await this.InnerSyncSingleItemUpdate(entityObject, pk, fieldValues, result);
        }
        else {
            // failed to load the item
            result.errorMessage = 'Failed to load the item, it is possible the record with the specified primary key does not exist';
        }
    }

    protected async InnerSyncSingleItemUpdate(entityObject: BaseEntity, pk: CompositeKey, fieldValues: any, result: ActionItemOutputType) {
        entityObject.SetMany(fieldValues);
        if (await entityObject.Save()) {
            result.success = true;
        }
        else {
            result.errorMessage = 'Failed to update the item :' + entityObject.LatestResult.Message;
        }
    }
}
 