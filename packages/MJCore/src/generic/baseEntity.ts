import { MJEventType, MJGlobal } from '@memberjunction/global';
import { EntityFieldInfo, EntityInfo, EntityFieldTSType, EntityPermissionType, RecordChange, ValidationErrorInfo, ValidationResult, EntityRelationshipInfo } from './entityInfo';
import { EntityDeleteOptions, EntitySaveOptions, IEntityDataProvider } from './interfaces';
import { Metadata } from './metadata';
import { RunView } from '../views/runView';
import { UserInfo } from './securityInfo';
import { TransactionGroupBase } from './transactionGroup';
import { LogDebug, LogError, LogStatus } from './logging';
import { CompositeKey, FieldValueCollection } from './compositeKey';
import { finalize, firstValueFrom, from, Observable, of, shareReplay, Subject, Subscription, switchMap } from 'rxjs';
import { z } from 'zod';

/**
 * Represents a field in an instance of the BaseEntity class. This class is used to store the value of the field, dirty state, as well as other run-time information about the field. The class encapsulates the underlying field metadata and exposes some of the more commonly
 * used properties from the entity field metadata.
 */
export class EntityField {
    private _entityFieldInfo: EntityFieldInfo;
    private _OldValue: any;
    private _Value: any;
    private _NeverSet: boolean = true;

    get Name(): string {
        return this._entityFieldInfo.Name;
    }

    get FieldType(): EntityFieldTSType {
        return this._entityFieldInfo.TSType
    }

    get SQLType(): string {
        return this._entityFieldInfo.Type;
    }

    get IsPrimaryKey(): boolean {
        return this._entityFieldInfo.IsPrimaryKey;
    }

    get NeedsQuotes(): boolean {
        return this._entityFieldInfo.NeedsQuotes;
    }

    /**
     * Removes spaces from the field name and returns the result.
     */
    get CodeName(): string {
        return this._entityFieldInfo.CodeName;
    }

    get IsUnique(): boolean {
        return this._entityFieldInfo.IsUnique;
    }

    /**
     * Returns the current value of the field.
     */
    get Value(): any {
        return this._Value;
    }

    get ReadOnly(): boolean {
        return this._entityFieldInfo.ReadOnly;
    }

    get EntityFieldInfo(): EntityFieldInfo {
        return this._entityFieldInfo;
    }

    /**
     * Returns true if the field is a uniqueidentifier in the database.
     */
    get IsUniqueIdentifier(): boolean {
        return this._entityFieldInfo.IsUniqueIdentifier;
    }

    /**
     * Returns true if the field has a default value set
     */
    get HasDefaultValue(): boolean {
        return this._entityFieldInfo.HasDefaultValue;
    }

    /**
     * Sets the value of the field. If the field is read only, nothing happens. If the field is not read only, the value is set and the internal representation of the dirty flag is flipped if the value is different from the old value.
     */
    set Value(value: any) {
        if (
              !this.ReadOnly ||
              this._NeverSet  /* Allow one time set of any field because BaseEntity Object passes in ReadOnly fields when we load,
                                 after that load for a given INSTANCE of an EntityField object we never set a ReadOnly Field*/
            ) {
            this._Value = value;

            // in the below, we set the OldValue, but only if (a) we have never set the value before, or (b) the value or the old value is not null - which means that we are in a record setup scenario
            if (this._NeverSet &&
                (value !== null || this._OldValue !== null)) {
                // initial value set
                this._OldValue = value;
            }

            this._NeverSet = false;
        }
    }

    /**
     * Returns true if the field is dirty, false otherwise. A field is considered dirty if the value is different from the old value. If the field is read only, it is never dirty.
     */
    get Dirty(): boolean {
        if (this.ReadOnly)
            return false
        else {
            const oldNull = this._OldValue === null || this.OldValue === undefined || Number.isNaN(this.OldValue); // check for NaN because sometimes we have old values that are NaN and we need to account for that
            const curNull = this.Value === null || this.Value === undefined || Number.isNaN(this.OldValue);
            if (oldNull && curNull)
                return false; // BOTH are null or undefined, not dirty
            else {
                let oldCompare = this._OldValue;
                let newCompare = this.Value;

                if (this._OldValue instanceof Date) {
                    // sometimes we have old values that are date objects, convert to UTC timestamp for comparison
                    oldCompare = this._OldValue.getTime();
                }
                if (this.Value instanceof Date) {
                    // and sometimes the new values are date objects, convert to UTC timestamp for comparison
                    newCompare = this.Value.getTime();
                }

                return oldCompare !== newCompare;
            }
        }
    }

    /**
     * Convenience method to format the value of the field. This method calls the static method on EntityFieldInfo to do the actual formatting.
     * @param decimals
     * @param currency
     * @returns
     */
    public FormatValue(decimals: number = 2, currency: string = 'USD') {
        return this.EntityFieldInfo.FormatValue(this.Value, decimals, currency);
    }

    /**
     * Validates the current value of the field. If the field is read only, or if the field is marked to skip validation, nothing happens.
     * If the field is not read only, and the field is not marked to skip validation, the value is checked against the validation rules defined in the metadata for the field.
     * @returns
     */
    public Validate(): ValidationResult {
        const ef = this._entityFieldInfo;
        const result = new ValidationResult();
        result.Success = true; // assume success
        if (!ef.ReadOnly && !ef.SkipValidation) {
            // only do validation on updatable fields and skip the special case fields defined inside the SkipValidation property (like ID/CreatedAt/UpdatedAt)
            if (!ef.AllowsNull && (this.Value === null || this.Value === undefined)) {
                // make sure this isn't a field that has a default value and we are inside a new record
                if (ef.DefaultValue === null || ef.DefaultValue === undefined || ef.DefaultValue.trim().length === 0) {
                    // we have no default value, so this is an error
                    result.Success = false;
                    result.Errors.push(new ValidationErrorInfo(ef.Name, `${ef.DisplayNameOrName} cannot be null`, null));
                }
                else {
                    // we do have a default value, but our current value is null. If we are in an EXISTING record, this is an error, check the OldValue to determine this
                    if (this._OldValue !== null && this._OldValue !== undefined) {
                        result.Success = false;
                        result.Errors.push(new ValidationErrorInfo(ef.Name, `${ef.DisplayNameOrName} cannot be null`, null));
                    }
                }
            }
            if (ef.TSType == EntityFieldTSType.String && ef.MaxLength > 0 && this.Value && this.Value.length > ef.MaxLength) {
                result.Success = false;
                result.Errors.push(new ValidationErrorInfo(ef.Name, `${ef.DisplayNameOrName} cannot be longer than ${ef.MaxLength} characters. Current value is ${this.Value.length} characters`, this.Value));
            }
            if (ef.TSType == EntityFieldTSType.Date && (this.Value !== null && this.Value !== undefined && !(this.Value instanceof Date)) ) {
                // invalid non-null date, but that is okay if we are a new record and we have a default value
                result.Success = false;
                result.Errors.push(new ValidationErrorInfo(ef.Name, `${this.Value} is not a valid date for ${ef.DisplayNameOrName}`, this.Value));
            }
        }

        return result;
    }


