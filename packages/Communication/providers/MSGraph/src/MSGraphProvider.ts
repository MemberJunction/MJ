import {
    AppliedMessageFilters,
    BaseCommunicationProvider,
    CombineFilterClauses,
    MessageRetrievalCapabilities,
    CreateDraftParams,
    CreateDraftResult,
    ForwardMessageParams,
    ForwardMessageResult,
    GetEventsParams,
    GetEventsResult,
    GetEventsEvent,
    GetFreeBusyParams,
    GetFreeBusyResult,
    FreeBusyScheduleSlot,
    FindMeetingTimesParams,
    FindMeetingTimesResult,
    MeetingTimeSuggestion,
    CreateCalendarEventParams,
    CreateCalendarEventResult,
    UpdateCalendarEventParams,
    UpdateCalendarEventResult,
    RespondToCalendarEventParams,
    RespondToCalendarEventResult,
    CancelCalendarEventParams,
    CancelCalendarEventResult,
    VerifyMailboxAccessParams,
    VerifyMailboxAccessResult,
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
    validateRequiredCredentials,
    CreateSubscriptionParams,
    RenewSubscriptionParams,
    DeleteSubscriptionParams,
    SubscriptionResult,
    SubscriptionCapabilities,
    SubscriptionChangeType,
    WebhookNotificationInput,
    ParseNotificationResult,
    NormalizedNotification,
    BaseMessageResult,
    CalendarEventChange,
    CalendarEventResult,
    CalendarTarget,
    CalendarTargetError,
    CalendarUpdateError,
    CancelEventParams,
    CreateEventParams,
    GetEventParams,
    SyncEventsParams,
    SyncEventsResult,
    UpdateEventParams
} from "@memberjunction/communication-types";
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { Message, Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { RegisterClass, MJLruCache } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import { compile, compiledFunction } from 'html-to-text';
import * as Auth from "./auth";
import * as Config from "./config";
import { BuildGraphEventBody, GraphDeltaPage, GraphInstant, ToCalendarChange, ToCalendarEvent } from "./calendar";

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

    /**
     * A bearer token the caller already holds: a delegated user token, or an app token from
     * another registration (the realtime bridge passes its Teams bot token). When set it is used
     * as is and tenantId/clientId/clientSecret are not needed. It is never cached here, so the
     * caller refreshes it. Graph checks its scopes per call: calendar writes need Calendars.ReadWrite.
     */
    accessToken?: string;
}

/**
 * Resolved MS Graph credentials.
 *
 * `accountEmail` is OPTIONAL, and deliberately so. The three authentication fields are what a
 * service principal is, and they are what the `Azure Service Principal` credential type declares. A
 * mailbox is not part of a principal — the same credential legitimately drives Azure OpenAI and Blob
 * Storage, where a mailbox means nothing — so requiring one here made every stored credential of
 * that type unusable, since there was no fourth field for an operator to fill in.
 *
 * It is therefore a DEFAULT, resolved per operation by {@link MSGraphProvider.resolveMailbox}, and
 * demanded only where an operation genuinely needs a mailbox and nothing else supplied one.
 */
interface ResolvedMSGraphCredentials {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    accountEmail?: string;
    /** Set only when the caller supplied a token; the three fields above are then empty and unused. */
    accessToken?: string;
}

/**
 * The maximum lifetime, in minutes, that Microsoft Graph allows for a mail-resource
 * change-notification subscription (~3 days). Requested expirations are clamped to this.
 */
/**
 * Format an instant the way an OData `$filter` comparison wants it: ISO-8601, UTC, UNQUOTED.
 *
 * Quoting it makes Graph compare a datetime against a string and reject the request, which is the
 * mistake this exists to keep out of the call sites. `toISOString` is always UTC with a trailing Z
 * regardless of the Date's origin, so a caller passing a local-time Date still filters correctly.
 */
function ODataInstant(when: Date): string {
    return when.toISOString();
}

const MSGRAPH_MAX_SUBSCRIPTION_MINUTES = 4230;

/** A guard against a misbehaving delta stream, not a real limit: a calendar view rarely spans more than a few pages. */
const MSGRAPH_MAX_DELTA_PAGES = 1000;

