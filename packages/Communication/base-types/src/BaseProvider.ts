import { BaseEntity, UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { CommunicationProviderEntity, CommunicationProviderMessageTypeEntity, CommunicationRunEntity } from "@memberjunction/core-entities";
import { TemplateEntityExtended } from "@memberjunction/templates-base-types";

/**
 * Information about a single recipient
 */
export class MessageRecipient {
    /**
     * The address is the "TO" field for the message and would be either an email, phone #, social handle, etc
     * it is provider-specific and can be anything that the provider supports as a recipient
     */
    public To: string;
    /**
     * The full name of the recipient, if available
     */
    public FullName?: string;

    /**
     * When using templates, this is the context data that is used to render the template for this recipient
     */
    public ContextData: any;
}


/**
 * Message class, holds information and functionality specific to a single message
 */
export class Message {
    /**
     * The type of message to send 
     */
    public MessageType: CommunicationProviderMessageTypeEntity;

    /**
     * The sender of the message, typically an email address but can be anything that is provider-specific for example for a provider that is a social
     * media provider, it might be a user's social media handle
     */
    public From: string;

    /**
     * The recipient of the message, typically an email address but can be anything that is provider-specific for example for a provider that is a social 
     * media provider, it might be a user's social media handle
     */
    public To: string;

    /**
     * The body of the message, used if BodyTemplate is not provided.
     */
    public Body?: string;
    /**
     * Optional, when provided, Body is ignored and the template is used to render the message. In addition, 
     * if BodyTemplate is provided it will be used to render the Body and if the template has HTML content it will 
     * also be used to render the HTMLBody
     */
    public BodyTemplate?: TemplateEntityExtended;

    /**
     * The HTML body of the message 
     */
    public HTMLBody?: string;
    /**
     * Optional, when provided, HTMLBody is ignored and the template is used to render the message. This OVERRIDES
     * the BodyTemplate's HTML content even if BodyTemplate is provided. This allows for flexibility in that you can
     * specify a completely different HTMLBodyTemplate and not just relay on the TemplateContent of the BodyTemplate having 
     * an HTML option.
     */
    public HTMLBodyTemplate?: TemplateEntityExtended;

    /**
     * The subject line for the message, used if SubjectTemplate is not provided and only supported by some providers
     */
    public Subject?: string;
    /**
     * Optional, when provided, Subject is ignored and the template is used to render the message
     */
    public SubjectTemplate?: TemplateEntityExtended;

    /**
     * Optional, any context data that is needed to render the message template
     */
    public ContextData?: any;

    constructor(copyFrom?: Message) {
        // copy all properties from the message to us, used for copying a message
        if (copyFrom)
            Object.assign(this, copyFrom);
    }
}

/**
 * This class is used to hold the results of a pre-processed message. This is used to hold the results of processing a message, for example, rendering a template.
 */
export abstract class ProcessedMessage extends Message {
    /**
     * The body of the message after processing
     */
    public ProcessedBody: string;

    /**
     * The HTML body of the message after processing
     */
    public ProcessedHTMLBody: string

    /**
     * The subject of the message after processing
     */
    public ProcessedSubject: string;


    public abstract Process(forceTemplateRefresh?: boolean, contextUser?: UserInfo): Promise<{Success: boolean, Message?: string}> 
}

/**
 * MessageResult class, holds information and functionality specific to a single message result
 */
export class MessageResult {
    public Run?: CommunicationRunEntity;
    public Message: ProcessedMessage;
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
    public abstract SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> 
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