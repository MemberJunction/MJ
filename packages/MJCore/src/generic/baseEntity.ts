import { MJGlobal } from '@memberjunction/global';
import { EntityFieldInfo, EntityInfo, EntityFieldTSType, EntityPermissionType, RecordChange, ValidationErrorInfo, ValidationResult, EntityRelationshipInfo } from './entityInfo';
import { EntitySaveOptions, IEntityDataProvider } from './interfaces';
import { Metadata } from './metadata';
import { RunView } from '../views/runView';
import { UserInfo } from './securityInfo';
import { TransactionGroupBase } from './transactionGroup';

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

    get IsUnique(): boolean {
        return this._entityFieldInfo.IsUnique;
    }

    get Value(): any {
        return this._Value;
    }

    get ReadOnly(): boolean {
        return this._entityFieldInfo.ReadOnly;
    }

    get EntityFieldInfo(): EntityFieldInfo {
        return this._entityFieldInfo;
    }

    set Value(value: any) {
        if (
              !this.ReadOnly || 
              this._NeverSet  /* Allow one time set of any field because BaseEntity Object passes in ReadOnly fields when we load, 
                                 after that load for a given INSTANCE of an EntityField object we never set a ReadOnly Field*/
            ) {
            this._Value = value;

            if (this._NeverSet && 
                //this._OldValue == null &&  ---- we used to check _OldValue == null, but actually that doesn't make any sense because we don't care about the old value here, we just care that _NeverSet === true 
                value != null) {
                // initial value set
                this._OldValue = value;
            }

            this._NeverSet = false;
        }
    }

    get Dirty(): boolean {
        if (this.ReadOnly)
            return false
        else {
            const oldNull = this._OldValue === null || this.OldValue === undefined;
            const curNull = this.Value === null || this.Value === undefined;
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

    public FormatValue(decimals: number = 2, currency: string = 'USD') {
        return this.EntityFieldInfo.FormatValue(this.Value, decimals, currency);
    }

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

    public ResetOldValue() {
        this._OldValue = this.Value;
    }

    public get OldValue(): any {
        return this._OldValue;
    }
}

export class DataObjectRelatedEntityParam {
    relatedEntityName: string
    filter?: string
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

export abstract class BaseEntity {
    [key: string]: any;
    
    private _EntityInfo: EntityInfo;
    private _Fields: EntityField[] = [];
    private _recordLoaded: boolean = false;
    private _contextCurrentUser: UserInfo = null;
    private _transactionGroup: TransactionGroupBase = null;

    constructor(Entity: EntityInfo) {
        this._EntityInfo = Entity;
        this.init();
    }

    get TransactionGroup(): TransactionGroupBase {
        return this._transactionGroup;
    }

    set TransactionGroup(group: TransactionGroupBase) {
        this._transactionGroup = group;
    }

    get EntityInfo(): EntityInfo {
        return this._EntityInfo;
    }

    get Fields(): EntityField[] {
        return this._Fields;
    }

    public GetFieldByName(fieldName: string): EntityField {
        return this.Fields.find(f => f.Name.trim().toLowerCase() == fieldName.trim().toLowerCase());
    }
    
    get Dirty(): boolean {
        return !this.ID || this.ID <=0 || this.Fields.some(f => f.Dirty);
    }

    get PrimaryKey(): EntityField {
        const fieldInfo = this.EntityInfo.PrimaryKey;
        if (fieldInfo) {
            return this.GetFieldByName(fieldInfo.Name);
        }
        else
            return null;
    }

    get RecordLoaded(): boolean {
        return this._recordLoaded;
    }

    public Set(FieldName: string, Value: any) {
        let field = this.Fields.find(f => f.Name == FieldName);
        if (field != null) {
            field.Value = Value;
        }
    }

    public Get(FieldName: string): any {
        let field = this.Fields.find(f => f.Name == FieldName);
        if (field != null) {
            // if the field is a date and the value is a string, convert it to a date
            if (field.EntityFieldInfo.TSType == EntityFieldTSType.Date && (typeof field.Value === 'string' || typeof field.Value === 'number') ) {
                field.Value = new Date(field.Value);
            }
            return field.Value;
        }
        return null;
    }

    public SetMany(object) {
        for (let key in object) {
            this.Set(key, object[key]);
        }
    }

    public GetAll(oldValues: boolean = false): {} {
        let obj = {};
        for (let field of this.Fields) {
            obj[field.Name] = oldValues ? field.OldValue : field.Value;
            if (field.EntityFieldInfo.TSType == EntityFieldTSType.Date && obj[field.Name] && !(obj[field.Name] instanceof Date)) {
                obj[field.Name] = new Date(obj[field.Name]); // a timestamp, convert to JS Date Object
            }
        }
        return obj;
    }

    public async GetDataObjectJSON(params: DataObjectParams, minifyJSON: boolean = true): Promise<string> {
        const obj = await this.GetDataObject(params);
        if (minifyJSON)
            return JSON.stringify(obj);
        else
            return JSON.stringify(obj, null, 2);
    }
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
                    const reData = await this.GetRelatedEntityData(re, pre.filter);
                    if (reData)
                        obj[re.RelatedEntity] = reData; // got some data (or an empty array) back, add it to the object
                }
            }
        }

        return obj;
    }

    public async GetRelatedEntityData(re: EntityRelationshipInfo, filter: string = null): Promise<any[]> {
        // we need to query the database to get related entity info
        const params = EntityInfo.BuildRelationshipViewParams(this, re, filter)
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


    public set ContextCurrentUser(user: UserInfo) {
        this._contextCurrentUser = user;
    }
    public get ContextCurrentUser(): UserInfo {
        return this._contextCurrentUser;
    }

    public NewRecord() : boolean {
        this.init();
        return true;
    }

    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        const _options: EntitySaveOptions = options ? options : new EntitySaveOptions();
        const type: EntityPermissionType = this.ID && this.ID > 0 ? EntityPermissionType.Update : EntityPermissionType.Create;
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
                        this.loadFieldsFromData(data);
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


    protected get ActiveUser(): UserInfo {
        return this.ContextCurrentUser || Metadata.Provider.CurrentUser; // use the context user ahead of the Provider.Current User - this is for SERVER side ops where the user changes per request
    }

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

    public Revert(): boolean {
        if (this.Dirty) {
            for (let field of this.Fields) {
                field.Value = field.OldValue;
            }
        }
        return true; 
    }
    
    public async Load(PrimaryKeyValue: any, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        if (BaseEntity.Provider == null) {    
            throw new Error('No provider set');
        }
        else{
            const start = new Date().getTime();
            this.CheckPermissions(EntityPermissionType.Read, true); // this will throw an error and exit out if we don't have permission

            if (this.ID !== null) 
                this.init(); // wipe out current data if we're loading on top of existing record

            const data = await BaseEntity.Provider.Load(this, PrimaryKeyValue, EntityRelationshipsToLoad, this.ActiveUser);
            this.loadFieldsFromData(data);
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

    public LoadFromData(data: any) : boolean {
        console.warn('LoadFromData should ONLY be used when you are sure that the data you are loading is current in the database, if you are not sure if your data is current, use Load() instead');
        this.loadFieldsFromData(data); // just use the internal method, but the point of this wrapper is to emit the above warning to the console for devs to see.
        return true; 
    }

    private loadFieldsFromData(data: any) {
        if (data) {
            const keys = Object.keys(data);
            for (let key of keys) {
                this.Set(key, data[key]);
            }
            return true;
        }
    }

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


    /*
        Called before an Action is executed by the AI Engine
        This is intended to be overriden by subclass as needed, these methods called at the right time by the execution context

    **/
    public async BeforeEntityAIAction(params: BaseEntityAIActionParams): Promise<boolean> {
        return true; // default implementation does nothing

    }
    /*
        Called after an Action is executed by the AI Engine
    **/
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

    public get RecordChanges(): Promise<RecordChange[]> {
        if (this.ID && this.ID > 0) 
            return BaseEntity.GetRecordChanges(this.EntityInfo.Name, this.ID)
        else
            throw new Error('Cannot get record changes for a record that has not been saved yet');
    }

    public static async GetRecordChanges(entityName: string, recordId: number): Promise<RecordChange[]> {
        if (BaseEntity.Provider === null) {    
            throw new Error('No provider set');
        }
        else{
            const results = await BaseEntity.Provider.GetRecordChanges(entityName, recordId);
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