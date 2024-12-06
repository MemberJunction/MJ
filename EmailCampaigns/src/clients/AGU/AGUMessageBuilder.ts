import { RegisterClass } from "@memberjunction/global";
import { Message } from "@memberjunction/communication-types";
import { UserInfo } from "@memberjunction/core";
import { MessageBuilder } from "../../classes/MessageBuilder";
import { sendgridDomain } from "../../Config";
import { TemplateEntityExtended } from "@memberjunction/templates-base-types";
import { TemplateEngineServer } from "@memberjunction/templates";
import { CommunicationEngine } from "@memberjunction/communication-engine";

@RegisterClass(MessageBuilder, 'AGUMessageBuilder')
export class AGUMessageBuilder implements MessageBuilder {
    public async GetMessage(currentUser: UserInfo): Promise<Message> {

        const sendGrid = CommunicationEngine.Instance.Providers.find(p => p.Name === "SendGrid")
        if (!sendGrid){
            throw new Error("SendGrid provider not found");
        }

        const email = sendGrid.MessageTypes.find(mt => mt.Name === "Email");
        if (!email){
        throw new Error("Email message type not found");
        } 

        const bodyTemplate: TemplateEntityExtended | undefined = TemplateEngineServer.Instance.Templates.find(t => t.ID === "5962F977-938D-EF11-8473-002248306CAC");
        const subjectTemplate: TemplateEntityExtended | undefined = TemplateEngineServer.Instance.Templates.find(t => t.ID === "5A62F977-938D-EF11-8473-002248306CAC");

        const msg: Message = new Message();

        let date: Date = new Date(0);
        date.setUTCSeconds(1733515200);

        msg.From = sendgridDomain;
        msg.MessageType = email;
        msg.HTMLBodyTemplate = bodyTemplate;
        msg.SubjectTemplate = subjectTemplate;
        msg.SendAt = date

        return msg;
    }
}

export function LoadAGUMessageBuilder(): void {

}