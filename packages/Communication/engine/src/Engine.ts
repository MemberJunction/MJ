import { BaseCommunicationProvider, CommunicationEngineBase, Message, MessageRecipient, MessageResult } from "@memberjunction/communication-types";
import { CommunicationRunEntity } from "@memberjunction/core-entities";
import { MJGlobal } from "@memberjunction/global";
import { ProcessedMessageServer } from "./BaseProvider";
 

/**
 * Base class for communications. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class CommunicationEngine extends CommunicationEngineBase {
    public static get Instance(): CommunicationEngine {
        return super.getInstance<CommunicationEngine>();    
    }

     /**
      * Gets an instance of the class for the specified provider. The provider must be one of the providers that are configured in the system.
      * @param providerName 
      * @returns 
      */
     public GetProvider(providerName: string): BaseCommunicationProvider {
        if (!this.Loaded){
            throw new Error(`Metadata not loaded. Call Config() before accessing metadata.`);
        }

        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseCommunicationProvider>(BaseCommunicationProvider, providerName);
        if (instance) {
            // make sure the class we got back is NOT an instance of the base class, that is the default behavior of CreateInstance if we 
            // dont have a registration for the class we are looking for
            if (instance.constructor.name === 'BaseCommunicationProvider'){
                throw new Error(`Provider ${providerName} not found.`);
            }
            else {
                return instance; // we got a valid instance of the sub-class we were looking for
            }
        }
        else {
            throw new Error(`Provider ${providerName} not found.`);
        }
     }

 
     /**
      * Sends multiple messages using the specified provider. The provider must be one of the providers that are configured in the 
      * system.
      * @param providerName 
      * @param providerMessageTypeName 
      * @param message this will be used as a starting point but the To will be replaced with the recipient in the recipients array
      */
     public async SendMessages(providerName: string, providerMessageTypeName: string, message: Message, recipients: MessageRecipient[], previewOnly: boolean = false): Promise<MessageResult[]> {
        const run = await this.StartRun();
        if (!run){
            throw new Error(`Failed to start communication run.`);
        }

        const results: MessageResult[] = await Promise.all(recipients.map(async (r) => {
            const messageCopy = new Message(message);
            messageCopy.To = r.To;
            messageCopy.ContextData = r.ContextData;
            const result = await this.SendSingleMessage(providerName, providerMessageTypeName, messageCopy, run, previewOnly);
            return result;
        }));

        if (!await this.EndRun(run)){
            throw new Error(`Failed to end communication run.`);
        }

        return results;
     }

     /**
      * Sends a single message using the specified provider. The provider must be one of the providers that are configured in the system.
      */
     public async SendSingleMessage(providerName: string, providerMessageTypeName: string, message: Message, run?: CommunicationRunEntity, previewOnly?: boolean): Promise<MessageResult> {
        if (!this.Loaded){
            throw new Error(`Metadata not loaded. Call Config() before accessing metadata.`);
        }

        const provider = this.GetProvider(providerName);
        if (!provider){
            throw new Error(`Provider ${providerName} not found.`);
        }

        const providerEntity = this.Providers.find((p) => p.Name === providerName);
        if (!providerEntity){
            throw new Error(`Provider ${providerName} not found.`);
        }

        if (!message.MessageType) {
            // find the message type
            const providerMessageType = providerEntity.MessageTypes.find((pmt) => pmt.Name.trim().toLowerCase() === providerMessageTypeName.trim().toLowerCase());
            if (!providerMessageType){
                throw new Error(`Provider message type ${providerMessageTypeName} not found.`);
            }

            message.MessageType = providerMessageType;
        }

        // now, process the message
        const processedMessage = new ProcessedMessageServer(message);
        const processResult = await processedMessage.Process(false, this.ContextUser);
        if (processResult.Success) {
            if (previewOnly) {
                return { Success: true, Error: '', Message: processedMessage };
            }
            else {
                const log = await this.StartLog(processedMessage, run);
                if (log) {
                    const sendResult = await provider.SendSingleMessage(processedMessage);
                    log.Status = sendResult.Success ? 'Complete' : 'Failed';
                    log.ErrorMessage = sendResult.Error;
                    if (!await log.Save()){
                        throw new Error(`Failed to complete log for message.`);
                    }
                    else{
                        return sendResult;
                    }
                }
                else{
                    throw new Error(`Failed to start log for message.`);
                }    
            }
        }
        else{
            throw new Error(`Failed to process message: ${processResult.Message}`);
        }
     }
}