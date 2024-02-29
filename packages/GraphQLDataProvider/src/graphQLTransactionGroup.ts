import { TransactionGroupBase, TransactionItem, TransactionResult } from "@memberjunction/core"
import { GraphQLDataProvider } from "./graphQLDataProvider";

export class GraphQLTransactionGroup extends TransactionGroupBase {
    protected async HandleSubmit(items: TransactionItem[]): Promise<TransactionResult[]> {
        // iterate through each instruction and build up the combined query string 
        // and the combined variables object
        let combinedQuery = '';
        let mutationParams = '';
        const combinedVars: any = {};

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            let itemMutation = item.Instruction;
            if (item.Vars) {
                const keys = Object.keys(item.Vars);
                // rename the variables to avoid collisions and aggregate the varisables
                // from the item into our combined variables
                for (let j = 0; j < keys.length; j++) {
                    const key = keys[j];
                    const newKey = `${key}_${i}`;
                    combinedVars[newKey] = item.Vars[key];

                    const keyRegEx = new RegExp('\\$' + key, 'g'); // Create the RegExp dynamically with the global flag.
                    itemMutation = itemMutation.replace(keyRegEx, '$' + newKey);
                    const mutationInputType = item.ExtraData.mutationInputTypes.find((t: any) => t.varName === key)?.inputType;
                    //{varName: pk.CodeName, inputType: pk.EntityFieldInfo.GraphQLType + '!'}
                    mutationParams += `$${newKey}: ${mutationInputType} \n`;
                }
            }
            // add in the specific mutation and give it an alias so we can easily figure out the results
            // from each of them and pass back properly
            combinedQuery += `mutation_${i}: ` + itemMutation + '\n';
        }

        combinedQuery = `mutation TransactionGroup(${mutationParams}){ \n` + combinedQuery+ '\n}'; // wrap it up in a mutation so we can execute it
        const execResults = await GraphQLDataProvider.ExecuteGQL(combinedQuery, combinedVars)
        const returnResults: TransactionResult[] = [];
        for (let i = 0; i < items.length; i++) {
            /// NEED TO TEST TO SEE WHAT ORDER WE GET RESULTS BACK AS
            const result = execResults[`mutation_${i}`];
            const item = items[i];
            returnResults.push(new TransactionResult(item, result, result !== null));
        }
        return returnResults;
    }
}