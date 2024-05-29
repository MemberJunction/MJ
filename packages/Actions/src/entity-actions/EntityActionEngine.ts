import { BaseEntity, EntityInfo, RunView, UserInfo } from "@memberjunction/core";
import { ActionEntity, EntityActionEntity, EntityActionFilterEntity, EntityActionInvocationEntity, EntityActionInvocationTypeEntity } from "@memberjunction/core-entities";
import { BaseSingleton } from "@memberjunction/global";
import { EntityActionEntityServer } from "./EntityActionEntity.server";


/**
 * Parameters type for invoking an entity action
 */
export class EntityActionInvocationParams {
    /**
     * The entity action to be invoked
     */
    public EntityAction: EntityActionEntityServer;

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
    public ViewID?: number;
    /**
     * If the invocation type is list-oriented, this parameter will be needed
     */
    public ListID?: number;
}
/**
 * The purpose of this class is to handle the invocation of actions for entities in all of the supported invocation contexts.
 */
export class EntityActionEngine extends BaseSingleton<EntityActionEngine> {
    private constructor() {
        super('MJ_EntityAction_Metadata');
    }

    public static get Instance(): EntityActionEngine {
        return super.getInstance<EntityActionEngine>('MJ_EntityAction_Metadata');
    }

 
    // internal instance properties used for the singleton pattern
    private _loaded: boolean = false;
    private _contextUser?: UserInfo;
    private _EntityActions: EntityActionEntityServer[] = [];
    private _EntityActionInvocationTypes: EntityActionInvocationTypeEntity[] = [];
    private _EntityActionFilters: EntityActionFilterEntity[] = [];
    private _EntityActionInvocations: EntityActionInvocationEntity[] = [];

    /**
     * This method is called to configure the ActionEngine. It loads the metadata for the actions, filters, and result codes and caches them in the GlobalObjectStore. You must call this method before running any actions.
     * If this method was previously run on the instance of the ActionEngine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
     * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
     * @param contextUser If you are running the action on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
     */
    public async Config(forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
        if (!this._loaded || forceRefresh) { 
            this._contextUser = contextUser;

            const rv = new RunView();
            const actions = await rv.RunView({
                EntityName: 'Entity Action Invocation Types',
                ResultType: 'entity_object'
            }, contextUser);
            if (actions.Success) {
                this._EntityActionInvocationTypes = actions.Results;
            }

            const filters = await rv.RunView({
                EntityName: 'Entity Action Filters',
                ResultType: 'entity_object'
            }, contextUser);
            if (filters.Success) {
                this._EntityActionFilters = actions.Results;
            }

            const invocations = await rv.RunView({
                EntityName: 'Entity Action Invocations',
                ResultType: 'entity_object'
            }, contextUser);
            if (invocations.Success) {
                this._EntityActionInvocations = actions.Results;
            }
            this._loaded = true;
        }
        else {
            // we have already loaded and have not been told to force the refresh
        }
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
     * Method will invoke an action given the provided parameters. The method will return true if the action was successfully invoked, false otherwise.
     * @param params Parameters for the action invocation
     * @returns 
     */
    public async InvokeAction(params: EntityActionInvocationParams): Promise<boolean> {
        /*
            Logic for invoking an Entity Action:
            1) Validate the params, making sure that we have the right stuff
            2) Switch based on the invocation type to execute the right logic
         */
        return true;
    }
}