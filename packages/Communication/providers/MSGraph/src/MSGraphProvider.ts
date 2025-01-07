import { BaseCommunicationProvider, GetMessagesParams, GetMessagesResult, MessageResult, ProcessedMessage } from "@memberjunction/communication-types";
import { Client } from '@microsoft/microsoft-graph-client';
import { User, Message } from "@microsoft/microsoft-graph-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import { compile, compiledFunction } from 'html-to-text';
import * as Auth from "./auth";
import * as Config from "./config";
import { ForwardMessageParams, ForwardMessageResult } from "./generic/models";

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

    public async GetMessages(params: GetMessagesParams<Record<string, any>>): Promise<GetMessagesResult<Message>> {
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
            filter = contextData.Filter;
        }

        if(contextData && contextData.Top){
            top = contextData.Top;
        }

        const messagesPath: string = `${Auth.ApiConfig.uri}/${user.id}/messages`;
        const Client: Client = Auth.GraphClient;
        const response: Record<string, any> | null = await Client.api(messagesPath)
        .filter(filter).top(top).get();

        if(!response){
            console.log('Error: could not get messages');
            return {
                Messages: []
            };
        }

        const sourceMessages: Record<string, any>[] = response.value;

        let messageResults: GetMessagesResult = {
            SourceData: sourceMessages,
            Messages: []
        };

        const messages = sourceMessages.map((message: Message) => {
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

    public async ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult> {
        try{
            if(!params.EmailID){
                return {
                    Success: false,
                    Message: 'Email ID not set'
                }
            }

            const user: User | null = await this.GetServiceAccount();
            if(!user){
                return {
                    Success: false,
                    Message: 'Service account not found'
                }
            }

            const forward = {
                comment: params.Message,
                toRecipients: params.ToRecipients.map((recipient) => {
                    return {
                        emailAddress: {
                            name: recipient.Name,
                            address: recipient.Address
                        }
                    };
                })
            };

            const sendMessagePath: string = `${Auth.ApiConfig.uri}/${user.id}/messages/${params.EmailID}/forward`;
            await Auth.GraphClient.api(sendMessagePath).post(forward);

            return {
                Success: true
            }
        }
        catch(ex){
            LogError(ex);
            return {
                Message: 'An Error occurred while forwarding the message',
                Success: false,
            };
        }
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
            LogStatus(`Message ${messageID} marked as read`);
            return true;
        }
        catch(ex){
            LogError(ex);
            return false;
        }
    }
}

export function LoadMSGraphProvider() {
    // do nothing, this prevents tree shaking from removing this class
}