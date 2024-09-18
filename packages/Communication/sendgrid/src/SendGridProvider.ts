import { BaseCommunicationProvider, Message, MessageResult, ProcessedMessage } from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import sgMail from '@sendgrid/mail';
import { __API_KEY } from "./config";
import { LogError, LogStatus } from "@memberjunction/core";
import fs from 'fs';

/**
 * Implementation of the SendGrid provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'SendGrid')
export class SendGridProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        message.ProcessedHTMLBody = message.ProcessedHTMLBody.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

        var format = /[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
        const name = message.Subject.split(",")[0];
        if(!format.test(name)){
            fs.writeFileSync(`C:/Development/MemberJunction/test-vectorization/htmlTexts/${name}Test.html`, message.ProcessedHTMLBody);
        }

        // hook up with sendgrid and send stuff
        sgMail.setApiKey(__API_KEY);
        const msg = {
            to: message.To,
            from: message.From,
            subject: message.ProcessedSubject,
            text: message.ProcessedBody,
            html: message.ProcessedHTMLBody
        };
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

export function LoadSendGridProvider() {
    // do nothing, this prevents tree shaking from removing this class
}