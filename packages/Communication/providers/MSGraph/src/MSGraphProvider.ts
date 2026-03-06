import {
    BaseCommunicationProvider,
    CreateDraftParams,
    CreateDraftResult,
    ForwardMessageParams,
    ForwardMessageResult,
    GetMessagesParams,
    GetMessagesResult,
    GetSingleMessageParams,
    GetSingleMessageResult,
    DeleteMessageParams,
    DeleteMessageResult,
    MoveMessageParams,
    MoveMessageResult,
    ListFoldersParams,
    ListFoldersResult,
    MarkAsReadParams,
    MarkAsReadResult,
    ArchiveMessageParams,
    ArchiveMessageResult,
    SearchMessagesParams,
    SearchMessagesResult,
    ListAttachmentsParams,
    ListAttachmentsResult,
    DownloadAttachmentParams,
    DownloadAttachmentResult,
    MessageFolder,
    MessageAttachment,
    ProviderOperation,
    MessageResult,
    ProcessedMessage,
    ProviderCredentialsBase,
    ReplyToMessageParams,
    ReplyToMessageResult,
    resolveCredentialValue,
    validateRequiredCredentials
} from "@memberjunction/communication-types";
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { Message } from "@microsoft/microsoft-graph-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import { compile, compiledFunction } from 'html-to-text';
import * as Auth from "./auth";
import * as Config from "./config";

/**
 * Credentials for Microsoft Graph (Azure AD) email provider.
 *
 * @example
 * ```typescript
 * // Use with SendSingleMessage
 * await provider.SendSingleMessage(message, {
 *     tenantId: 'your-tenant-id',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     accountEmail: 'user@domain.com'
 * });
 *
 * // Override only accountEmail (use env vars for auth)
 * await provider.SendSingleMessage(message, {
 *     accountEmail: 'different-mailbox@domain.com'
 * });
 *
 * // Disable environment fallback
 * await provider.SendSingleMessage(message, {
 *     tenantId: 'your-tenant-id',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     accountEmail: 'user@domain.com',
 *     disableEnvironmentFallback: true
 * });
 * ```
 */
export interface MSGraphCredentials extends ProviderCredentialsBase {
    /**
     * Azure AD tenant ID (GUID).
     * If not provided, falls back to AZURE_TENANT_ID environment variable.
     */
    tenantId?: string;

    /**
     * Azure AD application (client) ID (GUID).
     * If not provided, falls back to AZURE_CLIENT_ID environment variable.
     */
    clientId?: string;

    /**
     * Azure AD application client secret.
     * If not provided, falls back to AZURE_CLIENT_SECRET environment variable.
     */
    clientSecret?: string;

    /**
     * Email address of the mailbox to send from.
     * If not provided, falls back to AZURE_ACCOUNT_EMAIL environment variable.
     * Can also be overridden via message.From.
     */
    accountEmail?: string;
}

/**
 * Resolved MS Graph credentials with all required fields populated.
 */
interface ResolvedMSGraphCredentials {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    accountEmail: string;
}

/**
 * Implementation of the MS Graph provider for sending and receiving messages.
 *
 * @remarks
 * Microsoft Graph provides full mailbox access. This provider supports:
 * - Sending messages
 * - Fetching messages from inbox
 * - Forwarding messages
 * - Replying to messages
 * - Creating drafts
 *
 * @example
 * ```typescript
 * // Using environment credentials (default)
 * await engine.SendSingleMessage('Microsoft Graph', 'Standard Email', message);
 *
 * // Using per-request credentials
 * await engine.SendSingleMessage('Microsoft Graph', 'Standard Email', message, undefined, false, {
 *     tenantId: 'customer-tenant-id',
 *     clientId: 'customer-client-id',
 *     clientSecret: 'customer-client-secret',
 *     accountEmail: 'customer@domain.com'
 * });
 * ```
 */
@RegisterClass(BaseCommunicationProvider, 'Microsoft Graph')
export class MSGraphProvider extends BaseCommunicationProvider {

    private HTMLConverter: compiledFunction;

    // Cache clients by credential hash for performance with per-request credentials
    private clientCache: Map<string, Client> = new Map();

    constructor() {
        super();

        this.HTMLConverter = compile({
            wordwrap: 130
        });
    }

