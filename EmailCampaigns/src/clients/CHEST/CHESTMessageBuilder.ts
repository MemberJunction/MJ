import { RegisterClass } from "@memberjunction/global";
import { Message } from "@memberjunction/communication-types";
import { UserInfo } from "@memberjunction/core";
import { MessageBuilder } from "../../classes/MessageBuilder";
import { sendgridDomain } from "../../Config";
import { TemplateEntityExtended } from "@memberjunction/templates-base-types";
import { TemplateEngineServer } from "@memberjunction/templates";
import { CommunicationEngine } from "@memberjunction/communication-engine";

@RegisterClass(MessageBuilder, 'CHESTMessageBuilder')
export class CHESTMessageBuilder implements MessageBuilder {
    public async GetMessage(currentUser: UserInfo): Promise<Message> {

        const sendGrid = CommunicationEngine.Instance.Providers.find(p => p.Name === "SendGrid")
        if (!sendGrid){
            throw new Error("SendGrid provider not found");
        }

        const email = sendGrid.MessageTypes.find(mt => mt.Name === "Email");
        if (!email){
        throw new Error("Email message type not found");
        } 

        const bodyTemplate: TemplateEntityExtended | undefined = TemplateEngineServer.Instance.Templates.find(t => t.ID === "2EA2B909-4EA1-EF11-88CD-6045BD325BD0");
        const subjectTemplate: TemplateEntityExtended | undefined = TemplateEngineServer.Instance.Templates.find(t => t.ID === "65C3F2C9-06A7-EF11-88D0-002248450A5B");

        if (!bodyTemplate){
            throw new Error("Body template not found");
        }

        if (!subjectTemplate){
            throw new Error("Subject template not found");
        }

        const msg: Message = new Message();

        msg.From = sendgridDomain;
        msg.MessageType = email;
        msg.HTMLBodyTemplate = bodyTemplate;
        msg.SubjectTemplate = subjectTemplate;

        return msg;
    }
}

export function LoadCHESTMessageBuilder(): void {

}