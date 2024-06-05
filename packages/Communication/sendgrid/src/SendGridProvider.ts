import { BaseCommunicationProvider, Message, MessageResult } from "@memberjunction/communication-core";
import { RegisterClass } from "@memberjunction/global";
import sgMail from '@sendgrid/mail';
import { __API_KEY } from "./config";

/**
 * Implementation of the SendGrid provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'SendGrid')
export class SendGridProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(message: Message): Promise<MessageResult> {
        // hook up with sendgrid and send stuff
        sgMail.setApiKey(__API_KEY);
        const msg = {
            to: message.To,
            from: 'amith@bluecypress.io',
            subject: message.Subject,
            text: message.Body,
            html: message.Body
        };
        try {
            const result = await sgMail.send(msg);
            return {
                Message: message,
                Success: true,
                Error: ''
            };
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