import { ActionParam, ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { CommunicationEngine } from "@memberjunction/communication-engine";
import { Message } from "@memberjunction/communication-types";
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

        const entityDocumentID: ActionParam = params.Params.find(p => p.Name === 'EntityDocumentID');
        const entityID: ActionParam = params.Params.find(p => p.Name === 'EntityID');
        if(!entityDocumentID && !entityID){
            throw new Error(`EntityDocumentID and entityID params not found.`);
        }

        let vectorizer = new EntityVectorSyncer();
        await vectorizer.Config(params.ContextUser);

        let entityDocument: EntityDocumentEntity| null = null;
        if (entityDocumentID && entityDocumentID.Value) {
        entityDocument = await vectorizer.GetEntityDocument(entityDocumentID.Value);
        } 
        else {
            entityDocument = await vectorizer.GetFirstActiveEntityDocumentForEntity(entityID.Value);
            if (!entityDocument) {
                throw Error(`No active Entity Document found for entity ${entityID.Value}`);
            }
        }

        if (!entityDocument) {
            throw new Error(`No active Entity Document found for entity ${entityID.Value}`);
        }

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
                Message: error,
                ResultCode: "FAILED"            
            };
        }
    }
}