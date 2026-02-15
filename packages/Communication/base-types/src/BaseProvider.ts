import { BaseEntity, UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJCommunicationProviderEntity, MJCommunicationProviderMessageTypeEntity, MJCommunicationRunEntity, TemplateEntityExtended } from "@memberjunction/core-entities";
import { ProviderCredentialsBase } from "./CredentialUtils";

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
    public MessageType: MJCommunicationProviderMessageTypeEntity;

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
     * Recipients to send a copy of the message to, typically an email address
     */
    public CCRecipients?: string[];

    /**
     * Recipients to send a copy of the message to without revealing their email addresses to the other recipients, typically an email address
     */
    public BCCRecipients?: string[];

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

    /**
     * Optional, any headers to add to the message
     */
    public Headers?: Record<string, string>;

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
    public Run?: MJCommunicationRunEntity;
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
     * The identifier to get messages for - an email address, mailbox ID, in the case of SMS, could be a 
     * phone number. In the case of other systems could be a User ID for FB Messenger/WhatsApp, etc.
     * 
     * This is optional if the provider supports getting messages based on credentials alone as some
     * credentials/providers can be scoped to a specific mailbox/user.
     */
    Identifier?: string;

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

    /**
     * Optional, include the headers in the response (defaults to false)
     */
    IncludeHeaders?: boolean;
};

export type GetMessageMessage = {
    From: string;
    To: string,
    Body: string;
    /**
     * In some providers, such as MS Graph, replies can be sent to multiple other recipients
     * rather than just the original sender
     */
    ReplyTo?: string[];
    Subject?: string;
    ExternalSystemRecordID?: string;
    /**
     * The ID of the thread the message belongs to
     */
    ThreadID?: string;
    /**
     * Date and times associated with the message
     */
    CreatedAt?: Date;
    LastModifiedAt?: Date;
    ReceivedAt?: Date;
    SentAt?: Date;
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
    ToRecipients: string[];

    /*
    * The recipients to send a copy of the forwarded message to
    */
    CCRecipients?: string[];

    /*
    * The recipients to send a blind copy of the forwarded message to
    */
    BCCRecipients?: string[];
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

export type CreateDraftParams = {
    /**
     * The message to save as a draft
     */
    Message: ProcessedMessage;

    /**
     * Optional provider-specific context data
     */
    ContextData?: Record<string, any>;
};

export type CreateDraftResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * The ID of the created draft in the provider's system
     */
    DraftID?: string;

    /**
     * If populated, holds provider-specific result data
     */
    Result?: T;
};

// ============================================================================
// NEW OPTIONAL OPERATIONS - Types for extended provider capabilities
// These operations are optional and providers return "not supported" by default
// ============================================================================

/**
 * Parameters for getting a single message by ID
 */
export type GetSingleMessageParams<T = Record<string, any>> = {
    /**
     * The ID of the message to retrieve
     */
    MessageID: string;
    /**
     * Optional, include the headers in the response (defaults to false)
     */
    IncludeHeaders?: boolean;
    /**
     * Optional, include attachments metadata in the response (defaults to false)
     */
    IncludeAttachments?: boolean;
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of getting a single message
 */
export type GetSingleMessageResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * The retrieved message in standardized format
     */
    Message?: GetMessageMessage;
    /**
     * If populated, holds provider-specific data that is returned from the provider
     */
    SourceData?: T;
};

/**
 * Parameters for deleting a message
 */
export type DeleteMessageParams<T = Record<string, any>> = {
    /**
     * The ID of the message to delete
     */
    MessageID: string;
    /**
     * If true, permanently delete the message. If false, move to trash (if supported).
     * Defaults to false.
     */
    PermanentDelete?: boolean;
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of deleting a message
 */
export type DeleteMessageResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * If populated, holds provider-specific result data
     */
    Result?: T;
};

/**
 * Parameters for moving a message to a different folder
 */
export type MoveMessageParams<T = Record<string, any>> = {
    /**
     * The ID of the message to move
     */
    MessageID: string;
    /**
     * The ID of the destination folder
     */
    DestinationFolderID: string;
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of moving a message
 */
export type MoveMessageResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * The new message ID after moving (some providers assign new IDs)
     */
    NewMessageID?: string;
    /**
     * If populated, holds provider-specific result data
     */
    Result?: T;
};

/**
 * Represents a folder/mailbox in the provider's system
 */
