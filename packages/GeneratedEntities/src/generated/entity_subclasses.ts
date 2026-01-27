import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity API Key Scopes
 */
export const APIKeyScopeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    APIKeyID: z.string().describe(`
        * * Field Name: APIKeyID
        * * Display Name: API Key
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: API Keys (vwAPIKeys.ID)`),
    ScopeID: z.string().describe(`
        * * Field Name: ScopeID
        * * Display Name: Scope
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Scopes (vwScopes.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    APIKey: z.string().describe(`
        * * Field Name: APIKey
        * * Display Name: API Key Value
        * * SQL Data Type: nvarchar(255)`),
    Scope: z.string().describe(`
        * * Field Name: Scope
        * * Display Name: Scope
        * * SQL Data Type: nvarchar(100)`),
});

export type APIKeyScopeEntityType = z.infer<typeof APIKeyScopeSchema>;

/**
 * zod schema definition for the entity API Keys
 */
export const APIKeySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Hash: z.string().describe(`
        * * Field Name: Hash
        * * Display Name: Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 hash of the API key (actual key shown once at creation)`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    Label: z.string().describe(`
        * * Field Name: Label
        * * Display Name: Label
        * * SQL Data Type: nvarchar(255)
        * * Description: User-provided label for identifying this key`),
    Status: z.union([z.literal('Active'), z.literal('Expired'), z.literal('Revoked'), z.literal('Suspended')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Revoked
    *   * Suspended
        * * Description: Key status: Active, Expired, Revoked, Suspended`),
    ExpiresAt: z.date().nullable().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expires At
        * * SQL Data Type: datetimeoffset
        * * Description: When this key expires (null = never)`),
    LastUsedAt: z.date().nullable().describe(`
        * * Field Name: LastUsedAt
        * * Display Name: Last Used At
        * * SQL Data Type: datetimeoffset
        * * Description: Last time this key was used for authentication`),
    CreatedByID: z.string().describe(`
        * * Field Name: CreatedByID
        * * Display Name: Created By
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    CreatedBy: z.string().describe(`
        * * Field Name: CreatedBy
        * * Display Name: Created By
        * * SQL Data Type: nvarchar(255)`),
});

export type APIKeyEntityType = z.infer<typeof APIKeySchema>;

/**
 * zod schema definition for the entity Channel Actions
 */
export const ChannelActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ChannelID: z.string().describe(`
        * * Field Name: ChannelID
        * * Display Name: Channel ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channels (vwChannels.ID)`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Disabled'), z.literal('Pending'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    *   * Pending
    *   * Revoked
        * * Description: Action status at channel level: Active, Pending, Revoked, Disabled`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Execution order when multiple actions are available`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON configuration for this action at channel level`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    CredentialID: z.string().nullable().describe(`
        * * Field Name: CredentialID
        * * Display Name: Credential ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Credentials (vwCredentials.ID)
        * * Description: Reference to the credential used for this action at channel level`),
    Channel: z.string().describe(`
        * * Field Name: Channel
        * * Display Name: Channel
        * * SQL Data Type: nvarchar(255)`),
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
    Credential: z.string().nullable().describe(`
        * * Field Name: Credential
        * * Display Name: Credential
        * * SQL Data Type: nvarchar(255)`),
});

export type ChannelActionEntityType = z.infer<typeof ChannelActionSchema>;

/**
 * zod schema definition for the entity Channel Message Attachments
 */
export const ChannelMessageAttachmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ChannelMessageID: z.string().describe(`
        * * Field Name: ChannelMessageID
        * * Display Name: Channel Message
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channel Messages (vwChannelMessages.ID)
        * * Description: Foreign key to ChannelMessage table`),
    ExternalSystemAttachmentID: z.string().nullable().describe(`
        * * Field Name: ExternalSystemAttachmentID
        * * Display Name: External Attachment ID
        * * SQL Data Type: nvarchar(500)
        * * Description: The attachment ID from the external system (e.g. MS Graph attachment ID)`),
    Filename: z.string().describe(`
        * * Field Name: Filename
        * * Display Name: File Name
        * * SQL Data Type: nvarchar(500)
        * * Description: Original filename of the attachment`),
    ContentType: z.string().describe(`
        * * Field Name: ContentType
        * * Display Name: Content Type
        * * SQL Data Type: nvarchar(200)
        * * Description: MIME type of the attachment (e.g. image/png, application/pdf)`),
    Size: z.number().describe(`
        * * Field Name: Size
        * * Display Name: Size
        * * SQL Data Type: int
        * * Description: Size of the attachment in bytes`),
    IsInline: z.boolean().describe(`
        * * Field Name: IsInline
        * * Display Name: Is Inline
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True if this is an inline image embedded in the email body (referenced by cid:)`),
    ContentID: z.string().nullable().describe(`
        * * Field Name: ContentID
        * * Display Name: Content ID
        * * SQL Data Type: nvarchar(500)
        * * Description: Content-ID used to reference inline images in HTML (e.g. "image001@microsoft.com" for <img src="cid:image001@microsoft.com">)`),
    Content: z.number().nullable().describe(`
        * * Field Name: Content
        * * Display Name: Content
        * * SQL Data Type: varbinary
        * * Description: Binary content of the attachment. NULL if stored externally (see StoragePath)`),
    StoragePath: z.string().nullable().describe(`
        * * Field Name: StoragePath
        * * Display Name: Storage Path
        * * SQL Data Type: nvarchar(1000)
        * * Description: Optional path to external storage (e.g. Azure Blob Storage URL) if Content is not stored in database`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ChannelMessage: z.string().nullable().describe(`
        * * Field Name: ChannelMessage
        * * Display Name: Channel Message
        * * SQL Data Type: nvarchar(MAX)`),
});

export type ChannelMessageAttachmentEntityType = z.infer<typeof ChannelMessageAttachmentSchema>;

/**
 * zod schema definition for the entity Channel Messages
 */
export const ChannelMessageSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ChannelID: z.string().describe(`
        * * Field Name: ChannelID
        * * Display Name: Channel
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channels (vwChannels.ID)`),
    ChannelRunID: z.string().nullable().describe(`
        * * Field Name: ChannelRunID
        * * Display Name: Channel Run
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channel Runs (vwChannelRuns.ID)`),
    ExternalSystemRecordID: z.string().nullable().describe(`
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record
        * * SQL Data Type: nvarchar(MAX)
        * * Description: External system message ID for deduplication`),
    ReceivedAt: z.date().describe(`
        * * Field Name: ReceivedAt
        * * Display Name: Received At
        * * SQL Data Type: datetimeoffset
        * * Description: When the message was received`),
    Subject: z.string().nullable().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Message subject line (for email)`),
    MessageContent: z.string().describe(`
        * * Field Name: MessageContent
        * * Display Name: Message Content
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The message body content`),
    IsSecure: z.boolean().describe(`
        * * Field Name: IsSecure
        * * Display Name: Is Secure
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this message contains sensitive/secure content`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channel Messages (vwChannelMessages.ID)`),
    ThreadID: z.string().nullable().describe(`
        * * Field Name: ThreadID
        * * Display Name: Thread
        * * SQL Data Type: nvarchar(255)
        * * Description: Thread identifier for grouping related messages`),
    ContactID: z.string().nullable().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)`),
    Sender: z.string().describe(`
        * * Field Name: Sender
        * * Display Name: Sender
        * * SQL Data Type: nvarchar(500)
        * * Description: Sender email/phone/identifier`),
    Recipient: z.string().describe(`
        * * Field Name: Recipient
        * * Display Name: Recipient
        * * SQL Data Type: nvarchar(500)
        * * Description: Recipient email/phone/identifier`),
    GenerationStatus: z.union([z.literal('Creating Reply'), z.literal('Failed'), z.literal('Generated'), z.literal('Read'), z.literal('Skipped')]).describe(`
        * * Field Name: GenerationStatus
        * * Display Name: Generation Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Read
    * * Value List Type: List
    * * Possible Values 
    *   * Creating Reply
    *   * Failed
    *   * Generated
    *   * Read
    *   * Skipped
        * * Description: AI generation status: Read, Creating Reply, Generated, Skipped, Failed`),
    AIAgentRunID: z.string().nullable().describe(`
        * * Field Name: AIAgentRunID
        * * Display Name: AI Agent Run
        * * SQL Data Type: uniqueidentifier`),
    InboundVectorJSON: z.string().nullable().describe(`
        * * Field Name: InboundVectorJSON
        * * Display Name: Inbound Vector
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Vector embedding of inbound message for similarity search`),
    ReplyVectorJSON: z.string().nullable().describe(`
        * * Field Name: ReplyVectorJSON
        * * Display Name: Reply Vector
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Vector embedding of reply for similarity search`),
    VectorModelID: z.string().nullable().describe(`
        * * Field Name: VectorModelID
        * * Display Name: Vector Model
        * * SQL Data Type: uniqueidentifier`),
    ApprovalStatus: z.union([z.literal('Approved'), z.literal('Not Required'), z.literal('Pending'), z.literal('Rejected')]).nullable().describe(`
        * * Field Name: ApprovalStatus
        * * Display Name: Approval Status
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Approved
    *   * Not Required
    *   * Pending
    *   * Rejected
        * * Description: Approval status: Pending, Approved, Rejected, Not Required`),
    ApprovalFeedback: z.string().nullable().describe(`
        * * Field Name: ApprovalFeedback
        * * Display Name: Approval Feedback
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Feedback from approver on why approved/rejected`),
    GeneratedReplyContent: z.string().nullable().describe(`
        * * Field Name: GeneratedReplyContent
        * * Display Name: Generated Reply Content
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AI-generated reply content`),
    ApprovedReplyContent: z.string().nullable().describe(`
        * * Field Name: ApprovedReplyContent
        * * Display Name: Approved Reply Content
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Final approved reply content (may be edited from generated)`),
    ApprovedAt: z.date().nullable().describe(`
        * * Field Name: ApprovedAt
        * * Display Name: Approved At
        * * SQL Data Type: datetimeoffset
        * * Description: When the reply was approved`),
    ApprovedByContactID: z.string().nullable().describe(`
        * * Field Name: ApprovedByContactID
        * * Display Name: Approved By Contact
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    GeneratedAt: z.date().nullable().describe(`
        * * Field Name: GeneratedAt
        * * Display Name: Generated At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp when Izzy finished generating the response for this message`),
    SentAt: z.date().nullable().describe(`
        * * Field Name: SentAt
        * * Display Name: Sent At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp when the response was actually sent to the recipient`),
    AIConfidenceScore: z.number().nullable().describe(`
        * * Field Name: AIConfidenceScore
        * * Display Name: AI Confidence Score
        * * SQL Data Type: decimal(5, 2)
        * * Description: AI-generated confidence score for the response quality (0-100 percentage)`),
    AIConfidenceReason: z.string().nullable().describe(`
        * * Field Name: AIConfidenceReason
        * * Display Name: AI Confidence Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AI-generated explanation for the confidence score, including any concerns or areas of uncertainty`),
    AIAutoApproved: z.boolean().nullable().describe(`
        * * Field Name: AIAutoApproved
        * * Display Name: AI Auto Approved
        * * SQL Data Type: bit
        * * Description: Whether this message was automatically approved based on confidence score meeting or exceeding the threshold`),
    AIEvaluatedAt: z.date().nullable().describe(`
        * * Field Name: AIEvaluatedAt
        * * Display Name: AI Evaluated At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp when the AI confidence evaluation was performed`),
    MessageFormat: z.string().nullable().describe(`
        * * Field Name: MessageFormat
        * * Display Name: Message Format
        * * SQL Data Type: nvarchar(20)
        * * Description: Format of the inbound message content. Values: HTML, PlainText, Markdown. Used to determine reply format.`),
    SkipCategory: z.string().nullable().describe(`
        * * Field Name: SkipCategory
        * * Display Name: Skip Category
        * * SQL Data Type: nvarchar(100)
        * * Description: Category indicating why the message was skipped. From early rejection: spam, automated-message, prank, phishing. From decision rejection: legal-advice, financial-dispute, explicit-human-request, urgent-sensitive-personal, urgent-sensitive-business, policy-exception, complex-technical, password-reset-failure, marketing-speaker, inappropriate, out-of-scope`),
    SkipReasoning: z.string().nullable().describe(`
        * * Field Name: SkipReasoning
        * * Display Name: Skip Reasoning
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AI-generated reasoning explaining why the message was skipped or rejected`),
    IsSpam: z.boolean().describe(`
        * * Field Name: IsSpam
        * * Display Name: Is Spam
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Flag indicating the message was identified as spam. Used to filter spam out of pending message lists.`),
    ErrorType: z.union([z.literal('AgentFailure'), z.literal('ChannelConfigFailure'), z.literal('CredentialFailure'), z.literal('Other'), z.literal('ProviderNotFound'), z.literal('RateLimited'), z.literal('SendFailure'), z.literal('Timeout'), z.literal('ValidationFailure')]).nullable().describe(`
        * * Field Name: ErrorType
        * * Display Name: Error Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * AgentFailure
    *   * ChannelConfigFailure
    *   * CredentialFailure
    *   * Other
    *   * ProviderNotFound
    *   * RateLimited
    *   * SendFailure
    *   * Timeout
    *   * ValidationFailure
        * * Description: Type of error that occurred during processing or sending. Values: AgentFailure, SendFailure, CredentialFailure, ProviderNotFound, ValidationFailure, ChannelConfigFailure, Timeout, RateLimited, Other`),
    ErrorMessage: z.string().nullable().describe(`
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed error message describing what went wrong during processing or sending. Useful for debugging and support.`),
    SentContent: z.string().nullable().describe(`
        * * Field Name: SentContent
        * * Display Name: Sent Content
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The exact content that was sent to the recipient, including any signatures and branding. Populated after successful send for audit trail.`),
    Channel: z.string().describe(`
        * * Field Name: Channel
        * * Display Name: Channel
        * * SQL Data Type: nvarchar(255)`),
    ChannelRun: z.string().nullable().describe(`
        * * Field Name: ChannelRun
        * * Display Name: Channel Run
        * * SQL Data Type: nvarchar(255)`),
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(MAX)`),
    Contact: z.string().nullable().describe(`
        * * Field Name: Contact
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(255)`),
    ApprovedByContact: z.string().nullable().describe(`
        * * Field Name: ApprovedByContact
        * * Display Name: Approved By Contact
        * * SQL Data Type: nvarchar(255)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent
        * * SQL Data Type: uniqueidentifier`),
});

