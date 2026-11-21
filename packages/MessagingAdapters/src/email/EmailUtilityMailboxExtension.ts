/**
 * @module @memberjunction/messaging-adapters
 * @description Email Utility Mailbox Server Extension — registers inbound email webhook
 * routes and optional poll fallback, delegating normalized messages to
 * {@link InboundUtilityMailboxIngestionService}.
 */

import crypto from 'node:crypto';
import express, { Application, Request, Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { LogError, LogStatus } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseServerExtension,
    ExtensionHealthResult,
    ExtensionInitResult,
    ServerExtensionConfig,
    ServerExtensionPhase,
} from '@memberjunction/server-extensions-core';
import { WebhookRateLimitSettings } from '../base/types.js';
import {
    InboundUtilityMailboxIngestionService,
    RawInboundMailboxMessage,
} from './InboundUtilityMailboxIngestionService.js';

/** Settings supported by {@link EmailUtilityMailboxExtension} in `mj.config.cjs`. */
export interface EmailUtilityMailboxExtensionSettings {
    /**
     * Shared webhook secret verified against `x-mj-webhook-secret` or `Authorization: Bearer <secret>`.
     * Can also be supplied via `MJ_EMAIL_WEBHOOK_SECRET`.
     */
    WebhookSecret?: string;
    /** Optional per-IP rate limit override for webhook endpoints. */
    WebhookRateLimit?: WebhookRateLimitSettings;
    /** Optional poll fallback interval in milliseconds (0 disables timer polling; default 0). */
    PollIntervalMs?: number;
}

/** Default per-IP rate limit for inbound utility mailbox webhooks. */
export const DEFAULT_EMAIL_WEBHOOK_RATE_LIMIT: Required<WebhookRateLimitSettings> = {
    Enabled: true,
    WindowMs: 60_000,
    MaxRequests: 600,
};

/**
 * Constant-time comparison for shared webhook secrets supplied via HTTP headers.
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
            }

            router.get('/health', (_req: Request, res: Response) => {
                res.status(200).json({
                    status: 'ok',
                    webhookEnabled: this.webhookSecret.length > 0,
                    pollTimerActive: this.pollTimer !== null,
                });
            });
            registeredRoutes.push(`GET ${config.RootPath}/health`);

            app.use(config.RootPath, router);

            if (pollIntervalMs > 0) {
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
}