export type MessageFolder = {
    /**
     * The unique ID of the folder
     */
    ID: string;
    /**
     * The display name of the folder
     */
    Name: string;
    /**
     * The ID of the parent folder, if any
     */
    ParentFolderID?: string;
    /**
     * The number of messages in the folder (if available)
     */
    MessageCount?: number;
    /**
     * The number of unread messages in the folder (if available)
     */
    UnreadCount?: number;
    /**
     * Whether this is a system folder (Inbox, Sent, Drafts, etc.)
     */
    IsSystemFolder?: boolean;
    /**
     * The type of system folder if IsSystemFolder is true
     */
    SystemFolderType?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'other';
};

/**
 * Parameters for listing folders
 */
export type ListFoldersParams<T = Record<string, any>> = {
    /**
     * Optional, the ID of the parent folder to list children of.
     * If not provided, lists root-level folders.
     */
    ParentFolderID?: string;
    /**
     * Optional, include message counts in the response (defaults to false)
     */
    IncludeCounts?: boolean;
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of listing folders
 */
export type ListFoldersResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * The list of folders
     */
    Folders?: MessageFolder[];
    /**
     * If populated, holds provider-specific result data
     */
    Result?: T;
};

/**
 * Parameters for marking message(s) as read or unread
 */
export type MarkAsReadParams<T = Record<string, any>> = {
    /**
     * The ID(s) of the message(s) to mark
     */
    MessageIDs: string[];
    /**
     * Whether to mark as read (true) or unread (false)
     */
    IsRead: boolean;
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of marking message(s) as read/unread
 */
export type MarkAsReadResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * If populated, holds provider-specific result data
     */
    Result?: T;
};

/**
 * Parameters for archiving a message
 */
export type ArchiveMessageParams<T = Record<string, any>> = {
    /**
     * The ID of the message to archive
     */
    MessageID: string;
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of archiving a message
 */
export type ArchiveMessageResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * If populated, holds provider-specific result data
     */
    Result?: T;
};

/**
 * Parameters for searching messages
 */
export type SearchMessagesParams<T = Record<string, any>> = {
    /**
     * The search query string
     */
    Query: string;
    /**
     * Maximum number of results to return
     */
    MaxResults?: number;
    /**
     * Optional folder ID to limit search scope
     */
    FolderID?: string;
    /**
     * Optional date range start
     */
    FromDate?: Date;
    /**
     * Optional date range end
     */
    ToDate?: Date;
    /**
     * Optional, search only in specific fields
     */
    SearchIn?: ('subject' | 'body' | 'from' | 'to' | 'all')[];
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of searching messages
 */
export type SearchMessagesResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * Messages matching the search criteria
     */
    Messages?: GetMessageMessage[];
    /**
     * Total number of matches (may be greater than returned results)
     */
    TotalCount?: number;
    /**
     * If populated, holds provider-specific result data
     */
    SourceData?: T[];
};

/**
 * Represents an attachment on a message
 */
export type MessageAttachment = {
    /**
     * The unique ID of the attachment
     */
    ID: string;
    /**
     * The filename of the attachment
     */
    Filename: string;
    /**
     * The MIME type of the attachment
     */
    ContentType: string;
    /**
     * The size of the attachment in bytes
     */
    Size: number;
    /**
     * Whether this is an inline attachment (embedded in message body)
     */
    IsInline?: boolean;
    /**
     * Content ID for inline attachments
     */
    ContentID?: string;
};

/**
 * Parameters for listing attachments on a message
 */
export type ListAttachmentsParams<T = Record<string, any>> = {
    /**
     * The ID of the message to list attachments for
     */
    MessageID: string;
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of listing attachments
 */
export type ListAttachmentsResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * The list of attachments
     */
    Attachments?: MessageAttachment[];
    /**
     * If populated, holds provider-specific result data
     */
    Result?: T;
};

/**
 * Parameters for downloading an attachment
 */
export type DownloadAttachmentParams<T = Record<string, any>> = {
    /**
     * The ID of the message containing the attachment
     */
    MessageID: string;
    /**
     * The ID of the attachment to download
     */
    AttachmentID: string;
    /**
     * Optional, provider-specific context data
     */
    ContextData?: T;
};

/**
 * Result of downloading an attachment
 */
export type DownloadAttachmentResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * The attachment content as a Buffer
     */
    Content?: Buffer;
    /**
     * The attachment content as a base64-encoded string
     */
    ContentBase64?: string;
    /**
     * The filename of the attachment
     */
    Filename?: string;
    /**
     * The MIME type of the attachment
     */
    ContentType?: string;
    /**
     * If populated, holds provider-specific result data
     */
    Result?: T;
};

