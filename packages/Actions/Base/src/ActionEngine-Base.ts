import { BaseEngine, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { ActionEntity, ActionExecutionLogEntity, ActionFilterEntity, ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { ActionEntityExtended } from "./ActionEntity-Extended";


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
    * All parameters including inputs and outputs are provided here for convenience
    */
   public Params?: ActionParam[];

   /**
    * Optional, additional information about the result of the action
    */
   public Message?: string;
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
 * Runtime parameter class that is used to pass key/value pairs in arrays to/from the action engine.  
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
   /**
    * The type of the Action parameter. Input parameters are used to pass data into the action while output parameters are used to return data from the action.
    */
   public Type: 'Input' | 'Output' | 'Both';
}

/**
 * Class that holds the parameters for an action to be run. This is passed to the Run method of an action.
 */
export class RunActionParams {
   /**
    * The action entity to be run.
    */
   public Action: ActionEntity;

   /**
    * The user context for the action.
    */
   public ContextUser: UserInfo;
   /**
    * Optional, if true, an ActionExecutionLogEntity will not be created for this action run.
    */
   public SkipActionLog?: boolean;
   /**
    * Optional, a list of filters that should be run before the action is executed.
    */
   public Filters: ActionFilterEntity[];
   /**
    * Optional, the input and output parameters as defined in the metadata for the action.
    */
   public Params: ActionParam[];

   /**
    * Optional, a context object of any type that can be used to pass 
    * additional information to the action. This is not part of the 
    * parameters and is not stored in the database. Often this is used
    * for environmental or runtime/user specific information that is not
    * part of the metadata.
    */
   public Context?: any;
};
 

/**
 * Base class for Action metadata. 
 */
export class ActionEngineBase extends BaseEngine<ActionEngineBase> {
   private __coreCategoryName = '__mj';

   /**
    * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
    */
   public static get Instance(): ActionEngineBase {
      return super.getInstance<ActionEngineBase>("ActionEngineBase");
   }

    private _Actions: ActionEntityExtended[];
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
   public async Config(forceRefresh: boolean = false, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
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

      await this.Load(config, provider, forceRefresh, contextUser);
   }

    public get Actions(): ActionEntityExtended[] {
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

    public get CoreActions(): ActionEntityExtended[] {
      return this._Actions.filter((a) => a.IsCoreAction);
    }
    public get NonCoreActions(): ActionEntityExtended[] {
      return this._Actions.filter((a) => !a.IsCoreAction);
    }

    public get CoreCategoryName(): string {
      return this.__coreCategoryName;
    }
     
   /**
    * Returns an action based on its name
    * @param actionName 
    * @returns 
    */
   public GetActionByName(actionName: string): ActionEntityExtended | undefined {
      if (!actionName || actionName.trim().length === 0) {
         throw new Error("Action name cannot be null or empty.");
      }
      return this.Actions.find(a => a.Name.trim().toLowerCase() === actionName.trim().toLowerCase());
   }

   /**
    * This method handles input validation. Subclasses can override this method to provide custom input validation.
    */
   protected async ValidateInputs(params: RunActionParams): Promise<boolean> {
      return true;
   }
}

