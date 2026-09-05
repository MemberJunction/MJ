import { BaseEntity, UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJCommunicationProviderEntity, MJCommunicationProviderMessageTypeEntity, MJCommunicationRunEntity, MJTemplateEntityExtended } from "@memberjunction/core-entities";
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
    public BodyTemplate?: MJTemplateEntityExtended;

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
    public HTMLBodyTemplate?: MJTemplateEntityExtended;

    /**
     * The subject line for the message, used if SubjectTemplate is not provided and only supported by some providers
     */
    public Subject?: string;
    /**
     * Optional, when provided, Subject is ignored and the template is used to render the message
     */
    public SubjectTemplate?: MJTemplateEntityExtended;

    /**
     * Optional, any context data that is needed to render the message template
     */
    public ContextData?: any;

    /**
     * Optional, any headers to add to the message
     */
    public Headers?: Record<string, string>;

    /**
     * Optional. When true, the send is a DRY RUN: the engine and the provider execute their FULL
     * pipeline — validation, credential resolution, addressing, template resolution/rendering and
     * provider-specific payload construction — but the provider MUST NOT contact its external
     * service (no email/SMS/push/API call leaves the process). The operation returns success with
     * the result's `DryRun` flag set to true so callers can distinguish a rehearsed send from a
     * real one, and the Communication Log written for the send carries a `DryRun: true` marker in
     * its MessageContent JSON.
     *
     * Distinct from the engine's `previewOnly` parameter: `previewOnly` stops right after template
     * processing (the provider is never invoked and no Communication Log is written), while
     * `DryRun` exercises the provider's preflight + payload construction AND the audit-log
     * lifecycle, stopping only at the external transport boundary.
     */
    public DryRun?: boolean;

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
    /**
     * True when this result was produced by a dry-run send (`Message.DryRun` was true): the
     * provider ran its full preflight + payload construction and reported success WITHOUT
     * contacting its external service. Absent/false for real sends.
     */
    public DryRun?: boolean;
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

    /**
     * Optional. Restrict results to messages received at or AFTER this instant.
     *
     * Inclusive, matching the underlying provider filters this maps onto (Graph `ge`). Callers doing
     * incremental sync should expect the boundary message back again and de-duplicate on their own
     * key; returning it twice is recoverable, skipping it silently is not.
     *
     * NOT every provider can honour this. Check `MessageRetrievalCapabilities.FilterByReceivedDate`
     * before relying on it, or read `GetMessagesResult.AppliedFilters` afterwards — a provider that
     * cannot filter by date returns unfiltered results rather than failing, so a caller that assumes
     * support and checks neither will silently process messages it asked to exclude.
     */
    ReceivedAfter?: Date;

    /**
     * Optional. Restrict results to messages received at or BEFORE this instant. Inclusive, and
     * subject to the same capability caveat as `ReceivedAfter`.
     */
    ReceivedBefore?: Date;
};

/**
 * What a provider can actually do when asked to narrow a message read.
 *
 * This exists because `GetMessages` is abstract: there is no base implementation to fall back on, so
 * an unsupported filter is simply ignored by whichever provider received it. Ignoring a date bound
 * is not a cosmetic failure — the caller gets MORE messages than it asked for and has no way to tell
 * that from a mailbox that genuinely holds them. Declaring capability makes that knowable before the
 * call, and `GetMessagesResult.AppliedFilters` makes it checkable after.
 *
 * The base class declares everything FALSE. A provider opts in by overriding, so a provider that has
 * not considered the question is described accurately rather than optimistically.
 */
export type MessageRetrievalCapabilities = {
    /** Whether `ReceivedAfter` / `ReceivedBefore` are pushed to the provider rather than ignored. */
    FilterByReceivedDate: boolean;
    /** Whether `UnreadOnly` is pushed to the provider rather than ignored. */
    FilterByUnread: boolean;
};

/**
 * Which of the requested narrowings the provider actually applied on this call.
 *
 * A field is true only when the provider pushed that constraint down to the underlying service. It
 * is false both when the caller did not ask and when the provider could not comply, so it answers
 * "is this result set narrowed" rather than "what did the caller request" — the former is what a
 * caller needs to decide whether to filter again itself.
 */
