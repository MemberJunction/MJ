import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { ActionExecutionLogEntity, ActionResultCodeEntity, EntityActionFilterEntity, EntityActionInvocationEntity, EntityActionInvocationTypeEntity, EntityActionParamEntity } from "@memberjunction/core-entities";
import { ActionParam, RunActionParams } from "./ActionEngine-Base";
import { EntityActionEntityExtended } from "./EntityActionEntity-Extended";

/**
 * Parameters type for invoking an entity action
 */
export class EntityActionInvocationParams {
    /**
     * The entity action to be invoked
     */
    public EntityAction: EntityActionEntityExtended;

    /**
     * The type of entity/action invocation to be performed
     */
    public InvocationType: EntityActionInvocationTypeEntity;

    /**
     * The user context for the invocation.  
     */
    public ContextUser?: UserInfo;

    /**
     * If the invocation type is single record oriented, this parameter will be needed
     */
    public EntityObject?: BaseEntity;
    /**
     * If the invocation type is view-oriented, this parameter will be needed
     */
    public ViewID?: string;
    /**
     * If the invocation type is list-oriented, this parameter will be needed
     */
    public ListID?: string;
}


/**
 * Class that has the result of a complete action execution, returned by the Run method of the ActionEngine.
 */
export class EntityActionResult {
    /**
     * Contains the parameters that were used to run the action as a convenience.
     */
    public RunParams: RunActionParams;
       
    /**
     * Indicates if the action was successful or not.
     */
    public Success: boolean;
 
    /**
     * A code that indicates the outcome of the action. Will be one of the possible ResultCodes enumerated in the ActionResultCodeEntity
     */
    public Result?: ActionResultCodeEntity;
 
    /**
     * Whenever an action is executed a log entry is created. This log entry is stored in the database and can be used to track the execution of the action. This property contains the log entry object for the action that was run.
     * Note that the log entry will be created 
     */
    public LogEntry?: ActionExecutionLogEntity;
 
    /**
     * Optional, a message an action can include that describes the outcome of the action. This is typically used to display a message to the user.
     */
    public Message?: string;
 
    /**
     * All parameters including inputs and outputs are provided here for convenience
     */
    public Params?: ActionParam[];
 }

/**
 * The purpose of this class is to handle the invocation of actions for entities in all of the supported invocation contexts.
 */
export class EntityActionEngineBase extends BaseEngine<EntityActionEngineBase> {
    public static get Instance(): EntityActionEngineBase {
        return super.getInstance<EntityActionEngineBase>("EntityActionEngineBase");
    }

 
    // internal instance properties used for the singleton pattern
    private _EntityActions: EntityActionEntityExtended[] = [];
    private _EntityActionParams: EntityActionParamEntity[] = [];
    private _EntityActionInvocationTypes: EntityActionInvocationTypeEntity[] = [];
    private _EntityActionFilters: EntityActionFilterEntity[] = [];
    private _EntityActionInvocations: EntityActionInvocationEntity[] = [];

    /**
     * This method is called to configure the ActionEngine. It loads the metadata for the actions, filters, and result codes and caches them in the GlobalObjectStore. You must call this method before running any actions.
     * If this method was previously run on the instance of the ActionEngine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
     * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
     * @param contextUser If you are running the action on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
     */
    public async Config(forceRefresh: boolean = false, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                EntityName: 'Entity Action Invocation Types',
                PropertyName: '_EntityActionInvocationTypes'
            },
            {
                EntityName: 'Entity Action Filters',
                PropertyName: '_EntityActionFilters'
            },
            {
                EntityName: 'Entity Action Invocations',
                PropertyName: '_EntityActionInvocations'
            },
            {
                EntityName: 'Entity Actions', // sub-class for this will handle dynamic loading of filters, invocations, and params when needed by callers of those read-only properties
                PropertyName: '_EntityActions'
            },
            {
                EntityName: 'Entity Action Params',
                PropertyName: '_EntityActionParams'
            }
        ]; 
        await this.Load(configs, provider, forceRefresh, contextUser);
    }


    /**
     * List of all the EntityActionInvocationTypeEntity objects that are available for use in the system. Make sure you call Config() before any other methods on this class.
     */
    public get InvocationTypes(): EntityActionInvocationTypeEntity[] {
        return this._EntityActionInvocationTypes;
    }

    /**
     * List of all the EntityActionFilterEntity objects that are available for use in the system. Make sure you call Config() before any other methods on this class.
     */
    public get Filters(): EntityActionFilterEntity[] {
        return this._EntityActionFilters;
    }

    /**
     * List of all the EntityActionInvocationEntity objects that are available for use in the system. Make sure you call Config() before any other methods on this class.
     */
    public get Invocations(): EntityActionInvocationEntity[] {
        return this._EntityActionInvocations;
    }

    /** 
     * List of all the Entity Action objects that are available for use in the system. Make sure you call Config() before any other methods on this class.
     */
    public get EntityActions(): EntityActionEntityExtended[] {
        return this._EntityActions;
    }

    /**
     * List of all of the Entity Action Params that are available for use in the system. Make sure you call Config() before any other methods on this class.
     */
    public get Params(): EntityActionParamEntity[] {   
        return this._EntityActionParams;
    }

    /**
     * Helper method to get the EntityActionEntityExtended object for a given entity name
     * @param entityName 
     * @param status Optional, if provided will filter the results based on the status
     * @returns 
     */
    public GetActionsByEntityName(entityName: string, status?: 'Active' | 'Pending' | 'Disabled'): EntityActionEntityExtended[] {
        return this._EntityActions.filter(e => (!status || e.Status === status) && e.Entity.trim().toLowerCase() === entityName.trim().toLowerCase());
    }

    /**
     * Helper method to get the EntityActionEntityExtended object for a given entity ID
     * @param entityID 
     * @returns 
     */
    public GetActionsByEntityID(entityID: string): EntityActionEntityExtended[] {
        return this._EntityActions.filter(e => e.EntityID === entityID);
    }

    /**
     * Helper method to get the EntityActionEntityExtended object for a given entity name and invocation type
     * @param entityName 
     * @param invocationType 
     * @param status Optional, if provided will filter the results based on the status
     * @returns 
     */
    public GetActionsByEntityNameAndInvocationType(entityName: string, invocationType: string, status?: 'Active' | 'Pending' | 'Disabled'): EntityActionEntityExtended[] {
        const entityActions = this.GetActionsByEntityName(entityName, status);
        // now extract the ones that have the right invocation type
        return entityActions.filter(e => { 
            const invocations = e.Invocations.find(i => (!status || i.Status === status) && i.InvocationType.trim().toLowerCase() === invocationType.trim().toLowerCase())
            return invocations ? true : false;
        });
    }
}