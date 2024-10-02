import { BaseCommunicationProvider, Message, MessageResult, ProcessedMessage } from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import sgMail, { MailDataRequired } from '@sendgrid/mail';
import { __API_KEY } from "./config";
import fs from 'fs';
import { LogError, LogStatus } from "@memberjunction/core";

/**
 * Implementation of the SendGrid provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'SendGrid')
export class SendGridProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        
        message.ProcessedHTMLBody = message.ProcessedHTMLBody.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

        const date = new Date();
        fs.writeFileSync(`C:/Development/MemberJunction/test-vectorization/htmlTexts/SampleEmailBodyTest${date.getUTCMilliseconds()}.html`, message.ProcessedHTMLBody);

        // hook up with sendgrid and send stuff
        sgMail.setApiKey(__API_KEY);
        const msg: MailDataRequired = {
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
            //not using await syntax here because we dont get a return value
            return sgMail.send(msg).then((result: [sgMail.ClientResponse, {}]) => {
                if (result && result.length > 0 && result[0].statusCode >= 200 && result[0].statusCode < 300) {
                    console.log(`Email sent: ${result[0].statusCode}`);
                    return {
                        Message: message,
                        Success: true,
                        Error: ''
                    };
                }
                else {
                    LogError(`Error sending email:`, undefined, result);
                    return {
                        Message: message,
                        Success: false,
                        Error: result[0].toString()
                    };
                }
            }).catch((error: any) => {
                LogError(`Error sending email:`, undefined, error);
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
}

export function LoadSendGridProvider() {
    // do nothing, this prevents tree shaking from removing this class
}