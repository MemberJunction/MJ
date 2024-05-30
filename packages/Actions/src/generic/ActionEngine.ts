import { LogError, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { ActionEntity, ActionExecutionLogEntity, ActionFilterEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { BaseSingleton, MJGlobal } from "@memberjunction/global";
import { BaseAction } from "./BaseAction";
import { ActionEntityServerEntity } from "./ActionEntity.server";
import { BehaviorSubject } from "rxjs";



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
     * A description of the code used for documentation purposes
     */
    Comments: string;
    /**
     * ErrorMessage if the code generation failed
     */
    ErrorMessage?: string;
}

/**
 * Library definition for use in code generation
 */
export class ActionAvailableLibrary {
    /**
     * Name of the library, and the name that will be used to import the library in the generated code unless ImportAs is specified.
     */
    public Name: string;
    /**
     * If specified, the library will be imported as this alias instead of the Name
     */
    public ImportAs?: string;
    /**
     * List of the items (classes, consts, functions, interfaces, etc) that are to be imported from the specified library
     */
    public ImportedItems: string[];
    /**
     * Description of the library and what it is used for
     */
    public Description: string;
    /**
     * Example Code that can be provided to the LLM to guide its code generation process
     */
    public ExampleCode?: string;
}

/**
 * List of libraries that are available for all actions. Whenever the CodeGen tool generates a new action it will include these libraries in the generated code.
 */
export const GlobalActionLibraries: ActionAvailableLibrary[] = [
    {
        Name: '@memberjunction/core',
        Description: 'This library contains the core functionality for the MemberJunction platform.',
        ImportedItems: ['RunView', 'UserInfo', 'BaseEntity', 'Metadata'],
        ExampleCode: `
            import { Metadata, RunView, UserInfo } from '@memberjunction/core';

            // This function is a demo. You will have access to a local set of parameters that are the same as the params to this sample function.
            // Only generate the code that goes INSIDE the function, I will generate the function signature and insert your code inside it.
            function sample(contextUser: UserInfo) {
                // first get a metadata object 
                const md = new Metadata();

                // when we need to get data from a particular entity we have two options, we can get a single record with 
                // md.GetEntityObject, which returns a single BaseEntity derived object, which we can then call .Load() on.
                // Alternatively, if we want multiple rows from a given entity, we can use RunView and get back either 
                // simple objects or an array of BaseEntity derived objects.

                // Example 1: Get a single record
                const demoAccountRecord = await md.GetEntityObject('Demo Accounts', contextUser); // IMPORTANT: Pass in entity names WITHOUT modification, for example if an entity name a user is referring to has spaces or other special characters, INCLUDE them when referring to entity names.
                const key = new CompositeKey([{Name: 'ID', Value: 1234}]); // create a composite key with an array of KeyValuePair objects
                await demoAccountRecord.InnerLoad(key); // generic way of doing loading when you get back the BaseEntity level reference.
                // now you have the accountRecord object loaded with the data from the database. BaseEntity supports direct field level binding where you can do things as shown below
                accountRecord.Name = 'New Name';
                await accountRecord.Save(); // saves the record back to the database

                // Example 2: Get multiple records with RunView
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: 'Demo Accounts', // IMPORTANT: Pass in entity names WITHOUT modification, for example if an entity name a user is referring to has spaces or other special characters, INCLUDE them when referring to entity names.
                    ResultType: 'entity_object' // alternative would be ResultType: 'simple_object' if you don't need the BaseEntity derived object it is faster/lighter weight to use simple objects. If you later need to edit the data use entity_object.
                }, contextUser);

                // The result object now has a RunViewResult object which has a Success boolean on it and also a Results property which is an array of BaseEntity derived objects.
                // When you use each BaseEntity object in this array, let it be "any" so that you can access the properties that are part of subclasses of BaseEntity but will fail
                // if you use the BaseEntity directly. BaseEntity doesn't have properties for each column of a given entity because it is generic, but the actual class instances returned
                // will ALWAYS be from a sub-class of BaseEntity where the columns of the table are generated into strongly typed getter/setter properties you can use in your code if you just use Results as it is
                // Also, you do NOT need to call .Load() on these objects as that has already been done for you via the RunView call.
            }
        `
    },
];

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
export class ActionEngine extends BaseSingleton<ActionEngine> {
   private __coreCategoryName = '__mj';

    // implement a singleton pattern for caching metadata. All uses of the ActionEngine will first call Config() to get started which is an async method. This method will load the metadata and cache it in a variable wtihin the "GlobalObjectStore"
    // which is an MJ utility that is available to all packages. This will allow the metadata to be loaded once and then used by all instances of the ActionEngine. This is important because the metadata is not expected to change.
    private constructor() {
      super('MJ_Action_Metadata');
   }

   /**
    * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
    */
   public static get Instance(): ActionEngine {
      return super.getInstance<ActionEngine>('MJ_Action_Metadata');
   }

 
    // internal instance properties used for the singleton pattern
    private _loaded: boolean = false;
    private _loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

    private _Actions: ActionEntityServerEntity[];
    private _Filters: ActionFilterEntity[];
    private _Params: ActionParamEntity[];
    private _ActionResultCodes: ActionResultCodeEntity[];
    private _contextUser: UserInfo;

    /**
     * This method is called to configure the ActionEngine. It loads the metadata for the actions, filters, and result codes and caches them in the GlobalObjectStore. You must call this method before running any actions.
     * If this method was previously run on the instance of the ActionEngine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
     * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
     * @param contextUser If you are running the action on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
     */
    public async Config(forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
        // make sure we don't do this more than once while the first call is still going on
        if (this._loadingSubject.value && !forceRefresh) {
            return new Promise<void>((resolve) => {
               const subscription = this._loadingSubject.subscribe((loading) => {
                  if (!loading) {
                        subscription.unsubscribe();
                        resolve();
                  }
               });
            });
        }

        if (!this._loaded || forceRefresh) {
            this._loadingSubject.next(true);
            this._contextUser = contextUser;

            // Load all actions
            const rv = new RunView();
            try {
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

               const params = await rv.RunView({
               EntityName: 'Action Params',
               ResultType: 'entity_object'
               }, contextUser);
               if (resultCodes.Success) {
               this._Params = params.Results;
               }

               this._loaded = true;
            }
            catch (e) {
               LogError(e);
            }
            finally {
                this._loadingSubject.next(false);
            }
        }
        else {
            // we have already loaded and have not been told to force the refresh
        }
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

    public get CoreActions(): ActionEntity[] {
      return this._Actions.filter((a) => a.IsCoreAction);
    }
    public get NonCoreActions(): ActionEntity[] {
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

            result.LogEntry = await this.LogActionRun(params, result);
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
      const logResult = await this.LogActionRun(params, result);
      result.LogEntry = logResult;
      return result;
   }

   protected async LogActionRun(params: RunActionParams, result: ActionResult): Promise<ActionExecutionLogEntity> {
      // this is where the log entry for the action run will be created
      const md = new Metadata();
      const logEntity = await md.GetEntityObject<ActionExecutionLogEntity>('Action Execution Logs', this._contextUser);
      logEntity.NewRecord();
      logEntity.ActionID = params.Action.ID;
      
      return null;
   }
}

