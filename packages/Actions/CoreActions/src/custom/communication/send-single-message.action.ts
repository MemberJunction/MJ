import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { CommunicationEngine } from "@memberjunction/communication-engine";
import { Message } from "@memberjunction/communication-types";

/**
 * This class provides a simple wrapper of the most basic feature in the MJ Communication Framework, sending a single message. 
 * This class takes in a set of parameters and uses the MJ Communication Framework to send a single message to a single recipient.
 * 
 * Params:
 *  * Subject: The subject of the message.
 *  * Body: The body of the message.
 *  * To: The recipient of the message.
 *  * From: The sender of the message.
 *  * Provider: The name of the Communication Provider to use to send the message.
 *  * MessageType: The name of the Message Type (within the provider) to use to send the message.
 */
@RegisterClass(BaseAction, "__SendSingleMessage")
export class SendSingleMessageAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const subject = params.Params.find(p => p.Name.trim().toLowerCase() === 'subject');
        const body = params.Params.find(p => p.Name.trim().toLowerCase() === 'body');
        const to = params.Params.find(p => p.Name.trim().toLowerCase() === 'to');
        const from = params.Params.find(p => p.Name.trim().toLowerCase() === 'from');
        const provider = params.Params.find(p => p.Name.trim().toLowerCase() === 'provider');
        await CommunicationEngine.Instance.Config(false, params.ContextUser);
        const p = CommunicationEngine.Instance.Providers.find(p => p.Name === provider.Value)
        const messageType = params.Params.find(p => p.Name.trim().toLowerCase() === 'messagetype');
        const mt = p.MessageTypes.find(mt => mt.Name === messageType.Value);

        if (!p)
            throw new Error(`Provider ${provider.Value} not found.`);
        if (!mt)
            throw new Error(`Provider Message Type ${messageType.Value} not found.`);
        if (!from)
            throw new Error(`From is required.`);
        if (!to)
            throw new Error(`To is required.`);

        const m: Message = {
            MessageType: mt, 
            From: from.Value,
            To: to.Value,
            Subject: subject.Value,
            Body: body.Value,
        }
        const result = await CommunicationEngine.Instance.SendSingleMessage(provider.Value, messageType.Value, m);
        return {
            Success: result.Success,
            Message: result.Error,
            ResultCode: result.Success ? "SUCCESS" : "FAILED"            
        };
    }
}

export function LoadSendSingleMessageAction(){
    // this function is a stub that is used to force the bundler to include the above class in the final bundle and not tree shake them out
}