export type ChannelMessageEntityType = z.infer<typeof ChannelMessageSchema>;

/**
 * zod schema definition for the entity Channel Runs
 */
export const ChannelRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ChannelID: z.string().describe(`
        * * Field Name: ChannelID
        * * Display Name: Channel ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channels (vwChannels.ID)`),
    StartedAt: z.date().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: When the run started`),
    CompletedAt: z.date().nullable().describe(`
        * * Field Name: CompletedAt
        * * Display Name: Completed At
        * * SQL Data Type: datetimeoffset
        * * Description: When the run completed (null if still running)`),
    Status: z.union([z.literal('Canceled'), z.literal('Completed'), z.literal('Failed'), z.literal('Running')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Running
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Completed
    *   * Failed
    *   * Running
        * * Description: Run status: Running, Completed, Failed, Canceled`),
    MessageCount: z.number().describe(`
        * * Field Name: MessageCount
        * * Display Name: Message Count
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Total messages found during this run`),
    ProcessedCount: z.number().describe(`
        * * Field Name: ProcessedCount
        * * Display Name: Processed Count
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Messages successfully processed`),
    FailedCount: z.number().describe(`
        * * Field Name: FailedCount
        * * Display Name: Failed Count
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Messages that failed processing`),
    ErrorMessage: z.string().nullable().describe(`
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Error message if run failed`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Channel: z.string().describe(`
        * * Field Name: Channel
        * * Display Name: Channel Name
        * * SQL Data Type: nvarchar(255)`),
});

export type ChannelRunEntityType = z.infer<typeof ChannelRunSchema>;

/**
 * zod schema definition for the entity Channel Type Actions
 */
export const ChannelTypeActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    ChannelTypeID: z.string().describe(`
        * * Field Name: ChannelTypeID
        * * Display Name: Channel Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channel Types (vwChannelTypes.ID)`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Disabled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
        * * Description: Action status at channel type level: Active, Disabled`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Execution order when multiple actions are available`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON configuration for this action at channel type level`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    CredentialID: z.string().nullable().describe(`
        * * Field Name: CredentialID
        * * Display Name: Credential
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Credentials (vwCredentials.ID)
        * * Description: Reference to the credential used for this action at channel type level`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    ChannelType: z.string().describe(`
        * * Field Name: ChannelType
        * * Display Name: Channel Type
        * * SQL Data Type: nvarchar(255)`),
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
    Credential: z.string().nullable().describe(`
        * * Field Name: Credential
        * * Display Name: Credential
        * * SQL Data Type: nvarchar(255)`),
});

export type ChannelTypeActionEntityType = z.infer<typeof ChannelTypeActionSchema>;

/**
 * zod schema definition for the entity Channel Types
 */
export const ChannelTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Channel type display name`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Description of the channel type`),
    CommunicationProviderID: z.string().describe(`
        * * Field Name: CommunicationProviderID
        * * Display Name: Communication Provider
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)`),
    ActionInheritMode: z.union([z.literal('ChannelType'), z.literal('Combined'), z.literal('Organization')]).describe(`
        * * Field Name: ActionInheritMode
        * * Display Name: Action Inherit Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Combined
    * * Value List Type: List
    * * Possible Values 
    *   * ChannelType
    *   * Combined
    *   * Organization
        * * Description: How actions are inherited: Organization, ChannelType, Combined`),
    Status: z.union([z.literal('Active'), z.literal('Pending'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Revoked
        * * Description: Channel type status: Active, Pending, Revoked`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    CommunicationProvider: z.string().describe(`
        * * Field Name: CommunicationProvider
        * * Display Name: Provider Name
        * * SQL Data Type: nvarchar(255)`),
});

export type ChannelTypeEntityType = z.infer<typeof ChannelTypeSchema>;

/**
 * zod schema definition for the entity Channels
 */
export const ChannelSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    ChannelTypeID: z.string().describe(`
        * * Field Name: ChannelTypeID
        * * Display Name: Channel Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channel Types (vwChannelTypes.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Channel display name`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Description of the channel`),
    ExternalIdentifier: z.string().nullable().describe(`
        * * Field Name: ExternalIdentifier
        * * Display Name: External Identifier
        * * SQL Data Type: nvarchar(MAX)
        * * Description: External identifier for this channel (email address, phone number, Slack handle, etc.)`),
    CheckFrequency: z.number().nullable().describe(`
        * * Field Name: CheckFrequency
        * * Display Name: Check Frequency
        * * SQL Data Type: int
        * * Description: How often to check for new messages (in minutes)`),
    ActionInheritMode: z.union([z.literal('Channel'), z.literal('ChannelType'), z.literal('Combined'), z.literal('Organization')]).describe(`
        * * Field Name: ActionInheritMode
        * * Display Name: Action Inherit Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: ChannelType
    * * Value List Type: List
    * * Possible Values 
    *   * Channel
    *   * ChannelType
    *   * Combined
    *   * Organization
        * * Description: How actions are inherited: Organization, ChannelType, Channel, Combined`),
    Status: z.union([z.literal('Active'), z.literal('Pending'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Revoked
        * * Description: Channel status: Active, Pending, Revoked`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    CredentialID: z.string().nullable().describe(`
        * * Field Name: CredentialID
        * * Display Name: Credential ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Credentials (vwCredentials.ID)
        * * Description: Reference to the credential used for provider authentication`),
    IzzyAIConfigurationID: z.string().nullable().describe(`
        * * Field Name: IzzyAIConfigurationID
        * * Display Name: Izzy AI Configuration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Izzy AI Configurations (vwIzzyAIConfigurations.ID)
        * * Description: Optional AI configuration override for this channel. If NULL, inherits from organization.`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    ChannelType: z.string().describe(`
        * * Field Name: ChannelType
        * * Display Name: Channel Type
        * * SQL Data Type: nvarchar(255)`),
    Credential: z.string().nullable().describe(`
        * * Field Name: Credential
        * * Display Name: Credential
        * * SQL Data Type: nvarchar(255)`),
    IzzyAIConfiguration: z.string().nullable().describe(`
        * * Field Name: IzzyAIConfiguration
        * * Display Name: Izzy AI Configuration
        * * SQL Data Type: nvarchar(100)`),
});

export type ChannelEntityType = z.infer<typeof ChannelSchema>;

/**
 * zod schema definition for the entity Contact Roles
 */
export const ContactRoleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Role display name`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Description of role permissions and responsibilities`),
    Level: z.number().describe(`
        * * Field Name: Level
        * * Display Name: Level
        * * SQL Data Type: int
        * * Description: Numeric level for role hierarchy (higher = more permissions)`),
    IsSystem: z.boolean().describe(`
        * * Field Name: IsSystem
        * * Display Name: System Role
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this is a system-defined role that cannot be deleted`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
        * * Description: Role status: Active, Inactive`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ContactRoleEntityType = z.infer<typeof ContactRoleSchema>;

/**
 * zod schema definition for the entity Contacts
 */
export const ContactSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Contact first name`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Contact last name`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Contact email address (unique identifier for login)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(100)
        * * Description: Job title or position`),
    ProfileImageURL: z.string().nullable().describe(`
        * * Field Name: ProfileImageURL
        * * Display Name: Profile Image URL
        * * SQL Data Type: nvarchar(1024)
        * * Description: URL to profile image`),
    Status: z.union([z.literal('Active'), z.literal('Canceled'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Canceled
    *   * Pending
        * * Description: Contact status: Active, Pending, Canceled`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ContactEntityType = z.infer<typeof ContactSchema>;

/**
 * zod schema definition for the entity Credential Types
 */
export const CredentialTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Category: z.string().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(50)
        * * Description: Category of the credential type (CRM, Email, SMS, Helpdesk, etc.)`),
    CredentialSchema: z.string().nullable().describe(`
        * * Field Name: CredentialSchema
        * * Display Name: Credential Schema
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON Schema defining required credential fields for this type`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)`),
    Status: z.union([z.literal('Active'), z.literal('Deprecated'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Deprecated
    *   * Inactive`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type CredentialTypeEntityType = z.infer<typeof CredentialTypeSchema>;

/**
 * zod schema definition for the entity Credentials
 */
export const CredentialSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    TypeID: z.string().describe(`
        * * Field Name: TypeID
        * * Display Name: Credential Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Credential Types (vwCredentialTypes.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    EncryptedCredentials: z.string().nullable().describe(`
        * * Field Name: EncryptedCredentials
        * * Display Name: Encrypted Credentials
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AES-256-GCM encrypted credentials JSON`),
    CredentialNotes: z.string().nullable().describe(`
        * * Field Name: CredentialNotes
        * * Display Name: Credential Notes
        * * SQL Data Type: nvarchar(500)
        * * Description: Human-readable notes about the credentials (not encrypted)`),
    Status: z.union([z.literal('Active'), z.literal('Expired'), z.literal('Inactive'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Inactive
    *   * Revoked`),
    ExpiresAt: z.date().nullable().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expires At
        * * SQL Data Type: datetimeoffset
        * * Description: When the credential expires (for OAuth tokens, API keys with expiry, etc.)`),
    LastUsedAt: z.date().nullable().describe(`
        * * Field Name: LastUsedAt
        * * Display Name: Last Used At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of last credential usage for auditing`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization Name
        * * SQL Data Type: nvarchar(255)`),
    Type: z.string().describe(`
        * * Field Name: Type
        * * Display Name: Credential Type
        * * SQL Data Type: nvarchar(100)`),
});

export type CredentialEntityType = z.infer<typeof CredentialSchema>;

/**
 * zod schema definition for the entity Izzy Action Categories
 */