    constructor(fieldInfo: EntityFieldInfo, Value?: any) {
        this._entityFieldInfo = fieldInfo;
        if (Value) {
            this.Value = Value;
        }
        else if (fieldInfo.DefaultValue) {
            if (fieldInfo.TSType === EntityFieldTSType.Boolean) {
                // special handling for booleans as we don't want a string passed into a boolean field, we want a true boolean
                if (typeof fieldInfo.DefaultValue === "string" && fieldInfo.DefaultValue.trim() === "1" || fieldInfo.DefaultValue.trim().toLowerCase() === "true")
                    this.Value = true;
                else
                    this.Value = false;
            }
            else if (fieldInfo.TSType === EntityFieldTSType.Number) {
                // special handling for numbers as we don't want a string passed into a value for a numeric field
                if (!isNaN(Number(fieldInfo.DefaultValue))) {
                    this.Value = Number(fieldInfo.DefaultValue);
                }
                else if (fieldInfo.DefaultValue.trim().toLowerCase() === "null") {
                    this.Value = null;
                }
            }
            else if (fieldInfo.Type.trim().toLowerCase() === "uniqueidentifier") {
                // special handling for GUIDs, we don't want to populate anything here because the server always sets the value, leave blank
                this.Value = null;
            }
            else if (fieldInfo.TSType === EntityFieldTSType.Date) {
                if (fieldInfo.DefaultValue.trim().length > 0) {
                    // special handling for dates as we don't want to use getdate() type defaults as is, we want to convert them to a JS Date object
                    try {
                        // attempt to convert the default value to a date
                        const temp = new Date(fieldInfo.DefaultValue);
                        // if we get here, that means it worked, but we could have an invalid date, so check for that
                        if (isNaN(temp.getTime())) {
                            // this is an invalid date, so throw an error
                            throw new Error(); // blank error because we just end up going to the catch block anyway and in there we have logic to handle this properly
                        }
                        else
                            this.Value = temp;
                    }
                    catch (e) {
                        // if we get here, that means the default value is not a valid date, so we need to check to see if the date is a getdate() or getutcdate() type default
                        // use includes() below because it is possible that the value is wrapped in parenthesis, like (getdate()) and that is still valid.
                        if (fieldInfo.DefaultValue.trim().toLowerCase().includes("getdate()") || fieldInfo.DefaultValue.trim().toLowerCase().includes("getutcdate()")) {
                            // we have a getdate() or getutcdate() type default, leave the field alone if its a special date field as the server (i.e. database) will handle
                            //setting the value, otherwise set the value to the current date
                            if(fieldInfo.IsSpecialDateField){
                                this.Value = null;
                            }
                            else {
                                this.Value = new Date();
                            }
                        }
                        else {
                            // we have a default value that is not a valid date and not a getdate() type default, so we need to throw an error
                            throw new Error(`Invalid default value for ${fieldInfo.Entity}.${fieldInfo.Name} of ${fieldInfo.DefaultValue}. Default values for date fields must be a valid date or a getdate() type default`);
                        }
                    }
                }
            }
            else {
                // for strings we're good to just set the value
                this.Value = fieldInfo.DefaultValue;
            }
            this._NeverSet = true; // set this back to true because we are setting the default value and we want to be able to set this ONCE from BaseEntity when we load
        }
        else {
            this.Value = null; // we need to set the value to null instead of being undefined as the value is defined, it is NULL
            this._NeverSet = true; // set this back to true because we are setting the value to null;
        }
    }

    /**
     * This method will set the internal Old Value which is used to track dirty state, to the current value of the field. This effectively resets the dirty state of the field to false. Use this method sparingly.
     */
    public ResetOldValue() {
        this._OldValue = this.Value;
    }

    /**
     * Returns the old value of the field. This is the value that was set when the field was last loaded from the database.
     */
    public get OldValue(): any {
        return this._OldValue;
    }
}

export class DataObjectRelatedEntityParam {
    relatedEntityName: string
    filter?: string
    maxRecords?: number
}

export class DataObjectParams {
    oldValues: boolean;
    omitNullValues: boolean;
    omitEmptyStrings: boolean;
    excludeFields: string[];
    includeRelatedEntityData: boolean;
    relatedEntityList: DataObjectRelatedEntityParam[];

    constructor(
        oldValues: boolean = false,
        omitNullValues: boolean = false,
        omitEmptyStrings: boolean = false,
        excludeFields: string[] = [],
        includeRelatedEntityData: boolean = false,
        relatedEntityList: DataObjectRelatedEntityParam[] = []
    ) {
        this.oldValues = oldValues;
        this.omitNullValues = omitNullValues;
        this.omitEmptyStrings = omitEmptyStrings;
        this.excludeFields = excludeFields;
        this.includeRelatedEntityData = includeRelatedEntityData;
        this.relatedEntityList = relatedEntityList;
    }
}

export class BaseEntityAIActionParams {
    name: string
    actionId: string
    modelId: string
    systemPrompt: string
    userMessage: string
    result: any
}

/**
 * Used for storing the result of a Save or Delete or other transactional operation within a BaseEntity
 */
export class BaseEntityResult {
    /**
     * True if successful, false otherwise
     */
    Success: boolean;
    /**
     * The type of operation that was performed
     */
    Type: 'create' | 'update' | 'delete';
    /**
     * A message for an end user
     */
    Message: string;
    /**
     * Optional, a structured error object with additional information
     */
    Error?: any;

    /**
     * Optional, a list of structured error objects with additional information
     */
    Errors?: any[];
    /**
     * A copy of the values of the entity object BEFORE the operation was performed
     */
    OriginalValues: {FieldName: string, Value: any}[] = [];
    /**
     * A copy of the values of the entity object AFTER the operation was performed
     */
    NewValues: {FieldName: string, Value: any}[] = [];

    /**
     * Timestamp when the operation started
     */
    StartedAt: Date;
    /**
     * Timestamp when the operation ended
     */
    EndedAt: Date;

    constructor(success?: boolean, message?: string, type? : 'create' | 'update' | 'delete') {
        this.Success = success === undefined ? false : success;
        this.Type = type === undefined ? 'create' : type;
        this.Message = message === undefined ? '' : message;
        this.Error = null;
        this.Errors = [];
        this.StartedAt = new Date();
        this.EndedAt = new Date();
    }
}

