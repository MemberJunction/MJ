import { BaseCommunicationProvider, GetMessageMessage, GetMessagesResult, MessageResult, ProcessedMessage } from "@memberjunction/communication-types";
import { Client } from '@microsoft/microsoft-graph-client';
import { User, Message } from "@microsoft/microsoft-graph-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import * as Auth from "./auth";
import * as Config from "./config";
import { compile, compiledFunction } from "html-to-text";
import { MSGraphGetResponse } from "./generic/models";

/**
 * Implementation of the MS Graph provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'Microsoft Graph')
export class MSGraphProvider extends BaseCommunicationProvider{

    ServiceAccount: User | null = null;
    HTMLConverter: compiledFunction;
    
    constructor() {
        super();

        this.HTMLConverter = compile({
            wordwrap: 130
        });
    }

    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        try{
            const user: User | null = await this.GetServiceAccount();
            if(!user){
                return {
                    Message: message,
                    Success: false,
                    Error: 'Service account not found'
                };
            }

            if(!message){
                return {
                    Message: message,
                    Success: false,
                    Error: 'Message is null'
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
    
            const sendMessagePath: string = `${Auth.ApiConfig.uri}/${user.id}/sendMail`;
            await Auth.GraphClient.api(sendMessagePath).post(sendMail);

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

    public async ReplyToMessage(message: ProcessedMessage, messageID: string): Promise<MessageResult> {
        try{
            const user: User | null = await this.GetServiceAccount();
            if(!user){
                return {
                    Message: message,
                    Success: false,
                    Error: 'Service account not found'
                };
            }

            const reply = {
                message: {
                    toRecipients: [
                        {
                            emailAddress: {
                                address: message.To
                            }
                        }
                    ]
                },
                comment: message.ProcessedBody || message.ProcessedHTMLBody
            };

            const sendMessagePath: string = `${Auth.ApiConfig.uri}/${user.id}/messages/${messageID}/reply`;
            await Auth.GraphClient.api(sendMessagePath).post(reply);

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

    public async GetMessages(params: Record<string, any>): Promise<GetMessagesResult<Message>> {
        const contextData = params.ContextData;
        const user: User | null = await this.GetServiceAccount(contextData?.Email);
        if(!user || !user.id){
            return {
                Messages: []
            };
        }

        let filter: string = "(isRead eq false) and (startswith(subject, '[support]') or startswith(subject, 'RE: [support]'))";
        let top: number = 10;

        if(contextData && contextData.Filter){
            filter = params.ContextData.Filter;
        }

        if(contextData && contextData.Top){
            top = params.ContextData.Top;
        }

        const messagesPath: string = `${Auth.ApiConfig.uri}/${user.id}/messages`;
        const Client: Client = Auth.GraphClient;
        const response: MSGraphGetResponse<Message[]> | null = await Client.api(messagesPath)
        .filter(filter).top(top).get();

        if(!response){
            LogError('Error: could not get messages');
            return {
                Messages: []
            };
        }

        const sourceMessages: Message[] = response.value;

        let messageResults: GetMessagesResult<Message> = {
            SourceData: sourceMessages,
            Messages: []
        };

        const messages: GetMessageMessage[] = sourceMessages.map((message: Message) => {
            return {
                From: message.from?.emailAddress?.address || '',
                ReplyTo: message.replyTo?.map((replyTo) => replyTo.emailAddress?.address || '') || [],
                Subject: message.subject || '',
                Body: contextData?.ReturnAsPlainTex ? this.HTMLConverter(message.body?.content || '') : message.body?.content || '',
                ExternalSystemRecordID: message.id || '',
            };
        });

        messageResults.Messages = messages;

        if(contextData && contextData.MarkAsRead){
            for(let message of messages){
                this.MarkMessageAsRead(user.id, message.ExternalSystemRecordID);
            }
        }

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

    protected async MarkMessageAsRead(userID: string, messageID: string): Promise<boolean> {        
        try{
            const Client: Client = Auth.GraphClient;
            const updatePath: string = `${Auth.ApiConfig.uri}/${userID}/messages/${messageID}`;
            const updatedMessage = {
                isRead: true
            };
            
            await Client.api(updatePath).update(updatedMessage);
            return true;
        }
        catch(ex){
            LogStatus(`Failed to mark message ${messageID} as read`);
            LogError(ex);
            return false;
        }
    }
}

export function LoadMSGraphProvider() {
    // do nothing, this prevents tree shaking from removing this class
}