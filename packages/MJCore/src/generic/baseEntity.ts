import { MJGlobal } from '@memberjunction/global';
import { EntityFieldInfo, EntityInfo, EntityFieldTSType, EntityPermissionType, RecordChange, ValidationErrorInfo, ValidationResult, EntityRelationshipInfo, PrimaryKeyValue } from './entityInfo';
import { CompositeKey, EntitySaveOptions, IEntityDataProvider } from './interfaces';
import { Metadata } from './metadata';
import { RunView } from '../views/runView';
import { UserInfo } from './securityInfo';
import { TransactionGroupBase } from './transactionGroup';
import { LogError } from './logging';

/**
 * Represents a field in an entity. This class is used to store the value of the field, dirty state, as well as other run-time information about the field. The class encapsulates the underlying field metadata and exposes some of the more commonly
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
        if (Value)
            this.Value = Value;
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
                this.Value = Number(fieldInfo.DefaultValue);
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
                        // if we get here, that means the default value is not a valid date, so we need to check to see if the date is a getdate() type default
                        // use includes() below because it is possible that the value is wrapped in parenthesis, like (getdate()) and that is still valid.
                        if (fieldInfo.DefaultValue.trim().toLowerCase().includes("getdate()") || fieldInfo.DefaultValue.trim().toLowerCase().includes("getutcdate()")) {
                            // we have a getdate() type default, this is always populated by the server, so we should set this to a blank value
                            this.Value = null;
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
    oldValues: boolean = false
    omitNullValues: boolean = true
    omitEmptyStrings: boolean = true
    excludeFields: string[] = null
    includeRelatedEntityData: boolean = true
    relatedEntityList: DataObjectRelatedEntityParam[] = null
}

export class BaseEntityAIActionParams {
    name: string
    actionId: number
    modelId: number
    systemPrompt: string
    userMessage: string
    result: any
}

/**
 * Base class used for all entity objects. This class is abstract and is sub-classes for each particular entity using the CodeGen tool. This class provides the basic functionality for loading, saving, and validating entity objects.
 */
export abstract class BaseEntity {
    private _EntityInfo: EntityInfo;
    private _Fields: EntityField[] = [];
    private _recordLoaded: boolean = false;
    private _contextCurrentUser: UserInfo = null;
    private _transactionGroup: TransactionGroupBase = null;

    constructor(Entity: EntityInfo) {
        this._EntityInfo = Entity;
        this.init();
    }

