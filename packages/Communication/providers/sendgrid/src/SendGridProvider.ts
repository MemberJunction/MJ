import crypto from "node:crypto";
import dns from "node:dns/promises";
import {
    BaseCommunicationProvider,
    BaseMessageResult,
    CreateDomainAuthParams,
    CreateDomainAuthResult,
    CreateDraftParams,
    CreateDraftResult,
    CreateSubscriptionParams,
    DeleteDomainAuthParams,
    DeleteSubscriptionParams,
    DomainDNSRecord,
    ForwardMessageParams,
    ForwardMessageResult,
    GetMessageMessage,
    GetMessagesParams,
    GetMessagesResult,
    MessageResult,
    NormalizedActivityEvent,
    NormalizedActivityEventType,
    NormalizedNotification,
    ParseEmailAddressList,
    ParseNotificationResult,
    ProcessedMessage,
    ProviderCredentialsBase,
    ProviderOperation,
    ReplyToMessageParams,
    ReplyToMessageResult,
    resolveCredentialValue,
    SubscriptionCapabilities,
    SubscriptionResult,
    validateRequiredCredentials,
    VerifyDomainAuthParams,
    VerifyDomainAuthResult,
    WebhookNotificationInput
} from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import sgMail, { MailDataRequired } from '@sendgrid/mail';
import { API_KEY } from "./config";
import { LogError, LogStatus } from "@memberjunction/core";
import { DrainResponseBody } from "@memberjunction/network-utils";

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
    /**
     * SendGrid Event Webhook ECDSA public verification key (PEM or base64 SPKI DER).
     * Used by {@link ParseNotification} to verify `X-Twilio-Email-Event-Webhook-Signature`.
     */
    webhookVerificationKey?: string;
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
            'ParseNotification',
            // Sending Domain Authentication (SPF / DKIM / Return-Path)
            'CreateDomainAuthentication',
            'VerifyDomainAuthentication',
            'DeleteDomainAuthentication'
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
            API_KEY,
            disableFallback
        );

        // Validate required credentials
        validateRequiredCredentials({ apiKey }, ['apiKey'], 'SendGrid');

        const from: string = message.From;
        // Set API key for this request
        sgMail.setApiKey(apiKey!);

        const msg = this.buildSendGridMessage(message, from);

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
                const providerMessageId = extractHeaderCaseInsensitive(result[0].headers, 'x-message-id');
                LogStatus(`Email sent to ${msg.to}: ${result[0].statusCode}`);
                return {
                    Message: message,
                    Success: true,
                    Error: '',
                    ...(providerMessageId ? { ProviderMessageID: providerMessageId } : {})
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

    /**
     * Builds the `@sendgrid/mail` payload from a {@link ProcessedMessage}.
     * Passes `message.Headers` verbatim (never prefixing `X-`), disables SendGrid
     * open/click tracking when MJ first-party tracking is active, and injects only
     * `customArgs: { mj_log_id }` (never PII `CorrelationData`).
     */
    private buildSendGridMessage(message: ProcessedMessage, from: string): MailDataRequired {
        const ctx = (message.ContextData ?? {}) as Record<string, unknown>;
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
            trackingSettings: this.buildTrackingSettings(ctx)
        };

        if (message.Headers && Object.keys(message.Headers).length > 0) {
            msg.headers = { ...message.Headers };
        }

        const logId = ctx['mj_log_id'] ?? ctx['CommunicationLogID'];
        if (typeof logId === 'string' && logId.trim().length > 0) {
            msg.customArgs = { mj_log_id: logId };
        }

        if (message.SendAt) {
            msg.sendAt = Math.floor(message.SendAt.getTime() / 1000);
        }

        return msg;
    }

    /**
     * Builds `trackingSettings` for SendGrid. Subscription tracking is always disabled;
     * `openTracking` and `clickTracking` are disabled when MJ first-party tracking is active.
     */
    private buildTrackingSettings(ctx: Record<string, unknown>): NonNullable<MailDataRequired['trackingSettings']> {
        const firstPartyActive = Boolean(
            ctx['mjFirstPartyTracking'] ||
            ctx['disableProviderTracking'] ||
            ctx['DisableProviderTracking'] ||
            ctx['TrackingToken'] ||
            ctx['trackingToken']
        );
        const disableOpen = firstPartyActive || ctx['TrackOpens'] === false || ctx['trackOpens'] === false;
        const disableClick = firstPartyActive || ctx['TrackClicks'] === false || ctx['trackClicks'] === false;

        const settings: NonNullable<MailDataRequired['trackingSettings']> = {
            subscriptionTracking: { enable: false }
        };
        if (disableOpen) {
            settings.openTracking = { enable: false };
        }
        if (disableClick) {
            settings.clickTracking = { enable: false };
        }
        return settings;
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
        const apiKey = resolveCredentialValue(credentials?.apiKey, API_KEY, disableFallback);
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
                await DrainResponseBody(resp);
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
        credentials?: SendGridCredentials
    ): Promise<ParseNotificationResult> {
        const contentType = extractHeaderCaseInsensitive(input?.Headers, 'content-type') ?? '';
        if (contentType.toLowerCase().includes('application/json')) {
            return this.parseEventWebhook(input, credentials);
        }
        if (!contentType.toLowerCase().includes('multipart/form-data')) {
            return {
                Success: false,
                ErrorMessage: 'Expected multipart/form-data or application/json content-type for SendGrid webhook',
                Notifications: [],
                SuggestedResponseStatus: 400
            };
        }
        return this.parseInboundParseNotification(input);
    }

    /**
     * Parses a SendGrid Event Webhook JSON batch (`application/json`).
     * Verifies the ECDSA signature and 10-minute replay window against `RawBody` when
     * `credentials.webhookVerificationKey` is provided, then normalizes every event into
     * a {@link NormalizedNotification} (`Kind: 'activity'`).
     */
    private parseEventWebhook(
        input: WebhookNotificationInput,
        credentials?: SendGridCredentials
    ): ParseNotificationResult {
        const fail = (msg: string, status = 400, signatureValid?: boolean): ParseNotificationResult => ({
            Success: false,
            ErrorMessage: msg,
            SignatureValid: signatureValid,
            Notifications: [],
            SuggestedResponseStatus: status
        });

        const rawBody = input?.RawBody;
        if (!rawBody || rawBody.trim().length === 0) {
            return fail('Empty notification body');
        }

        const verificationKey = credentials?.webhookVerificationKey;
        if (!verificationKey) {
            return fail('Missing SendGrid Event Webhook verification key', 401, false);
        }
        const sig = extractHeaderCaseInsensitive(input?.Headers, 'x-twilio-email-event-webhook-signature');
        const ts = extractHeaderCaseInsensitive(input?.Headers, 'x-twilio-email-event-webhook-timestamp');
        if (!sig || !ts) {
            return fail('Missing SendGrid Event Webhook signature or timestamp header', 401, false);
        }
        const verification = VerifySendGridWebhookSignature(verificationKey, rawBody, sig, ts);
        if (!verification.Valid) {
            return fail(verification.Reason ?? 'Invalid SendGrid Event Webhook signature', 401, false);
        }
        const signatureValid = true;

        let parsed: unknown;
        try {
            parsed = JSON.parse(rawBody);
        } catch (ex) {
            return fail(`Invalid JSON in SendGrid Event Webhook: ${ex instanceof Error ? ex.message : String(ex)}`, 400, signatureValid);
        }

        if (!Array.isArray(parsed)) {
            return fail('Expected JSON array for SendGrid Event Webhook payload', 400, signatureValid);
        }

        const activityEvents: NormalizedActivityEvent[] = [];
        const messageIds = new Set<string>();
        for (const item of parsed) {
            const mapped = mapSendGridEventToActivity(item);
            if (mapped) {
                activityEvents.push(mapped);
                if (mapped.ProviderMessageID) {
                    messageIds.add(mapped.ProviderMessageID);
                }
            }
        }

        const notification: NormalizedNotification = {
            Kind: 'activity',
            MessageIDs: [...messageIds],
            ActivityEvents: activityEvents,
            RawData: parsed
        };

        return {
            Success: true,
            SignatureValid: signatureValid,
            Notifications: [notification],
            SuggestedResponseStatus: 200
        };
    }

    /**
     * Parses a SendGrid Inbound Parse `multipart/form-data` POST into a single inline-message
     * {@link NormalizedNotification}.
     */
    private parseInboundParseNotification(input: WebhookNotificationInput): ParseNotificationResult {
        const fail = (msg: string): ParseNotificationResult => ({
            Success: false,
            ErrorMessage: msg,
            Notifications: [],
            SuggestedResponseStatus: 400
        });

        const contentType = extractHeaderCaseInsensitive(input?.Headers, 'content-type') ?? '';
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

    // ========================================================================
    // SENDING DOMAIN AUTHENTICATION & SUPPRESSION SYNC
    // ========================================================================

    private static readonly WHITELABEL_DOMAINS_URL = 'https://api.sendgrid.com/v3/whitelabel/domains';
    private static readonly SUPPRESSION_BASE_URL = 'https://api.sendgrid.com/v3/suppression';
    private static readonly GLOBAL_UNSUB_URL = 'https://api.sendgrid.com/v3/asm/suppressions/global';

    /**
     * Registers a sending domain with SendGrid (`/v3/whitelabel/domains`) and returns
     * the required CNAME/TXT DNS records for DKIM, SPF, and Return-Path.
     */
    public override async CreateDomainAuthentication(
        params: CreateDomainAuthParams,
        credentials?: SendGridCredentials
    ): Promise<CreateDomainAuthResult> {
        if (!params.Domain) {
            return { Success: false, ErrorMessage: 'CreateDomainAuthentication requires Domain', DNSRecords: [] };
        }
        try {
            const apiKey = this.resolveApiKey(credentials);
            const payload: Record<string, unknown> = {
                domain: params.Domain,
                automatic_security: true
            };
            if (params.Subdomain) {
                payload['subdomain'] = params.Subdomain;
            }
            const resp = await fetch(SendGridProvider.WHITELABEL_DOMAINS_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const text = await resp.text();
            if (!resp.ok) {
                return { Success: false, ErrorMessage: `SendGrid domain create failed: ${resp.status} ${text}`, DNSRecords: [] };
            }
            const data = this.safeParseJsonObject(text) as SendGridDomainCreateResponse | undefined;
            return {
                Success: true,
                ProviderDomainID: data?.id !== undefined ? String(data.id) : undefined,
                DNSRecords: mapSendGridDnsRecords(data?.dns)
            };
        } catch (ex) {
            return {
                Success: false,
                ErrorMessage: `Error creating domain authentication: ${ex instanceof Error ? ex.message : String(ex)}`,
                DNSRecords: []
            };
        }
    }

    /**
     * Validates a previously registered SendGrid domain (`/v3/whitelabel/domains/:id/validate`)
     * and performs a `_dmarc.<domain>` TXT DNS lookup to verify DMARC policy presence.
     */
    public override async VerifyDomainAuthentication(
        params: VerifyDomainAuthParams,
        credentials?: SendGridCredentials
    ): Promise<VerifyDomainAuthResult> {
        if (!params.ProviderDomainID || !params.Domain) {
            return { Success: false, ErrorMessage: 'VerifyDomainAuthentication requires ProviderDomainID and Domain', Verified: false, DNSRecords: [] };
        }
        try {
            const apiKey = this.resolveApiKey(credentials);
            const url = `${SendGridProvider.WHITELABEL_DOMAINS_URL}/${encodeURIComponent(params.ProviderDomainID)}/validate`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });
            const text = await resp.text();
            if (!resp.ok) {
                return { Success: false, ErrorMessage: `SendGrid domain validate failed: ${resp.status} ${text}`, Verified: false, DNSRecords: [] };
            }
            const data = this.safeParseJsonObject(text) as SendGridDomainValidateResponse | undefined;
            const records = mapSendGridValidationResults(data?.validation_results);
            const dmarcRecord = await checkDmarcTxtRecord(params.Domain);
            records.push(dmarcRecord);
            const verified = Boolean(data?.valid) && dmarcRecord.Validated;
            return { Success: true, Verified: verified, DNSRecords: records };
        } catch (ex) {
            return {
                Success: false,
                ErrorMessage: `Error verifying domain authentication: ${ex instanceof Error ? ex.message : String(ex)}`,
                Verified: false,
                DNSRecords: []
            };
        }
    }

    /**
     * Deletes a sending domain authentication registration from SendGrid.
     * Idempotent: treats 404 (already deleted) as success.
     */
    public override async DeleteDomainAuthentication(
        params: DeleteDomainAuthParams,
        credentials?: SendGridCredentials
    ): Promise<BaseMessageResult> {
        if (!params.ProviderDomainID) {
            return { Success: false, ErrorMessage: 'DeleteDomainAuthentication requires ProviderDomainID' };
        }
        try {
            const apiKey = this.resolveApiKey(credentials);
            const url = `${SendGridProvider.WHITELABEL_DOMAINS_URL}/${encodeURIComponent(params.ProviderDomainID)}`;
            const resp = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (resp.ok || resp.status === 404) {
                await DrainResponseBody(resp);
                return { Success: true };
            }
            const text = await resp.text();
            return { Success: false, ErrorMessage: `SendGrid domain delete failed: ${resp.status} ${text}` };
        } catch (ex) {
            return { Success: false, ErrorMessage: `Error deleting domain authentication: ${ex instanceof Error ? ex.message : String(ex)}` };
        }
    }

    /**
     * Clears a SendGrid suppression entry for `email` when MJ revokes a block.
     * When `suppressionType` is omitted, clears across bounces, blocks, invalid_emails,
     * spam_reports, and global unsubscribes. Idempotent on 404.
     */
    public async RemoveSuppression(
        email: string,
        suppressionType?: SendGridSuppressionType,
        credentials?: SendGridCredentials
    ): Promise<BaseMessageResult> {
        const normalized = email.trim().toLowerCase();
        if (!normalized) {
            return { Success: false, ErrorMessage: 'RemoveSuppression requires a non-empty email address' };
        }
        try {
            const apiKey = this.resolveApiKey(credentials);
            const types: SendGridSuppressionType[] = suppressionType
                ? [suppressionType]
                : ['bounces', 'blocks', 'invalid_emails', 'spam_reports', 'unsubscribes'];

            for (const type of types) {
                const url = buildSuppressionDeleteUrl(type, normalized);
                const resp = await fetch(url, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (resp.ok || resp.status === 404) {
                    await DrainResponseBody(resp);
                    continue;
                }
                const text = await resp.text();
                return { Success: false, ErrorMessage: `SendGrid suppression delete (${type}) failed: ${resp.status} ${text}` };
            }
            return { Success: true };
        } catch (ex) {
            return { Success: false, ErrorMessage: `Error removing suppression: ${ex instanceof Error ? ex.message : String(ex)}` };
        }
    }
}

