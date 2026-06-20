import { MJGlobal, MJLruCache, RegisterClass, SafeJSONParse, UUIDsEqual } from "@memberjunction/global";
import { MJActionParamEntity, MJEntityActionParamEntity } from "@memberjunction/core-entities";
import { BaseEntity, Metadata, RunView } from "@memberjunction/core";
import { ActionParam, ActionResult, EntityActionInvocationParams, EntityActionResult } from "@memberjunction/actions-base";
import { ActionEngineServer } from "../generic/ActionEngine";

/**
 * Base class for invocation of any entity action invocation type
 */
export abstract class EntityActionInvocationBase {
    public abstract InvokeAction(params: EntityActionInvocationParams): Promise<EntityActionResult>

    /**
     * Case insensitive helper method to find a param by valueType
     * @param allParams 
     * @param valueType 
     */
    public FindActionParam(allParams: MJActionParamEntity[], valueType: "Scalar" | "Simple Object" | "BaseEntity Sub-Class" | "Other"): MJActionParamEntity {
        return allParams.find(p => p.ValueType.trim().toLowerCase() === valueType.trim().toLowerCase());
    }

    public MapActionResultToEntityActionResult(result: ActionResult): EntityActionResult {
        return {
            Success: result.Success,
            Message: result.Message,
            AIDirectives: result.AIDirectives,
            RunParams: result.RunParams,
            LogEntry: result.LogEntry
        }
    }

    /**
     * This method will map the Entity Action Params to the Action Params and where needed evaluate scripts to get the run-time values that need
     * to get passed to the Action.
     * @param params 
     * @param entityActionParams 
     * @param entityObject 
     * @returns 
     */
    public async MapParams(params: MJActionParamEntity[], entityActionParams: MJEntityActionParamEntity[], entityObject: BaseEntity): Promise<ActionParam[]> {
        const returnValues: ActionParam[] = [];
        for (const eap of entityActionParams) {
            const param = params.find(p => UUIDsEqual(p.ID, eap.ActionParamID));
            let value: any = null;

            switch (eap.ValueType) {
                case 'Static':
                    // value could be a scalar or could be JSON. if JSON, we need to parse it so attempt to parse it and if we get a non-null value
                    // back then we use that, otherwise we use the original value
                    const jsonValue = SafeJSONParse(eap.Value);
                    if (jsonValue)
                        value = jsonValue;
                    else
                        value = eap.Value;
                    break;
                case 'Entity Object':
                    value = entityObject;
                    break;
                case 'Entity Field':
                    value = entityObject[eap.Value];
                    break;
                case 'Script':
                    value = await this.SafeEvalScript(eap.ID, eap.Value, entityObject);
                    break;
            }

            returnValues.push(
                {
                    Name: param.Name,
                    Value: value,
                    Type: param.Type
                }
            );
        }

        return returnValues;
    }

    // Bounded LRU cache prevents unbounded growth from one compiled function per unique EntityActionID.
    private _scriptCache = new MJLruCache<string, (...args: unknown[]) => Promise<unknown>>({ maxSize: 1000 });

    /**
     * Attempt to execute a script and wraps in try/catch to handle any errors so that no exceptions are thrown
     * The scripts are passed an object called EntityActionContext which has a property called entityObject that is the entity object
     * for the current Entity Action. The script can do whatever it wants to do, and passes back a value in the result property of the EntityActionContext object
     * @param scriptText the script to execute
     * @param entityObject the entity object to pass to the script
     */
    public async SafeEvalScript(EntityActionID: string, scriptText: string, entityObject: BaseEntity): Promise<any> {
        const entityActionContext = { 
            entityObject,
            result: null 
        };
    
        try {
            let scriptFunction = this._scriptCache.Get(EntityActionID);
            if (!scriptFunction) {
                scriptFunction = new Function('EntityActionContext', `
                    return (async () => {
                        ${scriptText}
                    })();
                `) as (...args: unknown[]) => Promise<unknown>;
                this._scriptCache.Set(EntityActionID, scriptFunction);
            }

            const ret = await scriptFunction(entityActionContext);
            return ret || entityActionContext.result;
        }
        catch (e) {
            console.error(`Error executing script: ${e.message}`);
            return null;
        }
    }
}

/**
 * Base class for invocation of any entity action invocation type that is single record oriented
 */
