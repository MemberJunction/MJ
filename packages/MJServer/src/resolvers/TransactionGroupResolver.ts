import { Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, registerEnumType } from 'type-graphql';
import { AppContext } from '../types.js';
import { CompositeKey, KeyValuePair, LogError, Metadata, TransactionVariable, BaseEntity, EntityDeleteOptions, EntitySaveOptions } from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';

export enum TransactionVariableType {
    Define = "Define",
    Use = "Use",
}

registerEnumType(TransactionVariableType, {
    name: "TransactionVariableType",  
    description: "Specifies the type of variable: Define or Use",
});

export enum TransactionOperationType {
    Create = "Create",
    Update = "Update",
    Delete = "Delete"
}

registerEnumType(TransactionOperationType, {
    name: "TransactionOperationType",  
    description: "Specifies the type of operation: Create, Update, or Delete",
});


@InputType() 
export class TransactionVariableInputType {
    @Field(() => String)
    Name!: string;

    @Field(() => Int)
    ItemIndex!: number;

    @Field(() => String)
    FieldName!: string;
  
    @Field(() => TransactionVariableType) 
    Type!: TransactionVariableType;
}
  
@InputType() 
export class TransactionItemInputType {
    @Field(() => String)
    EntityName: string;

    @Field(() => String)
    EntityObjectJSON: string;

    @Field(() => TransactionOperationType)
    OperationType: TransactionOperationType;
}
  
@InputType() 
export class TransactionInputType {
    @Field(() => [TransactionItemInputType])
    Items: TransactionItemInputType[];

    @Field(() => [TransactionVariableInputType], {nullable: true})
    Variables?: TransactionVariableInputType[] | null;
}


@ObjectType()
export class TransactionOutputType {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => [String])
    ErrorMessages: string[];

    @Field(() => [String])
    ResultsJSON: string[];
}



export class TransactionResolver {
    @Mutation(() => TransactionOutputType)
    async ExecuteTransactionGroup(
    @Arg('group', () => TransactionInputType ) group: TransactionInputType,
    @Ctx() context: AppContext
    ) {
        try {
            // we have received the transaction group information via the network, now we need to reconstruct our TransactionGroup object and run it
            const md = new Metadata();
            const tg = await md.CreateTransactionGroup();
            const entityObjects: BaseEntity[] = [];
            const objectValues: any[] = [];

            for (const item of group.Items) {
                // instantiate a new entity object for the item
                const entity = await md.GetEntityObject(item.EntityName, context.userPayload.userRecord);
                entityObjects.push(entity); // save for later for mapping variables if needed

                // get the values from the payload
                const itemValues = SafeJSONParse(item.EntityObjectJSON);
                // build a primary key for the item
                const pkey = new CompositeKey(entity.PrimaryKeys.map(pk => {
                    const kv = new KeyValuePair();
                    kv.FieldName = pk.Name;
                    kv.Value = itemValues[pk.Name];
                    return kv;
                }));
                switch (item.OperationType) {
                    case "Update":
                    case "Create":
                        if (item.OperationType === "Update") {
                            await entity.InnerLoad(pkey);
                        }
                        objectValues.push(itemValues);
                        entity.SetMany(itemValues, true);
                        entity.TransactionGroup = tg;
                        await entity.Save();
                        break;
                    case "Delete":
                        await entity.InnerLoad(pkey);
                        objectValues.push(entity.GetDataObject());
                        entity.TransactionGroup = tg;
                        await entity.Delete();
                        break;
                }
            }

            // now, we need to set the variables
            if (group.Variables && group.Variables.length > 0) {
                for (const networkVar of group.Variables) {
                    // for each variable, add it to the transaction group and map the index from the network payload to the specific entity object loaded up above
                    if (networkVar.ItemIndex >= 0 && networkVar.ItemIndex < entityObjects.length) {
                        const entityObject = entityObjects[networkVar.ItemIndex];
                        const newVar = new TransactionVariable(networkVar.Name, entityObject, networkVar.FieldName, networkVar.Type);
                        tg.AddVariable(newVar);
                    }
                    else {
                        throw new Error(`TransactionResolver::ExecuteTransactionGroup --- Error\n\n' + 'Invalid ItemIndex ${networkVar.ItemIndex} in TransactionVariable "${JSON.stringify(networkVar)}"`);
                    }
                }
            }

            // after all that, we are ready to roll, so let's run the TG
            if (await tg.Submit()) {
                // success!
                return await this.PrepareReturnValue(true, entityObjects, objectValues, group);
            }
            else {
                // failure, send back the results
                return await this.PrepareReturnValue(false, entityObjects, objectValues, group);
            }
        } 
        catch (err) {
            LogError(err);
            throw new Error('TransactionResolver::ExecuteTransactionGroup --- Error\n\n' + err);
        }
    }

    protected async PrepareReturnValue(success: boolean, entityObjects: BaseEntity[], objectValues: any[], group: TransactionInputType): Promise<TransactionOutputType> {
        const jsonResults = [];
        for (let i = 0; i < group.Items.length; i++) {
            const item = group.Items[i];
            if (item.OperationType==='Delete') {
                jsonResults.push(JSON.stringify(objectValues[i]));
            }
            else {
                // create or update, return what is in the database
                jsonResults.push(await entityObjects[i].GetDataObjectJSON());
            }
        }

        return {
            Success: success,
            ErrorMessages: entityObjects.map(e => JSON.stringify(e.LatestResult)),
            ResultsJSON: jsonResults
        }
    }
 
}
 