import {
    BaseCommunicationProvider,
    BaseMessageResult,
    CreateDraftParams,
    CreateDraftResult,
    CreateSubscriptionParams,
    DeleteSubscriptionParams,
    ForwardMessageParams,
    ForwardMessageResult,
    GetMessageMessage,
    GetMessagesParams,
    GetMessagesResult,
    MessageResult,
    NormalizedNotification,
    ParseEmailAddressList,
    ParseNotificationResult,
    ProcessedMessage,
    ProviderCredentialsBase,
    ReplyToMessageParams,
    ReplyToMessageResult,
    resolveCredentialValue,
    SubscriptionCapabilities,
    SubscriptionResult,
    validateRequiredCredentials,
    WebhookNotificationInput,
    ProviderOperation
} from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import sgMail, { MailDataRequired } from '@sendgrid/mail';
import { __API_KEY } from "./config";
import { LogError, LogStatus } from "@memberjunction/core";

/**
 * Credentials for SendGrid email provider.
 *
 * @example
 * ```typescript
 * // Use with SendSingleMessage
 * await provider.SendSingleMessage(message, {
 *     apiKey: 'SG.your-api-key'
 * });
 *
 * // Disable environment fallback
 * await provider.SendSingleMessage(message, {
 *     apiKey: 'SG.your-api-key',
 *     disableEnvironmentFallback: true
 * });
 * ```
 */
export interface SendGridCredentials extends ProviderCredentialsBase {
    /**
     * SendGrid API key. Typically starts with 'SG.'
     * If not provided, falls back to COMMUNICATION_VENDOR_API_KEY__SENDGRID environment variable.
     */
    apiKey?: string;
}

/**
 * Implementation of the SendGrid provider for sending and receiving messages.
 *
 * @remarks
 * SendGrid is a transactional email service. This provider supports:
 * - Sending single messages
 * - Sending to multiple recipients (via engine)
 * - Inbound email via the SendGrid **Inbound Parse Webhook** (push notifications):
 *   - {@link CreateSubscription} / {@link DeleteSubscription} manage the hostname→URL
 *     Inbound Parse mapping via SendGrid's REST API
 *     (`/v3/user/webhooks/parse/settings`).
 *   - {@link ParseNotification} parses the inbound `multipart/form-data` POST that
 *     SendGrid delivers to the consumer's URL. This is INLINE delivery: the POST body
 *     contains the ENTIRE parsed email, so {@link NormalizedNotification.Message} is
 *     populated and there is NO re-fetch (SendGrid has no inbound-retrieval API).
 *
 * It does NOT support:
 * - Fetching messages (no inbox access / no inbound-retrieval API)
 * - Forwarding messages
 * - Replying to messages
 * - Creating drafts
 *
 * ## SECURITY CAVEAT (Inbound Parse)
 * SendGrid Inbound Parse is **unsigned** — there is no cryptographic signature on the
 * inbound POST and no expiry on the registration. Because the message is delivered inline
 * (the payload IS the data path), a forged notification is NOT harmless. Consumers MUST
 * protect the notification endpoint out-of-band: use a hard-to-guess URL secret path
 * and/or network controls (IP allow-listing, private ingress). {@link ParseNotification}
 * therefore always returns `SignatureValid: undefined` (no scheme to verify).
 *
 * @example
 * ```typescript
 * // Using environment credentials (default)
 * await engine.SendSingleMessage('SendGrid', 'Standard Email', message);
 *
 * // Using per-request credentials
 * await engine.SendSingleMessage('SendGrid', 'Standard Email', message, undefined, false, {
 *     apiKey: 'SG.customer-specific-key'
 * });
 * ```
 */