export type AppliedMessageFilters = {
    ReceivedAfter: boolean;
    ReceivedBefore: boolean;
    UnreadOnly: boolean;
};


export type GetMessageMessage = {
    From: string;
    To: string,
    /**
     * All To recipients of the message, normalized to bare email addresses.
     * Unlike `To` — whose meaning is provider-specific for historical reasons
     * (MS Graph populates it from the first reply-to address; Gmail from the raw
     * `To:` header) — this is the actual recipient list as received. Optional:
     * providers that cannot supply it leave it undefined.
     */
    ToRecipients?: string[];
    /**
     * All CC recipients of the message, normalized to bare email addresses.
     * Optional: providers that cannot supply it leave it undefined.
     */
    CCRecipients?: string[];
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
    /**
     * Which requested narrowings were actually pushed to the provider. Optional for backwards
     * compatibility: a provider that predates this field returns undefined, which a caller must read
     * as "unknown", NOT as "applied".
     */
    AppliedFilters?: AppliedMessageFilters;
};

/**
 * Calendar retrieval.
 *
 * SEPARATE FROM GetMessages RATHER THAN A MODE OF IT. A calendar read is bounded by a TIME WINDOW,
 * not by a count and a folder: "the next 200 messages" is a sensible request and "the next 200
 * events" is not — what a caller wants is "everything between these two instants". Folding that into
 * `GetMessagesParams` would have left `NumMessages` meaning something different depending on a flag.
 */
export type GetEventsParams<T = Record<string, any>> = {
    /**
     * Whose calendar to read - typically an email address. Optional for providers whose credentials
     * are already scoped to one calendar, matching `GetMessagesParams.Identifier`.
     */
    Identifier?: string;
    /** Hard cap on events returned. A window can be far larger than a caller wants to process. */
    NumEvents: number;
    /**
     * Inclusive start of the window.
     *
     * SUPPLYING BOTH BOUNDS CHANGES WHAT YOU GET, and providers must say which they did via
     * `RecurrenceExpanded`. With a window, a provider that can expand recurrence returns one entry
     * per OCCURRENCE; without one it returns series masters, and a weekly stand-up is a single row
     * whose start time is months old. For logging what actually happened, occurrences are what you
     * want — so callers doing incremental sync should pass both.
     */
    StartDateTime?: Date;
    /** Inclusive end of the window. See {@link GetEventsParams.StartDateTime}. */
    EndDateTime?: Date;
    /**
     * Whether to include events the organizer cancelled. Default false: a cancellation is normally
     * noise, but a system that logs history needs it, and it cannot be recovered after the fact.
     */
    IncludeCancelled?: boolean;
    /** Provider-specific escape hatch, matching `GetMessagesParams.ContextData`. */
    ContextData?: T;
};

/**
 * One calendar event, normalized.
 *
 * Deliberately thin. `SourceData` on the result carries the provider's own payload verbatim, and a
 * caller that needs fidelity should read that — the same split `GetMessagesResult` makes, and for
 * the same reason: normalizing is lossy and the losses differ per provider.
 */
export type GetEventsEvent = {
    /** Provider's stable id for this event or occurrence. The de-duplication key. */
    ExternalSystemRecordID: string;
    /** The series this occurrence belongs to, when the provider distinguishes them. */
    SeriesID?: string | null;
    Subject: string;
    Body?: string;
    /** Null when the provider supplied a start that could not be interpreted - never silently "now". */
    StartTime: Date | null;
    EndTime: Date | null;
    Location?: string | null;
    Organizer?: string;
    /** Bare addresses, organizer excluded. */
    Attendees: string[];
    IsCancelled: boolean;
};

