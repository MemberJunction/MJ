/**
 * @module @memberjunction/messaging-adapters
 * @description Email Utility Mailbox Server Extension — registers inbound email webhook
 * routes (`/inbound`, `/inbound/msgraph`, `/inbound/gmail`) and optional poll fallback,
 * delegating normalized messages to {@link InboundUtilityMailboxIngestionService}.
 */

import crypto from 'node:crypto';
import express, { Application, Request, Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { LogError, LogStatus } from '@memberjunction/core';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    BaseServerExtension,
    ExtensionHealthResult,
    ExtensionInitResult,
    ServerExtensionConfig,
    ServerExtensionPhase,
} from '@memberjunction/server-extensions-core';
import { WebhookRateLimitSettings } from '../base/types.js';
import {
    InboundMailboxFetcher,
    InboundUtilityMailboxIngestionService,
    RawInboundMailboxMessage,
} from './InboundUtilityMailboxIngestionService.js';
import {
    CommunicationProviderInboundMailboxFetcher,
    ExtractBareEmailAddress,
} from './CommunicationProviderInboundMailboxFetcher.js';

/** Settings supported by {@link EmailUtilityMailboxExtension} in `mj.config.cjs`. */
export interface EmailUtilityMailboxExtensionSettings {
    /**
     * Shared webhook secret verified against `x-mj-webhook-secret`, `Authorization: Bearer <secret>`,
     * or Microsoft Graph notification `clientState`. Can also be supplied via `MJ_EMAIL_WEBHOOK_SECRET`.
     */
    WebhookSecret?: string;
    /** Optional per-IP rate limit override for webhook endpoints. */
    WebhookRateLimit?: WebhookRateLimitSettings;
    /** Optional poll fallback interval in milliseconds (0 disables timer polling; default 0). */
    PollIntervalMs?: number;
}

/** Normalized item parsed from a Microsoft Graph `value[]` change notification payload. */
export interface MSGraphNormalizedNotificationItem {
    subscriptionId?: string;
    clientState?: string;
    changeType?: string;
    toAddress?: string;
    messageID?: string;
    embeddedMessage?: RawInboundMailboxMessage;
}

/** Result of normalizing a Microsoft Graph webhook request (either handshake or notification batch). */
export type MSGraphWebhookNormalizeResult =
    | { kind: 'handshake'; validationToken: string }
    | { kind: 'notifications'; items: MSGraphNormalizedNotificationItem[] }
    | { kind: 'invalid'; error: string };

/** Result of normalizing a Gmail Cloud Pub/Sub push webhook payload. */
export type GmailPubSubNormalizeResult =
    | {
          kind: 'notification';
          emailAddress: string;
          historyId: string;
          embeddedMessage?: RawInboundMailboxMessage;
      }
    | { kind: 'invalid'; error: string };

/** Default per-IP rate limit for inbound utility mailbox webhooks. */
export const DEFAULT_EMAIL_WEBHOOK_RATE_LIMIT: Required<WebhookRateLimitSettings> = {
    Enabled: true,
    WindowMs: 60_000,
    MaxRequests: 600,
};

/**
 * Constant-time comparison for shared webhook secrets supplied via HTTP headers or `clientState`.
 */
