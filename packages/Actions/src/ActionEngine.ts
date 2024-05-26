import { RunView, UserInfo } from "@memberjunction/core";
import { ActionEntity, ActionExecutionLogEntity, ActionFilterEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { MJGlobal } from "@memberjunction/global";

/**
 * Class that has the result of an action. This is returned by the Run method of an action.
 */
export class ActionResult {
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
    */
   public LogEntry: ActionExecutionLogEntity;

   /**
    * Optional, a message an action can include that describes the outcome of the action. This is typically used to display a message to the user.
    */
   public Message?: string;

   /**
    * Some actions return output parameters. If the action that was run has outputs, they will be stored here.
    */
   public Outputs: ActionParam[];
}

/**
 * Generic class for holding parameters for an action for both inputs and outputs
 */
export class ActionParam {
   public Name: string;
   public Value: string;
}

/**
 * Class that holds the parameters for an action to be run. This is passed to the Run method of an action.
 */
export class RunActionParams {
   public Action: ActionEntity;
   public Filters: ActionFilterEntity[];
   public Inputs: ActionParam[];
}


/**
 * Base class for executing actions. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class ActionEngine {
    // implement a singleton pattern for caching metadata. All uses of the ActionEngine will first call Config() to get started which is an async method. This method will load the metadata and cache it in a variable wtihin the "GlobalObjectStore"
    // which is an MJ utility that is available to all packages. This will allow the metadata to be loaded once and then used by all instances of the ActionEngine. This is important because the metadata is not expected to change.
    private static _globalKey: string = 'MJ_ActionMetadata';
    constructor() {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        const instance = g[ActionEngine._globalKey];

        if (!instance) {
            // first time this is happening, so create the instance
            g[ActionEngine._globalKey] = this;
        }
        return g[ActionEngine._globalKey];
    }
 
    // internal instance properties used for the singleton pattern
    private _loaded: boolean = false;
    private _Actions: ActionEntity[];
    private _Filters: ActionFilterEntity[];
    private _ActionResultCodes: ActionResultCodeEntity[];
    private _contextUser: UserInfo;

    /**
     * This method is called to configure the ActionEngine. It loads the metadata for the actions, filters, and result codes and caches them in the GlobalObjectStore. You must call this method before running any actions.
     * If this method was previously run on the instance of the ActionEngine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
     * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
     * @param contextUser If you are running the action on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
     */
    public async Config(forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
        if (!this._loaded || forceRefresh) {
            this._contextUser = contextUser;

            // Load all actions
            const rv = new RunView();
            const actions = await rv.RunView({
                EntityName: 'Actions',
                ResultType: 'entity_object'
            }, contextUser);
            if (actions.Success) {
                this._Actions = actions.Results;
            }

            // Load all filters
            const filters = await rv.RunView({
                EntityName: 'Action Filters',
                ResultType: 'entity_object'
            }, contextUser);
            if (filters.Success) {
                this._Filters = filters.Results;
            }

            // Load all result codes
            const resultCodes = await rv.RunView({
                EntityName: 'Action Result Codes',
                ResultType: 'entity_object'
            }, contextUser);
            if (resultCodes.Success) {
                this._ActionResultCodes = resultCodes.Results;
            }
        }
        else {
            // we have already loaded and have not been told to force the refresh
        }
    }

    public async RunAction(params: RunActionParams): Promise<ActionResult> {
      if (await this.ValidateInputs(params)) {
         if (await this.RunFilters(params)) {
            return await this.InternalRunAction(params);
         }
         else {
            // filters indicated we should NOT run this action
            const result: ActionResult = {
               Success: true,
               Message: "Filters were run and the result indicated this action should not be executed. This is a Success condition as filters returning false is not considered an error.",
               LogEntry: null, // initially null
               Outputs: [],
               RunParams: params
            };

            result.LogEntry = await this.LogActionRun(params, result);
         }
      }
      else {
         // input validation failed
         return {
            Success: false,
            Message: "Input validation failed. This is a failure condition.",
            LogEntry: null,
            Outputs: [],
            RunParams: params
         };
      }
    }      

   /**
    * This method handles input validation. Subclasses can override this method to provide custom input validation.
    */
   protected async ValidateInputs(params: RunActionParams): Promise<boolean> {
      return true;
   }

   /**
    * This method runs any filters for the action. Subclasses can override this method to provide custom filter logic.
    */
   protected async RunFilters(params: RunActionParams): Promise<boolean> {
      if (!params.Filters) {
         return true;
      }
      else {
         for (let filter of params.Filters) {
            if (!await this.RunSingleFilter(params, filter)) {
               return false;
            }
         }
      }
   }

   /**
    * This method runs a single filter. Subclasses can override this method to provide custom filter logic.
    * @param filter 
    */
   protected async RunSingleFilter(params: RunActionParams, filter: ActionFilterEntity): Promise<boolean> {
      return true;
      // temp stub above, replace with code that will run the filter      
   }

   protected async InternalRunAction(params: RunActionParams): Promise<ActionResult> {
      // this is where the actual action code will be implemented
      return {
         Success: true,
         Message: "This action has not been implemented yet.",
         LogEntry: null,
         Outputs: [],
         RunParams: null
      };
   }

   protected async LogActionRun(params: RunActionParams, result: ActionResult): Promise<ActionExecutionLogEntity> {
      // this is where the log entry for the action run will be created
      return null;
   }
}