export type SendGridSuppressionType = 'bounces' | 'blocks' | 'spam_reports' | 'invalid_emails' | 'unsubscribes';

const REPLAY_WINDOW_SECONDS = 600; // 10 minutes

/**
 * Verifies a SendGrid Event Webhook ECDSA P-256 signature and 10-minute replay window
 * over the exact raw request body (`timestamp + rawBody`).
 */
export function VerifySendGridWebhookSignature(
    publicKey: string,
    rawBody: string | Buffer,
    signatureBase64: string,
    timestampHeader: string,
    nowSeconds: number = Math.floor(Date.now() / 1000)
): { Valid: boolean; Reason?: string } {
    const parsedTs = Number(timestampHeader);
    if (!Number.isFinite(parsedTs) || timestampHeader.trim().length === 0) {
        return { Valid: false, Reason: 'Invalid webhook timestamp header' };
    }
    if (Math.abs(nowSeconds - parsedTs) > REPLAY_WINDOW_SECONDS) {
        return { Valid: false, Reason: 'Webhook timestamp outside 10-minute replay window' };
    }
    try {
        const keyInput = publicKey.includes('-----BEGIN')
            ? publicKey
            : crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
        const verifier = crypto.createVerify('SHA256');
        verifier.update(timestampHeader);
        verifier.update(rawBody);
        verifier.end();
        const valid = verifier.verify(keyInput, signatureBase64, 'base64');
        return valid ? { Valid: true } : { Valid: false, Reason: 'ECDSA signature mismatch' };
    } catch (ex) {
        return { Valid: false, Reason: `Signature verification error: ${ex instanceof Error ? ex.message : String(ex)}` };
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

function extractHeaderCaseInsensitive(
    headers: Record<string, string | string[] | undefined> | undefined,
    target: string
): string | undefined {
    if (!headers) return undefined;
    const lowerTarget = target.toLowerCase();
    for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerTarget) {
            if (typeof val === 'string') return val;
            if (Array.isArray(val) && val.length > 0) return val[0];
        }
    }
    return undefined;
}