export type GetEventsResult<T = Record<string, any>> = BaseMessageResult & {
    /** The provider's own payloads, verbatim. */
    SourceData?: T[];
    /** Normalized events. */
    Events: GetEventsEvent[];
    /**
     * Whether recurring series were expanded into individual occurrences.
     *
     * Reported rather than assumed because it silently changes what the caller received, and the two
     * are indistinguishable by inspection: a series master and a single occurrence look alike. A
     * caller logging attendance needs occurrences; one listing "what meetings exist" may not.
     */
    RecurrenceExpanded?: boolean;
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

// ============================================================================
// PUSH-NOTIFICATION SUBSCRIPTIONS - Types for provider-agnostic push support
// These operations are optional and providers return "not supported" by default.
// Providers stay stateless: they know HOW to create/renew/delete a subscription with
// the remote service and HOW to parse an inbound notification, but never store state.
// ============================================================================

/**
 * The kinds of change a subscription can watch. Providers support a subset (discover
 * via {@link SubscriptionCapabilities.SupportedChangeTypes}).
 */
export type SubscriptionChangeType = 'created' | 'updated' | 'deleted';

/**
 * Parameters for creating a push-notification subscription with a remote messaging
 * service (e.g. Microsoft Graph change notifications).
 */
export type CreateSubscriptionParams<T = Record<string, any>> = {
    /**
     * What to watch - same semantics as {@link GetMessagesParams.Identifier}: an email
     * address/mailbox for email providers, a phone number for SMS, etc. Optional when
     * the credential itself is scoped to one mailbox/number.
     */
    Identifier?: string;
    /**
     * Which changes to watch, e.g. ['created']. The provider validates these against
     * what the remote service supports.
     */
    ChangeTypes: SubscriptionChangeType[];
    /**
     * Public HTTPS endpoint the remote service will call when a matching change occurs.
     */
    NotificationUrl: string;
    /**
     * Consumer-generated opaque secret the remote service echoes back in every
     * notification (Graph `clientState`). The consumer uses it to authenticate inbound
     * notifications. Providers pass it through; they do not store it.
     */
    ClientState: string;
    /**
     * Requested expiration. Providers clamp to the service maximum (Graph mail:
     * 4230 minutes). Ignored by services whose registrations don't expire.
     */
    RequestedExpiration?: Date;
    /**
     * Optional secondary endpoint for lifecycle events (Graph
     * `lifecycleNotificationUrl` - reauthorization required, subscription removed, etc.).
     */
    LifecycleNotificationUrl?: string;
    /**
     * Provider-specific extras (e.g. Graph: `{ folderName }` or `{ folderId }`;
     * Gmail: Pub/Sub topic).
     */
    ContextData?: T;
};

/**
 * Result of creating or renewing a subscription.
 */
export type SubscriptionResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * The remote service's subscription ID. The consumer must persist this to renew or
     * delete the subscription later.
     */
    SubscriptionID?: string;
    /**
     * When the subscription expires and must be renewed. `undefined` = never expires.
     */
    ExpiresAt?: Date;
    /**
     * If populated, holds provider-specific result data (matches the existing
     * `XResult<T>` convention across this file).
     */
    Result?: T;
};

/**
 * Parameters for renewing an existing subscription before it expires.
 */
export type RenewSubscriptionParams<T = Record<string, any>> = {
    /**
     * The remote service's subscription ID returned from {@link CreateSubscriptionParams}.
     */
    SubscriptionID: string;
    /**
     * Requested new expiration. Providers clamp to the service maximum.
     */
    RequestedExpiration?: Date;
    /**
     * Optional, provider-specific context data.
     */
    ContextData?: T;
};

/**
 * Parameters for deleting an existing subscription.
 */
export type DeleteSubscriptionParams<T = Record<string, any>> = {
    /**
     * The remote service's subscription ID to delete.
     */
    SubscriptionID: string;
    /**
     * Optional, provider-specific context data.
     */
    ContextData?: T;
};

/**
 * Provider metadata describing its subscription capabilities, so consumers can schedule
 * renewals and validate change types generically. Returned by
 * {@link BaseCommunicationProvider.GetSubscriptionCapabilities}; `undefined` there means
 * subscriptions are not supported.
 */
