import { BaseCommunicationProvider, ForwardMessageParams, ForwardMessageResult, GetMessagesParams, GetMessagesResult, MessageResult, ProcessedMessage, ReplyToMessageParams, ReplyToMessageResult } from "@memberjunction/communication-types";
import { Client } from '@microsoft/microsoft-graph-client';
import { User, Message } from "@microsoft/microsoft-graph-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import { compile, compiledFunction } from 'html-to-text';
import * as Auth from "./auth";
import * as Config from "./config";

/**
 * Implementation of the MS Graph provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'Microsoft Graph')
export class MSGraphProvider extends BaseCommunicationProvider{

    private ServiceAccount: User | null = null;
    private HTMLConverter: compiledFunction;
    
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

    public async ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult> {
        try{
            const user: User | null = await this.GetServiceAccount();
            if(!user){
                return {
                    Success: false,
                    ErrorMessage: 'Service account not found'
                };
            }

            const reply = {
                message: {
                    toRecipients: [
                        {
                            emailAddress: {
                                address: params.Message.To
                            }
                        }
                    ]
                },
                comment: params.Message.ProcessedBody || params.Message.ProcessedHTMLBody
            };

            const sendMessagePath: string = `${Auth.ApiConfig.uri}/${user.id}/messages/${params.MessageID}/reply`;
            const result: any = await Auth.GraphClient.api(sendMessagePath).post(reply);
        
            return {
                Success: true,
                Result: result
            };
        }
        catch(ex){
            LogError(ex);
            return {
                Success: false,
                ErrorMessage: 'Error sending message'
            };
        }
    }

    public async GetMessages(params: GetMessagesParams<Record<string, any>>): Promise<GetMessagesResult<Message>> {
        const contextData = params.ContextData;
        const user: User | null = await this.GetServiceAccount(contextData?.Email);
        if(!user || !user.id){
            return {
                Success: false,
                Messages: []
            };
        }

        let filter: string = "";
        let top: number = params.NumMessages;

        if(params.UnreadOnly){
            filter = "(isRead eq false)";
        }

        if(contextData && contextData.Filter){
            filter = contextData.Filter;
        }

        const messagesPath: string = `${Auth.ApiConfig.uri}/${user.id}/messages`;
        const Client: Client = Auth.GraphClient;
        const response: Record<string, any> | null = await Client.api(messagesPath)
        .filter(filter).top(top).get();

        if(!response){
            return {
                Success: false,
                Messages: []
            };
        }

        const sourceMessages: Record<string, any>[] = response.value;

        let messageResults: GetMessagesResult = {
            Success: true,
            SourceData: sourceMessages,
            Messages: []
        };

        const messages = sourceMessages.map((message: Message) => {
            const replyTo: string[] = message.replyTo?.map((replyTo) => replyTo.emailAddress?.address || '') || [];
            const primaryToRecipient: string = replyTo.length > 0 ? replyTo[0]: '';

            return {
                From: message.from?.emailAddress?.address || '',
                To: primaryToRecipient,
                ReplyTo: replyTo,
                Subject: message.subject || '',
                Body: contextData?.ReturnAsPlainTex ? this.HTMLConverter(message.body?.content || '') : message.body?.content || '',
                ExternalSystemRecordID: message.id || '',
                ThreadID: message.conversationId || ''
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
            if(!params.MessageID){
                return {
                    Success: false,
                    ErrorMessage: 'Message ID not set'
                }
            }

            const user: User | null = await this.GetServiceAccount();
            if(!user){
                return {
                    Success: false,
                    ErrorMessage: 'Service account not found'
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

            const sendMessagePath: string = `${Auth.ApiConfig.uri}/${user.id}/messages/${params.MessageID}/forward`;
            const forwardResult: any = await Auth.GraphClient.api(sendMessagePath).post(forward);

            return {
                Success: true,
                Result: forwardResult
            };
        }
        catch(ex){
            LogError(ex);
            return {
                ErrorMessage: 'An Error occurred while forwarding the message',
                Success: false
            };
        }
    }

    protected async GetServiceAccount(email?: string): Promise<User | null> {
        if(this.ServiceAccount){
            return this.ServiceAccount;
        }

        let accountEmail: string = email || Config.AZURE_ACCOUNT_EMAIL;

        const endpoint: string = `${Auth.ApiConfig.uri}/${accountEmail}`;
        const user: User | null = await Auth.GraphClient.api(endpoint).get();

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