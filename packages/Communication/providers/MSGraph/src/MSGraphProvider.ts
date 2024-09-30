import { BaseCommunicationProvider, MessageResult, ProcessedMessage } from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError } from "@memberjunction/core";
import { GraphClient } from "./auth";

/**
 * Implementation of the SendGrid provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'SendGrid')
export class MSGraphProvider extends BaseCommunicationProvider{
    
    constructor() {
        super();
    }

    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        try{
            if(!message){
                return {
                    Message: message,
                    Success: false,
                    Error: 'Error: message is null'
                };
            }
    
            const sendMail = {
                message: {
                    subject: message.Subject,
                    body: {
                        contentType: message.ProcessedHTMLBody ? 'HTML' : 'Text',
                        content: message.ProcessedHTMLBody || message.ProcessedBody
                    },
                    toRecipients: [
                        {
                            emailAddress: {
                            address: message.To
                            }
                        }
                    ]
                },
                saveToSentItems: 'false'
            };
    
            await GraphClient.api('/me/sendMail').post(sendMail);

            return {
                Message: message,
                Success: true,
                Error: ''
            };
        }
        catch(ex){
            LogError(ex);
            return {
                Message: message,
                Success: false,
                Error: ex.message
            };
        }
    }
}

export function LoadMSGraphProvider() {
    // do nothing, this prevents tree shaking from removing this class
}