export const IzzyActionCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Category display name`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Description of actions in this category`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Izzy Action Categories (vwIzzyActionCategories.ID)`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome icon class for UI display`),
    SortOrder: z.number().describe(`
        * * Field Name: SortOrder
        * * Display Name: Sort Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order within parent category`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
        * * Description: Category status: Active, Inactive`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type IzzyActionCategoryEntityType = z.infer<typeof IzzyActionCategorySchema>;

/**
 * zod schema definition for the entity Izzy Action Organizations
 */
export const IzzyActionOrganizationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    IzzyActionID: z.string().describe(`
        * * Field Name: IzzyActionID
        * * Display Name: Izzy Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Izzy Actions (vwIzzyActions.ID)`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Revoked
        * * Description: Grant status: Active, Revoked`),
    GrantedAt: z.date().describe(`
        * * Field Name: GrantedAt
        * * Display Name: Granted At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: When the action was granted to this organization`),
    ExpiresAt: z.date().nullable().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expires At
        * * SQL Data Type: datetimeoffset
        * * Description: When this grant expires (null = never)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(500)
        * * Description: Admin notes about why this was granted`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    IzzyAction: z.string().describe(`
        * * Field Name: IzzyAction
        * * Display Name: Action Name
        * * SQL Data Type: nvarchar(255)`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization Name
        * * SQL Data Type: nvarchar(255)`),
});

export type IzzyActionOrganizationEntityType = z.infer<typeof IzzyActionOrganizationSchema>;

/**
 * zod schema definition for the entity Izzy Actions
 */
export const IzzyActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Display name for the action`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of what the action does`),
    CategoryID: z.string().nullable().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Izzy Action Categories (vwIzzyActionCategories.ID)`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome icon class for UI display`),
    Status: z.union([z.literal('Active'), z.literal('Coming Soon'), z.literal('Deprecated')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Coming Soon
    *   * Deprecated
        * * Description: Action status: Active, Deprecated, Coming Soon`),
    IsPublic: z.boolean().describe(`
        * * Field Name: IsPublic
        * * Display Name: Is Public
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this action is available to all orgs (vs private)`),
    MinimumPlanLevel: z.number().describe(`
        * * Field Name: MinimumPlanLevel
        * * Display Name: Minimum Plan Level
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Minimum plan level required to use this action`),
    RequiresCredentials: z.boolean().describe(`
        * * Field Name: RequiresCredentials
        * * Display Name: Requires Credentials
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this action requires credentials to be configured`),
    CredentialSchema: z.string().nullable().describe(`
        * * Field Name: CredentialSchema
        * * Display Name: Credential Schema
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON Schema defining required credential fields`),
    ConfigurationSchema: z.string().nullable().describe(`
        * * Field Name: ConfigurationSchema
        * * Display Name: Configuration Schema
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON Schema defining configuration options`),
    DocumentationURL: z.string().nullable().describe(`
        * * Field Name: DocumentationURL
        * * Display Name: Documentation URL
        * * SQL Data Type: nvarchar(1024)
        * * Description: URL to action documentation`),
    SortOrder: z.number().describe(`
        * * Field Name: SortOrder
        * * Display Name: Sort Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order within category`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
});

export type IzzyActionEntityType = z.infer<typeof IzzyActionSchema>;

/**
 * zod schema definition for the entity Izzy AI Configurations
 */
export const IzzyAIConfigurationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name for this AI configuration (e.g., "Groq/Cerebras Fast", "Anthropic Premium")`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    AIConfigurationID: z.string().describe(`
        * * Field Name: AIConfigurationID
        * * Display Name: AI Configuration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: AI Configurations (vwAIConfigurations.ID)
        * * Description: Foreign key to MJ AI Configuration which defines the actual model/vendor assignments`),
    MinPlanLevel: z.string().nullable().describe(`
        * * Field Name: MinPlanLevel
        * * Display Name: Min Plan Level
        * * SQL Data Type: nvarchar(50)
        * * Description: Minimum subscription plan level required to use this configuration (e.g., Free, Pro, Enterprise). NULL means available to all.`),
    ExpiresAt: z.date().nullable().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expires At
        * * SQL Data Type: datetimeoffset
        * * Description: When this configuration expires and becomes unavailable. NULL means never expires.`),
    Status: z.string().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    AIConfiguration: z.string().describe(`
        * * Field Name: AIConfiguration
        * * Display Name: AI Configuration
        * * SQL Data Type: nvarchar(100)`),
});

export type IzzyAIConfigurationEntityType = z.infer<typeof IzzyAIConfigurationSchema>;

/**
 * zod schema definition for the entity Organization Actions
 */
export const OrganizationActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Disabled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
        * * Description: Action status at org level: Active, Disabled`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Execution order when multiple actions are available`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON configuration for this action at org level`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    CredentialID: z.string().nullable().describe(`
        * * Field Name: CredentialID
        * * Display Name: Credential
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Credentials (vwCredentials.ID)
        * * Description: Reference to the credential used for this action at org level`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
    Credential: z.string().nullable().describe(`
        * * Field Name: Credential
        * * Display Name: Credential
        * * SQL Data Type: nvarchar(255)`),
});

export type OrganizationActionEntityType = z.infer<typeof OrganizationActionSchema>;

/**
 * zod schema definition for the entity Organization Contacts
 */
export const OrganizationContactSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)`),
    RoleID: z.string().describe(`
        * * Field Name: RoleID
        * * Display Name: Role
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contact Roles (vwContactRoles.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Pending'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Revoked
        * * Description: Membership status: Active, Pending, Revoked`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    Contact: z.string().describe(`
        * * Field Name: Contact
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(255)`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(100)`),
});

export type OrganizationContactEntityType = z.infer<typeof OrganizationContactSchema>;

/**
 * zod schema definition for the entity Organization Settings
 */
export const OrganizationSettingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    SettingID: z.string().describe(`
        * * Field Name: SettingID
        * * Display Name: Setting
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Settings (vwSettings.ID)`),
    Value: z.string().nullable().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The setting value for this organization`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Scope: z.string().describe(`
        * * Field Name: Scope
        * * Display Name: Scope
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Organization
        * * Description: Scope of the setting: Organization (applies to all channels in org) or Channel (specific to one channel)`),
    ChannelID: z.string().nullable().describe(`
        * * Field Name: ChannelID
        * * Display Name: Channel
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channels (vwChannels.ID)
        * * Description: Optional Channel ID for channel-scoped settings. Required when Scope = Channel, must be NULL when Scope = Organization`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    Setting: z.string().describe(`
        * * Field Name: Setting
        * * Display Name: Setting
        * * SQL Data Type: nvarchar(255)`),
    Channel: z.string().nullable().describe(`
        * * Field Name: Channel
        * * Display Name: Channel Name
        * * SQL Data Type: nvarchar(255)`),
});

export type OrganizationSettingEntityType = z.infer<typeof OrganizationSettingSchema>;

/**
 * zod schema definition for the entity Organizations
 */
export const OrganizationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Organization display name`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional description of the organization`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    PlanID: z.string().nullable().describe(`
        * * Field Name: PlanID
        * * Display Name: Plan ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Plans (vwPlans.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Pending'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Revoked
        * * Description: Organization status: Active, Pending, Revoked`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    IzzyAIConfigurationID: z.string().nullable().describe(`
        * * Field Name: IzzyAIConfigurationID
        * * Display Name: AI Configuration
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Izzy AI Configurations (vwIzzyAIConfigurations.ID)
        * * Description: Default AI configuration for this organization. Inherited by sub-orgs and channels unless overridden.`),
    Domain: z.string().nullable().describe(`
        * * Field Name: Domain
        * * Display Name: Domain
        * * SQL Data Type: nvarchar(255)
        * * Description: Primary email domain for the organization (e.g., meetizzy.ai). Used for user auto-association and internal org identification.`),
    LogoURL: z.string().nullable().describe(`
        * * Field Name: LogoURL
        * * Display Name: Logo URL
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Logo image for the organization. Can be a base64-encoded data URL or an external image URL.`),
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)`),
    Plan: z.string().nullable().describe(`
        * * Field Name: Plan
        * * Display Name: Plan
        * * SQL Data Type: nvarchar(50)`),
    IzzyAIConfiguration: z.string().nullable().describe(`
        * * Field Name: IzzyAIConfiguration
        * * Display Name: AI Configuration Details
        * * SQL Data Type: nvarchar(100)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type OrganizationEntityType = z.infer<typeof OrganizationSchema>;

/**
 * zod schema definition for the entity Plans
 */
export const PlanSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Plan Name
        * * SQL Data Type: nvarchar(50)
        * * Description: Display name of the plan`),
    Level: z.number().describe(`
        * * Field Name: Level
        * * Display Name: Plan Level
        * * SQL Data Type: int
        * * Description: Numeric level for plan comparison (higher = more features)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Description of plan features and benefits`),
    MonthlyPrice: z.number().nullable().describe(`
        * * Field Name: MonthlyPrice
        * * Display Name: Monthly Price
        * * SQL Data Type: decimal(10, 2)
        * * Description: Monthly subscription price`),
    AnnualPrice: z.number().nullable().describe(`
        * * Field Name: AnnualPrice
        * * Display Name: Annual Price
        * * SQL Data Type: decimal(10, 2)
        * * Description: Annual subscription price (typically discounted)`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
        * * Description: Plan status: Active, Inactive`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type PlanEntityType = z.infer<typeof PlanSchema>;

/**
 * zod schema definition for the entity Scopes
 */
export const ScopeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Scope identifier (e.g., messages:read)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Human-readable description of what this scope allows`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ScopeEntityType = z.infer<typeof ScopeSchema>;

/**
 * zod schema definition for the entity Setting Categories
 */
export const SettingCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Category display name`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Description of settings in this category`),
    Icon: z.string().nullable().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(100)
        * * Description: FontAwesome icon class for UI display`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Setting Categories (vwSettingCategories.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order within parent category`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    AllowedScopes: z.string().nullable().describe(`
        * * Field Name: AllowedScopes
        * * Display Name: Allowed Scopes
        * * SQL Data Type: nvarchar(100)
        * * Description: Optional default AllowedScopes for settings in this category. If NULL, each setting uses its own AllowedScopes. Comma-separated values: Organization, Channel.`),
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent Name
        * * SQL Data Type: nvarchar(100)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type SettingCategoryEntityType = z.infer<typeof SettingCategorySchema>;

/**
 * zod schema definition for the entity Settings
 */
export const SettingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Key: z.string().describe(`
        * * Field Name: Key
        * * Display Name: Key
        * * SQL Data Type: nvarchar(255)
        * * Description: Unique programmatic key for the setting`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Display name for the setting`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Description of what this setting controls`),
    Icon: z.string().nullable().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(100)
        * * Description: FontAwesome icon class for UI display`),
    CategoryID: z.string().nullable().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Setting Categories (vwSettingCategories.ID)`),
    ValueType: z.union([z.literal('Boolean'), z.literal('Date'), z.literal('HTML'), z.literal('JSON'), z.literal('Markdown'), z.literal('Number'), z.literal('String')]).describe(`
        * * Field Name: ValueType
        * * Display Name: Value Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: String
    * * Value List Type: List
    * * Possible Values 
    *   * Boolean
    *   * Date
    *   * HTML
    *   * JSON
    *   * Markdown
    *   * Number
    *   * String
        * * Description: Value type: String, Number, Boolean, JSON, Date, Markdown, HTML`),
    DefaultValue: z.string().nullable().describe(`
        * * Field Name: DefaultValue
        * * Display Name: Default Value
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Default value if not overridden`),
    ValidationRegex: z.string().nullable().describe(`
        * * Field Name: ValidationRegex
        * * Display Name: Validation Regex
        * * SQL Data Type: nvarchar(500)
        * * Description: Regex pattern for validating values`),
    IsRequired: z.boolean().describe(`
        * * Field Name: IsRequired
        * * Display Name: Is Required
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this setting must have a value`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order within category`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
        * * Description: Setting status: Active, Inactive`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    IsCategoryController: z.boolean().describe(`
        * * Field Name: IsCategoryController
        * * Display Name: Is Category Controller
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When true, this setting acts as the master on/off switch for its entire category. Other settings in the category are disabled in the UI when this setting value is false.`),
    AllowedScopes: z.string().describe(`
        * * Field Name: AllowedScopes
        * * Display Name: Allowed Scopes
        * * SQL Data Type: nvarchar(100)
        * * Default Value: Organization,Channel
        * * Description: Comma-separated list of scopes where this setting can be configured. Values: Organization, Channel. Default allows both with inheritance (Channel overrides Organization).`),
    MinimumPlanLevel: z.number().nullable().describe(`
        * * Field Name: MinimumPlanLevel
        * * Display Name: Minimum Plan Level
        * * SQL Data Type: int
        * * Description: Minimum plan level required to configure this setting. If NULL, setting is available to all plans. Maps to Plan.Level values (e.g., Free=0, Starter=10, Pro=20, Enterprise=30).`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
});