/** Options carried in {@link CreateSubscriptionParams.ContextData} for MS Graph. */
type MSGraphSubscriptionContext = {
    /**
     * A pre-resolved Graph folder ID to watch. Escape hatch: used verbatim with no
     * resolution call. Takes precedence over `folderName`.
     */
    folderId?: string;
    /**
     * A folder name (well-known alias or custom display name) to watch. Defaults to
     * 'inbox'. Well-known names are passed through with no extra call; custom display
     * names are resolved to an ID via a Graph lookup.
     */
    folderName?: string;
};

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
    /**
     * Graph filters both of these server-side, so neither is emulated here — `receivedDateTime`
     * comparisons and `isRead` are ordinary `$filter` clauses.
     */
    public override get MessageRetrieval(): MessageRetrievalCapabilities {
        return { FilterByReceivedDate: true, FilterByUnread: true };
    }

    private hTMLConverter: compiledFunction;

    /**
     * Cache clients keyed by tenant + clientId. Bounded LRU(100) + 1-hour TTL —
     * prior unbounded `Map` retained credential-derived Graph clients indefinitely
     * in multi-tenant deployments. See audit R2-C3.
     */
    private clientCache: MJLruCache<string, Client> = new MJLruCache<string, Client>({
        maxSize: 100,
        ttlMs: 60 * 60 * 1000,
    });

    constructor() {
        super();

        this.hTMLConverter = compile({
            wordwrap: 130
        });
    }

    /**
     * Resolves MS Graph credentials from request and environment.
     */
    private resolveCredentials(credentials?: MSGraphCredentials): ResolvedMSGraphCredentials {
        const disableFallback = credentials?.disableEnvironmentFallback ?? false;
        const accessToken = credentials?.accessToken?.trim();
        if (accessToken) {
            const accountEmail = resolveCredentialValue(credentials?.accountEmail, Config.AZURE_ACCOUNT_EMAIL, disableFallback);
            return { tenantId: '', clientId: '', clientSecret: '', accountEmail, accessToken };
        }

        const tenantId = resolveCredentialValue(credentials?.tenantId, Config.AZURE_TENANT_ID, disableFallback);
        const clientId = resolveCredentialValue(credentials?.clientId, Config.AZURE_CLIENT_ID, disableFallback);
        const clientSecret = resolveCredentialValue(credentials?.clientSecret, Config.AZURE_CLIENT_SECRET, disableFallback);
        const accountEmail = resolveCredentialValue(credentials?.accountEmail, Config.AZURE_ACCOUNT_EMAIL, disableFallback);

        // The THREE authentication fields, which is exactly what a service principal is and exactly
        // what the `Azure Service Principal` credential type declares. `accountEmail` used to be
        // required here, which made every stored credential of that type unusable: there was no
        // fourth field for an operator to fill in, so every operation failed before doing anything.
        // A mailbox is resolved per operation instead — see `resolveMailbox`.
        validateRequiredCredentials(
            { tenantId, clientId, clientSecret },
            ['tenantId', 'clientId', 'clientSecret'],
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
     * The mailbox an operation will act on, or a refusal that says how to supply one.
     *
     * WHY THIS THROWS. Every caller interpolates the result into a Graph path. Returning `undefined`
     * would put the literal string "undefined" in the URL and come back as a 404 that reads like
     * "message not found" — a wrong answer that looks like a real one. This package does not enable
     * `strictNullChecks`, so the compiler would not have caught that either.
     *
     * `credentials.accountEmail` is the LAST candidate on purpose: it is a default for the deployment,
     * and anything the caller named for this specific request outranks it.
     */
    private resolveMailbox(operation: string, creds: ResolvedMSGraphCredentials, ...preferred: (string | undefined)[]): string {
        for (const candidate of [...preferred, creds.accountEmail]) {
            if (candidate && candidate.trim() !== '') return candidate.trim();
        }
        throw new Error(
            `Microsoft Graph: ${operation} needs a mailbox and none was supplied. Pass one on the ` +
                `request, or set accountEmail on the credential (or AZURE_ACCOUNT_EMAIL) as a default.`
        );
    }

    /**
     * Gets or creates a Graph client for the given credentials.
     * Uses cached client if credentials match environment (default case).
     */
    private getGraphClient(creds: ResolvedMSGraphCredentials): Client {
        // A caller-supplied token wins, and is checked first so it can never fall into the env branch
        // below. Not cached: the token expires and the caller refreshes it, and a client is cheap.
        if (creds.accessToken) {
            const token = creds.accessToken;
            return Client.initWithMiddleware({ authProvider: { getAccessToken: async () => token } });
        }

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

        let client = this.clientCache.Get(cacheKey);
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
            this.clientCache.Set(cacheKey, client);
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
     * Flattens a Graph recipient collection (toRecipients/ccRecipients/bccRecipients)
     * into bare email addresses, dropping entries with no resolvable address.
     */
    private extractRecipientAddresses(recipients: Message['toRecipients']): string[] {
        return recipients?.map((recipient) => recipient.emailAddress?.address || '').filter((address) => address.length > 0) || [];
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
            // Whatever the caller named outranks the credential default; a request that names
            // neither is refused here rather than sending from "undefined".
            const senderEmail = this.resolveMailbox('SendSingleMessage', creds, message.From);

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

            // DRY RUN: full pipeline ran (credential resolution/validation, sender selection,
            // complete Graph sendMail payload + headers + API path construction above) — stop at
            // the transport boundary, never calling Microsoft Graph.
            if (message.DryRun) {
                LogStatus(`[DryRun] Microsoft Graph: sendMail payload constructed for ${message.To} — external send skipped`);
                return {
                    Message: message,
                    Success: true,
                    Error: '',
                    DryRun: true
                };
            }

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

            // `ContextData.Email` FIRST, as nine sibling operations already read it. Without it this
            // site could only resolve `creds.accountEmail` — which the `Azure Service Principal`
            // credential type declares no property for, and which `disableEnvironmentFallback` removes
            // the environment source for. Reply was therefore unreachable on exactly the stored
            // credential the mailbox rework exists to support.
            const mailbox = this.resolveMailbox('ReplyToMessage', creds, params.ContextData?.Email as string);
            const sendMessagePath: string = `${this.getApiUri()}/${encodeURIComponent(mailbox)}/messages/${params.MessageID}/reply`;
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
                ErrorMessage: `Error sending message: ${ex instanceof Error ? ex.message : String(ex)}`
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
        const emailToUse = this.resolveMailbox('GetMessages', creds, params.Identifier, (contextData?.Email as string));

        const top: number = params.NumMessages;
        const applied: AppliedMessageFilters = { ReceivedAfter: false, ReceivedBefore: false, UnreadOnly: false };
        const clauses: string[] = [];

        if (params.UnreadOnly) {
            clauses.push("(isRead eq false)");
            applied.UnreadOnly = true;
        }

        if (params.ReceivedAfter) {
            clauses.push(`(receivedDateTime ge ${ODataInstant(params.ReceivedAfter)})`);
            applied.ReceivedAfter = true;
        }

        if (params.ReceivedBefore) {
            clauses.push(`(receivedDateTime le ${ODataInstant(params.ReceivedBefore)})`);
            applied.ReceivedBefore = true;
        }

        // COMPOSED, not assigned. This branch used to overwrite `filter` outright, so a caller that
        // passed UnreadOnly together with a ContextData.Filter silently lost the UnreadOnly clause
        // and got read mail back. Anything the caller supplies here now narrows alongside the rest.
        if (contextData && contextData.Filter) {
            clauses.push(String(contextData.Filter));
        }

        const filter: string = CombineFilterClauses(clauses, " and ");

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
            Messages: [],
            AppliedFilters: applied
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
                ToRecipients: this.extractRecipientAddresses(msgTyped.toRecipients),
                CCRecipients: this.extractRecipientAddresses(msgTyped.ccRecipients),
                ReplyTo: replyTo,
                Subject: msgTyped.subject || '',
                Body: contextData?.ReturnAsPlainText || contextData?.ReturnAsPlainTex ? this.hTMLConverter(msgTyped.body?.content || '') : msgTyped.body?.content || '',
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
            const mailbox = this.resolveMailbox('ForwardMessage', creds);
            const sendMessagePath: string = `${this.getApiUri()}/${encodeURIComponent(mailbox)}/messages/${params.MessageID}/forward`;
            const forwardResult = await client.api(sendMessagePath).post(forward);

            return {
                Success: true,
                Result: forwardResult
            };
        }
        catch (ex) {
            LogError(ex);
            return {
                ErrorMessage: `An Error occurred while forwarding the message: ${ex instanceof Error ? ex.message : String(ex)}`,
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
            // Whatever the caller named outranks the credential default; a request that names
            // neither is refused here rather than sending from "undefined".
            const senderEmail = this.resolveMailbox('CreateDraft', creds, params.Message.From);

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
                ErrorMessage: `Error creating draft: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    // ========================================================================
    // EXTENDED OPERATIONS - MS Graph supports full mailbox access
    // ========================================================================

    /**
     * Reads calendar events for one mailbox.
     *
     * @requires MS Graph Scope: Calendars.Read (Application)
     *
     * TWO ENDPOINTS, AND THE CHOICE IS VISIBLE TO THE CALLER. Graph exposes calendar data two ways
     * and they do not return the same thing:
     *
     *   - `/calendarView` REQUIRES a start and end and EXPANDS recurring series into one entry per
     *     occurrence. A weekly stand-up in a two-week window comes back as two events, each with its
     *     own start time and id.
     *   - `/events` needs no window and does NOT expand. That same stand-up is one row, the series
     *     master, whose start time is whenever the series began - possibly years ago.
     *
     * A caller logging what actually happened wants occurrences; one asking "what meetings exist"
     * may want masters. Silently picking would be a trap, because the two are indistinguishable by
     * inspection - so the window decides, and `RecurrenceExpanded` on the result REPORTS which
     * happened rather than leaving the caller to infer it.
     *
     * CANCELLED EVENTS ARE EXCLUDED BY DEFAULT and cannot be recovered afterwards - Graph does not
     * return them once filtered - so `IncludeCancelled` is honoured before the `$top` cap rather
     * than by discarding rows after the fetch, which would silently shrink the page.
     */
    public async GetEvents(
        params: GetEventsParams,
        credentials?: MSGraphCredentials
    ): Promise<GetEventsResult> {
        const creds = this.resolveCredentials(credentials);
        const client = this.getGraphClient(creds);

        const contextData = params.ContextData;
        const mailbox = params.Identifier || (contextData?.Email as string) || creds.accountEmail;
        if (!mailbox) {
            return {
                Success: false,
                Events: [],
                ErrorMessage: 'GetEvents needs an Identifier (mailbox) or credentials scoped to one.'
            };
        }

        const expand = !!params.StartDateTime && !!params.EndDateTime;
        const base = `${this.getApiUri()}/${encodeURIComponent(mailbox)}`;

        try {
            let request = expand
                ? client
                      .api(`${base}/calendarView`)
                      .query({
                          startDateTime: params.StartDateTime!.toISOString(),
                          endDateTime: params.EndDateTime!.toISOString()
                      })
                      .orderby('start/dateTime')
                : client.api(`${base}/events`).orderby('lastModifiedDateTime desc');

            // Ask for UTC explicitly rather than relying on it. Graph returns start/end in UTC when no
            // `Prefer: outlook.timezone` is sent, so this changes nothing today — but the default is
            // Microsoft's to change, and every other value would need a tz database to resolve. Saying
            // it makes the mapper's UTC assumption a request rather than a bet. `GraphInstant` keeps
            // its null fallback for the case where a non-UTC zone comes back anyway.
            request = request.header('Prefer', 'outlook.timezone="UTC"');

            // Applied server-side so the $top cap counts only events the caller asked for. Filtering
            // after the fetch would return fewer than NumEvents and look like an empty calendar.
            //
            // $filter AND $orderby TOGETHER ARE ACCEPTED HERE. Outlook's backend requires every
            // $orderby property to also appear in $filter for MESSAGES, returning 400
            // `InefficientFilter` otherwise, and Microsoft's announcement of that rule is titled for
            // Mail, Calendar and Contacts — so this combination looks like it should fail. It does
            // not: both shapes below were sent against a live tenant and returned 200. Recorded here
            // because the unit tests mock the Graph client and can never catch a 400, so the next
            // reader has no way to re-derive it short of running the query again.
            if (!params.IncludeCancelled) {
                request = request.filter('isCancelled eq false');
            }

            const response = await request.top(params.NumEvents).get();
            if (!response) {
                return { Success: false, Events: [], ErrorMessage: 'Graph returned no response for the calendar read.' };
            }

            const sourceEvents: Record<string, unknown>[] = response.value ?? [];
            return {
                Success: true,
                SourceData: sourceEvents,
                RecurrenceExpanded: expand,
                Events: sourceEvents.map((e) => this.toGetEventsEvent(e))
            };
        } catch (err) {
            // Surfaced, not swallowed into an empty list: a caller advancing a watermark must be able
            // to tell "could not read" from "nothing scheduled".
            return {
                Success: false,
                Events: [],
                ErrorMessage: `Graph calendar read failed for ${mailbox}: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    /**
     * Graph event -> the normalized shape. Lossy by design; `SourceData` keeps the original.
     *
     * A start Graph cannot express as an instant becomes NULL rather than a guess. Graph returns
     * naive local strings plus a separate timeZone, so a value with neither a zone suffix nor a UTC
     * marker genuinely has no instant here, and inventing one would file a meeting at the wrong time.
     */
    private toGetEventsEvent(raw: Record<string, unknown>): GetEventsEvent {
        const event = raw as {
            id?: string;
            seriesMasterId?: string;
            subject?: string;
            bodyPreview?: string;
            start?: { dateTime?: string; timeZone?: string };
            end?: { dateTime?: string; timeZone?: string };
            location?: { displayName?: string };
            organizer?: { emailAddress?: { address?: string } };
            attendees?: { emailAddress?: { address?: string } }[];
            isCancelled?: boolean;
        };

        const organizer = event.organizer?.emailAddress?.address?.trim().toLowerCase() || undefined;
        const attendees = (event.attendees ?? [])
            .map((a) => a.emailAddress?.address?.trim().toLowerCase())
            .filter((a): a is string => !!a && a !== organizer);

        return {
            ExternalSystemRecordID: event.id ?? '',
            SeriesID: event.seriesMasterId ?? null,
            Subject: event.subject ?? '',
            Body: event.bodyPreview ?? '',
            StartTime: GraphInstant(event.start),
            EndTime: GraphInstant(event.end),
            Location: event.location?.displayName ?? null,
            Organizer: organizer,
            Attendees: [...new Set(attendees)],
            IsCancelled: event.isCancelled === true
        };
    }

    /**
     * Queries free/busy schedule intervals for one or more users via Microsoft Graph
     * `POST /users/{id}/calendar/getSchedule`.
     *
     * @requires MS Graph Scope: Calendars.Read (Application or Delegated)
     */
    public override async GetFreeBusy(
        params: GetFreeBusyParams,
        credentials?: MSGraphCredentials
    ): Promise<GetFreeBusyResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const mailbox = this.resolveMailbox(
                'GetFreeBusy',
                creds,
                params.Identifier,
                params.ContextData?.Email as string | undefined,
                params.Schedules[0]
            );

            if (!params.Schedules || params.Schedules.length === 0) {
                return {
                    Success: false,
                    Schedules: [],
                    ErrorMessage: 'GetFreeBusy requires at least one email address in Schedules.'
                };
            }

            const path = `${this.getApiUri()}/${encodeURIComponent(mailbox)}/calendar/getSchedule`;
            const body = {
                schedules: params.Schedules,
                startTime: {
                    dateTime: params.StartDateTime.toISOString(),
                    timeZone: 'UTC'
                },
                endTime: {
                    dateTime: params.EndDateTime.toISOString(),
                    timeZone: 'UTC'
                },
                availabilityViewInterval: params.AvailabilityViewIntervalMinutes ?? 30
            };

            const response = await client
                .api(path)
                .header('Prefer', 'outlook.timezone="UTC"')
                .post(body);

            const rawSchedules: Array<Record<string, unknown>> = response?.value ?? [];
            const schedules: GetFreeBusyResult['Schedules'] = rawSchedules.map((raw) => {
                const scheduleId = String(raw.scheduleId ?? '');
                const errorObj = raw.error as { message?: string } | undefined;
                const rawItems = (raw.scheduleItems as Array<Record<string, unknown>> | undefined) ?? [];
                const slots: FreeBusyScheduleSlot[] = [];

                for (const item of rawItems) {
                    const start = GraphInstant(
                        item.start as { dateTime?: string; timeZone?: string } | undefined
                    );
                    const end = GraphInstant(
                        item.end as { dateTime?: string; timeZone?: string } | undefined
                    );
                    if (!start || !end) continue;

                    slots.push({
                        StartTime: start,
                        EndTime: end,
                        Status: this.mapGraphFreeBusyStatus(String(item.status ?? 'busy')),
                        Subject: typeof item.subject === 'string' ? item.subject : undefined
                    });
                }

                return {
                    ScheduleID: scheduleId,
                    AvailabilityView: typeof raw.availabilityView === 'string' ? raw.availabilityView : undefined,
                    Slots: slots,
                    Error: errorObj?.message
                };
            });

            return {
                Success: true,
                Schedules: schedules,
                SourceData: rawSchedules
            };
        } catch (ex) {
            LogError('Error getting free/busy schedule via MS Graph', undefined, ex);
            return {
                Success: false,
                Schedules: [],
                ErrorMessage: `Error getting free/busy schedule: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    private mapGraphFreeBusyStatus(status: string): FreeBusyScheduleSlot['Status'] {
        const normalized = status.trim().toLowerCase();
        if (normalized === 'free') return 'Free';
        if (normalized === 'tentative') return 'Tentative';
        if (normalized === 'oof') return 'OutOfOffice';
        if (normalized === 'workingelsewhere') return 'WorkingElsewhere';
        if (normalized === 'busy') return 'Busy';
        return 'Unknown';
    }

    /**
     * Finds candidate meeting times across attendees via Microsoft Graph
     * `POST /users/{id}/findMeetingTimes`.
     *
     * @requires MS Graph Scope: Calendars.Read.Shared (Delegated) or Calendars.Read (Application where supported)
     */
    public override async FindMeetingTimes(
        params: FindMeetingTimesParams,
        credentials?: MSGraphCredentials
    ): Promise<FindMeetingTimesResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const mailbox = this.resolveMailbox(
                'FindMeetingTimes',
                creds,
                params.Identifier,
                params.ContextData?.Email as string | undefined
            );

            const path = `${this.getApiUri()}/${encodeURIComponent(mailbox)}/findMeetingTimes`;
            const body: Record<string, unknown> = {
                attendees: params.Attendees.map((a) => ({
                    type: a.Required === false ? 'optional' : 'required',
                    emailAddress: { address: a.Email }
                })),
                timeConstraint: {
                    activityDomain: 'work',
                    timeSlots: [
                        {
                            start: {
                                dateTime: params.StartDateTime.toISOString(),
                                timeZone: 'UTC'
                            },
                            end: {
                                dateTime: params.EndDateTime.toISOString(),
                                timeZone: 'UTC'
                            }
                        }
                    ]
                },
                meetingDuration: `PT${Math.max(5, Math.round(params.DurationMinutes))}M`,
                maxCandidates: params.MaxCandidates ?? 5,
                minimumAttendeePercentage: params.MinimumAttendeePercentage ?? 100
            };

            const response = await client
                .api(path)
                .header('Prefer', 'outlook.timezone="UTC"')
                .post(body);

            const rawSuggestions: Array<Record<string, unknown>> = response?.meetingTimeSuggestions ?? [];
            const suggestions: MeetingTimeSuggestion[] = [];

            for (const raw of rawSuggestions) {
                const slot = raw.meetingTimeSlot as {
                    start?: { dateTime?: string; timeZone?: string };
                    end?: { dateTime?: string; timeZone?: string };
                } | undefined;
                const start = GraphInstant(slot?.start);
                const end = GraphInstant(slot?.end);
                if (!start || !end) continue;

                const rawAvailability = (raw.attendeeAvailability as Array<Record<string, unknown>> | undefined) ?? [];
                suggestions.push({
                    StartTime: start,
                    EndTime: end,
                    Confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
                    OrganizerAvailability: typeof raw.organizerAvailability === 'string' ? raw.organizerAvailability : undefined,
                    SuggestionReason: typeof raw.suggestionReason === 'string' ? raw.suggestionReason : undefined,
                    AttendeeAvailability: rawAvailability.map((a) => {
                        const att = a.attendee as { emailAddress?: { address?: string } } | undefined;
                        return {
                            Email: att?.emailAddress?.address ?? '',
                            Availability: this.mapGraphFreeBusyStatus(String(a.availability ?? 'unknown'))
                        };
                    })
                });
            }

            return {
                Success: true,
                Suggestions: suggestions,
                EmptySuggestionsReason: typeof response?.emptySuggestionsReason === 'string'
                    ? response.emptySuggestionsReason
                    : undefined,
                SourceData: response as Record<string, unknown>
            };
        } catch (ex) {
            LogError('Error finding meeting times via MS Graph', undefined, ex);
            return {
                Success: false,
                Suggestions: [],
                ErrorMessage: `Error finding meeting times: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Creates a calendar event (and optionally sends invitations / creates an online meeting)
     * via Microsoft Graph `POST /users/{id}/events`.
     *
     * @requires MS Graph Scope: Calendars.ReadWrite (Application)
     */
    public override async CreateCalendarEvent(
        params: CreateCalendarEventParams,
        credentials?: MSGraphCredentials
    ): Promise<CreateCalendarEventResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const mailbox = this.resolveMailbox(
                'CreateCalendarEvent',
                creds,
                params.Identifier,
                params.ContextData?.Email as string | undefined
            );

            const body: Record<string, unknown> = {
                subject: params.Subject,
                start: {
                    dateTime: params.StartTime.toISOString(),
                    timeZone: params.TimeZone ?? 'UTC'
                },
                end: {
                    dateTime: params.EndTime.toISOString(),
                    timeZone: params.TimeZone ?? 'UTC'
                }
            };

            if (params.Body !== undefined) {
                body.body = {
                    contentType: params.IsHTML ? 'HTML' : 'Text',
                    content: params.Body
                };
            }
            if (params.Location) {
                body.location = { displayName: params.Location };
            }
            if (params.Attendees && params.Attendees.length > 0) {
                body.attendees = params.Attendees.map((a) => ({
                    type: a.Required === false ? 'optional' : 'required',
                    emailAddress: {
                        address: a.Email,
                        name: a.Name
                    }
                }));
            }
            if (params.IsOnlineMeeting) {
                body.isOnlineMeeting = true;
                body.onlineMeetingProvider = 'teamsForBusiness';
            }

            if (params.DryRun) {
                LogStatus(`[DryRun] Microsoft Graph: CreateCalendarEvent '${params.Subject}' for ${mailbox} — external call skipped`);
                return {
                    Success: true,
                    DryRun: true,
                    Event: {
                        ExternalSystemRecordID: 'DRY_RUN_EVENT_ID',
                        SeriesID: null,
                        Subject: params.Subject,
                        Body: params.Body ?? '',
                        StartTime: params.StartTime,
                        EndTime: params.EndTime,
                        Location: params.Location ?? null,
                        Organizer: mailbox.toLowerCase(),
                        Attendees: (params.Attendees ?? []).map((a) => a.Email.toLowerCase()),
                        IsCancelled: false
                    },
                    SourceData: body
                };
            }

            const path = `${this.getApiUri()}/${encodeURIComponent(mailbox)}/events`;
            const response = await client
                .api(path)
                .header('Prefer', 'outlook.timezone="UTC"')
                .post(body);

            return {
                Success: true,
                Event: response ? this.toGetEventsEvent(response as Record<string, unknown>) : undefined,
                OnlineMeetingUrl: response?.onlineMeeting?.joinUrl ?? response?.onlineMeetingUrl ?? null,
                SourceData: response as Record<string, unknown>
            };
        } catch (ex) {
            LogError('Error creating calendar event via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error creating calendar event: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Updates an existing calendar event via Microsoft Graph `PATCH /users/{id}/events/{eventId}`.
     *
     * @requires MS Graph Scope: Calendars.ReadWrite (Application)
     */
    public override async UpdateCalendarEvent(
        params: UpdateCalendarEventParams,
        credentials?: MSGraphCredentials
    ): Promise<UpdateCalendarEventResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const mailbox = this.resolveMailbox(
                'UpdateCalendarEvent',
                creds,
                params.Identifier,
                params.ContextData?.Email as string | undefined
            );

            const body: Record<string, unknown> = {};
            if (params.Subject !== undefined) {
                body.subject = params.Subject;
            }
            if (params.Body !== undefined) {
                body.body = {
                    contentType: params.IsHTML ? 'HTML' : 'Text',
                    content: params.Body
                };
            }
            if (params.StartTime) {
                body.start = {
                    dateTime: params.StartTime.toISOString(),
                    timeZone: params.TimeZone ?? 'UTC'
                };
            }
            if (params.EndTime) {
                body.end = {
                    dateTime: params.EndTime.toISOString(),
                    timeZone: params.TimeZone ?? 'UTC'
                };
            }
            if (params.Location !== undefined) {
                body.location = { displayName: params.Location };
            }
            if (params.Attendees) {
                body.attendees = params.Attendees.map((a) => ({
                    type: a.Required === false ? 'optional' : 'required',
                    emailAddress: {
                        address: a.Email,
                        name: a.Name
                    }
                }));
            }

            if (params.DryRun) {
                LogStatus(`[DryRun] Microsoft Graph: UpdateCalendarEvent '${params.EventID}' for ${mailbox} — external call skipped`);
                return {
                    Success: true,
                    DryRun: true,
                    SourceData: body
                };
            }

            const path = `${this.getApiUri()}/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(params.EventID)}`;
            const response = await client
                .api(path)
                .header('Prefer', 'outlook.timezone="UTC"')
                .patch(body);

            return {
                Success: true,
                Event: response ? this.toGetEventsEvent(response as Record<string, unknown>) : undefined,
                SourceData: response as Record<string, unknown>
            };
        } catch (ex) {
            LogError('Error updating calendar event via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error updating calendar event: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Responds to a calendar event invitation (`accept`, `tentativelyAccept`, or `decline`)
     * via Microsoft Graph `POST /users/{id}/events/{eventId}/{accept|tentativelyAccept|decline}`.
     *
     * @requires MS Graph Scope: Calendars.ReadWrite (Application)
     */
    public override async RespondToCalendarEvent(
        params: RespondToCalendarEventParams,
        credentials?: MSGraphCredentials
    ): Promise<RespondToCalendarEventResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const mailbox = this.resolveMailbox(
                'RespondToCalendarEvent',
                creds,
                params.Identifier,
                params.ContextData?.Email as string | undefined
            );

            const actionSegment =
                params.Response === 'Accept'
                    ? 'accept'
                    : params.Response === 'TentativelyAccept'
                    ? 'tentativelyAccept'
                    : 'decline';

            const body = {
                comment: params.Comment ?? '',
                sendResponse: params.SendResponse ?? true
            };

            if (params.DryRun) {
                LogStatus(`[DryRun] Microsoft Graph: RespondToCalendarEvent (${actionSegment}) '${params.EventID}' for ${mailbox} — external call skipped`);
                return { Success: true, DryRun: true };
            }

            const path = `${this.getApiUri()}/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(params.EventID)}/${actionSegment}`;
            await client.api(path).post(body);
            return { Success: true };
        } catch (ex) {
            LogError('Error responding to calendar event via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error responding to calendar event: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Cancels a calendar event organized by the mailbox owner via Microsoft Graph
     * `POST /users/{id}/events/{eventId}/cancel`.
     *
     * @requires MS Graph Scope: Calendars.ReadWrite (Application)
     */
    public override async CancelCalendarEvent(
        params: CancelCalendarEventParams,
        credentials?: MSGraphCredentials
    ): Promise<CancelCalendarEventResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const mailbox = this.resolveMailbox(
                'CancelCalendarEvent',
                creds,
                params.Identifier,
                params.ContextData?.Email as string | undefined
            );

            const body = {
                comment: params.Comment ?? ''
            };

            if (params.DryRun) {
                LogStatus(`[DryRun] Microsoft Graph: CancelCalendarEvent '${params.EventID}' for ${mailbox} — external call skipped`);
                return { Success: true, DryRun: true };
            }

            const path = `${this.getApiUri()}/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(params.EventID)}/cancel`;
            await client.api(path).post(body);
            return { Success: true };
        } catch (ex) {
            LogError('Error cancelling calendar event via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error cancelling calendar event: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Performs a lightweight preflight check to verify whether the active Microsoft Graph
     * enterprise credential is authorized to read mail and/or calendar for the specified mailbox.
     * Used by enterprise security gates to detect Exchange Application Access Policy restrictions
     * (`ErrorAccessDenied` / 403) before offering personal mailbox or calendar operations.
     */
    public override async VerifyMailboxAccess(
        params: VerifyMailboxAccessParams,
        credentials?: MSGraphCredentials
    ): Promise<VerifyMailboxAccessResult> {
        const identifier = params.Identifier?.trim();
        if (!identifier) {
            return {
                Success: false,
                Identifier: '',
                CanReadMail: false,
                CanReadCalendar: false,
                ErrorMessage: 'VerifyMailboxAccess requires a non-empty Identifier (mailbox email).'
            };
        }

        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const checkMail = params.CheckMailRead ?? true;
            const checkCalendar = params.CheckCalendarRead ?? true;

            let canReadMail = false;
            let canReadCalendar = false;
            let mailErrorMessage: string | undefined;
            let calendarErrorMessage: string | undefined;

            if (checkMail) {
                try {
                    const mailPath = `${this.getApiUri()}/${encodeURIComponent(identifier)}/mailFolders/inbox`;
                    await client.api(mailPath).select('id').get();
                    canReadMail = true;
                } catch (mailEx) {
                    mailErrorMessage = mailEx instanceof Error ? mailEx.message : String(mailEx);
                }
            }

            if (checkCalendar) {
                try {
                    const calPath = `${this.getApiUri()}/${encodeURIComponent(identifier)}/calendar`;
                    await client.api(calPath).select('id').get();
                    canReadCalendar = true;
                } catch (calEx) {
                    calendarErrorMessage = calEx instanceof Error ? calEx.message : String(calEx);
                }
            }

            const overallSuccess =
                (!checkMail || canReadMail) &&
                (!checkCalendar || canReadCalendar);

            return {
                Success: overallSuccess,
                Identifier: identifier,
                CanReadMail: canReadMail,
                CanReadCalendar: canReadCalendar,
                MailErrorMessage: mailErrorMessage,
                CalendarErrorMessage: calendarErrorMessage,
                ErrorMessage: overallSuccess
                    ? undefined
                    : [mailErrorMessage, calendarErrorMessage].filter(Boolean).join('; ')
            };
        } catch (ex) {
            const msg = ex instanceof Error ? ex.message : String(ex);
            return {
                Success: false,
                Identifier: identifier,
                CanReadMail: false,
                CanReadCalendar: false,
                ErrorMessage: `Error verifying mailbox access for ${identifier}: ${msg}`
            };
        }
    }

    /**
     * Returns the list of operations supported by MS Graph provider.
     * MS Graph supports all mailbox and calendar operations.
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
            'DownloadAttachment',
            'CreateSubscription',
            'RenewSubscription',
            'DeleteSubscription',
            'ParseNotification',
            'GetEvents',
            'CreateEvent',
            'UpdateEvent',
            'CancelEvent',
            'GetEvent',
            'SyncEvents',
            'GetFreeBusy',
            'FindMeetingTimes',
            'CreateCalendarEvent',
            'UpdateCalendarEvent',
            'RespondToCalendarEvent',
            'CancelCalendarEvent',
            'VerifyMailboxAccess'
        ];
    }

    // ========================================================================
    // CALENDAR EVENTS
    // Every call names its mailbox through params.Target; there is no fallback to accountEmail or
    // AZURE_ACCOUNT_EMAIL here, so a meeting never lands in the deployment's service mailbox by
    // accident. Times are requested in UTC (`Prefer: outlook.timezone`), which GraphInstant relies on.
    //
    // Permissions: with the app's own client secret, Graph needs the APPLICATION permission
    // Calendars.ReadWrite (admin-consented; an application access policy can narrow it to some
    // mailboxes). With a caller-supplied accessToken, the token's own scopes apply: Calendars.ReadWrite
    // delegated for a user's token, Calendars.Read for a token that only syncs.
    // ========================================================================

    /**
     * Creates an event. With attendees, Graph sends the invitations from the target mailbox, which
     * becomes the organizer. `IsOnlineMeeting` attaches a Teams meeting.
     */
    public override async CreateEvent(params: CreateEventParams, credentials?: MSGraphCredentials): Promise<CalendarEventResult> {
        return this.calendarCall<CalendarEventResult>('CreateEvent', params.Target, credentials, (message) => ({ Success: false, ErrorMessage: message }), async (client, mailbox) => {
            const calendar = params.Target.CalendarID?.trim();
            const path = calendar ? `${mailbox}/calendars/${encodeURIComponent(calendar)}/events` : `${mailbox}/events`;
            const created: GraphEvent = await client.api(path).header('Prefer', 'outlook.timezone="UTC"').post(BuildGraphEventBody(params.Event));
            return { Success: true, Event: ToCalendarEvent(created) };
        });
    }

    /** Patches the given fields. Graph sends updates to attendees when the organizer changes a meeting. */
    public override async UpdateEvent(params: UpdateEventParams, credentials?: MSGraphCredentials): Promise<CalendarEventResult> {
        const changeError = CalendarUpdateError(params.Changes);
        if (changeError) return { Success: false, ErrorMessage: changeError };
        return this.calendarCall<CalendarEventResult>('UpdateEvent', params.Target, credentials, (message) => ({ Success: false, ErrorMessage: message }), async (client, mailbox) => {
            const path = `${mailbox}/events/${encodeURIComponent(params.ExternalEventID)}`;
            const updated: GraphEvent = await client.api(path).header('Prefer', 'outlook.timezone="UTC"').patch(BuildGraphEventBody(params.Changes));
            return { Success: true, Event: ToCalendarEvent(updated) };
        });
    }

    /**
     * Cancels an event.
     *
     * THE ORGANIZER CANCELS, ANYONE ELSE DELETES. Graph's `cancel` sends attendees a cancellation
     * (with the comment) but refuses a non-organizer with a 400. So the event's `isOrganizer` is read
     * first: the organizer's mailbox cancels, an attendee's mailbox deletes its own copy, which removes
     * it from that calendar only and tells nobody. An event that is already gone (404) counts as
     * cancelled, so a retry after a lost reply does not fail. A 404 for the MAILBOX does not: Graph
     * answers an unknown or mailbox-less user with 404 too, and that cancelled nothing.
     */
    public override async CancelEvent(params: CancelEventParams, credentials?: MSGraphCredentials): Promise<BaseMessageResult> {
        const failure = (message: string, err?: unknown): BaseMessageResult =>
            this.getGraphStatusCode(err) === 404 && !this.isMailboxNotFound(err) ? { Success: true } : { Success: false, ErrorMessage: message };
        return this.calendarCall('CancelEvent', params.Target, credentials, failure, async (client, mailbox) => {
            const path = `${mailbox}/events/${encodeURIComponent(params.ExternalEventID)}`;
            const current: GraphEvent = await client.api(path).select('isOrganizer').get();
            if (current?.isOrganizer === false) {
                await client.api(path).delete();
            } else {
                await client.api(`${path}/cancel`).post({ Comment: params.Comment ?? '' });
            }
            return { Success: true };
        });
    }

    /** Reads one event with each attendee's response. */
    public override async GetEvent(params: GetEventParams, credentials?: MSGraphCredentials): Promise<CalendarEventResult> {
        return this.calendarCall<CalendarEventResult>('GetEvent', params.Target, credentials, (message) => ({ Success: false, ErrorMessage: message }), async (client, mailbox) => {
            const path = `${mailbox}/events/${encodeURIComponent(params.ExternalEventID)}`;
            const event: GraphEvent = await client.api(path).header('Prefer', 'outlook.timezone="UTC"').get();
            return { Success: true, Event: ToCalendarEvent(event) };
        });
    }

    /**
     * Reads changes through `calendarView/delta`.
     *
     * A full sync needs the window (Graph's delta over a calendar view is always bounded); the delta
     * link Graph returns at the end carries that window, so later syncs need only the token. Pages are
     * followed through `@odata.nextLink` until the `@odata.deltaLink`, which is the next token. Graph
     * answers an expired or unknown token with 410 Gone: that comes back as `ResyncRequired`.
     */
    public override async SyncEvents(params: SyncEventsParams, credentials?: MSGraphCredentials): Promise<SyncEventsResult> {
        const failure = (message: string, err?: unknown): SyncEventsResult => ({
            Success: false,
            Changes: [],
            ErrorMessage: message,
            ResyncRequired: !!params.SyncToken && this.isResyncError(err)
        });
        return this.calendarCall('SyncEvents', params.Target, credentials, failure, async (client, mailbox) => {
            const result: SyncEventsResult = { Success: true, Changes: [] };
            let url: string | undefined = params.SyncToken || this.firstDeltaUrl(mailbox, params);
            for (let page = 0; url && page < MSGRAPH_MAX_DELTA_PAGES; page++) {
                const response: GraphDeltaPage = await client.api(url).header('Prefer', 'outlook.timezone="UTC"').get();
                result.Changes.push(...(response?.value ?? []).map(ToCalendarChange));
                result.NextSyncToken = response?.['@odata.deltaLink'];
                url = result.NextSyncToken ? undefined : response?.['@odata.nextLink'];
            }
            if (!result.NextSyncToken) return failure('Graph delta read ended without a deltaLink; nothing was applied.');
            for (let i = 0; i < result.Changes.length; i++) {
                if (result.Changes[i].Kind === 'Removed') result.Changes[i] = await this.confirmRemoval(client, mailbox, result.Changes[i]);
            }
            return result;
        });
    }

    /**
     * Graph lists under `@removed` both an event that was deleted and one added, moved or changed
     * OUTSIDE the delta's window (see Graph's event: delta). A caller that took every tombstone as a
     * deletion would cancel a meeting that was only rescheduled past the window. So each one is read:
     * a 404 is a real removal, anything found comes back as an upsert of the event as it is now.
     *
     * ponytail: one GET per tombstone; batch them (Graph $batch, 20 per call) if a calendar's syncs
     * ever carry many.
     */
    private async confirmRemoval(client: Client, mailbox: string, change: CalendarEventChange): Promise<CalendarEventChange> {
        try {
            const path = `${mailbox}/events/${encodeURIComponent(change.ExternalEventID)}`;
            const event: GraphEvent = await client.api(path).header('Prefer', 'outlook.timezone="UTC"').get();
            return { Kind: 'Upserted', ExternalEventID: change.ExternalEventID, Event: ToCalendarEvent(event) };
        } catch (err) {
            if (this.getGraphStatusCode(err) === 404) return change;
            throw err;
        }
    }

    /** The first page of a full delta read. Throws when there is no window, which the caller reports. */
    private firstDeltaUrl(mailbox: string, params: SyncEventsParams): string {
        if (!params.WindowStart || !params.WindowEnd) {
            throw new Error('a full sync (no SyncToken) needs WindowStart and WindowEnd: Graph only syncs a bounded calendar view');
        }
        const calendar = params.Target.CalendarID?.trim();
        const view = calendar ? `${mailbox}/calendars/${encodeURIComponent(calendar)}/calendarView/delta` : `${mailbox}/calendarView/delta`;
        const start = encodeURIComponent(params.WindowStart.toISOString());
        const end = encodeURIComponent(params.WindowEnd.toISOString());
        return `${view}?startDateTime=${start}&endDateTime=${end}`;
    }

    /** True when a Graph 404 is about the mailbox (no such user, or no Exchange mailbox), not the item. */
    private isMailboxNotFound(err: unknown): boolean {
        const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
        return code === 'ErrorInvalidUser' || code === 'MailboxNotEnabledForRESTAPI';
    }

    /** True when Graph refused a delta token as expired or unknown, so the caller must start over. */
    private isResyncError(err: unknown): boolean {
        if (this.getGraphStatusCode(err) === 410) return true;
        const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
        return /syncState|resyncRequired/i.test(code);
    }

    /**
     * The shared shape of every calendar call: refuse a missing target before any I/O, build the
     * client and the mailbox path from the target alone, and turn a thrown error into a result.
     */
    private async calendarCall<T extends BaseMessageResult>(
        operation: string,
        target: CalendarTarget | undefined,
        credentials: MSGraphCredentials | undefined,
        failure: (message: string, err?: unknown) => T,
        work: (client: Client, mailboxPath: string) => Promise<T>
    ): Promise<T> {
        const refusal = CalendarTargetError(operation, target);
        if (refusal || !target) return failure(refusal ?? `${operation} needs a Target.`);
        const identifier = target.Identifier.trim();
        try {
            const client = this.getGraphClient(this.resolveCredentials(credentials));
            return await work(client, `${this.getApiUri()}/${encodeURIComponent(identifier)}`);
        } catch (err) {
            return failure(`Microsoft Graph ${operation} failed for ${identifier}: ${err instanceof Error ? err.message : String(err)}`, err);
        }
    }

    // ========================================================================
    // PUSH-NOTIFICATION SUBSCRIPTIONS
    // Graph change-notification subscriptions. CRUD rides the existing authenticated
    // client; ParseNotification is pure (no client, no network). The provider is
    // stateless - the consumer persists subscription IDs/expirations/secrets.
    // ========================================================================

    /**
     * Builds the base URL for Graph subscription resources. Subscriptions live at the
     * Graph service root (`/v1.0/subscriptions`), NOT under the users-rooted
     * {@link getApiUri}. Built from `AZURE_GRAPH_ENDPOINT` so sovereign-cloud overrides
     * are honored.
     */
    private getSubscriptionsUri(): string {
        return `${Config.AZURE_GRAPH_ENDPOINT}/v1.0/subscriptions`;
    }

    /**
     * Resolves the Graph `resource` folder segment for a subscription. Returns the
     * segment to embed in `mailFolders('<segment>')`, or `null` when a custom folder name
     * could not be resolved to an ID.
     *
     * Hot path first: an explicit `folderId` is used verbatim, and a well-known folder
     * name is passed through - both with zero extra Graph calls. Only a custom display
     * name incurs a resolution lookup.
     */
    private async resolveSubscriptionFolderSegment(
        client: Client,
        mailboxId: string,
        context?: MSGraphSubscriptionContext
    ): Promise<string | null> {
        if (context?.folderId) {
            return context.folderId;
        }
        const folderName = context?.folderName || 'inbox';
        const wellKnown = this.resolveWellKnownFolder(folderName);
        if (wellKnown) {
            return wellKnown;
        }
        // Custom display name - resolve to an ID rather than subscribing to a guessed path.
        return await this.findSystemFolder(client, mailboxId, folderName);
    }

    /**
     * Creates a Microsoft Graph change-notification subscription for messages in a
     * mailbox folder. Graph validates the notification endpoint synchronously during
     * this call (it must echo the validation token), so an unreachable/incorrect endpoint
     * surfaces here as a Graph error.
     *
     * @requires MS Graph Scope: Mail.Read (Application)
     * @param params - What to watch, where to notify, and the clientState secret
     * @param credentials - Optional credentials override for this request
     * @returns Promise<SubscriptionResult> - Subscription ID and expiration on success
     */
    public override async CreateSubscription(
        params: CreateSubscriptionParams,
        credentials?: MSGraphCredentials
    ): Promise<SubscriptionResult> {
        // Fail-fast input validation (before any Graph call).
        if (!params.ClientState) {
            return { Success: false, ErrorMessage: 'CreateSubscription requires a non-empty ClientState' };
        }
        if (params.ClientState.length > 128) {
            return { Success: false, ErrorMessage: `ClientState exceeds Microsoft Graph's 128-character limit (got ${params.ClientState.length})` };
        }
        if (!params.NotificationUrl || !params.NotificationUrl.toLowerCase().startsWith('https://')) {
            return { Success: false, ErrorMessage: 'NotificationUrl must be an https:// URL' };
        }
        if (params.LifecycleNotificationUrl && !params.LifecycleNotificationUrl.toLowerCase().startsWith('https://')) {
            return { Success: false, ErrorMessage: 'LifecycleNotificationUrl must be an https:// URL' };
        }
        if (!params.ChangeTypes || params.ChangeTypes.length === 0) {
            return { Success: false, ErrorMessage: 'CreateSubscription requires at least one ChangeType' };
        }

        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const mailboxId = this.resolveMailbox('CreateSubscription', creds, params.Identifier);
            const context = params.ContextData as MSGraphSubscriptionContext | undefined;

            const folderSegment = await this.resolveSubscriptionFolderSegment(client, mailboxId, context);
            if (!folderSegment) {
                return {
                    Success: false,
                    ErrorMessage: `Could not resolve folder '${context?.folderName}' for mailbox '${mailboxId}'`
                };
            }

            const body: Record<string, unknown> = {
                changeType: params.ChangeTypes.join(','),
                notificationUrl: params.NotificationUrl,
                resource: `/users/${mailboxId}/mailFolders('${folderSegment}')/messages`,
                clientState: params.ClientState,
                expirationDateTime: this.clampExpiration(params.RequestedExpiration)
            };
            if (params.LifecycleNotificationUrl) {
                body.lifecycleNotificationUrl = params.LifecycleNotificationUrl;
            }

            const resp = await client.api(this.getSubscriptionsUri()).post(body);
            return {
                Success: true,
                SubscriptionID: resp?.id,
                ExpiresAt: resp?.expirationDateTime ? new Date(resp.expirationDateTime) : undefined,
                Result: resp
            };
        } catch (ex) {
            LogError('Error creating subscription via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error creating subscription: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Renews an existing Graph subscription before it expires. The caller MUST pass
     * credentials for the same app registration that created the subscription - Graph
     * subscriptions are visible only to their creator, so a credential mismatch surfaces
     * as a 404.
     *
     * @requires MS Graph Scope: Mail.Read (Application)
     * @param params - The subscription ID and requested new expiration
     * @param credentials - Optional credentials override for this request
     * @returns Promise<SubscriptionResult> - The renewed expiration on success
     */
    public override async RenewSubscription(
        params: RenewSubscriptionParams,
        credentials?: MSGraphCredentials
    ): Promise<SubscriptionResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            const resp = await client.api(`${this.getSubscriptionsUri()}/${params.SubscriptionID}`).patch({
                expirationDateTime: this.clampExpiration(params.RequestedExpiration)
            });
            return {
                Success: true,
                SubscriptionID: resp?.id ?? params.SubscriptionID,
                ExpiresAt: resp?.expirationDateTime ? new Date(resp.expirationDateTime) : undefined,
                Result: resp
            };
        } catch (ex) {
            if (this.getGraphStatusCode(ex) === 404) {
                LogError(`Subscription '${params.SubscriptionID}' not found during renewal - expired or created under different credentials`);
                return {
                    Success: false,
                    ErrorMessage: 'subscription not found - expired or created under different credentials'
                };
            }
            LogError('Error renewing subscription via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error renewing subscription: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Deletes an existing Graph subscription. Idempotent from the consumer's perspective:
     * a 404 (already gone) is treated as success. The caller MUST pass credentials for
     * the same app registration that created the subscription.
     *
     * @requires MS Graph Scope: Mail.Read (Application)
     * @param params - The subscription ID to delete
     * @param credentials - Optional credentials override for this request
     * @returns Promise<BaseMessageResult> - Result of the delete operation
     */
    public override async DeleteSubscription(
        params: DeleteSubscriptionParams,
        credentials?: MSGraphCredentials
    ): Promise<BaseMessageResult> {
        try {
            const creds = this.resolveCredentials(credentials);
            const client = this.getGraphClient(creds);
            await client.api(`${this.getSubscriptionsUri()}/${params.SubscriptionID}`).delete();
            return { Success: true };
        } catch (ex) {
            if (this.getGraphStatusCode(ex) === 404) {
                // Already gone - deletion is idempotent from the consumer's perspective.
                return { Success: true };
            }
            LogError('Error deleting subscription via MS Graph', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error deleting subscription: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Parses and validates an inbound Graph change notification. Pure: no Graph client,
     * no network. Safe on hostile/garbage input - never throws; returns `Success: false`
     * with a 400 suggested status on malformed payloads.
     *
     * Graph has no cryptographic signature scheme, so `SignatureValid` is left undefined;
     * the consumer authenticates each notification by comparing its `ClientState` against
     * the secret stored alongside the subscription.
     *
     * @param input - Transport-neutral capture of the inbound webhook request
     * @returns Promise<ParseNotificationResult> - Handshake or normalized notifications
     */
    public override async ParseNotification(
        input: WebhookNotificationInput,
        _credentials?: MSGraphCredentials
    ): Promise<ParseNotificationResult> {
        // 1. Endpoint-validation handshake. QueryParams are already framework-decoded per
        //    the WebhookNotificationInput contract - echo the token verbatim.
        const validationToken = input?.QueryParams?.['validationToken'];
        if (validationToken !== undefined) {
            return {
                Success: true,
                Handshake: {
                    ResponseStatus: 200,
                    ResponseBody: validationToken,
                    ResponseContentType: 'text/plain'
                },
                Notifications: [],
                SuggestedResponseStatus: 200
            };
        }

        // 2. Parse the notification batch. Never throw on bad input.
        let payload: unknown;
        try {
            payload = JSON.parse(input?.RawBody ?? '');
        } catch {
            return {
                Success: false,
                ErrorMessage: 'Malformed notification body (invalid JSON)',
                Notifications: [],
                SuggestedResponseStatus: 400
            };
        }

        const items = (payload as { value?: unknown })?.value;
        if (!Array.isArray(items)) {
            return {
                Success: false,
                ErrorMessage: 'Notification body missing value[] array',
                Notifications: [],
                SuggestedResponseStatus: 400
            };
        }

        const notifications: NormalizedNotification[] = items.map((raw): NormalizedNotification => {
            const item = (raw ?? {}) as Record<string, unknown>;
            const lifecycleEvent = item['lifecycleEvent'];
            const resourceData = item['resourceData'] as { id?: unknown } | undefined;
            const messageId = typeof resourceData?.id === 'string' ? resourceData.id : undefined;
            return {
                Kind: lifecycleEvent != null ? 'lifecycle' : 'message',
                SubscriptionID: typeof item['subscriptionId'] === 'string' ? item['subscriptionId'] : undefined,
                ClientState: typeof item['clientState'] === 'string' ? item['clientState'] : undefined,
                Identifier: this.parseIdentifierFromResource(item['resource']),
                ChangeType: this.mapChangeType(item['changeType']),
                MessageIDs: messageId ? [messageId] : [],
                LifecycleEvent: this.mapLifecycleEvent(lifecycleEvent),
                RawData: raw
            };
        });

        return {
            Success: true,
            SignatureValid: undefined,
            Notifications: notifications,
            SuggestedResponseStatus: 202
        };
    }

    /**
     * Returns MS Graph's subscription capabilities. Graph mail subscriptions last at most
     * 4230 minutes (~3 days), support all three change types, and require synchronous
     * endpoint validation at create time.
     */
    public override GetSubscriptionCapabilities(): SubscriptionCapabilities {
        return {
            MaxLifetimeMinutes: MSGRAPH_MAX_SUBSCRIPTION_MINUTES,
            SupportedChangeTypes: ['created', 'updated', 'deleted'],
            RequiresEndpointValidation: true,
            // Graph is subscription-managed (CreateSubscription/RenewSubscription/DeleteSubscription)
            // and HINT-mode: notifications carry resourceData IDs, the consumer re-fetches via
            // GetMessages/GetSingleMessage — the payload is never delivered inline.
            SupportsSubscriptionManagement: true,
            DeliversPayloadInline: false
        };
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
            const emailToUse = this.resolveMailbox('GetSingleMessage', creds, (params.ContextData?.Email as string));

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
                    ToRecipients: this.extractRecipientAddresses(msgTyped.toRecipients),
                    CCRecipients: this.extractRecipientAddresses(msgTyped.ccRecipients),
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
            const emailToUse = this.resolveMailbox('DeleteMessage', creds, (params.ContextData?.Email as string));

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
            const emailToUse = this.resolveMailbox('MoveMessage', creds, (params.ContextData?.Email as string));

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
            const emailToUse = this.resolveMailbox('ListFolders', creds, (params.ContextData?.Email as string));

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
            const emailToUse = this.resolveMailbox('MarkAsRead', creds, (params.ContextData?.Email as string));

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
            const emailToUse = this.resolveMailbox('ArchiveMessage', creds, (params.ContextData?.Email as string));

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
            const emailToUse = this.resolveMailbox('SearchMessages', creds, (params.ContextData?.Email as string));

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
                ToRecipients: this.extractRecipientAddresses(msg.toRecipients),
                CCRecipients: this.extractRecipientAddresses(msg.ccRecipients),
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
            const emailToUse = this.resolveMailbox('ListAttachments', creds, (params.ContextData?.Email as string));

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
            const emailToUse = this.resolveMailbox('DownloadAttachment', creds, (params.ContextData?.Email as string));

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
            // MS Graph well-known folder names (shared with the subscription resolver)
            const graphFolderName = this.resolveWellKnownFolder(folderName) || folderName.toLowerCase();

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

    /**
     * Resolves a folder name to its Microsoft Graph well-known name when it is one,
     * matching case-insensitively against both friendly aliases and the canonical Graph
     * names. Graph accepts a well-known name directly in a resource path (no ID-resolution
     * call needed). Returns undefined for a custom display name, which then requires a
     * lookup. Shared by findSystemFolder and the CreateSubscription resource builder.
     */
    private resolveWellKnownFolder(folderName: string): string | undefined {
        const wellKnownNames: Record<string, string> = {
            'inbox': 'inbox',
            'sent': 'sentitems',
            'sentitems': 'sentitems',
            'drafts': 'drafts',
            'deleteditems': 'deleteditems',
            'trash': 'deleteditems',
            'junkemail': 'junkemail',
            'spam': 'junkemail',
            'archive': 'archive'
        };
        return wellKnownNames[folderName.toLowerCase()];
    }

    /**
     * Extracts an HTTP status code from a thrown Microsoft Graph client error. The
     * middleware client throws a GraphError-shaped object carrying a numeric statusCode;
     * this narrows an untyped catch value to that code (or undefined when absent).
     */
    private getGraphStatusCode(ex: unknown): number | undefined {
        if (ex && typeof ex === 'object' && 'statusCode' in ex) {
            const sc = (ex as { statusCode?: unknown }).statusCode;
            return typeof sc === 'number' ? sc : undefined;
        }
        return undefined;
    }

    /**
     * Parses the mailbox identifier (user ID / email) out of a Graph change-notification
     * resource string. Tolerant of both Users/{id}/Messages/{msgId} and
     * users/{id}/mailFolders('...')/messages/{msgId} shapes, case-insensitively. Returns
     * undefined when no pattern matches - the identifier is a routing convenience only.
     */
    private parseIdentifierFromResource(resource: unknown): string | undefined {
        if (typeof resource !== 'string') {
            return undefined;
        }
        const match = resource.match(/users\/([^/]+)/i);
        return match ? match[1] : undefined;
    }

    /**
     * Maps a raw Graph changeType value onto the normalized SubscriptionChangeType union,
     * returning undefined for anything unrecognized.
     */
    private mapChangeType(raw: unknown): SubscriptionChangeType | undefined {
        if (raw === 'created' || raw === 'updated' || raw === 'deleted') {
            return raw;
        }
        return undefined;
    }

    /**
     * Maps a raw Graph lifecycleEvent value onto the normalized lifecycle-event union,
     * returning undefined for anything unrecognized.
     */
    private mapLifecycleEvent(raw: unknown): NormalizedNotification['LifecycleEvent'] | undefined {
        if (raw === 'subscriptionRemoved' || raw === 'missed' || raw === 'reauthorizationRequired') {
            return raw;
        }
        return undefined;
    }

    /**
     * Clamps a requested subscription expiration to Graph's maximum lifetime, returning an
     * ISO-8601 UTC string. When no expiration is requested (or it exceeds the max), the
     * maximum-allowed expiration from now is used.
     */
    private clampExpiration(requested?: Date): string {
        const max = new Date(Date.now() + MSGRAPH_MAX_SUBSCRIPTION_MINUTES * 60 * 1000);
        const effective = requested && requested.getTime() < max.getTime() ? requested : max;
        return effective.toISOString();
    }
}