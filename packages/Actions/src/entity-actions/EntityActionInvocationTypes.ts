import { RegisterClass } from "@memberjunction/global";
import { EntityActionInvocationParams } from "./EntityActionEngine";
import { ActionEngine, ActionParam, ActionResult } from "../generic/ActionEngine";

/**
 * Base class for invocation of any entity action invocation type
 */
export abstract class EntityActionInvocationBase {
    public abstract InvokeAction(params: EntityActionInvocationParams): Promise<ActionResult>
}

/**
 * Base class for invocation of any entity action invocation type that is single record oriented
 */
@RegisterClass(EntityActionInvocationBase, 'Create')
@RegisterClass(EntityActionInvocationBase, 'Read')
@RegisterClass(EntityActionInvocationBase, 'Update')
@RegisterClass(EntityActionInvocationBase, 'Delete')
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
            throw new Error('InvokeAction not yet implemented for this type of invocation');
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
            const param = action.Params.find(p => p.ValueType === 'BaseEntity Sub-Class'); // find the base entity sub-class param 
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