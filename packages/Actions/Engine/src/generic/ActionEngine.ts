import { LogError, Metadata } from "@memberjunction/core";
import { MJActionExecutionLogEntity, MJActionFilterEntity, MJActionParamEntity, MJActionResultCodeEntity } from "@memberjunction/core-entities";
import { MJGlobal, SafeJSONParse, UUIDsEqual } from "@memberjunction/global";
import { BaseAction } from "./BaseAction";
import { ActionEngineBase, MJActionEntityExtended, ActionParam, ActionResult, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RuntimeActionExecutor } from "@memberjunction/action-runtime";

 

/**
 * Base class for executing actions. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class ActionEngineServer extends ActionEngineBase {


   public static get Instance(): ActionEngineServer {
      return super.getInstance<ActionEngineServer>();
   }

   /**
    * Engine-default wall-clock timeout applied to any action whose
    * `MaxExecutionTimeMS` is NULL. Intentionally generous (2 hours) because
    * some integration actions do legitimately long sync work; per-action
    * overrides should be used to tighten this for anything agent-facing.
    * Sub-classes can override to globally change the default.
    */
   protected get DefaultActionTimeoutMS(): number {
      return 2 * 60 * 60 * 1000;
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

      return await this.RunActionWithTimeout(params);
   }

   /**
    * Wraps `InternalRunAction()` with a universal wall-clock timeout
    * (`Action.MaxExecutionTimeMS`, falling back to `DefaultActionTimeoutMS`)
    * and an `AbortSignal` passed to the action via `params.AbortSignal`.
    *
    * Enforcement is cooperative: when the timeout fires we set an abort on
    * the signal so in-flight `fetch`/`setTimeout`/custom polling logic can
    * short-circuit, and we race the action against a rejection that surfaces
    * a `TIMEOUT` result. If the caller already supplied an `AbortSignal`
    * (e.g. when being run from a Runtime-action bridge that has its own
    * abort), we chain to it so either source can trigger cancellation.
    */
   protected async RunActionWithTimeout(params: RunActionParams): Promise<ActionResult> {
      const actionTimeoutMS = params.Action.MaxExecutionTimeMS ?? this.DefaultActionTimeoutMS;

      // Chain with any upstream AbortSignal (e.g. Runtime-action bridge).
      const controller = new AbortController();
      const externalSignal = params.AbortSignal;
      const relayExternalAbort = () => {
         if (!controller.signal.aborted) {
            controller.abort(externalSignal?.reason ?? 'upstream abort');
         }
      };
      if (externalSignal) {
         if (externalSignal.aborted) {
            relayExternalAbort();
         } else {
            externalSignal.addEventListener('abort', relayExternalAbort, { once: true });
         }
      }

      // Wall-clock timeout.
      const timeoutId = setTimeout(() => {
         if (!controller.signal.aborted) {
            controller.abort(`Action '${params.Action.Name}' exceeded MaxExecutionTimeMS (${actionTimeoutMS}ms)`);
         }
      }, actionTimeoutMS);

      // Assign the chained signal onto params so BaseAction subclasses can poll it.
      const previousSignal = params.AbortSignal;
      params.AbortSignal = controller.signal;

      try {
         const timeoutPromise = new Promise<ActionResult>((_resolve, reject) => {
            controller.signal.addEventListener(
               'abort',
               () => {
                  reject(new Error(String(controller.signal.reason ?? 'aborted')));
               },
               { once: true }
            );
         });

         try {
            return await Promise.race([this.InternalRunAction(params), timeoutPromise]);
         } catch (err) {
            // Timeout or upstream abort — return a standard TIMEOUT result.
            // Result is left undefined (we don't guarantee a 'TIMEOUT' ActionResultCode
            // exists on every action; the Success flag + Message are the canonical
            // failure signal for timeouts).
            if (controller.signal.aborted) {
               const message =
                  typeof controller.signal.reason === 'string'
                     ? controller.signal.reason
                     : `Action '${params.Action.Name}' was aborted`;
               const timeoutResult: ActionResult = {
                  Success: false,
                  Message: message,
                  LogEntry: null,
                  Params: params.Params,
                  RunParams: params,
                  Result: undefined
               };
               if (!params.SkipActionLog) {
                  timeoutResult.LogEntry = await this.StartAndEndActionLog(params, timeoutResult);
               }
               return timeoutResult;
            }
            // Real runtime error unrelated to abort — rethrow so upstream handling catches it.
            throw err;
         }
      } finally {
         clearTimeout(timeoutId);
         if (externalSignal) {
            externalSignal.removeEventListener('abort', relayExternalAbort);
         }
         // Restore whatever AbortSignal the caller had in place so we don't leak our own.
         params.AbortSignal = previousSignal;
      }
   }
   

   protected GetActionParamsForAction(action: MJActionEntityExtended): ActionParam[] {
      const params: ActionParam[] = action.Params.map((param: MJActionParamEntity) => {
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
    * 
    * @param filter 
    */
   protected async RunSingleFilter(params: RunActionParams, filter: MJActionFilterEntity): Promise<boolean> {
      return true;
      // temp stub above, replace with code that will run the filter      
   }

   protected async InternalRunAction(params: RunActionParams): Promise<ActionResult> {
      let logEntry: MJActionExecutionLogEntity | undefined;
      if(!params.SkipActionLog){
         logEntry = await this.StartActionLog(params);
      }

      try {
         // Branch by Action.Type. Runtime actions go through the sandboxed
         // RuntimeActionExecutor; Custom / Generated (and legacy rows where
         // Type may be null) flow through the existing ClassFactory path.
         const simpleResult: ActionResultSimple =
            params.Action.Type === 'Runtime'
               ? await this.RunRuntimeAction(params)
               : await this.RunClassBasedAction(params);

         const resultCodeEntity: MJActionResultCodeEntity | undefined = this.ActionResultCodes.find(r => UUIDsEqual(r.ActionID, params.Action.ID) &&
                                                               r.ResultCode.trim().toLowerCase() === simpleResult.ResultCode.trim().toLowerCase());
         const result: ActionResult = {
            RunParams: params,
            Success: simpleResult.Success,
            Message: simpleResult.Message,
            AIDirectives: simpleResult.AIDirectives,
            LogEntry: logEntry,
            Params: simpleResult.Params || params.Params,
            Result: resultCodeEntity
         };

         if(logEntry){
            await this.EndActionLog(logEntry, params, result);
         }

         return result;
      }
      catch (e) {
         // if we get here, something went wrong in the action code
         LogError(`Error running action ${params.Action.Name}:`, e);
         const result: ActionResult = {
            RunParams: params,
            Success: false,
            Message: `Error running action ${params.Action.Name}: ${e.message}`,
            LogEntry: logEntry,
            Params: params.Params,
            Result: undefined
         };

         if(logEntry){
            await this.EndActionLog(logEntry, params, result);
         }

         return result;
      }
   }

   /**
    * Resolves and runs a Custom / Generated action via the ClassFactory.
    * This is the pre-existing path — factored out of `InternalRunAction` so
    * the Type dispatch is readable.
    */
   protected async RunClassBasedAction(params: RunActionParams): Promise<ActionResultSimple> {
      const action = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(
         BaseAction,
         params.Action.DriverClass || params.Action.Name,
         params.ContextUser
      );
      if (!action || action.constructor === BaseAction) {
         throw new Error(`Could not find a class for action ${params.Action.Name}.`);
      }
      return await action.Run(params);
   }

   /**
    * Runs an `Action.Type='Runtime'` action by delegating to the sandboxed
    * RuntimeActionExecutor. Approval / Status / Code-presence checks are
    * enforced inside the executor; here we just wire the plumbing and
    * translate the executor's result shape into the `ActionResultSimple`
    * shape that the rest of `InternalRunAction` expects.
    */
   protected async RunRuntimeAction(params: RunActionParams): Promise<ActionResultSimple> {
      const execResult = await RuntimeActionExecutor.Instance.execute({
         action: params.Action,
         params: params.Params ?? [],
         contextUser: params.ContextUser,
         abortSignal: params.AbortSignal
      });

      return {
         Success: execResult.success,
         ResultCode: execResult.resultCode,
         Message: execResult.message,
         Params: execResult.params
      };
   }

   protected async StartActionLog(params: RunActionParams, saveRecord: boolean = true): Promise<MJActionExecutionLogEntity> {
      // this is where the log entry for the action run will be created
      const md = new Metadata();
      const logEntity = await md.GetEntityObject<MJActionExecutionLogEntity>('MJ: Action Execution Logs', this.ContextUser);
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
   protected async EndActionLog(logEntity: MJActionExecutionLogEntity, params: RunActionParams, result: ActionResult) {
      // this is where the log entry for the action run will be created
      logEntity.EndedAt = new Date();
      logEntity.Params = JSON.stringify(params.Params);
      logEntity.ResultCode = result.Result?.ResultCode;
      logEntity.Message = result.Message;
      
      // save a second time to record the action ending
      const saveResult: boolean = await logEntity.Save();
      if(!saveResult){
         LogError(`Failed to record end of action ${params.Action.Name}:`, undefined, logEntity.LatestResult);
      }
   }

   protected async StartAndEndActionLog(params: RunActionParams, result: ActionResult): Promise<MJActionExecutionLogEntity> {
      // don't do the initial save
      const logEntity: MJActionExecutionLogEntity = await this.StartActionLog(params, false); 
      await this.EndActionLog(logEntity, params, result);
      return logEntity;
   }
}