    /**
     * Resolves MS Graph credentials from request and environment.
     */
    private resolveCredentials(credentials?: MSGraphCredentials): ResolvedMSGraphCredentials {
        const disableFallback = credentials?.disableEnvironmentFallback ?? false;

        const tenantId = resolveCredentialValue(credentials?.tenantId, Config.AZURE_TENANT_ID, disableFallback);
        const clientId = resolveCredentialValue(credentials?.clientId, Config.AZURE_CLIENT_ID, disableFallback);
        const clientSecret = resolveCredentialValue(credentials?.clientSecret, Config.AZURE_CLIENT_SECRET, disableFallback);
        const accountEmail = resolveCredentialValue(credentials?.accountEmail, Config.AZURE_ACCOUNT_EMAIL, disableFallback);

        validateRequiredCredentials(
            { tenantId, clientId, clientSecret, accountEmail },
            ['tenantId', 'clientId', 'clientSecret', 'accountEmail'],
            'Microsoft Graph'
        );

        return {
            tenantId: tenantId!,
            clientId: clientId!,
            clientSecret: clientSecret!,
            accountEmail: accountEmail!
        };
    }

    /**
     * Gets or creates a Graph client for the given credentials.
     * Uses cached client if credentials match environment (default case).
     */
    private getGraphClient(creds: ResolvedMSGraphCredentials): Client {
        // Check if using environment credentials (can use shared client)
        const isEnvCredentials =
            creds.tenantId === Config.AZURE_TENANT_ID &&
            creds.clientId === Config.AZURE_CLIENT_ID &&
            creds.clientSecret === Config.AZURE_CLIENT_SECRET;

        if (isEnvCredentials) {
            // Use the shared Auth.GraphClient for environment credentials
            return Auth.GraphClient;
        }

        // For per-request credentials, use cached client by credential key
        const cacheKey = `${creds.tenantId}:${creds.clientId}`;

        let client = this.clientCache.get(cacheKey);
        if (!client) {
            const credential = new ClientSecretCredential(
                creds.tenantId,
                creds.clientId,
                creds.clientSecret
            );

            const authProvider = new TokenCredentialAuthenticationProvider(credential, {
                scopes: ['https://graph.microsoft.com/.default'],
            });

            client = Client.initWithMiddleware({ authProvider });
            this.clientCache.set(cacheKey, client);
        }

        return client;
    }

    /**
     * Gets the API URI for Graph API calls.
     */
    private getApiUri(): string {
        return Auth.ApiConfig.uri;
    }

