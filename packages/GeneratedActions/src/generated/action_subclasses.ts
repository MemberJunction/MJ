/*************************************************
* GENERATED CODE - DO NOT MODIFY
* Generated by MemberJunction CodeGen at 8/9/2024, 4:23:37 PM
**************************************************/
import { ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { RunView, Metadata, UserInfo, BaseEntity } from "@memberjunction/core";

            
/**
 * New Action test
 * Generated Class
 * User Prompt: null
 */
@RegisterClass(BaseAction, "New Action test")
export class New_Action_test_Action extends BaseAction {
    
    protected override async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        throw new Error("Action not yet implemented")
    }
}        
            
            
export function LoadGeneratedActions() {
    // this function is a stub that is used to force the bundler to include the generated action classes in the final bundle and not tree shake them out
}
