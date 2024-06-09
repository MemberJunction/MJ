import { BaseEngine, Metadata, UserInfo } from "@memberjunction/core";
import { ActionEntity, ActionExecutionLogEntity, ActionFilterEntity, ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { MJGlobal } from "@memberjunction/global";
import { BaseAction } from "./BaseAction";
import { ActionEntityServerEntity } from "./ActionEntity.server";


export class ActionLibrary {
   LibraryName: string;
   ItemsUsed: string[];
}

/**
 * Class that is used for passing around generated code includes properties such as the code itself and a description of what the code does.
 */
export class GeneratedCode {
    /**
     * Indicates if the code generation was successful or not.  
     */
    Success: boolean;
    /**
     * The generated executable code
     */
    Code: string;
    /**
     * List of libraries and library items used in the generated code
     */
    LibrariesUsed: ActionLibrary[];
    /**
     * A description of the code used for documentation purposes
     */
    Comments: string;
    /**
     * ErrorMessage if the code generation failed
     */
    ErrorMessage?: string;
}

/**
 * Class that has the result of the individual action execution and used by the engine or other caller
 */

export class ActionResultSimple {
   /**
    * Indicates if the action was successful or not.
    */
   public Success: boolean;

   /**
    * A string that indicates the strucutred output/results of the action
    */
   public ResultCode: string;

   /**
    * Optional, additional information about the result of the action
    */
   public Message?: string;

   /**
    * All parameters including inputs and outputs are provided here for convenience
    */
   public Params?: ActionParam[];
}

/**
 * Class that has the result of a complete action execution, returned by the Run method of the ActionEngine.
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
    * All parameters including inputs and outputs are provided here for convenience
    */
   public Params?: ActionParam[];
}

/**
 * Generic class for holding parameters for an action for both inputs and outputs
 */
export class ActionParam {
   /**
    * The name of the parameter
    */
   public Name: string;
   /**
    * The value of the parameter. This can be any type of object.
    */
   public Value: any;
}

/**
 * Class that holds the parameters for an action to be run. This is passed to the Run method of an action.
 */
export class RunActionParams {
   public Action: ActionEntity;
   public ContextUser: UserInfo;
   /**
    * Optional, a list of filters that should be run before the action is executed.
    */
   public Filters: ActionFilterEntity[];
   /**
    * Optional, the input and output parameters as defined in the metadata for the action.
    */
   public Params: ActionParam[];
}


/**
 * Base class for executing actions. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class ActionEngine extends BaseEngine<ActionEngine> {
   private __coreCategoryName = '__mj';

   /**
    * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
    */
   public static get Instance(): ActionEngine {
      return super.getInstance<ActionEngine>();
   }

    private _Actions: ActionEntityServerEntity[];
    private _Filters: ActionFilterEntity[];
    private _Params: ActionParamEntity[];
    private _ActionResultCodes: ActionResultCodeEntity[];
    private _ActionLibraries: ActionLibraryEntity[];

   /**
    * This method is called to configure the ActionEngine. It loads the metadata for the actions, filters, and result codes and caches them in the GlobalObjectStore. You must call this method before running any actions.
    * If this method was previously run on the instance of the ActionEngine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
    * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
    * @param contextUser If you are running the action on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
    */
   public async Config(forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
      const config = [
         {
               EntityName: 'Actions',
               PropertyName: '_Actions'
         }, 
         {
               EntityName: 'Action Filters',
               PropertyName: '_Filters'
         }, 
         {
               EntityName: 'Action Result Codes',
               PropertyName: '_ActionResultCodes'
         },
         {
               EntityName: 'Action Params',
               PropertyName: '_Params'
         },
         {
               EntityName: 'Action Libraries',
               PropertyName: '_ActionLibraries'
         }];

      await this.Load(config, forceRefresh, contextUser);
   }

    public get Actions(): ActionEntityServerEntity[] {
      return this._Actions;
    }
    public get ActionParams(): ActionParamEntity[] {
      return this._Params;
    }
    public get ActionFilters(): ActionFilterEntity[] {
      return this._Filters;
    }
    public get ActionResultCodes(): ActionResultCodeEntity[] {
      return this._ActionResultCodes;
    }
    public get ActionLibraries(): ActionLibraryEntity[] {
      return this._ActionLibraries;
    }

    public get CoreActions(): ActionEntityServerEntity[] {
      return this._Actions.filter((a) => a.IsCoreAction);
    }
    public get NonCoreActions(): ActionEntityServerEntity[] {
      return this._Actions.filter((a) => !a.IsCoreAction);
    }

    public get CoreCategoryName(): string {
      return this.__coreCategoryName;
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
               Params: [],
               RunParams: params
            };

            result.LogEntry = await this.StartAndEndActionLog(params, result);
         }
      }
      else {
         // input validation failed
         return {
            Success: false,
            Message: "Input validation failed. This is a failure condition.",
            LogEntry: null,
            Params: [],
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
      if (params.Filters) {
         for (let filter of params.Filters) {
            if (!await this.RunSingleFilter(params, filter)) {
               return false;
            }
         }
      }
      return true; // if we get here we either had no filters or passed them all
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
      // first, let's get the right BaseAction derived sub-class for this particular action
      // using ClassFactory
      const logEntry = await this.StartActionLog(params);
      const action = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(BaseAction, params.Action.Name);
      if (!action) 
         throw new Error(`Could not find a class for action ${params.Action.Name}.`);
      
      // we now have the action class for this particular action, so run it
      const simpleResult = await action.Run(params);

      const resultCodeEntity = this.ActionResultCodes.find(r => r.ActionID === params.Action.ID && 
                                                            r.ResultCode.trim().toLowerCase() === simpleResult.ResultCode.trim().toLowerCase());
      const result: ActionResult = {
         RunParams: params,
         Success: simpleResult.Success,
         Message: simpleResult.Message,
         LogEntry: null,
         Params: simpleResult.Params,
         Result: resultCodeEntity
      };
      await this.EndActionLog(logEntry, params, result);
      result.LogEntry = logEntry;
      return result;
   }

   protected async StartActionLog(params: RunActionParams, saveRecord: boolean = true): Promise<ActionExecutionLogEntity> {
      // this is where the log entry for the action run will be created
      const md = new Metadata();
      const logEntity = await md.GetEntityObject<ActionExecutionLogEntity>('Action Execution Logs', this.ContextUser);
      logEntity.NewRecord();
      logEntity.ActionID = params.Action.ID;
      logEntity.StartedAt = new Date();
      logEntity.UserID = this.ContextUser.ID;
      logEntity.Params = JSON.stringify(params.Params); // we will save this again in the EndActionLog, this is the initial state, and the action could add/modify the params
      if (saveRecord)
         await logEntity.Save(); // initial save so we persist that the action has started, unless the saveRecord parameter tells us not to save

      return logEntity;
   }
   protected async EndActionLog(logEntity: ActionExecutionLogEntity, params: RunActionParams, result: ActionResult) {
      // this is where the log entry for the action run will be created
      logEntity.EndedAt = new Date();
      logEntity.Params = JSON.stringify(params.Params);
      logEntity.ResultCode = result.Result?.ResultCode;
      await logEntity.Save(); // save a second time to record the action ending
   }

   protected async StartAndEndActionLog(params: RunActionParams, result: ActionResult): Promise<ActionExecutionLogEntity> {
      const logEntity = await this.StartActionLog(params, false); // don't do the initial save
      await this.EndActionLog(logEntity, params, result);
      return logEntity;
   }
}