export type SubscriptionCapabilities = {
    /**
     * The maximum lifetime the remote service allows, in minutes. `undefined` = the
     * service's subscriptions do not expire.
     */
    MaxLifetimeMinutes?: number;
    /**
     * The change types this provider/service supports watching.
     */
    SupportedChangeTypes: SubscriptionChangeType[];
    /**
     * True when the remote service validates the notification endpoint at create time
     * (Graph performs a synchronous handshake requiring the endpoint to echo a token).
     */
    RequiresEndpointValidation: boolean;
    /**
     * True when the provider can programmatically create/delete the inbound registration
     * with the remote service ({@link BaseCommunicationProvider.CreateSubscription} /
     * {@link BaseCommunicationProvider.DeleteSubscription} are implemented). When false, the
     * provider only PARSES inbound notifications ({@link BaseCommunicationProvider.ParseNotification})
     * and the registration is managed out-of-band (DNS/console).
     *
     * Note {@link BaseCommunicationProvider.RenewSubscription} is independent: a provider may
     * support management but have no renewal concept (its registrations don't expire -
     * {@link SubscriptionCapabilities.MaxLifetimeMinutes} `undefined`), e.g. Twilio/SendGrid.
     * Only providers with a finite `MaxLifetimeMinutes` implement `RenewSubscription`.
     */
    SupportsSubscriptionManagement: boolean;
    /**
     * True when {@link BaseCommunicationProvider.ParseNotification} returns the full message
     * inline in {@link NormalizedNotification.Message} (SendGrid Inbound Parse, Twilio SMS),
     * so consumers need not re-fetch. False for HINT-mode providers (Graph, Gmail) where the
     * notification only carries {@link NormalizedNotification.MessageIDs} to pull with.
     */
    DeliversPayloadInline: boolean;
};

/**
 * Transport-neutral capture of an inbound webhook call. The consumer owns the HTTP
 * server and builds this from the raw request; base-types stays web-framework-free.
 *
 * DECODING CONTRACT: `Headers` and `QueryParams` contain framework-DECODED values
 * (what Express/Fastify hand you). Providers use them verbatim and never URL-decode
 * again. `RawBody` is the exact raw body string, byte-for-byte - required for
 * signature-verification schemes.
 */
export type WebhookNotificationInput = {
    /**
     * HTTP headers with header names lower-cased; values already framework-decoded.
     */
    Headers: Record<string, string>;
    /**
     * Query-string parameters; values already framework-decoded - providers must not
     * decode again.
     */
    QueryParams: Record<string, string>;
    /**
     * The exact raw body string, byte-for-byte.
     */
    RawBody: string;
    /**
     * The full public URL the notification was received on (used by signature schemes
     * such as Twilio's, which sign the URL plus params).
     */
    RequestUrl?: string;
    /**
     * The HTTP method of the inbound request.
     */
    Method?: string;
};

/**
 * A single normalized notification parsed from an inbound webhook payload.
 *
 * ## Two delivery modes: HINT vs. INLINE PAYLOAD
 *
 * A notification is a HINT by default: it signals that something changed and the consumer
 * re-fetches content through the authenticated pull methods
 * ({@link BaseCommunicationProvider.GetMessages} / {@link BaseCommunicationProvider.GetSingleMessage}),
 * addressed by {@link NormalizedNotification.MessageIDs}. This is the safest mode - a forged
 * notification is harmless (worst case: one extra empty sweep) because the real content only
 * ever comes from an authenticated pull.
 *
 * Some transports, however, deliver the FULL message inline in the webhook body itself
 * (SendGrid Inbound Parse posts the entire parsed email; Twilio posts the SMS body). For
 * those, re-fetching is wasteful or impossible (SendGrid has no inbound-retrieval API at
 * all). Such providers populate {@link NormalizedNotification.Message} with the parsed
 * content, and the consumer uses it directly instead of pulling. A provider signals which
 * mode it uses via {@link SubscriptionCapabilities.DeliversPayloadInline}.
 *
 * This inline-OR-pointer shape mirrors the established MJ duality (`FileOutputRef`'s
 * `fileData?` vs `fileId?`, `ArtifactVersion.ContentMode` 'Text' vs 'File', `MediaOutput`'s
 * `data?` vs `url?`): exactly one of the two carries the content for a given provider.
 *
 * SECURITY NOTE for inline mode: because the payload IS the data path, a provider that sets
 * {@link NormalizedNotification.Message} MUST also authenticate the notification
 * ({@link ParseNotificationResult.SignatureValid}) - or the consumer must - since a forged
 * inline notification is no longer harmless. Providers whose inbound transport is unsigned
 * (SendGrid Inbound Parse) rely on the consumer's URL secret / network controls; this is
 * documented per-provider.
 */
