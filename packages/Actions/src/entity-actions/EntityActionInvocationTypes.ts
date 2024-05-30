import { RegisterClass } from "@memberjunction/global";
import { EntityActionInvocationParams } from "./EntityActionEngine";
import { ActionEngine, ActionParam, ActionResult } from "../generic/ActionEngine";
import { ActionParamEntity } from "@memberjunction/core-entities";

/**
 * Base class for invocation of any entity action invocation type
 */
export abstract class EntityActionInvocationBase {
    public abstract InvokeAction(params: EntityActionInvocationParams): Promise<ActionResult>

    /**
     * Case insensitive helper method to find a param by valueType
     * @param allParams 
     * @param valueType 
     */
    public FindParam(allParams: ActionParamEntity[], valueType: "Scalar" | "Simple Object" | "BaseEntity Sub-Class" | "Other"): ActionParamEntity {
        return allParams.find(p => p.ValueType.trim().toLowerCase() === valueType.trim().toLowerCase());
    }
}

/**
 * Base class for invocation of any entity action invocation type that is single record oriented
 */
@RegisterClass(EntityActionInvocationBase, 'Read')
@RegisterClass(EntityActionInvocationBase, 'BeforeCreate')
@RegisterClass(EntityActionInvocationBase, 'BeforeUpdate')
@RegisterClass(EntityActionInvocationBase, 'BeforeDelete')
@RegisterClass(EntityActionInvocationBase, 'AfterCreate')
@RegisterClass(EntityActionInvocationBase, 'AfterUpdate')
@RegisterClass(EntityActionInvocationBase, 'AfterDelete')
export class EntityActionInvocationSingleRecord extends EntityActionInvocationBase {
    public async ValidateParams(params: EntityActionInvocationParams): Promise<boolean> {
        // for this type of invocation we need to validate that the EntityObject is not null
        if (!params.EntityObject) {
            throw new Error('EntityObject is required for single record invocation - Create/Read/Update/Delete');
        }
        return true;
    }

    public async InvokeAction(params: EntityActionInvocationParams): Promise<ActionResult> {
        // for this type of invocation we need to validate that the EntityObject is not null
        if (this.ValidateParams(params)) {
            // now do the work
            // get the class that is derived from BaseAction for the Action Name
            await ActionEngine.Instance.Config(false, params.ContextUser);

            const action = ActionEngine.Instance.Actions.find(a => a.ID === params.EntityAction.ActionID);
            const param = this.FindParam(action.Params, 'BaseEntity Sub-Class'); // find the base entity sub-class param 

            const internalParams: ActionParam[] = [{
                Name: param.Name, // parameter could be named anything, but we know it's the base entity sub-class so we are using it here
                Value: params.EntityObject
            }]; 


            const result = await ActionEngine.Instance.RunAction({
                Action: action,
                ContextUser: params.ContextUser,
                Filters: params.EntityAction.Filters.map(f => {
                    const filter = ActionEngine.Instance.ActionFilters.find(fi => fi.ID === f.ActionFilterID);
                    return filter;
                }),
                Params: internalParams
            });

            return result;
        }
        else
            return null;
    }
}

/**
 * This class handles the invocation type of Validate and uses Entity Actions to validate a record and provide the results back to the caller
 */
@RegisterClass(EntityActionInvocationBase, 'Validate')
export class EntityActionInvocationValidate extends EntityActionInvocationSingleRecord {
    public override async InvokeAction(params: EntityActionInvocationParams): Promise<ActionResult> {
        // for this type of invocation we need to validate that the EntityObject is not null
        if (this.ValidateParams(params)) {
            // make sure the action engine is good to go, the below won't do anything if it was already configured
            await ActionEngine.Instance.Config(false, params.ContextUser);

            const action = ActionEngine.Instance.Actions.find(a => a.ID === params.EntityAction.ActionID);
            const param = this.FindParam(action.Params, 'BaseEntity Sub-Class'); // find the base entity sub-class param 
            const internalParams: ActionParam[] = [{
                Name: param.Name, // parameter could be named anything, but we know it's the base entity sub-class so we are using it here
                Value: params.EntityObject
            }]; 
            
            const result = await ActionEngine.Instance.RunAction({
                Action: action,
                ContextUser: params.ContextUser,
                Filters: params.EntityAction.Filters.map(f => {
                    const filter = ActionEngine.Instance.ActionFilters.find(fi => fi.ID === f.ActionFilterID);
                    return filter;
                }),
                Params: internalParams
            })

            return result 
        }
        else
            return null;
    }
}