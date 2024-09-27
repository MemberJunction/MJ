import { BaseCommunicationProvider, Message, MessageResult, ProcessedMessage } from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import sgMail, { MailDataRequired } from '@sendgrid/mail';
import { __API_KEY } from "./config";

/**
 * Implementation of the SendGrid provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'SendGrid')
export class SendGridProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        // hook up with sendgrid and send stuff
        sgMail.setApiKey(__API_KEY);
        let msg: MailDataRequired = {
            to: message.To,
            from: message.From,
            subject: message.ProcessedSubject,
            text: message.ProcessedBody,
            html: message.ProcessedHTMLBody
        };

        if(message.SendAt){
            const time = message.SendAt.getTime();
            const unitTime = Math.floor(time/1000);
            msg.sendAt = unitTime;
        }

        try {
            const result = await sgMail.send(msg);
            if (result && result.length > 0 && result[0].statusCode >= 200 && result[0].statusCode < 300) {
                return {
                    Message: message,
                    Success: true,
                    Error: ''
                };
            }
            else {
                return {
                    Message: message,
                    Success: false,
                    Error: result[0].toString()
                };
            }
        } catch (error) {
            return {
                Message: message,
                Success: false,
                Error: error.message
            };
        }
    }
}

export function LoadProvider() {
    // do nothing, this prevents tree shaking from removing this class
}