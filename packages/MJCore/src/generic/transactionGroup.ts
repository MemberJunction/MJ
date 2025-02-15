import { Subject } from "rxjs";
import { BaseEntity } from "./baseEntity";
import { LogError } from "./logging";

/**
 * Internal class used by TransactionGroupBase and sub-classes to manage individual transactions
 */
export class TransactionItem {
    private _instruction: string; // gql or sql or similar having the actual instructions to execute
    private _vars: any; // variables to pass to the gql or sql
    private _callBack: Function; // callback function to call when the transaction is complete
    private _extraData: any // any additional stuff that is needed for processing by the provider
    private _baseEntity: BaseEntity; // the base entity object that this transaction is associated with

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
    public get BaseEntity(): BaseEntity {
        return this._baseEntity;
    }   

    constructor (baseEntity: BaseEntity, instruction: string, vars: any, extraData: any, callBack: Function) {
        this._baseEntity = baseEntity;
        this._instruction = instruction;
        this._vars = vars;
        this._extraData = extraData;
        this._callBack = callBack;
    }
}

/**
 * Tracks the individual transactions within a transaction group and their commit results
 */
export class TransactionResult {
    Transaction: TransactionItem;
    Result: any;
    /**
     * True if the transaction was successful, false if it failed. If it failed, check the TransactionItem's BaseEntity.ResultHistory and BaseEntity.LatestResult
     */
    Success: boolean;

    constructor(transaction: TransactionItem, result: any, success: boolean) {
        this.Transaction = transaction;
        this.Result = result;
        this.Success = success;
    }
}


/**
 * Used internally within the transaction group to manage the preprocessing of entities before a transaction is submitted
 */
export class TransactionPreprocessingItem {
    entity: BaseEntity;
    complete: boolean = false;
    completionPromise: Promise<void>;

    constructor(entity: BaseEntity, completionPromise: Promise<void>) {
        this.entity = entity;
        this.completionPromise = completionPromise;
    }
}

/**
 * TransactionGroup is a class that handles the bundling of multiple transactions into a single request. The provider handles
 * the implementation details. If a transaction group is provided to the baseEntity object before either Save() or Delete() is called
 * instead of just immediately executing its SQL or GQL, it provides the instructions to the TransactionGroup object instead.
 *
 * Then, whenever the TransactionGroup object instance has its Submit() method called, all of the requests will be bundled into a single
 * request and handled. For example in the case of the GraphQLDataProvider, we queue up all of the GQL statements for all of the 
 * mutations and send them across as a single GraphQL request. The GraphQL server handles the actual DB transaction stuff.
 * 
 * TransactionGroup will call a callback function, if provided, after the transaction has either completed succesfully or failed. 
 * If it is succesful, for Save() method calls, the latest data for that record will be provided back. 
 * For Delete() method calls, the callback will be called with no data.
 * 
 * This class is the base class for managing a group of transactions and submitting it to the provider so it can be handled as an ATOMic transaction
 */
export abstract class TransactionGroupBase {
    private _pendingTransactions: TransactionItem[] = [];

    protected PendingTransactions(): TransactionItem[] {
        return this._pendingTransactions;
    }

    // RxJS Subject to notify about transaction status
    private transactionNotifier = new Subject<{ success: boolean; results?: TransactionResult[]; error?: any }>();

    // Expose transaction notifications as an observable
    public get TransactionNotifications$() {
        return this.transactionNotifier.asObservable();
    }

    /**
     * Notifies observers about transaction success or failure
     * @param success Whether the transaction was successful
     * @param results The transaction results (if applicable)
     * @param error Any error that occurred (if applicable)
     */
    private NotifyTransactionStatus(success: boolean, results?: TransactionResult[], error?: any) {
        this.transactionNotifier.next({ success, results, error });
    }

    private _preprocessingItems: TransactionPreprocessingItem[] = [];
    /**
     * If an entity object needs to conduct any type of asynchronous preprocessing before a transaction is submitted, it must notify its transaction group
     * that it is doing so with this method. This causes the TransactionGroup to wait for all preprocessing to be completed before submitting the transaction.
     * This method checks to see if an the entity has already been registered for preprocessing and if so, does nothing.
     * @param entity 
     */
    public RegisterPreprocessing(entity: BaseEntity): void {
        const existingEntry = this._preprocessingItems.find((i) => i.entity === entity);
        if (!existingEntry) {
            const preprocessingPromise = new Promise<void>((resolve) => {
                entity.RegisterEventHandler((e) => {
                    if (e.type === 'transaction_ready' && e.baseEntity === entity) {
                        const found = this._preprocessingItems.find((i) => i.entity === entity);
                        if (found) {
                            found.complete = true;
                            resolve();
                        }
                    }
                });
            });
    
            const newItem = new TransactionPreprocessingItem(entity, preprocessingPromise);
            this._preprocessingItems.push(newItem);
        }
    }

    /**
     * Indicates whether all of the entities that have registered with this transaction group have completed their preprocessing
     * @returns 
     */
    public PreprocessingComplete(): boolean {
        if (this._preprocessingItems.length === 0)
            return true;
        else
            return this._preprocessingItems.every((i) => i.complete);
    }

    /**
     * Waits for all preprocessing to be complete.
     */
    protected async waitForPreprocessing(): Promise<void> {
        try {
            await Promise.all(this._preprocessingItems.map(item => item.completionPromise));
            this._preprocessingItems = []; // clear out the preprocessing items
        }
        catch (e) {
            LogError(`Error during preprocessing TransactionGroupBase. Error: ${e.message}`)
        }
    }

    /**
     * This is used by the BaseEntity/Provider objects to manage transactions on your behalf. Do not directly interact with this method. Instead use the TransactionGroup property on
     * the @BaseEntity class to make an entity object part of a transaction group.
     * @param transaction 
     */
    public AddTransaction(transaction: TransactionItem): void {
        this._pendingTransactions.push(transaction);
    }

    protected abstract HandleSubmit(item: TransactionItem[]): Promise<TransactionResult[]>;

    /**
     * Submits the transaction group to the provider for handling. The provider will handle the actual transaction and call the callback functions
     * @returns true if the transaction was successful, false if it failed. If the method fails, check each of the individual BaseEntity objects within
     * the TransactionGroup for their result histories using BaseEntity.ResultHistory and BaseEntity.LatestResult
     */
    public async Submit(): Promise<boolean> {
        try {
            // Wait for all preprocessing to be complete
            await this.waitForPreprocessing();

            if (this._pendingTransactions.length > 0) {
                // subclass handles the actual submit implementation whatever that does
                let results: TransactionResult[] = await this.HandleSubmit(this._pendingTransactions);

                // now we have the results back, so we can call the callback functions
                for (let i = 0; i < results.length; i++) {
                    await results[i].Transaction.CallBack(results[i].Result, results[i].Success);
                }

                // now, see if there are any false values for results[x].Success, if so, we have to return false
                const overallSuccess = results.every(r => r.Success);
                this.NotifyTransactionStatus(overallSuccess, results);

                return overallSuccess;
            }
            return true;
        }
        catch (err) {
            console.error(err);
            // it failed, so we have to call the callback functions with the error
            for (let i = 0; i < this._pendingTransactions.length; i++) {
                await this._pendingTransactions[i].CallBack(err, false);
            }

            this.NotifyTransactionStatus(false, undefined, err);
            
            return false;
        }
    }

}