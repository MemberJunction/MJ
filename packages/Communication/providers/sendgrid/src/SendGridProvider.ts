import { BaseCommunicationProvider, ForwardMessageParams, ForwardMessageResult, GetMessagesParams, GetMessagesResult, MessageResult, ProcessedMessage, ReplyToMessageParams, ReplyToMessageResult } from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import sgMail, { MailDataRequired,  } from '@sendgrid/mail';
import { __API_KEY } from "./config";
import { LogError, LogStatus } from "@memberjunction/core";

/**
 * Implementation of the SendGrid provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'SendGrid')
export class SendGridProvider extends BaseCommunicationProvider {
    /**
     * Sends a single message using the provider
     */
    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        
        const from: string = message.From
        // hook up with sendgrid and send stuff
        sgMail.setApiKey(__API_KEY);
        const msg: MailDataRequired = {
            to: message.To,
            from: {
                email: from,
                name: message.FromName
            },
            subject: message.ProcessedSubject,
            text: message.ProcessedBody,
            html: message.ProcessedHTMLBody,
            trackingSettings: {
                subscriptionTracking: {
                    enable: false
                }
            }
        };

        if(message.SendAt){
            const time = message.SendAt.getTime();
            const unitTime = Math.floor(time/1000);
            msg.sendAt = unitTime;
        }

        try {
            //not using await syntax here because we dont get a return value
            return sgMail.send(msg).then((result: [sgMail.ClientResponse, {}]) => {
                if (result && result.length > 0 && result[0].statusCode >= 200 && result[0].statusCode < 300) {
                    LogStatus(`Email sent to ${msg.to}: ${result[0].statusCode}`);
                    return {
                        Message: message,
                        Success: true,
                        Error: ''
                    };
                }
                else {
                    LogError(`Error sending email to ${msg.to}:`, undefined, result);
                    LogError(result[0].body);
                    return {
                        Message: message,
                        Success: false,
                        Error: result[0].toString()
                    };
                }
            }).catch((error: any) => {
                LogError(`Error sending email to ${msg.to}:`, undefined, error);
                LogError(error?.response?.body);
                return {
                    Message: message,
                    Success: false,
                    Error: error.message
                };
            });
        } catch (error) {
            return {
                Message: message,
                Success: false,
                Error: error.message
            };
        }
    }

    /**
     * Fetches messages from the provider
     */
    public async GetMessages(params: GetMessagesParams): Promise<GetMessagesResult> {
        throw new Error("SendGridProvider does not support fetching messages");
    }

    /**
     * Forwards a message to another client using the provider
     */
    public ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult>{
        throw new Error("SendGridProvider does not support forwarding messages");
    }

    /**
     * Replies to a message using the provider
     */
    public ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult> {
        throw new Error("SendGridProvider does not support replying to messages");
    }
}

export function LoadProvider() {
    // do nothing, this prevents tree shaking from removing this class
}