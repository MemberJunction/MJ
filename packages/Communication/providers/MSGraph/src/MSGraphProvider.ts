import { BaseCommunicationProvider, MessageResult, ProcessedMessage } from "@memberjunction/communication-types";
import { Client } from '@microsoft/microsoft-graph-client';
import { User, Message } from "@microsoft/microsoft-graph-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError } from "@memberjunction/core";
import * as Auth from "./auth";
import * as Config from "./config";

/**
 * Implementation of the MS Graph provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'Microsoft Graph')
export class MSGraphProvider extends BaseCommunicationProvider{

    ServiceAccount: User | null = null;
    
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
    
            await Auth.GraphClient.api('/me/sendMail').post(sendMail);

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
                Error: 'Error sending message'
            };
        }
    }

    public async GetMessages(params: Record<string, any>): Promise<Record<string, any>> {
        const user: User | null = await this.GetServiceAccount();
        if(!user){
            return {};
        }

        let filter: string = "(isRead eq false) and (startswith(subject, '[support]') or startswith(subject, 'RE: [support]'))";
        let top: number = 10;

        if(params.ContextData && params.ContextData.Filter){
            filter = params.ContextData.Filter;
        }

        if(params.ContextData && params.ContextData.Top){
            top = params.ContextData.Top;
        }

        const messagesPath: string = `${Auth.ApiConfig.uri}/${user.id}/messages`;
        const Client: Client = Auth.GraphClient;
        const response: Record<string, any> | null = await Client.api(messagesPath)
        .filter(filter).top(top).get();

        if(!response){
            console.log('Error: could not get messages');
            return {};
        }

        const messages: Message[] = response.value;
        const messageResults = {
            SourceData: messages
        };

        return messageResults;
    }

    protected async GetServiceAccount(email?: string): Promise<User | null> {
        if(this.ServiceAccount){
            return this.ServiceAccount;
        }

        let accountEmail: string = email || Config.AZURE_ACCOUNT_EMAIL;

        const path: string = `${Auth.ApiConfig.uri}/${accountEmail}`;
        const user: User | null = await Auth.CallGraphApi<User>(path)
        if(!user){
            LogError('Error: could not get user info');
            return null;
        }

        const userID: string | undefined = user.id;
        if(!userID){
            LogError('Error: userID not set for user');
            return null;
        }

        this.ServiceAccount = user;
        return user;
    }
}

export function LoadMSGraphProvider() {
    // do nothing, this prevents tree shaking from removing this class
}