    /**
     * Returns true if the record has been saved to the database, false otherwise. This is a useful property to check to determine if the record is a "New Record" or an existing one.
     */
    get IsSaved(): boolean {
        const v = this.PrimaryKey?.Value;
        return v !== null && v !== undefined; // if the primary key (or first primary key) value is null/undefined, we haven't saved yet
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
    public GetFieldByName(fieldName: string): EntityField {
        return this.Fields.find(f => f.Name.trim().toLowerCase() == fieldName.trim().toLowerCase());
    }
    
    get Dirty(): boolean {
        return !this.IsSaved || this.Fields.some(f => f.Dirty);
    }

    /**
     * Returns the primary key field for the entity. If the entity has a composite primary key, this method will return the first primary key field.  
     */
    get PrimaryKey(): EntityField {
        const fieldInfo = this.EntityInfo.PrimaryKey;
        if (fieldInfo) {
            return this.GetFieldByName(fieldInfo.Name);
        }
        else
            return null;
    }

    /**
     * Returns an array of all primary key fields for the entity. If the entity has a composite primary key, this method will return an array of all primary key fields. 
     * If the entity has a single primary key, this method will return an array with a single field in it.
     */
    get PrimaryKeys(): EntityField[] {
        return this.EntityInfo.PrimaryKeys.map(pk => this.GetFieldByName(pk.Name));
    }

    /**
     * Retuns a Composite Key for the entity. If the entity has a single primary key, this method will return a CompositeKey with a single primary key field in it.
     */
    get CompositeKey(): CompositeKey {
        let key: CompositeKey = new CompositeKey();
        key.PrimaryKeyValues = this.PrimaryKeys.map((pk) => {
            return { FieldName: pk.Name, Value: pk.Value }
        });
        return key;
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
        let field = this.Fields.find(f => f.Name.trim().toLowerCase() === FieldName.trim().toLowerCase());
        if (field != null) {
            field.Value = Value;
        }
    }

    /**
     * Returns the value of the field with the given name. If the field is a date, and the value is a string, it will be converted to a date object.
     * @param FieldName 
     * @returns 
     */
    public Get(FieldName: string): any {
        let field = this.Fields.find(f => f.Name.trim().toLowerCase() === FieldName.trim().toLowerCase());
        if (field != null) {
            // if the field is a date and the value is a string, convert it to a date
            if (field.EntityFieldInfo.TSType == EntityFieldTSType.Date && (typeof field.Value === 'string' || typeof field.Value === 'number') ) {
                field.Value = new Date(field.Value);
            }
            return field.Value;
        }
        return null;
    }

    /**
     * Sets any number of values on the entity object from the object passed in. The properties of the object being passed in must either match the field name (in most cases) or the CodeName (which is only different from field name if field name has spaces in it)
     * @param object  
     * @param ignoreNonExistentFields 
     */
    public SetMany(object: any, ignoreNonExistentFields: boolean = false) {
        if (!object)
            throw new Error('calling BaseEntity.SetMany(), object cannot be null or undefined');

        for (let key in object) {
            if (this.Fields.some(f => f.Name.trim().toLowerCase() == key.trim().toLowerCase())) {
                // check to see if key matches a field name, if so, set it
                this.Set(key, object[key]);
            }
            else {
                // if we don't find a match for the field name, check to see if we have a match for the code name
                // because some objects passed in will use the code name
                const field = this.Fields.find(f => f.CodeName.trim().toLowerCase() == key.trim().toLowerCase());
                if (field) {
                    this.Set(field.Name, object[key]);
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
     * Utility method to create an object and return it with properties in the newly created and returned object for each field in the entity object. This is useful for scenarios where you need to be able to persist the data
     * in a format to send to a network call, save to a file or database, etc. This method will return an object with properties that match the field names of the entity object.  
     * @param oldValues When set to true, the old values of the fields will be returned instead of the current values.  
     * @param onlyDirtyFields When set to true, only the fields that are dirty will be returned.
     * @returns 
     */
    public GetAll(oldValues: boolean = false, onlyDirtyFields: boolean = false): {} {
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
    public async GetDataObjectJSON(params: DataObjectParams, minifyJSON: boolean = true): Promise<string> {
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
    public async GetDataObject(params: DataObjectParams): Promise<any> {
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
                    const reData = await this.GetRelatedEntityData(re, pre.filter, pre.maxRecords);
                    if (reData)
                        obj[re.RelatedEntity] = reData; // got some data (or an empty array) back, add it to the object
                }
            }
        }

        return obj;
    }

    public async GetRelatedEntityData(re: EntityRelationshipInfo, filter: string = null, maxRecords: number = null): Promise<any[]> {
        // we need to query the database to get related entity info
        const params = EntityInfo.BuildRelationshipViewParams(this, re, filter, maxRecords)
        const rv = new RunView();
        const result = await rv.RunView(params, this._contextCurrentUser)
        if (result && result.Success)
            return result.Results
    }

    private init() {
        this._recordLoaded = false;
        this._Fields = [];
        if (this.EntityInfo)
            for (let field of this.EntityInfo.Fields) {
                this.Fields.push(new EntityField(field));
            }
    }

    /**
     * This method will copy the values from the other entity object into the current one. This is useful for things like cloning a record.
     * This method will ONLY copy values for fields that exist in the current entity object. If the other object has fields that don't exist in the current object, they will be ignored.
     * @param other
     * @param includePrimaryKeys - if true, the primary keys will be copied as well, if false, they will be ignored, defaults to false and generally you want to leave it that way 
     */
    public CopyFrom(other: BaseEntity, includePrimaryKeys: boolean = false): boolean {
        try {
            // iterate through all of OUR fields and set them to the value of the other object, if they exist in the other object
            for (let field of this.Fields) {
                if (!field.IsPrimaryKey || includePrimaryKeys) {
                    const otherField = other.GetFieldByName(field.Name);
                    if (otherField) {
                        this.Set(field.Name, otherField.Value);
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
     * @returns 
     */
    public NewRecord() : boolean {
        this.init();
        return true;
    }

    /**
     * Saves the current state of the object to the database. Uses the active provider to handle the actual saving of the record. If the record is new, it will be created, if it already exists, it will be updated.
     * @param options 
     * @returns 
     */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        const _options: EntitySaveOptions = options ? options : new EntitySaveOptions();
        const type: EntityPermissionType = this.IsSaved ? EntityPermissionType.Update : EntityPermissionType.Create;
        this.CheckPermissions(type, true) // this will throw an error and exit out if we don't have permission

        if (_options.IgnoreDirtyState || this.Dirty) {
            if (BaseEntity.Provider == null) {    
                throw new Error('No provider set');
            }
            else  {
                const valResult = this.Validate();
                if (valResult.Success) {
                    const data = await BaseEntity.Provider.Save(this, this.ActiveUser, _options)
                    if (data) {
                        this.init(); // wipe out the current data to flush out the DIRTY flags, load the ID as part of this too
                        this.SetMany(data);
                        return true;
                    }
                    else
                        return false;
                }
                else {
                    throw valResult; // pass this along to the caller
                }
            }
        }
        else    
            return true; // nothing to save since we're not dirty
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
            return false; // this never happens due to the thrown error but have it anyway to avoid strict compile errors 
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
     * @param PrimaryKeyValues An array of objects that contain the field name and value for the primary key of the record you want to load. For example, if you have a table called "Customers" with a primary key of "ID", you would pass in an array with a single object like this: {FieldName: "ID", Value: 1234}. 
     * *If you had a composite primary key, you would pass in an array with multiple objects, one for each field in the primary key. You may ONLY pass in the primary key fields, no other fields are allowed.
     * @param EntityRelationshipsToLoad Optional, you can specify the names of the relationships to load up. This is an expensive operation as it loads up an array of the related entity objects for the main record, so use it sparingly.
     * @returns true if success, false otherwise
     */
    public async InnerLoad(compositeKey: CompositeKey, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        if (BaseEntity.Provider == null) {    
            throw new Error('No provider set');
        }
        else{
            const start = new Date().getTime();
            this.ValidateCompositeKey(compositeKey);

            this.CheckPermissions(EntityPermissionType.Read, true); // this will throw an error and exit out if we don't have permission

            if (!this.IsSaved) 
                this.init(); // wipe out current data if we're loading on top of existing record

            const data = await BaseEntity.Provider.Load(this, compositeKey, EntityRelationshipsToLoad, this.ActiveUser);
            this.SetMany(data);
            if (EntityRelationshipsToLoad) {
                for (let relationship of EntityRelationshipsToLoad) {
                    if (data[relationship]) {
                        // we have some data, put into an array for ease of access
                        this[relationship] = data[relationship]
                    }
                }
            }
            this._recordLoaded = true;

            // const end = new Date().getTime();
            // const time = end - start;
            // LogStatus(`BaseEntity.Load(${this.EntityInfo.Name}, ID: ${ID}, EntityRelationshipsToLoad.length: ${EntityRelationshipsToLoad ? EntityRelationshipsToLoad.length : 0 }), took ${time}ms`);

            return true;
        }
    }

    protected ValidateCompositeKey(compositeKey: CompositeKey) {
        const PrimaryKeyValues = compositeKey.PrimaryKeyValues;
        // make sure that PrimaryKeyValues is an array of 1+ objects, and that each object has a FieldName and Value property and that the FieldName is a valid field on the entity that has IsPrimaryKey set to true
        if (!PrimaryKeyValues || PrimaryKeyValues.length === 0)
            throw new Error('PrimaryKeyValues cannot be null or empty');
        else {
            // now loop through the array and make sure each object has a FieldName and Value property
            // and that the field name is a valid field on the entity that has IsPrimaryKey set to true
            for (let i = 0; i < PrimaryKeyValues.length; i++) {
                const pk = PrimaryKeyValues[i];
                if (!pk.FieldName || pk.FieldName.trim().length === 0)
                    throw new Error(`PrimaryKeyValues[${i}].FieldName cannot be null, empty, or whitespace`);
                if (pk.Value === null || pk.Value === undefined)
                    throw new Error(`PrimaryKeyValues[${i}].Value cannot be null or undefined`);
                const field = this.Fields.find(f => f.Name.trim().toLowerCase() === pk.FieldName.trim().toLowerCase());
                if (!field)
                    throw new Error(`PrimaryKeyValues[${i}].FieldName of ${pk.FieldName} does not exist on ${this.EntityInfo.Name}`);
                if (!field.IsPrimaryKey)
                    throw new Error(`PrimaryKeyValues[${i}].FieldName of ${pk.FieldName} is not a primary key field on ${this.EntityInfo.Name}`);
            }
        }
    }

    /**
     * This method is meant to be used only in situations where you are sure that the data you are loading is current in the database. MAKE SURE YOU ARE PASSING IN ALL FIELDS.
     * The Dirty flags and other internal state will assume what is loading from the data parameter you pass in is equivalent to what is in the database. Generally speaking, you should use Load() instead of this method. The main use case(s) where this makes sense are:
     *  (1) On the server if you are pulling data you know is fresh from say the result of another DB operation
     *  (2) If on any tier you run a fresh RunView result, that gives you data from the database, you can then instantiate objects via Metadata.GetEntityObject() and then use this with the result from the RunView call
     *  *** Note: for the #2 use case, when you call the RunView Object RunView() method with the ResultType='entity_object', you'll get an array of BaseEntity-derived objects instead of simple objects, that functionality utilizes this method
     * @param data 
     * @returns 
     */
    public LoadFromData(data: any) : boolean {
        this.SetMany(data, true);
        return true; 
    }

    /**
     * This method is used automatically within Save() and is used to determine if the state of the object is valid relative to the validation rules that are defined in metadata. In addition, sub-classes can
     * override or wrap this base class method to add other logic for validation.
     * @returns 
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
     * This method deletes a record from the database. You must call Load() first in order to load the context of the record you are deleting. 
     * @returns 
     */
    public async Delete() : Promise<boolean> {
        if (BaseEntity.Provider == null) {    
            throw new Error('No provider set');
        }
        else{
            this.CheckPermissions(EntityPermissionType.Delete, true); // this will throw an error and exit out if we don't have permission
            
            if (await BaseEntity.Provider.Delete(this, this.ActiveUser)) {
                // record deleted correctly
                // wipe out the current data to flush out the DIRTY flags by calling NewRecord()
                this.NewRecord();
                return true;
            }
            else // record didn't save, return false, but also don't wipe out the entity like we do if the Delete() worked
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
        if (this.IsSaved) 
            return BaseEntity.GetRecordChanges(this.EntityInfo.Name, this.CompositeKey);
        else
            throw new Error('Cannot get record changes for a record that has not been saved yet');
    }

    /**
     * Static Utility method to get RecordChanges for a given entityName/PrimaryKeyValue combination
     * @param entityName 
     * @param PrimaryKeyValue 
     * @returns 
     */
    public static async GetRecordChanges(entityName: string, compositeKey: CompositeKey): Promise<RecordChange[]> {
        if (BaseEntity.Provider === null) {    
            throw new Error('No provider set');
        }
        else{
            const results = await BaseEntity.Provider.GetRecordChanges(entityName, compositeKey);
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
}