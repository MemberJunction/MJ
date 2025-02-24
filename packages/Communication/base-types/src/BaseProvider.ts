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
     * The name of the sender, typically the display name of the email address
     */
    public FromName?: string;

    /**
     * The recipient of the message, typically an email address but can be anything that is provider-specific for example for a provider that is a social 
     * media provider, it might be a user's social media handle
     */
    public To: string;

    /**
     * The date and time to send the message, if not provided the message will be sent immediately
     */
    public SendAt?: Date;

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
        if (copyFrom){
            Object.assign(this, copyFrom);
        }
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
};

export type BaseMessageResult = {
    Success: boolean;
    ErrorMessage?: string;
}

export type GetMessagesParams<T = Record<string, any>> = {
    /**
     * The number of messages to return
     */
    NumMessages: number;
    /**
     * Optional. If true, only messages not marked as read will be returned
     */
    UnreadOnly?: boolean;
    /**
     * Optional, any provider-specific parameters that are needed to get messages
     */
    ContextData?: T;
};

export type GetMessageMessage = {
    From: string;
    To: string,
    /**
     * In some providers, such as MS Graph, replies can be sent to multiple other recipients
     * rather than just the original sender
     */
    ReplyTo: string[];
    Subject: string;
    Body: string;
    ExternalSystemRecordID: string;
};

export type GetMessagesResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * If populated, holds provider-specific data that is returned from the provider
     */
    SourceData?: T[];
    /**
     * Messages returned in a standardized format
     */
    Messages: GetMessageMessage[];
};

export type ForwardMessageParams = {
    /**
     * The ID of the message to forward
     */
    MessageID: string;
    /**
     * An optional message to go along with the forwarded message
     */
    Message?: string;
    /*
    * The recipients to forward the message to
    */
    ToRecipients: {
        Name: string,
        Address: string;
    }[];
};

export type ForwardMessageResult<T = Record<string, any>> = BaseMessageResult & {
    Result?: T;
};

export type ReplyToMessageParams<T = Record<string, any>> = {
    /**
     * The ID of the message to reply to
     */
    MessageID: string;
    /**
     * The message to send as a reply
     */
    Message: ProcessedMessage;

    /*
    * Provider-specific context data
    */
    ContextData?: T
};

export type ReplyToMessageResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * If populated, holds provider-specific result of replying to the message
     */
    Result?: T;
};


/**
 * Base class for all communication providers. Each provider sub-classes this base class and implements functionality specific to the provider.
 */
export abstract class BaseCommunicationProvider {
    /**
     * 
     */
    public abstract SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> 

    /**
     * Fetches messages using the provider 
     */
    public abstract GetMessages(params: GetMessagesParams): Promise<GetMessagesResult>

    /**
     * Forwards a message to another client using the provider
     */
    public abstract ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult>

    /**
     * Replies to a message using the provider
     */
    public abstract ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult>

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