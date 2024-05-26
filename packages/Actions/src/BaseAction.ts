import { ActionEntity, ActionExecutionLogEntity, ActionFilterEntity } from "@memberjunction/core-entities";
import { ActionResult, RunActionParams } from "./ActionEngine";
 
/**
 * Base class for all actions. All actions will derive from this class and be instantiated by the ClassFactory within the @memberjunctin/global package.
 */
export abstract class BaseAction {
   public async Run(params: RunActionParams): Promise<ActionResult> {
      return await this.InternalRunAction(params);
   }      
 
   protected async InternalRunAction(params: RunActionParams): Promise<ActionResult> {
      // this is where the actual action code will be implemented
      return {
         Success: true,
         Result: null, // To Do: Implement this
         Message: "This action has not been implemented yet.",
         LogEntry: null,
         Outputs: [],
         RunParams: null
      };
   }
}