export type NormalizedNotification = {
    /**
     * `'message'` for a content-change notification, `'lifecycle'` for a subscription
     * lifecycle event (see {@link NormalizedNotification.LifecycleEvent}).
     */
    Kind: 'message' | 'lifecycle';
    /**
     * The remote subscription ID this notification concerns, when the service includes
     * it (Graph does).
     */
    SubscriptionID?: string;
    /**
     * Echo of {@link CreateSubscriptionParams.ClientState}. The consumer MUST verify it
     * (constant-time) against the secret stored alongside the subscription.
     */
    ClientState?: string;
    /**
     * Which mailbox / phone number this concerns, when derivable from the payload.
     */
    Identifier?: string;
    /**
     * The kind of change, when the service reports it.
     */
    ChangeType?: SubscriptionChangeType;
    /**
     * Provider message IDs when the notification carries them (Graph `resourceData.id`,
     * Twilio `MessageSid`). An empty array means "something changed; do a targeted
     * {@link BaseCommunicationProvider.GetMessages}". This is the HINT/pointer path; for
     * inline-payload providers it may still be populated (e.g. Twilio's `MessageSid`) so a
     * consumer CAN re-fetch, but {@link NormalizedNotification.Message} is present and
     * authoritative.
     */
    MessageIDs: string[];
    /**
     * The fully parsed inbound message, present ONLY when the provider's transport delivers
     * the content inline (see {@link SubscriptionCapabilities.DeliversPayloadInline}).
     * When set, the consumer uses this directly and does NOT need to re-fetch via
     * {@link BaseCommunicationProvider.GetMessages}. `undefined` for HINT-mode providers
     * (Graph, Gmail), where the content must be pulled using {@link NormalizedNotification.MessageIDs}.
     */
    Message?: GetMessageMessage;
    /**
     * For `Kind: 'lifecycle'`: which lifecycle event occurred.
     */
    LifecycleEvent?: 'subscriptionRemoved' | 'missed' | 'reauthorizationRequired';
    /**
     * The raw provider payload for this item, for consumer needs beyond the normalized
     * fields above.
     */
    RawData?: unknown;
};

/**
 * Result of parsing an inbound push notification via
 * {@link BaseCommunicationProvider.ParseNotification}.
 */
