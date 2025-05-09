import { TransactionGroupBase, TransactionResult } from "@memberjunction/core";
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
            const returnResults: TransactionResult[] = [];
            for (let i = 0; i < this.PendingTransactions.length; i++) {
                const resultJSON = data.ResultsJSON[i];
                const resultObject = SafeJSONParse(resultJSON);
                const item = this.PendingTransactions[i];
                returnResults.push(new TransactionResult(item, resultObject, resultObject !== null));
            }
            return returnResults;
        }
        else {
            throw new Error('Failed to execute transaction group');
        }
    }
}