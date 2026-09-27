import { ToGatewayError } from '../gateway/errors';
import type {
    ServiceBusDeadLetterRequest, ServiceBusGateway, ServiceBusOutboundMessage, ServiceBusPeekRequest, ServiceBusReceivedEnvelope, ServiceBusReceiveRequest,
} from '../gateway/ServiceBusGateway';
import type { FunctionsMessageActions, FunctionsServiceBusMessage } from './functionTypes';

/** Sends and schedules to the topic; the SDK gateway implements it, tests substitute a fake. */
export type ServiceBusSender = Pick<ServiceBusGateway, 'Send' | 'Schedule'>;

/**
 * A ServiceBusGateway for one triggered message: settlement goes through the host's message actions, and retry
 * copies go through a sender. Receive and Peek are never called by the adapter and are unsupported here.
 */
export class FunctionMessageGateway implements ServiceBusGateway {
    private settled = false;

    constructor(private readonly message: FunctionsServiceBusMessage, private readonly actions: FunctionsMessageActions, private readonly sender: ServiceBusSender) {}

    public get Settled(): boolean {
        return this.settled;
    }

    public Send(topicName: string, messages: ServiceBusOutboundMessage[]): Promise<void> {
        return this.sender.Send(topicName, messages);
    }

    public Schedule(topicName: string, messages: ServiceBusOutboundMessage[], enqueueAt: Date): Promise<void> {
        return this.sender.Schedule(topicName, messages, enqueueAt);
    }

    public async Receive(_request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedEnvelope[]> {
        throw new Error('FunctionMessageGateway does not receive; the Functions trigger delivers the message');
    }

    public Complete(_message: ServiceBusReceivedEnvelope): Promise<boolean> {
        return this.settle('complete', () => this.actions.complete(this.message));
    }

    public Abandon(_message: ServiceBusReceivedEnvelope): Promise<boolean> {
        return this.settle('abandon', () => this.actions.abandon(this.message));
    }

    public DeadLetter(_message: ServiceBusReceivedEnvelope, request: ServiceBusDeadLetterRequest): Promise<boolean> {
        return this.settle('deadLetter', () => this.actions.deadLetter(this.message, {
            deadLetterReason: request.Reason, deadLetterErrorDescription: request.Description, propertiesToModify: request.Properties,
        }));
    }

    public async RenewLock(message: ServiceBusReceivedEnvelope): Promise<number | null> {
        if (this.settled) {
            return null;
        }
        if (!this.actions.renewMessageLock) {
            // No renewal available: report the lock as still held until its original expiry.
            return message.LockedUntilUtc;
        }
        try {
            const renewed = await this.actions.renewMessageLock(this.message);
            return renewed instanceof Date ? renewed.getTime() : message.LockedUntilUtc ?? Date.now();
        } catch (error) {
            const mapped = ToGatewayError(error, 'Functions renewMessageLock');
            if (mapped.Retryable) {
                throw mapped;
            }
            return null;
        }
    }

    public async Peek(_request: ServiceBusPeekRequest): Promise<ServiceBusReceivedEnvelope[]> {
        throw new Error('FunctionMessageGateway does not peek');
    }

    public async ReleaseReceiver(_handle: string): Promise<void> {
        // The host owns the receiver (and the session) for the invocation.
    }

    private async settle(operation: string, write: () => Promise<void>): Promise<boolean> {
        if (this.settled) {
            return false;
        }
        try {
            await write();
            this.settled = true;
            return true;
        } catch (error) {
            const mapped = ToGatewayError(error, `Functions ${operation}`);
            if (!mapped.Retryable) {
                // A lost lock (the host's lock expired) is the fence; anything else non-retryable is reported the same way.
                this.settled = true;
                return false;
            }
            throw mapped;
        }
    }
}
