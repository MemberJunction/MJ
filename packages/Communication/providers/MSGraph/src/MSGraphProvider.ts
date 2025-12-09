import {
    BaseCommunicationProvider,
    CreateDraftParams,
    CreateDraftResult,
    ForwardMessageParams,
    ForwardMessageResult,
    GetMessagesParams,
    GetMessagesResult,
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
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { User, Message } from "@microsoft/microsoft-graph-types";
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

    private ServiceAccount: User | null = null;
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

            const user: User | null = await this.GetServiceAccountWithClient(client, senderEmail);
            if (!user) {
                return {
                    Message: message,
                    Success: false,
                    Error: 'Service account not found'
                };
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

            const sendMessagePath: string = `${this.getApiUri()}/${user.id}/sendMail`;
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

    public async ReplyToMessage(
        params: ReplyToMessageParams,
        credentials?: MSGraphCredentials
    ): Promise<ReplyToMessageResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);

            const user: User | null = await this.GetServiceAccountWithClient(client, creds.accountEmail);
            if (!user) {
                return {
                    Success: false,
                    ErrorMessage: 'Service account not found'
                };
            }

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

            const sendMessagePath: string = `${this.getApiUri()}/${user.id}/messages/${params.MessageID}/reply`;
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

    public async GetMessages(
        params: GetMessagesParams<Record<string, unknown>>,
        credentials?: MSGraphCredentials
    ): Promise<GetMessagesResult<Message>> {
        const creds = this.resolveCredentials(credentials);
        const client = this.getGraphClient(creds);

        const contextData = params.ContextData;
        const emailToUse = (contextData?.Email as string) || creds.accountEmail;

        const user: User | null = await this.GetServiceAccountWithClient(client, emailToUse);
        if (!user || !user.id) {
            return {
                Success: false,
                Messages: []
            };
        }

        let filter: string = "";
        const top: number = params.NumMessages;

        if (params.UnreadOnly) {
            filter = "(isRead eq false)";
        }

        if (contextData && contextData.Filter) {
            filter = contextData.Filter as string;
        }

        const messagesPath: string = `${this.getApiUri()}/${user.id}/messages`;
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
                this.GetHeadersWithClient(client, params, user, message.id as string | undefined)
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
                this.MarkMessageAsReadWithClient(client, user.id, message.ExternalSystemRecordID);
            }
        }

        return messageResults;
    }

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

            const user: User | null = await this.GetServiceAccountWithClient(client, creds.accountEmail);
            if (!user) {
                return {
                    Success: false,
                    ErrorMessage: 'Service account not found'
                };
            }

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

            const sendMessagePath: string = `${this.getApiUri()}/${user.id}/messages/${params.MessageID}/forward`;
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

    protected async GetHeadersWithClient(
        client: Client,
        params: GetMessagesParams,
        user: User,
        messageID: string | undefined
    ): Promise<Record<string, string>> {
        if (params.IncludeHeaders && messageID) {
            const messageHeaderPath = `${this.getApiUri()}/${user.id}/messages/${messageID}?$select=internetMessageHeaders`;
            const messageHeaderResponse = await client.api(messageHeaderPath).get();
            return messageHeaderResponse.internetMessageHeaders?.map((header: { name: string, value: string }) => ({
                [header.name]: header.value
            })) || {};
        }
        return {};
    }

    // Keep old method for backward compatibility (uses default client)
    protected async GetHeaders(params: GetMessagesParams, user: User, messageID: string | undefined): Promise<Record<string, string>> {
        return this.GetHeadersWithClient(Auth.GraphClient, params, user, messageID);
    }

    protected async GetServiceAccountWithClient(client: Client, email: string): Promise<User | null> {
        const endpoint: string = `${this.getApiUri()}/${email}`;
        const user: User | null = await client.api(endpoint).get();

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
    }

    // Keep old method for backward compatibility (uses default client and caching)
    protected async GetServiceAccount(email?: string): Promise<User | null> {
        if (this.ServiceAccount) {
            return this.ServiceAccount;
        }

        const accountEmail: string = email || Config.AZURE_ACCOUNT_EMAIL;
        const user = await this.GetServiceAccountWithClient(Auth.GraphClient, accountEmail);

        if (user) {
            this.ServiceAccount = user;
        }

        return user;
    }

    protected async MarkMessageAsReadWithClient(client: Client, userID: string, messageID: string): Promise<boolean> {
        try {
            const updatePath: string = `${this.getApiUri()}/${userID}/messages/${messageID}`;
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

    // Keep old method for backward compatibility
    protected async MarkMessageAsRead(userID: string, messageID: string): Promise<boolean> {
        return this.MarkMessageAsReadWithClient(Auth.GraphClient, userID, messageID);
    }

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

            const user: User | null = await this.GetServiceAccountWithClient(client, senderEmail);
            if (!user) {
                return {
                    Success: false,
                    ErrorMessage: 'Service account not found'
                };
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

            // Create draft by POSTing to messages endpoint (not sendMail)
            const createDraftPath = `${this.getApiUri()}/${user.id}/messages`;
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
}

export function LoadMSGraphProvider() {
    // do nothing, this prevents tree shaking from removing this class
}