@RegisterClass(EntityActionInvocationBase, 'Read')
@RegisterClass(EntityActionInvocationBase, 'BeforeCreate')
@RegisterClass(EntityActionInvocationBase, 'BeforeUpdate')
@RegisterClass(EntityActionInvocationBase, 'BeforeDelete')
@RegisterClass(EntityActionInvocationBase, 'AfterCreate')
@RegisterClass(EntityActionInvocationBase, 'AfterUpdate')
@RegisterClass(EntityActionInvocationBase, 'AfterDelete')
@RegisterClass(EntityActionInvocationBase, 'SingleRecord')
export class EntityActionInvocationSingleRecord extends EntityActionInvocationBase {
    public async ValidateParams(params: EntityActionInvocationParams): Promise<boolean> {
        // for this type of invocation we need to validate that the EntityObject is not null
        if (!params.EntityObject) {
            throw new Error('EntityObject is required for single record invocation - Create/Read/Update/Delete');
        }
        return true;
    }

    public async InvokeAction(params: EntityActionInvocationParams): Promise<EntityActionResult> {
        // for this type of invocation we need to validate that the EntityObject is not null
        if (this.ValidateParams(params)) {
            // now do the work
            // get the class that is derived from BaseAction for the Action Name
            await ActionEngineServer.Instance.Config(false, params.ContextUser);

            // prepare the variables for the action
            const action = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, params.EntityAction.ActionID));
            const internalParams = await this.MapParams(action.Params, params.EntityAction.Params, params.EntityObject);
            const filters = params.EntityAction.Filters.map(f => {
                const filter = ActionEngineServer.Instance.ActionFilters.find(fi => UUIDsEqual(fi.ID, f.ActionFilterID));
                return filter;
            })
            
            const result = await ActionEngineServer.Instance.RunAction({
                Action: action,
                ContextUser: params.ContextUser,
                Filters: filters,
                Params: internalParams
            });

            return result;
        }
        else
            return null;
    }
}

/**
 * Base class for invocation of any entity action invocation type that is multiple-record oriented. Handles
 * getting the list of records from the provided parameters (either ListID or ViewID), getting the actual records
 * for each of those scenarios, and then invoking the action for each record, aggregating the results and returning
 * a single ActionResult object.
 */
@RegisterClass(EntityActionInvocationBase, 'List')
@RegisterClass(EntityActionInvocationBase, 'View')
export class EntityActionInvocationMultipleRecords extends EntityActionInvocationBase {
    public async ValidateParams(params: EntityActionInvocationParams): Promise<boolean> {
        // for this type of invocation we need to validate that the EntityObject is not null
        const invoType = params.InvocationType.Name.trim().toLowerCase();
        if (invoType === 'list' && !params.ListID) {
            throw new Error('ListID is required for multiple record invocation when InvocationType=List');
        }
        else if (invoType === 'view' && !params.ViewID) {
            throw new Error('ViewID is required for multiple record invocation when InvocationType=View');
        }
        else if (invoType !== 'list' && invoType !== 'view') {
            throw new Error('This class only supports invocation types of List or View.');
        }
        else
           return true;
    }

    public async InvokeAction(params: EntityActionInvocationParams): Promise<EntityActionResult> {
        // for this type of invocation we need to validate that we have either a list or a view 
        if (this.ValidateParams(params)) {
            // now do the work
            // get the class that is derived from BaseAction for the Action Name
            await ActionEngineServer.Instance.Config(false, params.ContextUser);

            // prepare the variables for the action
            const action = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, params.EntityAction.ActionID));

            // get the priority sub-class for the SingleRecord invocation type that we need now
            const invocationInstance = MJGlobal.Instance.ClassFactory.CreateInstance<EntityActionInvocationBase>(EntityActionInvocationBase, 'SingleRecord'); // get the single record class
            if (!invocationInstance)
                throw new Error('Error creating instance of invocation type');

            // now, we loop through the list of records and invoke the action for each one
            const recordList: BaseEntity[] = await this.GetRecordList(params);
            const results: EntityActionResult[] = [];
            for (const record of recordList) {
                const innerParams = {...params};
                innerParams.EntityObject = record;
                const result = await invocationInstance.InvokeAction(innerParams);
                results.push(result);
            }

