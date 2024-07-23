import { ActionParam, ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { EntityVectorSyncer } from "@memberjunction/ai-vector-sync";
import { EntityDocumentEntity } from "@memberjunction/core-entities";

/**
 * This class provides a simple wrapper of the most basic feature in the MJ Communication Framework, sending a single message. 
 * This class takes in a set of parameters and uses the MJ Communication Framework to send a single message to a single recipient.
 * 
 * Params:
 *  * Subject: The subject of the message.
 *  * Body: The body of the message.
 *  * To: The recipient of the message.
 *  * From: The sender of the message.
 *  * Provider: The name of the Communication Provider to use to send the message.
 *  * MessageType: The name of the Message Type (within the provider) to use to send the message.
 */
@RegisterClass(BaseAction, "Vectorize Entity")
export class VectorizeEntityAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {

        const entityNamesParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EntityNames');
        let entityNames: string[] = [];
        if(entityNamesParam && entityNamesParam.Value && entityNamesParam.Value.includes(',')){
            entityNames = entityNamesParam.Value.split(',');
        }

        let vectorizer = new EntityVectorSyncer();
        await vectorizer.Config(false, params.ContextUser);

        const entityDocuments: EntityDocumentEntity[] = await vectorizer.GetActiveEntityDocuments(entityNames);
        let results: ActionResultSimple[] = await Promise.all(entityDocuments.map(async (entityDocument: EntityDocumentEntity) => {
            try{
                await vectorizer.VectorizeEntity({
                    entityID: entityDocument.EntityID,
                    entityDocumentID: entityDocument.ID,
                    batchCount: 20,
                    options: {},
                }, params.ContextUser);
    
                return {
                    Success: true,
                    ResultCode: "SUCCESS"            
                };
            }
            catch(error){
                return {
                    Success: false,
                    Message: error as any,
                    ResultCode: "FAILED"            
                };
            }
        }));

        return {
            Success: results.every(r => r.Success),
            Message: results.map(r => r.Message).join('\n'),
            ResultCode: results.every(r => r.Success) ? "SUCCESS" : "FAILED"            
        };
    }
}

export function LoadVectorizeEntityAction(){
    // this function is a stub that is used to force the bundler to include the above class in the final bundle and not tree shake them out
}