export function VerifyEmailWebhookSecret(expectedSecret: string, suppliedSecret: string | undefined): boolean {
    if (!expectedSecret || !suppliedSecret) {
        return false;
    }
    const expectedBuf = Buffer.from(expectedSecret, 'utf8');
    const suppliedBuf = Buffer.from(suppliedSecret, 'utf8');
    if (expectedBuf.length !== suppliedBuf.length) {
        return false;
    }
    return crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

function readStringField(obj: Record<string, unknown>, key: string): string | undefined {
    const val = obj[key];
    return typeof val === 'string' ? val : undefined;
}

function readBooleanField(obj: Record<string, unknown>, key: string): boolean | undefined {
    const val = obj[key];
    return typeof val === 'boolean' ? val : undefined;
}

function readNumberField(obj: Record<string, unknown>, key: string): number | undefined {
    const val = obj[key];
    return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

function extractRateLimitSettings(raw: unknown): WebhookRateLimitSettings | undefined {
    if (typeof raw !== 'object' || raw === null) {
        return undefined;
    }
    const rec = raw as Record<string, unknown>;
    return {
        Enabled: readBooleanField(rec, 'Enabled'),
        WindowMs: readNumberField(rec, 'WindowMs'),
        MaxRequests: readNumberField(rec, 'MaxRequests'),
    };
}

function parseInboundWebhookPayload(body: unknown): RawInboundMailboxMessage | null {
    if (typeof body !== 'object' || body === null) {
        return null;
    }
    const rec = body as Record<string, unknown>;
    const messageID = readStringField(rec, 'messageID')?.trim() ?? '';
    const toAddress = readStringField(rec, 'toAddress')?.trim() ?? '';
    const fromAddress = readStringField(rec, 'fromAddress')?.trim() ?? '';
    const subject = readStringField(rec, 'subject') ?? '';
    if (!toAddress || !fromAddress) {
        return null;
    }
    return {
        messageID,
        toAddress,
        fromAddress,
        subject,
        bodyPreview: readStringField(rec, 'bodyPreview'),
        receivedAtISO: readStringField(rec, 'receivedAtISO'),
        providerID: readStringField(rec, 'providerID'),
    };
}

function extractMailboxFromGraphResource(resource: string | undefined): string | undefined {
    if (!resource) {
        return undefined;
    }
    // Matches `Users/cos@company.com/Messages/...` or `users('cos@company.com')/messages/...`
    const parenMatch = resource.match(/users\(['"]([^'"]+)['"]\)/i);
    if (parenMatch?.[1]) {
        return decodeURIComponent(parenMatch[1]).trim();
    }
    const slashMatch = resource.match(/(?:^|\/)users\/([^/]+)/i);
    if (slashMatch?.[1]) {
        return decodeURIComponent(slashMatch[1]).trim();
    }
    return undefined;
}

function extractMessageIdFromGraphResource(resource: string | undefined): string | undefined {
    if (!resource) {
        return undefined;
    }
    const match = resource.match(/\/messages\/([^/?]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : undefined;
}

function extractGraphEmbeddedMessage(
    item: Record<string, unknown>,
    fallbackToAddress: string | undefined,
    fallbackMessageId: string | undefined
): RawInboundMailboxMessage | undefined {
    const candidate =
        (typeof item['message'] === 'object' && item['message'] !== null
            ? (item['message'] as Record<string, unknown>)
            : null) ??
        (typeof item['resourceData'] === 'object' && item['resourceData'] !== null
            ? (item['resourceData'] as Record<string, unknown>)
            : null);
    if (!candidate) {
        return undefined;
    }

    const directNormalized = parseInboundWebhookPayload(candidate);
    if (directNormalized) {
        return {
            ...directNormalized,
            messageID: directNormalized.messageID || fallbackMessageId || '',
        };
    }

    // Graph rich notification format (`from.emailAddress.address`, `toRecipients[0].emailAddress.address`, `subject`)
    const graphFromObj = candidate['from'] as { emailAddress?: { address?: unknown } } | undefined;
    const rawFrom =
        readStringField(candidate, 'fromAddress') ??
        (typeof graphFromObj?.emailAddress?.address === 'string' ? graphFromObj.emailAddress.address : undefined);
    const fromAddress = ExtractBareEmailAddress(rawFrom);
    if (!fromAddress) {
        return undefined;
    }

    const toRecipients = Array.isArray(candidate['toRecipients'])
        ? (candidate['toRecipients'] as Array<{ emailAddress?: { address?: unknown } }>)
        : [];
    const firstGraphTo =
        typeof toRecipients[0]?.emailAddress?.address === 'string'
            ? toRecipients[0].emailAddress.address
            : undefined;
    const toAddress = ExtractBareEmailAddress(
        readStringField(candidate, 'toAddress') ?? firstGraphTo ?? fallbackToAddress
    );
    if (!toAddress) {
        return undefined;
    }

    return {
        messageID: (readStringField(candidate, 'messageID') ?? readStringField(candidate, 'id') ?? fallbackMessageId ?? '').trim(),
        toAddress,
        fromAddress,
        subject: readStringField(candidate, 'subject') ?? '',
        bodyPreview: readStringField(candidate, 'bodyPreview'),
        receivedAtISO:
            readStringField(candidate, 'receivedAtISO') ?? readStringField(candidate, 'receivedDateTime'),
        providerID: readStringField(candidate, 'providerID'),
    };
}

/**
 * Pure normalizer for Microsoft Graph change-notification webhooks:
 * - Recognizes `?validationToken=<token>` subscription handshakes.
 * - Parses `{ value: [...] }` change notification batches, extracting mailbox address, message ID,
 *   `clientState`, and optional embedded rich notification message payloads.
 */
export function NormalizeMSGraphWebhookPayload(
    body: unknown,
    queryValidationToken?: string
): MSGraphWebhookNormalizeResult {
    if (queryValidationToken !== undefined && queryValidationToken.length > 0) {
        return { kind: 'handshake', validationToken: queryValidationToken };
    }
    if (typeof body !== 'object' || body === null) {
        return { kind: 'invalid', error: 'Microsoft Graph webhook payload must be a JSON object.' };
    }
    const rawValue = (body as Record<string, unknown>)['value'];
    if (!Array.isArray(rawValue)) {
        return { kind: 'invalid', error: 'Microsoft Graph webhook payload is missing value[] array.' };
    }

    const items: MSGraphNormalizedNotificationItem[] = [];
    for (const rawItem of rawValue) {
        if (typeof rawItem !== 'object' || rawItem === null) {
            continue;
        }
        const item = rawItem as Record<string, unknown>;
        const resource = readStringField(item, 'resource');
        const resourceData =
            typeof item['resourceData'] === 'object' && item['resourceData'] !== null
                ? (item['resourceData'] as Record<string, unknown>)
                : undefined;
        const toAddress =
            readStringField(item, 'toAddress')?.trim() ||
            extractMailboxFromGraphResource(resource);
        const messageID =
            readStringField(resourceData ?? {}, 'id')?.trim() ||
            extractMessageIdFromGraphResource(resource);
        const embeddedMessage = extractGraphEmbeddedMessage(item, toAddress, messageID);

        items.push({
            subscriptionId: readStringField(item, 'subscriptionId'),
            clientState: readStringField(item, 'clientState'),
            changeType: readStringField(item, 'changeType'),
            toAddress: toAddress ?? embeddedMessage?.toAddress,
            messageID: messageID ?? embeddedMessage?.messageID,
            ...(embeddedMessage ? { embeddedMessage } : {}),
        });
    }

    return { kind: 'notifications', items };
}

/**
 * Pure normalizer for Google Cloud Pub/Sub push webhooks triggered by Gmail `users.watch`:
 * decodes base64 `message.data` JSON `{ emailAddress, historyId, ... }` and optionally extracts
 * an embedded normalized message if supplied by a custom bridge/test harness.
 */
export function NormalizeGmailPubSubPayload(body: unknown): GmailPubSubNormalizeResult {
    if (typeof body !== 'object' || body === null) {
        return { kind: 'invalid', error: 'Gmail Pub/Sub payload must be a JSON object.' };
    }
    const messageEnvelope = (body as Record<string, unknown>)['message'];
    if (typeof messageEnvelope !== 'object' || messageEnvelope === null) {
        return { kind: 'invalid', error: 'Gmail Pub/Sub payload is missing message envelope.' };
    }
    const encodedData = readStringField(messageEnvelope as Record<string, unknown>, 'data');
    if (!encodedData || encodedData.trim().length === 0) {
        return { kind: 'invalid', error: 'Gmail Pub/Sub payload is missing base64 message.data.' };
    }

    let decodedJson: string;
    try {
        decodedJson = Buffer.from(encodedData.trim(), 'base64').toString('utf8');
    } catch {
        return { kind: 'invalid', error: 'Gmail Pub/Sub message.data is not valid base64.' };
    }

    const decoded = SafeJSONParse<Record<string, unknown>>(decodedJson);
    if (!decoded || typeof decoded !== 'object') {
        return { kind: 'invalid', error: 'Decoded Gmail Pub/Sub message.data is not valid JSON.' };
    }

    const emailAddress = ExtractBareEmailAddress(
        readStringField(decoded, 'emailAddress') ?? readStringField(decoded, 'toAddress')
    );
    const rawHistory = decoded['historyId'];
    const historyId =
        typeof rawHistory === 'string' || typeof rawHistory === 'number' ? String(rawHistory).trim() : '';

    if (!emailAddress) {
        return { kind: 'invalid', error: 'Decoded Gmail Pub/Sub payload is missing emailAddress.' };
    }
    if (!historyId && !readStringField(decoded, 'fromAddress')) {
        return { kind: 'invalid', error: 'Decoded Gmail Pub/Sub payload is missing historyId.' };
    }

    const fromAddress = ExtractBareEmailAddress(readStringField(decoded, 'fromAddress'));
    const embeddedMessage: RawInboundMailboxMessage | undefined = fromAddress
        ? {
              messageID: (
                  readStringField(decoded, 'messageID') ??
                  readStringField(messageEnvelope as Record<string, unknown>, 'messageId') ??
                  ''
              ).trim(),
              toAddress: emailAddress,
              fromAddress,
              subject: readStringField(decoded, 'subject') ?? '',
              bodyPreview: readStringField(decoded, 'bodyPreview'),
              receivedAtISO:
                  readStringField(decoded, 'receivedAtISO') ??
                  readStringField(messageEnvelope as Record<string, unknown>, 'publishTime'),
              providerID: readStringField(decoded, 'providerID'),
          }
        : undefined;

    return {
        kind: 'notification',
        emailAddress,
        historyId,
        ...(embeddedMessage ? { embeddedMessage } : {}),
    };
}

function extractSuppliedWebhookSecret(req: Request): string | undefined {
    const headerSecret = req.header('x-mj-webhook-secret');
    if (headerSecret) {
        return headerSecret.trim();
    }
    const authHeader = req.header('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }
    return undefined;
}

/**
 * Server Extension that exposes HTTP webhook ingestion routes for utility email
 * mailboxes (`MJ: AI Bridge Agent Identities` with `IdentityType = 'Email'`) and
 * optionally schedules a periodic poll sweep via {@link InboundUtilityMailboxIngestionService}.
 */
@RegisterClass(BaseServerExtension, 'EmailUtilityMailboxExtension')
export class EmailUtilityMailboxExtension extends BaseServerExtension {
    /** Mail provider webhooks authenticate via shared secret rather than user JWTs. */
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    private initialized = false;
    private rootPath = '';
    private webhookSecret = '';
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    public async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        try {
            const rawSettings: Record<string, unknown> = config.Settings ?? {};
            const secret = (readStringField(rawSettings, 'WebhookSecret') ?? process.env.MJ_EMAIL_WEBHOOK_SECRET ?? '').trim();
            const pollIntervalMs = readNumberField(rawSettings, 'PollIntervalMs') ?? 0;

            if (!secret && pollIntervalMs <= 0) {
                return {
                    Success: false,
                    Skipped: true,
                    Message: 'EmailUtilityMailboxExtension skipped: configure Settings.WebhookSecret (or MJ_EMAIL_WEBHOOK_SECRET) or PollIntervalMs.',
                };
            }

            this.webhookSecret = secret;
            this.rootPath = config.RootPath;

            const router: Router = express.Router();
            const rateSettings = {
                ...DEFAULT_EMAIL_WEBHOOK_RATE_LIMIT,
                ...(extractRateLimitSettings(rawSettings['WebhookRateLimit']) ?? {}),
            };
            if (rateSettings.Enabled) {
                router.use(
                    rateLimit({
                        windowMs: rateSettings.WindowMs,
                        limit: rateSettings.MaxRequests,
                        standardHeaders: 'draft-7',
                        legacyHeaders: false,
                        handler: (_req: Request, res: Response) => {
                            res.status(429).json({ error: 'Too many requests' });
                        },
                    })
                );
            }

            const registeredRoutes: string[] = [];
            if (this.webhookSecret) {
                router.post('/inbound', express.json({ limit: '256kb' }), async (req: Request, res: Response) => {
                    await this.handleInboundRequest(req, res);
                });
                registeredRoutes.push(`POST ${config.RootPath}/inbound`);

                router.post(
                    '/inbound/msgraph',
                    express.json({ limit: '512kb' }),
                    async (req: Request, res: Response) => {
                        await this.handleMSGraphInboundRequest(req, res);
                    }
                );
                registeredRoutes.push(`POST ${config.RootPath}/inbound/msgraph`);

                router.post(
                    '/inbound/gmail',
                    express.json({ limit: '512kb' }),
                    async (req: Request, res: Response) => {
                        await this.handleGmailInboundRequest(req, res);
                    }
                );
                registeredRoutes.push(`POST ${config.RootPath}/inbound/gmail`);
            }

            router.get('/health', (_req: Request, res: Response) => {
                res.status(200).json({
                    status: 'ok',
                    webhookEnabled: this.webhookSecret.length > 0,
                    pollTimerActive: this.pollTimer !== null,
                    fetcherRegistered: InboundUtilityMailboxIngestionService.Instance.HasRegisteredFetcher,
                });
            });
            registeredRoutes.push(`GET ${config.RootPath}/health`);

            app.use(config.RootPath, router);

            if (pollIntervalMs > 0) {
                if (!InboundUtilityMailboxIngestionService.Instance.HasRegisteredFetcher) {
                    InboundUtilityMailboxIngestionService.Instance.RegisterFetcher(
                        new CommunicationProviderInboundMailboxFetcher()
                    );
                }
                const safeIntervalMs = Math.max(15_000, pollIntervalMs);
                this.pollTimer = setInterval(() => {
                    void InboundUtilityMailboxIngestionService.Instance.PollActiveUtilityMailboxes().catch((err: unknown) => {
                        LogError(
                            `[EmailUtilityMailboxExtension] Scheduled poll failed: ${
                                err instanceof Error ? err.message : String(err)
                            }`
                        );
                    });
                }, safeIntervalMs);
                this.pollTimer.unref?.();
            }

            this.initialized = true;
            LogStatus(`EmailUtilityMailboxExtension mounted at ${config.RootPath}`);
            return {
                Success: true,
                Message: `Email utility mailbox extension loaded at ${config.RootPath}`,
                RegisteredRoutes: registeredRoutes,
                Service: InboundUtilityMailboxIngestionService.Instance,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                Message: `Failed to initialize EmailUtilityMailboxExtension: ${message}`,
            };
        }
    }

    public async Shutdown(): Promise<void> {
        if (this.pollTimer !== null) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.initialized = false;
        this.webhookSecret = '';
        LogStatus('Shutting down EmailUtilityMailboxExtension');
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Healthy: this.initialized,
            Name: 'EmailUtilityMailboxExtension',
            Details: {
                rootPath: this.rootPath,
                webhookEnabled: this.webhookSecret.length > 0,
                pollTimerActive: this.pollTimer !== null,
                fetcherRegistered: InboundUtilityMailboxIngestionService.Instance.HasRegisteredFetcher,
            },
        };
    }

    private getActiveOrDefaultFetcher(): InboundMailboxFetcher {
        return (
            InboundUtilityMailboxIngestionService.Instance.RegisteredFetcher ??
            new CommunicationProviderInboundMailboxFetcher()
        );
    }

    private async handleInboundRequest(req: Request, res: Response): Promise<void> {
        const suppliedSecret = extractSuppliedWebhookSecret(req);
        if (!VerifyEmailWebhookSecret(this.webhookSecret, suppliedSecret)) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const payload = parseInboundWebhookPayload(req.body);
        if (!payload) {
            res.status(400).json({ error: 'Invalid inbound email payload: toAddress and fromAddress are required.' });
            return;
        }

        try {
            const dispatched = await InboundUtilityMailboxIngestionService.Instance.HandleWebhookMessage(payload);
            res.status(200).json({
                accepted: true,
                duplicate: dispatched.duplicate,
                triggered: dispatched.wakeResult?.triggered ?? false,
                resultCode: dispatched.wakeResult?.resultCode ?? null,
            });
        } catch (error) {
            LogError('[EmailUtilityMailboxExtension] Failed handling inbound email webhook:', undefined, error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal Server Error' });
            }
        }
    }

    private async handleMSGraphInboundRequest(req: Request, res: Response): Promise<void> {
        const rawValidationToken = req.query['validationToken'];
        const validationToken = typeof rawValidationToken === 'string' ? rawValidationToken : undefined;
        const normalized = NormalizeMSGraphWebhookPayload(req.body, validationToken);

        if (normalized.kind === 'handshake') {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.status(200).type('text/plain').send(normalized.validationToken);
            return;
        }

        const headerSecret = extractSuppliedWebhookSecret(req);
        const headerAuthorized = VerifyEmailWebhookSecret(this.webhookSecret, headerSecret);

        if (normalized.kind === 'invalid') {
            if (!headerAuthorized) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            res.status(400).json({ error: normalized.error });
            return;
        }

        const allClientStatesMatch =
            normalized.items.length > 0 &&
            normalized.items.every((item) => VerifyEmailWebhookSecret(this.webhookSecret, item.clientState));
        if (!headerAuthorized && !allClientStatesMatch) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        try {
            const systemUser = UserCache.Instance.GetSystemUser();
            const fetcher = this.getActiveOrDefaultFetcher();
            let processed = 0;
            let triggered = 0;
            let duplicates = 0;

            for (const item of normalized.items) {
                const messagesToDispatch: RawInboundMailboxMessage[] = [];
                if (item.embeddedMessage) {
                    messagesToDispatch.push(item.embeddedMessage);
                } else if (item.toAddress && systemUser) {
                    if (item.messageID && typeof fetcher.FetchSingleMessage === 'function') {
                        const fetched = await fetcher.FetchSingleMessage(
                            item.toAddress,
                            item.messageID,
                            systemUser,
                            'Microsoft Graph'
                        );
                        if (fetched) {
                            messagesToDispatch.push(fetched);
                        }
                    } else if (typeof fetcher.FetchMessagesForMailbox === 'function') {
                        const fetched = await fetcher.FetchMessagesForMailbox(
                            item.toAddress,
                            null,
                            systemUser,
                            'Microsoft Graph'
                        );
                        messagesToDispatch.push(...fetched);
                    }
                }

                for (const msg of messagesToDispatch) {
                    processed++;
                    const dispatched = await InboundUtilityMailboxIngestionService.Instance.HandleWebhookMessage(msg);
                    if (dispatched.duplicate) {
                        duplicates++;
                    } else if (dispatched.wakeResult?.triggered) {
                        triggered++;
                    }
                }
            }

            res.status(202).json({
                accepted: true,
                notifications: normalized.items.length,
                processed,
                triggered,
                duplicates,
            });
        } catch (error) {
            LogError('[EmailUtilityMailboxExtension] Failed handling MS Graph inbound webhook:', undefined, error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal Server Error' });
            }
        }
    }

    private async handleGmailInboundRequest(req: Request, res: Response): Promise<void> {
        const suppliedSecret = extractSuppliedWebhookSecret(req);
        if (!VerifyEmailWebhookSecret(this.webhookSecret, suppliedSecret)) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const normalized = NormalizeGmailPubSubPayload(req.body);
        if (normalized.kind === 'invalid') {
            res.status(400).json({ error: normalized.error });
            return;
        }

        try {
            const messagesToDispatch: RawInboundMailboxMessage[] = [];
            if (normalized.embeddedMessage) {
                messagesToDispatch.push(normalized.embeddedMessage);
            } else {
                const systemUser = UserCache.Instance.GetSystemUser();
                const fetcher = this.getActiveOrDefaultFetcher();
                if (systemUser && typeof fetcher.FetchMessagesForMailbox === 'function') {
                    const fetched = await fetcher.FetchMessagesForMailbox(
                        normalized.emailAddress,
                        null,
                        systemUser,
                        'Gmail'
                    );
                    messagesToDispatch.push(...fetched);
                }
            }

            let triggered = 0;
            let duplicates = 0;
            for (const msg of messagesToDispatch) {
                const dispatched = await InboundUtilityMailboxIngestionService.Instance.HandleWebhookMessage(msg);
                if (dispatched.duplicate) {
                    duplicates++;
                } else if (dispatched.wakeResult?.triggered) {
                    triggered++;
                }
            }

            res.status(200).json({
                accepted: true,
                emailAddress: normalized.emailAddress,
                historyId: normalized.historyId,
                processed: messagesToDispatch.length,
                triggered,
                duplicates,
            });
        } catch (error) {
            LogError('[EmailUtilityMailboxExtension] Failed handling Gmail Pub/Sub webhook:', undefined, error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal Server Error' });
            }
        }
    }
}