function buildSuppressionDeleteUrl(type: SendGridSuppressionType, normalizedEmail: string): string {
    const encoded = encodeURIComponent(normalizedEmail);
    if (type === 'unsubscribes') {
        return `https://api.sendgrid.com/v3/asm/suppressions/global/${encoded}`;
    }
    return `https://api.sendgrid.com/v3/suppression/${type}/${encoded}`;
}

interface SendGridWebhookEventPayload {
    email?: string;
    timestamp?: number;
    event?: string;
    sg_event_id?: string;
    sg_message_id?: string;
    mj_log_id?: string;
    sg_machine_open?: boolean;
    url?: string;
    ip?: string;
    useragent?: string;
    reason?: string;
    status?: string;
    type?: string;
    bounce_classification?: string;
}

function mapSendGridEventToActivity(raw: unknown): NormalizedActivityEvent | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const ev = raw as SendGridWebhookEventPayload;
    const eventType = mapSendGridEventType(ev);
    if (!eventType) return undefined;

    const activity: NormalizedActivityEvent = {
        CommunicationProviderID: '',
        NormalizedAddress: typeof ev.email === 'string' ? ev.email.trim().toLowerCase() : '',
        EventType: eventType,
        OccurredAt: typeof ev.timestamp === 'number' ? new Date(ev.timestamp * 1000) : new Date(),
        IsMachineEvent: ev.event === 'open' ? Boolean(ev.sg_machine_open) : false,
        RawPayload: raw as Record<string, unknown>
    };

    if (typeof ev.mj_log_id === 'string' && ev.mj_log_id.length > 0) activity.CommunicationLogID = ev.mj_log_id;
    if (typeof ev.sg_event_id === 'string') activity.ProviderEventID = ev.sg_event_id;
    if (typeof ev.sg_message_id === 'string') activity.ProviderMessageID = ev.sg_message_id;
    if (typeof ev.url === 'string') activity.TargetURL = ev.url;
    if (typeof ev.ip === 'string') activity.IPAddress = ev.ip;
    if (typeof ev.useragent === 'string') activity.UserAgent = ev.useragent;
    if (typeof ev.status === 'string') activity.BounceCode = ev.status;
    if (typeof ev.reason === 'string') activity.BounceReason = ev.reason;
    if (ev.event === 'dropped') activity.DropReason = mapSendGridDropReason(ev.reason);

    return activity;
}