export type SettingEntityType = z.infer<typeof SettingSchema>;
 
 

/**
 * API Key Scopes - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: APIKeyScope
 * * Base View: vwAPIKeyScopes
 * * @description Links API keys to their granted permission scopes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'API Key Scopes')
export class APIKeyScopeEntity extends BaseEntity<APIKeyScopeEntityType> {
    /**
    * Loads the API Key Scopes record from the database
    * @param ID: string - primary key value to load the API Key Scopes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof APIKeyScopeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: APIKeyID
    * * Display Name: API Key
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: API Keys (vwAPIKeys.ID)
    */
    get APIKeyID(): string {
        return this.Get('APIKeyID');
    }
    set APIKeyID(value: string) {
        this.Set('APIKeyID', value);
    }

    /**
    * * Field Name: ScopeID
    * * Display Name: Scope
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Scopes (vwScopes.ID)
    */
    get ScopeID(): string {
        return this.Get('ScopeID');
    }
    set ScopeID(value: string) {
        this.Set('ScopeID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: APIKey
    * * Display Name: API Key Value
    * * SQL Data Type: nvarchar(255)
    */
    get APIKey(): string {
        return this.Get('APIKey');
    }

    /**
    * * Field Name: Scope
    * * Display Name: Scope
    * * SQL Data Type: nvarchar(100)
    */
    get Scope(): string {
        return this.Get('Scope');
    }
}


/**
 * API Keys - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: APIKey
 * * Base View: vwAPIKeys
 * * @description API keys for programmatic access to the platform
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'API Keys')
export class APIKeyEntity extends BaseEntity<APIKeyEntityType> {
    /**
    * Loads the API Keys record from the database
    * @param ID: string - primary key value to load the API Keys record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof APIKeyEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Hash
    * * Display Name: Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 hash of the API key (actual key shown once at creation)
    */
    get Hash(): string {
        return this.Get('Hash');
    }
    set Hash(value: string) {
        this.Set('Hash', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: Label
    * * Display Name: Label
    * * SQL Data Type: nvarchar(255)
    * * Description: User-provided label for identifying this key
    */
    get Label(): string {
        return this.Get('Label');
    }
    set Label(value: string) {
        this.Set('Label', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Revoked
    *   * Suspended
    * * Description: Key status: Active, Expired, Revoked, Suspended
    */
    get Status(): 'Active' | 'Expired' | 'Revoked' | 'Suspended' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Expired' | 'Revoked' | 'Suspended') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expires At
    * * SQL Data Type: datetimeoffset
    * * Description: When this key expires (null = never)
    */
    get ExpiresAt(): Date | null {
        return this.Get('ExpiresAt');
    }
    set ExpiresAt(value: Date | null) {
        this.Set('ExpiresAt', value);
    }

    /**
    * * Field Name: LastUsedAt
    * * Display Name: Last Used At
    * * SQL Data Type: datetimeoffset
    * * Description: Last time this key was used for authentication
    */
    get LastUsedAt(): Date | null {
        return this.Get('LastUsedAt');
    }
    set LastUsedAt(value: Date | null) {
        this.Set('LastUsedAt', value);
    }

    /**
    * * Field Name: CreatedByID
    * * Display Name: Created By
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    */
    get CreatedByID(): string {
        return this.Get('CreatedByID');
    }
    set CreatedByID(value: string) {
        this.Set('CreatedByID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }

    /**
    * * Field Name: CreatedBy
    * * Display Name: Created By
    * * SQL Data Type: nvarchar(255)
    */
    get CreatedBy(): string {
        return this.Get('CreatedBy');
    }
}


/**
 * Channel Actions - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: ChannelAction
 * * Base View: vwChannelActions
 * * @description Channel-specific action configuration (bottom of inheritance)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Actions')
export class ChannelActionEntity extends BaseEntity<ChannelActionEntityType> {
    /**
    * Loads the Channel Actions record from the database
    * @param ID: string - primary key value to load the Channel Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelActionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ChannelID
    * * Display Name: Channel ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channels (vwChannels.ID)
    */
    get ChannelID(): string {
        return this.Get('ChannelID');
    }
    set ChannelID(value: string) {
        this.Set('ChannelID', value);
    }

    /**
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    *   * Pending
    *   * Revoked
    * * Description: Action status at channel level: Active, Pending, Revoked, Disabled
    */
    get Status(): 'Active' | 'Disabled' | 'Pending' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Disabled' | 'Pending' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Execution order when multiple actions are available
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON configuration for this action at channel level
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: CredentialID
    * * Display Name: Credential ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Credentials (vwCredentials.ID)
    * * Description: Reference to the credential used for this action at channel level
    */
    get CredentialID(): string | null {
        return this.Get('CredentialID');
    }
    set CredentialID(value: string | null) {
        this.Set('CredentialID', value);
    }

    /**
    * * Field Name: Channel
    * * Display Name: Channel
    * * SQL Data Type: nvarchar(255)
    */
    get Channel(): string {
        return this.Get('Channel');
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {
        return this.Get('Action');
    }

    /**
    * * Field Name: Credential
    * * Display Name: Credential
    * * SQL Data Type: nvarchar(255)
    */
    get Credential(): string | null {
        return this.Get('Credential');
    }
}


/**
 * Channel Message Attachments - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: ChannelMessageAttachment
 * * Base View: vwChannelMessageAttachments
 * * @description Stores email attachments for ChannelMessages. Supports both inline images (embedded with cid: references) and standard attachments (files to download). Phase 1: Inline images converted to data URIs. Phase 2: Standard attachments stored here.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Message Attachments')
export class ChannelMessageAttachmentEntity extends BaseEntity<ChannelMessageAttachmentEntityType> {
    /**
    * Loads the Channel Message Attachments record from the database
    * @param ID: string - primary key value to load the Channel Message Attachments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelMessageAttachmentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ChannelMessageID
    * * Display Name: Channel Message
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channel Messages (vwChannelMessages.ID)
    * * Description: Foreign key to ChannelMessage table
    */
    get ChannelMessageID(): string {
        return this.Get('ChannelMessageID');
    }
    set ChannelMessageID(value: string) {
        this.Set('ChannelMessageID', value);
    }

    /**
    * * Field Name: ExternalSystemAttachmentID
    * * Display Name: External Attachment ID
    * * SQL Data Type: nvarchar(500)
    * * Description: The attachment ID from the external system (e.g. MS Graph attachment ID)
    */
    get ExternalSystemAttachmentID(): string | null {
        return this.Get('ExternalSystemAttachmentID');
    }
    set ExternalSystemAttachmentID(value: string | null) {
        this.Set('ExternalSystemAttachmentID', value);
    }

    /**
    * * Field Name: Filename
    * * Display Name: File Name
    * * SQL Data Type: nvarchar(500)
    * * Description: Original filename of the attachment
    */
    get Filename(): string {
        return this.Get('Filename');
    }
    set Filename(value: string) {
        this.Set('Filename', value);
    }

    /**
    * * Field Name: ContentType
    * * Display Name: Content Type
    * * SQL Data Type: nvarchar(200)
    * * Description: MIME type of the attachment (e.g. image/png, application/pdf)
    */
    get ContentType(): string {
        return this.Get('ContentType');
    }
    set ContentType(value: string) {
        this.Set('ContentType', value);
    }

    /**
    * * Field Name: Size
    * * Display Name: Size
    * * SQL Data Type: int
    * * Description: Size of the attachment in bytes
    */
    get Size(): number {
        return this.Get('Size');
    }
    set Size(value: number) {
        this.Set('Size', value);
    }

    /**
    * * Field Name: IsInline
    * * Display Name: Is Inline
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True if this is an inline image embedded in the email body (referenced by cid:)
    */
    get IsInline(): boolean {
        return this.Get('IsInline');
    }
    set IsInline(value: boolean) {
        this.Set('IsInline', value);
    }

    /**
    * * Field Name: ContentID
    * * Display Name: Content ID
    * * SQL Data Type: nvarchar(500)
    * * Description: Content-ID used to reference inline images in HTML (e.g. "image001@microsoft.com" for <img src="cid:image001@microsoft.com">)
    */
    get ContentID(): string | null {
        return this.Get('ContentID');
    }
    set ContentID(value: string | null) {
        this.Set('ContentID', value);
    }

    /**
    * * Field Name: Content
    * * Display Name: Content
    * * SQL Data Type: varbinary
    * * Description: Binary content of the attachment. NULL if stored externally (see StoragePath)
    */
    get Content(): number | null {
        return this.Get('Content');
    }
    set Content(value: number | null) {
        this.Set('Content', value);
    }

    /**
    * * Field Name: StoragePath
    * * Display Name: Storage Path
    * * SQL Data Type: nvarchar(1000)
    * * Description: Optional path to external storage (e.g. Azure Blob Storage URL) if Content is not stored in database
    */
    get StoragePath(): string | null {
        return this.Get('StoragePath');
    }
    set StoragePath(value: string | null) {
        this.Set('StoragePath', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ChannelMessage
    * * Display Name: Channel Message
    * * SQL Data Type: nvarchar(MAX)
    */
    get ChannelMessage(): string | null {
        return this.Get('ChannelMessage');
    }
}


/**
 * Channel Messages - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: ChannelMessage
 * * Base View: vwChannelMessages
 * * @description Individual messages received through channels
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Messages')
export class ChannelMessageEntity extends BaseEntity<ChannelMessageEntityType> {
    /**
    * Loads the Channel Messages record from the database
    * @param ID: string - primary key value to load the Channel Messages record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelMessageEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ChannelID
    * * Display Name: Channel
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channels (vwChannels.ID)
    */
    get ChannelID(): string {
        return this.Get('ChannelID');
    }
    set ChannelID(value: string) {
        this.Set('ChannelID', value);
    }

    /**
    * * Field Name: ChannelRunID
    * * Display Name: Channel Run
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channel Runs (vwChannelRuns.ID)
    */
    get ChannelRunID(): string | null {
        return this.Get('ChannelRunID');
    }
    set ChannelRunID(value: string | null) {
        this.Set('ChannelRunID', value);
    }

    /**
    * * Field Name: ExternalSystemRecordID
    * * Display Name: External System Record
    * * SQL Data Type: nvarchar(MAX)
    * * Description: External system message ID for deduplication
    */
    get ExternalSystemRecordID(): string | null {
        return this.Get('ExternalSystemRecordID');
    }
    set ExternalSystemRecordID(value: string | null) {
        this.Set('ExternalSystemRecordID', value);
    }

    /**
    * * Field Name: ReceivedAt
    * * Display Name: Received At
    * * SQL Data Type: datetimeoffset
    * * Description: When the message was received
    */
    get ReceivedAt(): Date {
        return this.Get('ReceivedAt');
    }
    set ReceivedAt(value: Date) {
        this.Set('ReceivedAt', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Message subject line (for email)
    */
    get Subject(): string | null {
        return this.Get('Subject');
    }
    set Subject(value: string | null) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: MessageContent
    * * Display Name: Message Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The message body content
    */
    get MessageContent(): string {
        return this.Get('MessageContent');
    }
    set MessageContent(value: string) {
        this.Set('MessageContent', value);
    }

    /**
    * * Field Name: IsSecure
    * * Display Name: Is Secure
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this message contains sensitive/secure content
    */
    get IsSecure(): boolean {
        return this.Get('IsSecure');
    }
    set IsSecure(value: boolean) {
        this.Set('IsSecure', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channel Messages (vwChannelMessages.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: ThreadID
    * * Display Name: Thread
    * * SQL Data Type: nvarchar(255)
    * * Description: Thread identifier for grouping related messages
    */
    get ThreadID(): string | null {
        return this.Get('ThreadID');
    }
    set ThreadID(value: string | null) {
        this.Set('ThreadID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    */
    get ContactID(): string | null {
        return this.Get('ContactID');
    }
    set ContactID(value: string | null) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: Sender
    * * Display Name: Sender
    * * SQL Data Type: nvarchar(500)
    * * Description: Sender email/phone/identifier
    */
    get Sender(): string {
        return this.Get('Sender');
    }
    set Sender(value: string) {
        this.Set('Sender', value);
    }

    /**
    * * Field Name: Recipient
    * * Display Name: Recipient
    * * SQL Data Type: nvarchar(500)
    * * Description: Recipient email/phone/identifier
    */
    get Recipient(): string {
        return this.Get('Recipient');
    }
    set Recipient(value: string) {
        this.Set('Recipient', value);
    }

    /**
    * * Field Name: GenerationStatus
    * * Display Name: Generation Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Read
    * * Value List Type: List
    * * Possible Values 
    *   * Creating Reply
    *   * Failed
    *   * Generated
    *   * Read
    *   * Skipped
    * * Description: AI generation status: Read, Creating Reply, Generated, Skipped, Failed
    */
    get GenerationStatus(): 'Creating Reply' | 'Failed' | 'Generated' | 'Read' | 'Skipped' {
        return this.Get('GenerationStatus');
    }
    set GenerationStatus(value: 'Creating Reply' | 'Failed' | 'Generated' | 'Read' | 'Skipped') {
        this.Set('GenerationStatus', value);
    }

    /**
    * * Field Name: AIAgentRunID
    * * Display Name: AI Agent Run
    * * SQL Data Type: uniqueidentifier
    */
    get AIAgentRunID(): string | null {
        return this.Get('AIAgentRunID');
    }
    set AIAgentRunID(value: string | null) {
        this.Set('AIAgentRunID', value);
    }

    /**
    * * Field Name: InboundVectorJSON
    * * Display Name: Inbound Vector
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Vector embedding of inbound message for similarity search
    */
    get InboundVectorJSON(): string | null {
        return this.Get('InboundVectorJSON');
    }
    set InboundVectorJSON(value: string | null) {
        this.Set('InboundVectorJSON', value);
    }

    /**
    * * Field Name: ReplyVectorJSON
    * * Display Name: Reply Vector
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Vector embedding of reply for similarity search
    */
    get ReplyVectorJSON(): string | null {
        return this.Get('ReplyVectorJSON');
    }
    set ReplyVectorJSON(value: string | null) {
        this.Set('ReplyVectorJSON', value);
    }

    /**
    * * Field Name: VectorModelID
    * * Display Name: Vector Model
    * * SQL Data Type: uniqueidentifier
    */
    get VectorModelID(): string | null {
        return this.Get('VectorModelID');
    }
    set VectorModelID(value: string | null) {
        this.Set('VectorModelID', value);
    }

    /**
    * * Field Name: ApprovalStatus
    * * Display Name: Approval Status
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Approved
    *   * Not Required
    *   * Pending
    *   * Rejected
    * * Description: Approval status: Pending, Approved, Rejected, Not Required
    */
    get ApprovalStatus(): 'Approved' | 'Not Required' | 'Pending' | 'Rejected' | null {
        return this.Get('ApprovalStatus');
    }
    set ApprovalStatus(value: 'Approved' | 'Not Required' | 'Pending' | 'Rejected' | null) {
        this.Set('ApprovalStatus', value);
    }

    /**
    * * Field Name: ApprovalFeedback
    * * Display Name: Approval Feedback
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Feedback from approver on why approved/rejected
    */
    get ApprovalFeedback(): string | null {
        return this.Get('ApprovalFeedback');
    }
    set ApprovalFeedback(value: string | null) {
        this.Set('ApprovalFeedback', value);
    }

    /**
    * * Field Name: GeneratedReplyContent
    * * Display Name: Generated Reply Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AI-generated reply content
    */
    get GeneratedReplyContent(): string | null {
        return this.Get('GeneratedReplyContent');
    }
    set GeneratedReplyContent(value: string | null) {
        this.Set('GeneratedReplyContent', value);
    }

    /**
    * * Field Name: ApprovedReplyContent
    * * Display Name: Approved Reply Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Final approved reply content (may be edited from generated)
    */
    get ApprovedReplyContent(): string | null {
        return this.Get('ApprovedReplyContent');
    }
    set ApprovedReplyContent(value: string | null) {
        this.Set('ApprovedReplyContent', value);
    }

    /**
    * * Field Name: ApprovedAt
    * * Display Name: Approved At
    * * SQL Data Type: datetimeoffset
    * * Description: When the reply was approved
    */
    get ApprovedAt(): Date | null {
        return this.Get('ApprovedAt');
    }
    set ApprovedAt(value: Date | null) {
        this.Set('ApprovedAt', value);
    }

    /**
    * * Field Name: ApprovedByContactID
    * * Display Name: Approved By Contact
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    */
    get ApprovedByContactID(): string | null {
        return this.Get('ApprovedByContactID');
    }
    set ApprovedByContactID(value: string | null) {
        this.Set('ApprovedByContactID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: GeneratedAt
    * * Display Name: Generated At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp when Izzy finished generating the response for this message
    */
    get GeneratedAt(): Date | null {
        return this.Get('GeneratedAt');
    }
    set GeneratedAt(value: Date | null) {
        this.Set('GeneratedAt', value);
    }

    /**
    * * Field Name: SentAt
    * * Display Name: Sent At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp when the response was actually sent to the recipient
    */
    get SentAt(): Date | null {
        return this.Get('SentAt');
    }
    set SentAt(value: Date | null) {
        this.Set('SentAt', value);
    }

    /**
    * * Field Name: AIConfidenceScore
    * * Display Name: AI Confidence Score
    * * SQL Data Type: decimal(5, 2)
    * * Description: AI-generated confidence score for the response quality (0-100 percentage)
    */
    get AIConfidenceScore(): number | null {
        return this.Get('AIConfidenceScore');
    }
    set AIConfidenceScore(value: number | null) {
        this.Set('AIConfidenceScore', value);
    }

    /**
    * * Field Name: AIConfidenceReason
    * * Display Name: AI Confidence Reason
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AI-generated explanation for the confidence score, including any concerns or areas of uncertainty
    */
    get AIConfidenceReason(): string | null {
        return this.Get('AIConfidenceReason');
    }
    set AIConfidenceReason(value: string | null) {
        this.Set('AIConfidenceReason', value);
    }

    /**
    * * Field Name: AIAutoApproved
    * * Display Name: AI Auto Approved
    * * SQL Data Type: bit
    * * Description: Whether this message was automatically approved based on confidence score meeting or exceeding the threshold
    */
    get AIAutoApproved(): boolean | null {
        return this.Get('AIAutoApproved');
    }
    set AIAutoApproved(value: boolean | null) {
        this.Set('AIAutoApproved', value);
    }

    /**
    * * Field Name: AIEvaluatedAt
    * * Display Name: AI Evaluated At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp when the AI confidence evaluation was performed
    */
    get AIEvaluatedAt(): Date | null {
        return this.Get('AIEvaluatedAt');
    }
    set AIEvaluatedAt(value: Date | null) {
        this.Set('AIEvaluatedAt', value);
    }

    /**
    * * Field Name: MessageFormat
    * * Display Name: Message Format
    * * SQL Data Type: nvarchar(20)
    * * Description: Format of the inbound message content. Values: HTML, PlainText, Markdown. Used to determine reply format.
    */
    get MessageFormat(): string | null {
        return this.Get('MessageFormat');
    }
    set MessageFormat(value: string | null) {
        this.Set('MessageFormat', value);
    }

    /**
    * * Field Name: SkipCategory
    * * Display Name: Skip Category
    * * SQL Data Type: nvarchar(100)
    * * Description: Category indicating why the message was skipped. From early rejection: spam, automated-message, prank, phishing. From decision rejection: legal-advice, financial-dispute, explicit-human-request, urgent-sensitive-personal, urgent-sensitive-business, policy-exception, complex-technical, password-reset-failure, marketing-speaker, inappropriate, out-of-scope
    */
    get SkipCategory(): string | null {
        return this.Get('SkipCategory');
    }
    set SkipCategory(value: string | null) {
        this.Set('SkipCategory', value);
    }

    /**
    * * Field Name: SkipReasoning
    * * Display Name: Skip Reasoning
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AI-generated reasoning explaining why the message was skipped or rejected
    */
    get SkipReasoning(): string | null {
        return this.Get('SkipReasoning');
    }
    set SkipReasoning(value: string | null) {
        this.Set('SkipReasoning', value);
    }

    /**
    * * Field Name: IsSpam
    * * Display Name: Is Spam
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Flag indicating the message was identified as spam. Used to filter spam out of pending message lists.
    */
    get IsSpam(): boolean {
        return this.Get('IsSpam');
    }
    set IsSpam(value: boolean) {
        this.Set('IsSpam', value);
    }

    /**
    * * Field Name: ErrorType
    * * Display Name: Error Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * AgentFailure
    *   * ChannelConfigFailure
    *   * CredentialFailure
    *   * Other
    *   * ProviderNotFound
    *   * RateLimited
    *   * SendFailure
    *   * Timeout
    *   * ValidationFailure
    * * Description: Type of error that occurred during processing or sending. Values: AgentFailure, SendFailure, CredentialFailure, ProviderNotFound, ValidationFailure, ChannelConfigFailure, Timeout, RateLimited, Other
    */
    get ErrorType(): 'AgentFailure' | 'ChannelConfigFailure' | 'CredentialFailure' | 'Other' | 'ProviderNotFound' | 'RateLimited' | 'SendFailure' | 'Timeout' | 'ValidationFailure' | null {
        return this.Get('ErrorType');
    }
    set ErrorType(value: 'AgentFailure' | 'ChannelConfigFailure' | 'CredentialFailure' | 'Other' | 'ProviderNotFound' | 'RateLimited' | 'SendFailure' | 'Timeout' | 'ValidationFailure' | null) {
        this.Set('ErrorType', value);
    }

    /**
    * * Field Name: ErrorMessage
    * * Display Name: Error Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed error message describing what went wrong during processing or sending. Useful for debugging and support.
    */
    get ErrorMessage(): string | null {
        return this.Get('ErrorMessage');
    }
    set ErrorMessage(value: string | null) {
        this.Set('ErrorMessage', value);
    }

    /**
    * * Field Name: SentContent
    * * Display Name: Sent Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The exact content that was sent to the recipient, including any signatures and branding. Populated after successful send for audit trail.
    */
    get SentContent(): string | null {
        return this.Get('SentContent');
    }
    set SentContent(value: string | null) {
        this.Set('SentContent', value);
    }

    /**
    * * Field Name: Channel
    * * Display Name: Channel
    * * SQL Data Type: nvarchar(255)
    */
    get Channel(): string {
        return this.Get('Channel');
    }

    /**
    * * Field Name: ChannelRun
    * * Display Name: Channel Run
    * * SQL Data Type: nvarchar(255)
    */
    get ChannelRun(): string | null {
        return this.Get('ChannelRun');
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(MAX)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: Contact
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(255)
    */
    get Contact(): string | null {
        return this.Get('Contact');
    }

    /**
    * * Field Name: ApprovedByContact
    * * Display Name: Approved By Contact
    * * SQL Data Type: nvarchar(255)
    */
    get ApprovedByContact(): string | null {
        return this.Get('ApprovedByContact');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * Channel Runs - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: ChannelRun
 * * Base View: vwChannelRuns
 * * @description Records of channel polling/processing runs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Runs')
export class ChannelRunEntity extends BaseEntity<ChannelRunEntityType> {
    /**
    * Loads the Channel Runs record from the database
    * @param ID: string - primary key value to load the Channel Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelRunEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ChannelID
    * * Display Name: Channel ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channels (vwChannels.ID)
    */
    get ChannelID(): string {
        return this.Get('ChannelID');
    }
    set ChannelID(value: string) {
        this.Set('ChannelID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: When the run started
    */
    get StartedAt(): Date {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: CompletedAt
    * * Display Name: Completed At
    * * SQL Data Type: datetimeoffset
    * * Description: When the run completed (null if still running)
    */
    get CompletedAt(): Date | null {
        return this.Get('CompletedAt');
    }
    set CompletedAt(value: Date | null) {
        this.Set('CompletedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Running
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Completed
    *   * Failed
    *   * Running
    * * Description: Run status: Running, Completed, Failed, Canceled
    */
    get Status(): 'Canceled' | 'Completed' | 'Failed' | 'Running' {
        return this.Get('Status');
    }
    set Status(value: 'Canceled' | 'Completed' | 'Failed' | 'Running') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: MessageCount
    * * Display Name: Message Count
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Total messages found during this run
    */
    get MessageCount(): number {
        return this.Get('MessageCount');
    }
    set MessageCount(value: number) {
        this.Set('MessageCount', value);
    }

    /**
    * * Field Name: ProcessedCount
    * * Display Name: Processed Count
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Messages successfully processed
    */
    get ProcessedCount(): number {
        return this.Get('ProcessedCount');
    }
    set ProcessedCount(value: number) {
        this.Set('ProcessedCount', value);
    }

    /**
    * * Field Name: FailedCount
    * * Display Name: Failed Count
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Messages that failed processing
    */
    get FailedCount(): number {
        return this.Get('FailedCount');
    }
    set FailedCount(value: number) {
        this.Set('FailedCount', value);
    }

    /**
    * * Field Name: ErrorMessage
    * * Display Name: Error Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Error message if run failed
    */
    get ErrorMessage(): string | null {
        return this.Get('ErrorMessage');
    }
    set ErrorMessage(value: string | null) {
        this.Set('ErrorMessage', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Channel
    * * Display Name: Channel Name
    * * SQL Data Type: nvarchar(255)
    */
    get Channel(): string {
        return this.Get('Channel');
    }
}


/**
 * Channel Type Actions - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: ChannelTypeAction
 * * Base View: vwChannelTypeActions
 * * @description Channel type action overrides (middle of inheritance)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Type Actions')
export class ChannelTypeActionEntity extends BaseEntity<ChannelTypeActionEntityType> {
    /**
    * Loads the Channel Type Actions record from the database
    * @param ID: string - primary key value to load the Channel Type Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelTypeActionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: ChannelTypeID
    * * Display Name: Channel Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channel Types (vwChannelTypes.ID)
    */
    get ChannelTypeID(): string {
        return this.Get('ChannelTypeID');
    }
    set ChannelTypeID(value: string) {
        this.Set('ChannelTypeID', value);
    }

    /**
    * * Field Name: ActionID
    * * Display Name: Action
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    * * Description: Action status at channel type level: Active, Disabled
    */
    get Status(): 'Active' | 'Disabled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Disabled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Execution order when multiple actions are available
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON configuration for this action at channel type level
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: CredentialID
    * * Display Name: Credential
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Credentials (vwCredentials.ID)
    * * Description: Reference to the credential used for this action at channel type level
    */
    get CredentialID(): string | null {
        return this.Get('CredentialID');
    }
    set CredentialID(value: string | null) {
        this.Set('CredentialID', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }

    /**
    * * Field Name: ChannelType
    * * Display Name: Channel Type
    * * SQL Data Type: nvarchar(255)
    */
    get ChannelType(): string {
        return this.Get('ChannelType');
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {
        return this.Get('Action');
    }

    /**
    * * Field Name: Credential
    * * Display Name: Credential
    * * SQL Data Type: nvarchar(255)
    */
    get Credential(): string | null {
        return this.Get('Credential');
    }
}


/**
 * Channel Types - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: ChannelType
 * * Base View: vwChannelTypes
 * * @description Types of communication channels (Email, SMS, Chat, etc.)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Types')
export class ChannelTypeEntity extends BaseEntity<ChannelTypeEntityType> {
    /**
    * Loads the Channel Types record from the database
    * @param ID: string - primary key value to load the Channel Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Channel type display name
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the channel type
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CommunicationProviderID
    * * Display Name: Communication Provider
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)
    */
    get CommunicationProviderID(): string {
        return this.Get('CommunicationProviderID');
    }
    set CommunicationProviderID(value: string) {
        this.Set('CommunicationProviderID', value);
    }

    /**
    * * Field Name: ActionInheritMode
    * * Display Name: Action Inherit Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Combined
    * * Value List Type: List
    * * Possible Values 
    *   * ChannelType
    *   * Combined
    *   * Organization
    * * Description: How actions are inherited: Organization, ChannelType, Combined
    */
    get ActionInheritMode(): 'ChannelType' | 'Combined' | 'Organization' {
        return this.Get('ActionInheritMode');
    }
    set ActionInheritMode(value: 'ChannelType' | 'Combined' | 'Organization') {
        this.Set('ActionInheritMode', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Revoked
    * * Description: Channel type status: Active, Pending, Revoked
    */
    get Status(): 'Active' | 'Pending' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Pending' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: CommunicationProvider
    * * Display Name: Provider Name
    * * SQL Data Type: nvarchar(255)
    */
    get CommunicationProvider(): string {
        return this.Get('CommunicationProvider');
    }
}


/**
 * Channels - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: Channel
 * * Base View: vwChannels
 * * @description Specific communication channels configured for organizations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channels')
export class ChannelEntity extends BaseEntity<ChannelEntityType> {
    /**
    * Loads the Channels record from the database
    * @param ID: string - primary key value to load the Channels record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: ChannelTypeID
    * * Display Name: Channel Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channel Types (vwChannelTypes.ID)
    */
    get ChannelTypeID(): string {
        return this.Get('ChannelTypeID');
    }
    set ChannelTypeID(value: string) {
        this.Set('ChannelTypeID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Channel display name
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the channel
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ExternalIdentifier
    * * Display Name: External Identifier
    * * SQL Data Type: nvarchar(MAX)
    * * Description: External identifier for this channel (email address, phone number, Slack handle, etc.)
    */
    get ExternalIdentifier(): string | null {
        return this.Get('ExternalIdentifier');
    }
    set ExternalIdentifier(value: string | null) {
        this.Set('ExternalIdentifier', value);
    }

    /**
    * * Field Name: CheckFrequency
    * * Display Name: Check Frequency
    * * SQL Data Type: int
    * * Description: How often to check for new messages (in minutes)
    */
    get CheckFrequency(): number | null {
        return this.Get('CheckFrequency');
    }
    set CheckFrequency(value: number | null) {
        this.Set('CheckFrequency', value);
    }

    /**
    * * Field Name: ActionInheritMode
    * * Display Name: Action Inherit Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: ChannelType
    * * Value List Type: List
    * * Possible Values 
    *   * Channel
    *   * ChannelType
    *   * Combined
    *   * Organization
    * * Description: How actions are inherited: Organization, ChannelType, Channel, Combined
    */
    get ActionInheritMode(): 'Channel' | 'ChannelType' | 'Combined' | 'Organization' {
        return this.Get('ActionInheritMode');
    }
    set ActionInheritMode(value: 'Channel' | 'ChannelType' | 'Combined' | 'Organization') {
        this.Set('ActionInheritMode', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Revoked
    * * Description: Channel status: Active, Pending, Revoked
    */
    get Status(): 'Active' | 'Pending' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Pending' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: CredentialID
    * * Display Name: Credential ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Credentials (vwCredentials.ID)
    * * Description: Reference to the credential used for provider authentication
    */
    get CredentialID(): string | null {
        return this.Get('CredentialID');
    }
    set CredentialID(value: string | null) {
        this.Set('CredentialID', value);
    }

    /**
    * * Field Name: IzzyAIConfigurationID
    * * Display Name: Izzy AI Configuration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Izzy AI Configurations (vwIzzyAIConfigurations.ID)
    * * Description: Optional AI configuration override for this channel. If NULL, inherits from organization.
    */
    get IzzyAIConfigurationID(): string | null {
        return this.Get('IzzyAIConfigurationID');
    }
    set IzzyAIConfigurationID(value: string | null) {
        this.Set('IzzyAIConfigurationID', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }

    /**
    * * Field Name: ChannelType
    * * Display Name: Channel Type
    * * SQL Data Type: nvarchar(255)
    */
    get ChannelType(): string {
        return this.Get('ChannelType');
    }

    /**
    * * Field Name: Credential
    * * Display Name: Credential
    * * SQL Data Type: nvarchar(255)
    */
    get Credential(): string | null {
        return this.Get('Credential');
    }

    /**
    * * Field Name: IzzyAIConfiguration
    * * Display Name: Izzy AI Configuration
    * * SQL Data Type: nvarchar(100)
    */
    get IzzyAIConfiguration(): string | null {
        return this.Get('IzzyAIConfiguration');
    }
}


/**
 * Contact Roles - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: ContactRole
 * * Base View: vwContactRoles
 * * @description Roles that contacts can have within an organization
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Roles')
export class ContactRoleEntity extends BaseEntity<ContactRoleEntityType> {
    /**
    * Loads the Contact Roles record from the database
    * @param ID: string - primary key value to load the Contact Roles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactRoleEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Role display name
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Description of role permissions and responsibilities
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Level
    * * Display Name: Level
    * * SQL Data Type: int
    * * Description: Numeric level for role hierarchy (higher = more permissions)
    */
    get Level(): number {
        return this.Get('Level');
    }
    set Level(value: number) {
        this.Set('Level', value);
    }

    /**
    * * Field Name: IsSystem
    * * Display Name: System Role
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this is a system-defined role that cannot be deleted
    */
    get IsSystem(): boolean {
        return this.Get('IsSystem');
    }
    set IsSystem(value: boolean) {
        this.Set('IsSystem', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    * * Description: Role status: Active, Inactive
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contacts - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: Contact
 * * Base View: vwContacts
 * * @description Individual users who interact with the Izzy platform
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts')
export class ContactEntity extends BaseEntity<ContactEntityType> {
    /**
    * Loads the Contacts record from the database
    * @param ID: string - primary key value to load the Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Contact first name
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Contact last name
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    * * Description: Contact email address (unique identifier for login)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(100)
    * * Description: Job title or position
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: ProfileImageURL
    * * Display Name: Profile Image URL
    * * SQL Data Type: nvarchar(1024)
    * * Description: URL to profile image
    */
    get ProfileImageURL(): string | null {
        return this.Get('ProfileImageURL');
    }
    set ProfileImageURL(value: string | null) {
        this.Set('ProfileImageURL', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Canceled
    *   * Pending
    * * Description: Contact status: Active, Pending, Canceled
    */
    get Status(): 'Active' | 'Canceled' | 'Pending' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Canceled' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Credential Types - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: CredentialType
 * * Base View: vwCredentialTypes
 * * @description Defines vendor/service types for credentials (e.g., HubSpot, Twilio, Salesforce)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Credential Types')
export class CredentialTypeEntity extends BaseEntity<CredentialTypeEntityType> {
    /**
    * Loads the Credential Types record from the database
    * @param ID: string - primary key value to load the Credential Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CredentialTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(50)
    * * Description: Category of the credential type (CRM, Email, SMS, Helpdesk, etc.)
    */
    get Category(): string {
        return this.Get('Category');
    }
    set Category(value: string) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: CredentialSchema
    * * Display Name: Credential Schema
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON Schema defining required credential fields for this type
    */
    get CredentialSchema(): string | null {
        return this.Get('CredentialSchema');
    }
    set CredentialSchema(value: string | null) {
        this.Set('CredentialSchema', value);
    }

    /**
    * * Field Name: IconClass
    * * Display Name: Icon Class
    * * SQL Data Type: nvarchar(100)
    */
    get IconClass(): string | null {
        return this.Get('IconClass');
    }
    set IconClass(value: string | null) {
        this.Set('IconClass', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Deprecated
    *   * Inactive
    */
    get Status(): 'Active' | 'Deprecated' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Deprecated' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Credentials - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: Credential
 * * Base View: vwCredentials
 * * @description Organization-scoped credentials linked to a credential type
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Credentials')
export class CredentialEntity extends BaseEntity<CredentialEntityType> {
    /**
    * Loads the Credentials record from the database
    * @param ID: string - primary key value to load the Credentials record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CredentialEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: TypeID
    * * Display Name: Credential Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Credential Types (vwCredentialTypes.ID)
    */
    get TypeID(): string {
        return this.Get('TypeID');
    }
    set TypeID(value: string) {
        this.Set('TypeID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: EncryptedCredentials
    * * Display Name: Encrypted Credentials
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AES-256-GCM encrypted credentials JSON
    */
    get EncryptedCredentials(): string | null {
        return this.Get('EncryptedCredentials');
    }
    set EncryptedCredentials(value: string | null) {
        this.Set('EncryptedCredentials', value);
    }

    /**
    * * Field Name: CredentialNotes
    * * Display Name: Credential Notes
    * * SQL Data Type: nvarchar(500)
    * * Description: Human-readable notes about the credentials (not encrypted)
    */
    get CredentialNotes(): string | null {
        return this.Get('CredentialNotes');
    }
    set CredentialNotes(value: string | null) {
        this.Set('CredentialNotes', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Inactive
    *   * Revoked
    */
    get Status(): 'Active' | 'Expired' | 'Inactive' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Expired' | 'Inactive' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expires At
    * * SQL Data Type: datetimeoffset
    * * Description: When the credential expires (for OAuth tokens, API keys with expiry, etc.)
    */
    get ExpiresAt(): Date | null {
        return this.Get('ExpiresAt');
    }
    set ExpiresAt(value: Date | null) {
        this.Set('ExpiresAt', value);
    }

    /**
    * * Field Name: LastUsedAt
    * * Display Name: Last Used At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of last credential usage for auditing
    */
    get LastUsedAt(): Date | null {
        return this.Get('LastUsedAt');
    }
    set LastUsedAt(value: Date | null) {
        this.Set('LastUsedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }

    /**
    * * Field Name: Type
    * * Display Name: Credential Type
    * * SQL Data Type: nvarchar(100)
    */
    get Type(): string {
        return this.Get('Type');
    }
}


/**
 * Izzy Action Categories - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: IzzyActionCategory
 * * Base View: vwIzzyActionCategories
 * * @description Hierarchical categories for organizing actions in the gallery
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Izzy Action Categories')
export class IzzyActionCategoryEntity extends BaseEntity<IzzyActionCategoryEntityType> {
    /**
    * Loads the Izzy Action Categories record from the database
    * @param ID: string - primary key value to load the Izzy Action Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof IzzyActionCategoryEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Category display name
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Description of actions in this category
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Izzy Action Categories (vwIzzyActionCategories.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: IconClass
    * * Display Name: Icon Class
    * * SQL Data Type: nvarchar(100)
    * * Description: Font Awesome icon class for UI display
    */
    get IconClass(): string | null {
        return this.Get('IconClass');
    }
    set IconClass(value: string | null) {
        this.Set('IconClass', value);
    }

    /**
    * * Field Name: SortOrder
    * * Display Name: Sort Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order within parent category
    */
    get SortOrder(): number {
        return this.Get('SortOrder');
    }
    set SortOrder(value: number) {
        this.Set('SortOrder', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    * * Description: Category status: Active, Inactive
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(100)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * Izzy Action Organizations - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: IzzyActionOrganization
 * * Base View: vwIzzyActionOrganizations
 * * @description Grants private actions to specific organizations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Izzy Action Organizations')
export class IzzyActionOrganizationEntity extends BaseEntity<IzzyActionOrganizationEntityType> {
    /**
    * Loads the Izzy Action Organizations record from the database
    * @param ID: string - primary key value to load the Izzy Action Organizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof IzzyActionOrganizationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: IzzyActionID
    * * Display Name: Izzy Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Izzy Actions (vwIzzyActions.ID)
    */
    get IzzyActionID(): string {
        return this.Get('IzzyActionID');
    }
    set IzzyActionID(value: string) {
        this.Set('IzzyActionID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Revoked
    * * Description: Grant status: Active, Revoked
    */
    get Status(): 'Active' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: GrantedAt
    * * Display Name: Granted At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: When the action was granted to this organization
    */
    get GrantedAt(): Date {
        return this.Get('GrantedAt');
    }
    set GrantedAt(value: Date) {
        this.Set('GrantedAt', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expires At
    * * SQL Data Type: datetimeoffset
    * * Description: When this grant expires (null = never)
    */
    get ExpiresAt(): Date | null {
        return this.Get('ExpiresAt');
    }
    set ExpiresAt(value: Date | null) {
        this.Set('ExpiresAt', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(500)
    * * Description: Admin notes about why this was granted
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: IzzyAction
    * * Display Name: Action Name
    * * SQL Data Type: nvarchar(255)
    */
    get IzzyAction(): string {
        return this.Get('IzzyAction');
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }
}


/**
 * Izzy Actions - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: IzzyAction
 * * Base View: vwIzzyActions
 * * @description Master list of actions available in the Izzy platform
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Izzy Actions')
export class IzzyActionEntity extends BaseEntity<IzzyActionEntityType> {
    /**
    * Loads the Izzy Actions record from the database
    * @param ID: string - primary key value to load the Izzy Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof IzzyActionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Display name for the action
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description of what the action does
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Izzy Action Categories (vwIzzyActionCategories.ID)
    */
    get CategoryID(): string | null {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: IconClass
    * * Display Name: Icon Class
    * * SQL Data Type: nvarchar(100)
    * * Description: Font Awesome icon class for UI display
    */
    get IconClass(): string | null {
        return this.Get('IconClass');
    }
    set IconClass(value: string | null) {
        this.Set('IconClass', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Coming Soon
    *   * Deprecated
    * * Description: Action status: Active, Deprecated, Coming Soon
    */
    get Status(): 'Active' | 'Coming Soon' | 'Deprecated' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Coming Soon' | 'Deprecated') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: IsPublic
    * * Display Name: Is Public
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this action is available to all orgs (vs private)
    */
    get IsPublic(): boolean {
        return this.Get('IsPublic');
    }
    set IsPublic(value: boolean) {
        this.Set('IsPublic', value);
    }

    /**
    * * Field Name: MinimumPlanLevel
    * * Display Name: Minimum Plan Level
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Minimum plan level required to use this action
    */
    get MinimumPlanLevel(): number {
        return this.Get('MinimumPlanLevel');
    }
    set MinimumPlanLevel(value: number) {
        this.Set('MinimumPlanLevel', value);
    }

    /**
    * * Field Name: RequiresCredentials
    * * Display Name: Requires Credentials
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this action requires credentials to be configured
    */
    get RequiresCredentials(): boolean {
        return this.Get('RequiresCredentials');
    }
    set RequiresCredentials(value: boolean) {
        this.Set('RequiresCredentials', value);
    }

    /**
    * * Field Name: CredentialSchema
    * * Display Name: Credential Schema
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON Schema defining required credential fields
    */
    get CredentialSchema(): string | null {
        return this.Get('CredentialSchema');
    }
    set CredentialSchema(value: string | null) {
        this.Set('CredentialSchema', value);
    }

    /**
    * * Field Name: ConfigurationSchema
    * * Display Name: Configuration Schema
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON Schema defining configuration options
    */
    get ConfigurationSchema(): string | null {
        return this.Get('ConfigurationSchema');
    }
    set ConfigurationSchema(value: string | null) {
        this.Set('ConfigurationSchema', value);
    }

    /**
    * * Field Name: DocumentationURL
    * * Display Name: Documentation URL
    * * SQL Data Type: nvarchar(1024)
    * * Description: URL to action documentation
    */
    get DocumentationURL(): string | null {
        return this.Get('DocumentationURL');
    }
    set DocumentationURL(value: string | null) {
        this.Set('DocumentationURL', value);
    }

    /**
    * * Field Name: SortOrder
    * * Display Name: Sort Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order within category
    */
    get SortOrder(): number {
        return this.Get('SortOrder');
    }
    set SortOrder(value: number) {
        this.Set('SortOrder', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {
        return this.Get('Action');
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
}


/**
 * Izzy AI Configurations - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: IzzyAIConfiguration
 * * Base View: vwIzzyAIConfigurations
 * * @description Izzy-specific wrapper around MJ AI Configurations. Adds plan-level restrictions and expiration for multi-tenant scenarios.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Izzy AI Configurations')
export class IzzyAIConfigurationEntity extends BaseEntity<IzzyAIConfigurationEntityType> {
    /**
    * Loads the Izzy AI Configurations record from the database
    * @param ID: string - primary key value to load the Izzy AI Configurations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof IzzyAIConfigurationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name for this AI configuration (e.g., "Groq/Cerebras Fast", "Anthropic Premium")
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: AIConfigurationID
    * * Display Name: AI Configuration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: AI Configurations (vwAIConfigurations.ID)
    * * Description: Foreign key to MJ AI Configuration which defines the actual model/vendor assignments
    */
    get AIConfigurationID(): string {
        return this.Get('AIConfigurationID');
    }
    set AIConfigurationID(value: string) {
        this.Set('AIConfigurationID', value);
    }

    /**
    * * Field Name: MinPlanLevel
    * * Display Name: Min Plan Level
    * * SQL Data Type: nvarchar(50)
    * * Description: Minimum subscription plan level required to use this configuration (e.g., Free, Pro, Enterprise). NULL means available to all.
    */
    get MinPlanLevel(): string | null {
        return this.Get('MinPlanLevel');
    }
    set MinPlanLevel(value: string | null) {
        this.Set('MinPlanLevel', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expires At
    * * SQL Data Type: datetimeoffset
    * * Description: When this configuration expires and becomes unavailable. NULL means never expires.
    */
    get ExpiresAt(): Date | null {
        return this.Get('ExpiresAt');
    }
    set ExpiresAt(value: Date | null) {
        this.Set('ExpiresAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    */
    get Status(): string {
        return this.Get('Status');
    }
    set Status(value: string) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: AIConfiguration
    * * Display Name: AI Configuration
    * * SQL Data Type: nvarchar(100)
    */
    get AIConfiguration(): string {
        return this.Get('AIConfiguration');
    }
}


/**
 * Organization Actions - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: OrganizationAction
 * * Base View: vwOrganizationActions
 * * @description Organization-level action configuration (top of inheritance)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organization Actions')
export class OrganizationActionEntity extends BaseEntity<OrganizationActionEntityType> {
    /**
    * Loads the Organization Actions record from the database
    * @param ID: string - primary key value to load the Organization Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrganizationActionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: ActionID
    * * Display Name: Action
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    * * Description: Action status at org level: Active, Disabled
    */
    get Status(): 'Active' | 'Disabled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Disabled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Execution order when multiple actions are available
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON configuration for this action at org level
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: CredentialID
    * * Display Name: Credential
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Credentials (vwCredentials.ID)
    * * Description: Reference to the credential used for this action at org level
    */
    get CredentialID(): string | null {
        return this.Get('CredentialID');
    }
    set CredentialID(value: string | null) {
        this.Set('CredentialID', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {
        return this.Get('Action');
    }

    /**
    * * Field Name: Credential
    * * Display Name: Credential
    * * SQL Data Type: nvarchar(255)
    */
    get Credential(): string | null {
        return this.Get('Credential');
    }
}


/**
 * Organization Contacts - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: OrganizationContact
 * * Base View: vwOrganizationContacts
 * * @description Links contacts to organizations with specific roles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organization Contacts')
export class OrganizationContactEntity extends BaseEntity<OrganizationContactEntityType> {
    /**
    * Loads the Organization Contacts record from the database
    * @param ID: string - primary key value to load the Organization Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrganizationContactEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contact Roles (vwContactRoles.ID)
    */
    get RoleID(): string {
        return this.Get('RoleID');
    }
    set RoleID(value: string) {
        this.Set('RoleID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Revoked
    * * Description: Membership status: Active, Pending, Revoked
    */
    get Status(): 'Active' | 'Pending' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Pending' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }

    /**
    * * Field Name: Contact
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(255)
    */
    get Contact(): string {
        return this.Get('Contact');
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(100)
    */
    get Role(): string {
        return this.Get('Role');
    }
}


/**
 * Organization Settings - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: OrganizationSetting
 * * Base View: vwOrganizationSettings
 * * @description Organization-specific setting values
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organization Settings')
export class OrganizationSettingEntity extends BaseEntity<OrganizationSettingEntityType> {
    /**
    * Loads the Organization Settings record from the database
    * @param ID: string - primary key value to load the Organization Settings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrganizationSettingEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Organization Settings entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: When the record’s Scope is set to 'Organization', the ChannelID must be left empty because the setting applies to the entire organization. When the Scope is 'Channel', a specific ChannelID must be provided so the setting can be linked to that channel.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateChannelIDComparedToScope(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * When the record’s Scope is set to 'Organization', the ChannelID must be left empty because the setting applies to the entire organization. When the Scope is 'Channel', a specific ChannelID must be provided so the setting can be linked to that channel.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateChannelIDComparedToScope(result: ValidationResult) {
    	// If Scope is 'Organization', ChannelID must be null
    	if (this.Scope === 'Organization' && this.ChannelID != null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ChannelID",
    			"When Scope is set to 'Organization', ChannelID must be empty.",
    			this.ChannelID,
    			ValidationErrorType.Failure
    		));
    	}
    	// If Scope is 'Channel', ChannelID must be provided
    	if (this.Scope === 'Channel' && this.ChannelID == null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ChannelID",
    			"When Scope is set to 'Channel', a valid ChannelID is required.",
    			this.ChannelID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: SettingID
    * * Display Name: Setting
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Settings (vwSettings.ID)
    */
    get SettingID(): string {
        return this.Get('SettingID');
    }
    set SettingID(value: string) {
        this.Set('SettingID', value);
    }

    /**
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The setting value for this organization
    */
    get Value(): string | null {
        return this.Get('Value');
    }
    set Value(value: string | null) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Scope
    * * Display Name: Scope
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Organization
    * * Description: Scope of the setting: Organization (applies to all channels in org) or Channel (specific to one channel)
    */
    get Scope(): string {
        return this.Get('Scope');
    }
    set Scope(value: string) {
        this.Set('Scope', value);
    }

    /**
    * * Field Name: ChannelID
    * * Display Name: Channel
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channels (vwChannels.ID)
    * * Description: Optional Channel ID for channel-scoped settings. Required when Scope = Channel, must be NULL when Scope = Organization
    */
    get ChannelID(): string | null {
        return this.Get('ChannelID');
    }
    set ChannelID(value: string | null) {
        this.Set('ChannelID', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }

    /**
    * * Field Name: Setting
    * * Display Name: Setting
    * * SQL Data Type: nvarchar(255)
    */
    get Setting(): string {
        return this.Get('Setting');
    }

    /**
    * * Field Name: Channel
    * * Display Name: Channel Name
    * * SQL Data Type: nvarchar(255)
    */
    get Channel(): string | null {
        return this.Get('Channel');
    }
}


/**
 * Organizations - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: Organization
 * * Base View: vwOrganizations
 * * @description Customer organizations using the Izzy platform
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organizations')
export class OrganizationEntity extends BaseEntity<OrganizationEntityType> {
    /**
    * Loads the Organizations record from the database
    * @param ID: string - primary key value to load the Organizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrganizationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Organization display name
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional description of the organization
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: PlanID
    * * Display Name: Plan ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Plans (vwPlans.ID)
    */
    get PlanID(): string | null {
        return this.Get('PlanID');
    }
    set PlanID(value: string | null) {
        this.Set('PlanID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Revoked
    * * Description: Organization status: Active, Pending, Revoked
    */
    get Status(): 'Active' | 'Pending' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Pending' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: IzzyAIConfigurationID
    * * Display Name: AI Configuration
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Izzy AI Configurations (vwIzzyAIConfigurations.ID)
    * * Description: Default AI configuration for this organization. Inherited by sub-orgs and channels unless overridden.
    */
    get IzzyAIConfigurationID(): string | null {
        return this.Get('IzzyAIConfigurationID');
    }
    set IzzyAIConfigurationID(value: string | null) {
        this.Set('IzzyAIConfigurationID', value);
    }

    /**
    * * Field Name: Domain
    * * Display Name: Domain
    * * SQL Data Type: nvarchar(255)
    * * Description: Primary email domain for the organization (e.g., meetizzy.ai). Used for user auto-association and internal org identification.
    */
    get Domain(): string | null {
        return this.Get('Domain');
    }
    set Domain(value: string | null) {
        this.Set('Domain', value);
    }

    /**
    * * Field Name: LogoURL
    * * Display Name: Logo URL
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Logo image for the organization. Can be a base64-encoded data URL or an external image URL.
    */
    get LogoURL(): string | null {
        return this.Get('LogoURL');
    }
    set LogoURL(value: string | null) {
        this.Set('LogoURL', value);
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(255)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: Plan
    * * Display Name: Plan
    * * SQL Data Type: nvarchar(50)
    */
    get Plan(): string | null {
        return this.Get('Plan');
    }

    /**
    * * Field Name: IzzyAIConfiguration
    * * Display Name: AI Configuration Details
    * * SQL Data Type: nvarchar(100)
    */
    get IzzyAIConfiguration(): string | null {
        return this.Get('IzzyAIConfiguration');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * Plans - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: Plan
 * * Base View: vwPlans
 * * @description SaaS subscription tiers defining feature access levels
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Plans')
export class PlanEntity extends BaseEntity<PlanEntityType> {
    /**
    * Loads the Plans record from the database
    * @param ID: string - primary key value to load the Plans record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PlanEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Plan Name
    * * SQL Data Type: nvarchar(50)
    * * Description: Display name of the plan
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Level
    * * Display Name: Plan Level
    * * SQL Data Type: int
    * * Description: Numeric level for plan comparison (higher = more features)
    */
    get Level(): number {
        return this.Get('Level');
    }
    set Level(value: number) {
        this.Set('Level', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Description of plan features and benefits
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: MonthlyPrice
    * * Display Name: Monthly Price
    * * SQL Data Type: decimal(10, 2)
    * * Description: Monthly subscription price
    */
    get MonthlyPrice(): number | null {
        return this.Get('MonthlyPrice');
    }
    set MonthlyPrice(value: number | null) {
        this.Set('MonthlyPrice', value);
    }

    /**
    * * Field Name: AnnualPrice
    * * Display Name: Annual Price
    * * SQL Data Type: decimal(10, 2)
    * * Description: Annual subscription price (typically discounted)
    */
    get AnnualPrice(): number | null {
        return this.Get('AnnualPrice');
    }
    set AnnualPrice(value: number | null) {
        this.Set('AnnualPrice', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    * * Description: Plan status: Active, Inactive
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Scopes - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: Scope
 * * Base View: vwScopes
 * * @description API permission scopes for access control
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Scopes')
export class ScopeEntity extends BaseEntity<ScopeEntityType> {
    /**
    * Loads the Scopes record from the database
    * @param ID: string - primary key value to load the Scopes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ScopeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Scope identifier (e.g., messages:read)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Human-readable description of what this scope allows
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Setting Categories - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: SettingCategory
 * * Base View: vwSettingCategories
 * * @description Hierarchical categories for organizing settings
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Setting Categories')
export class SettingCategoryEntity extends BaseEntity<SettingCategoryEntityType> {
    /**
    * Loads the Setting Categories record from the database
    * @param ID: string - primary key value to load the Setting Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SettingCategoryEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Category display name
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Description of settings in this category
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(100)
    * * Description: FontAwesome icon class for UI display
    */
    get Icon(): string | null {
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Setting Categories (vwSettingCategories.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order within parent category
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: AllowedScopes
    * * Display Name: Allowed Scopes
    * * SQL Data Type: nvarchar(100)
    * * Description: Optional default AllowedScopes for settings in this category. If NULL, each setting uses its own AllowedScopes. Comma-separated values: Organization, Channel.
    */
    get AllowedScopes(): string | null {
        return this.Get('AllowedScopes');
    }
    set AllowedScopes(value: string | null) {
        this.Set('AllowedScopes', value);
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent Name
    * * SQL Data Type: nvarchar(100)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * Settings - strongly typed entity sub-class
 * * Schema: Izzy
 * * Base Table: Setting
 * * Base View: vwSettings
 * * @description Configurable settings that can be customized per organization
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Settings')
export class SettingEntity extends BaseEntity<SettingEntityType> {
    /**
    * Loads the Settings record from the database
    * @param ID: string - primary key value to load the Settings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SettingEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Key
    * * Display Name: Key
    * * SQL Data Type: nvarchar(255)
    * * Description: Unique programmatic key for the setting
    */
    get Key(): string {
        return this.Get('Key');
    }
    set Key(value: string) {
        this.Set('Key', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Display name for the setting
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of what this setting controls
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(100)
    * * Description: FontAwesome icon class for UI display
    */
    get Icon(): string | null {
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Setting Categories (vwSettingCategories.ID)
    */
    get CategoryID(): string | null {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: ValueType
    * * Display Name: Value Type
    * * SQL Data Type: nvarchar(50)
    * * Default Value: String
    * * Value List Type: List
    * * Possible Values 
    *   * Boolean
    *   * Date
    *   * HTML
    *   * JSON
    *   * Markdown
    *   * Number
    *   * String
    * * Description: Value type: String, Number, Boolean, JSON, Date, Markdown, HTML
    */
    get ValueType(): 'Boolean' | 'Date' | 'HTML' | 'JSON' | 'Markdown' | 'Number' | 'String' {
        return this.Get('ValueType');
    }
    set ValueType(value: 'Boolean' | 'Date' | 'HTML' | 'JSON' | 'Markdown' | 'Number' | 'String') {
        this.Set('ValueType', value);
    }

    /**
    * * Field Name: DefaultValue
    * * Display Name: Default Value
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Default value if not overridden
    */
    get DefaultValue(): string | null {
        return this.Get('DefaultValue');
    }
    set DefaultValue(value: string | null) {
        this.Set('DefaultValue', value);
    }

    /**
    * * Field Name: ValidationRegex
    * * Display Name: Validation Regex
    * * SQL Data Type: nvarchar(500)
    * * Description: Regex pattern for validating values
    */
    get ValidationRegex(): string | null {
        return this.Get('ValidationRegex');
    }
    set ValidationRegex(value: string | null) {
        this.Set('ValidationRegex', value);
    }

    /**
    * * Field Name: IsRequired
    * * Display Name: Is Required
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this setting must have a value
    */
    get IsRequired(): boolean {
        return this.Get('IsRequired');
    }
    set IsRequired(value: boolean) {
        this.Set('IsRequired', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order within category
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    * * Description: Setting status: Active, Inactive
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: IsCategoryController
    * * Display Name: Is Category Controller
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When true, this setting acts as the master on/off switch for its entire category. Other settings in the category are disabled in the UI when this setting value is false.
    */
    get IsCategoryController(): boolean {
        return this.Get('IsCategoryController');
    }
    set IsCategoryController(value: boolean) {
        this.Set('IsCategoryController', value);
    }

    /**
    * * Field Name: AllowedScopes
    * * Display Name: Allowed Scopes
    * * SQL Data Type: nvarchar(100)
    * * Default Value: Organization,Channel
    * * Description: Comma-separated list of scopes where this setting can be configured. Values: Organization, Channel. Default allows both with inheritance (Channel overrides Organization).
    */
    get AllowedScopes(): string {
        return this.Get('AllowedScopes');
    }
    set AllowedScopes(value: string) {
        this.Set('AllowedScopes', value);
    }

    /**
    * * Field Name: MinimumPlanLevel
    * * Display Name: Minimum Plan Level
    * * SQL Data Type: int
    * * Description: Minimum plan level required to configure this setting. If NULL, setting is available to all plans. Maps to Plan.Level values (e.g., Free=0, Starter=10, Pro=20, Enterprise=30).
    */
    get MinimumPlanLevel(): number | null {
        return this.Get('MinimumPlanLevel');
    }
    set MinimumPlanLevel(value: number | null) {
        this.Set('MinimumPlanLevel', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
}
