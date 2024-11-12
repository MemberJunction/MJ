import { MJGlobal } from "@memberjunction/global";
import { EntityActionInvocationBase } from "./EntityActionInvocationTypes";
import { EntityActionEngineBase, EntityActionInvocationParams, EntityActionResult } from "@memberjunction/actions-base";
 
/**
 * The purpose of this class is to handle the invocation of actions for entities in all of the supported invocation contexts.
 */
export class EntityActionEngineServer extends EntityActionEngineBase {
    public static get Instance(): EntityActionEngineServer {
        return <EntityActionEngineServer>super.Instance;
    }


    /**
     * Method will invoke an action given the provided parameters. The method will return true if the action was successfully invoked, false otherwise.
     * @param params Parameters for the action invocation
     * @returns 
     */
    public async RunEntityAction(params: EntityActionInvocationParams): Promise<EntityActionResult> {
        /*
            Logic for invoking an Entity Action:
            1) Validate the params, making sure that we have the right stuff
            2) Switch based on the invocation type to execute the right logic
         */
        if (!params.EntityAction) 
            throw new Error('EntityAction is required for invocation');

        // now get the right object based on the invocation type
        if (!params.InvocationType)
            throw new Error('Invalid invocation type provided');

        // now we have the invocation type, use the name as the key for ClassFactory create instance to get what we need
        const invocationInstance = MJGlobal.Instance.ClassFactory.CreateInstance<EntityActionInvocationBase>(EntityActionInvocationBase, params.InvocationType.Name);
        if (!invocationInstance)
            throw new Error('Error creating instance of invocation type');

        // now we have the instance, invoke the action
        return invocationInstance.InvokeAction(params);
    }
}