function mapSendGridEventType(ev: SendGridWebhookEventPayload): NormalizedActivityEventType | undefined {
    switch (ev.event) {
        case 'processed':
            return 'Queued';
        case 'delivered':
            return 'Delivered';
        case 'deferred':
            return 'Deferred';
        case 'bounce':
            return mapSendGridBounceType(ev);
        case 'dropped':
            return 'Dropped';
        case 'open':
            return 'Opened';
        case 'click':
            return 'Clicked';
        case 'spamreport':
            return 'Spam Complaint';
        case 'unsubscribe':
        case 'group_unsubscribe':
            return 'Unsubscribed';
        default:
            return undefined;
    }
}

const SOFT_BOUNCE_CLASSIFICATIONS = new Set([
    'technical failure',
    'content',
    'reputation',
    'frequency or volume too high',
    'mailbox unavailable',
    'soft'
]);

function mapSendGridBounceType(ev: SendGridWebhookEventPayload): 'Hard Bounce' | 'Soft Bounce' {
    const classification = ev.bounce_classification?.trim().toLowerCase();
    if (classification === 'invalid address' || classification === 'hard') {
        return 'Hard Bounce';
    }
    if (classification && SOFT_BOUNCE_CLASSIFICATIONS.has(classification)) {
        return 'Soft Bounce';
    }
    const bounceType = ev.type?.trim().toLowerCase();
    if (bounceType === 'blocked' || bounceType === 'soft') {
        return 'Soft Bounce';
    }
    if (bounceType === 'bounce' || bounceType === 'hard') {
        return 'Hard Bounce';
    }
    if (typeof ev.status === 'string' && ev.status.startsWith('4')) {
        return 'Soft Bounce';
    }
    return 'Hard Bounce';
}

