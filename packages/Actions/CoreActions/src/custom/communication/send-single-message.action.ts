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
        // Extract all parameters first
        const subject = params.Params.find(p => p.Name.trim().toLowerCase() === 'subject');
        const body = params.Params.find(p => p.Name.trim().toLowerCase() === 'body');
        const to = params.Params.find(p => p.Name.trim().toLowerCase() === 'to');
        const from = params.Params.find(p => p.Name.trim().toLowerCase() === 'from');
        const provider = params.Params.find(p => p.Name.trim().toLowerCase() === 'provider');
        const messageType = params.Params.find(p => p.Name.trim().toLowerCase() === 'messagetype');

        // Validate ALL required parameters exist BEFORE using their values
        if (!provider || !provider.Value)
            throw new Error('Provider parameter is required');
        if (!messageType || !messageType.Value)
            throw new Error('MessageType parameter is required');
        if (!from || !from.Value)
            throw new Error('From parameter is required');
        if (!to || !to.Value)
            throw new Error('To parameter is required');

        // Initialize Communication Engine
        await CommunicationEngine.Instance.Config(false, params.ContextUser);

        // Lookup provider and validate it exists BEFORE accessing properties
        const p = CommunicationEngine.Instance.Providers.find(p => p.Name === provider.Value);
        if (!p)
            throw new Error(`Provider '${provider.Value}' not found. Available providers: ${CommunicationEngine.Instance.Providers.map(p => p.Name).join(', ')}`);

        // NOW safe to access p.MessageTypes
        const mt = p.MessageTypes.find(mt => mt.Name === messageType.Value);
        if (!mt)
            throw new Error(`Provider Message Type '${messageType.Value}' not found for provider '${provider.Value}'. Available message types: ${p.MessageTypes.map(mt => mt.Name).join(', ')}`);

        // Build message object
        const m: Message = {
            MessageType: mt,
            From: from.Value,
            To: to.Value,
            Subject: subject?.Value,
            Body: body?.Value,
        }

        // Send message
        const result = await CommunicationEngine.Instance.SendSingleMessage(provider.Value, messageType.Value, m);
        return {
            Success: result.Success,
            Message: result.Error,
            ResultCode: result.Success ? "SUCCESS" : "FAILED"
        };
    }
}