/**
 * Enumeration of all supported provider operations.
 * Use with getSupportedOperations() to discover provider capabilities.
 */
export type ProviderOperation =
    | 'SendSingleMessage'
    | 'GetMessages'
    | 'GetSingleMessage'
    | 'ForwardMessage'
    | 'ReplyToMessage'
    | 'CreateDraft'
    | 'DeleteMessage'
    | 'MoveMessage'
    | 'ListFolders'
    | 'MarkAsRead'
    | 'ArchiveMessage'
    | 'SearchMessages'
    | 'ListAttachments'
    | 'DownloadAttachment';


/**
 * Base class for all communication providers. Each provider sub-classes this base class and implements functionality specific to the provider.
 *
 * @remarks
 * All methods accept an optional `credentials` parameter that allows per-request credential overrides.
 * When credentials are provided, they take precedence over environment variables.
 * Set `credentials.disableEnvironmentFallback = true` to disable environment variable fallback.
 *
 * Each provider defines its own credential interface that extends `ProviderCredentialsBase`.
 * For example, `SendGridCredentials`, `MSGraphCredentials`, etc.
 *
 * @example
 * ```typescript
 * // Use environment credentials (default behavior)
 * await provider.SendSingleMessage(message);
 *
 * // Override with request credentials
 * await provider.SendSingleMessage(message, { apiKey: 'SG.xxx' });
 *
 * // Require explicit credentials (no env fallback)
 * await provider.SendSingleMessage(message, {
 *     apiKey: 'SG.xxx',
 *     disableEnvironmentFallback: true
 * });
 * ```
 */
export abstract class BaseCommunicationProvider {
    /**
     * Sends a single message using the provider
     * @param message - The processed message to send
     * @param credentials - Optional credentials override for this request.
     *                      Provider-specific credential interface (e.g., SendGridCredentials).
     *                      If not provided, uses environment variables.
     * @returns Promise<MessageResult> - Result of the send operation
     */
    public abstract SendSingleMessage(
        message: ProcessedMessage,
        credentials?: ProviderCredentialsBase
    ): Promise<MessageResult>

    /**
     * Fetches messages using the provider
     * @param params - Parameters for fetching messages
     * @param credentials - Optional credentials override for this request
     * @returns Promise<GetMessagesResult> - Retrieved messages
     */
    public abstract GetMessages(
        params: GetMessagesParams,
        credentials?: ProviderCredentialsBase
    ): Promise<GetMessagesResult>

