import { Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, registerEnumType } from 'type-graphql';
import { AppContext } from '../types.js';
import { CompositeKey, IMetadataProvider, KeyValuePair, LogError, Metadata, TransactionVariable, BaseEntity, EntityDeleteOptions, EntitySaveOptions } from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import { GetReadWriteProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';

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



/**
 * Renders one refused transaction-group item for the server log, naming the position, entity and
 * operation so an operator can tie the refusal back to the row the client sent.
 *
 * `CompleteMessage` rather than `Message` because a refusal can report itself through any of
 * `Message`, `Error` or the `Errors` array — a validation failure populates only the last of the
 * three, so reading `Message` alone logs an empty reason for exactly the case that matters most.
 */
function describeRefusedItem(index: number, item: TransactionItemInputType, entity: BaseEntity): string {
    const reason = entity.LatestResult?.CompleteMessage?.trim();
    return `  [${index}] ${item.OperationType} '${item.EntityName}': ${reason || 'refused without a reported reason'}`;
}

export class TransactionResolver extends ResolverBase {
    /**
     * Maps a TransactionGroup item's operation type onto the SAME API-key scope path the singular
     * CRUD mutations enforce (ResolverBase.CreateRecord/UpdateRecord/DeleteRecord), so the
     * transaction path cannot be used to sidestep a key's scope ceiling.
     */
    protected GetScopePathForOperation(operationType: TransactionOperationType): string {
        switch (operationType) {
            case TransactionOperationType.Create:
                return 'entity:create';
            case TransactionOperationType.Update:
                return 'entity:update';
            case TransactionOperationType.Delete:
                return 'entity:delete';
        }
    }

    @Mutation(() => TransactionOutputType)
    async ExecuteTransactionGroup(
    @Arg('group', () => TransactionInputType ) group: TransactionInputType,
    @Ctx() context: AppContext
    ) {
        // SECURITY (bug-register B1 / catalog SEC1): route every transaction item through the same
        // API-key scope gate the singular CRUD resolvers use, BEFORE any entity work happens.
        // Without this pre-pass, a restricted API key (e.g. view:run-only) could Create/Update/
        // Delete over the wire by wrapping the mutation in a TransactionGroup — the scope ceiling
        // was simply never consulted on this path. No-op for OAuth/JWT sessions (no apiKeyHash),
        // and full_access keys short-circuit inside CheckAPIKeyScopeAuthorization, so legitimate
        // callers are unaffected; only keys that would already be denied on the singular CRUD
        // mutations are now equally denied here. Deliberately OUTSIDE the try below so the
        // AuthorizationError propagates to the client unwrapped.
        for (const item of group.Items) {
            await this.CheckAPIKeyScopeAuthorization(
                this.GetScopePathForOperation(item.OperationType),
                item.EntityName,
                context.userPayload
            );
        }

        try {
            // we have received the transaction group information via the network, now we need to reconstruct our TransactionGroup object and run it
            const md = (GetReadWriteProvider(context.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider) ?? new Metadata();
            const tg = await md.CreateTransactionGroup();
            const entityObjects: BaseEntity[] = [];
            const objectValues: any[] = [];
            // #4309: Save()/Delete() report a LOGICAL refusal by returning false — they do not throw —
            // and a refused row is never enrolled, because TransactionGroup.AddTransaction() is reached
            // only from inside ProviderToUse.Save()/Delete(). Discarding that boolean let a group whose
            // rows were all refused arrive at Submit() empty, take its legitimate "nothing to do"
            // branch, and report success for writes that never happened.
            const refusals: string[] = [];

            for (const [index, item] of group.Items.entries()) {
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
                        if (!await entity.Save()) {
                            refusals.push(describeRefusedItem(index, item, entity));
                        }
                        break;
                    case "Delete":
                        await entity.InnerLoad(pkey);
                        objectValues.push(entity.GetDataObject());
                        entity.TransactionGroup = tg;
                        if (!await entity.Delete()) {
                            refusals.push(describeRefusedItem(index, item, entity));
                        }
                        break;
                }
            }

            // A refused row never enrolled, so submitting now would commit only the SURVIVORS and
            // still report unqualified success. Nothing has been written at this point — enrolment
            // is deferral, and the provider does not touch the database until Submit() — so
            // returning here leaves the database exactly as we found it.
            //
            // The predicate is the RETURN VALUE, not whether the group ended up empty: a row that
            // is not dirty also fails to enrol and correctly returns true, and an empty group
            // legitimately means "nothing to do" for a caller that enrolled nothing. That is also
            // why this belongs here rather than in TransactionGroupBase.Submit() — this is the only
            // layer that still knows which row was refused and why.
            if (refusals.length > 0) {
                LogError(
                    `TransactionResolver::ExecuteTransactionGroup --- ${refusals.length} of ${group.Items.length} ` +
                    `item(s) were refused, so the group was not submitted:\n${refusals.join('\n')}`
                );
                return await this.PrepareReturnValue(false, entityObjects, objectValues, group);
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
 