@RegisterClass(BaseCommunicationProvider, 'SendGrid')
export class SendGridProvider extends BaseCommunicationProvider {
    /**
     * Returns the list of operations supported by the SendGrid provider.
     * SendGrid is a transactional email service for OUTBOUND, plus INBOUND via the
     * Inbound Parse Webhook (subscription management + inbound notification parsing).
     * It does NOT support mailbox operations like fetching messages, folders, or
     * attachments (there is no inbound-retrieval API).
     */
    public override getSupportedOperations(): ProviderOperation[] {
        return [
            'SendSingleMessage',
            // Inbound Parse Webhook: register/unregister the hostname→URL mapping and
            // parse the inline multipart/form-data POST SendGrid delivers.
            'CreateSubscription',
            'DeleteSubscription',
            'ParseNotification'
            // Note: no GetMessages/ForwardMessage/ReplyToMessage/CreateDraft (no inbox).
            // No RenewSubscription — Inbound Parse settings never expire.
        ];
    }

    /**
     * Sends a single message using SendGrid.
     * @param message - The processed message to send
     * @param credentials - Optional SendGrid credentials override
     */
    public async SendSingleMessage(
        message: ProcessedMessage,
        credentials?: SendGridCredentials
    ): Promise<MessageResult> {
        // Resolve credentials: request values override env vars
        const disableFallback = credentials?.disableEnvironmentFallback ?? false;

        const apiKey = resolveCredentialValue(
            credentials?.apiKey,
            __API_KEY,
            disableFallback
        );

        // Validate required credentials
        validateRequiredCredentials({ apiKey }, ['apiKey'], 'SendGrid');

        const from: string = message.From;
        // Set API key for this request
        sgMail.setApiKey(apiKey!);

        const msg: MailDataRequired = {
            to: message.To,
            from: {
                email: from,
                name: message.FromName
            },
            cc: message.CCRecipients,
            bcc: message.BCCRecipients,
            subject: message.ProcessedSubject,
            text: message.ProcessedBody,
            html: message.ProcessedHTMLBody,
            trackingSettings: {
                subscriptionTracking: {
                    enable: false
                }
            }
        };

        /*
        * Should be ready to go - but needs SG testing.
        if(message.Headers){
            msg.headers = Object.fromEntries(Object.entries(message.Headers).map(([key, value]) => [`X-${key}`, value])) as Record<string, string>;
        }
        */

        if (message.SendAt) {
            const time = message.SendAt.getTime();
            const unitTime = Math.floor(time / 1000);
            msg.sendAt = unitTime;
        }

        // DRY RUN: full pipeline ran (credential resolution/validation + complete SendGrid
        // payload construction above) — stop at the transport boundary, never calling SendGrid.
        if (message.DryRun) {
            LogStatus(`[DryRun] SendGrid: payload constructed for ${msg.to} — external send skipped`);
            return {
                Message: message,
                Success: true,
                Error: '',
                DryRun: true
            };
        }

        try {
            const result = await sgMail.send(msg);
            if (result && result.length > 0 && result[0].statusCode >= 200 && result[0].statusCode < 300) {
                LogStatus(`Email sent to ${msg.to}: ${result[0].statusCode}`);
                return {
                    Message: message,
                    Success: true,
                    Error: ''
                };
            }
            else {
                const status = result?.[0]?.statusCode ?? '?';
                const body = safeStringify(result?.[0]?.body);
                LogError(
                    `SendGrid rejected email to ${msg.to} — status ${status}. ` +
                    `From: ${from}. Response: ${body}`
                );
                return {
                    Message: message,
                    Success: false,
                    Error: `SendGrid ${status}: ${body}`
                };
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const status = (error as { code?: number })?.code ?? '?';
            const body = (error as { response?: { body?: unknown } })?.response?.body;
            const bodyText = safeStringify(body);
            const sendGridMessages = extractSendGridErrorMessages(body);
            const combined =
                sendGridMessages.length > 0
                    ? `SendGrid ${status}: ${sendGridMessages.join('; ')}`
                    : `SendGrid ${status}: ${errorMessage}`;

            LogError(
                `${combined} — sending email to ${msg.to}. ` +
                `From: ${from}. Subject: "${message.Subject ?? '(none)'}". ` +
                `Full SendGrid response body: ${bodyText}`
            );

            return {
                Message: message,
                Success: false,
                Error: combined
            };
        }
    }

    /**
     * Fetches messages from the provider.
     * @remarks SendGrid does not support fetching messages (no inbox access).
     */
    public async GetMessages(
        params: GetMessagesParams,
        credentials?: SendGridCredentials
    ): Promise<GetMessagesResult> {
        throw new Error("SendGridProvider does not support fetching messages");
    }

    /**
     * Forwards a message to another client using the provider.
     * @remarks SendGrid does not support forwarding messages.
     */
    public ForwardMessage(
        params: ForwardMessageParams,
        credentials?: SendGridCredentials
    ): Promise<ForwardMessageResult> {
        throw new Error("SendGridProvider does not support forwarding messages");
    }

    /**
     * Replies to a message using the provider.
     * @remarks SendGrid does not support replying to messages.
     */
    public ReplyToMessage(
        params: ReplyToMessageParams,
        credentials?: SendGridCredentials
    ): Promise<ReplyToMessageResult> {
        throw new Error("SendGridProvider does not support replying to messages");
    }

    /**
     * Creates a draft message using the provider.
     * @remarks SendGrid does not support creating drafts (no mailbox access).
     */
    public async CreateDraft(
        params: CreateDraftParams,
        credentials?: SendGridCredentials
    ): Promise<CreateDraftResult> {
        return {
            Success: false,
            ErrorMessage: 'SendGrid does not support creating draft messages. Drafts are only supported by email providers with mailbox access (Gmail, MS Graph).'
        };
    }

    // ========================================================================
    // PUSH-NOTIFICATION SUBSCRIPTIONS (Inbound Parse Webhook)
    // SendGrid Inbound Parse is INLINE-mode: the inbound POST carries the full parsed
    // email, so ParseNotification populates NormalizedNotification.Message and there is
    // no re-fetch. Management (create/delete the hostname→URL mapping) rides SendGrid's
    // REST API via the global fetch. The provider is stateless — the consumer persists
    // the hostname (the DELETE key). No RenewSubscription: settings never expire.
    // ========================================================================

    /** SendGrid REST endpoint for the Inbound Parse settings collection. */
    private static readonly PARSE_SETTINGS_URL = 'https://api.sendgrid.com/v3/user/webhooks/parse/settings';

    /**
     * Resolves and validates the SendGrid API key using the same precedence as
     * {@link SendSingleMessage} (request value overrides env, respecting
     * `disableEnvironmentFallback`). Throws when no key can be resolved; callers invoke
     * this inside a try/catch so a missing key surfaces as a `Success: false` result.
     */
    private resolveApiKey(credentials?: SendGridCredentials): string {
        const disableFallback = credentials?.disableEnvironmentFallback ?? false;
        const apiKey = resolveCredentialValue(credentials?.apiKey, __API_KEY, disableFallback);
        validateRequiredCredentials({ apiKey }, ['apiKey'], 'SendGrid');
        return apiKey!;
    }

    /**
     * Registers a hostname→URL Inbound Parse mapping with SendGrid so inbound email to
     * `params.Identifier` (the receiving hostname/subdomain, e.g. `parse.example.com`) is
     * POSTed to `params.NotificationUrl`.
     *
     * The returned `SubscriptionID` is the hostname itself — it is the key SendGrid uses
     * for {@link DeleteSubscription}. `ExpiresAt` is always `undefined` (Inbound Parse
     * settings never expire).
     *
     * @param params - Identifier (receiving hostname) and NotificationUrl (https endpoint)
     * @param credentials - Optional SendGrid credentials override for this request
     * @returns Promise<SubscriptionResult> - hostname as SubscriptionID on success
     */
    public override async CreateSubscription(
        params: CreateSubscriptionParams,
        credentials?: SendGridCredentials
    ): Promise<SubscriptionResult> {
        // Fail-fast input validation (before any network call).
        if (!params.Identifier) {
            return { Success: false, ErrorMessage: 'CreateSubscription requires Identifier (the receiving hostname, e.g. "parse.example.com")' };
        }
        if (!params.NotificationUrl || !params.NotificationUrl.toLowerCase().startsWith('https://')) {
            return { Success: false, ErrorMessage: 'NotificationUrl must be an https:// URL' };
        }

        try {
            const apiKey = this.resolveApiKey(credentials);
            const resp = await fetch(SendGridProvider.PARSE_SETTINGS_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    hostname: params.Identifier,
                    url: params.NotificationUrl,
                    spam_check: false,
                    send_raw: false
                })
            });