export type ParseNotificationResult = BaseMessageResult & {
    /**
     * Endpoint-validation handshake (Graph `validationToken`). When set, the consumer
     * MUST send exactly this response and process nothing else.
     */
    Handshake?: {
        /** The HTTP status to respond with (Graph handshake: 200). */
        ResponseStatus: number;
        /** The exact body to respond with (the validation token). */
        ResponseBody: string;
        /** The Content-Type to respond with (Graph handshake: 'text/plain'). */
        ResponseContentType: string;
    };
    /**
     * Cryptographic signature-verification outcome, where the provider has a scheme
     * (Twilio HMAC, SendGrid ECDSA). `undefined` = no signature scheme exists (Graph) -
     * the consumer authenticates via {@link NormalizedNotification.ClientState} instead.
     */
    SignatureValid?: boolean;
    /**
     * The normalized notifications extracted from the payload (one per item in the
     * service's batch). Empty for handshake and malformed-input results.
     */
    Notifications: NormalizedNotification[];
    /**
     * The HTTP status the consumer should respond with after accepting (Graph expects a
     * fast 202).
     */
    SuggestedResponseStatus: number;
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
    | 'DownloadAttachment'
    | 'CreateSubscription'
    | 'RenewSubscription'
    | 'DeleteSubscription'
    | 'ParseNotification'
    | 'GetEvents';


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
     * What this provider can narrow on when reading messages. See `MessageRetrievalCapabilities`.
     *
     * Deliberately declares nothing supported. A provider that can push a filter down overrides this
     * and says so; one that has not been updated keeps describing itself accurately instead of
     * promising a filter it silently ignores.
     */
    public get MessageRetrieval(): MessageRetrievalCapabilities {
        return { FilterByReceivedDate: false, FilterByUnread: false };
    }

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
     * Reads calendar events for one identifier.
     *
     * CONCRETE, NOT ABSTRACT, and deliberately so: making it abstract would break every existing
     * provider at compile time for a capability most of them will never have. A provider that
     * supports it overrides this and adds 'GetEvents' to getSupportedOperations(); everything else
     * inherits a refusal that NAMES ITSELF, so a caller learns which provider declined rather than
     * receiving an empty list it cannot distinguish from an empty calendar.
     *
     * That distinction is the whole reason this returns Success:false rather than `{Events: []}`.
     * "This provider cannot look" and "there was nothing in the window" are different facts, and a
     * caller advancing a watermark must not treat the first as the second.
     *
     * @param params - which calendar, what window, how many
     * @param credentials - optional per-request credentials override
     */
    public async GetEvents(
        params: GetEventsParams,
        credentials?: ProviderCredentialsBase
    ): Promise<GetEventsResult> {
        return {
            Success: false,
            Events: [],
            ErrorMessage: `${this.ProviderName} does not support GetEvents (Identifier: ${params.Identifier || 'none'}, credentials provided: ${!!credentials})`
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

    // ========================================================================
    // PUSH-NOTIFICATION SUBSCRIPTIONS - Override in subclasses to provide push support
    // Default implementations return "not supported". Providers stay stateless: they
    // create/renew/delete subscriptions with the remote service and parse inbound
    // notifications, but never persist subscription state. See the type docs above.
    //
    // TWO PUSH SHAPES (a provider is one or the other, never neither-when-SupportsPush):
    //   • Subscription-managed (Graph, Gmail): the provider programmatically creates the
    //     registration (CreateSubscription), the service delivers HINT notifications, the
    //     consumer re-fetches via GetMessages. May expire (RenewSubscription).
    //   • Inbound-parse (SendGrid, Twilio): the notification carries the payload inline;
    //     ParseNotification populates NormalizedNotification.Message. Management may exist
    //     (Twilio SmsUrl, SendGrid Parse Settings) but there is no expiry/renewal.
    //
    // CAPABILITY GATE: SupportsPush === (GetSubscriptionCapabilities() !== undefined). The
    // default SupportsPush getter derives from capabilities, so a provider "opts in" simply
    // by returning capabilities - no separate flag to keep in sync (avoids the drift a hand-
    // maintained boolean invites). Any push provider MUST implement ParseNotification and
    // list it in getSupportedOperations(). Whether it ALSO implements Create/Renew/Delete is
    // expressed by SubscriptionCapabilities.SupportsSubscriptionManagement + MaxLifetimeMinutes,
    // and those ops must appear in getSupportedOperations() when implemented.
    // ========================================================================

    /**
     * Convenience gate: `true` when this provider supports inbound push in ANY form
     * (subscription-managed or inbound-parse), `false` otherwise. Lets callers cleanly
     * short-circuit — `if (provider.SupportsPush) { ... }` — instead of probing individual
     * operations.
     *
     * Derived from {@link GetSubscriptionCapabilities} so it stays in lockstep with actual
     * capability: providers that support push return capabilities and thereby report
     * `SupportsPush === true` for free; providers that don't return `undefined` and report
     * `false`. Subclasses normally do NOT override this — override
     * {@link GetSubscriptionCapabilities} instead.
     */
    public get SupportsPush(): boolean {
        return this.GetSubscriptionCapabilities() !== undefined;
    }

    /**
     * Creates a push-notification subscription with the remote messaging service.
     * Override in subclasses that support this operation.
     * @param params - Parameters describing what to watch and where to notify
     * @param credentials - Optional credentials override for this request
     * @returns Promise<SubscriptionResult> - The created subscription's ID and expiration
     */
    public async CreateSubscription(
        params: CreateSubscriptionParams,
        credentials?: ProviderCredentialsBase
    ): Promise<SubscriptionResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support CreateSubscription (Identifier: ${params.Identifier}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Renews an existing subscription before it expires. The caller MUST pass credentials
     * for the same account/app registration used to create the subscription.
     * Override in subclasses that support this operation.
     * @param params - Parameters identifying the subscription and the new expiration
     * @param credentials - Optional credentials override for this request
     * @returns Promise<SubscriptionResult> - The renewed subscription's expiration
     */
    public async RenewSubscription(
        params: RenewSubscriptionParams,
        credentials?: ProviderCredentialsBase
    ): Promise<SubscriptionResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support RenewSubscription (SubscriptionID: ${params.SubscriptionID}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Deletes an existing subscription. The caller MUST pass credentials for the same
     * account/app registration used to create the subscription. Implementations should
     * treat "already gone" (e.g. 404) as success - deletion is idempotent from the
     * consumer's perspective.
     * Override in subclasses that support this operation.
     * @param params - Parameters identifying the subscription to delete
     * @param credentials - Optional credentials override for this request
     * @returns Promise<BaseMessageResult> - Result of the delete operation
     */
    public async DeleteSubscription(
        params: DeleteSubscriptionParams,
        credentials?: ProviderCredentialsBase
    ): Promise<BaseMessageResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support DeleteSubscription (SubscriptionID: ${params.SubscriptionID}, credentials provided: ${!!credentials})`
        };
    }

    /**
     * Parses and validates an inbound push notification. This is a pure operation: no
     * network calls. It MUST be safe on hostile/garbage input - never throw on malformed
     * payloads; return `Success: false` with `SuggestedResponseStatus: 400` instead.
     *
     * When the result carries a {@link ParseNotificationResult.Handshake}, the consumer
     * must send exactly that response and process nothing else (endpoint validation).
     * Override in subclasses that support this operation.
     * @param input - Transport-neutral capture of the inbound webhook request
     * @param credentials - Optional credentials override (for schemes that verify signatures)
     * @returns Promise<ParseNotificationResult> - Normalized notifications and/or handshake
     */
    public async ParseNotification(
        input: WebhookNotificationInput,
        credentials?: ProviderCredentialsBase
    ): Promise<ParseNotificationResult> {
        return {
            Success: false,
            ErrorMessage: `${this.ProviderName} does not support ParseNotification (body length: ${input.RawBody?.length ?? 0}, credentials provided: ${!!credentials})`,
            Notifications: [],
            SuggestedResponseStatus: 400
        };
    }

    /**
     * Returns this provider's subscription capabilities, or `undefined` when subscriptions
     * are not supported. Consumers use this to schedule renewals and validate change types
     * generically. Override in subclasses that support subscriptions.
     *
     * INVARIANT: returning a defined value here REQUIRES the four subscription operations
     * to appear in {@link getSupportedOperations}.
     * @returns SubscriptionCapabilities when supported, otherwise undefined
     */
    public GetSubscriptionCapabilities(): SubscriptionCapabilities | undefined {
        return undefined;
    }

}

@RegisterClass(BaseEntity, 'MJ: Communication Providers') // sub-class to extend the properties of the base entity
export class MJCommunicationProviderEntityExtended extends MJCommunicationProviderEntity {
    private _ProviderMessageTypes: MJCommunicationProviderMessageTypeEntity[];
    public get MessageTypes(): MJCommunicationProviderMessageTypeEntity[] {
        return this._ProviderMessageTypes;
    }
    public set MessageTypes(value: MJCommunicationProviderMessageTypeEntity[]) {
        this._ProviderMessageTypes = value;
    }
}