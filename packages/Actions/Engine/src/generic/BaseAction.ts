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
    * Whether this action can bound what it returns to an audience (`RunActionParams.Audience`): everyone
    * besides the caller who will see its output, such as the other participants of a shared conversation.
    *
    * `false` by default, and the engine enforces it: when a run's audience adds a reader beyond the caller,
    * `ActionEngineServer.RunAction` refuses the action with result code `AUDIENCE_UNSUPPORTED`, without running
    * it. Override to return `true` only when the action honours the audience in full — every record, snippet
    * and count it returns is something every reader may see (pass the audience to the search engine, check each
    * reader's entitlement to anything it scopes by, and leave out aggregates computed before that filtering).
    */
   public get SupportsAudience(): boolean {
      return false;
   }

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