/**
 * Event type that is used to raise events and provided structured callbacks for any caller that is interested in registering for events.
 * This type is also used for whenever a BaseEntity instance raises an event with MJGlobal.
 */
export class BaseEntityEvent {
    /**
     * The type of event that is being raised. transaction_ready is used to indicate that a transaction is ready to be submitted for execution. The TransactionGroup class uses this to know that all async preprocessing is done and it can now submit the transaction.
     */
    type: 'new_record' | 'save' | 'delete' | 'transaction_ready' | 'other';

    /**
     * If type === 'save' this property can either be 'create' or 'update' to indicate the type of save operation that was performed.
     */
    saveSubType?: 'create' | 'update';

    /**
     * Any payload that is associated with the event. This can be any type of object and is used to pass additional information about the event.
     */
    payload: any;

    /**
     * The BaseEntity object that is raising the event.
     */
    baseEntity: BaseEntity;
}

/**
 * Base class used for all entity objects. This class is abstract and is sub-classes for each particular entity using the CodeGen tool. This class provides the basic functionality for loading, saving, and validating entity objects.
 */
export abstract class BaseEntity<T = unknown> {
    private _EntityInfo: EntityInfo;
    private _Fields: EntityField[] = [];
    private _recordLoaded: boolean = false;
    private _contextCurrentUser: UserInfo = null;
    private _transactionGroup: TransactionGroupBase = null;
    private _eventSubject: Subject<BaseEntityEvent>;
    private _resultHistory: BaseEntityResult[] = [];
    private _provider: IEntityDataProvider | null = null;

    constructor(Entity: EntityInfo, Provider: IEntityDataProvider | null = null) {
        this._eventSubject = new Subject<BaseEntityEvent>();
        this._EntityInfo = Entity;
        this._provider = Provider;
        this.init();
    }

    /**
     * Returns this provider to be used for a given instance of a BaseEntity derived subclass. If the provider is not set, the BaseEntity.Provider is returned.
     */
    public get ProviderToUse(): IEntityDataProvider {
        return this._provider || BaseEntity.Provider;
    }

    /**
     * This method can be used to register a callback for events that will be raised by the instance of the BaseEntity object. The callback will be called with a 
     * BaseEntityEvent object that contains the type of event and any payload that is associated with the event. Subclasses of the BaseEntity can define their 
     * own event types and payloads as needed.
     * @param callback
     * @returns
     */
    public RegisterEventHandler(callback: (event: BaseEntityEvent) => void): Subscription {
        return this._eventSubject.asObservable().subscribe(callback);
    }

    /**
     * If the entity object has a TransactionGroup associated with it, the TransactionGroup will be notified that we are doing some transaction pre-processing so that the TransactionGroup can
     * properly wait for those pre-processing steps to complete before submitting the transaction. This method should generally NOT be called by anyone other than a provider that is handling
     * the tier-specific processing for the entity object.
     */
    public RegisterTransactionPreprocessing() {
        if (this.TransactionGroup) {
            this.TransactionGroup.RegisterPreprocessing(this);
        }
    }

    /**
     * Raises the transaction_ready event. This is used to indicate that the entity object is ready to be submitted for transaction processing. This is used by the TransactionGroup class to know when all async preprocessing is
     * done and it can submit the transaction. This is an internal method and shouldn't be used by sub-classes or external callers in most cases. It is primarily used by Provider classes who are handling the tier-specific processing
     * for the entity object.
     */
    public RaiseReadyForTransaction() {
        this.RaiseEvent('transaction_ready', null);
    }


    private static _baseEventCode = 'BaseEntityEvent';
    /**
     * When a BaseEntity class raises an event with MJGlobal, the eventCode property is set to this value. This is used to identify events that are raised by BaseEntity objects.
     * Any MJGlobal event that is raised by a BaseEntity class will use a BaseEntityEvent type as the args parameter
     */
    public static get BaseEventCode(): string {
        return BaseEntity._baseEventCode;
    }

    /**
     * Used for raising events within the BaseEntity and can be used by sub-classes to raise events that are specific to the entity.
     */
    protected RaiseEvent(type: BaseEntityEvent["type"], payload: any, saveSubType: BaseEntityEvent["saveSubType"] = undefined) {
        // this is the local event handler that is specific to THIS instance of the entity object
        LogDebug(`BaseEntity.RaiseEvent() - ${type === 'save' ? 'save:' + saveSubType : type} event raised for ${this.EntityInfo.Name}, about to call this._eventSubject.next()`);
        this._eventSubject.next({type: type, payload: payload, saveSubType: saveSubType, baseEntity: this});

        // this next call is to MJGlobal to let everyone who cares knows that we had an event on an entity object
        // at the moment we only broadcast save/delete not the others
        if (type === 'save' || type === 'delete') {
            const event = new BaseEntityEvent();
            event.baseEntity = this;
            event.payload = payload;
            event.type = type;
            event.saveSubType = saveSubType;

            LogDebug(`BaseEntity.RaiseEvent() - ${type === 'save' ? 'save:' + saveSubType : type} event raised for ${this.EntityInfo.Name}, about to call MJGlobal.RaiseEvent()`);
            MJGlobal.Instance.RaiseEvent({
                component: this,
                event: MJEventType.ComponentEvent,
                eventCode: BaseEntity.BaseEventCode,
                args: event
            });
        }
    }

    /**
     * This method MUST be called right after the class is instantiated to provide an async/await pair for any asynchronous operations a given entity needs to do when it is first
     * created/configured. When you call Metadata/Provider GetEntityObject() this is done automatically for you. In nearly all cases you should go through GetEntityObject() anyway
     * and not ever directly instantiate a BaseEntity derived class.
     */
    public async Config(contextUser: UserInfo) {
        this.ContextCurrentUser = contextUser;
    }

    /**
     * Returns true if the record has been saved to the database, false otherwise. This is a useful property to check to determine if the record is a "New Record" or an existing one.
     */
    get IsSaved(): boolean {
        return this.PrimaryKey.HasValue;
    }

    /**
     * Transaction Groups are used to group multiple transactions into a single ATOMic transaction in a database. They are also useful even in situations with ATOMicity is less important but you want
     * to submit a group of changes to the API server in a single network call.
     */
    get TransactionGroup(): TransactionGroupBase {
        return this._transactionGroup;
    }

    set TransactionGroup(group: TransactionGroupBase) {
        this._transactionGroup = group;
    }

    /**
     * The result history shows the history of the attempted transactions (Save and Delete) for this particular entity object. This is useful for tracking the results of operations on the entity object.
     */
    public get ResultHistory(): BaseEntityResult[] {
        return this._resultHistory;
    }

    /**
     * Returns the most recent result from the result history. If there are no results in the history, this method will return null.
     */
    public get LatestResult(): BaseEntityResult {
        if (this._resultHistory.length > 0)
            return this._resultHistory[this._resultHistory.length - 1];
        else
            return null;
    }