    /**
     * Forwards a message to another client using the provider
     * @param params - Parameters for forwarding the message
     * @param credentials - Optional credentials override for this request
     * @returns Promise<ForwardMessageResult> - Result of the forward operation
     */
    public abstract ForwardMessage(
        params: ForwardMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<ForwardMessageResult>

    /**
     * Replies to a message using the provider
     * @param params - Parameters for replying to the message
     * @param credentials - Optional credentials override for this request
     * @returns Promise<ReplyToMessageResult> - Result of the reply operation
     */
    public abstract ReplyToMessage(
        params: ReplyToMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<ReplyToMessageResult>

    /**
     * Creates a draft message using the provider.
     * Providers that don't support drafts should return Success: false
     * with an appropriate error message.
     * @param params - Parameters for creating the draft
     * @param credentials - Optional credentials override for this request
     * @returns Promise<CreateDraftResult> - Result containing draft ID if successful
     */
    public abstract CreateDraft(
        params: CreateDraftParams,
        credentials?: ProviderCredentialsBase
    ): Promise<CreateDraftResult>

    // ========================================================================
    // OPTIONAL OPERATIONS - Override in subclasses to provide implementation
    // Default implementations return "not supported" error
    // ========================================================================

    /**
     * Returns the name of this provider for use in error messages.
     * Override in subclasses to provide a more descriptive name.
     */
    protected get ProviderName(): string {
        return this.constructor.name;
    }

    /**
     * Returns the list of operations supported by this provider.
     * Override in subclasses to accurately reflect capabilities.
     * Default implementation returns only the core abstract methods.
     */
    public getSupportedOperations(): ProviderOperation[] {
        return ['SendSingleMessage', 'GetMessages', 'ForwardMessage', 'ReplyToMessage', 'CreateDraft'];
    }

    /**
     * Checks if this provider supports a specific operation.
     * @param operation - The operation to check
     * @returns true if the operation is supported
     */
    public supportsOperation(operation: ProviderOperation): boolean {
        return this.getSupportedOperations().includes(operation);
    }

    /**
     * Gets a single message by ID.
     * Override in subclasses that support this operation.
     * @param params - Parameters for retrieving the message
     * @param credentials - Optional credentials override for this request
     * @returns Promise<GetSingleMessageResult> - The retrieved message
     */
    public async GetSingleMessage(
        params: GetSingleMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<GetSingleMessageResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support GetSingleMessage (MessageID: ${params.MessageID}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Deletes a message.
     * Override in subclasses that support this operation.
     * @param params - Parameters for deleting the message
     * @param credentials - Optional credentials override for this request
     * @returns Promise<DeleteMessageResult> - Result of the delete operation
     */
    public async DeleteMessage(
        params: DeleteMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<DeleteMessageResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support DeleteMessage (MessageID: ${params.MessageID}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Moves a message to a different folder.
     * Override in subclasses that support this operation.
     * @param params - Parameters for moving the message
     * @param credentials - Optional credentials override for this request
     * @returns Promise<MoveMessageResult> - Result of the move operation
     */
    public async MoveMessage(
        params: MoveMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<MoveMessageResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support MoveMessage (MessageID: ${params.MessageID}, DestinationFolderID: ${params.DestinationFolderID}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Lists folders/mailboxes available in the provider.
     * Override in subclasses that support this operation.
     * @param params - Parameters for listing folders
     * @param credentials - Optional credentials override for this request
     * @returns Promise<ListFoldersResult> - The list of folders
     */
    public async ListFolders(
        params: ListFoldersParams,
        credentials?: ProviderCredentialsBase
    ): Promise<ListFoldersResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support ListFolders (ParentFolderID: ${params.ParentFolderID || 'root'}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Marks message(s) as read or unread.
     * Override in subclasses that support this operation.
     * @param params - Parameters for marking messages
     * @param credentials - Optional credentials override for this request
     * @returns Promise<MarkAsReadResult> - Result of the operation
     */
    public async MarkAsRead(
        params: MarkAsReadParams,
        credentials?: ProviderCredentialsBase
    ): Promise<MarkAsReadResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support MarkAsRead (MessageIDs: ${params.MessageIDs.length} message(s), IsRead: ${params.IsRead}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Archives a message.
     * Override in subclasses that support this operation.
     * @param params - Parameters for archiving the message
     * @param credentials - Optional credentials override for this request
     * @returns Promise<ArchiveMessageResult> - Result of the archive operation
     */
    public async ArchiveMessage(
        params: ArchiveMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<ArchiveMessageResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support ArchiveMessage (MessageID: ${params.MessageID}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Searches messages using a query string.
     * Override in subclasses that support this operation.
     * @param params - Parameters for searching messages
     * @param credentials - Optional credentials override for this request
     * @returns Promise<SearchMessagesResult> - Messages matching the search criteria
     */
    public async SearchMessages(
        params: SearchMessagesParams,
        credentials?: ProviderCredentialsBase
    ): Promise<SearchMessagesResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support SearchMessages (Query: ${params.Query}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Lists attachments on a message.
     * Override in subclasses that support this operation.
     * @param params - Parameters for listing attachments
     * @param credentials - Optional credentials override for this request
     * @returns Promise<ListAttachmentsResult> - The list of attachments
     */
    public async ListAttachments(
        params: ListAttachmentsParams,
        credentials?: ProviderCredentialsBase
    ): Promise<ListAttachmentsResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support ListAttachments (MessageID: ${params.MessageID}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Downloads an attachment from a message.
     * Override in subclasses that support this operation.
     * @param params - Parameters for downloading the attachment
     * @param credentials - Optional credentials override for this request
     * @returns Promise<DownloadAttachmentResult> - The attachment content
     */
    public async DownloadAttachment(
        params: DownloadAttachmentParams,
        credentials?: ProviderCredentialsBase
    ): Promise<DownloadAttachmentResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support DownloadAttachment (MessageID: ${params.MessageID}, AttachmentID: ${params.AttachmentID}, credentials provided: ${!!credentials})`
        };
    }

}

@RegisterClass(BaseEntity, 'MJ: Communication Providers') // sub-class to extend the properties of the base entity
export class CommunicationProviderEntityExtended extends MJCommunicationProviderEntity {
    private _ProviderMessageTypes: MJCommunicationProviderMessageTypeEntity[];
    public get MessageTypes(): MJCommunicationProviderMessageTypeEntity[] {
        return this._ProviderMessageTypes;
    }
    public set MessageTypes(value: MJCommunicationProviderMessageTypeEntity[]) {
        this._ProviderMessageTypes = value;
    }
}