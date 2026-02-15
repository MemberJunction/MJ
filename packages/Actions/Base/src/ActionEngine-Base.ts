import { BaseEngine, IMetadataProvider, UserInfo, RunView, BaseEnginePropertyConfig } from "@memberjunction/core";
import { MJActionCategoryEntity, MJActionEntity, MJActionExecutionLogEntity, MJActionFilterEntity, MJActionLibraryEntity, MJActionParamEntity, MJActionResultCodeEntity } from "@memberjunction/core-entities";
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
    * A code that indicates the outcome of the action. Will be one of the possible ResultCodes enumerated in the MJActionResultCodeEntity
    */
   public Result?: MJActionResultCodeEntity;

   /**
    * Whenever an action is executed a log entry is created. This log entry is stored in the database and can be used to track the execution of the action. This property contains the log entry object for the action that was run.
    */
   public LogEntry?: MJActionExecutionLogEntity;

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
 * 
 * @template TContext - Type of the context object passed to the action execution.
 *                      This allows for type-safe context propagation from agents to actions.
 *                      Defaults to any for backward compatibility.
 * 
 * @example
 * ```typescript
 * // Define a typed context
 * interface MyActionContext {
 *   apiEndpoint: string;
 *   apiKey: string;
 *   environment: 'dev' | 'staging' | 'prod';
 * }
 * 
 * // Use with type safety
 * const params = new RunActionParams<MyActionContext>();
 * params.Action = myAction;
 * params.ContextUser = currentUser;
 * params.Context = {
 *   apiEndpoint: 'https://api.example.com',
 *   apiKey: process.env.API_KEY,
 *   environment: 'prod'
 * };
 * ```
 */
export class RunActionParams<TContext = any> {
   /**
    * The action entity to be run.
    */
   public Action: MJActionEntity;

   /**
    * The user context for the action.
    */
   public ContextUser: UserInfo;
   /**
    * Optional, if true, an MJActionExecutionLogEntity will not be created for this action run.
    */
   public SkipActionLog?: boolean;
   /**
    * Optional, a list of filters that should be run before the action is executed.
    */
   public Filters: MJActionFilterEntity[];
   /**
    * Optional, the input and output parameters as defined in the metadata for the action.
    */
   public Params: ActionParam[];

   /**
    * Optional context object that provides runtime-specific information to the action.
    * This context is separate from the action parameters and is not stored in the database.
    * 
    * Common use cases include:
    * - Environment-specific configuration (API endpoints, service URLs)
    * - Runtime credentials or authentication tokens
    * - User preferences or session information
    * - Feature flags or toggles
    * - Request-specific correlation IDs
    * 
    * The context flows from agents to actions, maintaining consistency throughout
    * the execution hierarchy. Actions can use this context to adapt their behavior
    * based on runtime conditions without modifying their core parameter structure.
    * 
    * Note: Avoid including sensitive data like passwords unless absolutely necessary,
    * as context may be passed through multiple execution layers.
    */
   public Context?: TContext;
};
 

/**
 * Base class for Action metadata. 
 */
export class ActionEngineBase extends BaseEngine<ActionEngineBase> {
   private __coreRootCategoryID = '15E03732-607E-4125-86F4-8C846EE88749'; // UUID within MJ forever for the ROOT category of System Actions

   /**
    * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
    */
   public static get Instance(): ActionEngineBase {
      return super.getInstance<ActionEngineBase>("ActionEngineBase");
   }

    private _Actions: ActionEntityExtended[];
    private _ActionCategories: MJActionCategoryEntity[];
    private _Filters: MJActionFilterEntity[];
    private _Params: MJActionParamEntity[];
    private _ActionResultCodes: MJActionResultCodeEntity[];
    private _ActionLibraries: MJActionLibraryEntity[];

   /**
    * This method is called to configure the ActionEngine. It loads the metadata for the actions, filters, and result codes and caches them in the GlobalObjectStore. You must call this method before running any actions.
    * If this method was previously run on the instance of the ActionEngine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
    * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
    * @param contextUser If you are running the action on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
    */
   public async Config(forceRefresh: boolean = false, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
      const config: Array<Partial<BaseEnginePropertyConfig>> = [
         {
               EntityName: 'MJ: Actions',
               PropertyName: '_Actions',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Categories',
               PropertyName: '_ActionCategories',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Filters',
               PropertyName: '_Filters',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Result Codes',
               PropertyName: '_ActionResultCodes',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Params',
               PropertyName: '_Params',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Libraries',
               PropertyName: '_ActionLibraries',
               CacheLocal: true
         }];

      await this.Load(config, provider, forceRefresh, contextUser);
   }

