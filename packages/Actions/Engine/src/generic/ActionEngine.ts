import { LogError, Metadata, UserInfo } from "@memberjunction/core";
import { ActionEntity, ActionExecutionLogEntity, ActionFilterEntity, UserNotificationEntity } from "@memberjunction/core-entities";
import { MJGlobal } from "@memberjunction/global";
import { BaseAction } from "./BaseAction";
import { ActionEngineBase, ActionResult, RunActionParams } from "@memberjunction/actions-base";

 

/**
 * Base class for executing actions. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class ActionEngineServer extends ActionEngineBase {

   public static get Instance(): ActionEngineServer {
      return <ActionEngineServer>super.Instance;
   }

    public async RunAction(params: RunActionParams): Promise<ActionResult> {
      const validInputs: boolean = await this.ValidateInputs(params);
      if(!validInputs) {
         const errorMessage: string = `Unable to run Action ${params.Action.Name}: Input validation failed.`;
         if(params.NotifyUserWhenComplete){
            await this.NotifyUserOfActionRun({Success: false, ErrorMessage: errorMessage}, params.Action, this.ContextUser);
         }

         return {
            Success: false,
            Message: errorMessage,
            LogEntry: null,
            Params: [],
            RunParams: params
         };
      }

      const canRun: boolean = await this.RunFilters(params);
      if(!canRun){
         const errorMessage: string = `Unable to run Action ${params.Action.Name}: Filters were run and the result indicated this action should not be executed. This is a Success condition as filters returning false is not considered an error.`;

         if(params.NotifyUserWhenComplete){
            await this.NotifyUserOfActionRun({Success: false, ErrorMessage: errorMessage}, params.Action, this.ContextUser);
         }

         const filterFailResult =  {
            Success: false,
            Message: errorMessage,
            LogEntry: null,
            Params: [],
            RunParams: params
         };

         filterFailResult.LogEntry = await this.StartAndEndActionLog(params, filterFailResult);
      }

      const runResult: ActionResult = await this.InternalRunAction(params);
      if(params.NotifyUserWhenComplete){
         await this.NotifyUserOfActionRun({Success: runResult.Success, ErrorMessage: runResult.Message}, params.Action, this.ContextUser);
      }

      return runResult;
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
      if (!action){
         throw new Error(`Could not find a class for action ${params.Action.Name}.`);
      }
      
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
      if (saveRecord){
         await logEntity.Save(); // initial save so we persist that the action has started, unless the saveRecord parameter tells us not to save
      }

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

   protected async NotifyUserOfActionRun(result: {Success: boolean, ErrorMessage?: string}, action: ActionEntity, contextUser: UserInfo): Promise<void> {
      const md: Metadata = new Metadata();
      const notificationEntity = await md.GetEntityObject<UserNotificationEntity>("User Notifications", contextUser);
      notificationEntity.UserID = contextUser.ID;
      notificationEntity.Title = result.Success ? `Action ${action?.Name} Completed Successfully` : `Action ${action?.Name} Failed`;
      notificationEntity.Message = result.ErrorMessage ? `An error occured while running the Action: ${result.ErrorMessage}` : `Good News! The Action completed successfully`;

      const saveResult = await notificationEntity.Save();
      if(!saveResult){
          LogError(`Failed to save notification for Action ${action?.Name} for user ${contextUser.Email}:`, undefined, notificationEntity.LatestResult);
      }
   }
}