function mapSendGridDropReason(reason: string | undefined): string | undefined {
    if (!reason) return undefined;
    const lower = reason.trim().toLowerCase();
    if (lower.includes('invalid')) return 'Invalid';
    if (lower.includes('bounced')) return 'Bounced Address';
    if (lower.includes('unsubscribed')) return 'Unsubscribed Address';
    if (lower.includes('spam')) return 'Spam Reporting Address';
    return reason;
}

interface SendGridDnsEntry {
    host?: string;
    type?: string;
    data?: string;
    valid?: boolean;
}

interface SendGridDomainCreateResponse {
    id?: number | string;
    dns?: {
        mail_cname?: SendGridDnsEntry;
        dkim1?: SendGridDnsEntry;
        dkim2?: SendGridDnsEntry;
        spf?: SendGridDnsEntry;
    };
}

interface SendGridValidationEntry {
    valid?: boolean;
    reason?: string | null;
}

interface SendGridDomainValidateResponse {
    valid?: boolean;
    validation_results?: {
        mail_cname?: SendGridValidationEntry;
        dkim1?: SendGridValidationEntry;
        dkim2?: SendGridValidationEntry;
        spf?: SendGridValidationEntry;
    };
}

function mapSendGridDnsRecords(dnsMap: SendGridDomainCreateResponse['dns']): DomainDNSRecord[] {
    if (!dnsMap) return [];
    const entries: Array<[SendGridDnsEntry | undefined, DomainDNSRecord['Purpose']]> = [
        [dnsMap.mail_cname, 'ReturnPath'],
        [dnsMap.dkim1, 'DKIM'],
        [dnsMap.dkim2, 'DKIM'],
        [dnsMap.spf, 'SPF']
    ];
    const records: DomainDNSRecord[] = [];
    for (const [entry, purpose] of entries) {
        if (!entry?.host || !entry?.data) continue;
        const upperType = entry.type?.toUpperCase();
        const recordType: DomainDNSRecord['Type'] =
            upperType === 'TXT' || upperType === 'MX' ? upperType : 'CNAME';
        records.push({
            Type: recordType,
            Purpose: purpose,
            Host: entry.host,
            Value: entry.data,
            Validated: Boolean(entry.valid)
        });
    }
    return records;
}