   /**
    * Override to ensure all action metadata is loaded without MaxRows limits.
    * Action Params can have many records (1000+), so we need to ignore the entity's UserViewMaxRows setting.
    */
   protected override async LoadMultipleEntityConfigs(configs: any[], contextUser: any): Promise<void> {
      if (configs && configs.length > 0) {
         const p = this.RunViewProviderToUse;
         const rv = new RunView(p);
         const viewConfigs = configs.map(c => {
            return {
               EntityName: c.EntityName,
               ResultType: 'entity_object' as const,
               ExtraFilter: c.Filter,
               OrderBy: c.OrderBy,
               IgnoreMaxRows: true  // CRITICAL: Ignore UserViewMaxRows to load all records
            };
         });
         const results = await rv.RunViews(viewConfigs, contextUser);
         // now loop through the results and process them
         for (let i = 0; i < configs.length; i++) {
            this.HandleSingleViewResult(configs[i], results[i]);
         }
      }
   }

    public get Actions(): ActionEntityExtended[] {
      return this._Actions;
    }
    public get ActionCategories(): MJActionCategoryEntity[] {
      return this._ActionCategories;
    }
    public get ActionParams(): MJActionParamEntity[] {
      return this._Params;
    }
    public get ActionFilters(): MJActionFilterEntity[] {
      return this._Filters;
    }
    public get ActionResultCodes(): MJActionResultCodeEntity[] {
      return this._ActionResultCodes;
    }
    public get ActionLibraries(): MJActionLibraryEntity[] {
      return this._ActionLibraries;
    }

    /**
     * Returns a list of all core actions.
     */
    public get CoreActions(): ActionEntityExtended[] {
      return this._Actions.filter((a) => this.IsCoreAction(a));
    }
    /**
     * Returns a list of all non-core actions.
     */
    public get NonCoreActions(): ActionEntityExtended[] {
      return this._Actions.filter((a) => !this.IsCoreAction(a));
    }

   /**
    * Returns the root category ID for core actions.
    */
   public get CoreActionsRootCategoryID(): string {
      return this.__coreRootCategoryID;
   }

   /**
    * Utility method that determines if a given Action Category ID is a child of the specified parent category ID.
    * @param categoryId - The ID of the category to check.
    * @param parentCategoryId - The ID of the parent category to check against.
    * @returns True if the categoryId is a child of the parentCategoryId, false otherwise.
    */
   public IsChildCategoryOf(categoryId: string, parentCategoryId: string): boolean {
      if (!categoryId || !parentCategoryId) {
         return false;
      }
      if (categoryId.trim().toLowerCase() === parentCategoryId.trim().toLowerCase()) {
         return true;
      }
      const category = this._ActionCategories.find(c => c.ID.trim().toLowerCase() === categoryId.trim().toLowerCase());
      if (!category) {
         return false;
      }
      // Check if the parent ID matches the parentCategoryId or if it is a child of the parentCategoryId
      if (category.ParentID?.trim().toLowerCase() === parentCategoryId.trim().toLowerCase()) {
         return true;
      }
      // If the parent ID is not the parentCategoryId, recursively check the parent category
      return this.IsChildCategoryOf(category.ParentID, parentCategoryId);
   }

   /**
    * Checks if the specified action is a core action by checking if its category is a child of the core actions root category.
    * @param action - The action entity to check.
    * @returns True if the action is a core action, false otherwise.
    */
   public IsCoreAction(action: ActionEntityExtended): boolean {
      if (!action) {
         return false;
      }
      return this.IsChildCategoryOf(action.CategoryID, this.CoreActionsRootCategoryID);
   }

   /**
    * Checks if the specified category ID is a core action category at any level, using recursion to check the entire hierarchy.
    * @param categoryId 
    * @returns 
    */
   public IsCoreActionCategory(categoryId: string): boolean {
      if (!categoryId) {
         return false;
      }
      return this.IsChildCategoryOf(categoryId, this.CoreActionsRootCategoryID);
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
    * 
    * @template TContext - Type of the context object in RunActionParams
    */
   protected async ValidateInputs<TContext = any>(params: RunActionParams<TContext>): Promise<boolean> {
      return true;
   }
}

