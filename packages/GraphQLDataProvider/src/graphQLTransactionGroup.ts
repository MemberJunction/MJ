import { BaseEntity, BaseEntityResult, TransactionGroupBase, TransactionResult } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";
import { SafeJSONParse } from "@memberjunction/global";

export class GraphQLTransactionGroup extends TransactionGroupBase {
    private _provider: GraphQLDataProvider;
    constructor(provider: GraphQLDataProvider) {
        super();
        this._provider = provider;
    }

    // protected async HandleSubmit(): Promise<TransactionResult[]> {
    //     // iterate through each instruction and build up the combined query string
    //     // and the combined variables object
    //     let combinedQuery = '';
    //     let mutationParams = '';
    //     const combinedVars: any = {};

    //     for (let i = 0; i < this.PendingTransactions.length; i++) {
    //         const item = this.PendingTransactions[i];
    //         let itemMutation = item.Instruction;
    //         if (item.Vars) {
    //             const keys = Object.keys(item.Vars);
    //             // rename the variables to avoid collisions and aggregate the varisables
    //             // from the item into our combined variables
    //             for (let j = 0; j < keys.length; j++) {
    //                 const key = keys[j];
    //                 const newKey = `${key}_${i}`;
    //                 combinedVars[newKey] = item.Vars[key];

    //                 const keyRegEx = new RegExp('\\$' + key, 'g'); // Create the RegExp dynamically with the global flag.
    //                 itemMutation = itemMutation.replace(keyRegEx, '$' + newKey);
    //                 const mutationInputType = item.ExtraData.mutationInputTypes.find((t: any) => t.varName === key)?.inputType;
    //                 //{varName: pk.CodeName, inputType: pk.EntityFieldInfo.GraphQLType + '!'}
    //                 mutationParams += `$${newKey}: ${mutationInputType} \n`;
    //             }
    //         }
    //         // add in the specific mutation and give it an alias so we can easily figure out the results
    //         // from each of them and pass back properly
    //         combinedQuery += `mutation_${i}: ` + itemMutation + '\n';
    //     }

    //     combinedQuery = `mutation TransactionGroup(${mutationParams}){ \n` + combinedQuery+ '\n}'; // wrap it up in a mutation so we can execute it
    //     const execResults = await this._provider.ExecuteGQL(combinedQuery, combinedVars)
    //     const returnResults: TransactionResult[] = [];
    //     for (let i = 0; i < this.PendingTransactions.length; i++) {
    //         /// NEED TO TEST TO SEE WHAT ORDER WE GET RESULTS BACK AS
    //         const result = execResults[`mutation_${i}`];
    //         const item = this.PendingTransactions[i];
    //         returnResults.push(new TransactionResult(item, result, result !== null));
    //     }
    //     return returnResults;
    // }

    // new implementation
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        // Define the mutation
        const mutation = gql`
        mutation ExecuteTransactionGroup($group: TransactionInputType!) {
            ExecuteTransactionGroup(group: $group) {
                Success
                ErrorMessages
                ResultsJSON
            }
        }
        `;

        // Example variables for the mutation
        const items = [];
        for (const pt of this.PendingTransactions) {
            items.push({
                EntityName: pt.BaseEntity.EntityInfo.Name,
                EntityObjectJSON: await pt.BaseEntity.GetDataObjectJSON(),
                OperationType: pt.OperationType
            });
        }
        const vars = {
            group: {
                Items: items,
                Variables: this.Variables.map(v => {
                    return {
                        Name: v.Name,
                        ItemIndex: this.MapVariableEntityObjectToPosition(v),
                        FieldName: v.FieldName,
                        Type: v.Type
                    }
                }) 
            }
        };        

        const results = await this._provider.ExecuteGQL(mutation, vars)
        if (results && results.ExecuteTransactionGroup) {
            const data = results.ExecuteTransactionGroup;
            // The server's Success flag is authoritative. When the server-side transaction failed
            // (rolled back), PrepareReturnValue still serializes each entity's IN-MEMORY state into
            // ResultsJSON — so the old per-item "resultObject !== null" test reported success for
            // every item of a rolled-back transaction, TransactionGroupBase.Submit() returned true,
            // and each entity finalized itself against phantom (never-persisted) data. Gate every
            // per-item success on the transaction-level Success so a rollback surfaces as
            // Submit() === false with per-entity failure results (see TransactionGroupBase.Submit's
            // callback + notification flow).
            const transactionSucceeded = data.Success === true;
            const returnResults: TransactionResult[] = [];
            for (let i = 0; i < this.PendingTransactions.length; i++) {
                const resultJSON = data.ResultsJSON[i];
                const resultObject = SafeJSONParse(resultJSON);
                const item = this.PendingTransactions[i];
                if (!transactionSucceeded) {
                    this.recordServerFailure(item.BaseEntity, data.ErrorMessages?.[i]);
                }
                returnResults.push(new TransactionResult(item, resultObject, transactionSucceeded && resultObject !== null));
            }
            return returnResults;
        }
        else {
            throw new Error('Failed to execute transaction group');
        }
    }

    /**
     * Copies the server's own failure result for one item onto that item's entity, so the caller can
     * say WHICH row failed and why (#4309).
     *
     * The reason was always on the wire — `TransactionGroupResolver.PrepareReturnValue` maps
     * `ErrorMessages` from every entity's `LatestResult` — and this class discarded it, leaving
     * `TransactionGroupBase.Submit()`'s notification handler to record the generic
     * "Transaction group failed" instead. `TransactionResult`'s own docstring already directs
     * consumers to `BaseEntity.LatestResult`, so that is where this belongs rather than on a new
     * field nothing reads yet.
     *
     * Registering here rather than in the notification handler is what makes it stick:
     * `BaseEntity`'s handler only invents its generic result when NOTHING was added to the history
     * (`currentResultCount === this.ResultHistory.length`), and `HandleSubmit` runs first.
     *
     * The predicate is whether the server sent an actual REASON, not whether it sent `Success:
     * false` — every item of a failed group reports false. `DatabaseProviderBase` registers an
     * entity's result *before* enrolling the row and only flips it to true in the transaction
     * callback, so a row that enrolled and was then abandoned serializes as `Success: false` with
     * an EMPTY message. Keying on the flag would overwrite `BaseEntity`'s own "Transaction group
     * failed" with a blank one, making the report worse for every non-refused row. So this only
     * ever UPGRADES the message, and stays silent when it has nothing to add.
     */
    private recordServerFailure(entity: BaseEntity, errorMessageJSON: string | undefined): void {
        const serverResult = SafeJSONParse<Partial<BaseEntityResult>>(errorMessageJSON ?? '');
        if (!serverResult || serverResult.Success !== false) {
            return;
        }
        const message = serverResult.Message?.trim();
        if (!message && (serverResult.Errors?.length ?? 0) === 0) {
            return; // failed, but the server told us nothing this entity does not already know
        }
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = serverResult.Type ?? (entity.IsSaved ? 'update' : 'create');
        result.Message = message ?? null;
        result.Errors = serverResult.Errors ?? [];
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        entity.RegisterResultHistoryEntry(result);
    }
}
