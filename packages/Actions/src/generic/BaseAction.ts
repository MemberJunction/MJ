import { ActionEntity, ActionExecutionLogEntity, ActionFilterEntity } from "@memberjunction/core-entities";
import { ActionResult, ActionResultSimple, RunActionParams } from "./ActionEngine";
 
/**
 * Base class for all actions. All actions will derive from this class and be instantiated by the ClassFactory within the @memberjunctin/global package.
 */
export abstract class BaseAction {
   public async Run(params: RunActionParams): Promise<ActionResultSimple> {
      return await this.InternalRunAction(params);
   }      
 
   protected abstract InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> 
}