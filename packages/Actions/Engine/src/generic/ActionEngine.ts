import { BaseEngine, LogError, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { ActionEntity, ActionExecutionLogEntity, ActionFilterEntity, ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { MJGlobal, SafeJSONParse } from "@memberjunction/global";
import { BaseAction } from "./BaseAction";
import { ActionEntityServerEntity } from "./ActionEntity.server";
import { ActionEngineBase, ActionEntityExtended, ActionParam, ActionResult, ActionResultSimple, RunActionByNameParams, RunActionParams } from "@memberjunction/actions-base";

 

/**
 * Base class for executing actions. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class ActionEngineServer extends ActionEngineBase {

   public static get Instance(): ActionEngineServer {
      return super.getInstance<ActionEngineServer>("ActionEngineServer");
   }

   public async RunAction(params: RunActionParams): Promise<ActionResult> {
      const validInputs: boolean = await this.ValidateInputs(params);
      if(!validInputs){
         const result: ActionResult = {
            Success: false,
            Message: "Input validation failed. This is a failure condition.",
            LogEntry: null,
            Params: params.Params,
            RunParams: params
         };

         if(!params.SkipActionLog){
            result.LogEntry = await this.StartAndEndActionLog(params, result);
         }

         return result;
      }

      const filtersPassed: boolean = await this.RunFilters(params);
      if(!filtersPassed){
         // filters indicated we should NOT run this action
         const result: ActionResult = {
            Success: true,
            Message: "Filters were run and the result indicated this action should not be executed. This is a Success condition as filters returning false is not considered an error.",
            LogEntry: null, // initially null
            Params: params.Params,
            RunParams: params
         };

         if(!params.SkipActionLog){
            result.LogEntry = await this.StartAndEndActionLog(params, result);
         }
      }

      const runActionResult = await this.InternalRunAction(params);
      return runActionResult;
   }
   
   protected async RunActionByName(params: RunActionByNameParams): Promise<ActionResult> {
      const nameToLower: string = params.ActionName.trim().toLowerCase();
      const action: ActionEntityExtended | undefined = this.Actions.find(a => a.Name.trim().toLowerCase() === nameToLower);
      if(!action){
         throw new Error(`Action with name ${params.ActionName} not found in Metadata`);
      }

      const runParams: RunActionParams = {
         Action: action,
         ContextUser: params.ContextUser,
         Filters: [],
         Params: this.GetActionParamsForAction(action),
      };

      const actionResult = await this.RunAction(runParams);
      return actionResult;
   }

   protected GetActionParamsForAction(action: ActionEntityExtended): ActionParam[] {
      const params: ActionParam[] = action.Params.map((param: ActionParamEntity) => {
         let value: any = null;
         switch (param.ValueType) {
            case 'Scalar':
               value = param.DefaultValue;
               break;
            case 'Simple Object':
               const jsonValue = SafeJSONParse(param.DefaultValue);
               if (jsonValue){
                  value = jsonValue;
               }
               else{
                  value = param.DefaultValue;
               }
               break;
            case 'BaseEntity Sub-Class':
            case 'Other':
               value = param.DefaultValue;
               break;
            default:
               LogError(`Unknown ValueType ${param.ValueType} for param ${param.Name} in action ${action.Name}`);
               value = param.DefaultValue;
               break;

         }

         return {
            Name: param.Name,
            Value: value,
            Type: param.Type
         }
      });

      return params;
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
      let logEntry: ActionExecutionLogEntity | undefined;
      if(!params.SkipActionLog){
         logEntry = await this.StartActionLog(params);
      }

      const action = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(BaseAction, params.Action.Name);
      if (!action || action.constructor === BaseAction) {
         throw new Error(`Could not find a class for action ${params.Action.Name}.`);
      }
      
      // we now have the action class for this particular action, so run it
      const simpleResult: ActionResultSimple = await action.Run(params);

      const resultCodeEntity: ActionResultCodeEntity | undefined = this.ActionResultCodes.find(r => r.ActionID === params.Action.ID && 
                                                            r.ResultCode.trim().toLowerCase() === simpleResult.ResultCode.trim().toLowerCase());
      const result: ActionResult = {
         RunParams: params,
         Success: simpleResult.Success,
         Message: simpleResult.Message,
         LogEntry: logEntry,
         Params: simpleResult.Params,
         Result: resultCodeEntity
      };

      if(logEntry){
         await this.EndActionLog(logEntry, params, result);
      }

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
      // we will save this again in the EndActionLog, this is the initial state, and the action could add/modify the params
      logEntity.Params = JSON.stringify(params.Params);
      
      if (saveRecord){
         // initial save so we persist that the action has started, unless the saveRecord parameter tells us not to save
         const saveResult: boolean = await logEntity.Save();
         if(!saveResult){
            LogError(`Failed to record start of action ${params.Action.Name}:`, undefined, logEntity.LatestResult);
         }
      }

      return logEntity;
   }
   protected async EndActionLog(logEntity: ActionExecutionLogEntity, params: RunActionParams, result: ActionResult) {
      // this is where the log entry for the action run will be created
      logEntity.EndedAt = new Date();
      logEntity.Params = JSON.stringify(params.Params);
      logEntity.ResultCode = result.Result?.ResultCode;
      
      // save a second time to record the action ending
      const saveResult: boolean = await logEntity.Save();
      if(!saveResult){
         LogError(`Failed to record end of action ${params.Action.Name}:`, undefined, logEntity.LatestResult);
      }
   }

   protected async StartAndEndActionLog(params: RunActionParams, result: ActionResult): Promise<ActionExecutionLogEntity> {
      // don't do the initial save
      const logEntity: ActionExecutionLogEntity = await this.StartActionLog(params, false); 
      await this.EndActionLog(logEntity, params, result);
      return logEntity;
   }
}