    /**
     * Access to the underlying metadata for the entity object.
     */
    get EntityInfo(): EntityInfo {
        return this._EntityInfo;
    }

    get Fields(): EntityField[] {
        return this._Fields;
    }

    /**
     * Convenience method to access a field by name. This method is case-insensitive and will return null if the field is not found. You can do the same thing with more fine tune controlled by accessing the Fields property directly.
     * @param fieldName
     * @returns
     */
    public GetFieldByName(fieldName: string): EntityField | null {
        if(!fieldName) {
            return null;
        }

        const lcase = fieldName.trim().toLowerCase(); // do this once as we will use it multiple times
        return this.Fields.find(f => f.Name.trim().toLowerCase() === lcase);
    }

    /**
     * Returns true if the object is Dirty, meaning something has changed since it was last saved to the database, and false otherwise. For new records, this will always return true.
     */
    get Dirty(): boolean {
        return !this.IsSaved || this.Fields.some(f => f.Dirty);
    }

    /**
     * Returns an array of all primary key fields for the entity. If the entity has a composite primary key, this method will return an array of all primary key fields.
     * If the entity has a single primary key, this method will return an array with a single field in it.
     */
    get PrimaryKeys(): EntityField[] {
        return this.EntityInfo.PrimaryKeys.map(pk => this.GetFieldByName(pk.Name));
    }

    private _compositeKey: CompositeKey = null;
    /**
     * Returns the primary key for the record. The CompositeKey class is a multi-valued key that can have any number of key/value pairs within it. Always traverse the full
     * set of key/value pairs to get the full primary key for the record.
     */
    get PrimaryKey (): CompositeKey {
        if (this._compositeKey === null) {
            this._compositeKey = new CompositeKey();
            this._compositeKey.LoadFromEntityFields(this.PrimaryKeys);
        }
        return this._compositeKey;
    }

    /**
     * Helper method to return just the first Primary Key
     */
    get FirstPrimaryKey(): EntityField {
        return this.PrimaryKeys[0];
    }

    /**
     * Returns true if the record has been loaded from the database, false otherwise. This is useful to check to see if the record is in a "New Record" state or not.
     */
    get RecordLoaded(): boolean {
        return this._recordLoaded;
    }

    /**
     * Sets the value of a given field. If the field doesn't exist, nothing happens.
     * @param FieldName
     * @param Value
     */
    public Set(FieldName: string, Value: any) {
        const field = this.GetFieldByName(FieldName);
        if (field != null) {
            if (field.EntityFieldInfo.TSType === EntityFieldTSType.Date && (typeof Value === 'string' || typeof Value === 'number') ) {
                field.Value = new Date(Value);
            }
            else {
                field.Value = Value;
            }
        }
    }

    /**
     * Returns the value of the field with the given name. If the field is a date, and the value is a string, it will be converted to a date object.
     * @param FieldName
     * @returns
     */
    public Get(FieldName: string): any {
        const field = this.GetFieldByName(FieldName);
        if (field != null) {
            // if the field is a date and the value is a string, convert it to a date
            if (field.EntityFieldInfo.TSType === EntityFieldTSType.Date && (typeof field.Value === 'string' || typeof field.Value === 'number') ) {
                field.Value = new Date(field.Value);
            }
            return field.Value;
        }
        return null;
    }

    /**
     * NOTE: Do not call this method directly. Use the {@link From} method instead
     *
     * Sets any number of values on the entity object from the object passed in. The properties of the object being passed in must either match the field name (in most cases) or the CodeName (which is only different from field name if field name has spaces in it)
     * @param object
     * @param ignoreNonExistentFields - if set to true, fields that don't exist on the entity object will be ignored, if false, an error will be thrown if a field doesn't exist
     * @param replaceOldValues - if set to true, the old values of the fields will be reset to the values provided in the object parameter, if false, they will be left alone
     */
    public SetMany(object: any, ignoreNonExistentFields: boolean = false, replaceOldValues: boolean = false) {
        if (!object)
            throw new Error('calling BaseEntity.SetMany(), object cannot be null or undefined');

        for (let key in object) {
            const field = this.GetFieldByName(key);
            if (field) {
                // check to see if key matches a field name, if so, set it
                this.Set(key, object[key]);
                if (replaceOldValues) {
                    field.ResetOldValue();
                }
            }
            else {
                // if we don't find a match for the field name, check to see if we have a match for the code name
                // because some objects passed in will use the code name
                const field = this.Fields.find(f => f.CodeName.trim().toLowerCase() == key.trim().toLowerCase());
                if (field) {
                    this.Set(field.Name, object[key]);
                    if (replaceOldValues) {
                        field.ResetOldValue();
                    }
                }
                else {
                    // if we get here, we have a field that doesn't match either the field name or the code name, so throw an error
                    if (!ignoreNonExistentFields)
                        throw new Error(`Field ${key} does not exist on ${this.EntityInfo.Name}`);
                    else
                        console.warn(`Field ${key} does not exist on ${this.EntityInfo.Name}, ignoring because ignoreNonExistentFields was set to true`);
                }
            }
        }
    }

    /**
     * NOTE: Do not call this method directly. Use the {@link To} method instead
     *
     * Utility method to create an object and return it with properties in the newly created and returned object for each field in the entity object. This is useful for scenarios where you need to be able to persist the data
     * in a format to send to a network call, save to a file or database, etc. This method will return an object with properties that match the field names of the entity object.
     * @param oldValues When set to true, the old values of the fields will be returned instead of the current values.
     * @param onlyDirtyFields When set to true, only the fields that are dirty will be returned.
     * @returns
     */
    public GetAll(oldValues: boolean = false, onlyDirtyFields: boolean = false): any {
        let obj = {};
        for (let field of this.Fields) {
            if (!onlyDirtyFields || (onlyDirtyFields && field.Dirty)) {
                obj[field.Name] = oldValues ? field.OldValue : field.Value;
                if (field.EntityFieldInfo.TSType == EntityFieldTSType.Date && obj[field.Name] && !(obj[field.Name] instanceof Date)) {
                    obj[field.Name] = new Date(obj[field.Name]); // a timestamp, convert to JS Date Object
                }
            }
        }
        return obj;
    }

    /**
     * This utility method calls GetDataObject() internally and formats the result as a JSON string. If you want to get the data as an object instead of a string, call GetDataObject() directly.
     * @param params
     * @param minifyJSON
     * @returns
     */
    public async GetDataObjectJSON(params: DataObjectParams = null, minifyJSON: boolean = true): Promise<string> {
        const obj = await this.GetDataObject(params);
        if (minifyJSON)
            return JSON.stringify(obj);
        else
            return JSON.stringify(obj, null, 2);
    }