            const text = await resp.text();
            if (!resp.ok) {
                LogError(`SendGrid Inbound Parse create failed for hostname '${params.Identifier}' — status ${resp.status}. Response: ${text}`);
                return {
                    Success: false,
                    ErrorMessage: `SendGrid Inbound Parse create failed: ${resp.status} ${text}`
                };
            }

            return {
                Success: true,
                SubscriptionID: params.Identifier, // hostname is the DELETE key
                ExpiresAt: undefined,               // Inbound Parse settings never expire
                Result: this.safeParseJsonObject(text)
            };
        } catch (ex) {
            LogError('Error creating SendGrid Inbound Parse subscription', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error creating subscription: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Deletes an Inbound Parse mapping by hostname (`params.SubscriptionID`). Idempotent:
     * a 404 (mapping already gone) is treated as success.
     *
     * @param params - SubscriptionID is the hostname returned by {@link CreateSubscription}
     * @param credentials - Optional SendGrid credentials override for this request
     * @returns Promise<BaseMessageResult> - Result of the delete operation
     */
    public override async DeleteSubscription(
        params: DeleteSubscriptionParams,
        credentials?: SendGridCredentials
    ): Promise<BaseMessageResult> {
        try {
            const apiKey = this.resolveApiKey(credentials);
            const url = `${SendGridProvider.PARSE_SETTINGS_URL}/${encodeURIComponent(params.SubscriptionID)}`;
            const resp = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (resp.ok || resp.status === 404) {
                // 404 = already gone; deletion is idempotent from the consumer's perspective.
                return { Success: true };
            }

            const text = await resp.text();
            LogError(`SendGrid Inbound Parse delete failed for hostname '${params.SubscriptionID}' — status ${resp.status}. Response: ${text}`);
            return {
                Success: false,
                ErrorMessage: `SendGrid Inbound Parse delete failed: ${resp.status} ${text}`
            };
        } catch (ex) {
            LogError('Error deleting SendGrid Inbound Parse subscription', undefined, ex);
            return {
                Success: false,
                ErrorMessage: `Error deleting subscription: ${ex instanceof Error ? ex.message : String(ex)}`
            };
        }
    }

    /**
     * Parses an inbound SendGrid Inbound Parse notification. PURE: no network calls, and
     * safe on hostile/garbage input — never throws; returns `Success: false` with a 400
     * suggested status on malformed payloads.
     *
     * The body is `multipart/form-data`; the boundary is read from the
     * `content-type` header. The full parsed email is delivered inline, so this populates
     * {@link NormalizedNotification.Message} directly (INLINE mode — no re-fetch).
     *
     * `SignatureValid` is always `undefined`: Inbound Parse has NO signature scheme. See
     * the class-level SECURITY CAVEAT — consumers must protect the endpoint out-of-band.
     *
     * LIMITATION: binary attachment parts are intentionally NOT decoded. When attachment
     * parts are present, only their COUNT is recorded (`RawData.attachmentCount`); the
     * bytes are skipped. Consumers needing attachments must read the raw request directly.
     *
     * @param input - Transport-neutral capture of the inbound webhook request
     * @param _credentials - Unused (no signature scheme to verify)
     * @returns Promise<ParseNotificationResult> - One normalized notification, inline Message populated
     */
    public override async ParseNotification(
        input: WebhookNotificationInput,
        _credentials?: SendGridCredentials
    ): Promise<ParseNotificationResult> {
        const fail = (msg: string): ParseNotificationResult => ({
            Success: false,
            ErrorMessage: msg,
            Notifications: [],
            SuggestedResponseStatus: 400
        });

        const contentType = input?.Headers?.['content-type'] ?? '';
        if (!contentType.toLowerCase().includes('multipart/form-data')) {
            return fail('Expected multipart/form-data content-type for SendGrid Inbound Parse');
        }

        const boundary = this.extractBoundary(contentType);
        if (!boundary) {
            return fail('Missing multipart boundary in content-type header');
        }

        const rawBody = input?.RawBody;
        if (!rawBody || rawBody.trim().length === 0) {
            return fail('Empty notification body');
        }

        let fields: Record<string, string>;
        let attachmentCount: number;
        try {
            const parsed = this.parseMultipartFormData(rawBody, boundary);
            fields = parsed.Fields;
            attachmentCount = parsed.AttachmentCount;
        } catch (ex) {
            return fail(`Failed to parse multipart body: ${ex instanceof Error ? ex.message : String(ex)}`);
        }

        if (Object.keys(fields).length === 0 && attachmentCount === 0) {
            return fail('No form fields found in multipart body');
        }

        const from = fields['from'] ?? '';
        const to = fields['to'] ?? '';
        const cc = fields['cc'] ?? '';
        const subject = fields['subject'] ?? '';
        const text = fields['text'] ?? '';
        const html = fields['html'] ?? '';

        const rawData: Record<string, unknown> = { ...fields };
        if (attachmentCount > 0) {
            rawData['attachmentCount'] = attachmentCount;
        }

        const message: GetMessageMessage = {
            From: from,
            To: to,
            ToRecipients: ParseEmailAddressList(to),
            CCRecipients: ParseEmailAddressList(cc),
            Subject: subject,
            Body: text || html || '' // INLINE payload — prefer plain text, fall back to HTML
        };

        const notification: NormalizedNotification = {
            Kind: 'message',
            ChangeType: 'created',
            MessageIDs: [], // no message id and no pull path (SendGrid has no inbound-retrieval API)
            Identifier: this.resolveInboundIdentifier(fields['envelope'], to),
            Message: message,
            RawData: rawData
        };

        return {
            Success: true,
            SignatureValid: undefined, // Inbound Parse is unsigned — no scheme to verify
            Notifications: [notification],
            SuggestedResponseStatus: 200
        };
    }

    /**
     * Returns SendGrid's Inbound Parse subscription capabilities. Inbound Parse settings
     * never expire (no `MaxLifetimeMinutes`), watch only inbound-created messages, need no
     * endpoint validation handshake, are manageable via the REST API, and deliver the full
     * payload inline.
     */
    public override GetSubscriptionCapabilities(): SubscriptionCapabilities {
        return {
            MaxLifetimeMinutes: undefined, // Inbound Parse settings never expire
            SupportedChangeTypes: ['created'],
            RequiresEndpointValidation: false,
            SupportsSubscriptionManagement: true,
            DeliversPayloadInline: true
        };
    }

    /**
     * Extracts the multipart boundary from a `content-type` header value. Handles both
     * quoted (`boundary="xyz"`) and unquoted (`boundary=xyz`) forms. Returns `undefined`
     * when no boundary is present.
     */
    private extractBoundary(contentType: string): string | undefined {
        const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
        return match?.[1] ?? match?.[2] ?? undefined;
    }

    /**
     * Small, dependency-free `multipart/form-data` parser. Splits the body on the
     * `--<boundary>` delimiter and, for each part, reads the `Content-Disposition` header
     * to get the field `name`, then captures the part body (trimming the single trailing
     * CRLF that precedes the next delimiter).
     *
     * Only TEXT form fields are captured into `Fields`. Parts carrying a `filename=` (file
     * attachments) are counted in `AttachmentCount` and their bytes are skipped — this
     * parser deliberately does not decode binary attachment content.
     */
    private parseMultipartFormData(rawBody: string, boundary: string): { Fields: Record<string, string>; AttachmentCount: number } {
        const fields: Record<string, string> = {};
        let attachmentCount = 0;
        const delimiter = `--${boundary}`;

        for (const segment of rawBody.split(delimiter)) {
            // Drop a single leading CRLF/LF that follows the delimiter.
            const part = segment.replace(/^\r?\n/, '');
            // Skip the preamble (empty) and the closing marker segment (`--` then optional CRLF).
            if (!part || part.startsWith('--')) {
                continue;
            }

            // Separate part headers from the part body at the first blank line.
            let sepIdx = part.indexOf('\r\n\r\n');
            let sepLen = 4;
            if (sepIdx === -1) {
                sepIdx = part.indexOf('\n\n');
                sepLen = 2;
            }
            if (sepIdx === -1) {
                continue; // no header/body separator — not a well-formed part
            }

            const headerBlock = part.slice(0, sepIdx);
            const value = part.slice(sepIdx + sepLen).replace(/\r?\n$/, '');

            const disposition = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headerBlock);
            if (!disposition) {
                continue;
            }
            const nameMatch = /name="([^"]*)"/i.exec(disposition[1]);
            if (!nameMatch) {
                continue;
            }

            if (/filename="?/i.test(disposition[1])) {
                attachmentCount++; // attachment part — count it, skip the bytes
                continue;
            }
            fields[nameMatch[1]] = value;
        }

        return { Fields: fields, AttachmentCount: attachmentCount };
    }

    /**
     * Determines the receiving identifier for an inbound message. Prefers the parsed
     * SendGrid `envelope` JSON (`{ "to": [...], "from": "..." }`) `to` value; falls back to
     * the raw `to` form field. Returns `undefined` when neither is present.
     */
    private resolveInboundIdentifier(envelope: string | undefined, toField: string): string | undefined {
        if (envelope) {
            try {
                const parsed: unknown = JSON.parse(envelope);
                if (parsed && typeof parsed === 'object') {
                    const to = (parsed as { to?: unknown }).to;
                    if (Array.isArray(to) && to.length > 0 && typeof to[0] === 'string') {
                        return to[0];
                    }
                    if (typeof to === 'string') {
                        return to;
                    }
                }
            } catch {
                // fall through to the raw 'to' field
            }
        }
        return toField || undefined;
    }

    /**
     * `JSON.parse` that returns an object or `undefined` — never throws. Used to attach the
     * SendGrid REST response body to {@link SubscriptionResult.Result} without risking a
     * secondary crash on a non-JSON body.
     */
    private safeParseJsonObject(text: string): Record<string, unknown> | undefined {
        if (!text) {
            return undefined;
        }
        try {
            const parsed: unknown = JSON.parse(text);
            return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
        } catch {
            return undefined;
        }
    }
}

