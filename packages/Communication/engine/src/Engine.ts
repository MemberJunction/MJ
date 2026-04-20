import { BaseCommunicationProvider, CommunicationEngineBase, CreateDraftResult, Message, MessageRecipient, MessageResult, ProviderCredentialsBase } from "@memberjunction/communication-types";
import { MJCommunicationRunEntity } from "@memberjunction/core-entities";
import { LogError, LogStatus, UserInfo } from "@memberjunction/core";
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
      * @param providerName - Name of the communication provider to use
      * @param providerMessageTypeName - Type of message to send
      * @param message - Base message (To will be replaced with each recipient)
      * @param recipients - Array of recipients to send to
      * @param previewOnly - If true, only preview without sending
      * @param credentials - Optional credentials override for this request.
      *                      Provider-specific credential object (e.g., SendGridCredentials).
      *                      If not provided, uses environment variables.
      *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
      */
     public async SendMessages(
        providerName: string,
        providerMessageTypeName: string,
        message: Message,
        recipients: MessageRecipient[],
        previewOnly: boolean = false,
        credentials?: ProviderCredentialsBase
     ): Promise<MessageResult[]> {
        const run = await this.StartRun();
        if (!run)
            throw new Error(`Failed to start communication run.`);

        const results: MessageResult[] = [];
        for (const r of recipients) {
            const messageCopy = new Message(message);
            messageCopy.To = r.To;
            messageCopy.ContextData = r.ContextData;
            const result = await this.SendSingleMessage(providerName, providerMessageTypeName, messageCopy, run, previewOnly, credentials);
            results.push(result);
        }

        if (!await this.EndRun(run))
            throw new Error(`Failed to end communication run.`);

        return results;
     }

     /**
      * Sends a single message using the specified provider. The provider must be one of the providers that are configured in the system.
      * @param providerName - Name of the communication provider to use
      * @param providerMessageTypeName - Type of message to send
      * @param message - The message to send
      * @param run - Optional communication run entity for logging
      * @param previewOnly - If true, only preview without sending
      * @param credentials - Optional credentials override for this request.
      *                      Provider-specific credential object (e.g., SendGridCredentials).
      *                      If not provided, uses environment variables.
      *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
      */
     public async SendSingleMessage(
        providerName: string,
        providerMessageTypeName: string,
        message: Message,
        run?: MJCommunicationRunEntity,
        previewOnly?: boolean,
        credentials?: ProviderCredentialsBase
     ): Promise<MessageResult> {
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
                    const sendResult = await provider.SendSingleMessage(processedMessage, credentials);
                    log.Status = sendResult.Success ? 'Complete' : 'Failed';
                    log.ErrorMessage = sendResult.Error;
                    if (!await log.Save()){
                        throw new Error(`Failed to complete log for message: ${log.LatestResult?.Message}`);
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

     /**
      * Creates a draft message using the specified provider
      * @param message - The message to save as a draft
      * @param providerName - Name of the provider to use
      * @param contextUser - Optional user context for server-side operations
      * @param credentials - Optional credentials override for this request.
      *                      Provider-specific credential object (e.g., MSGraphCredentials).
      *                      If not provided, uses environment variables.
      *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
      * @returns Promise<CreateDraftResult> - Result containing draft ID if successful
      */
     public async CreateDraft(
         message: Message,
         providerName: string,
         contextUser?: UserInfo,
         credentials?: ProviderCredentialsBase
     ): Promise<CreateDraftResult> {
         try {
             if (!this.Loaded) {
                 return {
                     Success: false,
                     ErrorMessage: 'Metadata not loaded. Call Config() before creating drafts.'
                 };
             }

             // Get provider instance
             const provider = this.GetProvider(providerName);
             if (!provider) {
                 return {
                     Success: false,
                     ErrorMessage: `Provider ${providerName} not found`
                 };
             }

             // Check if provider supports drafts
             const providerEntity = this.Providers.find(p => p.Name === providerName);
             if (!providerEntity?.SupportsDrafts) {
                 return {
                     Success: false,
                     ErrorMessage: `Provider ${providerName} does not support creating drafts`
                 };
             }

             // Process message (render templates)
             const processedMessage = new ProcessedMessageServer(message);
             const processResult = await processedMessage.Process(false, contextUser || this.ContextUser);

             if (!processResult.Success) {
                 return {
                     Success: false,
                     ErrorMessage: `Failed to process message: ${processResult.Message}`
                 };
             }

             // Create draft via provider
             const result = await provider.CreateDraft({
                 Message: processedMessage,
                 ContextData: message.ContextData
             }, credentials);

             if (result.Success) {
                 LogStatus(`Draft created successfully via ${providerName}. Draft ID: ${result.DraftID}`);
             } else {
                 LogError(`Failed to create draft via ${providerName}`, undefined, result.ErrorMessage);
             }

             return result;
         } catch (error: unknown) {
             const errorMessage = error instanceof Error ? error.message : 'Error creating draft';
             LogError('Error creating draft', undefined, error);
             return {
                 Success: false,
                 ErrorMessage: errorMessage
             };
         }
     }
}