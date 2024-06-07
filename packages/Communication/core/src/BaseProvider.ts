import { BaseEntity } from "@memberjunction/core";
import { CommunicationProviderEntity, CommunicationProviderMessageTypeEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

/**
 * Message class, holds information and functionality specific to a single message
 */
export class Message {
    public Subject: string;
    public To: string;
    public Body: string;
    public MessageType: CommunicationProviderMessageTypeEntity;
}

/**
 * MessageResult class, holds information and functionality specific to a single message result
 */
export class MessageResult {
    public Message: Message;
    public Success: boolean;
    public Error: string;
}

/**
 * Base class for all communication providers. Each provider sub-classes this base class and implements functionality specific to the provider.
 */
export abstract class BaseCommunicationProvider {
    /**
     * 
     */
    public abstract SendSingleMessage(message: Message): Promise<MessageResult> 
}

@RegisterClass(BaseEntity, 'Communication Providers') // sub-class to extend the properties of the base entity
export class CommunicationProviderEntityExtended extends CommunicationProviderEntity {
    private _ProviderMessageTypes: CommunicationProviderMessageTypeEntity[];
    public get MessageTypes(): CommunicationProviderMessageTypeEntity[] {
        return this._ProviderMessageTypes;
    }
    public set MessageTypes(value: CommunicationProviderMessageTypeEntity[]) {
        this._ProviderMessageTypes = value;
    }
}