/**
 * Shape SendGrid returns in `error.response.body` on 4xx/5xx — e.g.,
 * `{ errors: [{ message, field, help }], id, ... }`. We keep this loose because
 * SendGrid occasionally adds or omits fields between API versions.
 */
interface SendGridErrorBody {
    errors?: Array<{ message?: string; field?: string | null; help?: string | null }>;
}

/**
 * Pull human-readable messages out of the SendGrid error body. Returns an
 * empty array when the body doesn't match the expected shape (e.g., proxy
 * error, HTML, malformed JSON) so the caller can fall back to the raw string.
 */
function extractSendGridErrorMessages(body: unknown): string[] {
    if (!body || typeof body !== 'object') return [];
    const errors = (body as SendGridErrorBody).errors;
    if (!Array.isArray(errors)) return [];
    return errors
        .map((e) => {
            const parts: string[] = [];
            if (e.message) parts.push(e.message);
            if (e.field) parts.push(`field=${e.field}`);
            if (e.help) parts.push(`help=${e.help}`);
            return parts.join(' ');
        })
        .filter((s) => s.length > 0);
}

/**
 * `JSON.stringify` that never throws — important in logging paths where a
 * circular reference in the response object would otherwise replace a useful
 * error with a secondary crash.
 */
function safeStringify(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}