    /**
     * Sends a single email message via MS Graph.
     *
     * @requires MS Graph Scope: Mail.Send (Application)
     */
    public async SendSingleMessage(
        message: ProcessedMessage,
        credentials?: MSGraphCredentials
    ): Promise<MessageResult> {
        try {
            // Resolve credentials
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);

            // Smart selection: use message.From if provided and different from resolved accountEmail
            let senderEmail = creds.accountEmail;
            if (message.From &&
                message.From.trim() !== '' &&
                message.From !== creds.accountEmail) {
                senderEmail = message.From;
            }

            if (!message) {
                return {
                    Message: message,
                    Success: false,
                    Error: 'Message is null'
                };
            }

            const sendMail: Record<string, unknown> = {
                message: {
                    subject: message.Subject,
                    body: {
                        contentType: message.ProcessedHTMLBody ? 'HTML' : 'Text',
                        content: message.ProcessedHTMLBody || message.ProcessedBody
                    },
                    toRecipients: [
                        {
                            emailAddress: {
                                address: message.To
                            }
                        }
                    ],
                    ccRecipients: message.CCRecipients?.map((recipient) => ({
                        emailAddress: {
                            address: recipient
                        }
                    })),
                    bccRecipients: message.BCCRecipients?.map((recipient) => ({
                        emailAddress: {
                            address: recipient
                        }
                    }))
                },
                saveToSentItems: message.ContextData?.saveToSentItems ?? false
            };

            if (message.Headers) {
                // Convert Headers (Record<string, string>) to internetMessageHeaders (Array[{key:value}])
                (sendMail.message as Record<string, unknown>).internetMessageHeaders = Object.entries(message.Headers).map(([key, value]) => ({
                    name: key.startsWith('X-') ? key : `X-${key}`,
                    value: value
                }));
            }

            // Use email address directly in API path instead of looking up user ID
            const sendMessagePath: string = `${this.getApiUri()}/${encodeURIComponent(senderEmail)}/sendMail`;
            await client.api(sendMessagePath).post(sendMail);

            return {
                Message: message,
                Success: true,
                Error: ''
            };
        }
        catch (ex) {
            LogError(ex);
            return {
                Message: message,
                Success: false,
                Error: 'Error sending message'
            };
        }
    }

    /**
     * Replies to an email message via MS Graph.
     *
     * @requires MS Graph Scope: Mail.Send (Application)
     */
    public async ReplyToMessage(
        params: ReplyToMessageParams,
        credentials?: MSGraphCredentials
    ): Promise<ReplyToMessageResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);

            const reply: Record<string, unknown> = {
                message: {
                    toRecipients: [
                        {
                            emailAddress: {
                                address: params.Message.To
                            }
                        }
                    ],
                    ccRecipients: params.Message.CCRecipients?.map((recipient) => ({
                        emailAddress: {
                            address: recipient
                        }
                    })),
                    bccRecipients: params.Message.BCCRecipients?.map((recipient) => ({
                        emailAddress: {
                            address: recipient
                        }
                    }))
                },
                comment: params.Message.ProcessedBody || params.Message.ProcessedHTMLBody
            };

            // Use email address directly in API path
            const sendMessagePath: string = `${this.getApiUri()}/${encodeURIComponent(creds.accountEmail)}/messages/${params.MessageID}/reply`;
            const result = await client.api(sendMessagePath).post(reply);

            return {
                Success: true,
                Result: result
            };
        }
        catch (ex) {
            LogError(ex);
            return {
                Success: false,
                ErrorMessage: 'Error sending message'
            };
        }
    }

    /**
     * Retrieves email messages from a mailbox via MS Graph.
     *
     * @requires MS Graph Scope: Mail.Read (Application), or Mail.ReadWrite if using ContextData.MarkAsRead option
     */
    public async GetMessages(
        params: GetMessagesParams<Record<string, unknown>>,
        credentials?: MSGraphCredentials
    ): Promise<GetMessagesResult<Message>> {
        const creds = this.resolveCredentials(credentials);
        const client = this.getGraphClient(creds);

        const contextData = params.ContextData;
        const emailToUse = params.Identifier || (contextData?.Email as string) || creds.accountEmail;

        let filter: string = "";
        const top: number = params.NumMessages;

        if (params.UnreadOnly) {
            filter = "(isRead eq false)";
        }

        if (contextData && contextData.Filter) {
            filter = contextData.Filter as string;
        }

        // Use email address directly in API path
        const messagesPath: string = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages`;
        const response = await client.api(messagesPath)
            .filter(filter).top(top).get();

        if (!response) {
            return {
                Success: false,
                Messages: []
            };
        }

        const sourceMessages: Record<string, unknown>[] = response.value;

        const messageResults: GetMessagesResult = {
            Success: true,
            SourceData: sourceMessages,
            Messages: []
        };


        let headers: Record<string, string>[] | null = null;
        // GetHeaders is an async function for one specific message.  I need
        // to resolve all of them into a structure, indexed by sourceMessage.id
        // and then apply that in the mapped message below.
        if (params.IncludeHeaders) {
            const headersPromises = sourceMessages.map((message) =>
                this.GetHeadersWithEmail(client, emailToUse, params, message.id as string | undefined)
            );
            headers = await Promise.all(headersPromises);
        }

        const messages = sourceMessages.map((message: Record<string, unknown>, index: number) => {
            const msgTyped = message as Message;
            const replyTo: string[] = msgTyped.replyTo?.map((replyTo) => replyTo.emailAddress?.address || '') || [];
            const primaryToRecipient: string = replyTo.length > 0 ? replyTo[0] : '';

            // the blow hokey thing with ReturnAsPlainTex without the t is to have
            // back-compat with the old code when this typo existed

            return {
                From: msgTyped.from?.emailAddress?.address || '',
                To: primaryToRecipient,
                ReplyTo: replyTo,
                Subject: msgTyped.subject || '',
                Body: contextData?.ReturnAsPlainText || contextData?.ReturnAsPlainTex ? this.HTMLConverter(msgTyped.body?.content || '') : msgTyped.body?.content || '',
                ExternalSystemRecordID: msgTyped.id || '',
                ThreadID: msgTyped.conversationId || '',
                Headers: headers ? headers[index] : null,
                CreatedAt: msgTyped.createdDateTime ? new Date(msgTyped.createdDateTime) : undefined,
                LastModifiedAt: msgTyped.lastModifiedDateTime ? new Date(msgTyped.lastModifiedDateTime) : undefined,
                ReceivedAt: msgTyped.receivedDateTime ? new Date(msgTyped.receivedDateTime) : undefined,
                SentAt: msgTyped.sentDateTime ? new Date(msgTyped.sentDateTime) : undefined,
            };
        });

        messageResults.Messages = messages;

        if (contextData && contextData.MarkAsRead) {
            for (const message of messages) {
                this.MarkMessageAsReadWithEmail(client, emailToUse, message.ExternalSystemRecordID);
            }
        }

        return messageResults;
    }

    /**
     * Forwards an email message via MS Graph.
     *
     * @requires MS Graph Scope: Mail.Send (Application)
     */
    public async ForwardMessage(
        params: ForwardMessageParams,
        credentials?: MSGraphCredentials
    ): Promise<ForwardMessageResult> {
        try {
            if (!params.MessageID) {
                return {
                    Success: false,
                    ErrorMessage: 'Message ID not set'
                };
            }

            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);

            const forward: Record<string, unknown> = {
                comment: params.Message,
                toRecipients: params.ToRecipients.map((recipient) => ({
                    emailAddress: {
                        address: recipient
                    }
                })),
                ccRecipients: params.CCRecipients?.map((recipient) => ({
                    emailAddress: {
                        address: recipient
                    }
                })),
                bccRecipients: params.BCCRecipients?.map((recipient) => ({
                    emailAddress: {
                        address: recipient
                    }
                }))
            };

            // Use email address directly in API path
            const sendMessagePath: string = `${this.getApiUri()}/${encodeURIComponent(creds.accountEmail)}/messages/${params.MessageID}/forward`;
            const forwardResult = await client.api(sendMessagePath).post(forward);

            return {
                Success: true,
                Result: forwardResult
            };
        }
        catch (ex) {
            LogError(ex);
            return {
                ErrorMessage: 'An Error occurred while forwarding the message',
                Success: false
            };
        }
    }

    /**
     * Gets headers for a specific message using email address directly.
     * This is the preferred method for new code as it avoids an extra API call to look up the user.
     *
     * @protected
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    protected async GetHeadersWithEmail(
        client: Client,
        emailAddress: string,
        params: GetMessagesParams,
        messageID: string | undefined
    ): Promise<Record<string, string>> {
        if (params.IncludeHeaders && messageID) {
            const messageHeaderPath = `${this.getApiUri()}/${encodeURIComponent(emailAddress)}/messages/${messageID}?$select=internetMessageHeaders`;
            const messageHeaderResponse = await client.api(messageHeaderPath).get();
            return messageHeaderResponse.internetMessageHeaders?.map((header: { name: string, value: string }) => ({
                [header.name]: header.value
            })) || {};
        }
        return {};
    }

    /**
     * Marks a message as read using email address directly.
     * This is the preferred method for new code as it avoids an extra API call to look up the user.
     *
     * @protected
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    protected async MarkMessageAsReadWithEmail(client: Client, emailAddress: string, messageID: string): Promise<boolean> {
        try {
            const updatePath: string = `${this.getApiUri()}/${encodeURIComponent(emailAddress)}/messages/${messageID}`;
            const updatedMessage = {
                isRead: true
            };

            await client.api(updatePath).update(updatedMessage);
            LogStatus(`Message ${messageID} marked as read`);
            return true;
        }
        catch (ex) {
            LogError(ex);
            return false;
        }
    }

    /**
     * Gets the user account information by making an API call to MS Graph.
     * This method looks up the full User object from the Graph API.
     *
     * @protected
     * @requires MS Graph Scope: User.Read.All (Application) - Required to look up user information
     */
    protected async GetServiceAccountWithClient(client: Client, email: string): Promise<{ id?: string; userPrincipalName?: string } | null> {
        try {
            const endpoint: string = `${this.getApiUri()}/${encodeURIComponent(email)}`;
            const user = await client.api(endpoint).get();

            if (!user) {
                LogError('Error: could not get user info');
                return null;
            }

            const userID: string | undefined = user.id;
            if (!userID) {
                LogError('Error: userID not set for user');
                return null;
            }

            return user;
        } catch (ex) {
            LogError('Error getting service account', undefined, ex);
            return null;
        }
    }

    /**
     * Gets the service account using default client.
     * Caches the result for subsequent calls.
     *
     * @protected
     * @requires MS Graph Scope: User.Read.All (Application) - Required to look up user information
     */
    protected async GetServiceAccount(email?: string): Promise<{ id?: string; userPrincipalName?: string } | null> {
        const accountEmail: string = email || Config.AZURE_ACCOUNT_EMAIL;
        return this.GetServiceAccountWithClient(Auth.GraphClient, accountEmail);
    }

    /**
     * Gets headers for a message using User object (requires prior user lookup).
     * For better performance, consider using GetHeadersWithEmail() instead.
     *
     * @protected
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    protected async GetHeadersWithClient(
        client: Client,
        params: GetMessagesParams,
        user: { id?: string; userPrincipalName?: string },
        messageID: string | undefined
    ): Promise<Record<string, string>> {
        const userId = user.id || user.userPrincipalName;
        if (!userId) {
            return {};
        }

        if (params.IncludeHeaders && messageID) {
            const messageHeaderPath = `${this.getApiUri()}/${encodeURIComponent(userId)}/messages/${messageID}?$select=internetMessageHeaders`;
            const messageHeaderResponse = await client.api(messageHeaderPath).get();
            return messageHeaderResponse.internetMessageHeaders?.map((header: { name: string, value: string }) => ({
                [header.name]: header.value
            })) || {};
        }
        return {};
    }

    /**
     * Gets headers using default client.
     *
     * @protected
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    protected async GetHeaders(params: GetMessagesParams, user: { id?: string; userPrincipalName?: string }, messageID: string | undefined): Promise<Record<string, string>> {
        return this.GetHeadersWithClient(Auth.GraphClient, params, user, messageID);
    }

    /**
     * Marks a message as read using User ID.
     * For better performance, consider using MarkMessageAsReadWithEmail() instead.
     *
     * @protected
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    protected async MarkMessageAsReadWithClient(client: Client, userID: string, messageID: string): Promise<boolean> {
        try {
            const updatePath: string = `${this.getApiUri()}/${encodeURIComponent(userID)}/messages/${messageID}`;
            const updatedMessage = {
                isRead: true
            };

            await client.api(updatePath).update(updatedMessage);
            LogStatus(`Message ${messageID} marked as read`);
            return true;
        }
        catch (ex) {
            LogError(ex);
            return false;
        }
    }

    /**
     * Marks a message as read using default client.
     *
     * @protected
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    protected async MarkMessageAsRead(userID: string, messageID: string): Promise<boolean> {
        return this.MarkMessageAsReadWithClient(Auth.GraphClient, userID, messageID);
    }

    /**
     * Creates a draft email message via MS Graph.
     *
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    public async CreateDraft(
        params: CreateDraftParams,
        credentials?: MSGraphCredentials
    ): Promise<CreateDraftResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);

            // Smart selection: use message.From if provided and different from resolved accountEmail
            let senderEmail = creds.accountEmail;
            if (params.Message.From &&
                params.Message.From.trim() !== '' &&
                params.Message.From !== creds.accountEmail) {
                senderEmail = params.Message.From;
            }

            // Build message object (similar to SendSingleMessage but saved as draft)
            const draftMessage: Record<string, unknown> = {
                subject: params.Message.ProcessedSubject,
                body: {
                    contentType: params.Message.ProcessedHTMLBody ? 'HTML' : 'Text',
                    content: params.Message.ProcessedHTMLBody || params.Message.ProcessedBody
                },
                toRecipients: [{
                    emailAddress: { address: params.Message.To }
                }],
                ccRecipients: params.Message.CCRecipients?.map(recipient => ({
                    emailAddress: { address: recipient }
                })),
                bccRecipients: params.Message.BCCRecipients?.map(recipient => ({
                    emailAddress: { address: recipient }
                }))
            };

            if (params.Message.Headers) {
                // Convert Headers (Record<string, string>) to internetMessageHeaders (Array[{key:value}])
                draftMessage.internetMessageHeaders = Object.entries(params.Message.Headers)
                    .map(([key, value]) => ({
                        name: key.startsWith('X-') ? key : `X-${key}`,
                        value: value
                    }));
            }

            // Create draft by POSTing to messages endpoint (not sendMail) - use email address directly
            const createDraftPath = `${this.getApiUri()}/${encodeURIComponent(senderEmail)}/messages`;
            const result = await client.api(createDraftPath).post(draftMessage);

            LogStatus(`Draft created via MS Graph: ${result.id}`);
            return {
                Success: true,
                DraftID: result.id,
                Result: result
            };
        }
        catch (ex) {
            LogError('Error creating draft via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: 'Error creating draft'
            };
        }
    }

    // ========================================================================
    // EXTENDED OPERATIONS - MS Graph supports full mailbox access
    // ========================================================================

    /**
     * Returns the list of operations supported by MS Graph provider.
     * MS Graph supports all mailbox operations.
     */
    public override getSupportedOperations(): ProviderOperation[] {
        return [
            'SendSingleMessage',
            'GetMessages',
            'GetSingleMessage',
            'ForwardMessage',
            'ReplyToMessage',
            'CreateDraft',
            'DeleteMessage',
            'MoveMessage',
            'ListFolders',
            'MarkAsRead',
            'ArchiveMessage',
            'SearchMessages',
            'ListAttachments',
            'DownloadAttachment'
        ];
    }

    /**
     * Gets a single message by ID from MS Graph.
     *
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    public override async GetSingleMessage(
        params: GetSingleMessageParams,
        credentials?: MSGraphCredentials
    ): Promise<GetSingleMessageResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Use email address directly in API path
            const messagePath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages/${params.MessageID}`;
            const msgResponse = await client.api(messagePath).get();

            if (!msgResponse) {
                return {
                    Success: false,
                    ErrorMessage: 'Message not found'
                };
            }

            const msgTyped = msgResponse as Message;
            const replyTo = msgTyped.replyTo?.map(r => r.emailAddress?.address || '') || [];

            return {
                Success: true,
                Message: {
                    From: msgTyped.from?.emailAddress?.address || '',
                    To: replyTo.length > 0 ? replyTo[0] : '',
                    ReplyTo: replyTo,
                    Subject: msgTyped.subject || '',
                    Body: msgTyped.body?.content || '',
                    ExternalSystemRecordID: msgTyped.id || '',
                    ThreadID: msgTyped.conversationId || '',
                    CreatedAt: msgTyped.createdDateTime ? new Date(msgTyped.createdDateTime) : undefined,
                    LastModifiedAt: msgTyped.lastModifiedDateTime ? new Date(msgTyped.lastModifiedDateTime) : undefined,
                    ReceivedAt: msgTyped.receivedDateTime ? new Date(msgTyped.receivedDateTime) : undefined,
                    SentAt: msgTyped.sentDateTime ? new Date(msgTyped.sentDateTime) : undefined
                },
                SourceData: msgResponse
            };
        } catch (ex) {
            LogError('Error getting single message via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error getting message: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Deletes a message using MS Graph.
     * If PermanentDelete is false, moves to Deleted Items folder.
     *
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    public override async DeleteMessage(
        params: DeleteMessageParams,
        credentials?: MSGraphCredentials
    ): Promise<DeleteMessageResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Use email address directly in API path
            const messagePath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages/${params.MessageID}`;

            if (params.PermanentDelete) {
                // Permanently delete the message
                await client.api(messagePath).delete();
            } else {
                // Move to Deleted Items (soft delete)
                const deletedItemsFolder = await this.findSystemFolder(client, emailToUse, 'deleteditems');
                if (deletedItemsFolder) {
                    await client.api(`${messagePath}/move`).post({
                        destinationId: deletedItemsFolder
                    });
                } else {
                    // Fall back to permanent delete if we can't find Deleted Items
                    await client.api(messagePath).delete();
                }
            }

            LogStatus(`Message ${params.MessageID} deleted via MS Graph`);
            return { Success: true };
        } catch (ex) {
            LogError('Error deleting message via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error deleting message: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Moves a message to a different folder using MS Graph.
     *
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    public override async MoveMessage(
        params: MoveMessageParams,
        credentials?: MSGraphCredentials
    ): Promise<MoveMessageResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Use email address directly in API path
            const movePath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages/${params.MessageID}/move`;
            const result = await client.api(movePath).post({
                destinationId: params.DestinationFolderID
            });

            LogStatus(`Message ${params.MessageID} moved to folder ${params.DestinationFolderID}`);
            return {
                Success: true,
                NewMessageID: result?.id,
                Result: result
            };
        } catch (ex) {
            LogError('Error moving message via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error moving message: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Lists mail folders using MS Graph.
     *
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    public override async ListFolders(
        params: ListFoldersParams,
        credentials?: MSGraphCredentials
    ): Promise<ListFoldersResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Use email address directly in API path
            let foldersPath: string;
            if (params.ParentFolderID) {
                foldersPath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/mailFolders/${params.ParentFolderID}/childFolders`;
            } else {
                foldersPath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/mailFolders`;
            }

            const response = await client.api(foldersPath).get();

            if (!response?.value) {
                return {
                    Success: true,
                    Folders: []
                };
            }

            const folders: MessageFolder[] = response.value.map((folder: Record<string, unknown>) => ({
                ID: folder.id as string,
                Name: folder.displayName as string,
                ParentFolderID: folder.parentFolderId as string | undefined,
                MessageCount: params.IncludeCounts ? folder.totalItemCount as number : undefined,
                UnreadCount: params.IncludeCounts ? folder.unreadItemCount as number : undefined,
                IsSystemFolder: this.isSystemFolder(folder.displayName as string),
                SystemFolderType: this.mapSystemFolderType(folder.displayName as string)
            }));

            return {
                Success: true,
                Folders: folders,
                Result: response.value
            };
        } catch (ex) {
            LogError('Error listing folders via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error listing folders: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Marks messages as read or unread using MS Graph.
     *
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    public override async MarkAsRead(
        params: MarkAsReadParams,
        credentials?: MSGraphCredentials
    ): Promise<MarkAsReadResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Use email address directly in API path - update each message
            const updatePromises = params.MessageIDs.map(async (messageId) => {
                const updatePath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages/${messageId}`;
                return client.api(updatePath).update({ isRead: params.IsRead });
            });

            await Promise.all(updatePromises);

            LogStatus(`Marked ${params.MessageIDs.length} message(s) as ${params.IsRead ? 'read' : 'unread'}`);
            return { Success: true };
        } catch (ex) {
            LogError('Error marking messages as read via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error marking messages: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Archives a message by moving it to the Archive folder using MS Graph.
     *
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    public override async ArchiveMessage(
        params: ArchiveMessageParams,
        credentials?: MSGraphCredentials
    ): Promise<ArchiveMessageResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Find or create the Archive folder - use email address directly
            let archiveFolderId = await this.findSystemFolder(client, emailToUse, 'archive');
            if (!archiveFolderId) {
                // Try to create an Archive folder
                archiveFolderId = await this.createMailFolder(client, emailToUse, 'Archive');
            }

            if (!archiveFolderId) {
                return {
                    Success: false,
                    ErrorMessage: 'Could not find or create Archive folder'
                };
            }

            // Move the message to Archive - use email address directly in API path
            const movePath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages/${params.MessageID}/move`;
            await client.api(movePath).post({
                destinationId: archiveFolderId
            });

            LogStatus(`Message ${params.MessageID} archived`);
            return { Success: true };
        } catch (ex) {
            LogError('Error archiving message via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error archiving message: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Searches messages using MS Graph search or filter.
     *
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    public override async SearchMessages(
        params: SearchMessagesParams,
        credentials?: MSGraphCredentials
    ): Promise<SearchMessagesResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Build search path - use email address directly in API path
            let messagesPath: string;
            if (params.FolderID) {
                messagesPath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/mailFolders/${params.FolderID}/messages`;
            } else {
                messagesPath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages`;
            }

            // Build filter conditions
            const filters: string[] = [];

            // Date range filters
            if (params.FromDate) {
                filters.push(`receivedDateTime ge ${params.FromDate.toISOString()}`);
            }
            if (params.ToDate) {
                filters.push(`receivedDateTime le ${params.ToDate.toISOString()}`);
            }

            let apiRequest = client.api(messagesPath);

            // Use $search for text queries (MS Graph supports KQL)
            if (params.Query) {
                apiRequest = apiRequest.search(`"${params.Query}"`);
            }

            if (filters.length > 0) {
                apiRequest = apiRequest.filter(filters.join(' and '));
            }

            if (params.MaxResults) {
                apiRequest = apiRequest.top(params.MaxResults);
            }

            const response = await apiRequest.get();

            if (!response?.value) {
                return {
                    Success: true,
                    Messages: []
                };
            }

            const messages = response.value.map((msg: Message) => ({
                From: msg.from?.emailAddress?.address || '',
                To: msg.toRecipients?.[0]?.emailAddress?.address || '',
                Subject: msg.subject || '',
                Body: msg.bodyPreview || '',
                ExternalSystemRecordID: msg.id || '',
                ThreadID: msg.conversationId || '',
                CreatedAt: msg.createdDateTime ? new Date(msg.createdDateTime) : undefined,
                ReceivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : undefined
            }));

            return {
                Success: true,
                Messages: messages,
                TotalCount: response['@odata.count'],
                SourceData: response.value
            };
        } catch (ex) {
            LogError('Error searching messages via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error searching messages: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Lists attachments on a message using MS Graph.
     *
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    public override async ListAttachments(
        params: ListAttachmentsParams,
        credentials?: MSGraphCredentials
    ): Promise<ListAttachmentsResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Use email address directly in API path
            const attachmentsPath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages/${params.MessageID}/attachments`;
            const response = await client.api(attachmentsPath).get();

            if (!response?.value) {
                return {
                    Success: true,
                    Attachments: []
                };
            }

            const attachments: MessageAttachment[] = response.value.map((att: Record<string, unknown>) => ({
                ID: att.id as string,
                Filename: att.name as string,
                ContentType: att.contentType as string,
                Size: att.size as number,
                IsInline: att.isInline as boolean,
                ContentID: att.contentId as string | undefined
            }));

            return {
                Success: true,
                Attachments: attachments,
                Result: response.value
            };
        } catch (ex) {
            LogError('Error listing attachments via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error listing attachments: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Downloads an attachment from a message using MS Graph.
     *
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    public override async DownloadAttachment(
        params: DownloadAttachmentParams,
        credentials?: MSGraphCredentials
    ): Promise<DownloadAttachmentResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const emailToUse = (params.ContextData?.Email as string) || creds.accountEmail;

            // Use email address directly in API path
            const attachmentPath = `${this.getApiUri()}/${encodeURIComponent(emailToUse)}/messages/${params.MessageID}/attachments/${params.AttachmentID}`;
            const response = await client.api(attachmentPath).get();

            if (!response) {
                return {
                    Success: false,
                    ErrorMessage: 'Attachment not found'
                };
            }

            // MS Graph returns file attachments with contentBytes as base64
            const contentBase64 = response.contentBytes as string;

            return {
                Success: true,
                ContentBase64: contentBase64,
                Content: contentBase64 ? Buffer.from(contentBase64, 'base64') : undefined,
                Filename: response.name,
                ContentType: response.contentType,
                Result: response
            };
        } catch (ex) {
            LogError('Error downloading attachment via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error downloading attachment: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Finds a system folder by well-known name.
     *
     * @private
     * @requires MS Graph Scope: Mail.Read (Application)
     */
    private async findSystemFolder(client: Client, emailAddress: string, folderName: string): Promise<string | null> {
        try {
            // MS Graph well-known folder names
            const wellKnownNames: Record<string, string> = {
                'inbox': 'inbox',
                'sent': 'sentitems',
                'drafts': 'drafts',
                'deleteditems': 'deleteditems',
                'trash': 'deleteditems',
                'junkemail': 'junkemail',
                'spam': 'junkemail',
                'archive': 'archive'
            };

            const normalizedName = folderName.toLowerCase();
            const graphFolderName = wellKnownNames[normalizedName] || normalizedName;

            // Try well-known folder endpoint first - use email address directly
            const folderPath = `${this.getApiUri()}/${encodeURIComponent(emailAddress)}/mailFolders/${graphFolderName}`;
            const folder = await client.api(folderPath).get();
            return folder?.id || null;
        } catch {
            // Folder not found or access denied - try search
            try {
                const foldersPath = `${this.getApiUri()}/${encodeURIComponent(emailAddress)}/mailFolders`;
                const response = await client.api(foldersPath)
                    .filter(`displayName eq '${folderName}'`)
                    .get();

                if (response?.value?.length > 0) {
                    return response.value[0].id;
                }
            } catch {
                // Ignore search errors
            }
            return null;
        }
    }

    /**
     * Creates a new mail folder.
     *
     * @private
     * @requires MS Graph Scope: Mail.ReadWrite (Application)
     */
    private async createMailFolder(client: Client, emailAddress: string, folderName: string): Promise<string | null> {
        try {
            // Use email address directly in API path
            const foldersPath = `${this.getApiUri()}/${encodeURIComponent(emailAddress)}/mailFolders`;
            const result = await client.api(foldersPath).post({
                displayName: folderName
            });
            LogStatus(`Created mail folder '${folderName}' with ID: ${result.id}`);
            return result.id;
        } catch (ex) {
            LogError(`Error creating mail folder '${folderName}'`, undefined, ex);
            return null;
        }
    }

    /**
     * Checks if a folder name is a system folder.
     */
    private isSystemFolder(displayName: string): boolean {
        const systemFolders = [
            'inbox', 'sent items', 'drafts', 'deleted items', 'junk email',
            'archive', 'outbox', 'conversation history', 'scheduled'
        ];
        return systemFolders.includes(displayName.toLowerCase());
    }

    /**
     * Maps folder display name to system folder type.
     */
    private mapSystemFolderType(displayName: string): MessageFolder['SystemFolderType'] {
        const mapping: Record<string, MessageFolder['SystemFolderType']> = {
            'inbox': 'inbox',
            'sent items': 'sent',
            'drafts': 'drafts',
            'deleted items': 'trash',
            'junk email': 'spam',
            'archive': 'archive'
        };
        return mapping[displayName.toLowerCase()] || 'other';
    }
}