    /**
     * This utility method generates a completely new object that has properties that map to the fields and values in the entity at the time it is called. It is a copy, NOT a link, so any changes
     * made to the object after calling this method will NOT be reflected in the object that is returned. This is useful for things like sending data to a client, or for use in a view model.
     * @param params
     * @returns
     */
    public async GetDataObject(params: DataObjectParams = null): Promise<any> {
        if (!params)
            params = new DataObjectParams();
        
        // first, get the object from GetAll
        const obj = this.GetAll(params.oldValues);

        // next, check each value and if it is null or empty string, remove it if those options were set
        for (let key in obj) {
            const v = obj[key];
            if (params.omitNullValues && v === null)
                delete obj[key]; // null value, and caller didn't want null values
            else if (params.omitEmptyStrings && (v !== null && typeof v === 'string' && v.trim().length === 0))
                delete obj[key]; // blank string, and caller didn't want blank strings
            else if (params.excludeFields && params.excludeFields.indexOf(key) >= 0)
                delete obj[key]; // caller asked to not get this field
        }

        if (params.includeRelatedEntityData) {
            // now, get the related entity data
            for (let i = 0; i < this._EntityInfo.RelatedEntities.length; i++) {
                const re = this._EntityInfo.RelatedEntities[i];
                const pre = params.relatedEntityList ? params.relatedEntityList.find(r => r.relatedEntityName === re.RelatedEntity) : null;
                if (pre) {
                    // pre now has the param that matches the related entity (re) that we are looking at
                    // we are now here because either the caller didn't provide a list of entities to include
                    // (which means to include all of 'em), or they did and this entity is in the list
                    const reData = await this.GetRelatedEntityDataExt(re, pre.filter, pre.maxRecords);
                    if (reData) {
                        obj[re.RelatedEntity] = reData; // got some data (or an empty array) back, add it to the object
                        if (pre.maxRecords > 0) {
                            // add a note to the object to let the caller know that only the first X records are returned so
                            // that a caller can know that there could be more records available if they want them
                            let msg: string;
                            if (pre.maxRecords < reData.TotalRowCount)
                                msg = `Only the first ${pre.maxRecords} records are included in this response. There are ${reData.TotalRowCount} total records available.`;
                            else
                                msg = `All ${reData.TotalRowCount} records are included in this response.`;

                            obj[re.RelatedEntity].Note = msg; // add the message to the object as "Note"
                            obj[re.RelatedEntity].MaxRecordsFilter = pre.maxRecords; // add the max records to the object as "MaxRecords"
                        }
                    }
                }
            }
        }

        return obj;
    }

    public async GetRelatedEntityData(re: EntityRelationshipInfo, filter: string = null, maxRecords: number = null): Promise<any[]> {
        const ret = await this.GetRelatedEntityDataExt(re, filter, maxRecords);
        return ret?.Data;
    }

    public async GetRelatedEntityDataExt(re: EntityRelationshipInfo, filter: string = null, maxRecords: number = null): Promise<{Data: any[], TotalRowCount: number}> {
        // we need to query the database to get related entity info
        const params = EntityInfo.BuildRelationshipViewParams(this, re, filter, maxRecords)
        const rv = new RunView();
        const result = await rv.RunView(params, this._contextCurrentUser)
        if (result && result.Success) {
            return {
                Data: result.Results,
                TotalRowCount: result.TotalRowCount
            };
        }
        else
            return null;
    }

    private init() {
        this._compositeKey = null;
        this._resultHistory = [];
        this._recordLoaded = false;
        this._Fields = [];
        if (this.EntityInfo) {
            for (const rawField of this.EntityInfo.Fields) {
                const key = this.EntityInfo.Name + '.' + rawField.Name;
                // support for sub-classes of the EntityField class
                const newField = MJGlobal.Instance.ClassFactory.CreateInstance<EntityField>(EntityField, key, rawField);
                this.Fields.push(newField);
            }
        }
    }

    /**
     * This method will copy the values from the other entity object into the current one. This is useful for things like cloning a record.
     * This method will ONLY copy values for fields that exist in the current entity object. If the other object has fields that don't exist in the current object, they will be ignored.
     * @param other - the other entity object to copy values from
     * @param includePrimaryKeys - if true, the primary keys will be copied as well, if false, they will be ignored, defaults to false and generally you want to leave it that way
     * @param replaceOldValues - if true, the old values of the fields will be reset to the values provided in the other parameter, if false, they will be left alone, defaults to false and generally you want to leave it that way
     */
    public CopyFrom(other: BaseEntity, includePrimaryKeys: boolean = false, replaceOldValues: boolean = false): boolean {
        try {
            // iterate through all of OUR fields and set them to the value of the other object, if they exist in the other object
            for (let field of this.Fields) {
                if (!field.IsPrimaryKey || includePrimaryKeys) {
                    const otherField = other.GetFieldByName(field.Name);
                    if (otherField) {
                        this.Set(field.Name, otherField.Value);
                        if (replaceOldValues) {
                            field.ResetOldValue();
                        }
                    }
                }
            }
            return true;
        }
        catch (e) {
            LogError(`Error in BaseEntity.CopyFrom: ${e}`);
            return false;
        }
    }


    /**
     * The ContextCurrentUser is a property used to manually set the "current" user for scenarios, primarily on the server side, where the user changes per request. For situations where there is no global CurrentUser in the Metadata.Provider,
     * you MUST set this property to the user you want to use for the current operation. If you used Metadata.GetEntityObject() to get the entity object, this property will be set automatically for you as that method has a parameter that can
     * be provided for the ContextCurrentUser.
     */
    public set ContextCurrentUser(user: UserInfo) {
        this._contextCurrentUser = user;
    }
    public get ContextCurrentUser(): UserInfo {
        return this._contextCurrentUser;
    }


    /**
     * This method will create a new state for the object that is equivalent to a new record including default values.
     * @param newValues - optional parameter to set the values of the fields to something other than the default values. The expected parameter is an object that has properties that map to field names in this entity.
     * This is the same as creating a NewRecord and then using SetMany(), but it is a convenience/helper approach.
     * @returns
     */
    public NewRecord(newValues?: FieldValueCollection) : boolean {
        this.init();
        if (newValues) {
            newValues.KeyValuePairs.filter(kv => kv.Value !== null && kv.Value !== undefined).forEach(kv => {
                this.Set(kv.FieldName, kv.Value);
            });
        }
        this.RaiseEvent('new_record', null);
        return true;
    }



    // Holds the current pending save observable (if any)
    private _pendingSave$: Observable<boolean> | null = null;

