import { Subject } from "rxjs";
import { BaseEntity } from "./baseEntity";
import { LogError, LogStatus } from "./logging";

/**
 * Internal class used by TransactionGroupBase and sub-classes to manage individual transactions
 */
export class TransactionItem {
    private _instruction: string; // gql or sql or similar having the actual instructions to execute
    private _vars: any; // variables to pass to the gql or sql
    private _callBack: Function; // callback function to call when the transaction is complete
    private _extraData: any // any additional stuff that is needed for processing by the provider
    private _baseEntity: BaseEntity; // the base entity object that this transaction is associated with
    private _operationType: 'Create' | 'Update' | 'Delete';

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
    public get OperationType(): 'Create' | 'Update' | 'Delete' {
        return this._operationType; 
    }

    constructor (baseEntity: BaseEntity, operationType: 'Create' | 'Update' | 'Delete', instruction: string, vars: any, extraData: any, callBack: Function) {
        this._operationType = operationType;
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
 * This class is used to encapsulate the concept of a variable to be used within a transaction group. This is designed to allow for the flow
 * of data from one item in a transaction group to another. For example say you had a transaction group where you are creating a new record in 
 * EntityA and you wanted to get the newly created ID value from that record and then set it into a field called "EntityA_ID" in a record in EntityB.
 * You can do this by telling the TransactionGroup about these variables with the AddVariable() method in the TransactionGroupBase/sub-classes.
 */
export class TransactionVariable {
    private _name: string;
    private _entityObject: BaseEntity;
    private _fieldName: string;
    private _type: 'Define' | 'Use';
    private _processedValue: any;
    private _isProcessed: boolean = false;

    public get Name(): string {
        return this._name;
    }
    public get EntityObject(): BaseEntity {
        return this._entityObject;
    }
    public get FieldName(): string {
        return this._fieldName;
    }
    public get Type(): 'Define' | 'Use' {
        return this._type;
    }

    /**
     * Indicates if the variable has been processed. This is only true after the transaction group has been submitted and the results have been mapped back to the variables.
     */
    public get IsProcessed(): boolean {
        return this._isProcessed;
    }

    /**
     * Processed Value is only available after the related transaction item has been executed and the results have been mapped back to the variables that are related to that transaction item.
     */
    public get ProcessedValue(): any {
        return this._processedValue;
    }
    public set ProcessedValue(value: any) {
        this._processedValue = value;
        this._isProcessed = true;
    }

    constructor(name: string, entityObject: BaseEntity, fieldName: string, type: 'Define' | 'Use') {
        this._name = name;
        this._entityObject = entityObject;
        this._fieldName = fieldName;
        this._type = type;
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
    private _variables: TransactionVariable[] = [];
    private _status: 'Pending' | 'In Progress' | 'Complete' | 'Failed' = 'Pending';

    protected get PendingTransactions(): TransactionItem[] {
        return this._pendingTransactions;
    }

    public get Status(): 'Pending' | 'In Progress' | 'Complete' | 'Failed' {
        return this._status;
    }

    /**
     * The array of variables that are to be used within the transaction group. These are used to pass data from one transaction item to another. See documentation on @class TransactionVariable
     */
    public get Variables(): TransactionVariable[] {
        return this._variables;
    }

    /**
     * Adds a new variable to the transaction group.
     */
    public AddVariable(newVariable: TransactionVariable) {
        this._variables.push(newVariable);
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
     * This is used by the BaseEntity/Provider objects to manage transactions on your behalf. 
     * WARNING: Do NOT directly call this method. Instead set the TransactionGroup property on
     * the @BaseEntity class to make an entity object part of a transaction group.
     * @param transaction 
     */
    public AddTransaction(transaction: TransactionItem): void {
        this._pendingTransactions.push(transaction);
    }

    /**
     * Subclasses of the TransactionGroupBase class must implement this method to handle the actual transaction submission which is provider-specific.
     */
    protected abstract HandleSubmit(): Promise<TransactionResult[]>;

    /**
     * Helper method for sub-classes to map a variable to a position in the pending transactions array
     * @param variable 
     * @returns 
     */
    protected MapVariableEntityObjectToPosition(variable: TransactionVariable): number {
        return this._pendingTransactions.findIndex((t) => t.BaseEntity === variable.EntityObject);
    }

    /**
     * Submits the transaction group to the provider for handling. The provider will handle the actual transaction and call the callback functions
     * @returns true if the transaction was successful, false if it failed. If the method fails, check each of the individual BaseEntity objects within
     * the TransactionGroup for their result histories using BaseEntity.ResultHistory and BaseEntity.LatestResult
     * @param allowRetryOfFailedTransaction If true, the transaction group will be resubmitted even if it has failed. If false, the transaction group will not be resubmitted if it has failed.
     */
    public async Submit(allowRetryOfFailedTransaction: boolean = false): Promise<boolean> {
        if (this.Status === 'Complete') {
            throw new Error('TransactionGroup has already been completed');
        }
        else if (this.Status === 'In Progress') {
            throw new Error('TransactionGroup is already in progress');
        }
        else if (this.Status === 'Failed') {
            if (!allowRetryOfFailedTransaction) {
                throw new Error('TransactionGroup has failed and cannot be resubmitted unless allowRetryOfFailedTransaction is set to true');
            }
            else {
                // the caller has specifid that we can retry the transaction even if it has failed, log this and continue
                LogStatus('TransactionGroupBase.Submit', 'TransactionGroup is in a failed state, resubmitting');
            }
        }

        this._status = 'In Progress';
        try {
            // Wait for all preprocessing to be complete
            await this.waitForPreprocessing();

            if (this._pendingTransactions.length > 0) {
                // subclass handles the actual submit implementation whatever that does
                let results: TransactionResult[] = await this.HandleSubmit();

                // now we have the results back, so we can call the callback functions
                for (let i = 0; i < results.length; i++) {
                    await results[i].Transaction.CallBack(results[i].Result, results[i].Success);
                }

                // now, see if there are any false values for results[x].Success, if so, we have to return false
                const overallSuccess = results.every(r => r.Success);
                this.NotifyTransactionStatus(overallSuccess, results);

                this._status = overallSuccess ? 'Complete' : 'Failed';
                return overallSuccess;
            }
            else {
                // there are no transactions to submit, so we just return true and go back to pending since there were no transactions
                LogStatus('TransactionGroupBase.Submit', 'No transactions to submit, switching status back to Pending');
                this._status = 'Pending';
                return true;
            }
        }
        catch (err) {
            console.error(err);
            // it failed, so we have to call the callback functions with the error
            for (let i = 0; i < this._pendingTransactions.length; i++) {
                await this._pendingTransactions[i].CallBack(err, false);
            }

            this.NotifyTransactionStatus(false, undefined, err);
            this._status = 'Failed';
            return false;
        }
    }

    /**
     * This utility method is to be used by sub-classes to set the values of the variables on the BaseEntity objects before the transaction is executed for variables
     * that are defined as 'Use' type. This is used to pass values from one transaction item to another.
     * @param entityObject 
     */
    protected SetEntityValuesFromVariables(entityObject: BaseEntity) {
        const vars = this.Variables.filter(v => v.EntityObject === entityObject);
        // we have variables that we need to handle for this object. For any variables that have type of 'Use'
        // we need to set those values on the object before we execute the query
        for (const varItem of vars) {
            if (varItem.Type === 'Use') {
                // get the value from the variable that matches the NAME that has Type === 'Define'
                const defineVar = this.Variables.find(v => v.Name.trim().toLowerCase() === varItem.Name.trim().toLowerCase() && v.Type === 'Define');
                if (defineVar) {
                    if (defineVar.IsProcessed) {
                        // found the variable definition, now get the value from that BaseEntity from the variable's source field name
                        const value = defineVar.ProcessedValue;

                        // set the value on the BaseEntity for the current item
                        entityObject.Set(varItem.FieldName, value);
                    }
                    else {
                        // the definition of the variable was never processed, so we can't set the value, must throw an exception and blow up the transaction
                        throw new Error(`Variable ${varItem.Name} was never processed, can't continue with transaction`);
                    }
                }
                else {
                    // we can't set the value, must throw an exception and blow up the transaction
                    throw new Error(`Unable to find variable definition for variable ${varItem.Name}, can't continue with transaction`);
                }
            }
        }
    }

    /**
     * This utility method is to be used by sub-classes to set the values of the variables on the BaseEntity objects after the transaction is executed for variables
     */
    protected SetVariableValuesFromEntity(entityObject: BaseEntity, queryResults: any) {
        const vars = this.Variables.filter(v => v.EntityObject === entityObject);
        // we have variables that we need to handle for this object. For any variables that have type of 'Define'
        // we need to set those values on the variable object after we execute the query and have the results
        for (const varItem of vars) {
            if (varItem.Type === 'Define') {
                // get the value from the query results
                const value = queryResults[varItem.FieldName];

                // stash the value into the variable object
                varItem.ProcessedValue = value;
            }
        }
    }
}