            const consolidatedResult: EntityActionResult = {
                Success: results.every(r => r.Success),
                Message: results.map(r => r.Message).join('\n'),
                RunParams: null,
                LogEntry: null
            }
            return consolidatedResult;
        }
        else
            return null;
    }

    /**
     * Resolves the record set for a View or List invocation into loaded entity objects, which the
     * per-record loop in {@link InvokeAction} then processes one at a time.
     */
    protected async GetRecordList(params: EntityActionInvocationParams): Promise<BaseEntity[]> {
        const invoType = params.InvocationType.Name.trim().toLowerCase();
        if (invoType === 'view') {
            return this.loadRecordsForView(params);
        }
        else if (invoType === 'list') {
            return this.loadRecordsForList(params);
        }
        return [];
    }

    /** Loads all records of a User View as entity objects. */
    protected async loadRecordsForView(params: EntityActionInvocationParams): Promise<BaseEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<BaseEntity>({
            ViewID: params.ViewID,
            ResultType: 'entity_object'
        }, params.ContextUser);
        if (!result.Success) {
            throw new Error(`Failed to load records for view '${params.ViewID}': ${result.ErrorMessage}`);
        }
        return result.Results ?? [];
    }

    /** Loads all members of a List as entity objects (single-primary-key entities). */
    protected async loadRecordsForList(params: EntityActionInvocationParams): Promise<BaseEntity[]> {
        const entity = new Metadata().EntityByID(params.EntityAction.EntityID);
        if (!entity) {
            throw new Error(`Entity '${params.EntityAction.EntityID}' for this entity action was not found in metadata`);
        }
        if (entity.PrimaryKeys.length !== 1) {
            throw new Error(`List invocation currently supports single-primary-key entities only; '${entity.Name}' has a composite key`);
        }

        const rv = new RunView();
        const memberResult = await rv.RunView<{ RecordID: string }>({
            EntityName: 'MJ: List Details',
            ExtraFilter: `ListID='${params.ListID}'`,
            Fields: ['RecordID'],
            ResultType: 'simple'
        }, params.ContextUser);
        if (!memberResult.Success) {
            throw new Error(`Failed to load members for list '${params.ListID}': ${memberResult.ErrorMessage}`);
        }
        const recordIDs = (memberResult.Results ?? []).map(r => String(r.RecordID)).filter(id => id.length > 0);
        if (recordIDs.length === 0) {
            return [];
        }

        const pk = entity.FirstPrimaryKey;
        const numericKey = this.isNumericFieldType(pk.Type);
        const inList = recordIDs
            .map(id => numericKey ? id.replace(/[^0-9.\-]/g, '') : `'${id.replace(/'/g, "''")}'`)
            .join(',');
        const result = await rv.RunView<BaseEntity>({
            EntityName: entity.Name,
            ExtraFilter: `${pk.Name} IN (${inList})`,
            ResultType: 'entity_object'
        }, params.ContextUser);
        if (!result.Success) {
            throw new Error(`Failed to load list member records for '${entity.Name}': ${result.ErrorMessage}`);
        }
        return result.Results ?? [];
    }

    /** True when a PK column type is numeric (so its values must not be quoted in a filter). */
    protected isNumericFieldType(type: string): boolean {
        const t = (type || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        return ['int', 'integer', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real', 'double precision', 'serial', 'bigserial'].includes(t);
    }
}

/**
 * This class handles the invocation type of Validate and uses Entity Actions to validate a record and provide the results back to the caller
 */
@RegisterClass(EntityActionInvocationBase, 'Validate')
export class EntityActionInvocationValidate extends EntityActionInvocationSingleRecord {
    public override async InvokeAction(params: EntityActionInvocationParams): Promise<EntityActionResult> {
        // for this type of invocation we need to validate that the EntityObject is not null
        if (this.ValidateParams(params)) {
            // make sure the action engine is good to go, the below won't do anything if it was already configured
            await ActionEngineServer.Instance.Config(false, params.ContextUser);

            const action = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, params.EntityAction.ActionID));
            const internalParams = await this.MapParams(action.Params, params.EntityAction.Params, params.EntityObject);
            
            const result = await ActionEngineServer.Instance.RunAction({
                Action: action,
                ContextUser: params.ContextUser,
                Filters: params.EntityAction.Filters.map(f => {
                    const filter = ActionEngineServer.Instance.ActionFilters.find(fi => UUIDsEqual(fi.ID, f.ActionFilterID));
                    return filter;
                }),
                Params: internalParams
            })

            return result 
        }
        else
            return null;
    }
}