function mapSendGridValidationResults(
    results: SendGridDomainValidateResponse['validation_results']
): DomainDNSRecord[] {
    if (!results) return [];
    const entries: Array<[string, SendGridValidationEntry | undefined, DomainDNSRecord['Purpose'], DomainDNSRecord['Type']]> = [
        ['mail_cname', results.mail_cname, 'ReturnPath', 'CNAME'],
        ['dkim1', results.dkim1, 'DKIM', 'CNAME'],
        ['dkim2', results.dkim2, 'DKIM', 'CNAME'],
        ['spf', results.spf, 'SPF', 'TXT']
    ];
    const records: DomainDNSRecord[] = [];
    for (const [hostKey, entry, purpose, type] of entries) {
        if (!entry) continue;
        records.push({
            Type: type,
            Purpose: purpose,
            Host: hostKey,
            Value: '',
            Validated: Boolean(entry.valid),
            ...(entry.reason ? { LastError: entry.reason } : {})
        });
    }
    return records;
}

async function checkDmarcTxtRecord(domain: string): Promise<DomainDNSRecord> {
    const host = `_dmarc.${domain}`;
    try {
        const txtRecords = await dns.resolveTxt(host);
        const flattened = txtRecords.map((chunks) => chunks.join(''));
        const dmarc = flattened.find((val) => val.trim().toLowerCase().startsWith('v=dmarc1'));
        if (dmarc) {
            return { Type: 'TXT', Purpose: 'DMARC', Host: host, Value: dmarc, Validated: true };
        }
        return {
            Type: 'TXT',
            Purpose: 'DMARC',
            Host: host,
            Value: '',
            Validated: false,
            LastError: 'No valid v=DMARC1 TXT record found'
        };
    } catch (ex) {
        return {
            Type: 'TXT',
            Purpose: 'DMARC',
            Host: host,
            Value: '',
            Validated: false,
            LastError: ex instanceof Error ? ex.message : String(ex)
        };
    }
}