import { CommunicationEngine } from "@memberjunction/communication-engine";
import { Message } from "@memberjunction/communication-types";
import { Metadata, RunView, RunViewParams } from "@memberjunction/core";
import { EntityCommunicationsEngineBase } from "@memberjunction/entity-communications-base";

 
/**
 * Server-side implementation of the entity communications engine
 */
export class EntityCommunicationsEngine extends EntityCommunicationsEngineBase {
    /**
     * Executes a given message request against a view of records for a given entity
     * @param entityID 
     * @param runViewParams 
     * @param providerName 
     * @param providerMessageTypeName 
     * @param message 
     */
    public async RunEntityCommunication(entityID: number, runViewParams: RunViewParams, 
                                        providerName: string, providerMessageTypeName: string, 
                                        message: Message): Promise<{Success: boolean, ErrorMessage: string}> {
        try {
            this.TryThrowIfNotLoaded();

            const md = new Metadata();
            const entityInfo = md.Entities.find(e => e.ID === entityID);    
            if (!entityInfo)
                throw new Error(`Entity ${entityID} not found`);
    
            if (!this.EntitySupportsCommunication(entityID)) {
                throw new Error(`Entity ${entityID} does not support communication`);
            }
    
            await CommunicationEngine.Instance.Config(false, this.ContextUser);
    
            const provider = CommunicationEngine.Instance.Providers.find(p => p.Name.trim().toLowerCase() === providerName.trim().toLowerCase());
            if (!provider) 
                throw new Error(`Provider ${providerName} not found`);
            const providerMessageType = provider.MessageTypes.find(mt => mt.Name.trim().toLowerCase() === providerMessageTypeName.trim().toLowerCase());
    
            const entityMessageTypes = this.GetEntityCommunicationMessageTypes(entityID);
            const entityMessageType = entityMessageTypes.find(m => m.BaseMessageTypeID === providerMessageType.CommunicationBaseMessageTypeID);
            if (!entityMessageType) {
                throw new Error(`Entity ${entityID} does not support message type ${providerMessageType.CommunicationBaseMessageType}`);
            }
    
            // we have now validated we are good on the message type requested...
            // next up we will figure out which field to use for the entity, starting at the entity level and then going to the record level, IF the entity has
            // a PreferredCommunicationField we will flag that here as recordLevelPref = true
            const recordLevelPref = entityInfo.PreferredCommunicationField?.length > 0;
            // get the highest priority field within the entityMessageType.communicationFields property
            const entityLevelPrefField = entityMessageType.CommunicationFields.sort((a, b) => a.Priority - b.Priority)[0];
    
            // next our main job here is to run the view, get all the records, and then call the communication engine
            const rv = new RunView();
            const rvParams2 = {
                ...runViewParams
            }
            // now change rvParams2.Fields to have ALL entity fields to make sure we get them all
            rvParams2.Fields = entityInfo.Fields.map(f => f.Name);
    
            const result = await rv.RunView(rvParams2, this.ContextUser);
            if (result && result.Success) {
                // have the results, now we can map the results to the types the comm engine needs and call SendMessages() in the comm engine
                await CommunicationEngine.Instance.Config(false, this.ContextUser);
                const recipients = result.Results.map(r => {
                    // in the below we get the VALUE of the record level preferred field if it exists, otherwise we get the value of the entity level preferred field
                    const ToValue = !recordLevelPref ? r[entityLevelPrefField.FieldName] : r[r[entityInfo.PreferredCommunicationField]];
                    return {
                        To: ToValue,
                        ContextData: { ...r,       
                            recommendedArticles: [
                            {
                              title: 'Exemplifying the Importance of Code Reviews',
                              url: 'https://example.com/article1'
                            },
                            {
                              title: 'AI and Software Development: A New Frontier',
                              url: 'https://example.com/article2'      
                            },
                            {
                              title: 'Gardening Tips for Fun Loving Software Developers',
                              url: 'https://example.com/article3'
                            }
                          ]
                        }                                        
                    };
                })
                const sendResult = await CommunicationEngine.Instance.SendMessages(providerName, providerMessageTypeName, message, recipients);
                if (sendResult && sendResult.length === recipients.length) {
                    // make sure none of the messages failed
                    return { 
                        Success: !sendResult.some(r => !r.Success), 
                        ErrorMessage: sendResult.filter(r => !r.Success).map(r => r.Error).join('; ')
                    };
                }
            }
            else {
                throw new Error(`Failed to run view ${runViewParams.ViewName}: ${result.ErrorMessage}`);
            }
    
            return {
                Success: false,
                ErrorMessage: 'Unknown error'
            }
        }
        catch (e) {
            return {
                Success: false,
                ErrorMessage: e.message
            }
        }
    }
}