(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "@memberjunction/core", "./graphQLDataProvider"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GraphQLTransactionGroup = void 0;
    const core_1 = require("@memberjunction/core");
    const graphQLDataProvider_1 = require("./graphQLDataProvider");
    class GraphQLTransactionGroup extends core_1.TransactionGroupBase {
        async HandleSubmit(items) {
            // iterate through each instruction and build up the combined query string 
            // and the combined variables object
            let combinedQuery = '';
            let mutationParams = '';
            const combinedVars = {};
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
                        mutationParams += `$${newKey}: ${item.ExtraData.mutationInputType} \n`;
                    }
                }
                // add in the specific mutation and give it an alias so we can easily figure out the results
                // from each of them and pass back properly
                combinedQuery += `mutation_${i}: ` + itemMutation + '\n';
            }
            combinedQuery = `mutation (${mutationParams}){ \n` + combinedQuery + '\n}'; // wrap it up in a mutation so we can execute it
            const execResults = await graphQLDataProvider_1.GraphQLDataProvider.ExecuteGQL(combinedQuery, combinedVars);
            const returnResults = [];
            for (let i = 0; i < items.length; i++) {
                /// NEED TO TEST TO SEE WHAT ORDER WE GET RESULTS BACK AS
                const result = execResults[`mutation_${i}`];
                const item = items[i];
                returnResults.push(new core_1.TransactionResult(item, result, result !== null));
            }
            return returnResults;
        }
    }
    exports.GraphQLTransactionGroup = GraphQLTransactionGroup;
});
//# sourceMappingURL=graphQLTransactionGroup.js.map