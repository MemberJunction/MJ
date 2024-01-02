/* TransactionGroup is a class that handles the bundling of multiple transactions into a single request. The provider handles
   the implementation details. If a transaction group is provided to the baseEntity object before either Save() or Delete() is called
   instead of just immediately executing its SQL or GQL, it provides the instructions to the TransactionGroup object instead.

   Then, whenever the TransactionGroup object instance has its Submit() method called, all of the requests will be bundled into a single
   request and handled. For example in the case of the GraphQLDataProvider, we queue up all of the GQL statements for all of the 
   mutations and send them across as a single GraphQL request. The GraphQL server handles the actual DB transaction stuff.

   TransactionGroup will call a callback function, if provided, after the transaction has either completed succesfully or failed. 
   If it is succesful, for Save() method calls, the latest data for that record will be provided back. 
   For Delete() method calls, the callback will be called with no data.

*/

export class TransactionItem {
    private _instruction: string; // gql or sql or similar having the actual instructions to execute
    private _vars: any; // variables to pass to the gql or sql
    private _callBack: Function; // callback function to call when the transaction is complete
    private _extraData: any // any additional stuff that is needed for processing by the provider

    public get Vars(): any {
        return this._vars;
    }
    public get ExtraData(): any {
        return this._extraData;
    }
    public get Instruction(): string {
        return this._instruction;
    }
    public get CallBack(): Function {
        return this._callBack;
    }

    constructor (instruction: string, vars: any, extraData: any, callBack: Function) {
        this._instruction = instruction;
        this._vars = vars;
        this._extraData = extraData;
        this._callBack = callBack;
    }
}

export class TransactionResult {
    Transaction: TransactionItem;
    Result: any;
    Success: boolean;

    constructor(transaction: TransactionItem, result: any, success: boolean) {
        this.Transaction = transaction;
        this.Result = result;
        this.Success = success;
    }
}

export abstract class TransactionGroupBase {
    private _pendingTransactions: TransactionItem[] = [];

    protected PendingTransactions(): TransactionItem[] {
        return this._pendingTransactions;
    }

    public AddTransaction(transaction: TransactionItem): void {
        this._pendingTransactions.push(transaction);
    }

    protected abstract HandleSubmit(item: TransactionItem[]): Promise<TransactionResult[]>;

    public async Submit(): Promise<boolean> {
        try {
            if (this._pendingTransactions.length > 0) {
                // subclass handles the actual submit implementation whatever that does
                let results: TransactionResult[] = await this.HandleSubmit(this._pendingTransactions);

                // now we have the results back, so we can call the callback functions
                for (let i = 0; i < results.length; i++) {
                    await results[i].Transaction.CallBack(results[i].Result, results[i].Success);
                }
            }
            return true;
        }
        catch (err) {
            console.error(err);
            // it failed, so we have to call the callback functions with the error
            for (let i = 0; i < this._pendingTransactions.length; i++) {
                await this._pendingTransactions[i].CallBack(err, false);
            }
            return false;
        }
    }

}