    /**
     * Saves the current state of the object to the database. Uses the active provider to handle the actual saving of the record.
     * If the record is new, it will be created, if it already exists, it will be updated.
     * 
     * Debounces multiple calls so that if Save() is called again while a save is in progress,
     * the second call will simply receive the same result as the first.
     * 
     * @param options
     * @returns Promise<boolean>
     */
    public async Save(options?: EntitySaveOptions): Promise<boolean> {
        // If a save is already in progress, return its promise.
        if (this._pendingSave$) {
            return firstValueFrom(this._pendingSave$);
        }

        // Create a new observable that debounces duplicative calls, and executes the save.
        this._pendingSave$ = of(options).pipe(
            // Execute the actual save logic.
            switchMap(opts => from(this._InnerSave(opts))),
            // When the save completes (whether successfully or not), clear the pending save observable.
            finalize(() => { this._pendingSave$ = null; }),
            // Ensure that all subscribers get the same result.
            shareReplay(1)
        );

        return firstValueFrom(this._pendingSave$);
    }    
    
    /**
     * Private, internal method to handle saving the current state of the object to the database. This method is called by the public facing Save() method
     * and is debounced to prevent multiple calls from being executed simultaneously.
     * @param options
     * @returns
     */
    private async _InnerSave(options?: EntitySaveOptions) : Promise<boolean> {
        const currentResultCount = this.ResultHistory.length;
        const newResult = new BaseEntityResult();
        newResult.StartedAt = new Date();

        try {
            const _options: EntitySaveOptions = options ? options : new EntitySaveOptions();

            const type: EntityPermissionType = this.IsSaved ? EntityPermissionType.Update : EntityPermissionType.Create;
            const saveSubType = this.IsSaved ? 'update' : 'create';
            this.CheckPermissions(type, true) // this will throw an error and exit out if we don't have permission

            if (_options.IgnoreDirtyState || this.Dirty || _options.ReplayOnly) {
                if (!this.ProviderToUse) {    
                    throw new Error('No provider set');
                }
                else  {
                    let valResult = new ValidationResult();
                    if (_options.ReplayOnly) {
                        valResult.Success = true; // bypassing validation since we are in replay only....
                    }
                    else {
                        // First run synchronous validation
                        valResult = this.Validate();
                        
                        // If synchronous validation passes, check if we should run async validation
                        if (valResult.Success) {
                            // Determine if we should skip async validation:
                            // 1. Explicitly set in options, OR
                            // 2. Use the subclass's default if not specified in options
                            const skipAsyncValidation = _options.SkipAsyncValidation !== undefined ? 
                                _options.SkipAsyncValidation : this.DefaultSkipAsyncValidation;
                                
                            // If not skipping async validation, run it
                            if (!skipAsyncValidation) {
                                valResult = await this.ValidateAsync();
                            }
                        }
                    }
                    if (valResult.Success) {
                        const data = await this.ProviderToUse.Save(this, this.ActiveUser, _options)
                        if (!this.TransactionGroup) {
                            // no transaction group, so we have our results here
                            return this.finalizeSave(data, saveSubType);
                        }
                        else {
                            // we are part of a transaction group, so we return true and subscribe to the transaction groups' events and do the finalization work then
                            this.TransactionGroup.TransactionNotifications$.subscribe(({ success, results, error }) => {
                                if (success) {
                                    const transItem = results.find(r => r.Transaction.BaseEntity === this); 
                                    if (transItem) {
                                        this.finalizeSave(transItem.Result, saveSubType); // we get the resulting data from the transaction result, not data above as that will be blank when in a TG
                                    }
                                    else {
                                        // should never get here, but if we do, we need to throw an error
                                        throw new Error('Transaction group did not return a result for the entity object');
                                    }
                                }
                                else {
                                    throw error; // push this to the catch block below and that will add to the result history
                                }
                            });
                            return true;
                        }
                    }
                    else {
                        throw valResult; // pass this along to the caller
                    }
                }
            }
            else
                return true; // nothing to save since we're not dirty
        }
        catch (e) {
            if (currentResultCount === this.ResultHistory.length) {
                // this means that NO new results were added to the history anywhere
                // so we need to add a new result to the history here
                newResult.Success = false;
                newResult.Type = this.IsSaved ? 'update' : 'create';
                newResult.Message = e.message || null;
                newResult.Errors = e.Errors || [];
                newResult.OriginalValues = this.Fields.map(f => { return {FieldName: f.CodeName, Value: f.OldValue} });
                newResult.EndedAt = new Date();
                this.ResultHistory.push(newResult);
            }

            return false;
        }
    }

    private finalizeSave(data: any, saveSubType: BaseEntityEvent["saveSubType"]): boolean {
        if (data) {
            this.init(); // wipe out the current data to flush out the DIRTY flags, load the ID as part of this too
            this.SetMany(data, false, true); // set the new values from the data returned from the save, this will also reset the old values
            const result = this.LatestResult;
            if (result)
                result.NewValues = this.Fields.map(f => { return {FieldName: f.CodeName, Value: f.Value} }); // set the latest values here

            this.RaiseEvent('save', null, saveSubType);

            return true;
        }
        else {
            return false;
        }
    }

    /**
     * Internal helper method for the class and sub-classes - used to easily get the Active User which is either the ContextCurrentUser, if defined, or the Metadata.Provider.CurrentUser if not.
     */
    protected get ActiveUser(): UserInfo {
        return this.ContextCurrentUser || Metadata.Provider.CurrentUser; // use the context user ahead of the Provider.Current User - this is for SERVER side ops where the user changes per request
    }

    /**
     * Utility method that returns true if the given permission being checked is enabled for the current user, and false if not.
     * @param type
     * @param throwError
     * @returns
     */
    public CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        const u: UserInfo = this.ActiveUser;
        if (!u)
            throw new Error('No user set - either the context user for the entity object must be set, or the Metadata.Provider.CurrentUser must be set');

        // first check if the AllowCreateAPI/AllowUpdateAPI/AllowDeleteAPI settings are flipped on for the entity in question
        switch (type) {
            case EntityPermissionType.Create:
                if (!this.EntityInfo.AllowCreateAPI) {
                    if (throwError)
                        throw new Error(`Create API is disabled for ${this.EntityInfo.Name}`);
                    else
                        return false;
                }
                break;
            case EntityPermissionType.Update:
                if (!this.EntityInfo.AllowUpdateAPI) {
                    if (throwError)
                        throw new Error(`Update API is disabled for ${this.EntityInfo.Name}`);
                    else
                        return false;
                }
                break;
            case EntityPermissionType.Delete:
                if (!this.EntityInfo.AllowDeleteAPI) {
                    if (throwError)
                        throw new Error(`Delete API is disabled for ${this.EntityInfo.Name}`);
                    else
                        return false;
                }
                break;
            case EntityPermissionType.Read:
                if (!this.EntityInfo.IncludeInAPI) {
                    if (throwError)
                        throw new Error(`API is disabled for ${this.EntityInfo.Name}`);
                    else
                        return false;
                }
                break;
        }

