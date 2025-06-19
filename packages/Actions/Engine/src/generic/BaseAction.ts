import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
 
/**
 * Base class for all actions. All actions will derive from this class and be instantiated by the ClassFactory within the @memberjunctin/global package.
 * 
 * @example
 * ```typescript
 * // Define a typed context
 * interface MyActionContext {
 *   apiEndpoint: string;
 *   authToken: string;
 * }
 * 
 * // Create an action with typed params
 * export class MyAction extends BaseAction {
 *   protected async InternalRunAction(params: RunActionParams<MyActionContext>): Promise<ActionResultSimple> {
 *     // Access typed context
 *     const endpoint = params.Context?.apiEndpoint;
 *     const token = params.Context?.authToken;
 *     
 *     // Implement action logic
 *     return {
 *       Success: true,
 *       ResultCode: 'SUCCESS',
 *       Message: 'Action completed'
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseAction {
   /**
    * Executes the action with the provided parameters.
    * 
    * @param params - The action execution parameters including context
    * @returns Promise resolving to the action result
    */
   public async Run(params: RunActionParams): Promise<ActionResultSimple> {
      return await this.InternalRunAction(params);
   }      
 
   /**
    * Internal method that must be implemented by derived action classes.
    * This is where the actual action logic should be implemented.
    * 
    * @param params - The action execution parameters including typed context
    * @returns Promise resolving to the action result
    */
   protected abstract InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> 
}