        const permissions = this.EntityInfo.GetUserPermisions(u);
        let bAllowed: boolean = false;
        switch (type) {
            case EntityPermissionType.Create:
                bAllowed = permissions.CanCreate;
                break;
            case EntityPermissionType.Read:
                bAllowed = permissions.CanRead;
                break;
            case EntityPermissionType.Update:
                bAllowed = permissions.CanUpdate;
                break;
            case EntityPermissionType.Delete:
                bAllowed = permissions.CanDelete;
                break;
        }
        if (!bAllowed && throwError) {
            this.ThrowPermissionError(u, type, null);
        }
        else
            return bAllowed
    }

    protected ThrowPermissionError(u: UserInfo, type: EntityPermissionType, additionalInfoMessage: string) {
        throw new Error(`User: ${u.Name} (ID: ${u.ID}, Email: ${u.Email})
                         Does NOT have permission to ${EntityPermissionType[type]} ${this.EntityInfo.Name } records.
                         If you believe this is an error, please contact your system administrator.${additionalInfoMessage ? '\nAdditional Information: ' + additionalInfoMessage : ''}}`);
    }

    /**
     * This method will revert the internal state of the object back to what it was when it was last saved, or if never saved, from when it was intially loaded from the database. This is useful if you want to offer a user an "undo" type of feature in a UI.
     * @returns
     */
    public Revert(): boolean {
        if (this.Dirty) {
            for (let field of this.Fields) {
                field.Value = field.OldValue;
            }
        }
        return true;
    }

    /**
     * * This method loads a single record from the database. Make sure you first get the correct BaseEntity sub-class for your entity by calling Metadata.GetEntityObject() first. From there, you can
     * call this method to load your records.
     * * NOTE: You should not be calling this method directly from outside of a sub-class in most cases. You will use the auto-generated sub-classes that have overriden versions of this method that blow out the primary keys into individual parameters. This is much easier to program against.
     * @param CompositeKey Wrapper that holds an array of objects that contain the field name and value for the primary key of the record you want to load. For example, if you have a table called "Customers" with a primary key of "ID", you would pass in an array with a single object like this: {FieldName: "ID", Value: 1234}.
     * *If you had a composite primary key, you would pass in an array with multiple objects, one for each field in the primary key. You may ONLY pass in the primary key fields, no other fields are allowed.
     * @param EntityRelationshipsToLoad Optional, you can specify the names of the relationships to load up. This is an expensive operation as it loads up an array of the related entity objects for the main record, so use it sparingly.
     * @returns true if success, false otherwise
     */
    public async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        if (!this.ProviderToUse) {    
            throw new Error('No provider set');
        }
        else{
            const valResult = CompositeKey.Validate();
            if (!valResult || !valResult.IsValid)
                throw new Error(`Invalid CompositeKey passed to BaseEntity.Load(${this.EntityInfo.Name}): ${valResult.ErrorMessage}`);

            this.CheckPermissions(EntityPermissionType.Read, true); // this will throw an error and exit out if we don't have permission

            if (!this.IsSaved){
                this.init(); // wipe out current data if we're loading on top of existing record
            }

            const data = await this.ProviderToUse.Load(this, CompositeKey, EntityRelationshipsToLoad, this.ActiveUser);
            if (!data) {
                LogError(`Error in BaseEntity.Load(${this.EntityInfo.Name}, Key: ${CompositeKey.ToString()}`);
                return false; // no data loaded, return false
            }

            this.SetMany(data, false, true); // don't ignore non-existent fields, but DO replace old values
            if (EntityRelationshipsToLoad) {
                for (let relationship of EntityRelationshipsToLoad) {
                    if (data[relationship]) {
                        // we have some data, put into an array for ease of access
                        this[relationship] = data[relationship]
                    }
                }
            }
            this._recordLoaded = true;
            this._compositeKey = CompositeKey; // set the composite key to the one we just loaded

            return true;
        }
    }

    /**
     *
     * This method is meant to be used only in situations where you are sure that the data you are loading is current in the database. MAKE SURE YOU ARE PASSING IN ALL FIELDS.
     * The Dirty flags and other internal state will assume what is loading from the data parameter you pass in is equivalent to what is in the database. Generally speaking, you should use Load() instead of this method. The main use case(s) where this makes sense are:
     *  (1) On the server if you are pulling data you know is fresh from say the result of another DB operation
     *  (2) If on any tier you run a fresh RunView result, that gives you data from the database, you can then instantiate objects via Metadata.GetEntityObject() and then use this with the result from the RunView call
     *  *** Note: for the #2 use case, when you call the RunView Object RunView() method with the ResultType='entity_object', you'll get an array of BaseEntity-derived objects instead of simple objects, that functionality utilizes this method
     * @param data - a simple object that has properties that match the field names of the entity object
     * @param replaceOldValues - if true, the old values of the fields will be set to the values provided in the data parameter, if false, they will be left alone
     * @returns
     */
    public LoadFromData(data: any, replaceOldValues: boolean = false) : boolean {
        this.SetMany(data, true);
        return true;
    }

    /**
     * This method is used automatically within Save() and is used to determine if the state of the object is valid relative to the validation rules that are defined in metadata. In addition, sub-classes can
     * override or wrap this base class method to add other logic for validation.
     * 
     * @returns ValidationResult The validation result
     */
    public Validate(): ValidationResult  {
        const result = new ValidationResult();
        result.Success = true; // start off with assumption of success, if any field fails, we'll set this to false

        for (let field of this.Fields) {
            const err = field.Validate();
            err.Errors.forEach(element => {
                result.Errors.push(element);
            });
            result.Success = result.Success && err.Success; // if any field fails, we fail, but keep going to get all of the validation messages
        }

        return result;
    }
    
    /**
     * Default value for whether async validation should be skipped.
     * Subclasses can override this property to enable async validation by default.
     * When the options object is passed to Save(), and it includes a value for the 
     * SkipAsyncValidation property, that value will take precedence over this default.
     * 
     * @see {@link Save}
     * 
     * @protected
     */
    public get DefaultSkipAsyncValidation(): boolean {
        return true; // By default, skip async validation unless explicitly enabled
    }
    
    /**
     * Asynchronous validation method that can be overridden by subclasses to add custom async validation logic.
     * This method is automatically called by Save() AFTER the synchronous Validate() passes.
     * 
     * IMPORTANT: 
     * 1. This should NEVER be called INSTEAD of the synchronous Validate() method
     * 2. This is meant to be overridden by subclasses that need to perform async validations
     * 3. The base implementation just returns success - no actual validation is performed
     * 
     * Subclasses should override this to add complex validations that require database queries 
     * or other async operations that cannot be performed in the synchronous Validate() method.
     * 
     * @returns Promise<ValidationResult> A promise that resolves to the validation result
     */
    public async ValidateAsync(): Promise<ValidationResult> {
        // Default implementation just returns success
        // Subclasses should override this to perform actual async validation
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }

    /**
     * This method deletes a record from the database. You must call Load() first in order to load the context of the record you are deleting.
     * @returns
     */
    public async Delete(options?: EntityDeleteOptions) : Promise<boolean> {
        const currentResultCount = this.ResultHistory.length;
        const newResult = new BaseEntityResult();
        newResult.StartedAt = new Date();

        try {
            if (!this.ProviderToUse) {    
                throw new Error('No provider set');
            }
            else{
                this.CheckPermissions(EntityPermissionType.Delete, true); // this will throw an error and exit out if we don't have permission
                
                // stash the old values for the event
                const oldVals =  await this.GetDataObject({
                    oldValues: false,
                    omitNullValues: false,
                    omitEmptyStrings: false,
                    excludeFields: null,
                    includeRelatedEntityData: false,
                    relatedEntityList: null
                });
                if (await this.ProviderToUse.Delete(this, options, this.ActiveUser)) {
                    if (!this.TransactionGroup) {
                        // NOT part of a transaction - raise event immediately

                        // record deleted correctly
                        this.RaiseEvent('delete', {OldValues: oldVals});

                        // wipe out the current data to flush out the DIRTY flags by calling NewRecord()
                        this.NewRecord(); // will trigger a new record event here too
                    }
                    else {
                        // part of a transaction, wait for the transaction to submit successfully and then 
                        // raise the event
                        this.TransactionGroup.TransactionNotifications$.subscribe(({ success, results, error }) => {
                            if (success) {
                                this.RaiseEvent('delete', {OldValues: oldVals});

                                // wipe out the current data to flush out the DIRTY flags by calling NewRecord()
                                this.NewRecord(); // will trigger a new record event here too    
                            }
                            else {
                                // transaction failed, so we need to add a new result to the history here
                                newResult.Success = false;
                                newResult.Type = 'delete'
                                newResult.Message = error && error.message? error.message : error;
                                newResult.Errors = error.Errors || [];
                                newResult.OriginalValues = this.Fields.map(f => { return {FieldName: f.CodeName, Value: f.OldValue} });
                                newResult.EndedAt = new Date();
                                this.ResultHistory.push(newResult);
                            }
                        });
                    }
                    return true;
                }
                else // record didn't save, return false, but also don't wipe out the entity like we do if the Delete() worked
                    return false;
            }
        }
        catch (e) {
            if (currentResultCount === this.ResultHistory.length) {
                // this means that NO new results were added to the history anywhere
                // so we need to add a new result to the history here
                newResult.Success = false;
                newResult.Type = 'delete'
                newResult.Message = e.message || null;
                newResult.Errors = e.Errors || [];
                newResult.OriginalValues = this.Fields.map(f => { return {FieldName: f.CodeName, Value: f.OldValue} });
                newResult.EndedAt = new Date();
                this.ResultHistory.push(newResult);
            }
            return false;
        }
    }

    /**
     * Called before an Action is executed by the AI Engine
     * This is intended to be overriden by subclass as needed, these methods called at the right time by the execution context
     */
    public async BeforeEntityAIAction(params: BaseEntityAIActionParams): Promise<boolean> {
        return true; // default implementation does nothing

    }
    /**
     * Called after an Action is executed by the AI Engine
     */
    public async AfterEntityAIAction(params: BaseEntityAIActionParams): Promise<boolean> {
        return true;// default implementation does nothing
    }

    private static _globalProviderKey: string = 'MJ_BaseEntityProvider';
    /**
     * Static property to get/set the IEntityDataProvider that is used by all BaseEntity objects. This is a global setting that is used by all BaseEntity objects. It can be overriden for a given BaseEntity object instance by passing in a provider to the 
     * constructor of the BaseEntity object. Typically, a provider will pass itself into BaseEntity objects it creates to create a tight coupling between the provider and the BaseEntity objects it creates. This allows multiple concurrent
     * connections to exist in the same process space without interfering with each other.
     */
    public static get Provider(): IEntityDataProvider {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            return g[BaseEntity._globalProviderKey];
        else
            throw new Error('No global object store, so we cant get the static provider');
    }
    public static set Provider(value: IEntityDataProvider) {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            g[BaseEntity._globalProviderKey] = value;
        else
            throw new Error('No global object store, so we cant set the static provider');
    }

    /**
     * Returns a list of changes made to this record, over time. Only works if TrackRecordChanges bit set to 1 on the entity you're working with.
     */
    public get RecordChanges(): Promise<RecordChange[]> {
        if (this.IsSaved){
            return BaseEntity.GetRecordChanges(this.EntityInfo.Name, this.PrimaryKey, this.ProviderToUse);
        }
        else{
            throw new Error('Cannot get record changes for a record that has not been saved yet');
        }
    }


    /**
     * Static Utility method to get RecordChanges for a given entityName/KeyValuePair combination
     * @param entityName 
     * @returns 
     */
    public static async GetRecordChanges(entityName: string, primaryKey: CompositeKey, provider: IEntityDataProvider | null = null): Promise<RecordChange[]> {
        const providerToUse = provider || BaseEntity.Provider;
        if (!providerToUse) {    
            throw new Error('No provider set or passed in');
        }
        else{
            const results = await providerToUse.GetRecordChanges(entityName, primaryKey);
            if (results) {
                const changes: RecordChange[] = [];
                for (let result of results)
                    changes.push(new RecordChange(result));

                return changes;
            }
            else
                return [];
        }
    }

    /**
     * Strongly-typed wrapper for the {@link SetMany} method.
     * @oaram data - the data to set on the entity object
     * @param schema - the zod schema to validate the data against
     */
    public From<K extends z.AnyZodObject>(data: unknown, schema?: z.infer<K>): boolean {
        this.init();
        if(schema){
            const parseResult = schema.safeParse(data);
            if(parseResult.success){
                this.SetMany(parseResult.data);
                return true;
            }
            else{
                LogError(parseResult.error.flatten());
                return false;
            }
        }
        else{
            this.SetMany(data);
            return true;
        }
    }

    /**
     * Strongly-typed wrapper for the {@link GetAll} method
     * @param schema - the zod schema to validate the data against
     */
    public To<K extends z.AnyZodObject>(schema?: K): z.infer<K> | null {
        if(schema){
            const data = this.GetAll();
            const parseResult = schema.safeParse(data);
            if(parseResult.success){
                parseResult.data as K;
            }
            else{
                LogError(parseResult.error.flatten());
                return null;
            }
        }

        return this.GetAll() as K;
    }
}
